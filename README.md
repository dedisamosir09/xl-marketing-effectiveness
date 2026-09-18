# XL Marketing Effectiveness Dashboard

Interactive Python-built marketing analytics dashboard inspired by the XL Smart visual language. The Marketing Campaign Performance module includes deterministic demo data, cascading filters, cross-filter interactions, KPI monitoring, campaign diagnostics, and responsive visualizations.

## Modules

- Marketing Campaign Performance — interactive demo available
- Multi Touch Attribution (MTA) — interactive demo available
- Marketing Mix Modeling (MMM) — interactive demo available
- Geo Intelligence — interactive demo available

## Campaign performance demo

- Date, product, media plan, campaign objective, channel, placement, and campaign filters
- Seven executive scorecards with previous-period comparison
- Daily/monthly trend explorer with an aggregated all-channel gradient, channel comparison, and campaign-objective filter
- Marketing funnel and budget pacing
- Color-coded channel comparison with purchases, observed share gap, previous-period movement, and role signals
- Objective-aware campaign learning benchmark with metric controls, diagnostic hover tooltips, and sortable detail table
- Contextual observed-performance signals

The generated dataset is deterministic and clearly identified as demo data. Its default analysis period is 3 April–24 August 2026 at `date × campaign × placement` analytical grain, with one placement assigned to each campaign.

## Multi-touch attribution demo

- Global marketing filters plus attribution model, journey scope, user type, lookback, and conversion-event controls
- Cross-filtered journey scorecards and observed marketing-to-app, in-app, and end-to-end journeys
- Interactive Sankey, top-path, and journey-funnel views
- Touch-frequency and time-to-conversion diagnostics
- Channel role analysis, attribution model comparison, and channel interaction heatmap
- Conversion-event-aware KPIs with Package Purchase as the default event
- Data-Driven (Demo) labeling and absolute values alongside attribution share
- Campaign-level attribution detail and observed journey signals

The MTA demo uses deterministic aggregate journey data. Sankey width represents observed journeys, while model outputs distribute conversion credit; neither should be interpreted as incremental impact.

## Marketing mix modeling demo

- Marketing impact overview with actual, predicted, baseline, incremental revenue, contribution, spend, and iROAS
- Channel effectiveness table and iROAS vs marginal ROI investment matrix
- Planner-linked response curves with direct current/scenario labels and channel-level allocation deltas
- Carryover decay linked to the selected 0–8 week hiatus, with visible half-life, remaining-effect, threshold, and decline labels
- Business Planner modes for available budget, target KPI, target ROI, and manual what-if allocation
- Week, month, or year planning horizons with a calendar start date, calculated end date, and duration-scaled budget/KPI references
- Practical min/max, lock, and maximum-reduction constraints with saved scenario comparison
- Advanced Meridian model metadata with Ridge used only as a challenger stability check

The MMM demo is intentionally limited to product, business outcome, analysis period, and channel-level model outputs. Campaign, placement, journey, and platform-attribution metrics remain in their dedicated modules.

## Geo intelligence demo

- Real-shape Indonesia province map with Demand, Adoption, Value, and Growth lenses; segment-colored bubbles and a filter-responsive land heat wash
- Province/city switching, market and media filters, hover detail, and linked market selection
- Dynamic market scorecards with clearly separated modeled potential and observed media outcomes
- Addressable-market-normalized opportunity matrix with display-spread Powerhouse Cities, Rising Stars, Potential Cities, and Emerging Base segments
- Demand–investment share gap, opportunity leaderboard, network-readiness guardrail, and recommended market action

The geo demo uses deterministic data for 50 Indonesian cities. Potential leads and adoption metrics are modeled estimates, while spend and revenue are observed demo signals; neither is presented as incremental lift.

Indonesia province geometry is adapted in color from [Indonesian provinces blank.svg](https://commons.wikimedia.org/wiki/File:Indonesian_provinces_blank.svg) by RXerself and subsequent contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

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
python scripts/build_static.py
```

The generated production-ready static pages are written to `dist/`.
