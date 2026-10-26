"""MTA demo journeys aligned with Campaign Performance.

* Journeys are a tracked subset (MTA_TRACKED_COVERAGE) of platform-reported package purchases:
  last-touch package purchases and revenue per channel equal coverage x Campaign purchases/revenue.
* Revenue per purchase uses the same channel package values (AOV) as Campaign Performance.
* Every journey row references a real campaign from the shared master list, so campaign,
  objective, media plan and placement filters mean the same thing on every page.
"""

from collections import defaultdict
import json
import math
import random

from .campaign_performance import generate_campaign_dataset
from .master import (
    CAMPAIGN_OBJECTIVES,
    CHANNELS,
    DEFAULT_END,
    DEFAULT_START,
    LAST_UPDATED,
    MEDIA_PLANS,
    MTA_TRACKED_COVERAGE,
    allocate_integers,
    date_range,
)

USER_TYPES = ["New User", "Existing User", "Returning User"]
TARGET_EVENTS = ["Package Purchase", "Recharge", "App Install"]
RECHARGE_TO_PURCHASE = 0.90
INSTALL_TO_PURCHASE = 0.80
RECHARGE_VALUE = 45_000
OBJECTIVE_CVR = {"Awareness": 0.72, "Consideration": 0.91, "Conversion": 1.22, "Social Media Engagement": 0.81}

PATH_ARCHETYPES = [
    {"channels": ["Google"], "weight": 0.40, "entry": "Deep Link", "engagement": "Promo View", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.43},
    {"channels": ["Meta", "Google"], "weight": 0.07, "entry": "App Open", "engagement": "Promo Banner", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.39},
    {"channels": ["TikTok", "Google"], "weight": 0.05, "entry": "App Install", "engagement": "Home", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.35},
    {"channels": ["Meta"], "weight": 0.18, "entry": "App Open", "engagement": "Home", "intent": "Package List", "drop": "Payment Failed", "conversionRate": 0.31},
    {"channels": ["TikTok", "Meta", "Google"], "weight": 0.03, "entry": "App Install", "engagement": "Promo Banner", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.41},
    {"channels": ["Google", "Meta"], "weight": 0.05, "entry": "Deep Link", "engagement": "Home", "intent": "Package Detail", "drop": "Payment Failed", "conversionRate": 0.34},
    {"channels": ["TikTok"], "weight": 0.14, "entry": "App Install", "engagement": "Home", "intent": "Search", "drop": "Exit", "conversionRate": 0.24},
    {"channels": ["X", "Google"], "weight": 0.01, "entry": "Deep Link", "engagement": "Home", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.36},
    {"channels": ["X"], "weight": 0.02, "entry": "App Open", "engagement": "Home", "intent": "Search", "drop": "Exit", "conversionRate": 0.22},
    {"channels": ["Google", "Google"], "weight": 0.03, "entry": "Deep Link", "engagement": "Package List", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.46},
    {"channels": ["Meta", "TikTok"], "weight": 0.01, "entry": "App Install", "engagement": "Promo Banner", "intent": "Package Detail", "drop": "Exit", "conversionRate": 0.33},
    {"channels": ["Google", "X"], "weight": 0.01, "entry": "App Open", "engagement": "Search", "intent": "Package Detail", "drop": "Payment Failed", "conversionRate": 0.29},
]


def _allocate(raw_values, target, caps=None):
    total = sum(raw_values) or 1
    scaled = [value * target / total for value in raw_values]
    allocated = [math.floor(value) for value in scaled]
    if caps:
        allocated = [min(value, caps[index]) for index, value in enumerate(allocated)]

    while sum(allocated) < target:
        candidates = [
            index for index in range(len(allocated))
            if raw_values[index] > 0 and (caps is None or allocated[index] < caps[index])
        ]
        if not candidates:
            break
        index = max(candidates, key=lambda item: (scaled[item] - allocated[item], raw_values[item]))
        allocated[index] += 1

    while sum(allocated) > target:
        candidates = [index for index, value in enumerate(allocated) if value > 0]
        index = min(candidates, key=lambda item: (scaled[item] - allocated[item], raw_values[item]))
        allocated[index] -= 1

    return allocated


