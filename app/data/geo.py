"""Geo Intelligence demo data derived from the Campaign Performance rows.

Every campaign is geo-targeted to a subset of the 50 cities. Each campaign-week's spend,
impressions, sessions, purchases and revenue are split across its cities with exact integer
allocation, so national totals by channel, objective, media plan, placement and campaign
reconcile with the Campaign Performance page. Market metrics (addressable market, customer
base, potential leads, readiness, growth, ARPU, churn) remain modeled city attributes.
"""

from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
import json
import math
import random

from .campaign_performance import generate_campaign_dataset
from .master import CHANNELS, DEFAULT_END, DEFAULT_START, GEO_HISTORY_START, allocate_integers

HISTORY_START = GEO_HISTORY_START
ROW_FIELDS = ["date", "city", "campaign", "spend", "impressions", "sessions", "interested", "purchases", "revenue"]
CITY_COUNT_BY_PLAN = {
    "AON-5G": (5, 9),
    "AON-SEM": (9, 15),
    "AON-Social": (7, 13),
    "AON-App Growth": (8, 14),
    "AON-Retargeting": (4, 8),
}
MIN_CAMPAIGNS_PER_CITY = 3

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




def _bucket_starts():
    """Weekly buckets from 1 Jan; a bucket always starts on the default start date."""
    starts = []
    current = HISTORY_START
    while current < DEFAULT_START:
        starts.append(current)
        current += timedelta(days=7)
    current = DEFAULT_START
    while current <= DEFAULT_END:
        starts.append(current)
        current += timedelta(days=7)
    return starts


def _bucket_index(starts):
    lookup = {}
    for index, start in enumerate(starts):
        end = starts[index + 1] - timedelta(days=1) if index + 1 < len(starts) else DEFAULT_END
        day = start
        while day <= end:
            lookup[day.isoformat()] = index
            day += timedelta(days=1)
    return lookup


def _weighted_sample(rng, candidates, weights, count):
    chosen = []
    pool = list(zip(candidates, weights))
    for _ in range(min(count, len(pool))):
        total = sum(weight for _, weight in pool)
        pick = rng.uniform(0, total)
        running = 0
        for index, (candidate, weight) in enumerate(pool):
            running += weight
            if running >= pick:
                chosen.append(candidate)
                pool.pop(index)
                break
    return chosen


def _assign_cities(rng, campaigns, cities, city_weight):
    assignment = {}
    indices = list(range(len(cities)))
    for campaign in campaigns:
        low, high = CITY_COUNT_BY_PLAN[campaign["mediaPlan"]]
        count = rng.randint(low, high)
        if campaign["mediaPlan"] == "AON-5G":
            eligible = [index for index in indices if cities[index]["networkReadiness"] >= 75]
        else:
            eligible = indices
        weights = [city_weight[index] ** 0.55 for index in eligible]
        assignment[campaign["id"]] = set(_weighted_sample(rng, eligible, weights, count))
    coverage = defaultdict(int)
    for selected in assignment.values():
        for index in selected:
            coverage[index] += 1
    ordered_campaigns = [campaign for campaign in campaigns if campaign["mediaPlan"] != "AON-5G"]
    for index in indices:
        while coverage[index] < MIN_CAMPAIGNS_PER_CITY:
            campaign = ordered_campaigns[rng.randrange(len(ordered_campaigns))]
            if index not in assignment[campaign["id"]]:
                assignment[campaign["id"]].add(index)
                coverage[index] += 1
    return {key: sorted(value) for key, value in assignment.items()}


def _rake_shares(assignment, campaign_spend, city_target, iterations=80):
    """Iterative proportional fitting on the sparse campaign x city matrix."""
    weights = {cid: {city: 1.0 for city in cities} for cid, cities in assignment.items()}
    for _ in range(iterations):
        for cid, row in weights.items():
            total = sum(row.values())
            scale = campaign_spend[cid] / total if total else 0
            for city in row:
                row[city] *= scale
        column = defaultdict(float)
        for row in weights.values():
            for city, value in row.items():
                column[city] += value
        for row in weights.values():
            for city in row:
                if column[city]:
                    row[city] *= city_target[city] / column[city]
    shares = {}
    for cid, row in weights.items():
        total = sum(row.values())
        shares[cid] = {city: value / total for city, value in row.items()}
    return shares


