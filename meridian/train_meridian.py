"""Fit the Google Meridian MMM on the XL demo geo x week dataset.

Usage (from the repository root):

    pip install -r meridian/requirements.txt
    python meridian/train_meridian.py            # full run, ~15 min on a 2-core CPU
    python meridian/train_meridian.py --quick    # smoke test, ~2 min

Steps:
1. Regenerate the training data (meridian/input/xl_geo_weekly.csv) from app/data/meridian_input.py.
2. Fit a geo-level Meridian model (revenue KPI, ROI priors, geometric adstock, Hill saturation).
3. Export the outputs used by the MMM page to app/data/meridian_output.json:
   ROI / mROI / incremental revenue per channel for the analysis window, adstock half-life,
   response curves, a monthly Hill curve fitted to each response curve, model diagnostics,
   Meridian's own fixed-budget optimization, and the ground truth used to simulate the data.

The Streamlit app only reads the JSON; it never imports Meridian.
"""

from datetime import date
from pathlib import Path
import argparse
import json
import math
import os
import sys
import time
import warnings

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.optimize import curve_fit  # noqa: E402

import meridian  # noqa: E402
from meridian import backend  # noqa: E402
from meridian.analysis import analyzer, optimizer  # noqa: E402
from meridian.data import data_frame_input_data_builder as builder_lib  # noqa: E402
from meridian.model import model, prior_distribution, spec  # noqa: E402

from app.data.master import DAYS_PER_MONTH  # noqa: E402
from app.data.meridian_input import HISTORY_WEEKS, MAX_LAG, write_meridian_input  # noqa: E402

CHANNELS = ["Google", "Meta", "TikTok", "X"]
CONTROLS = ["promo_index", "competitor_promo", "ramadan", "lebaran"]
INPUT_DIR = ROOT / "meridian" / "input"
OUTPUT_PATH = ROOT / "app" / "data" / "meridian_output.json"
MODEL_PATH = ROOT / "meridian" / "output" / "xl_meridian_model.pkl"  # fitted model (not committed)
MONEY = 1e6  # CSV money columns are IDR million
# Priors. ROI and adstock use Meridian's defaults (ROI ~ LogNormal(0.2, 0.9); adstock decay ~ Uniform(0, 1)).
# Saturation: the training data include geo tests from 0x to ~7x normal spend, so the Hill curve
# is estimated from data. Two documented, weakly informative priors replace Meridian's defaults:
# - Hill slope: Meridian fixes it at 1 (every curve concave, no efficient range). LogNormal(0.2, 0.4)
#   lets the data choose between concave and S-shaped curves (median 1.22, 90% prior 0.63-2.35).
# - Hill EC (half-saturation, in Meridian's scaled media units, 1 = median spend per capita): the
#   default TruncatedNormal(0.8, 0.8, 0.1, 10) concentrates below 2x median spend. LogNormal(1.0, 0.7)
#   is centred at 2.7x with a 90% prior interval of 0.86x-8.6x, covering the tested range.
ROI_PRIOR = (0.2, 0.9)       # Meridian default
SLOPE_PRIOR = (0.2, 0.4)     # LogNormal: median 1.22
EC_PRIOR = (1.0, 0.7)        # LogNormal: median 2.7x median spend
KNOTS = 13  # time-effect knots (one per ~8 weeks); Ramadan / Lebaran handled by controls
CONFIDENCE = 0.9


def build_input(df):
    return (
        builder_lib.DataFrameInputDataBuilder(kpi_type="revenue", default_kpi_column="revenue")
        .with_kpi(df)
        .with_population(df)
        .with_controls(df, control_cols=CONTROLS)
        .with_media(
            df,
            media_cols=[f"{c.lower()}_impressions" for c in CHANNELS],
            media_spend_cols=[f"{c.lower()}_spend" for c in CHANNELS],
            media_channels=CHANNELS,
        )
        .build()
    )


def interval(values):
    values = np.asarray(values).reshape(-1)
    lo, hi = np.quantile(values, [(1 - CONFIDENCE) / 2, 1 - (1 - CONFIDENCE) / 2])
    return {"median": float(np.median(values)), "lo": float(lo), "hi": float(hi)}