def _build_paths(archetype, target_event, converted):
    channels = archetype["channels"]
    entry = archetype["entry"]
    marketing_path = channels + [entry]

    if target_event == "App Install":
        if converted:
            app_path = ["App Store", "App Install", "First Open"]
            end_path = channels + ["Ad Click", "App Store", "App Install", "First Open"]
        else:
            app_path = ["App Store", "Install Abandoned"]
            end_path = channels + ["Ad Click", "App Store", "Install Abandoned"]
        return marketing_path, app_path, end_path

    success = "Payment Success" if target_event == "Package Purchase" else "Recharge Success"
    if converted:
        app_path = [entry, "Home", archetype["engagement"], archetype["intent"], "Checkout", success]
        end_path = channels + [entry, archetype["engagement"], archetype["intent"], success]
    else:
        drop = archetype["drop"]
        app_path = [entry, "Home", archetype["engagement"]]
        if drop == "Payment Failed":
            app_path += [archetype["intent"], "Checkout", drop]
            end_path = channels + [entry, archetype["engagement"], archetype["intent"], drop]
        else:
            app_path += [drop]
            end_path = channels + [entry, archetype["engagement"], drop]
    return marketing_path, app_path, end_path




def _campaign_targets():
    dataset = generate_campaign_dataset()
    campaigns = dataset["campaigns"]
    lookup = {item["id"]: item for item in campaigns}
    purchases = defaultdict(int)
    revenue = defaultdict(int)
    start, end = DEFAULT_START.isoformat(), DEFAULT_END.isoformat()
    for row in dataset["rows"]:
        if start <= row[0] <= end:
            channel = lookup[row[1]]["channel"]
            purchases[channel] += row[7]
            revenue[channel] += row[8]
    by_channel = defaultdict(list)
    for item in campaigns:
        by_channel[item["channel"]].append(item)
    return purchases, revenue, by_channel


