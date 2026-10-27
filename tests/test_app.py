import unittest
from pathlib import Path

from app.navigation import MENU_ITEMS
from app.renderer import render_page
from app.streamlit_adapter import build_embedded_page, build_streamlit_dashboard
from app.data.campaign_performance import DEFAULT_END, DEFAULT_START, generate_campaign_dataset
from app.data.mta import generate_mta_dataset
from app.data.mmm import generate_mmm_dataset
from app.data.geo import DEFAULT_END as GEO_DEFAULT_END, DEFAULT_START as GEO_DEFAULT_START, generate_geo_dataset


class DashboardRendererTest(unittest.TestCase):
    def test_streamlit_adapter_builds_self_contained_modules(self):
        for item in MENU_ITEMS:
            page = build_embedded_page(item["key"])
            self.assertIn("XL SMART", page)
            self.assertIn(f'?module={item["key"]}', page)
            self.assertNotIn('src="/static/', page)
            self.assertNotIn('href="/static/', page)
            self.assertNotIn(f'/static/data/', page)

    def test_streamlit_dashboard_routes_inside_iframe_sandbox(self):
        page = build_streamlit_dashboard("campaign-performance")
        self.assertIn("XL SMART", page)
        self.assertNotIn('target="_top"', page)
        self.assertNotIn('href="/static/', page)
        self.assertNotIn('src="/static/', page)
        self.assertNotIn('/static/data/', page)
        for item in MENU_ITEMS:
            self.assertIn(f'data-dashboard-page="{item["key"]}"', page)
            self.assertIn(f'data-dashboard-route="{item["key"]}"', page)
            self.assertIn(item["label"], page)

    def test_all_dashboard_pages_render(self):
        for item in MENU_ITEMS:
            page = render_page(item["key"])
            self.assertIn("XL SMART", page)
            self.assertIn("xl-smart-logo.webp", page)
            self.assertNotIn("xl-smart-mark.svg", page)
            self.assertIn(item["label"], page)

    def test_mta_page_has_one_active_navigation_item(self):
        page = render_page("mta")
        self.assertEqual(page.count('aria-current="page"'), 1)
        self.assertIn("Multi Touch Attribution (MTA)", page)
        self.assertIn("data-mta-dashboard", page)
        self.assertIn("data-journey-visual", page)
        self.assertIn("End-to-End User Journey Explorer", page)
        self.assertIn("Channel Role Analysis", page)
        self.assertIn("Attribution Model Comparison", page)
        self.assertNotIn("Observed transitions", page)
        self.assertNotIn("Channel Interaction Heatmap", page)
        self.assertNotIn("data-interaction-heatmap", page)
        self.assertNotIn("Measurement reliability", page)
        self.assertNotIn("MTA Data Quality", page)

    def test_campaign_page_contains_interactive_dashboard_regions(self):
        page = render_page("campaign-performance")
        self.assertIn('data-filter="channel"', page)
        self.assertIn("Campaign Objective", page)
        self.assertIn("data-trend-channel-all", page)
        self.assertIn("data-trend-channel-options", page)
        self.assertIn("data-trend-objective", page)
        self.assertIn("data-scorecards", page)
        self.assertIn("Performance Trend Explorer", page)
        self.assertIn("media-plan or business target", page)
        self.assertNotIn("data-compare-toggle", page)
        self.assertIn("investment, purchases, observed revenue share", page)
        self.assertIn("data-channel-comparison", page)
        self.assertIn("Campaign Learning &amp; Benchmark", page)
        self.assertIn("data-learning-metric", page)
        self.assertIn("data-learning-objective", page)
        self.assertIn("Campaign Performance Table", page)

    def test_mmm_page_contains_decision_workflow(self):
        page = render_page("mmm")
        self.assertEqual(page.count('aria-current="page"'), 1)
        self.assertIn("data-mmm-dashboard", page)
        self.assertIn("01 · Budget Scenario Planner", page)
        self.assertIn("02 · Diminishing Return", page)
        self.assertLess(page.index("01 · Budget Scenario Planner"), page.index("02 · Diminishing Return"))
        self.assertIn("03 · Pause Planner", page)
        self.assertIn("04 · Saved Scenario Comparison", page)
        for hook in ("data-dr-charts", "data-dr-table",
                     "data-planner-kpis", "data-planner-allocation",
                     "data-horizon-start", "data-horizon-months",
                     "data-hiatus-channels", "data-hiatus-trajectory", "data-mmm-carryover-curve",
                     "data-saved-scenario-panel", "data-save-scenario"):
            self.assertIn(hook, page)
        for mode in ("budget", "target"):
            self.assertIn(f'data-planner-mode="{mode}"', page)
        for removed_mode in ("roi", "manual"):
            self.assertNotIn(f'data-planner-mode="{removed_mode}"', page)
        self.assertNotIn("data-manual-inputs", page)
        for removed_hook in ("data-dr-insights", "data-dr-recommendation", "data-planner-banner", "data-planner-recommendation", "data-guardrails", "Guardrails per channel"):
            self.assertNotIn(removed_hook, page)
        self.assertIn("Available Budget", page)
        self.assertIn("Target KPI", page)
        self.assertIn("Allowed range", page)
        self.assertIn("Peak iROAS", page)
        self.assertNotIn("Efficient range", page)
        self.assertIn("Observed vs incremental return", page)
        self.assertIn("Available media budget per month", page)
        self.assertNotIn("Campaign Name", page)
        self.assertNotIn("Placement", page)
        self.assertNotIn("Budget Phasing", page)

        script = Path("app/static/js/mmm.js").read_text(encoding="utf-8")
        for snippet in ("function optimize(", "function proportional(", "function buildCurves(",
                        "Invest more", "Test & learn", "Revenue lost after restart",
                        "function guardrailBounds(budget)", "Past break-even",
                        "xl-mmm-saved-scenarios-v4", "function poolReference(", "mmm-saved-table",
                        "Reference budget / month", "Not in pool"):
            self.assertIn(snippet, script)
        for removed in ("Channel breakdown", "Current reference", "channelInsight", "renderChannelMatrix", "renderDecomposition", "renderModelMetrics", "allocateRemaining",
                        "Minimum iROAS", "Manual mix", "state.manual", "Equal % change (outside guardrails)"):
            self.assertNotIn(removed, script)

    def test_pages_and_scripts_use_plain_hyphens(self):
        # Client request: no en dash, minus sign or em dash anywhere in the dashboard.
        for path in list(Path("app/templates").glob("*.html")) + list(Path("app/static/js").glob("*.js")):
            text = path.read_text(encoding="utf-8")
            for char in ("\u2013", "\u2212", "\u2014"):
                self.assertNotIn(char, text, f"{path} contains {char!r}")

    def test_mmm_dataset_is_derived_from_campaign_spend(self):
        dataset = generate_mmm_dataset()
        campaign = generate_campaign_dataset()
        self.assertEqual(len(dataset["rows"]), 144)
        self.assertEqual(len(dataset["channels"]), 4)
        self.assertEqual(sum(sum(row["spend"].values()) for row in dataset["rows"]), 19_468_400_000)
        self.assertEqual(dataset["meta"]["grain"], "Channel × Day")
        self.assertEqual(dataset["meta"]["businessKpis"], ["Revenue"])
        signals = {channel["name"]: channel["signal"] for channel in dataset["channels"]}
        self.assertTrue(set(signals.values()) <= {"Invest more", "Hold", "Reduce", "Test & learn"})
        self.assertEqual(signals["X"], "Test & learn")  # small spend base
        for channel in dataset["channels"]:
            # Planning range Rp0-10B/month, Meridian default +/-30% guardrails: no channel reaches break-even.
            planner_max = dataset["meta"]["planningCapMonthly"] / sum(c["currentMonthlySpend"] for c in dataset["channels"]) * 1.3
            self.assertGreater(channel["breakEvenMonthlySpend"], channel["currentMonthlySpend"] * planner_max)
        for channel in dataset["channels"]:
            self.assertLess(channel["incrementalShare"], 1)
            self.assertLess(channel["efficientRange"]["low"], channel["efficientRange"]["high"])
            media = sum(row["media"][channel["name"]] for row in dataset["rows"])
            self.assertEqual(media, channel["incrementalRevenue"])
        lookup = {item["id"]: item["channel"] for item in campaign["campaigns"]}
        observed = {}
        for row in campaign["rows"]:
            if dataset["meta"]["defaultStart"] <= row[0] <= dataset["meta"]["defaultEnd"]:
                observed[lookup[row[1]]] = observed.get(lookup[row[1]], 0) + row[8]
        for channel in dataset["channels"]:
            self.assertEqual(sum(row["observed"][channel["name"]] for row in dataset["rows"]), observed[channel["name"]])

    def test_mmm_uses_google_meridian_output(self):
        from app.data.mmm import load_meridian_output
        output = load_meridian_output()
        self.assertIsNotNone(output, "app/data/meridian_output.json is missing; run meridian/train_meridian.py")
        dataset = generate_mmm_dataset()
        self.assertTrue(dataset["meta"]["modelVersion"].startswith("Google Meridian"))
        self.assertEqual(dataset["meta"]["modelSource"], "meridian")
        for channel in dataset["channels"]:
            fitted = output["channels"][channel["name"]]
            self.assertEqual(channel["curve"]["k"], round(fitted["monthlyCurve"]["k"]))
            self.assertEqual(channel["halfLifeDays"], round(fitted["halfLifeDays"]["median"], 1))
        self.assertLess(output["meta"]["maxRhat"], 1.2)
        self.assertFalse(output["meta"]["quickRun"])

    def test_cross_module_consistency_report_passes(self):
        from scripts.validate_data import run_checks
        failures = [name for name, passed, _ in run_checks() if not passed]
        self.assertEqual(failures, [])

    def test_geo_page_contains_locked_opportunity_workflow(self):
        page = render_page("geo-intelligence")
        self.assertEqual(page.count('aria-current="page"'), 1)
        self.assertIn("data-geo-dashboard", page)
        self.assertIn("Indonesia Market Opportunity Map", page)
        self.assertIn('data-geo-lens="demand"', page)
        self.assertIn('data-geo-lens="adoption"', page)
        self.assertIn('data-geo-lens="value"', page)
        self.assertIn('data-geo-lens="growth"', page)
        for filter_name in ("dateStart", "dateEnd", "product", "province", "city", "mediaPlan", "objective", "channel", "placement", "campaign"):
            self.assertIn(f'data-geo-filter="{filter_name}"', page)
        self.assertIn("data-geo-map-metric", page)
        self.assertIn("data-geo-map-heat", page)
        self.assertIn("geoLandMask", page)
        self.assertIn('data-geo-level="province"', page)
        self.assertIn('data-geo-level="city"', page)
        self.assertIn("data-geo-scorecards", page)
        self.assertIn("Market Opportunity Matrix", page)
        self.assertIn("indonesia-provinces-2026.svg", page)
        self.assertIn("points are naturally scattered within their quadrant", page)
        self.assertIn("Demand-Investment Gap", page)
        self.assertIn("Recommended Market Action", page)
        self.assertIn("Opportunity Leaderboard", page)

        script = Path("app/static/js/geo.js").read_text(encoding="utf-8")
        for segment in ("Powerhouse Cities", "Rising Stars", "Potential Cities", "Emerging Base"):
            self.assertIn(segment, script)
        self.assertIn("Bubble size &amp; opacity", script)
        self.assertIn("Bubble + map color", script)
        self.assertIn("MAP_BUBBLE_SCALE", script)
        self.assertIn("contrastExponent: 1.2", script)
        self.assertIn("minimumOpacity: .62", script)
        self.assertIn("stableUnit", script)
        self.assertIn("matrix-x", script)
        self.assertIn("const clusterItems = activeSet()", script)
        self.assertIn("sum(contextEntities.map((item) => item.customerBase))", script)
        self.assertIn("% of all customers", script)
        map_asset = Path("app/static/img/indonesia-provinces-2026.svg")
        self.assertTrue(map_asset.is_file())
        self.assertGreater(map_asset.stat().st_size, 100_000)

    def test_geo_dataset_supports_city_opportunity_scope(self):
        dataset = generate_geo_dataset()
        self.assertEqual(len(dataset["cities"]), 50)
        self.assertEqual(len(dataset["channels"]), 4)
        self.assertEqual(dataset["meta"]["defaultStart"], GEO_DEFAULT_START.isoformat())
        self.assertEqual(dataset["meta"]["defaultEnd"], GEO_DEFAULT_END.isoformat())
        self.assertEqual(dataset["meta"]["grain"], "City × Campaign × Week")
        campaigns = {item["id"]: item for item in dataset["campaigns"]}
        self.assertEqual({campaigns[row[2]]["product"] for row in dataset["rows"]}, {"Prepaid"})
        self.assertEqual({campaigns[row[2]]["channel"] for row in dataset["rows"]}, {"Google", "Meta", "TikTok", "X"})
        self.assertEqual({campaigns[row[2]]["funnel"] for row in dataset["rows"]}, {"Awareness", "Consideration", "Conversion", "Social Media Engagement"})
        self.assertEqual({row[1] for row in dataset["rows"]}, set(range(50)))

    def test_demo_dataset_supports_locked_campaign_scope(self):
        dataset = generate_campaign_dataset()
        self.assertEqual(len(dataset["campaigns"]), 138)
        self.assertEqual(
            {campaign["funnel"] for campaign in dataset["campaigns"]},
            {"Awareness", "Consideration", "Conversion", "Social Media Engagement"},
        )
        self.assertEqual(dataset["meta"]["defaultStart"], DEFAULT_START.isoformat())
        self.assertEqual(dataset["meta"]["defaultEnd"], DEFAULT_END.isoformat())
        self.assertEqual(dataset["meta"]["rowFields"][0:2], ["date", "campaign"])
        self.assertEqual(len(dataset["targets"]), 138 * 144)
        self.assertEqual(dataset["meta"]["targetSource"], "Illustrative media plan and business targets")
        self.assertTrue(all(len(row) == len(dataset["meta"]["rowFields"]) for row in dataset["targets"]))
        lookup = {item["id"]: item["channel"] for item in dataset["campaigns"]}
        spend, revenue = {}, {}
        for row in dataset["rows"]:
            if dataset["meta"]["defaultStart"] <= row[0] <= dataset["meta"]["defaultEnd"]:
                spend[lookup[row[1]]] = spend.get(lookup[row[1]], 0) + row[2]
                revenue[lookup[row[1]]] = revenue.get(lookup[row[1]], 0) + row[8]
        self.assertEqual(sum(spend.values()), 19_468_400_000)
        self.assertEqual(sum(revenue.values()), 68_286_150_000)

    def test_mta_demo_dataset_is_tracked_subset_of_campaign(self):
        dataset = generate_mta_dataset()
        rows = dataset["rows"]
        purchases = [row for row in rows if row["targetEvent"] == "Package Purchase"]
        self.assertEqual(sum(row["conversions"] for row in purchases), 367_984)
        self.assertEqual(sum(row["revenue"] for row in purchases), 27_314_460_000)
        self.assertEqual(dataset["meta"]["methodology"], "Observed journey attribution; not incremental impact")
        self.assertEqual(dataset["meta"]["defaultTargetEvent"], "Package Purchase")
        self.assertEqual(dataset["meta"]["trackedCoverage"], 0.40)
        self.assertTrue(all(row["revenue"] == 0 for row in rows if row["targetEvent"] == "App Install"))
        self.assertTrue(all(row["channel"] == row["channels"][0] for row in rows))
        self.assertEqual({row["channel"] for row in rows}, {"Google", "Meta", "TikTok", "X"})
        campaign_names = {item["campaign"] for item in generate_campaign_dataset()["campaigns"]}
        self.assertTrue(all(row["campaign"] in campaign_names for row in rows))


if __name__ == "__main__":
    unittest.main()
