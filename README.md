# XL Marketing Effectiveness Dashboard

Interactive Python-built marketing analytics dashboard inspired by the XL Smart visual language. The Marketing Campaign Performance module includes deterministic demo data, cascading filters, cross-filter interactions, KPI monitoring, campaign diagnostics, and responsive visualizations.

## Modules

- Marketing Campaign Performance — interactive demo available
- Multi Touch Attribution (MTA) — interactive demo available
- Marketing Mix Modeling (MMM) — interactive demo available
- Geo Intelligence — interactive demo available

## Campaign performance demo

- Date, product, media plan, campaign objective, channel, placement, and campaign filters
- Seven executive scorecards compared with the media-plan / business target
- Daily/monthly trend explorer with an aggregated all-channel gradient, channel comparison, and campaign-objective filter
- Marketing funnel and budget pacing
- Color-coded channel comparison with purchases, observed share gap, ROAS and CPA versus target, and role signals
- Objective-aware campaign learning benchmark with metric controls, diagnostic hover tooltips, and sortable detail table
- Contextual observed-performance signals

The default analysis period is 3 April–24 August 2026 at `date × campaign` grain, with one placement per campaign. Revenue is purchases × package value (AOV), so ROAS and CPA are consistent within each channel.

## Multi-touch attribution demo

- Global marketing filters plus attribution model, journey scope, user type, lookback, and conversion-event controls
- Cross-filtered journey scorecards and observed marketing-to-app, in-app, and end-to-end journeys
- Interactive Sankey, top-path, and journey-funnel views
- Touch-frequency and time-to-conversion diagnostics
- Channel role analysis and attribution model comparison
- Conversion-event-aware KPIs with Package Purchase as the default event
- Data-Driven (Demo) labeling and absolute values alongside attribution share
- Campaign-level attribution detail and observed journey signals

The MTA demo uses deterministic aggregate journey data covering about 40% of platform-reported package purchases (last-touch totals reconcile to Campaign Performance × 40%). Sankey width represents observed journeys, while model outputs distribute conversion credit; neither should be interpreted as incremental impact.

## Marketing mix modeling demo

- **Diminishing Return**: per-channel monthly response curves (incremental revenue, solid) with average iROAS (dashed, right axis), an efficient-range box (iROAS within 2% of its peak), current and scenario budget markers, channel insights, a recommendation box, and an observed-vs-incremental summary table (Observed ROAS from Campaign Performance vs MMM iROAS)
- **Budget Scenario Planner**: two planning objectives — Available Budget and Target KPI (monthly revenue) — per month with a planning horizon (start date + months). The reference budget always equals the current monthly budget of the channels selected in the scenario (e.g. all 4 channels Rp4.12B; Meta + TikTok Rp2.07B), and every comparison uses that reference
- Global optimizer (dynamic programming over the budget above channel floors) that respects include/lock choices and ±% guardrails exactly; budgets outside the guardrail range are applied as an equal % change and flagged as extrapolation; channels funded past break-even (mROI < 1) are flagged
- **Pause Planner**: carryover decay, KPI decline by pause length versus an allowed threshold, media budget saved, revenue lost during and after the pause, and the net effect
- Saved scenario comparison (up to three plans plus the current reference): per plan the channel pool, reference budget → scenario budget, incremental revenue reference → scenario, plus a channel-by-channel breakdown (reference, scenario, change, incremental revenue, mROI); Load restores the plan's settings

Signals use their own vocabulary (Invest more, Hold, Reduce, Test & learn) so they are not confused with the Campaign Performance channel roles.

## Geo intelligence demo

- Real-shape Indonesia province map with Demand, Adoption, Value, and Growth lenses; segment-colored bubbles and a filter-responsive land heat wash
- Province/city switching, market and media filters, hover detail, and linked market selection
- Dynamic market scorecards with clearly separated modeled potential and observed media outcomes
- Addressable-market-normalized opportunity matrix with display-spread Powerhouse Cities, Rising Stars, Potential Cities, and Emerging Base segments
- Demand–investment share gap, opportunity leaderboard, network-readiness guardrail, and recommended market action

The geo demo uses deterministic data for 50 Indonesian cities. Potential leads and adoption metrics are modeled estimates, while spend and revenue are observed demo signals; neither is presented as incremental lift.

Indonesia province geometry is adapted in color from [Indonesian provinces blank.svg](https://commons.wikimedia.org/wiki/File:Indonesian_provinces_blank.svg) by RXerself and subsequent contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Demo data model

All four datasets are generated from one master model (`app/data/master.py`) so the pages reconcile:

| Rule | Where it shows |
|---|---|
| Campaign revenue = purchases × channel package value (AOV Rp68–92K); observed ROAS per channel fixed in the master model | Campaign Performance |
| MMM daily spend = Campaign daily spend; incremental revenue = adstocked spend scaled to the monthly Hill curve at the current budget (36–64% of observed revenue) | MMM |
| Geo rows split every campaign-week across its targeted cities with exact integer allocation, so channel, objective, media plan, placement and campaign totals equal Campaign Performance | Geo Intelligence |
| MTA journeys are a tracked subset: last-touch package purchases and revenue per channel = 40% × Campaign Performance; every journey references a real campaign | MTA |

Business story encoded in the demo: Google captures existing demand (highest observed ROAS, lowest incrementality, above its efficient range); Meta has headroom (below its efficient range); TikTok opens journeys (lowest observed ROAS, highest incremental share, inside its efficient range); X is a small test channel.

Run `python scripts/validate_data.py` for the cross-module consistency report.

## Local development

The static dashboard server uses only the Python standard library.

```bash
python run.py
```

Open `http://localhost:5000`.

## Streamlit deployment

Install the Streamlit dependency and run the Community Cloud entrypoint:

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

For Streamlit Community Cloud, select this repository, the `main` branch, and
`streamlit_app.py` as the entrypoint. The adapter preserves the existing HTML,
JavaScript, filters, charts, and four-module navigation in a self-contained
Streamlit iframe.

## Validation and static build

```bash
python -m unittest discover -s tests -v
python scripts/validate_data.py
python scripts/build_static.py
```

The generated production-ready static pages are written to `dist/`.
