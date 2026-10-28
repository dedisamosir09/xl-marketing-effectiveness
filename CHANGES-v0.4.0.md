# v0.4.0 — MMM powered by Google Meridian

## What changed

- **Google Meridian model** (`meridian/`): a geo-level Bayesian MMM (Meridian 2.1.0).
  - Training data: 20 geos × 104 weeks of simulated data.
  - Fitted outputs are saved to `app/data/meridian_output.json`.
  - The MMM page now reads its response curves and adstock half-lives from this fit. Previously they were hand-set curves.
  - Streamlit only reads the JSON; it does not install Meridian.
- **Training data** (`app/data/meridian_input.py`, `meridian/input/xl_geo_weekly.csv`):
  - Grain: 19 largest cities + Rest of Indonesia × weekly, 23 Aug 2024 – 20 Aug 2026.
  - Columns: spend and impressions per channel, controls (promo, competitor promo, Ramadan, Lebaran) and revenue.
  - From 14 Nov 2025, national weekly spend equals Campaign Performance spend.
  - Simulated from known parameters (`ground_truth.json`), so the fit can be checked.
- **Model settings:**
  - Geometric adstock first, then Hill saturation (Meridian default).
  - ROI prior LogNormal(0.3, 0.6) for every channel.
  - Hill slope estimated with prior LogNormal(0.7, 0.4). Meridian fixes the slope at 1 by default, which gives concave curves only, so there would be no efficient range.
  - Sampler: 4 chains × 500 kept draws.
- **Business scenarios** (`meridian/scenarios.py`), computed with Meridian's own optimizer (guardrails −30% / +60% per channel):
  - Budget cut possible with flat incremental revenue.
  - Revenue impact of a −10% budget.
  - Budget needed for +10% incremental revenue.
  - Budget frontier from −30% to +60%.
  - Maximum ROAS at a fixed budget.
  - Flexible budget with target mROI = 1.
- **Results workbook** (`meridian/export_sheet.py`), shared as a Google Sheet:
  - Summary answers.
  - Model fit: R², MAPE, wMAPE, R-hat.
  - Parameters: carryover, beta, Hill slope and EC, ROI vs ground truth.
  - Budget frontier, response curves, and beta by geo.
- **MMM page:**
  - The model badge reads "Google Meridian 2.1.0 · 20 geos × 104 weeks".
  - Copy now says the curves are estimated by Meridian.
- **Validation:** `scripts/validate_data.py` adds checks for the Meridian input (spend = Campaign, shape) and the fit (full run, R-hat < 1.2, R² > 0.9, page curves = Meridian curves, curve-fit R²). A new test covers the Meridian output.

## Results (demo fit)

- **Fit:** national R² 0.983, wMAPE 0.8%, max R-hat 1.11 (acceptable).
- **ROI estimate vs ground truth:**

  | Channel | Estimate | 90% interval | Truth | Truth inside interval? |
  |---|---|---|---|---|
  | Google | 1.54x | 1.15–2.38 | 1.54x | Yes |
  | Meta | 2.74x | 2.03–3.82 | 1.93x | No (overestimated) |
  | TikTok | 0.83x | 0.48–1.52 | 1.34x | Yes |
  | X | 1.71x | 0.72–3.79 | 1.56x | Yes |

- **MMM page signals** now follow the Meridian curves: Google Reduce, Meta Hold, TikTok Reduce, X Test & learn.
- **Scenarios (per month):**
  - The same incremental revenue is possible with an 11.0% lower budget.
  - Budget −10%: with the optimal mix, incremental revenue changes +1.0% (total revenue +0.2%). With the same mix, incremental revenue changes −7.6% (total revenue −1.7%).
  - +10% incremental revenue needs a +1.9% budget.
  - Same budget with the optimal mix: incremental revenue +8.8%, ROAS 1.71x → 1.86x.
  - The app planner gives a +9.1% gain with the same allocation as Meridian's optimizer.

## v0.5.0 — Planning range up to Rp100B per month

- **Demo curves recalibrated** (`app/data/master.py`): every channel's break-even (next Rp1 returns Rp1) now sits ~60x above its current monthly spend in the ground truth, so the planner never pushes a channel past break-even for total budgets up to Rp100B per month. iROAS at current: Google 1.8x, Meta 2.6x, TikTok 1.4x, X 2.2x (all below observed ROAS).
- **Training data**: synthetic flights no longer coincide with Ramadan, so the model separates media from seasonality (TikTok is now recovered within its interval).
- **Meridian refit** with saturation priors (Hill EC median 37x typical spend, slope median 1.3): R-hat 1.05, national R² 0.985. Estimated break-even: Google 38x, Meta 61x, TikTok 44x, X 74x current spend.
- **Scenarios** use dynamic programming on Meridian's response grid. Same budget, optimal mix: incremental +15.6% (ROAS 1.99x → 2.30x). Budget −10% with optimal mix: incremental +3.3%. Same incremental with −11.5% budget. +10% incremental with −5.4% budget.
- **Planner check**: budgets from Rp1B to Rp100B per month give no channel past break-even (validation and tests check break-even ≥ 25x current).
- **UI**: Saved Scenario per-channel detail (hidden by default), break-even line and loss zone on curves, pause recovery window, calculation table, full-height Streamlit frame, MMM signal labels removed.

