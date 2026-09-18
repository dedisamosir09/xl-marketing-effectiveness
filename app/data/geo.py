from datetime import date, timedelta
from pathlib import Path
import json
import math
import random


HISTORY_START = date(2026, 1, 1)
DEFAULT_START = date(2026, 4, 3)
DEFAULT_END = date(2026, 8, 24)

CHANNELS = {
    "Google": {"spend": 9_364_500_000, "roas": 2.3167, "cpm": 9_200, "ctr": 0.018, "color": "#3156d3"},
    "Meta": {"spend": 4_607_800_000, "roas": 3.4732, "cpm": 12_600, "ctr": 0.012, "color": "#7355dc"},
    "TikTok": {"spend": 5_178_200_000, "roas": 2.0566, "cpm": 7_400, "ctr": 0.0095, "color": "#ec0a68"},
    "X": {"spend": 317_900_000, "roas": 5.1675, "cpm": 15_800, "ctr": 0.0075, "color": "#18a2bd"},
}

MEDIA_PLANS = ["AON-5G", "AON-SEM", "AON-Social", "AON-App Growth", "AON-Retargeting"]
OBJECTIVES = ["Awareness", "Consideration", "Conversion", "Social Media Engagement"]
PLACEMENTS = {
    "Google": ["Search-CPC", "App Install-CPI-Android", "Performance Max-CPA", "YouTube-CPV"],
    "Meta": ["App Engagement-CPA", "App Install-CPI-Android", "Video Views-CPV", "Traffic-CPC"],
    "TikTok": ["Video Views-CPV", "App Install-CPI-Android", "App Engagement-CPA", "Traffic-CPC"],
    "X": ["Website Traffic-CPC", "Video Views-CPV", "App Engagement-CPA"],
}

# City, province, island group, latitude, longitude, indicative urban population.
CITY_CONFIG = [
    ("Jakarta", "DKI Jakarta", "Java", -6.20, 106.85, 10_680_000),
    ("Surabaya", "East Java", "Java", -7.26, 112.75, 2_970_000),
    ("Bandung", "West Java", "Java", -6.92, 107.62, 2_530_000),
    ("Medan", "North Sumatra", "Sumatra", 3.59, 98.67, 2_490_000),
    ("Bekasi", "West Java", "Java", -6.24, 107.00, 2_460_000),
    ("Tangerang", "Banten", "Java", -6.18, 106.63, 1_930_000),
    ("Depok", "West Java", "Java", -6.40, 106.82, 2_120_000),
    ("Semarang", "Central Java", "Java", -6.99, 110.42, 1_690_000),
    ("Palembang", "South Sumatra", "Sumatra", -2.99, 104.76, 1_720_000),
    ("Makassar", "South Sulawesi", "Sulawesi", -5.15, 119.43, 1_470_000),
    ("Batam", "Riau Islands", "Sumatra", 1.13, 104.05, 1_310_000),
    ("Pekanbaru", "Riau", "Sumatra", 0.51, 101.45, 1_140_000),
    ("Bogor", "West Java", "Java", -6.60, 106.80, 1_120_000),
    ("Bandar Lampung", "Lampung", "Sumatra", -5.43, 105.26, 1_070_000),
    ("Padang", "West Sumatra", "Sumatra", -0.95, 100.35, 930_000),
    ("Malang", "East Java", "Java", -7.98, 112.63, 890_000),
    ("Denpasar", "Bali", "Bali & Nusa Tenggara", -8.65, 115.22, 900_000),
    ("Samarinda", "East Kalimantan", "Kalimantan", -0.50, 117.15, 850_000),
    ("Banjarmasin", "South Kalimantan", "Kalimantan", -3.32, 114.59, 680_000),
    ("Balikpapan", "East Kalimantan", "Kalimantan", -1.24, 116.86, 710_000),
    ("Pontianak", "West Kalimantan", "Kalimantan", -0.03, 109.34, 670_000),
    ("Manado", "North Sulawesi", "Sulawesi", 1.47, 124.84, 460_000),
    ("Yogyakarta", "DI Yogyakarta", "Java", -7.80, 110.37, 420_000),
    ("Surakarta", "Central Java", "Java", -7.57, 110.82, 530_000),
    ("Cirebon", "West Java", "Java", -6.73, 108.55, 340_000),
    ("Serang", "Banten", "Java", -6.12, 106.15, 700_000),
    ("Tasikmalaya", "West Java", "Java", -7.33, 108.22, 730_000),
    ("Jambi", "Jambi", "Sumatra", -1.61, 103.61, 620_000),
    ("Bengkulu", "Bengkulu", "Sumatra", -3.80, 102.27, 390_000),
    ("Banda Aceh", "Aceh", "Sumatra", 5.55, 95.32, 260_000),
    ("Mataram", "West Nusa Tenggara", "Bali & Nusa Tenggara", -8.58, 116.12, 450_000),
    ("Kupang", "East Nusa Tenggara", "Bali & Nusa Tenggara", -10.18, 123.61, 460_000),
    ("Jayapura", "Papua", "Papua", -2.53, 140.72, 410_000),
    ("Ambon", "Maluku", "Maluku", -3.65, 128.19, 350_000),
    ("Ternate", "North Maluku", "Maluku", 0.79, 127.38, 210_000),
    ("Sorong", "Southwest Papua", "Papua", -0.88, 131.26, 290_000),
    ("Palu", "Central Sulawesi", "Sulawesi", -0.90, 119.87, 390_000),
    ("Kendari", "Southeast Sulawesi", "Sulawesi", -3.99, 122.51, 360_000),
    ("Gorontalo", "Gorontalo", "Sulawesi", 0.54, 123.06, 200_000),
    ("Tarakan", "North Kalimantan", "Kalimantan", 3.30, 117.63, 250_000),
    ("Banjarbaru", "South Kalimantan", "Kalimantan", -3.44, 114.83, 280_000),
    ("Purwokerto", "Central Java", "Java", -7.42, 109.23, 310_000),
    ("Kediri", "East Java", "Java", -7.82, 112.01, 300_000),
    ("Madiun", "East Java", "Java", -7.63, 111.52, 210_000),
    ("Jember", "East Java", "Java", -8.17, 113.70, 370_000),
    ("Sukabumi", "West Java", "Java", -6.92, 106.93, 360_000),
    ("Karawang", "West Java", "Java", -6.31, 107.30, 310_000),
    ("Cilegon", "Banten", "Java", -6.00, 106.04, 450_000),
    ("Pangkal Pinang", "Bangka Belitung", "Sumatra", -2.13, 106.11, 230_000),
    ("Tanjung Pinang", "Riau Islands", "Sumatra", 0.92, 104.46, 240_000),
]


