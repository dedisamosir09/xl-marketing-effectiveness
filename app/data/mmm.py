"""MMM dataset for the MMM page.

* Response curves and adstock half-lives come from the Google Meridian fit
  (app/data/meridian_output.json, produced by meridian/train_meridian.py). Each channel's
  Meridian response curve is summarized as a monthly Hill curve: m × s^alpha / (s^alpha + k^alpha).
  If the file is missing, the master (ground-truth) curves from master.py are used instead.
* Daily channel spend is exactly the Campaign Performance spend (same campaigns, same days).
* Daily incremental revenue = adstocked spend (channel half-life) scaled so the window total
  equals the monthly curve response at the current monthly budget.
"""

from collections import defaultdict
from datetime import date
from pathlib import Path
import json
import math

from .campaign_performance import generate_campaign_dataset
from .master import (
    CHANNELS,
    DAYS_PER_MONTH,
    DEFAULT_DAYS,
    DEFAULT_END,
    DEFAULT_START,
    EFFICIENT_RANGE_SHARE,
    LAST_UPDATED,
    NON_MEDIA_TOTALS,
    allocate_integers,
    break_even_spend,
    current_monthly_spend,
    date_range,
    efficient_range,
    hill_parameters,
    marginal,
    response,
)

SMALL_CHANNEL_SHARE = 0.05
PLANNING_CAP_MONTHLY = 10_000_000_000  # planner range Rp0-10B per month (inside the spend range the data cover)
GUARDRAIL_PCT = 30  # Meridian default spend constraint: +/-30% of each channel's share of the budget
MERIDIAN_OUTPUT = Path(__file__).with_name("meridian_output.json")


def load_meridian_output(path=MERIDIAN_OUTPUT):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _channel_model(name, meridian):
    """Monthly curve parameters and half-life for a channel (Meridian fit, else master)."""
    if meridian and name in meridian["channels"]:
        fitted = meridian["channels"][name]
        curve = fitted["monthlyCurve"]
        return {"alpha": curve["alpha"], "k": curve["k"], "m": curve["m"]}, round(fitted["halfLifeDays"]["median"], 1)
    return hill_parameters(name), CHANNELS[name]["half_life_days"]


def _format_week(value):
    return date.fromisoformat(value).strftime("%d %b %Y")


def channel_signal(name, monthly_spend, total_monthly_spend, params, band):
    """Shared decision rule (mirrored in mmm.js): position versus efficient range."""
    mroi = marginal(params, monthly_spend)
    share = monthly_spend / total_monthly_spend if total_monthly_spend else 0
    if share < SMALL_CHANNEL_SHARE:
        return "Test & learn", "Small spend base; validate the response with a controlled increase before scaling."
    if monthly_spend < band["low"] and mroi > 1:
        return "Invest more", "Current budget sits below the efficient range; the next rupiah still returns more than the average."
    if monthly_spend > band["high"] or mroi < 1:
        return "Reduce", "Current budget sits above the efficient range; additional spend is approaching saturation."
    return "Hold", "Current budget sits inside the efficient range; keep spend near this level."


def _daily_channel_spend():
    dataset = generate_campaign_dataset()
    channel_by_campaign = {item["id"]: item["channel"] for item in dataset["campaigns"]}
    spend = defaultdict(lambda: defaultdict(int))
    observed = defaultdict(lambda: defaultdict(int))
    for row in dataset["rows"]:
        channel = channel_by_campaign[row[1]]
        spend[row[0]][channel] += row[2]
        observed[row[0]][channel] += row[8]
    return spend, observed, dataset["meta"]["historyStart"]


def _adstock(series, half_life):
    decay = 0.5 ** (1 / half_life)
    carried = 0.0
    result = []
    for value in series:
        carried = value + decay * carried
        result.append(carried)
    return result


