from collections import defaultdict
import json
import math
import random

from .master import (
    CAMPAIGN_OBJECTIVES,
    CHANNELS,
    DEFAULT_END,
    DEFAULT_START,
    HISTORY_START,
    LAST_UPDATED,
    MEDIA_PLANS,
    build_campaigns,
    date_range,
)

# Backwards-compatible aliases used by other modules and tests.
CHANNEL_CONFIG = CHANNELS
ROW_FIELDS = ["date", "campaign", "spend", "impressions", "videoViews", "clicks", "sessions", "purchases", "revenue"]

FUNNEL_SPEND = {"Awareness": 0.88, "Consideration": 1.0, "Conversion": 1.16, "Social Media Engagement": 0.96}
FUNNEL_CTR = {"Awareness": 0.76, "Consideration": 1.0, "Conversion": 1.22, "Social Media Engagement": 1.1}
FUNNEL_CVR = {"Awareness": 0.54, "Consideration": 0.82, "Conversion": 1.34, "Social Media Engagement": 0.68}
# Conversion-led campaigns sell slightly larger packages; awareness campaigns slightly smaller ones.
FUNNEL_AOV = {"Awareness": 0.94, "Consideration": 1.0, "Conversion": 1.06, "Social Media Engagement": 0.97}


def _is_video(placement):
    return "Video" in placement or "YouTube" in placement


def _generate_raw_rows(campaigns, rng):
    dates = list(date_range(HISTORY_START, DEFAULT_END))
    default_days = (DEFAULT_END - DEFAULT_START).days + 1
    rows = []
    for campaign in campaigns:
        config = CHANNELS[campaign["channel"]]
        base_spend = config["spend"] / config["count"] / default_days
        for day_index, current_date in enumerate(dates):
            weekday = 0.84 if current_date.weekday() >= 5 else 1.05
            seasonal = 1 + 0.13 * math.sin((day_index / 28) * math.tau + campaign["phase"])
            growth = 0.86 + 0.23 * (day_index / max(len(dates) - 1, 1))
            pulse = 1.22 if current_date.day in {1, 2, 15, 16, 25} else 1.0
            spend = (
                base_spend * campaign["weight"] * FUNNEL_SPEND[campaign["funnel"]]
                * weekday * seasonal * growth * pulse * rng.uniform(0.82, 1.18)
            )
            cpm = config["cpm"] * rng.uniform(0.88, 1.14)
            impressions = max(1, round(spend / cpm * 1000))
            view_modifier = 1.2 if _is_video(campaign["placement"]) else 0.68
            video_views = round(impressions * config["view_rate"] * view_modifier * rng.uniform(0.9, 1.08))
            clicks = max(1, round(impressions * config["ctr"] * FUNNEL_CTR[campaign["funnel"]] * campaign["quality"] * rng.uniform(0.88, 1.12)))
            sessions = max(1, round(clicks * config["session_rate"] * rng.uniform(0.92, 1.07)))
            purchases = sessions * config["conversion_rate"] * FUNNEL_CVR[campaign["funnel"]] * campaign["quality"] * rng.uniform(0.88, 1.12)
            aov = config["aov"] * FUNNEL_AOV[campaign["funnel"]] * rng.uniform(0.94, 1.06)
            rows.append(
                {
                    "date": current_date,
                    "campaign": campaign["id"],
                    "channel": campaign["channel"],
                    "spend": spend,
                    "impressions": impressions,
                    "videoViews": video_views,
                    "clicks": clicks,
                    "sessions": sessions,
                    "purchases": purchases,
                    "aov": aov,
                }
            )
    return rows


def _in_default(row_date):
    return DEFAULT_START <= row_date <= DEFAULT_END