def _date_range(start, end, step_days=1):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=step_days)


def _slug(value):
    return value.lower().replace(" & ", "-").replace(" ", "-")


def _build_cities(rng):
    cities = []
    max_population = max(city[5] for city in CITY_CONFIG)
    for index, (name, province, region, latitude, longitude, population) in enumerate(CITY_CONFIG):
        size = math.log1p(population) / math.log1p(max_population)
        digital = min(1, 0.45 + size * 0.48 + rng.uniform(-0.08, 0.08))
        addressable = round(population * (0.58 + 0.22 * digital))
        penetration = min(0.55, max(0.13, 0.19 + digital * 0.24 + rng.uniform(-0.07, 0.06)))
        customer_base = round(addressable * penetration)
        intent = min(0.42, max(0.13, 0.16 + digital * 0.18 + rng.uniform(-0.05, 0.06)))
        potential_leads = round((addressable - customer_base) * intent)
        network_readiness = round(min(97, max(52, 58 + digital * 34 + rng.uniform(-9, 8))))
        growth = round(min(19.5, max(1.8, 4.5 + (1 - penetration) * 13 + rng.uniform(-3.8, 4.5))), 1)
        arpu = round((48_000 + digital * 38_000 + rng.uniform(-7_000, 8_000)) / 500) * 500
        high_value = round(customer_base * min(0.34, max(0.10, 0.12 + digital * 0.17 + rng.uniform(-0.03, 0.03))))
        churn_risk = round(min(8.5, max(1.3, 6.7 - digital * 4.2 + rng.uniform(-1.1, 1.3))), 1)
        media_bias = min(1.65, max(0.55, 0.76 + size * 0.55 + rng.uniform(-0.33, 0.35)))
        cities.append(
            {
                "id": _slug(name),
                "name": name,
                "province": province,
                "region": region,
                "lat": latitude,
                "lon": longitude,
                "population": population,
                "addressable": addressable,
                "customerBase": customer_base,
                "potentialLeads": potential_leads,
                "networkReadiness": network_readiness,
                "customerGrowth": growth,
                "arpu": arpu,
                "highValueCustomers": high_value,
                "churnRisk": churn_risk,
                "mediaBias": round(media_bias, 4),
                "demandFactor": round(intent * (0.82 + rng.uniform(0, 0.36)), 4),
                "efficiencyFactor": round(0.78 + digital * 0.35 + rng.uniform(-0.17, 0.16), 4),
                "index": index,
            }
        )
    return cities