def hill(spend, alpha, k, m):
    spend = np.maximum(spend, 0)
    return m * spend ** alpha / (spend ** alpha + k ** alpha)


def observed_range(df, channel, window):
    """Per-capita weekly spend in the training data, as a multiple of the channel's current spend
    (analysis-window national average per capita). Curves are only used inside this range."""
    column = f"{channel.lower()}_spend"
    weekly = df.groupby("time")[column].sum()
    population = df.groupby("time")["population"].sum()
    current_per_capita = weekly.loc[window].mean() / population.loc[window].mean()
    multiple = (df[column] / df["population"]) / current_per_capita
    return {"min": float(multiple.min()), "p01": float(multiple.quantile(0.01)), "p99": float(multiple.quantile(0.99)), "max": float(multiple.max())}


def fit_monthly_hill(spend, incremental, current):
    p0 = [1.4, current * 4, max(incremental) * 2]
    params, _ = curve_fit(hill, spend, incremental, p0=p0, bounds=([1.01, current * 0.05, 0], [5.0, current * 100, max(incremental) * 50]), maxfev=50000)
    fitted = hill(spend, *params)
    ss_res = float(np.sum((incremental - fitted) ** 2))
    ss_tot = float(np.sum((incremental - np.mean(incremental)) ** 2))
    return {"alpha": float(params[0]), "k": float(params[1]), "m": float(params[2]), "fitR2": 1 - ss_res / ss_tot}


