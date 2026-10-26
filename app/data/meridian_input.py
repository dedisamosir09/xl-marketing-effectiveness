"""Geo x week training data for the Google Meridian MMM (deterministic demo).

The dataset is simulated from a known "ground truth" so that the Meridian fit can be
checked against it:

* 20 geos (19 largest cities + Rest of Indonesia) x 104 weeks (Fri 23 Aug 2024 - Thu 20 Aug 2026).
* National weekly spend per channel equals Campaign Performance spend wherever campaign
  rows exist (weeks starting 14 Nov 2025 onward). Earlier weeks are a synthetic history
  with budget flights, so the model sees each channel at several spend levels.
* Revenue = baseline (trend, Ramadan / Lebaran, year-end, promo and competitor controls)
  + media effect + noise. The media effect per geo uses geometric adstock (channel
  half-life) followed by the master Hill curve on per-capita spend, with a geo-level
  efficiency multiplier.

Money columns are written in IDR millions (Meridian works in float32).
"""

from collections import defaultdict
from datetime import date, timedelta
import csv
import json
import math
import random

from .geo import generate_geo_dataset
from .master import CHANNELS, DAYS_PER_MONTH, DEFAULT_START, NON_MEDIA_TOTALS, allocate_integers, hill_parameters, response
from .mmm import _daily_channel_spend

SEED = 20260826
N_WEEKS = 104
HISTORY_WEEKS = 84  # weeks before the default analysis start (3 Apr 2026)
WEEK_START = DEFAULT_START - timedelta(weeks=HISTORY_WEEKS)  # Fri 23 Aug 2024
N_CITY_GEOS = 19
REST_GEO = "Rest of Indonesia"
REST_POPULATION_FACTOR = 2.5  # non-urban areas around the remaining cities
MAX_LAG = 8
WEEKS_PER_MONTH = DAYS_PER_MONTH / 7

# Ramadan and Lebaran (Idul Fitri) weeks in the training period.
RAMADAN = [(date(2025, 3, 1), date(2025, 3, 30)), (date(2026, 2, 18), date(2026, 3, 19))]
LEBARAN = [(date(2025, 3, 31), date(2025, 4, 6)), (date(2026, 3, 20), date(2026, 3, 26))]

# Ground-truth effect of the control variables on baseline revenue.
TRUE_CONTROL_EFFECTS = {"promo_index": 0.08, "competitor_promo": -0.05}

# Channel tilt of spend towards geos (multiplies the population share).
CHANNEL_GEO_TILT = {
    "Google": {},
    "Meta": {"Jakarta": 1.10, "Surabaya": 1.05},
    "TikTok": {"Jakarta": 0.85, "Medan": 1.15, "Makassar": 1.15, REST_GEO: 1.10},
    "X": {"Jakarta": 1.60, "Bandung": 1.15, REST_GEO: 0.60},
}
GEO_CPM_FACTOR = {"Jakarta": 1.22, "Surabaya": 1.08, "Bandung": 1.05, REST_GEO: 0.82}


def _overlap_days(week_start, periods):
    week_end = week_start + timedelta(days=6)
    days = 0
    for start, end in periods:
        lo, hi = max(start, week_start), min(end, week_end)
        if hi >= lo:
            days += (hi - lo).days + 1
    return days / 7


def _geos():
    cities = sorted(generate_geo_dataset()["cities"], key=lambda city: -city["population"])
    top = cities[:N_CITY_GEOS]
    rest_population = round(sum(city["population"] for city in cities[N_CITY_GEOS:]) * REST_POPULATION_FACTOR)
    geos = [{"geo": city["name"], "population": city["population"], "arpuFactor": city["arpu"]} for city in top]
    geos.append({"geo": REST_GEO, "population": rest_population, "arpuFactor": min(city["arpu"] for city in cities)})
    mean_arpu = sum(g["arpuFactor"] * g["population"] for g in geos) / sum(g["population"] for g in geos)
    for geo in geos:
        geo["arpuFactor"] = round(geo["arpuFactor"] / mean_arpu, 4)
    return geos