def generate_geo_dataset():
    rng = random.Random(20260918)
    cities = _build_cities(rng)
    dates = sorted(set(_date_range(HISTORY_START, DEFAULT_END, 7)) | {DEFAULT_START, DEFAULT_END})
    default_periods = sum(DEFAULT_START <= current_date <= DEFAULT_END for current_date in dates)
    channel_names = list(CHANNELS)
    raw_rows = []

    total_weight = sum((city["potentialLeads"] * 0.48 + city["customerBase"] * 0.34 + city["addressable"] * 0.18) * city["mediaBias"] for city in cities)
    for city in cities:
        city_weight = ((city["potentialLeads"] * 0.48 + city["customerBase"] * 0.34 + city["addressable"] * 0.18) * city["mediaBias"]) / total_weight
        for day_index, current_date in enumerate(dates):
            weekday = 0.88 if current_date.weekday() >= 5 else 1.035
            seasonality = 1 + 0.12 * math.sin((day_index / 31) * math.tau + city["index"] * 0.21)
            pulse = 1.18 if current_date.day in {1, 2, 15, 16, 25} else 1
            for channel_index, channel in enumerate(channel_names):
                config = CHANNELS[channel]
                objective = OBJECTIVES[(day_index + city["index"] + channel_index) % len(OBJECTIVES)]
                media_plan = MEDIA_PLANS[(city["index"] * 2 + day_index // 2 + channel_index) % len(MEDIA_PLANS)]
                placement = PLACEMENTS[channel][(city["index"] + day_index // 2) % len(PLACEMENTS[channel])]
                campaign = f"{media_plan.replace('AON-', '').replace(' ', '-').upper()}_{channel.upper()}_{objective.replace(' ', '-').upper()}_{(city['index'] + channel_index) % 8 + 1:02d}"
                raw_spend = config["spend"] * city_weight / default_periods * weekday * seasonality * pulse * rng.uniform(0.84, 1.16)
                raw_rows.append(
                    {
                        "date": current_date,
                        "cityId": city["id"],
                        "product": "Prepaid",
                        "mediaPlan": media_plan,
                        "objective": objective,
                        "channel": channel,
                        "placement": placement,
                        "campaign": campaign,
                        "rawSpend": raw_spend,
                    }
                )

    default_totals = {channel: 0 for channel in CHANNELS}
    for row in raw_rows:
        if DEFAULT_START <= row["date"] <= DEFAULT_END:
            default_totals[row["channel"]] += row["rawSpend"]
    scales = {channel: CHANNELS[channel]["spend"] / default_totals[channel] for channel in CHANNELS}
    city_lookup = {city["id"]: city for city in cities}
    rows = []
    for index, raw in enumerate(raw_rows):
        city = city_lookup[raw["cityId"]]
        config = CHANNELS[raw["channel"]]
        spend = raw["rawSpend"] * scales[raw["channel"]]
        objective_factor = {"Awareness": 0.72, "Consideration": 0.92, "Conversion": 1.26, "Social Media Engagement": 0.84}[raw["objective"]]
        cpm = config["cpm"] * (1.04 - city["demandFactor"] * 0.18) * rng.uniform(0.91, 1.10)
        impressions = max(1, round(spend / cpm * 1000))
        ctr = config["ctr"] * (0.72 + city["demandFactor"] * 1.45) * rng.uniform(0.88, 1.12)
        sessions = max(1, round(impressions * ctr * rng.uniform(0.48, 0.64)))
        interested = max(1, round(sessions * rng.uniform(0.68, 0.84)))
        revenue = spend * config["roas"] * city["efficiencyFactor"] * objective_factor * rng.uniform(0.88, 1.12)
        aov = (245_000 + city["arpu"] * 1.35) * rng.uniform(0.91, 1.09)
        purchases = max(1, round(revenue / aov))
        rows.append(
            {
                "date": raw["date"].isoformat(),
                "cityId": raw["cityId"],
                "product": raw["product"],
                "mediaPlan": raw["mediaPlan"],
                "objective": raw["objective"],
                "channel": raw["channel"],
                "placement": raw["placement"],
                "campaign": raw["campaign"],
                "spend": round(spend),
                "impressions": impressions,
                "sessions": sessions,
                "interested": interested,
                "purchases": purchases,
                "revenue": round(revenue),
            }
        )

    public_cities = [{key: value for key, value in city.items() if key not in {"mediaBias", "demandFactor", "efficiencyFactor", "index"}} for city in cities]
    return {
        "meta": {
            "generatedAt": "2026-08-25T00:30:00+07:00",
            "historyStart": HISTORY_START.isoformat(),
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "product": "Prepaid",
            "grain": "City × Channel × Week",
            "methodology": "Market potential is modeled demo data; media outcomes are observed demo signals and not incremental impact.",
        },
        "channels": [{"name": name, **config} for name, config in CHANNELS.items()],
        "cities": public_cities,
        "rows": rows,
    }


def write_geo_dataset(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_geo_dataset(), separators=(",", ":")), encoding="utf-8")
