"""MMM demo model derived from the shared master model.

* Daily channel spend is exactly the Campaign Performance spend (same campaigns, same days).
* Daily incremental revenue = adstocked spend (channel half-life) scaled so the window total
  equals the monthly Hill response at the current monthly budget.
* Incremental revenue is a share of platform-observed revenue (incrementality < 100%).
"""

from collections import defaultdict
from datetime import date
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

    channels = []
    media = {}
    total_monthly = sum(current_monthly_spend(name) for name in CHANNELS)
    for name, config in CHANNELS.items():
        params = hill_parameters(name)
        s0 = current_monthly_spend(name)
        incremental_total = round(response(params, s0) * DEFAULT_DAYS / DAYS_PER_MONTH)
        full_series = [daily_spend[current.isoformat()][name] for current in history_dates]
        adstocked = _adstock(full_series, config["half_life_days"])[offset:]
        media[name] = allocate_integers(adstocked, incremental_total)
        band = efficient_range(params)
        signal, reason = channel_signal(name, s0, total_monthly, params, band)
        observed_revenue = config["observed_roas"] * config["spend"]
        breakeven = break_even_spend(params)
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
                "halfLifeDays": config["half_life_days"],
                "curve": {"alpha": params["alpha"], "k": round(params["k"]), "m": round(params["m"])},
                "efficientRange": {
                    "low": round(band["low"]),
                    "high": round(band["high"]),
                    "peakSpend": round(band["peakSpend"]),
                    "peakIROAS": round(band["peakIroas"], 4),
                },
                "breakEvenMonthlySpend": round(breakeven) if breakeven else None,
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

    return {
        "meta": {
            "dataset": "Deterministic MMM demo model (master model)",
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "lastUpdated": LAST_UPDATED,
            "product": "Prepaid",
            "businessKpis": ["Revenue"],
            "currency": "IDR",
            "methodology": "Bayesian MMM demo estimate; not platform attribution",
            "grain": "Channel × Day",
            "modelVersion": "Meridian POC v3",
            "trainingWindow": "03 Apr–24 Aug 2026 (144 days)",
            "trainR2": 0.9736,
            "testR2": 0.8733,
            "wMAPE": 8.7,
            "credibleLevel": 90,
            "daysPerMonth": DAYS_PER_MONTH,
            "efficientRangeShare": EFFICIENT_RANGE_SHARE,
            "smallChannelShare": SMALL_CHANNEL_SHARE,
            "responseCurve": "Monthly Hill curve: incremental = m × s^alpha / (s^alpha + k^alpha)",
        },
        "channels": channels,
        "rows": rows,
    }


def write_mmm_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_mmm_dataset(), separators=(",", ":")), encoding="utf-8")