def generate_mta_dataset():
    rng = random.Random(20260825)
    campaign_purchases, campaign_revenue, campaigns_by_channel = _campaign_targets()
    dates = list(date_range(DEFAULT_START, DEFAULT_END))

    group_rows = []
    for day_index, current_date in enumerate(dates):
        weekday = 0.92 if current_date.weekday() >= 5 else 1.04
        seasonal = 1 + 0.12 * math.sin(day_index / 18 * math.tau)
        payday = 1.18 if current_date.day in {1, 2, 15, 16, 25} else 1
        for archetype_index, archetype in enumerate(PATH_ARCHETYPES):
            channel = archetype["channels"][0]
            pool = campaigns_by_channel[channel]
            campaign = pool[(day_index * 7 + archetype_index * 3) % len(pool)]
            target_event = TARGET_EVENTS[(day_index // 12 + archetype_index) % len(TARGET_EVENTS)]
            cvr = min(0.68, archetype["conversionRate"] * OBJECTIVE_CVR[campaign["funnel"]] * rng.uniform(0.9, 1.1))
            group_rows.append(
                {
                    "date": current_date.isoformat(),
                    "product": campaign["product"],
                    "mediaPlan": campaign["mediaPlan"],
                    "objective": campaign["funnel"],
                    "placement": campaign["placement"],
                    "campaign": campaign["campaign"],
                    "userType": USER_TYPES[(day_index // 7 + archetype_index) % len(USER_TYPES)],
                    "targetEvent": target_event,
                    "archetype": archetype,
                    "lastChannel": archetype["channels"][-1],
                    "weight": archetype["weight"] * weekday * seasonal * payday * rng.uniform(0.82, 1.18),
                    "conversionRate": cvr,
                    "durationHours": max(0.2, rng.lognormvariate(1.15, 0.7)),
                    "valueFactor": rng.uniform(0.95, 1.05),
                }
            )

    # Package purchases: last-touch conversions and revenue per channel = coverage x Campaign.
    conversions = [0] * len(group_rows)
    revenue = [0] * len(group_rows)
    purchase_total = 0
    for channel, config in CHANNELS.items():
        indices = [i for i, row in enumerate(group_rows) if row["targetEvent"] == "Package Purchase" and row["lastChannel"] == channel]
        target = round(campaign_purchases[channel] * MTA_TRACKED_COVERAGE)
        purchase_total += target
        allocated = allocate_integers([group_rows[i]["weight"] * group_rows[i]["conversionRate"] for i in indices], target)
        for i, value in zip(indices, allocated):
            conversions[i] = value
        revenue_target = round(campaign_revenue[channel] * MTA_TRACKED_COVERAGE)
        revenue_parts = allocate_integers([conversions[i] * config["aov"] * group_rows[i]["valueFactor"] for i in indices], revenue_target)
        for i, value in zip(indices, revenue_parts):
            revenue[i] = value

    for event, ratio, value in (("Recharge", RECHARGE_TO_PURCHASE, RECHARGE_VALUE), ("App Install", INSTALL_TO_PURCHASE, 0)):
        indices = [i for i, row in enumerate(group_rows) if row["targetEvent"] == event]
        allocated = allocate_integers([group_rows[i]["weight"] * group_rows[i]["conversionRate"] for i in indices], round(purchase_total * ratio))
        for i, amount in zip(indices, allocated):
            conversions[i] = amount
            revenue[i] = round(amount * value * group_rows[i]["valueFactor"]) if value else 0

    expanded = []
    for index, row in enumerate(group_rows):
        converted_count = conversions[index]
        journeys = max(converted_count, round(converted_count / row["conversionRate"])) if converted_count else 0
        for converted, count in ((True, converted_count), (False, journeys - converted_count)):
            if count <= 0:
                continue
            marketing_path, app_path, end_path = _build_paths(row["archetype"], row["targetEvent"], converted)
            duration = row["durationHours"] * (0.72 if converted else 1.28)
            duration *= 0.55 if row["targetEvent"] == "App Install" else 1
            expanded.append(
                {
                    "date": row["date"],
                    "product": row["product"],
                    "mediaPlan": row["mediaPlan"],
                    "objective": row["objective"],
                    "channel": row["archetype"]["channels"][0],
                    "channels": row["archetype"]["channels"],
                    "placement": row["placement"],
                    "campaign": row["campaign"],
                    "userType": row["userType"],
                    "targetEvent": row["targetEvent"],
                    "outcome": "Converted" if converted else "Non-Converted",
                    "durationHours": round(duration, 2),
                    "journeys": count,
                    "users": 0,
                    "touchpoints": 0,
                    "conversions": count if converted else 0,
                    "revenue": revenue[index] if converted else 0,
                    "marketingPath": marketing_path,
                    "appPath": app_path,
                    "endToEndPath": end_path,
                }
            )

    total_journeys = sum(row["journeys"] for row in expanded)
    user_raw = [row["journeys"] * (0.61 if row["outcome"] == "Converted" else 0.47) for row in expanded]
    users = _allocate(user_raw, round(sum(user_raw)), caps=[row["journeys"] for row in expanded])
    touch_raw = [row["journeys"] * (len(row["channels"]) + 1.18) for row in expanded]
    touchpoints = _allocate(touch_raw, round(sum(touch_raw)))
    for index, row in enumerate(expanded):
        row["users"] = users[index]
        row["touchpoints"] = touchpoints[index]

    return {
        "meta": {
            "dataset": "Deterministic MTA demo data (master model)",
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "defaultTargetEvent": "Package Purchase",
            "lastUpdated": LAST_UPDATED,
            "currency": "IDR",
            "methodology": "Observed journey attribution; not incremental impact",
            "trackedCoverage": MTA_TRACKED_COVERAGE,
            "coverageNote": "Tracked journeys cover about 40% of platform-reported package purchases; last-touch purchases and revenue reconcile to Campaign Performance x 40%.",
            "totalJourneys": total_journeys,
        },
        "rows": expanded,
    }


def write_mta_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_mta_dataset(), separators=(",", ":")), encoding="utf-8")
