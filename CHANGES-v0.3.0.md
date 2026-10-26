# v0.3.0 — Master data model + MMM redesign

## 1. Data alignment (all modules)

- New `app/data/master.py`: one set of channel parameters (spend, package value/AOV, observed ROAS, MMM response curve, half-life) and one campaign master list used by every module.
- **Campaign Performance**: revenue = purchases × AOV (Google Rp72K, Meta Rp85K, TikTok Rp68K, X Rp92K). Observed ROAS: Google 4.30x, Meta 3.50x, TikTok 2.10x, X 3.20x. Spend unchanged (Rp19.47B in the default 144 days).
- **MMM**: daily spend is exactly the Campaign spend; incremental revenue is now a share of observed revenue (Google 36%, Meta 56%, TikTok 64%, X 50%; portfolio 45%). Previously iROAS equalled observed ROAS (100% incrementality).
- **Geo**: rows are derived from the Campaign rows (each campaign targets a subset of cities). Spend, purchases and revenue by channel, objective, media plan, placement and campaign equal Campaign Performance.
- **MTA**: a tracked subset of 40% of package purchases. Last-touch purchases and revenue by channel = 40% × Campaign. Every journey references a real campaign.
- `scripts/validate_data.py`: 43 cross-module checks (all pass).

## 2. MMM page

- **01 Diminishing Return**: slide-style small multiples per channel. Each shows incremental revenue/month (solid), iROAS (dashed, right axis), the efficient-range box (iROAS within 2% of peak), and Current / Scenario markers. Also auto insights per channel, a recommendation box, and an Observed vs incremental summary table.
- **02 Budget Scenario Planner**:
  - Budgets per month, with a planning horizon (start + months).
  - New global optimizer (dynamic programming). It replaces the greedy allocator that produced artifacts such as Rp1.25M leftovers and "all budget to one channel".
  - Include, lock and ±% guardrails are respected exactly.
  - Budgets outside the guardrail range get an equal % change and an "outside modeled range" warning.
  - Channels funded past break-even (mROI < 1) are flagged.
- **03 Pause Planner**: KPI decline vs allowed threshold, budget saved, revenue lost during the pause, revenue lost after restart (rebuild), and the net. The old version only counted the loss during the pause, which made pauses look cash-positive.
- **Planning objectives**: only Available Budget and Target KPI (Minimum iROAS and Manual mix removed).
- **Reference budget follows the selected channels**: the planner and saved scenarios compare against the current monthly budget of the channels in the scenario pool (4 channels = Rp4.12B/month; e.g. Meta + TikTok = Rp2.07B/month). Excluded channels are listed as "Not in pool". Budget presets and the default target follow that reference.
- **04 Saved Scenario Comparison**:
  - A summary row per plan: channel pool, budget reference → scenario, incremental revenue reference → scenario, iROAS reference → scenario.
  - A channel breakdown per plan: reference, scenario, change, incremental revenue, mROI.
  - Load restores the plan's settings.
- Removed: hidden/dead code (impact overview, channel matrix, decomposition, model metrics), the separate big response-curve panel (merged into the small multiples), and the sensitivity chart.
- MMM signals renamed to Invest more / Hold / Reduce / Test & learn. They no longer reuse Campaign role words (Maintain / Optimize).
- Product and KPI selectors are shown as fixed (single option in this POC) instead of looking like working filters.

## 3. Other fixes

- MTA page guardrail note explains the 40% tracked coverage.
- Geo purchase-intent factor now follows each city's modeled demand signal (it was arbitrary before; this keeps Jakarta in "Potential Cities").

## Assumptions (demo, adjustable in `app/data/master.py`)

Spend scale and period unchanged. AOV, observed ROAS, incrementality, curve shape and efficient-range threshold (98% of peak iROAS) are illustrative, not client data.

## Not yet addressed (next priorities)

- **MTA realism**:
  - Touchpoint buckets ("1 touch" is still empty).
  - Journey durations, so the lookback filter has an effect.
  - A real Markov "Data-Driven" model.
  - Removing the assist heuristic.
  - A conditional "friction" signal.
- **Geo**: clustering method (big cities sit near the median after per-addressable normalization), map point placement, label overlap.
- **Campaign**: unused history rows; "Active campaigns % of target".
- **UI**: Streamlit iframe fixed height.