def metric(summary, name, channel, stat="median"):
    return float(summary[name].sel(channel=channel, metric=stat, distribution="posterior").values)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="short sampler run for a smoke test")
    parser.add_argument("--chains", type=int, default=4)
    parser.add_argument("--adapt", type=int, default=500)
    parser.add_argument("--burnin", type=int, default=500)
    parser.add_argument("--keep", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20260826)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--model-path", type=Path, default=MODEL_PATH)
    args = parser.parse_args()
    if args.quick:
        args.chains, args.adapt, args.burnin, args.keep = 2, 60, 60, 60

    started = time.time()
    generated = write_meridian_input(INPUT_DIR)
    truth = generated["truth"]
    df = pd.read_csv(INPUT_DIR / "xl_geo_weekly.csv")
    data = build_input(df)
    times = [str(t) for t in data.time.values]
    window = times[HISTORY_WEEKS:]
    window_months = len(window) * 7 / DAYS_PER_MONTH
    print(f"data: {len(data.geo)} geos x {len(times)} weeks; analysis window {window[0]} .. {window[-1]} ({len(window)} weeks)")

    prior = prior_distribution.PriorDistribution(
        roi_m=backend.tfd.LogNormal(backend.np_float_dtype(ROI_PRIOR[0]), backend.np_float_dtype(ROI_PRIOR[1]), name="roi_m"),
        slope_m=backend.tfd.LogNormal(backend.np_float_dtype(SLOPE_PRIOR[0]), backend.np_float_dtype(SLOPE_PRIOR[1]), name="slope_m"),
        ec_m=backend.tfd.LogNormal(backend.np_float_dtype(EC_PRIOR[0]), backend.np_float_dtype(EC_PRIOR[1]), name="ec_m"),
    )
    model_spec = spec.ModelSpec(prior=prior, media_prior_type="roi", max_lag=MAX_LAG, knots=KNOTS)
    mmm = model.Meridian(input_data=data, model_spec=model_spec)
    mmm.sample_prior(500, seed=args.seed)
    print(f"sampling posterior: {args.chains} chains x ({args.adapt} adapt + {args.burnin} burn-in + {args.keep} keep)")
    mmm.sample_posterior(n_chains=args.chains, n_adapt=args.adapt, n_burnin=args.burnin, n_keep=args.keep, seed=args.seed)
    print(f"sampled in {time.time() - started:.0f}s")
    args.model_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_mmm(mmm, str(args.model_path))
    print(f"saved model to {args.model_path}")

    an = analyzer.Analyzer(mmm)
    rhat = {name: float(np.nanmax(np.asarray(value))) for name, value in an.get_rhat().items()}
    max_rhat = max(rhat.values())
    accuracy = an.predictive_accuracy()["value"]
    acc = {
        level: {m: float(accuracy.sel(metric=m, geo_granularity=level).values) for m in ("R_Squared", "MAPE", "wMAPE")}
        for level in ("geo", "national")
    }
    summary = an.summary_metrics(selected_times=window, confidence_level=CONFIDENCE)
    posterior = mmm.inference_data.posterior
    # Response curve from 0x to 7x of today's spend: the range covered by the geo tests in the data
    # (the Rp0-10B/month planning range needs at most ~3.2x per channel).
    multipliers = [round(x, 2) for x in np.linspace(0, 4, 41)] + [4.5, 5.0, 5.5, 6.0, 6.5, 7.0]
    prior_draws = mmm.inference_data.prior
    curves = an.response_curves(spend_multipliers=multipliers, selected_times=window, confidence_level=CONFIDENCE)

    channels = {}
    for index, channel in enumerate(CHANNELS):
        window_spend = float(summary["spend"].sel(channel=channel).values) * MONEY
        alpha_draws = posterior["alpha_m"].values[..., index]
        half_life = interval(7 * math.log(0.5) / np.log(np.clip(alpha_draws, 1e-6, 1 - 1e-9)))
        spend_points = curves["spend"].sel(channel=channel).values * MONEY / window_months
        mean_points = curves["incremental_outcome"].sel(channel=channel, metric="mean").values * MONEY / window_months
        lo_points = curves["incremental_outcome"].sel(channel=channel, metric="ci_lo").values * MONEY / window_months
        hi_points = curves["incremental_outcome"].sel(channel=channel, metric="ci_hi").values * MONEY / window_months
        current_monthly = window_spend / window_months
        curve = fit_monthly_hill(spend_points, mean_points, current_monthly)
        channels[channel] = {
            "windowSpend": round(window_spend),
            "currentMonthlySpend": round(current_monthly),
            "roi": {s: metric(summary, "roi", channel, s) for s in ("median", "mean", "ci_lo", "ci_hi")},
            "mroi": {s: metric(summary, "mroi", channel, s) for s in ("median", "mean", "ci_lo", "ci_hi")},
            "incrementalRevenue": {s: metric(summary, "incremental_outcome", channel, s) * MONEY for s in ("median", "mean", "ci_lo", "ci_hi")},
            "contributionPct": metric(summary, "pct_of_contribution", channel),
            "adstockDecayWeekly": interval(alpha_draws),
            "halfLifeDays": half_life,
            # Meridian names: alpha_m = adstock decay (carryover per week), slope_m = Hill shape,
            # ec_m = Hill half-saturation point (in Meridian's scaled media units), beta_m = media coefficient.
            "hill": {"ec": interval(posterior["ec_m"].values[..., index]), "slope": interval(posterior["slope_m"].values[..., index])},
            "hillPrior": {"ec": interval(prior_draws["ec_m"].values[..., index]), "slope": interval(prior_draws["slope_m"].values[..., index])},
            "observedSpend": observed_range(df, channel, window),
            "beta": interval(posterior["beta_m"].values[..., index]),
            "betaByGeo": {str(geo): float(np.median(posterior["beta_gm"].values[..., g, index])) for g, geo in enumerate(data.geo.values)},
            "monthlyCurve": curve,
            "responseCurve": [
                {"multiplier": m, "spendMonthly": round(float(s)), "incrMonthly": round(float(r)), "lo": round(float(lo)), "hi": round(float(hi))}
                for m, s, r, lo, hi in zip(multipliers, spend_points, mean_points, lo_points, hi_points)
            ],
            "truth": {
                "roi": truth["channels"][channel]["roi"],
                "halfLifeDays": truth["channels"][channel]["halfLifeDays"],
                "windowIncremental": truth["channels"][channel]["windowIncremental"],
            },
        }
        print(f"{channel:7s} ROI {channels[channel]['roi']['median']:.2f} [{channels[channel]['roi']['ci_lo']:.2f}-{channels[channel]['roi']['ci_hi']:.2f}] (truth {truth['channels'][channel]['roi']:.2f}) "
              f"half-life {half_life['median']:.1f}d (truth {truth['channels'][channel]['halfLifeDays']}) slope {channels[channel]['hill']['slope']['median']:.2f} "
              f"EC {channels[channel]['hill']['ec']['median']:.2f} [{channels[channel]['hill']['ec']['lo']:.2f}-{channels[channel]['hill']['ec']['hi']:.2f}] (prior {channels[channel]['hillPrior']['ec']['lo']:.2f}-{channels[channel]['hillPrior']['ec']['hi']:.2f}) "
              f"monthly alpha {curve['alpha']:.2f} k {curve['k'] / current_monthly:.2f}x fit R2 {curve['fitR2']:.4f}")

    # Meridian's own fixed-budget optimization for the analysis window (default +/-30% per channel).
    optimization = None
    try:
        result = optimizer.BudgetOptimizer(mmm).optimize(selected_times=(window[0], window[-1]))
        optimized = result.optimized_data
        baseline = result.nonoptimized_data
        optimization = {
            "scenario": "Fixed budget, Meridian default spend constraints (±30%)",
            "channels": {
                channel: {
                    "currentMonthly": round(float(baseline["spend"].sel(channel=channel).values) * MONEY / window_months),
                    "optimizedMonthly": round(float(optimized["spend"].sel(channel=channel).values) * MONEY / window_months),
                }
                for channel in CHANNELS
            },
            "incrementalRevenueMonthly": {
                "current": float(baseline["incremental_outcome"].sel(channel=CHANNELS, metric="mean").sum().values) * MONEY / window_months,
                "optimized": float(optimized["incremental_outcome"].sel(channel=CHANNELS, metric="mean").sum().values) * MONEY / window_months,
            },
        }
    except Exception as error:  # optimization is informative only
        print(f"optimizer skipped: {error}")

    output = {
        "meta": {
            "engine": "Google Meridian",
            "version": meridian.__version__,
            "fittedOn": date.today().isoformat(),
            "grain": "Geo × Week",
            "geos": len(data.geo),
            "weeks": len(times),
            "trainingStart": times[0],
            "trainingEnd": times[-1],
            "analysisWindow": {"firstWeek": window[0], "lastWeek": window[-1], "weeks": len(window), "months": window_months},
            "kpi": "Revenue (IDR)",
            "controls": CONTROLS,
            "prior": f"ROI ~ LogNormal({ROI_PRIOR[0]}, {ROI_PRIOR[1]}) (Meridian default, median {math.exp(ROI_PRIOR[0]):.2f}x); adstock decay ~ Uniform(0, 1) (Meridian default); Hill slope ~ LogNormal({SLOPE_PRIOR[0]}, {SLOPE_PRIOR[1]}) (median {math.exp(SLOPE_PRIOR[0]):.2f}); Hill EC ~ LogNormal({EC_PRIOR[0]}, {EC_PRIOR[1]}) (median {math.exp(EC_PRIOR[0]):.1f}x median spend)",
            "adstock": f"geometric, max lag {MAX_LAG} weeks",
            "saturation": "Hill",
            "knots": KNOTS,
            "sampler": {"chains": args.chains, "adapt": args.adapt, "burnin": args.burnin, "keep": args.keep, "seed": args.seed},
            "quickRun": bool(args.quick),
            "maxRhat": max_rhat,
            "rhat": rhat,
            "converged": max_rhat < 1.2,
            "accuracy": acc,
            "credibleLevel": int(CONFIDENCE * 100),
            "runtimeSeconds": round(time.time() - started),
            "dataSeed": generated["meta"]["seed"],
            "note": "Fitted on simulated demo data; ground truth included for validation.",
        },
        "channels": channels,
        "optimization": optimization,
    }
    args.output.write_text(json.dumps(output, indent=1), encoding="utf-8")
    print(f"max R-hat {max_rhat:.3f} · national R2 {acc['national']['R_Squared']:.3f} · wMAPE {acc['national']['wMAPE']:.3%}")
    print(f"wrote {args.output} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