def generate_geo_dataset():
    rng = random.Random(20260918)
    cities = _build_cities(rng)
    campaign_data = generate_campaign_dataset()
    campaigns = campaign_data["campaigns"]

    city_weight = [
        (city["potentialLeads"] * 0.48 + city["customerBase"] * 0.34 + city["addressable"] * 0.18) * city["mediaBias"]
        for city in cities
    ]
    assignment = _assign_cities(rng, campaigns, cities, city_weight)

    campaign_spend = defaultdict(float)
    for row in campaign_data["rows"]:
        if DEFAULT_START.isoformat() <= row[0] <= DEFAULT_END.isoformat():
            campaign_spend[row[1]] += row[2]
    total_spend = sum(campaign_spend.values())
    weight_total = sum(city_weight)
    city_target = {index: total_spend * weight / weight_total for index, weight in enumerate(city_weight)}
    spend_share = _rake_shares(assignment, campaign_spend, city_target)

    arpus = [city["arpu"] for city in cities]
    low_arpu, high_arpu = min(arpus), max(arpus)
    city_factors = []
    for city in cities:
        city_factors.append(
            {
                "revenue": city["efficiencyFactor"],
                "aov": 0.86 + 0.28 * (city["arpu"] - low_arpu) / max(high_arpu - low_arpu, 1),
                "cpm": 1.04 - city["demandFactor"] * 0.18,
                "ctr": 0.72 + city["demandFactor"] * 1.45,
                # Share of sessions that show purchase intent follows the city's modeled market demand signal.
                "intent": min(0.9, max(0.6, 0.55 + city["demandFactor"] * 0.75)),
            }
        )

    split = {}
    for cid, shares in spend_share.items():
        city_list = list(shares)
        spend_w = [shares[city] for city in city_list]
        revenue_w = [shares[city] * city_factors[city]["revenue"] for city in city_list]
        purchase_w = [revenue_w[i] / city_factors[city]["aov"] for i, city in enumerate(city_list)]
        impression_w = [shares[city] / city_factors[city]["cpm"] for city in city_list]
        session_w = [impression_w[i] * city_factors[city]["ctr"] for i, city in enumerate(city_list)]
        split[cid] = (city_list, spend_w, impression_w, session_w, purchase_w, revenue_w)

    starts = _bucket_starts()
    bucket_of = _bucket_index(starts)
    totals = defaultdict(lambda: [0, 0, 0, 0, 0])
    for row in campaign_data["rows"]:
        bucket = bucket_of.get(row[0])
        if bucket is None:
            continue
        values = totals[(bucket, row[1])]
        values[0] += row[2]   # spend
        values[1] += row[3]   # impressions
        values[2] += row[6]   # sessions
        values[3] += row[7]   # purchases
        values[4] += row[8]   # revenue

    rows = []
    for (bucket, cid), (spend, impressions, sessions, purchases, revenue) in sorted(totals.items()):
        city_list, spend_w, impression_w, session_w, purchase_w, revenue_w = split[cid]
        spend_parts = allocate_integers(spend_w, spend)
        impression_parts = allocate_integers(impression_w, impressions)
        session_parts = allocate_integers(session_w, sessions)
        purchase_parts = allocate_integers(purchase_w, purchases)
        revenue_parts = allocate_integers(revenue_w, revenue)
        for i, city in enumerate(city_list):
            if not spend_parts[i] and not revenue_parts[i]:
                continue
            interested = round(session_parts[i] * city_factors[city]["intent"])
            rows.append([
                starts[bucket].isoformat(), city, cid, spend_parts[i], impression_parts[i],
                session_parts[i], interested, purchase_parts[i], revenue_parts[i],
            ])

    public_cities = [
        {key: value for key, value in city.items() if key not in {"mediaBias", "demandFactor", "efficiencyFactor", "index"}}
        for city in cities
    ]
    public_campaigns = [
        {key: campaign[key] for key in ("id", "campaign", "product", "mediaPlan", "channel", "placement", "funnel")}
        for campaign in campaigns
    ]
    return {
        "meta": {
            "generatedAt": "2026-08-25T00:30:00+07:00",
            "historyStart": HISTORY_START.isoformat(),
            "defaultStart": DEFAULT_START.isoformat(),
            "defaultEnd": DEFAULT_END.isoformat(),
            "product": "Prepaid",
            "grain": "City × Campaign × Week",
            "rowFields": ROW_FIELDS,
            "campaignSource": "Same campaign master list and daily rows as Campaign Performance",
            "methodology": "Market potential is modeled demo data; media outcomes are observed demo signals and not incremental impact.",
        },
        "channels": [{"name": name, "color": config["color"]} for name, config in CHANNELS.items()],
        "campaigns": public_campaigns,
        "cities": public_cities,
        "rows": rows,
    }


def write_geo_dataset(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(generate_geo_dataset(), separators=(",", ":")), encoding="utf-8")