## v0.5.1 — Meridian-style guardrails

- **Guardrails follow Meridian's spend-constraint rule**: each channel stays within (1 − 30%) to (1 + 60%) × new budget × its historical share. Before, the limits were fixed around current spend, so budgets above ~Rp6.6B/month could not be optimized and fell back to an equal % change.
- **Planner**: every available budget from Rp0 to Rp100B/month is optimized and spent in full. The "Allowed range / month" column updates with the scenario budget. Locked channels keep their reference spend; the rest share the remaining budget. Target KPI mode searches budgets up to Rp100B/month.
- **Scenarios** re-run with the same rule (Meridian grid widened to 0–260% of current spend): same incremental with −10.9% budget; budget −10% with optimal mix gives incremental +1.3%; +10% incremental needs −3.9% budget; same budget optimal mix +15.6% (ROAS 1.99x → 2.30x). Because the floor follows the smaller budget, a channel can drop more than 30% vs current when the total budget is cut (e.g. Google −37% at budget −10%).

## v0.6.0 — Rp0–10B planning range, fully estimated from data

- **Planning range Rp0–10B per month** with **Meridian's default guardrails** (±30% of each channel's share of the budget). At Rp10B a channel reaches at most ~3.2x its current spend. Budgets above Rp10B are capped with a note.
- **Training data cover the planning range**: geo tests in the synthetic history (four mid-size geos per channel, 6-week blocks at 0x to 7x normal per-capita spend). National spend still equals Campaign spend from 14 Nov 2025.
- **Ground truth recalibrated** (`master.py`): Hill alpha 1.5; iROAS peaks at ~2–3x current spend; break-even at 5.5–6.5x current, inside the data.
- **Priors**: ROI and adstock use Meridian defaults; weak, documented priors for Hill slope LogNormal(0.2, 0.4) and EC LogNormal(1.0, 0.7). Saturation is learned from the data: Meridian's half-saturation is within 7% of the truth for Google, Meta and TikTok, and break-even within 14%.
- **Fit**: max R-hat 1.08, national R² 0.978. ROI: Google 1.61x (truth 1.80), Meta 3.02x (2.58), TikTok 1.69x (1.40), X 1.19x (2.16, wide interval 0.39–2.77; X is 1.6% of budget and labelled Test & learn).
- **Diminishing-return charts** show the curve up to break-even and shade spend levels beyond the model data ("Beyond model data").
- **Scenarios** (Meridian default ±30%): same incremental with −4.3% budget; budget −10% → incremental −7.2% (same mix −12.7%); +10% incremental needs +3.5% budget; same budget optimal mix +5.6% (ROAS 1.97x → 2.08x); Rp9.9B (+140%) → incremental +175%.
- **Validation** (72 checks): planner spend at Rp10B stays inside the data and below Meridian break-even for every channel; half-saturation and break-even recovered within 25% of ground truth; new "Data coverage" tab in the workbook.

## v0.6.1 — Allowed range replaces efficient range

