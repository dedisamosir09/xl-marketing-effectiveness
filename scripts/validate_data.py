"""Cross-module consistency report for the demo datasets.

Run: python scripts/validate_data.py
Exits with status 1 if any check fails.
"""

from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.data.campaign_performance import generate_campaign_dataset
from app.data.geo import generate_geo_dataset
from app.data.master import CHANNELS, DEFAULT_END, DEFAULT_START, MTA_TRACKED_COVERAGE, break_even_spend, current_monthly_spend, hill_parameters, response
from app.data.meridian_input import HISTORY_WEEKS, generate_meridian_input
from app.data.mmm import _daily_channel_spend, generate_mmm_dataset, load_meridian_output
from app.data.mta import generate_mta_dataset

START, END = DEFAULT_START.isoformat(), DEFAULT_END.isoformat()


def collect():
    campaign = generate_campaign_dataset()
    lookup = {item["id"]: item for item in campaign["campaigns"]}
    totals = defaultdict(lambda: defaultdict(int))
    daily_spend = defaultdict(lambda: defaultdict(int))
    for row in campaign["rows"]:
        channel = lookup[row[1]]["channel"]
        if START <= row[0] <= END:
            totals[channel]["spend"] += row[2]
            totals[channel]["purchases"] += row[7]
            totals[channel]["revenue"] += row[8]
            daily_spend[row[0]][channel] += row[2]
    return campaign, lookup, totals, daily_spend


