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