- **Why**: the efficient range (iROAS within 2% of each channel's peak) looks at one channel alone, while the planner spends a fixed budget across channels by the return on the next Rp1 (mROI). Strong channels get pushed past their iROAS peak and weaker ones cut below it, so the chart could say "below efficient range" for a channel the planner cuts. With flatter curves the efficient range was also fragile (small estimation changes moved it a lot).
- **Diminishing-return charts**: the box is now the **allowed range** for the scenario budget (Meridian's default spend constraint, ±30% of the channel's share), so the scenario point is always inside it. A small marker shows **peak iROAS** (channel alone). Break-even, loss zone and "Beyond model data" stay.
- **Planner**: "Position on curve" is now **Optimizer position**, based on mROI: Room to grow (raised to +30%), Balanced, Lower return (cut to −30%), Too small to pay back (below the channel's effective level), Past break-even. Hover a label for the reason.
- **Section 02 headline** follows the planner (which channels it raises and cuts). The summary table shows peak iROAS and the budget where it occurs.
- **Model and numbers unchanged** from v0.6.0 (same Meridian fit, scenarios and Sheet v4). A trial recalibration with flatter curves was discarded.
- **Validation**: the ground-truth check now compares break-even and the curve at the planner maximum (the quantities inside the data).

## v0.6.2 — Optimizer position fix

- A channel within one optimizer grid step of its +30% / −30% limit is now labelled Room to grow / Lower return (X at Rp5B was shown as Balanced at 99% of its cap). The Room to grow tooltip no longer says "highest" return when another channel is higher.
- **Target KPI is now a target for incremental revenue from media** (revenue caused by the ads, baseline excluded) instead of total revenue. The default target is +10% vs the reference; the helper shows the current incremental revenue and the most the curves deliver at Rp10B (Rp22.53B/month for the default period). Example: target Rp8.79B (equal to total revenue Rp35B) needs a Rp4.22B budget. Saved scenarios use a new storage key (v4), so scenarios saved under the old definition are not reloaded.

## v0.6.3 — Target headline and audit notes

- **Section 02 headline** names the Target KPI and the budget it needs when the planner is in Target KPI mode (e.g. "Target Rp8.90B incremental revenue → Rp4.26B/month budget: …").
- **Results workbook** (`meridian/export_sheet.py`) adds an **Audit notes** tab (and section in the one-tab CSV): data source, model settings, priors (Meridian default vs changed, with reasons), fit, recovery of the ground truth, guardrails, optimizer, validation, limitations and reproducibility. A full re-run of the training reproduced identical results.
- **Audit notes** include a Variables section: dependent variable (revenue, IDR), media variables (impressions per channel), media spend (IDR, used for ROI, not a regressor), controls and population; and a limitation on impressions vs spend in the simulated data.

## v0.6.4 — Client UI clean-up

- Model Scope (reference period filter) hidden; the default period 3 Apr - 24 Aug 2026 stays in use.
- Removed for clients: the guardrails explainer box, the Available Budget mode description, the section 02 description paragraph, the "Beyond model data" shading and label, and the cap / floor / locked labels under channel names in Scenario result (the Optimizer position column stays).
- Scenario result: the Scenario / month cell shows the allowed range as a band (same numbers as the setup table), the reference as a tick and the scenario as a dot, with "Allowed Rp... - Rp..." under the value.
- Start date and Duration sit side by side, End date on its own line (no overlap).
- Every en dash, minus sign and em dash on all pages replaced by a plain hyphen "-"; signed numbers stay on one line.
- Menu order: Campaign Performance, Geo Intelligence, MMM, MTA.

## v0.6.5 - Scenario cell as numbers

- Scenario result: the Scenario / month cell shows only the recommended budget and "Allowed Rp... - Rp..." under it; the band / tick / dot visual and its help cursor are removed. Ranges use a spaced hyphen ("Rp1.39B - Rp2.57B") in the setup table and section 02 too.

## v0.6.6 - Sidebar toggle and menu order

- The menu button in the top bar now also works on desktop: it hides the sidebar so the page uses the full width, and shows it again. The choice is remembered in the browser. On phones the button still opens the sidebar as an overlay.
- Menu order: Campaign Performance, Geo Intelligence, MTA, MMM.

## v0.6.7 - MTA page trimmed

- Removed the Channel Role Analysis and Attribution Model Comparison panels from the MTA page (little decision value for clients). The journey signals at the bottom still describe which channel opens, assists and closes journeys.

## v0.6.8 - Journey Explorer without tabs

- The End-to-End User Journey Explorer now shows one journey in MyXL terms, with no tabs or view buttons. The "Marketing to App", "In-App Journey" and "End-to-End" choices are removed.
- Stages: First ad, Last ad, Arrive (deep link, opened or installed MyXL, App Store), Browse, Find package, Result (bought package, recharged, installed & opened, left without buying, payment failed, install abandoned).
- Shown together, top to bottom:
  1. Journey funnel, one card per conversion event in scope: users at each step, % that continued, drop-offs (left without buying, payment failed, install abandoned), the biggest drop, and the last ad that brought users in.
  2. Full journey flow (Sankey) with a stage header on each column.
  3. Most common journeys, 5 per page with pagination, most common first, with journeys, share and revenue or outcomes.
- A note says tracking starts when a user arrives from an ad; ad views without an app visit are in Campaign Performance.
- Clicking a flow step or a journey still filters the whole dashboard.
- Demo data fix: each ad combination used to follow one fixed in-app route (for example every Google-only journey went Deep link → Promo page), so the flow kept the same numbers from start to end. In-app routes and drop points now vary by journey group:
  - Ways in: deep link, opened MyXL, installed MyXL.
  - Browse steps: Home, promo banner, promo page, package list, search.
  - Drop points: left right away, left while browsing, left after viewing packages, payment failed.
  - Channels, journeys, conversions, revenue and attribution are unchanged; validate_data.py checks the new variety (74 checks).
- The funnel now has four steps: Arrived in MyXL → Browsed the app → Looked at packages → Bought package / Recharged.

## v0.6.9 - Journey funnel full width

- When only one conversion event is in scope, its funnel card now uses the full width of the panel.