def _synthetic_level(channel, week_index, week_start, rng):
    """Relative spend level (1.0 = current weekly spend) for weeks without campaign rows."""
    progress = week_index / HISTORY_WEEKS
    ramadan = _overlap_days(week_start, RAMADAN) + _overlap_days(week_start, LEBARAN)
    year_end = 1.0 if week_start.month == 12 else 0.0
    if channel == "Google":
        level = 0.78 + 0.22 * progress + 0.30 * ramadan + 0.08 * year_end
        if 18 <= week_index < 23 or 52 <= week_index < 56:
            level *= 0.55  # budget freezes
        if 38 <= week_index < 42:
            level *= 1.35  # always-on push
    elif channel == "Meta":
        level = 0.50 + 0.45 * progress + 0.25 * ramadan
        if week_index % 13 in (4, 5, 6):
            level *= 1.55  # launch bursts
        if 60 <= week_index < 64:
            level *= 0.5
    elif channel == "TikTok":
        level = 0.65 + 0.40 * progress + 0.45 * ramadan + 0.10 * year_end
        if 44 <= week_index < 49:
            level *= 0.45
        if week_index % 17 in (8, 9):
            level *= 1.4
    else:  # X: intermittent test channel
        on = (week_index // 6) % 3 != 1
        level = (0.6 + 1.2 * rng.random()) if on else 0.0
    noise = math.exp(rng.gauss(0, 0.07))
    return max(level * noise, 0.0)


def _adstock(series, half_life_days):
    """Normalized geometric adstock (weights sum to 1), as in Meridian."""
    decay = 0.5 ** (7 / half_life_days)
    weights = [decay ** lag for lag in range(MAX_LAG + 1)]
    total = sum(weights)
    weights = [w / total for w in weights]
    return [sum(weights[lag] * series[t - lag] for lag in range(MAX_LAG + 1) if t - lag >= 0) for t in range(len(series))]


def generate_meridian_input():
    rng = random.Random(SEED)
    geos = _geos()
    names = [geo["geo"] for geo in geos]
    population_total = sum(geo["population"] for geo in geos)
    pop_share = {geo["geo"]: geo["population"] / population_total for geo in geos}
    weeks = [WEEK_START + timedelta(weeks=index) for index in range(N_WEEKS)]

    daily_spend, _, history_start = _daily_channel_spend()
    campaign_first = date.fromisoformat(history_start)

    # ---- national weekly spend (IDR) ----
    national = {channel: [] for channel in CHANNELS}
    source = []
    for index, week_start in enumerate(weeks):
        from_campaign = week_start >= campaign_first
        source.append("campaign" if from_campaign else "synthetic")
        for channel, config in CHANNELS.items():
            if from_campaign:
                value = sum(daily_spend[(week_start + timedelta(days=d)).isoformat()][channel] for d in range(7))
            else:
                weekly_current = config["spend"] / 144 * 7
                value = round(weekly_current * _synthetic_level(channel, index, week_start, rng))
            national[channel].append(int(value))

    # ---- geo split of spend and impressions ----
    spend = {channel: {geo: [0] * N_WEEKS for geo in names} for channel in CHANNELS}
    impressions = {channel: {geo: [0] * N_WEEKS for geo in names} for channel in CHANNELS}
    for channel, config in CHANNELS.items():
        tilt = CHANNEL_GEO_TILT[channel]
        base = {geo: pop_share[geo] * tilt.get(geo, 1.0) for geo in names}
        for t in range(N_WEEKS):
            raw = [base[geo] * math.exp(rng.gauss(0, 0.10)) for geo in names]
            split = allocate_integers(raw, national[channel][t])
            for geo, value in zip(names, split):
                spend[channel][geo][t] = value
                cpm = config["cpm"] * GEO_CPM_FACTOR.get(geo, 1.0) * math.exp(rng.gauss(0, 0.05))
                impressions[channel][geo][t] = round(value / cpm * 1000)

    # ---- ground-truth media effect ----
    geo_efficiency = {}
    for channel in CHANNELS:
        draws = {geo: math.exp(rng.gauss(0, 0.12)) for geo in names}
        mean = sum(draws[geo] * pop_share[geo] for geo in names)
        geo_efficiency[channel] = {geo: draws[geo] / mean for geo in names}

    effect = {channel: {geo: [0.0] * N_WEEKS for geo in names} for channel in CHANNELS}
    for channel, config in CHANNELS.items():
        params = hill_parameters(channel)
        for geo in names:
            adstocked = _adstock(spend[channel][geo], config["half_life_days"])
            w = pop_share[geo]
            for t in range(N_WEEKS):
                monthly_equivalent = adstocked[t] / w * WEEKS_PER_MONTH
                effect[channel][geo][t] = geo_efficiency[channel][geo] * w * response(params, monthly_equivalent) / WEEKS_PER_MONTH

    # ---- controls and baseline ----
    promo = []
    competitor = []
    for index, week_start in enumerate(weeks):
        payday_weeks = 1 if week_start.day >= 22 or week_start.day <= 3 else 0
        promo.append(round(min(1.0, max(0.0, 0.35 + 0.25 * payday_weeks + 0.3 * _overlap_days(week_start, RAMADAN) + rng.gauss(0, 0.12))), 3))
        competitor.append(round(min(1.0, max(0.0, 0.4 + 0.25 * math.sin(index / 7.5) + rng.gauss(0, 0.12))), 3))
    ramadan = [round(_overlap_days(w, RAMADAN), 3) for w in weeks]
    lebaran = [round(_overlap_days(w, LEBARAN), 3) for w in weeks]

    weekly_baseline = sum(NON_MEDIA_TOTALS.values()) / 144 * 7 / 1.08  # control uplift is added on top
    sigma = {geo: 0.03 * (sorted(pop_share.values())[len(names) // 2] / pop_share[geo]) ** 0.25 for geo in names}
    rows = []
    truth_weekly = defaultdict(lambda: defaultdict(float))
    for t, week_start in enumerate(weeks):
        years = (week_start - DEFAULT_START).days / 365.25
        season = 1 + 0.10 * ramadan[t] + 0.18 * lebaran[t] + (0.05 if week_start.month == 12 else 0) + (0.03 if week_start.month in (6, 7) else 0)
        controls = 1 + TRUE_CONTROL_EFFECTS["promo_index"] * promo[t] + TRUE_CONTROL_EFFECTS["competitor_promo"] * competitor[t]
        for geo in geos:
            name = geo["geo"]
            baseline = weekly_baseline * pop_share[name] * geo["arpuFactor"] * (1 + 0.07 * years) * season * controls
            media_total = sum(effect[channel][name][t] for channel in CHANNELS)
            revenue = (baseline + media_total) * math.exp(rng.gauss(0, sigma[name]))
            row = {
                "geo": name,
                "time": week_start.isoformat(),
                "population": geo["population"],
                "revenue": round(revenue / 1e6, 3),
                "promo_index": promo[t],
                "competitor_promo": competitor[t],
                "ramadan": ramadan[t],
                "lebaran": lebaran[t],
            }
            for channel in CHANNELS:
                key = channel.lower()
                row[f"{key}_impressions"] = impressions[channel][name][t]
                row[f"{key}_spend"] = round(spend[channel][name][t] / 1e6, 3)
                truth_weekly[week_start.isoformat()][channel] += effect[channel][name][t]
            rows.append(row)

    window = [w.isoformat() for w in weeks[HISTORY_WEEKS:]]
    truth = {"window": {"start": window[0], "end": (weeks[-1] + timedelta(days=6)).isoformat(), "weeks": len(window)}, "channels": {}}
    for channel, config in CHANNELS.items():
        window_spend = sum(national[channel][HISTORY_WEEKS:])
        window_effect = sum(truth_weekly[w][channel] for w in window)
        truth["channels"][channel] = {
            "halfLifeDays": config["half_life_days"],
            "windowSpend": window_spend,
            "windowIncremental": round(window_effect),
            "roi": round(window_effect / window_spend, 4),
            "masterCurve": hill_parameters(channel),
        }
    truth["controlEffects"] = TRUE_CONTROL_EFFECTS

    return {
        "meta": {
            "grain": "Geo × Week",
            "geos": len(geos),
            "weeks": N_WEEKS,
            "firstWeek": weeks[0].isoformat(),
            "lastWeek": weeks[-1].isoformat(),
            "analysisWindow": truth["window"],
            "moneyUnit": "IDR million",
            "campaignWeeksFrom": next(w.isoformat() for w, s in zip(weeks, source) if s == "campaign"),
            "seed": SEED,
        },
        "geos": geos,
        "nationalSpend": {channel: national[channel] for channel in CHANNELS},
        "weekSource": source,
        "rows": rows,
        "truth": truth,
    }


def write_meridian_input(directory):
    directory.mkdir(parents=True, exist_ok=True)
    data = generate_meridian_input()
    rows = data["rows"]
    with (directory / "xl_geo_weekly.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    (directory / "ground_truth.json").write_text(json.dumps({"meta": data["meta"], "truth": data["truth"]}, indent=2), encoding="utf-8")
    return data
