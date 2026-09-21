import unittest
from pathlib import Path

from app.navigation import MENU_ITEMS
from app.renderer import render_page
from app.streamlit_adapter import build_embedded_page
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
            self.assertIn(f'data-module-link="{item["key"]}"', page)
            self.assertIn(f'data-module-panel="{item["key"]}"', page)
            self.assertNotIn('target="_top"', page)
            self.assertNotIn('src="/static/', page)
            self.assertNotIn('href="/static/', page)
            self.assertNotIn(f'/static/data/', page)

    def test_all_dashboard_pages_render(self):
        for item in MENU_ITEMS:
            page = render_page(item["key"])
            self.assertIn("XL SMART", page)
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
        self.assertIn("investment, purchases, observed revenue share", page)
        self.assertIn("data-channel-comparison", page)
        self.assertIn("Campaign Learning &amp; Benchmark", page)
        self.assertIn("data-learning-metric", page)
        self.assertIn("data-learning-objective", page)
        self.assertIn("Campaign Performance Table", page)

    def test_mmm_page_contains_locked_decision_workflow(self):
        page = render_page("mmm")
        self.assertEqual(page.count('aria-current="page"'), 1)
        self.assertIn("data-mmm-dashboard", page)
        self.assertIn("Marketing Impact Overview", page)
        self.assertIn("Channel Effectiveness &amp; Scalability", page)
        self.assertIn("Business Planner", page)
        self.assertIn('data-planner-mode="budget"', page)
        self.assertIn('data-planner-mode="target"', page)
        self.assertIn('data-planner-mode="roi"', page)
        self.assertIn('data-planner-mode="manual"', page)
        self.assertIn('data-planning-unit="week"', page)
        self.assertIn('data-planning-unit="month"', page)
        self.assertIn('data-planning-unit="year"', page)
        self.assertIn("data-planning-start", page)
        self.assertIn("data-planning-periods", page)
        self.assertIn("data-planning-end-date", page)
        self.assertIn('data-hiatus-preset="4"', page)
        self.assertIn("data-hiatus-trajectory", page)
        self.assertIn("data-planner-active-summary", page)
        self.assertIn("data-planner-recommendation", page)
        self.assertIn("Channel Response Curve", page)
        self.assertIn("Carryover Decay", page)
        self.assertIn("Timing &amp; continuity planner", page)
        self.assertIn("Allowed KPI decline threshold", page)
        self.assertIn("data-response-labels", page)
        self.assertIn("data-carryover-labels", page)
        self.assertNotIn("Budget Phasing", page)
        self.assertNotIn("data-planner-horizon", page)
        self.assertNotIn("data-planner-phasing", page)
        self.assertNotIn("Campaign Name", page)
        self.assertNotIn("Placement", page)

    def test_mmm_dataset_matches_channel_level_model_scope(self):
        dataset = generate_mmm_dataset()
        self.assertEqual(len(dataset["rows"]), 144)
        self.assertEqual(len(dataset["channels"]), 4)
        self.assertEqual(sum(sum(row["spend"].values()) for row in dataset["rows"]), 19_468_400_000)
        self.assertEqual(sum(sum(row["media"].values()) for row in dataset["rows"]), 49_990_782_480)
        self.assertEqual(sum(row["actual"] for row in dataset["rows"]), 144_120_000_000)
        self.assertEqual(dataset["meta"]["grain"], "Channel × Day")
        self.assertEqual(dataset["meta"]["businessKpis"], ["Revenue"])
        self.assertNotIn("demoAnnualPhasing", dataset["meta"])
        self.assertNotIn("annualSeasonality", dataset)

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
        self.assertIn("points are display-spread inside their quadrant", page)
        self.assertIn("Demand–Investment Gap", page)
        self.assertIn("Recommended Market Action", page)
        self.assertIn("Opportunity Leaderboard", page)

        script = Path("app/static/js/geo.js").read_text(encoding="utf-8")
        for segment in ("Powerhouse Cities", "Rising Stars", "Potential Cities", "Emerging Base"):
            self.assertIn(segment, script)
        self.assertIn("Bubble size &amp; opacity", script)
        self.assertIn("Bubble + map color", script)
        map_asset = Path("app/static/img/indonesia-provinces-2026.svg")
        self.assertTrue(map_asset.is_file())
        self.assertGreater(map_asset.stat().st_size, 100_000)

    def test_geo_dataset_supports_city_opportunity_scope(self):
        dataset = generate_geo_dataset()
        self.assertEqual(len(dataset["cities"]), 50)
        self.assertEqual(len(dataset["channels"]), 4)
        self.assertEqual(dataset["meta"]["defaultStart"], GEO_DEFAULT_START.isoformat())
        self.assertEqual(dataset["meta"]["defaultEnd"], GEO_DEFAULT_END.isoformat())
        self.assertEqual(dataset["meta"]["grain"], "City × Channel × Week")
        self.assertEqual({row["product"] for row in dataset["rows"]}, {"Prepaid"})
        self.assertEqual({row["channel"] for row in dataset["rows"]}, {"Google", "Meta", "TikTok", "X"})
        self.assertEqual({row["objective"] for row in dataset["rows"]}, {"Awareness", "Consideration", "Conversion", "Social Media Engagement"})

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

    def test_mta_demo_dataset_matches_locked_journey_totals(self):
        dataset = generate_mta_dataset()
        rows = dataset["rows"]
        self.assertEqual(sum(row["journeys"] for row in rows), 30_000)
        self.assertEqual(sum(row["users"] for row in rows), 15_561)
        self.assertEqual(sum(row["touchpoints"] for row in rows), 67_894)
        self.assertEqual(sum(row["conversions"] for row in rows), 9_952)
        self.assertEqual(sum(row["revenue"] for row in rows), 759_710_000)
        self.assertEqual(dataset["meta"]["methodology"], "Observed journey attribution; not incremental impact")
        self.assertEqual(dataset["meta"]["defaultTargetEvent"], "Package Purchase")
        self.assertTrue(all(row["revenue"] == 0 for row in rows if row["targetEvent"] == "App Install"))
        self.assertTrue(all(row["channel"] == row["channels"][0] for row in rows))
        self.assertEqual({row["channel"] for row in rows}, {"Google", "Meta", "TikTok", "X"})


if __name__ == "__main__":
    unittest.main()
