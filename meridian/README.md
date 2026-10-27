# Google Meridian model (demo)

The MMM page uses response curves and carryover estimated by [Google Meridian](https://developers.google.com/meridian). The model is fitted on **simulated demo data**, not XL client data.

## Files

| File | What it is |
|---|---|
| `../app/data/meridian_input.py` | Generates the training data (deterministic) |
| `input/xl_geo_weekly.csv` | Training data: 20 geos × 104 weeks (23 Aug 2024 – 20 Aug 2026) |
| `input/ground_truth.json` | The parameters used to simulate the data, for checking the fit |
| `train_meridian.py` | Fits Meridian and writes `../app/data/meridian_output.json` |
| `scenarios.py` | Business scenarios with Meridian's optimizer (flat incremental, budget -10%, +10% target, budget frontier, mROI = 1); adds them to the output JSON |
| `export_sheet.py` | Builds `output/xl_meridian_results.xlsx` (the workbook shared as a Google Sheet) |
| `../app/data/meridian_output.json` | Fitted outputs read by the MMM page (the app never imports Meridian) |

## Training data

- **Geos:** the 19 largest cities, plus "Rest of Indonesia". Population comes from the Geo module.
- **Media per channel:** spend (IDR million) and impressions (spend ÷ CPM).
  - From 14 Nov 2025, national weekly spend equals Campaign Performance spend.
  - Earlier weeks are a synthetic history with budget flights (freezes, bursts, X on/off), so the model sees each channel at different spend levels.
  - **Geo tests** in the synthetic history: for each channel, four mid-size geos run 6-week blocks at 0× (holdout), 1.5×, 2×, 3×, 4×, 5.5×, 6× and 7× their normal per-capita spend. This gives the model data across the whole planning range (Rp0–10B per month, at most ~3.2× current spend per channel) and past each channel's break-even, so saturation is estimated from data. Real XL data would need similar geo experiments to support budgets far above past spend.
- **Controls:** XL promo intensity, competitor promo intensity, Ramadan, Lebaran.
- **KPI:** revenue (IDR million) = baseline (trend, seasonality, controls) + media effect + noise.
- **Media effect:** geometric adstock (channel half-life), then a Hill curve on per-capita spend, with a geo-level efficiency factor.

## Model

Settings in `train_meridian.py`:
- Geo-level Meridian with revenue as the KPI.
- Geometric adstock (max lag 8 weeks), Hill saturation, 13 time knots.
- Priors:
  - ROI ~ LogNormal(0.2, 0.9) and adstock decay ~ Uniform(0, 1): Meridian defaults.
  - Hill slope ~ LogNormal(0.2, 0.4) (median 1.22, 90% prior 0.63–2.35). Meridian fixes the slope at 1 by default, which makes every curve concave; this weak prior lets the data choose the shape.
  - Hill EC ~ LogNormal(1.0, 0.7) (median 2.7× median spend, 90% prior 0.86–8.6×). Meridian's default TruncatedNormal(0.8, 0.8, 0.1, 10) concentrates below 2× median spend; this weak prior covers the tested range.
  - Evidence that saturation is learned from data: the `Data coverage` tab compares each channel's EC posterior and prior intervals, and the estimated half-saturation and break-even with the ground truth.
- Sampler: 4 chains × (500 adapt + 500 burn-in + 500 kept draws).

## Outputs used by the app

For the analysis window (3 Apr 2026 + 20 weeks):
- Per channel:
  - ROI, mROI and incremental revenue (median and 90% interval).
  - Adstock decay and half-life.
  - The response curve at 0–7× current spend (the range the geo tests cover).
  - The spend range in the training data (`observedSpend`), used by the app to mark "Beyond model data".
  - A monthly Hill curve `m × s^α / (s^α + k^α)` fitted to that response curve. This is what the planner, diminishing-return charts and pause planner use.
- Diagnostics: R-hat, R², MAPE, wMAPE.
- Optimization scenarios (in `scenarios.py`): dynamic programming on Meridian's posterior-mean response grid. Guardrails use Meridian's default fixed-budget spend constraints: each channel stays within (1 − 30%) to (1 + 30%) × budget × its historical share, the same rule as the app planner. Budgets go up to Rp10B per month. The flexible-budget scenario (mROI = 1) uses Meridian's flexible default (0–200% of current spend). Meridian's built-in greedy grid search assumes diminishing returns and gave inconsistent allocations while curves are still S-shaped.
- The ground truth, for comparison.

## Re-fitting

```bash
pip install -r meridian/requirements.txt
python meridian/train_meridian.py          # full run (~15 min on a 2-core CPU)
python meridian/train_meridian.py --quick  # smoke test (~3 min, not converged)
python meridian/scenarios.py               # business scenarios (~15 min)
python meridian/export_sheet.py            # results workbook
python scripts/validate_data.py            # checks convergence and that the page uses the new curves
python scripts/build_static.py
```

To use real data, replace `input/xl_geo_weekly.csv` with the same columns. In `train_meridian.py`, skip `write_meridian_input()`, which regenerates the demo CSV.