def run_checks():
    campaign, lookup, campaign_totals, campaign_daily = collect()
    mmm = generate_mmm_dataset()
    geo = generate_geo_dataset()
    mta = generate_mta_dataset()
    checks = []

    def check(name, passed, detail):
        checks.append((name, bool(passed), detail))

    for channel, config in CHANNELS.items():
        totals = campaign_totals[channel]
        check(f"Campaign {channel}: spend = master spend", totals["spend"] == config["spend"], f"{totals['spend']:,}")
        roas = totals["revenue"] / totals["spend"]
        check(f"Campaign {channel}: observed ROAS = {config['observed_roas']}", abs(roas - config["observed_roas"]) < 1e-6, f"{roas:.4f}")
        aov = totals["revenue"] / totals["purchases"]
        check(f"Campaign {channel}: AOV within ±5% of Rp{config['aov']:,}", abs(aov / config["aov"] - 1) < 0.05, f"Rp{aov:,.0f}")

    mismatched_days = 0
    for row in mmm["rows"]:
        for channel in CHANNELS:
            if row["spend"][channel] != campaign_daily[row["date"]][channel]:
                mismatched_days += 1
    check("MMM daily spend = Campaign daily spend (all channels, 144 days)", mismatched_days == 0, f"{mismatched_days} mismatches")
    for channel in mmm["channels"]:
        media = sum(row["media"][channel["name"]] for row in mmm["rows"])
        observed = campaign_totals[channel["name"]]["revenue"]
        check(f"MMM {channel['name']}: incremental < observed revenue", media < observed, f"{media / observed:.0%} incremental share")
        check(f"MMM {channel['name']}: media rows sum to incremental total", media == channel["incrementalRevenue"], f"Rp{media:,}")

    geo_campaigns = {item["id"]: item for item in geo["campaigns"]}
    geo_totals = defaultdict(lambda: defaultdict(int))
    for row in geo["rows"]:
        if START <= row[0] <= END:
            channel = geo_campaigns[row[2]]["channel"]
            geo_totals[channel]["spend"] += row[3]
            geo_totals[channel]["purchases"] += row[7]
            geo_totals[channel]["revenue"] += row[8]
    for channel in CHANNELS:
        for metric in ("spend", "purchases", "revenue"):
            check(f"Geo {channel}: {metric} = Campaign", geo_totals[channel][metric] == campaign_totals[channel][metric], f"{geo_totals[channel][metric]:,}")
    check("Geo campaign list = Campaign list", [c["campaign"] for c in geo["campaigns"]] == [c["campaign"] for c in campaign["campaigns"]], f"{len(geo['campaigns'])} campaigns")

    last_touch = defaultdict(lambda: [0, 0])
    for row in mta["rows"]:
        if row["targetEvent"] == "Package Purchase":
            last_touch[row["channels"][-1]][0] += row["conversions"]
            last_touch[row["channels"][-1]][1] += row["revenue"]
    for channel in CHANNELS:
        expected_purchases = round(campaign_totals[channel]["purchases"] * MTA_TRACKED_COVERAGE)
        expected_revenue = round(campaign_totals[channel]["revenue"] * MTA_TRACKED_COVERAGE)
        check(f"MTA {channel}: last-touch purchases = 40% x Campaign", last_touch[channel][0] == expected_purchases, f"{last_touch[channel][0]:,}")
        check(f"MTA {channel}: last-touch revenue = 40% x Campaign", last_touch[channel][1] == expected_revenue, f"Rp{last_touch[channel][1]:,}")
    campaign_names = {item["campaign"] for item in campaign["campaigns"]}
    check("MTA campaigns all exist in Campaign list", all(row["campaign"] in campaign_names for row in mta["rows"]), "")
    # Journey paths: each ad combination reaches the app in several ways and drops at several points.
    route_mix = defaultdict(lambda: (set(), set(), set()))
    for row in mta["rows"]:
        if row["targetEvent"] == "App Install":
            continue
        rest = row["endToEndPath"][len(row["channels"]):]
        entries, browses, results = route_mix[tuple(row["channels"])]
        entries.add(rest[0])
        if len(rest) > 2:
            browses.add(rest[1])
        results.add(rest[-1] if len(rest) > 2 else "Bounce")
    check("MTA journeys: every ad combination has 2+ entry, 3+ browse and 4+ result steps",
          all(len(e) >= 2 and len(b) >= 3 and len(r) >= 4 for e, b, r in route_mix.values()), f"{len(route_mix)} combinations")
    check("MTA journeys: every journey ends converted or at one drop point",
          all(row["conversions"] in (0, row["journeys"]) for row in mta["rows"]), "")

    # ---- Google Meridian training data and fit ----
    meridian_input = generate_meridian_input()
    rows = meridian_input["rows"]
    check("Meridian input: 20 geos x 104 weeks", len(rows) == 20 * 104 and len({r["geo"] for r in rows}) == 20, f"{len(rows)} rows")
    weekly = defaultdict(lambda: defaultdict(float))
    for row in rows:
        for channel in CHANNELS:
            weekly[row["time"]][channel] += row[f"{channel.lower()}_spend"]
    all_daily, _, _ = _daily_channel_spend()
    mismatched = 0
    for week, source in zip(sorted(weekly), meridian_input["weekSource"]):
        if source != "campaign":
            continue
        start = date.fromisoformat(week)
        for channel in CHANNELS:
            expected = sum(all_daily[(start + timedelta(days=d)).isoformat()][channel] for d in range(7)) / 1e6
            if abs(weekly[week][channel] - expected) > 0.02:  # CSV rounds each geo to IDR 1,000
                mismatched += 1
    campaign_weeks = meridian_input["weekSource"].count("campaign")
    check(f"Meridian input: national weekly spend = Campaign ({campaign_weeks} weeks with campaign rows)", mismatched == 0, f"{mismatched} mismatches")

    output = load_meridian_output()
    check("Meridian output file present (app/data/meridian_output.json)", output is not None, "")
    if output:
        meta = output["meta"]
        check("Meridian fit: full sampler run (not --quick)", not meta["quickRun"], f"{meta['sampler']}")
        check("Meridian fit: converged (max R-hat < 1.2)", meta["maxRhat"] < 1.2, f"max R-hat {meta['maxRhat']:.3f}")
        check("Meridian fit: national R2 > 0.9", meta["accuracy"]["national"]["R_Squared"] > 0.9, f"{meta['accuracy']['national']['R_Squared']:.3f}")
        mmm_curves = {channel["name"]: channel["curve"] for channel in mmm["channels"]}
        for channel, fitted in output["channels"].items():
            curve = fitted["monthlyCurve"]
            check(f"MMM {channel}: page curve = Meridian monthly curve", round(curve["k"]) == mmm_curves[channel]["k"] and round(curve["m"]) == mmm_curves[channel]["m"], f"alpha {curve['alpha']:.2f}")
            check(f"Meridian {channel}: monthly Hill fit R2 > 0.99", curve["fitR2"] > 0.99, f"{curve['fitR2']:.4f}")
        # Planning range Rp0-10B/month with Meridian's default +/-30% guardrails: the highest spend
        # any channel can get is 1.3 x (10B / current budget) x its current spend.
        cap = mmm["meta"]["planningCapMonthly"]
        total_current = sum(channel["currentMonthlySpend"] for channel in mmm["channels"])
        planner_max = cap / total_current * (1 + mmm["meta"]["guardrailPct"] / 100)
        for channel in mmm["channels"]:
            name = channel["name"]
            ratio = (channel["breakEvenMonthlySpend"] or 0) / channel["currentMonthlySpend"]
            check(f"MMM {name}: planner max ({planner_max:.2f}x current at Rp10B) below Meridian break-even", ratio > planner_max * 1.1, f"break-even {ratio:.2f}x current")
            observed = output["channels"][name].get("observedSpend") or {}
            check(f"Meridian {name}: planner spend inside the training data (p99 per-capita spend)", observed.get("p99", 0) >= planner_max, f"data up to {observed.get('p99', 0):.2f}x current")
            ec, prior = output["channels"][name]["hill"]["ec"], (output["channels"][name].get("hillPrior") or {}).get("ec")
            narrowing = (prior["hi"] - prior["lo"]) / (ec["hi"] - ec["lo"]) if prior else 0
            if channel["currentMonthlySpend"] / total_current >= mmm["meta"]["smallChannelShare"]:
                # EC trades off against beta, so its interval stays wider than the curve's own uncertainty;
                # the recovery check below tests the curve itself.
                check(f"Meridian {name}: EC posterior interval clearly narrower than the prior (>= 1.5x)", narrowing >= 1.5, f"{narrowing:.1f}x narrower")
                truth = hill_parameters(name)
                truth_current = current_monthly_spend(name)
                truth_be = break_even_spend(truth) / truth_current
                fitted_curve = output["channels"][name]["monthlyCurve"]
                at_max = response(fitted_curve, planner_max * channel["currentMonthlySpend"]) / response(truth, planner_max * truth_current) - 1
                check(f"Meridian {name}: break-even and curve at planner max within 25% of ground truth", abs(ratio / truth_be - 1) <= 0.25 and abs(at_max) <= 0.25, f"break-even {ratio:.2f}x vs truth {truth_be:.2f}x; incremental at {planner_max:.2f}x {at_max:+.0%}")
            else:
                # Channels under 5% of budget carry too little signal to pin down saturation; the page labels them "Test & learn".
                check(f"Meridian {name}: small channel ({channel['currentMonthlySpend'] / total_current:.1%} of budget) labelled Test & learn", channel["signal"] == "Test & learn", f"EC interval only {narrowing:.1f}x narrower than prior")
    return checks


def main():
    checks = run_checks()
    failed = [item for item in checks if not item[1]]
    for name, passed, detail in checks:
        print(f"{'PASS' if passed else 'FAIL'}  {name}  {detail}")
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
