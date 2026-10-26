"""Single source of truth for every demo dataset.

All four modules (Campaign Performance, MTA, MMM, Geo Intelligence) derive their
numbers from the parameters in this file so that spend, revenue, purchases and
campaign names reconcile across pages.

Business story encoded in the parameters (deterministic demo, not client data):

* Google captures existing demand: highest observed (platform) ROAS, lowest
  incrementality, and its current monthly budget sits above its efficient range.
* Meta is the balanced full-funnel channel with headroom: current budget is below
  its efficient range.
* TikTok opens journeys: lowest observed ROAS but the highest incremental share;
  current budget sits inside its efficient range.
* X is a small test channel below its efficient range.
"""

from datetime import date, timedelta
import math

HISTORY_START = date(2025, 11, 10)
GEO_HISTORY_START = date(2026, 1, 1)
DEFAULT_START = date(2026, 4, 3)
DEFAULT_END = date(2026, 8, 24)
DEFAULT_DAYS = (DEFAULT_END - DEFAULT_START).days + 1  # 144
DAYS_PER_MONTH = 30.4375
LAST_UPDATED = "2026-08-24T23:59:00+07:00"

MEDIA_PLANS = ["AON-5G", "AON-SEM", "AON-Social", "AON-App Growth", "AON-Retargeting"]
CAMPAIGN_OBJECTIVES = ["Awareness", "Consideration", "Conversion", "Social Media Engagement"]

# Share of platform-reported package purchases that can be stitched into user journeys.
MTA_TRACKED_COVERAGE = 0.40

# Efficient range = monthly budget band where average iROAS stays within this share of its peak.
EFFICIENT_RANGE_SHARE = 0.98

CHANNELS = {
    "Google": {
        "color": "#3156d3",
        "count": 48,
        "spend": 9_364_500_000,       # actual spend in the default 144-day window
        "planned": 9_500_000_000,     # media-plan budget for the same window
        "observed_roas": 4.30,        # platform-reported revenue / spend (Campaign page)
        "target_roas": 4.40,
        "aov": 72_000,                # average package value per purchase
        "cpm": 9_200,
        "ctr": 0.018,
        "session_rate": 0.62,
        "conversion_rate": 0.047,
        "view_rate": 0.31,
        "placements": ["Search-CPC", "App Install-CPI-Android", "Performance Max-CPA", "YouTube-CPV"],
        # MMM response curve (monthly): Hill curve with S-shape, defined by
        # alpha, the monthly budget where average iROAS peaks and iROAS at current spend.
        "alpha": 2.2,
        "peak_monthly_spend": 1_400_000_000,
        "iroas_at_current": 1.55,
        "half_life_days": 4.2,
    },
    "Meta": {
        "color": "#7355dc",
        "count": 36,
        "spend": 4_607_800_000,
        "planned": 4_400_000_000,
        "observed_roas": 3.50,
        "target_roas": 3.60,
        "aov": 85_000,
        "cpm": 12_600,
        "ctr": 0.012,
        "session_rate": 0.56,
        "conversion_rate": 0.073,
        "view_rate": 0.42,
        "placements": ["App Engagement-CPA", "App Install-CPI-Android", "Video Views-CPV", "Traffic-CPC"],
        "alpha": 2.0,
        "peak_monthly_spend": 1_300_000_000,
        "iroas_at_current": 1.95,
        "half_life_days": 7.8,
    },
    "TikTok": {
        "color": "#ec0a68",
        "count": 42,
        "spend": 5_178_200_000,
        "planned": 5_300_000_000,
        "observed_roas": 2.10,
        "target_roas": 2.30,
        "aov": 68_000,
        "cpm": 7_400,
        "ctr": 0.0095,
        "session_rate": 0.49,
        "conversion_rate": 0.052,
        "view_rate": 0.54,
        "placements": ["Video Views-CPV", "App Install-CPI-Android", "App Engagement-CPA", "Traffic-CPC"],
        "alpha": 2.0,
        "peak_monthly_spend": 1_050_000_000,
        "iroas_at_current": 1.35,
        "half_life_days": 6.4,
    },
    "X": {
        "color": "#18a2bd",
        "count": 12,
        "spend": 317_900_000,
        "planned": 350_000_000,
        "observed_roas": 3.20,
        "target_roas": 3.10,
        "aov": 92_000,
        "cpm": 15_800,
        "ctr": 0.012,
        "session_rate": 0.50,
        "conversion_rate": 0.085,
        "view_rate": 0.28,
        "placements": ["Website Traffic-CPC", "Video Views-CPV", "App Engagement-CPA"],
        "alpha": 1.8,
        "peak_monthly_spend": 120_000_000,
        "iroas_at_current": 1.60,
        "half_life_days": 3.1,
    },
}

