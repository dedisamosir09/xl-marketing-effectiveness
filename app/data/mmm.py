from datetime import date, timedelta
import json
import math


DEFAULT_START = date(2026, 4, 3)
DEFAULT_END = date(2026, 8, 24)

CHANNEL_CONFIG = {
    "Google": {
        "color": "#3156D3",
        "spend": 9_364_500_000,
        "iroas": 2.3167,
        "mroi": 1.22,
        "credibleLow": 1.85,
        "credibleHigh": 2.76,
        "halfLifeDays": 4.2,
        "headroom": 6,
        "action": "Maintain",
        "reason": "Healthy average return, but the next rupiah is approaching the portfolio threshold.",
        "alpha": 1.62,
    },
    "Meta": {
        "color": "#7355DC",
        "spend": 4_607_800_000,
        "iroas": 3.4732,
        "mroi": 2.78,
        "credibleLow": 2.71,
        "credibleHigh": 4.18,
        "halfLifeDays": 7.8,
        "headroom": 31,
        "action": "Scale",
        "reason": "Strong incremental return with material headroom before the response curve flattens.",
        "alpha": 1.48,
    },
    "TikTok": {
        "color": "#EC0A68",
        "spend": 5_178_200_000,
        "iroas": 2.0566,
        "mroi": 1.31,
        "credibleLow": 1.49,
        "credibleHigh": 2.72,
        "halfLifeDays": 6.4,
        "headroom": 14,
        "action": "Optimize",
        "reason": "Positive contribution remains, while marginal efficiency calls for a more selective scale-up.",
        "alpha": 1.56,
    },
    "X": {
        "color": "#16A4C2",
        "spend": 317_900_000,
        "iroas": 5.1675,
        "mroi": 3.92,
        "credibleLow": 2.55,
        "credibleHigh": 7.93,
        "halfLifeDays": 3.1,
        "headroom": 55,
        "action": "Test",
        "reason": "High directional return, but the small spend base and wide interval support controlled testing only.",
        "alpha": 1.42,
    },
}

COMPONENT_TOTALS = {
    "baseline": 77_800_000_000,
    "promotion": 8_250_000_000,
    "seasonality": 5_420_000_000,
    "other": 2_100_000_000,
}
ACTUAL_TOTAL = 144_120_000_000


def _date_range(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _allocate(weights, total):
    weight_total = sum(weights)
    values = [round(total * weight / weight_total) for weight in weights]
    values[-1] += total - sum(values)
    return values


def generate_mmm_dataset():
    dates = list(_date_range(DEFAULT_START, DEFAULT_END))
    day_count = len(dates)

    baseline_weights = []
    promotion_weights = []
    seasonality_weights = []
    other_weights = []
    channel_spend_weights = {channel: [] for channel in CHANNEL_CONFIG}
    channel_media_weights = {channel: [] for channel in CHANNEL_CONFIG}

    for index, current_date in enumerate(dates):
        progress = index / max(day_count - 1, 1)
        weekday = 0.91 if current_date.weekday() >= 5 else 1.04
        payday = 1.32 if current_date.day in {1, 2, 15, 16, 25, 26} else 0.92
        baseline_weights.append((0.94 + 0.13 * progress) * weekday)
        promotion_weights.append(payday * (1 + 0.13 * math.sin(index / 10.5)))
        seasonality_weights.append(1 + 0.24 * math.sin((index / day_count) * math.tau - 0.65))
        other_weights.append(1 + 0.08 * math.cos(index / 8.0))

        for channel_index, channel in enumerate(CHANNEL_CONFIG):
            pulse = 1.28 if (index + channel_index * 3) % (13 + channel_index * 2) < 3 else 0.89
            wave = 1 + 0.18 * math.sin(index / (6.5 + channel_index) + channel_index * 0.8)
            channel_spend_weights[channel].append(max(0.18, weekday * pulse * wave * (0.91 + 0.15 * progress)))
            lag = CHANNEL_CONFIG[channel]["halfLifeDays"]
            media_wave = 1 + 0.12 * math.sin((index - lag) / (8.3 + channel_index) + channel_index)
            channel_media_weights[channel].append(max(0.2, weekday * pulse * media_wave * (0.93 + 0.12 * progress)))

    components = {
        key: _allocate(weights, COMPONENT_TOTALS[key])
        for key, weights in {
            "baseline": baseline_weights,
            "promotion": promotion_weights,
            "seasonality": seasonality_weights,
            "other": other_weights,
        }.items()
    }
    channel_spend = {
        channel: _allocate(channel_spend_weights[channel], config["spend"])
        for channel, config in CHANNEL_CONFIG.items()
    }
    channel_media = {
        channel: _allocate(channel_media_weights[channel], round(config["spend"] * config["iroas"]))
        for channel, config in CHANNEL_CONFIG.items()
    }

    predicted = []
    for index in range(day_count):
        predicted.append(
            components["baseline"][index]
            + components["promotion"][index]
            + components["seasonality"][index]
            + components["other"][index]
            + sum(channel_media[channel][index] for channel in CHANNEL_CONFIG)
        )

    actual_weights = [
        value * (1 + 0.023 * math.sin(index / 4.1) - 0.014 * math.cos(index / 9.2))
        for index, value in enumerate(predicted)
    ]
    actual = _allocate(actual_weights, ACTUAL_TOTAL)

    rows = []
    for index, current_date in enumerate(dates):
        rows.append(
            {
                "date": current_date.isoformat(),
                "baseline": components["baseline"][index],
                "promotion": components["promotion"][index],
                "seasonality": components["seasonality"][index],
                "other": components["other"][index],
                "predicted": predicted[index],
                "actual": actual[index],
                "spend": {channel: channel_spend[channel][index] for channel in CHANNEL_CONFIG},
                "media": {channel: channel_media[channel][index] for channel in CHANNEL_CONFIG},
            }
        )

    channels = []
    for channel, config in CHANNEL_CONFIG.items():
        channels.append(
            {
                "name": channel,
                "color": config["color"],
                "currentSpend": config["spend"],
                "incrementalRevenue": round(config["spend"] * config["iroas"]),
                "iROAS": config["iroas"],
                "mROI": config["mroi"],
                "credibleLow": config["credibleLow"],
                "credibleHigh": config["credibleHigh"],
                "halfLifeDays": config["halfLifeDays"],
                "headroom": config["headroom"],
                "action": config["action"],
                "reason": config["reason"],
                "alpha": config["alpha"],
            }
        )

    return {
        "meta": {
            "dataset": "Deterministic MMM demo model",
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "lastUpdated": "2026-08-24T23:59:00+07:00",
            "product": "Prepaid",
            "businessKpis": ["Revenue"],
            "currency": "IDR",
            "methodology": "Bayesian MMM demo estimate; not platform attribution",
            "grain": "Channel × Day",
            "modelVersion": "Meridian POC v2",
            "trainingWindow": "03 Apr–24 Aug 2026 (144 days)",
            "trainR2": 0.9736,
            "testR2": 0.8733,
            "wMAPE": 8.7,
            "credibleLevel": 90,
        },
        "channels": channels,
        "rows": rows,
    }


def write_mmm_dataset(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_mmm_dataset(), separators=(",", ":")), encoding="utf-8")