def generate_campaign_dataset():
    rng = random.Random(20260824)
    campaigns = _build_campaign_list(rng)
    rows = _generate_raw_rows(campaigns, rng)

    # 1) Spend reconciles exactly to the channel spend of the default window.
    raw_spend = defaultdict(float)
    raw_purchases = defaultdict(float)
    for row in rows:
        if _in_default(row["date"]):
            raw_spend[row["channel"]] += row["spend"]
            raw_purchases[row["channel"]] += row["purchases"]
    spend_scale = {channel: CHANNELS[channel]["spend"] / raw_spend[channel] for channel in CHANNELS}

    # 2) Purchases follow observed revenue / package value, so revenue = purchases x AOV.
    target_purchases = {
        channel: CHANNELS[channel]["observed_roas"] * CHANNELS[channel]["spend"] / CHANNELS[channel]["aov"]
        for channel in CHANNELS
    }
    purchase_scale = {channel: target_purchases[channel] / raw_purchases[channel] for channel in CHANNELS}

    for row in rows:
        channel = row["channel"]
        row["spend"] = round(row["spend"] * spend_scale[channel])
        row["purchases"] = max(1, min(row["sessions"], round(row["purchases"] * purchase_scale[channel])))
        row["revenue"] = row["purchases"] * row["aov"]

    # 3) Revenue reconciles exactly to observed ROAS x spend (tiny scale, AOV stays realistic).
    raw_revenue = defaultdict(float)
    for row in rows:
        if _in_default(row["date"]):
            raw_revenue[row["channel"]] += row["revenue"]
    revenue_scale = {
        channel: CHANNELS[channel]["observed_roas"] * CHANNELS[channel]["spend"] / raw_revenue[channel]
        for channel in CHANNELS
    }
    for row in rows:
        row["revenue"] = round(row["revenue"] * revenue_scale[row["channel"]])

    _fix_default_totals(rows)

    # Planned budget per campaign proportional to its actual default-window spend.
    campaign_default_spend = defaultdict(float)
    for row in rows:
        if _in_default(row["date"]):
            campaign_default_spend[row["campaign"]] += row["spend"]
    for channel, config in CHANNELS.items():
        channel_campaigns = [item for item in campaigns if item["channel"] == channel]
        actual_total = sum(campaign_default_spend[item["id"]] for item in channel_campaigns)
        for campaign in channel_campaigns:
            share = campaign_default_spend[campaign["id"]] / actual_total if actual_total else 0
            campaign["plannedBudget"] = round(config["planned"] * share)

    target_rows = _build_targets(campaigns)

    for campaign in campaigns:
        for key in ("weight", "phase", "quality"):
            campaign.pop(key)

    compact_rows = [
        [row["date"].isoformat(), row["campaign"], row["spend"], row["impressions"], row["videoViews"],
         row["clicks"], row["sessions"], row["purchases"], row["revenue"]]
        for row in rows
    ]
    compact_targets = [
        [row["date"].isoformat(), row["campaign"], row["spend"], row["impressions"], row["videoViews"],
         row["clicks"], row["sessions"], row["purchases"], row["revenue"]]
        for row in target_rows
    ]

    return {
        "meta": {
            "dataset": "Deterministic demo data (master model)",
            "historyStart": HISTORY_START.isoformat(),
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "lastUpdated": LAST_UPDATED,
            "rowFields": ROW_FIELDS,
            "currency": "IDR",
            "targetSource": "Illustrative media plan and business targets",
        },
        "campaigns": campaigns,
        "rows": compact_rows,
        "targets": compact_targets,
    }


def _build_campaign_list(rng):
    return build_campaigns(rng)


def _fix_default_totals(rows):
    """Absorb rounding so default-window spend and revenue match the channel totals exactly."""
    for channel, config in CHANNELS.items():
        channel_rows = [row for row in rows if row["channel"] == channel and _in_default(row["date"])]
        anchor = max(channel_rows, key=lambda row: row["spend"])
        anchor["spend"] += config["spend"] - sum(row["spend"] for row in channel_rows)
        target_revenue = round(config["observed_roas"] * config["spend"])
        anchor["revenue"] += target_revenue - sum(row["revenue"] for row in channel_rows)


def _build_targets(campaigns):
    target_rows = []
    default_dates = list(date_range(DEFAULT_START, DEFAULT_END))
    for campaign in campaigns:
        config = CHANNELS[campaign["channel"]]
        schedule = []
        for current_date in default_dates:
            day_index = (current_date - HISTORY_START).days
            weekday = 0.88 if current_date.weekday() >= 5 else 1.04
            seasonal = 1 + 0.06 * math.sin((day_index / 28) * math.tau + campaign["phase"])
            pulse = 1.10 if current_date.day in {1, 2, 15, 16, 25} else 1.0
            schedule.append(weekday * seasonal * pulse)
        total_weight = sum(schedule) or 1
        view_modifier = 1.2 if _is_video(campaign["placement"]) else 0.68
        target_aov = config["aov"] * FUNNEL_AOV[campaign["funnel"]]
        for current_date, weight in zip(default_dates, schedule):
            target_spend = campaign["plannedBudget"] * weight / total_weight
            impressions = max(1, round(target_spend / config["cpm"] * 1000))
            clicks = max(1, round(impressions * config["ctr"] * FUNNEL_CTR[campaign["funnel"]]))
            sessions = max(1, round(clicks * config["session_rate"]))
            target_revenue = target_spend * config["target_roas"]
            target_rows.append(
                {
                    "date": current_date,
                    "campaign": campaign["id"],
                    "spend": round(target_spend),
                    "impressions": impressions,
                    "videoViews": round(impressions * config["view_rate"] * view_modifier),
                    "clicks": clicks,
                    "sessions": sessions,
                    "purchases": max(1, round(target_revenue / target_aov)),
                    "revenue": round(target_revenue),
                }
            )
    return target_rows


def write_campaign_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_campaign_dataset(), separators=(",", ":")), encoding="utf-8")