def generate_mmm_dataset():
    daily_spend, daily_observed, history_start = _daily_channel_spend()
    history_dates = list(date_range(date.fromisoformat(history_start), DEFAULT_END))
    dates = list(date_range(DEFAULT_START, DEFAULT_END))
    default_keys = [current.isoformat() for current in dates]
    offset = len(history_dates) - len(dates)

    meridian = load_meridian_output()
    channels = []
    media = {}
    total_monthly = sum(current_monthly_spend(name) for name in CHANNELS)
    for name, config in CHANNELS.items():
        params, half_life = _channel_model(name, meridian)
        s0 = current_monthly_spend(name)
        incremental_total = round(response(params, s0) * DEFAULT_DAYS / DAYS_PER_MONTH)
        full_series = [daily_spend[current.isoformat()][name] for current in history_dates]
        adstocked = _adstock(full_series, half_life)[offset:]
        media[name] = allocate_integers(adstocked, incremental_total)
        band = efficient_range(params)
        signal, reason = channel_signal(name, s0, total_monthly, params, band)
        observed_revenue = config["observed_roas"] * config["spend"]
        breakeven = break_even_spend(params)
        estimate = None
        observed_max = None
        if meridian and meridian["channels"][name].get("observedSpend"):
            # Highest spend level the training data support (99th percentile of geo-week spend per capita).
            observed_max = meridian["channels"][name]["observedSpend"]["p99"] * s0
        if meridian:
            fitted = meridian["channels"][name]
            estimate = {
                "roi": fitted["roi"],
                "mroi": fitted["mroi"],
                "halfLifeDays": fitted["halfLifeDays"],
                "curveFitR2": round(fitted["monthlyCurve"]["fitR2"], 5),
                "truthRoi": fitted["truth"]["roi"],
                "truthHalfLifeDays": fitted["truth"]["halfLifeDays"],
            }
        channels.append(
            {
                "name": name,
                "color": config["color"],
                "currentSpend": config["spend"],
                "currentMonthlySpend": round(s0),
                "incrementalRevenue": incremental_total,
                "observedRevenue": round(observed_revenue),
                "observedROAS": config["observed_roas"],
                "iROAS": round(incremental_total / config["spend"], 4),
                "incrementalShare": round(incremental_total / observed_revenue, 4),
                "mROI": round(marginal(params, s0), 4),
                "halfLifeDays": half_life,
                "curve": {"alpha": round(params["alpha"], 4), "k": round(params["k"]), "m": round(params["m"])},
                "meridian": estimate,
                "efficientRange": {
                    "low": round(band["low"]),
                    "high": round(band["high"]),
                    "peakSpend": round(band["peakSpend"]),
                    "peakIROAS": round(band["peakIroas"], 4),
                },
                "breakEvenMonthlySpend": round(breakeven) if breakeven else None,
                "observedMaxMonthlySpend": round(observed_max) if observed_max else None,
                "signal": signal,
                "reason": reason,
            }
        )

    components = {}
    for key, total in NON_MEDIA_TOTALS.items():
        weights = []
        for index, current in enumerate(dates):
            progress = index / max(len(dates) - 1, 1)
            weekday = 0.91 if current.weekday() >= 5 else 1.04
            payday = 1.32 if current.day in {1, 2, 15, 16, 25, 26} else 0.92
            if key == "baseline":
                weights.append((0.94 + 0.13 * progress) * weekday)
            elif key == "promotion":
                weights.append(payday * (1 + 0.13 * math.sin(index / 10.5)))
            elif key == "seasonality":
                weights.append(1 + 0.24 * math.sin((index / len(dates)) * math.tau - 0.65))
            else:
                weights.append(1 + 0.08 * math.cos(index / 8.0))
        components[key] = allocate_integers(weights, total)

    predicted = [
        sum(components[key][index] for key in NON_MEDIA_TOTALS) + sum(media[name][index] for name in CHANNELS)
        for index in range(len(dates))
    ]
    actual_weights = [value * (1 + 0.023 * math.sin(index / 4.1) - 0.014 * math.cos(index / 9.2)) for index, value in enumerate(predicted)]
    actual = allocate_integers(actual_weights, round(sum(predicted) * 1.004))

    rows = []
    for index, key in enumerate(default_keys):
        rows.append(
            {
                "date": key,
                "baseline": components["baseline"][index],
                "promotion": components["promotion"][index],
                "seasonality": components["seasonality"][index],
                "other": components["other"][index],
                "predicted": predicted[index],
                "actual": actual[index],
                "spend": {name: daily_spend[key][name] for name in CHANNELS},
                "media": {name: media[name][index] for name in CHANNELS},
                "observed": {name: daily_observed[key][name] for name in CHANNELS},
            }
        )

    if meridian:
        mm = meridian["meta"]
        window = mm["analysisWindow"]
        model_meta = {
            "dataset": "MMM page dataset · curves from Google Meridian fit",
            "modelSource": "meridian",
            "modelVersion": f"Google Meridian {mm['version']} · fitted {mm['fittedOn']}",
            "modelLabel": f"Google Meridian {mm['version']} · {mm['geos']} geos × {mm['weeks']} weeks",
            "methodology": "Bayesian geo-level MMM (Google Meridian) fitted on simulated demo data",
            "trainingWindow": f"{_format_week(mm['trainingStart'])} – {_format_week(window['lastWeek'])} (weekly)",
            "analysisWindow": f"{_format_week(window['firstWeek'])} + {window['weeks']} weeks",
            "nationalR2": round(mm["accuracy"]["national"]["R_Squared"], 4),
            "wMAPE": round(mm["accuracy"]["national"]["wMAPE"] * 100, 2),
            "maxRhat": round(mm["maxRhat"], 3),
            "converged": mm["converged"],
            "credibleLevel": mm["credibleLevel"],
            "prior": mm["prior"],
        }
    else:
        model_meta = {
            "dataset": "MMM page dataset · master (ground-truth) curves",
            "modelSource": "master",
            "modelVersion": "Master curves (Meridian output not found)",
            "modelLabel": "Model estimate · master curves",
            "methodology": "Simulated response curves; run meridian/train_meridian.py to fit Google Meridian",
        }

    return {
        "meta": {
            **model_meta,
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "lastUpdated": LAST_UPDATED,
            "product": "Prepaid",
            "businessKpis": ["Revenue"],
            "currency": "IDR",
            "grain": "Channel × Day",
            "daysPerMonth": DAYS_PER_MONTH,
            "efficientRangeShare": EFFICIENT_RANGE_SHARE,
            "planningCapMonthly": PLANNING_CAP_MONTHLY,
            "guardrailPct": GUARDRAIL_PCT,
            "smallChannelShare": SMALL_CHANNEL_SHARE,
            "responseCurve": "Monthly Hill curve fitted to the Meridian response curve: incremental = m × s^alpha / (s^alpha + k^alpha)",
        },
        "channels": channels,
        "rows": rows,
    }


def write_mmm_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_mmm_dataset(), separators=(",", ":")), encoding="utf-8")
