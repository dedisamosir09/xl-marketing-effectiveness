from collections import defaultdict
from datetime import date, timedelta
import json
import math
import random


HISTORY_START = date(2025, 11, 10)
DEFAULT_START = date(2026, 4, 3)
DEFAULT_END = date(2026, 8, 24)

CHANNEL_CONFIG = {
    "Google": {
        "count": 48,
        "spend": 9_364_500_000,
        "planned": 9_500_000_000,
        "roas": 2.3167,
        "cpm": 9_200,
        "ctr": 0.018,
        "session_rate": 0.62,
        "conversion_rate": 0.088,
        "view_rate": 0.31,
        "placements": ["Search-CPC", "App Install-CPI-Android", "Performance Max-CPA", "YouTube-CPV"],
    },
    "Meta": {
        "count": 36,
        "spend": 4_607_800_000,
        "planned": 4_400_000_000,
        "roas": 3.4732,
        "cpm": 12_600,
        "ctr": 0.012,
        "session_rate": 0.56,
        "conversion_rate": 0.073,
        "view_rate": 0.42,
        "placements": ["App Engagement-CPA", "App Install-CPI-Android", "Video Views-CPV", "Traffic-CPC"],
    },
    "TikTok": {
        "count": 42,
        "spend": 5_178_200_000,
        "planned": 5_300_000_000,
        "roas": 2.0566,
        "cpm": 7_400,
        "ctr": 0.0095,
        "session_rate": 0.49,
        "conversion_rate": 0.058,
        "view_rate": 0.54,
        "placements": ["Video Views-CPV", "App Install-CPI-Android", "App Engagement-CPA", "Traffic-CPC"],
    },
    "X": {
        "count": 12,
        "spend": 317_900_000,
        "planned": 350_000_000,
        "roas": 5.1675,
        "cpm": 15_800,
        "ctr": 0.0075,
        "session_rate": 0.45,
        "conversion_rate": 0.049,
        "view_rate": 0.28,
        "placements": ["Website Traffic-CPC", "Video Views-CPV", "App Engagement-CPA"],
    },
}

MEDIA_PLANS = ["AON-5G", "AON-SEM", "AON-Social", "AON-App Growth", "AON-Retargeting"]
CAMPAIGN_OBJECTIVES = ["Awareness", "Consideration", "Conversion", "Social Media Engagement"]
ROW_FIELDS = ["date", "campaign", "spend", "impressions", "videoViews", "clicks", "sessions", "purchases", "revenue"]


