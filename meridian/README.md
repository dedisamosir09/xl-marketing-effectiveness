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
- **Controls:** XL promo intensity, competitor promo intensity, Ramadan, Lebaran.
- **KPI:** revenue (IDR million) = baseline (trend, seasonality, controls) + media effect + noise.
- **Media effect:** geometric adstock (channel half-life), then a Hill curve on per-capita spend, with a geo-level efficiency factor.

## Model

Settings in `train_meridian.py`:
- Geo-level Meridian with revenue as the KPI.
- Geometric adstock (max lag 8 weeks), Hill saturation, 13 time knots.
- Priors:
  - ROI ~ LogNormal(0.3, 0.6) for every channel (median 1.35x).
  - Hill slope ~ LogNormal(0.7, 0.4). Meridian fixes the slope at 1 by default, which makes every curve concave. Estimating it allows S-shaped curves and therefore an efficient range.
- Sampler: 4 chains × (500 adapt + 500 burn-in + 500 kept draws).

## Outputs used by the app

For the analysis window (3 Apr 2026 + 20 weeks):
- Per channel:
  - ROI, mROI and incremental revenue (median and 90% interval).
  - Adstock decay and half-life.
  - The response curve at 0–3× spend.
  - A monthly Hill curve `m × s^α / (s^α + k^α)` fitted to that response curve. This is what the planner, diminishing-return charts and pause planner use.
- Diagnostics: R-hat, R², MAPE, wMAPE.
- Meridian's own fixed-budget optimization (±30%).
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