CHANNEL_NAMES = list(CHANNELS)

# Non-media drivers of the business KPI (revenue) for the default window, used by MMM.
NON_MEDIA_TOTALS = {
    "baseline": 100_000_000_000,
    "promotion": 12_500_000_000,
    "seasonality": 7_800_000_000,
    "other": 3_700_000_000,
}


def date_range(start, end, step_days=1):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=step_days)


def current_monthly_spend(channel):
    return CHANNELS[channel]["spend"] / DEFAULT_DAYS * DAYS_PER_MONTH


def hill_parameters(channel):
    """Return monthly Hill parameters {alpha, k, m} for a channel.

    response(s) = m * s^alpha / (s^alpha + k^alpha)
    Average iROAS peaks at s* = k * (alpha - 1)^(1/alpha).
    """
    config = CHANNELS[channel]
    alpha = config["alpha"]
    k = config["peak_monthly_spend"] / (alpha - 1) ** (1 / alpha)
    s0 = current_monthly_spend(channel)
    m = config["iroas_at_current"] * (s0 ** alpha + k ** alpha) / s0 ** (alpha - 1)
    return {"alpha": alpha, "k": k, "m": m}


def response(params, spend):
    if spend <= 0:
        return 0.0
    a, k, m = params["alpha"], params["k"], params["m"]
    return m * spend ** a / (spend ** a + k ** a)


def marginal(params, spend):
    if spend <= 0:
        return 0.0
    a, k, m = params["alpha"], params["k"], params["m"]
    return m * a * k ** a * spend ** (a - 1) / (spend ** a + k ** a) ** 2


def efficient_range(params, share=EFFICIENT_RANGE_SHARE):
    """Monthly budget band where average iROAS >= share * peak iROAS (closed form)."""
    a, k, m = params["alpha"], params["k"], params["m"]
    peak_spend = k * (a - 1) ** (1 / a)
    peak_iroas = response(params, peak_spend) / peak_spend

    def solve(lo, hi, rising):
        for _ in range(80):
            mid = (lo + hi) / 2
            value = response(params, mid) / mid
            if (value < share * peak_iroas) == rising:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    low = solve(peak_spend * 1e-3, peak_spend, True)
    high = solve(peak_spend, peak_spend * 50, False)
    return {"peakSpend": peak_spend, "peakIroas": peak_iroas, "low": low, "high": high}


def break_even_spend(params):
    """Monthly spend above the efficient range where marginal return falls to 1.0x."""
    a, k = params["alpha"], params["k"]
    peak_marginal = k * ((a - 1) / (a + 1)) ** (1 / a)
    lo, hi = peak_marginal, k * 60
    if marginal(params, lo) < 1:
        return None
    for _ in range(100):
        mid = (lo + hi) / 2
        if marginal(params, mid) > 1:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def build_campaigns(rng):
    """Deterministic campaign master list shared by Campaign, MTA and Geo."""
    from collections import defaultdict

    campaigns = []
    channel_number = defaultdict(int)
    global_number = 0
    for channel, config in CHANNELS.items():
        for index in range(config["count"]):
            global_number += 1
            channel_number[channel] += 1
            media_plan = MEDIA_PLANS[(index + len(channel)) % len(MEDIA_PLANS)]
            funnel = CAMPAIGN_OBJECTIVES[(index * 2 + global_number) % len(CAMPAIGN_OBJECTIVES)]
            placement = config["placements"][index % len(config["placements"])]
            plan_code = media_plan.replace("AON-", "").replace(" ", "-").upper()
            objective_code = funnel.replace(" ", "-").upper()
            campaigns.append(
                {
                    "id": global_number - 1,
                    "campaign": f"{plan_code}_{channel.upper()}_{objective_code}_{channel_number[channel]:02d}",
                    "product": "Prepaid",
                    "mediaPlan": media_plan,
                    "channel": channel,
                    "placement": placement,
                    "funnel": funnel,
                    "weight": rng.uniform(0.62, 1.48),
                    "phase": rng.uniform(0, math.tau),
                    "quality": rng.uniform(0.84, 1.18),
                }
            )
    return campaigns


def allocate_integers(raw_values, target):
    """Largest-remainder rounding so the integers sum exactly to target."""
    total = sum(raw_values)
    if total <= 0 or target <= 0:
        return [0 for _ in raw_values]
    scaled = [value * target / total for value in raw_values]
    floors = [math.floor(value) for value in scaled]
    remainder = int(round(target - sum(floors)))
    order = sorted(range(len(scaled)), key=lambda index: scaled[index] - floors[index], reverse=True)
    for index in order[:max(remainder, 0)]:
        floors[index] += 1
    return floors