def _date_range(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _build_campaigns(rng):
    campaigns = []
    channel_number = defaultdict(int)
    global_number = 0

    for channel, config in CHANNEL_CONFIG.items():
        for index in range(config["count"]):
            global_number += 1
            channel_number[channel] += 1
            media_plan = MEDIA_PLANS[(index + len(channel)) % len(MEDIA_PLANS)]
            funnel = CAMPAIGN_OBJECTIVES[(index * 2 + global_number) % len(CAMPAIGN_OBJECTIVES)]
            placement = config["placements"][index % len(config["placements"])]
            plan_code = media_plan.replace("AON-", "").replace(" ", "-").upper()
            objective_code = funnel.replace(" ", "-").upper()
            campaign_name = f"{plan_code}_{channel.upper()}_{objective_code}_{channel_number[channel]:02d}"
            campaigns.append(
                {
                    "id": global_number - 1,
                    "campaign": campaign_name,
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


def generate_campaign_dataset():
    rng = random.Random(20260824)
    dates = list(_date_range(HISTORY_START, DEFAULT_END))
    campaigns = _build_campaigns(rng)
    rows = []

    for campaign in campaigns:
        config = CHANNEL_CONFIG[campaign["channel"]]
        base_spend = config["spend"] / config["count"] / ((DEFAULT_END - DEFAULT_START).days + 1)
        funnel_multiplier = {
            "Awareness": 0.88,
            "Consideration": 1.0,
            "Conversion": 1.16,
            "Social Media Engagement": 0.96,
        }[campaign["funnel"]]

        for day_index, current_date in enumerate(dates):
            weekday = 0.84 if current_date.weekday() >= 5 else 1.05
            seasonal = 1 + 0.13 * math.sin((day_index / 28) * math.tau + campaign["phase"])
            growth = 0.86 + 0.23 * (day_index / max(len(dates) - 1, 1))
            pulse = 1.22 if current_date.day in {1, 2, 15, 16, 25} else 1.0
            noise = rng.uniform(0.82, 1.18)
            spend = base_spend * campaign["weight"] * funnel_multiplier * weekday * seasonal * growth * pulse * noise

            cpm = config["cpm"] * rng.uniform(0.88, 1.14)
            impressions = max(1, round(spend / cpm * 1000))
            view_modifier = 1.2 if "Video" in campaign["placement"] or "YouTube" in campaign["placement"] else 0.68
            video_views = round(impressions * config["view_rate"] * view_modifier * rng.uniform(0.9, 1.08))
            ctr_modifier = {
                "Awareness": 0.76,
                "Consideration": 1.0,
                "Conversion": 1.22,
                "Social Media Engagement": 1.1,
            }[campaign["funnel"]]
            clicks = max(1, round(impressions * config["ctr"] * ctr_modifier * campaign["quality"] * rng.uniform(0.88, 1.12)))
            sessions = max(1, round(clicks * config["session_rate"] * rng.uniform(0.92, 1.07)))
            conversion_modifier = {
                "Awareness": 0.54,
                "Consideration": 0.82,
                "Conversion": 1.34,
                "Social Media Engagement": 0.68,
            }[campaign["funnel"]]
            purchases = max(1, round(sessions * config["conversion_rate"] * conversion_modifier * campaign["quality"] * rng.uniform(0.88, 1.12)))
            aov = rng.uniform(255_000, 385_000) * (1.08 if campaign["channel"] == "X" else 1)
            revenue = purchases * aov

            rows.append(
                {
                    "date": current_date,
                    "campaign": campaign["id"],
                    "spend": spend,
                    "impressions": impressions,
                    "videoViews": video_views,
                    "clicks": clicks,
                    "sessions": sessions,
                    "purchases": purchases,
                    "revenue": revenue,
                }
            )

    default_rows = [row for row in rows if DEFAULT_START <= row["date"] <= DEFAULT_END]
    spend_by_channel = defaultdict(float)
    revenue_by_channel = defaultdict(float)
    campaign_lookup = {item["id"]: item for item in campaigns}

    for row in default_rows:
        channel = campaign_lookup[row["campaign"]]["channel"]
        spend_by_channel[channel] += row["spend"]
        revenue_by_channel[channel] += row["revenue"]

    spend_scales = {channel: config["spend"] / spend_by_channel[channel] for channel, config in CHANNEL_CONFIG.items()}
    revenue_scales = {
        channel: (config["spend"] * config["roas"]) / revenue_by_channel[channel]
        for channel, config in CHANNEL_CONFIG.items()
    }

    campaign_default_spend = defaultdict(float)
    for row in rows:
        channel = campaign_lookup[row["campaign"]]["channel"]
        row["spend"] = round(row["spend"] * spend_scales[channel])
        row["revenue"] = round(row["revenue"] * revenue_scales[channel])
        if DEFAULT_START <= row["date"] <= DEFAULT_END:
            campaign_default_spend[row["campaign"]] += row["spend"]

    for channel, config in CHANNEL_CONFIG.items():
        channel_campaigns = [item for item in campaigns if item["channel"] == channel]
        actual_total = sum(campaign_default_spend[item["id"]] for item in channel_campaigns)
        for campaign in channel_campaigns:
            share = campaign_default_spend[campaign["id"]] / actual_total if actual_total else 0
            campaign["plannedBudget"] = round(config["planned"] * share)
            campaign.pop("weight")
            campaign.pop("phase")
            campaign.pop("quality")

    compact_rows = [
        [
            row["date"].isoformat(),
            row["campaign"],
            row["spend"],
            row["impressions"],
            row["videoViews"],
            row["clicks"],
            row["sessions"],
            row["purchases"],
            row["revenue"],
        ]
        for row in rows
    ]

    return {
        "meta": {
            "dataset": "Deterministic demo data",
            "historyStart": HISTORY_START.isoformat(),
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "lastUpdated": "2026-08-24T23:59:00+07:00",
            "rowFields": ROW_FIELDS,
            "currency": "IDR",
        },
        "campaigns": campaigns,
        "rows": compact_rows,
    }


def write_campaign_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_campaign_dataset(), separators=(",", ":")), encoding="utf-8")
