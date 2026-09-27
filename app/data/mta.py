from datetime import date, timedelta
import json
import math
import random

from .campaign_performance import CAMPAIGN_OBJECTIVES, CHANNEL_CONFIG, DEFAULT_END, DEFAULT_START, MEDIA_PLANS


TARGET_JOURNEYS = 30_000
TARGET_USERS = 15_561
TARGET_TOUCHPOINTS = 67_894
TARGET_CONVERSIONS = 9_952
TARGET_REVENUE = 759_710_000

USER_TYPES = ["New User", "Existing User", "Returning User"]
TARGET_EVENTS = ["Package Purchase", "Recharge", "App Install"]

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


def _date_range(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


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


def generate_mta_dataset():
    rng = random.Random(20260825)
    group_rows = []
    dates = list(_date_range(DEFAULT_START, DEFAULT_END))

    for day_index, current_date in enumerate(dates):
        weekday = 0.92 if current_date.weekday() >= 5 else 1.04
        seasonal = 1 + 0.12 * math.sin(day_index / 18 * math.tau)
        payday = 1.18 if current_date.day in {1, 2, 15, 16, 25} else 1

        for archetype_index, archetype in enumerate(PATH_ARCHETYPES):
            channel = archetype["channels"][0]
            objective = CAMPAIGN_OBJECTIVES[(day_index + archetype_index * 3) % len(CAMPAIGN_OBJECTIVES)]
            media_plan = MEDIA_PLANS[(day_index // 9 + archetype_index) % len(MEDIA_PLANS)]
            target_event = TARGET_EVENTS[(day_index // 12 + archetype_index) % len(TARGET_EVENTS)]
            placement_options = CHANNEL_CONFIG[channel]["placements"]
            placement = placement_options[(day_index + archetype_index) % len(placement_options)]
            user_type = USER_TYPES[(day_index // 7 + archetype_index) % len(USER_TYPES)]
            campaign = (
                f"{media_plan.replace('AON-', '').replace(' ', '-').upper()}_"
                f"{channel.upper()}_{objective.replace(' ', '-').upper()}_{(archetype_index % 8) + 1:02d}"
            )
            raw_journeys = (
                archetype["weight"] * weekday * seasonal * payday * rng.uniform(0.82, 1.18)
            )
            conversion_modifier = {
                "Awareness": 0.72,
                "Consideration": 0.91,
                "Conversion": 1.22,
                "Social Media Engagement": 0.81,
            }[objective]
            conversion_rate = min(0.68, archetype["conversionRate"] * conversion_modifier * rng.uniform(0.9, 1.1))
            group_rows.append(
                {
                    "date": current_date.isoformat(),
                    "product": "Prepaid",
                    "mediaPlan": media_plan,
                    "objective": objective,
                    "placement": placement,
                    "campaign": campaign,
                    "userType": user_type,
                    "targetEvent": target_event,
                    "archetype": archetype,
                    "rawJourneys": raw_journeys,
                    "conversionRate": conversion_rate,
                    "durationHours": max(0.2, rng.lognormvariate(1.15, 0.7)),
                    "quality": rng.uniform(0.88, 1.14),
                }
            )

    journeys = _allocate([row["rawJourneys"] for row in group_rows], TARGET_JOURNEYS)
    raw_conversions = [journeys[index] * row["conversionRate"] for index, row in enumerate(group_rows)]
    conversions = _allocate(raw_conversions, TARGET_CONVERSIONS, caps=journeys)

    expanded = []
    for index, row in enumerate(group_rows):
        for converted, count in ((True, conversions[index]), (False, journeys[index] - conversions[index])):
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
                    "revenue": 0,
                    "marketingPath": marketing_path,
                    "appPath": app_path,
                    "endToEndPath": end_path,
                    "quality": row["quality"],
                }
            )

    user_raw = [row["journeys"] * (0.61 if row["outcome"] == "Converted" else 0.47) for row in expanded]
    users = _allocate(user_raw, TARGET_USERS, caps=[row["journeys"] for row in expanded])
    touch_raw = [row["journeys"] * (len(row["channels"]) + 1.18) for row in expanded]
    touchpoints = _allocate(touch_raw, TARGET_TOUCHPOINTS)
    revenue_raw = [
        row["conversions"] * (72_000 + 13_500 * row["quality"])
        if row["conversions"] and row["targetEvent"] != "App Install" else 0
        for row in expanded
    ]
    revenues = _allocate(revenue_raw, TARGET_REVENUE)

    for index, row in enumerate(expanded):
        row["users"] = users[index]
        row["touchpoints"] = touchpoints[index]
        row["revenue"] = revenues[index]
        row.pop("quality")

    return {
        "meta": {
            "dataset": "Deterministic MTA demo data",
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "defaultTargetEvent": "Package Purchase",
            "lastUpdated": "2026-08-24T23:59:00+07:00",
            "currency": "IDR",
            "methodology": "Observed journey attribution; not incremental impact",
        },
        "rows": expanded,
    }


def write_mta_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_mta_dataset(), separators=(",", ":")), encoding="utf-8")
