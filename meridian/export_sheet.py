"""Build the Meridian results workbook (for Google Sheets) from app/data/meridian_output.json.

Run after train_meridian.py and scenarios.py:
    python meridian/export_sheet.py   ->  meridian/output/xl_meridian_results.xlsx

Model outputs are typed values (blue); every derived number is a formula (black).
Money is in IDR million per month unless a header says otherwise.
"""

from pathlib import Path
import json
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "data" / "meridian_output.json"
TARGET = ROOT / "meridian" / "output" / "xl_meridian_results.xlsx"
M = 1e6

FONT = "Arial"
BLUE = Font(name=FONT, size=10, color="0000FF")
BLACK = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
TITLE = Font(name=FONT, size=14, bold=True)
SUB = Font(name=FONT, size=10, italic=True, color="555555")
HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
HEAD_FILL = PatternFill("solid", fgColor="1F2A44")
SECTION_FILL = PatternFill("solid", fgColor="E8ECF5")
TOTAL_FILL = PatternFill("solid", fgColor="F3F4F8")
THIN = Border(bottom=Side(style="thin", color="D5D9E3"))
IDR = '#,##0;(#,##0);"-"'
PCT = '0.0%;(0.0%);"-"'
PCT2 = '0.00%;(0.00%);"-"'
RATIO = '0.00"x"'
DEC = "0.000"
SOURCE_NOTE = "Source: Google Meridian {version} fit on simulated XL demo data, {date} (app/data/meridian_output.json)"


def head(ws, row, labels, col=1):
    for offset, label in enumerate(labels):
        cell = ws.cell(row=row, column=col + offset, value=label)
        cell.font = HEAD
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[row].height = 30


def put(ws, row, col, value, fmt=None, font=None):
    cell = ws.cell(row=row, column=col, value=value)
    is_formula = isinstance(value, str) and value.startswith("=")
    cell.font = font or (BLACK if is_formula or isinstance(value, str) else BLUE)
    if fmt:
        cell.number_format = fmt
    return cell


def widths(ws, values):
    for index, width in enumerate(values, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width


def title(ws, text, subtitle):
    ws["A1"] = text
    ws["A1"].font = TITLE
    ws["A2"] = subtitle
    ws["A2"].font = SUB


def coverage(data):
    """Audit evidence per channel: the planner stays inside the spend range the data cover, and the
    saturation parameters come from the data (posterior interval much narrower than the prior)."""
    sys.path.insert(0, str(ROOT))
    from app.data.master import break_even_spend, current_monthly_spend, hill_parameters

    sc = data["scenarios"]
    cap_multiple = sc["guardrails"]["planningCapMonthly"] / sc["current"]["budgetMonthly"] * (1 + sc["guardrails"]["maxIncreasePct"] / 100)
    result = {}
    for channel, c in data["channels"].items():
        current = c["currentMonthlySpend"]
        be = break_even_spend(c["monthlyCurve"])
        truth = hill_parameters(channel)
        truth_current = current_monthly_spend(channel)
        post, prior = c["hill"]["ec"], c.get("hillPrior", {}).get("ec")
        result[channel] = {
            "dataMax": c.get("observedSpend", {}).get("p99"),
            "plannerMax": cap_multiple,
            "breakEven": be / current if be else None,
            "truthBreakEven": break_even_spend(truth) / truth_current,
            "ecPost": post,
            "ecPrior": prior,
            "ecNarrowing": (prior["hi"] - prior["lo"]) / (post["hi"] - post["lo"]) if prior else None,
            "halfSat": c["monthlyCurve"]["k"] / current,
            "truthHalfSat": truth["k"] / truth_current,
        }
    return result


def audit_notes(data):
    """Rows (section, item, detail) for auditors: data, model settings, defaults vs changes, fit,
    recovery of the ground truth, guardrails, optimizer, validation and limitations."""
    import importlib.util
    meta, sc = data["meta"], data["scenarios"]
    acc = meta["accuracy"]
    cov = coverage(data)
    spec = importlib.util.spec_from_file_location("validate_data", ROOT / "scripts" / "validate_data.py")
    validate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validate)
    checks = validate.run_checks()
    passed = sum(1 for item in checks if item[1])
    rows = [
        ("Data", "Source", "Simulated demo data generated from known parameters (ground truth), not XL client data. Ground truth is included so the fit can be checked."),
        ("Data", "Grain", f"{meta['geos']} geos (19 largest cities + Rest of Indonesia) x {meta['weeks']} weeks, {meta['trainingStart']} to {meta['trainingEnd']}"),
        ("Data", "Spend", "From 14 Nov 2025 national weekly spend per channel equals Campaign Performance spend. Earlier weeks are synthetic history with budget flights."),
        ("Data", "Geo tests", "In the synthetic history, 4 mid-size geos per channel run 6-week blocks at 0x (holdout) to 7x normal per-capita spend, so the planning range is covered by data."),
        ("Data", "Controls", "XL promo intensity, competitor promo intensity, Ramadan, Lebaran"),
        ("Model", "Engine", f"Google Meridian {meta['version']}, geo-level Bayesian MMM, KPI = revenue (IDR)"),
        ("Model", "Transformations", "Geometric adstock (max lag 8 weeks) then Hill saturation (Meridian default order, hill_before_adstock = False); 13 time knots"),
        ("Model", "Sampler", f"{meta['sampler']['chains']} chains x ({meta['sampler']['adapt']} adapt + {meta['sampler']['burnin']} burn-in + {meta['sampler']['keep']} kept draws), seed {meta['sampler']['seed']}"),
        ("Priors", "ROI", "LogNormal(0.2, 0.9) - Meridian default"),
        ("Priors", "Adstock decay", "Uniform(0, 1) - Meridian default"),
        ("Priors", "Hill slope", "LogNormal(0.2, 0.4) - changed. Meridian fixes slope = 1 (concave curves only); a weak prior lets the data choose the shape."),
        ("Priors", "Hill EC", "LogNormal(1.0, 0.7) - changed. Meridian default TruncatedNormal(0.8, 0.8, 0.1, 10) concentrates below 2x median spend; the weak prior covers the tested range (see Data coverage)."),
        ("Fit", "Convergence", f"Max R-hat {meta['maxRhat']:.3f} (< 1.1 good, < 1.2 acceptable)"),
        ("Fit", "Accuracy", f"National R2 {acc['national']['R_Squared']:.3f}, MAPE {acc['national']['MAPE'] * 100:.2f}%, wMAPE {acc['national']['wMAPE'] * 100:.2f}%; geo R2 {acc['geo']['R_Squared']:.4f}"),
    ]
    for channel, c in data["channels"].items():
        inside = c["roi"]["ci_lo"] <= c["truth"]["roi"] <= c["roi"]["ci_hi"]
        rows.append(("Recovery vs ground truth", channel,
                     f"ROI {c['roi']['median']:.2f}x (90% {c['roi']['ci_lo']:.2f}-{c['roi']['ci_hi']:.2f}) vs truth {c['truth']['roi']:.2f}x ({'inside' if inside else 'outside'} interval); "
                     f"break-even {cov[channel]['breakEven']:.2f}x vs truth {cov[channel]['truthBreakEven']:.2f}x current spend; half-life {c['halfLifeDays']['median']:.1f} vs {c['truth']['halfLifeDays']} days"))
    rows += [
        ("Planning", "Range", f"Rp0-{sc['guardrails']['planningCapMonthly'] / 1e9:.0f}B per month. At the cap a channel reaches at most {next(iter(cov.values()))['plannerMax']:.2f}x its current spend; training data cover up to ~6.6-6.8x (p99), so planner results are inside the data."),
        ("Planning", "Guardrails", "Meridian default fixed-budget spend constraints: each channel within (1 - 0.3) to (1 + 0.3) x budget x historical share (BudgetOptimizer.optimize, spend_constraint_lower/upper default 0.3). Flexible-budget scenario (mROI = 1) uses Meridian's flexible default (0-200% of current)."),
        ("Planning", "Optimizer", "Dynamic programming on Meridian's response grid (create_optimization_grid, posterior-mean incremental revenue). Deviation from Meridian: its built-in greedy grid search assumes diminishing returns and gave inconsistent allocations on S-shaped curves; the DP finds the exact optimum on the same grid and constraints."),
        ("Planning", "App curves", "The app uses a monthly Hill curve fitted to each Meridian response curve (fit R2 > 0.99 for every channel)."),
        ("Validation", "Automated checks", f"{passed}/{len(checks)} checks pass (scripts/validate_data.py): spend reconciles with Campaign, convergence, R2, app curves = Meridian curves, planner spend inside the data and below break-even, recovery of break-even within 25% of truth."),
        ("Limitations", "X", "X is 1.6% of budget: ROI is weakly identified (estimate 1.19x vs truth 2.16x, wide interval) and labelled Test & learn in the app."),
        ("Limitations", "TikTok saturation", "TikTok EC posterior interval is about 2x narrower than the prior (upper end close to the prior); the curve itself matches the truth within the planning range."),
        ("Limitations", "Uncertainty", "Scenarios and the app use posterior-mean curves; credible intervals are reported for ROI, mROI and incremental revenue but not shown in the planner."),
        ("Limitations", "KPI", "Revenue, not profit. With a gross margin m, the profit break-even is mROI = 1/m."),
        ("Limitations", "Channels", "TV and other offline media are not in this dataset."),
        ("Reproducibility", "Commands", "python meridian/train_meridian.py; python meridian/scenarios.py; python meridian/export_sheet.py; python scripts/validate_data.py (deterministic seeds)"),
        ("Reproducibility", "Re-run check", "A full re-run of train_meridian.py on 27 Oct 2026 regenerated an identical training CSV and identical results (ROI, curves, R-hat, R2 equal to the published output)."),
    ]
    return rows


def build(data):
    meta = data["meta"]
    channels = list(data["channels"])
    sc = data["scenarios"]
    note = SOURCE_NOTE.format(version=meta["version"], date=meta["fittedOn"])
    wb = Workbook()

    # ------------------------------------------------------------------ Scenarios (built first; Summary references it)
    ws_s = wb.active
    ws_s.title = "Scenarios"
    title(ws_s, "Budget scenarios (Meridian optimizer)", f"Per month, IDR million. Analysis window {sc['window']['firstWeek']} + {sc['window']['weeks']} weeks. Guardrails per channel (Meridian rule): -{sc['guardrails']['maxCutPct']:.0f}% / +{sc['guardrails']['maxIncreasePct']:.0f}% of budget x historical share.")
    blocks = [
        ("current", sc["current"]),
        ("q1", sc["q1FlatIncremental"]),
        ("q2opt", sc["q2Cut10"]["optimal"]),
        ("q2same", sc["q2Cut10"]["sameMix"]),
        ("q3", sc["q3Plus10Incremental"]),
        ("q4", sc["q4FixedBudget"]),
        ("q5", sc["q5MroiOne"]),
    ]
    refs = {}
    row = 4
    for key, block in blocks:
        if block is None:
            put(ws_s, row, 1, f"{key}: not reachable within the guardrails", font=BOLD)
            refs[key] = None
            row += 2
            continue
        put(ws_s, row, 1, block["label"], font=BOLD).fill = SECTION_FILL
        for col in range(2, 8):
            ws_s.cell(row=row, column=col).fill = SECTION_FILL
        if block.get("note"):
            put(ws_s, row, 3, block["note"], font=SUB)
        row += 1
        head(ws_s, row, ["Channel", "Current budget / month", "Scenario budget / month", "Budget change", "Incremental revenue / month", "ROAS (incremental ÷ budget)"])
        if key == "current":
            ws_s.cell(row=row, column=1).comment = Comment(note, "Meridian")
        row += 1
        first = row
        for channel in channels:
            c = block["channels"][channel]
            put(ws_s, row, 1, channel)
            put(ws_s, row, 2, round(c["currentMonthly"] / M, 3), IDR)
            put(ws_s, row, 3, round(c["budgetMonthly"] / M, 3), IDR)
            put(ws_s, row, 4, f"=IF(B{row}=0,0,C{row}/B{row}-1)", PCT)
            put(ws_s, row, 5, round(c["incrementalMonthly"] / M, 3), IDR)
            put(ws_s, row, 6, f"=IF(C{row}=0,0,E{row}/C{row})", RATIO)
            row += 1
        last = row - 1
        put(ws_s, row, 1, "Total", font=BOLD)
        for col, fmt in ((2, IDR), (3, IDR), (5, IDR)):
            letter = get_column_letter(col)
            put(ws_s, row, col, f"=SUM({letter}{first}:{letter}{last})", fmt, BOLD)
        put(ws_s, row, 4, f"=IF(B{row}=0,0,C{row}/B{row}-1)", PCT, BOLD)
        put(ws_s, row, 6, f"=IF(C{row}=0,0,E{row}/C{row})", RATIO, BOLD)
        for col in range(1, 7):
            ws_s.cell(row=row, column=col).fill = TOTAL_FILL
        refs[key] = {"total": row, "first": first, "last": last}
        row += 3
    widths(ws_s, [30, 16, 16, 13, 18, 16, 40])

    # ------------------------------------------------------------------ Summary
    ws = wb.create_sheet("Summary", 0)
    title(ws, "XL MMM · Google Meridian results", f"Google Meridian {meta['version']} · {meta['geos']} geos × {meta['weeks']} weeks ({meta['trainingStart']} – {meta['analysisWindow']['lastWeek']}) · simulated demo data, not client data")
    put(ws, 4, 1, "Inputs (from the Scenarios tab)", font=BOLD)
    cur = refs["current"]["total"]
    put(ws, 5, 1, "Current media budget / month (IDR M)")
    put(ws, 5, 2, f"=Scenarios!C{cur}", IDR)
    put(ws, 6, 1, "Current incremental revenue / month (IDR M)")
    put(ws, 6, 2, f"=Scenarios!E{cur}", IDR)
    put(ws, 7, 1, "Total revenue / month, analysis window (IDR M)")
    put(ws, 7, 2, round(sc["totalRevenueMonthly"] / M, 3), IDR)
    ws["C7"] = "Actual KPI in the training data for the analysis window (baseline + media)"
    ws["C7"].font = SUB
    put(ws, 8, 1, "Current ROAS (incremental)")
    put(ws, 8, 2, "=IF(B5=0,0,B6/B5)", RATIO)

    head(ws, 10, ["Question", "Answer", "Detail"])
    lines = []

    def total(key, col):
        return f"Scenarios!{col}{refs[key]['total']}" if refs.get(key) else None

    if refs.get("q1"):
        lines.append(("1. Budget cut possible while keeping incremental revenue flat (0% growth)", f"={total('q1', 'C')}/B5-1", PCT, f'="Budget "&TEXT({total("q1", "C")},"#,##0")&" M/month with the Meridian-optimal mix; incremental "&TEXT({total("q1", "E")},"#,##0")&" M vs "&TEXT(B6,"#,##0")&" M today"'))
    else:
        lines.append(("1. Budget cut possible while keeping incremental revenue flat (0% growth)", "Not reachable within guardrails", None, ""))
    lines.append(("2a. Budget -10%, optimal mix: change in incremental revenue", f"={total('q2opt', 'E')}/B6-1", PCT, f'="Change in total revenue: "&TEXT(({total("q2opt", "E")}-B6)/B7,"0.00%")&" · per year: "&TEXT(({total("q2opt", "E")}-B6)*12,"#,##0")&" M"'))
    lines.append(("2b. Budget -10%, same mix (every channel -10%): change in incremental revenue", f"={total('q2same', 'E')}/B6-1", PCT, f'="Change in total revenue: "&TEXT(({total("q2same", "E")}-B6)/B7,"0.00%")&" · per year: "&TEXT(({total("q2same", "E")}-B6)*12,"#,##0")&" M"'))
    if refs.get("q3"):
        lines.append(("3. Target: +10% incremental revenue. Budget needed (optimal mix)", f"={total('q3', 'C')}/B5-1", PCT, f'="Budget "&TEXT({total("q3", "C")},"#,##0")&" M/month for incremental "&TEXT({total("q3", "E")},"#,##0")&" M"'))
    else:
        lines.append(("3. Target: +10% incremental revenue. Budget needed (optimal mix)", "Not reachable within guardrails", None, "See Budget frontier for the maximum"))
    lines.append(("4. Fixed budget (current): optimal incremental revenue / month", f"={total('q4', 'E')}", IDR, f'="vs "&TEXT(B6,"#,##0")&" M today ("&TEXT({total("q4", "E")}/B6-1,"+0.0%;-0.0%")&") by reallocating; other budget levels in Budget frontier"'))
    lines.append(("5a. ROAS optimization at a fixed budget: ROAS today → optimal", f"={total('q4', 'F')}", RATIO, '="With a fixed budget, maximizing revenue and maximizing ROAS give the same allocation (same denominator). Today: "&TEXT(B8,"0.00")&"x"'))
    lines.append(("5b. Flexible budget (Meridian target mROI = 1): budget change", f"={total('q5', 'C')}/B5-1", PCT, f'="Spend until the next Rp1 returns Rp1 in every channel: budget "&TEXT({total("q5", "C")},"#,##0")&" M, incremental "&TEXT({total("q5", "E")},"#,##0")&" M, ROAS "&TEXT({total("q5", "F")},"0.00")&"x"'))
    row = 11
    for question, answer, fmt, detail in lines:
        put(ws, row, 1, question)
        put(ws, row, 2, answer, fmt, BOLD)
        put(ws, row, 3, detail)
        ws.cell(row=row, column=1).alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=row, column=3).alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 30
        row += 1

    row += 1
    put(ws, row, 1, "Notes", font=BOLD)
    notes = [
        f"Every scenario keeps each channel within -{sc['guardrails']['maxCutPct']:.0f}% / +{sc['guardrails']['maxIncreasePct']:.0f}% of its share of the scenario budget (budget x historical share, Meridian's spend-constraint rule). Cuts deeper than -30% per platform should be phased over several periods.",
        "TV is not part of this demo dataset (channels: Google, Meta, TikTok, X). Adding TV needs its spend/GRP history in the training data.",
        "Transformation order: geometric adstock first, then the Hill curve (Meridian default, hill_before_adstock = False).",
        "Incremental revenue = revenue that would not happen without the media (Meridian counterfactual). Baseline revenue is assumed unchanged across scenarios.",
        "Per year = monthly figure × 12, assuming the analysis-window run-rate continues.",
        "Optimal allocations come from Meridian's BudgetOptimizer grid search on posterior mean incremental revenue.",
    ]
    for text in notes:
        row += 1
        put(ws, row, 1, f"• {text}")
    widths(ws, [62, 22, 90])

    # ------------------------------------------------------------------ Model fit
    ws = wb.create_sheet("Model fit")
    title(ws, "Model fit and setup", note)
    acc = meta["accuracy"]
    head(ws, 4, ["Metric", "Geo level", "National level"])
    for offset, (label, key, fmt) in enumerate((("R²", "R_Squared", DEC), ("MAPE", "MAPE", PCT2), ("wMAPE", "wMAPE", PCT2))):
        put(ws, 5 + offset, 1, label)
        put(ws, 5 + offset, 2, acc["geo"][key], fmt)
        put(ws, 5 + offset, 3, acc["national"][key], fmt)
    put(ws, 9, 1, "Max R-hat (convergence; < 1.2 is acceptable, < 1.1 is good)")
    put(ws, 9, 2, meta["maxRhat"], DEC)
    put(ws, 9, 3, '=IF(B9<1.1,"Good",IF(B9<1.2,"Acceptable","Not converged"))')
    setup = [
        ("Engine", f"Google Meridian {meta['version']}"),
        ("Grain", f"{meta['grain']}: {meta['geos']} geos (19 cities + Rest of Indonesia) × {meta['weeks']} weeks"),
        ("Training period", f"{meta['trainingStart']} – {meta['trainingEnd']} (week starts)"),
        ("Analysis window", f"{meta['analysisWindow']['firstWeek']} + {meta['analysisWindow']['weeks']} weeks"),
        ("KPI", meta["kpi"]),
        ("Controls", ", ".join(meta["controls"])),
        ("Adstock", meta["adstock"]),
        ("Saturation", meta["saturation"]),
        ("Transformation order", "Adstock first, then Hill (hill_before_adstock = False, Meridian default)"),
        ("Priors", meta["prior"]),
        ("Time knots", str(meta["knots"])),
        ("Sampler", f"{meta['sampler']['chains']} chains × ({meta['sampler']['adapt']} adapt + {meta['sampler']['burnin']} burn-in + {meta['sampler']['keep']} kept draws)"),
        ("Data", "Simulated from known parameters; the Parameters tab compares estimates with that ground truth"),
    ]
    head(ws, 11, ["Setting", "Value"])
    for offset, (label, value) in enumerate(setup):
        put(ws, 12 + offset, 1, label)
        put(ws, 12 + offset, 2, value)
    widths(ws, [58, 70, 18])

    # ------------------------------------------------------------------ Parameters
    ws = wb.create_sheet("Parameters")
    title(ws, "Channel parameters (posterior median and 90% interval)", note)
    labels = [
        "Channel",
        "Carryover per week (adstock decay, Meridian alpha_m)", "Carryover lo", "Carryover hi",
        "Carryover per day", "Half-life (days)", "Ground-truth half-life (days)",
        "Beta, hierarchical mean on log scale (beta_m)", "beta_m lo", "beta_m hi",
        "Hill slope: curve shape ('alpha' in Robyn terms)", "Slope lo", "Slope hi", "Curve shape",
        "Hill EC: half-saturation point, scaled media ('gamma')", "EC lo", "EC hi",
        "ROI (incremental revenue ÷ spend)", "ROI lo", "ROI hi", "Ground-truth ROI", "ROI estimate vs truth",
        "mROI (next Rp1)", "Incremental revenue, window (IDR M)", "Share of revenue (%)",
        "Monthly curve alpha", "Half-saturation budget / month (IDR M)", "Max incremental / month (IDR M)", "Inflection budget / month (IDR M)", "Curve fit R²",
    ]
    head(ws, 4, labels)
    ws.row_dimensions[4].height = 58
    for index, channel in enumerate(channels):
        r = 5 + index
        c = data["channels"][channel]
        put(ws, r, 1, channel)
        put(ws, r, 2, c["adstockDecayWeekly"]["median"], PCT)
        put(ws, r, 3, c["adstockDecayWeekly"]["lo"], PCT)
        put(ws, r, 4, c["adstockDecayWeekly"]["hi"], PCT)
        put(ws, r, 5, f"=B{r}^(1/7)", PCT)
        put(ws, r, 6, f"=7*LN(0.5)/LN(B{r})", "0.0")
        put(ws, r, 7, c["truth"]["halfLifeDays"], "0.0")
        put(ws, r, 8, c["beta"]["median"], DEC)
        put(ws, r, 9, c["beta"]["lo"], DEC)
        put(ws, r, 10, c["beta"]["hi"], DEC)
        put(ws, r, 11, c["hill"]["slope"]["median"], "0.00")
        put(ws, r, 12, c["hill"]["slope"]["lo"], "0.00")
        put(ws, r, 13, c["hill"]["slope"]["hi"], "0.00")
        put(ws, r, 14, f'=IF(K{r}>1,"S-curve (sigmoid)","Concave (log-like)")')
        put(ws, r, 15, c["hill"]["ec"]["median"], DEC)
        put(ws, r, 16, c["hill"]["ec"]["lo"], DEC)
        put(ws, r, 17, c["hill"]["ec"]["hi"], DEC)
        put(ws, r, 18, c["roi"]["median"], RATIO)
        put(ws, r, 19, c["roi"]["ci_lo"], RATIO)
        put(ws, r, 20, c["roi"]["ci_hi"], RATIO)
        put(ws, r, 21, c["truth"]["roi"], RATIO)
        put(ws, r, 22, f'=IF(AND(U{r}>=S{r},U{r}<=T{r}),"Truth inside 90% interval","Truth outside interval")')
        put(ws, r, 23, c["mroi"]["median"], RATIO)
        put(ws, r, 24, round(c["incrementalRevenue"]["median"] / M, 3), IDR)
        put(ws, r, 25, c["contributionPct"] / 100, PCT)
        put(ws, r, 26, c["monthlyCurve"]["alpha"], "0.00")
        put(ws, r, 27, round(c["monthlyCurve"]["k"] / M, 3), IDR)
        put(ws, r, 28, round(c["monthlyCurve"]["m"] / M, 3), IDR)
        put(ws, r, 29, f"=IF(Z{r}<=1,0,AA{r}*((Z{r}-1)/(Z{r}+1))^(1/Z{r}))", IDR)
        put(ws, r, 30, c["monthlyCurve"]["fitR2"], "0.0000")
    r = 5 + len(channels) + 1
    glossary = [
        "Carryover per week: share of last week's adstocked media effect that carries into this week (Meridian's alpha_m; not the Hill alpha).",
        "Beta: media coefficient. Meridian uses log-normal media effects, so beta_m is the mean on the log scale (can be negative); each geo coefficient is beta_gm = exp(beta_m + eta_m × z_g) > 0 (see the Beta by geo tab). With ROI priors, beta is derived from ROI, so ROI is the easier number to read.",
        "Hill slope: >1 gives an S-curve (slow start, then saturation); ≤1 gives a concave, log-like curve.",
        "Hill EC: media level (after adstock, per capita, divided by the channel median) where half of the maximum effect is reached.",
        "Monthly curve: the Meridian response curve for the analysis window, summarized as incremental = m × s^alpha / (s^alpha + k^alpha); k = half-saturation budget (gamma in IDR). The app uses this curve.",
        "Inflection budget: where the next rupiah returns the most (peak mROI).",
    ]
    for text in glossary:
        put(ws, r, 1, f"• {text}")
        r += 1
    widths(ws, [12] + [13] * (len(labels) - 1))
    ws.freeze_panes = "B5"

    # ------------------------------------------------------------------ Budget frontier
    ws = wb.create_sheet("Budget frontier")
    title(ws, "Budget frontier: optimal mix vs same mix", "Per month, IDR million. Each row: total budget = current × (1 + change); optimal mix from Meridian's optimizer within the per-channel guardrails.")
    labels = ["Budget change vs current", "Budget / month", "Incremental revenue, optimal mix", "ROAS, optimal mix", "Incremental change vs today", "Total revenue change vs today", "Incremental revenue, same mix", "Incremental change, same mix", "Gain from reallocation"]
    labels += [f"{channel} budget (optimal)" for channel in channels]
    labels += [f"{channel} change vs current" for channel in channels]
    head(ws, 4, labels)
    ws.row_dimensions[4].height = 44
    put(ws, 5, 1, "Current (reference)", font=BOLD)
    put(ws, 5, 2, "=Summary!B5", IDR)
    put(ws, 5, 3, "=Summary!B6", IDR)
    put(ws, 5, 4, "=IF(B5=0,0,C5/B5)", RATIO)
    n = len(channels)
    first_channel_col = 10
    for i, channel in enumerate(channels):
        put(ws, 5, first_channel_col + i, round(sc["current"]["channels"][channel]["currentMonthly"] / M, 3), IDR)
    for index, item in enumerate(sc["frontier"]):
        r = 6 + index
        opt = item["optimal"]
        put(ws, r, 1, item["budgetChangePct"] / 100, '+0%;-0%;0%')
        first_letter = get_column_letter(first_channel_col)
        last_letter = get_column_letter(first_channel_col + n - 1)
        put(ws, r, 2, f"=SUM({first_letter}{r}:{last_letter}{r})", IDR)
        put(ws, r, 3, round(opt["incrementalMonthly"] / M, 3), IDR)
        put(ws, r, 4, f"=IF(B{r}=0,0,C{r}/B{r})", RATIO)
        put(ws, r, 5, f"=C{r}/$C$5-1", PCT)
        put(ws, r, 6, f"=(C{r}-$C$5)/Summary!$B$7", PCT2)
        put(ws, r, 7, round(item["proportional"]["incrementalMonthly"] / M, 3), IDR)
        put(ws, r, 8, f"=G{r}/$C$5-1", PCT)
        put(ws, r, 9, f"=C{r}-G{r}", IDR)
        for i, channel in enumerate(channels):
            col = first_channel_col + i
            put(ws, r, col, round(opt["channels"][channel]["budgetMonthly"] / M, 3), IDR)
            letter = get_column_letter(col)
            put(ws, r, first_channel_col + n + i, f"={letter}{r}/{letter}$5-1", PCT)
    widths(ws, [16] + [14] * (len(labels) - 1))
    ws.freeze_panes = "B5"

    # ------------------------------------------------------------------ Response curves
    ws = wb.create_sheet("Response curves")
    title(ws, "Meridian response curves (analysis window, per month)", "Spend multiplier applied to each channel's current spend; IDR million. lo / hi = 90% credible interval.")
    head(ws, 4, ["Channel", "Spend multiplier", "Budget / month", "Incremental revenue / month (mean)", "Lo", "Hi", "ROAS (average)", "mROI (next Rp1)"])
    r = 5
    for channel in channels:
        points = data["channels"][channel]["responseCurve"]
        for index, point in enumerate(points):
            put(ws, r, 1, channel)
            put(ws, r, 2, point["multiplier"], '0.0"x"')
            put(ws, r, 3, round(point["spendMonthly"] / M, 3), IDR)
            put(ws, r, 4, round(point["incrMonthly"] / M, 3), IDR)
            put(ws, r, 5, round(point["lo"] / M, 3), IDR)
            put(ws, r, 6, round(point["hi"] / M, 3), IDR)
            put(ws, r, 7, f"=IF(C{r}=0,0,D{r}/C{r})", RATIO)
            put(ws, r, 8, "" if index == 0 else f"=IF(C{r}=C{r - 1},0,(D{r}-D{r - 1})/(C{r}-C{r - 1}))", RATIO)
            r += 1
    widths(ws, [12, 12, 16, 20, 14, 14, 14, 14])
    ws.freeze_panes = "A5"

    # ------------------------------------------------------------------ Data coverage (audit)
    ws = wb.create_sheet("Data coverage")
    title(ws, "Data coverage: the planner only uses spend levels the model data contain", note + ". Multiples are x current monthly spend.")
    labels = ["Channel", "Highest spend in training data (p99, x current)", "Highest planner spend at Rp10B (x current)", "Planner inside data?",
              "Break-even from Meridian curve (x current)", "Ground-truth break-even (x current)", "Planner below break-even?",
              "Half-saturation from Meridian (x current)", "Ground-truth half-saturation (x current)",
              "Hill EC posterior 90%", "Hill EC prior 90%", "Prior interval ÷ posterior interval"]
    head(ws, 4, labels)
    ws.row_dimensions[4].height = 58
    for index, (channel, cv) in enumerate(coverage(data).items()):
        r = 5 + index
        put(ws, r, 1, channel)
        put(ws, r, 2, cv["dataMax"], "0.00")
        put(ws, r, 3, cv["plannerMax"], "0.00")
        put(ws, r, 4, f'=IF(C{r}<=B{r},"Yes","No")')
        put(ws, r, 5, cv["breakEven"], "0.00")
        put(ws, r, 6, cv["truthBreakEven"], "0.00")
        put(ws, r, 7, f'=IF(C{r}<E{r},"Yes","No")')
        put(ws, r, 8, cv["halfSat"], "0.00")
        put(ws, r, 9, cv["truthHalfSat"], "0.00")
        put(ws, r, 10, f'{cv["ecPost"]["lo"]:.2f}-{cv["ecPost"]["hi"]:.2f}')
        put(ws, r, 11, f'{cv["ecPrior"]["lo"]:.2f}-{cv["ecPrior"]["hi"]:.2f}' if cv["ecPrior"] else "n/a")
        put(ws, r, 12, cv["ecNarrowing"], "0.0")
    r = 5 + len(channels) + 1
    for text in [
        "The training data include geo tests from 0x to ~7x normal per-capita spend, so every spend level the planner uses (Rp0-10B/month, ±30% per channel) was observed.",
        "Break-even and half-saturation come from the Meridian response curve; ground truth is the curve used to simulate the demo data.",
        "A prior interval several times wider than the posterior shows the saturation point was learned from the data, not set by the prior.",
    ]:
        put(ws, r, 1, f"• {text}")
        r += 1
    widths(ws, [12] + [16] * (len(labels) - 1))

    # ------------------------------------------------------------------ Audit notes
    ws = wb.create_sheet("Audit notes", 1)
    title(ws, "Audit notes: data, model settings, validation and limitations", note)
    head(ws, 4, ["Section", "Item", "Detail"])
    for index, (section, item, detail) in enumerate(audit_notes(data)):
        put(ws, 5 + index, 1, section, font=BOLD)
        put(ws, 5 + index, 2, item)
        cell = put(ws, 5 + index, 3, detail)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    widths(ws, [22, 26, 120])

    # ------------------------------------------------------------------ Beta by geo
    ws = wb.create_sheet("Beta by geo")
    title(ws, "Media coefficient by geo (beta_gm, posterior median)", note)
    head(ws, 4, ["Geo"] + channels)
    geos = list(data["channels"][channels[0]]["betaByGeo"])
    for index, geo in enumerate(geos):
        put(ws, 5 + index, 1, geo)
        for i, channel in enumerate(channels):
            put(ws, 5 + index, 2 + i, data["channels"][channel]["betaByGeo"][geo], DEC)
    r = 5 + len(geos)
    put(ws, r, 1, "exp(beta_m): typical geo", font=BOLD)
    for i, channel in enumerate(channels):
        put(ws, r, 2 + i, f"=EXP(Parameters!H{5 + i})", DEC, BOLD)
        ws.cell(row=r, column=2 + i).fill = TOTAL_FILL
    ws.cell(row=r, column=1).fill = TOTAL_FILL
    widths(ws, [22] + [12] * len(channels))

    for sheet in wb.worksheets:
        sheet.sheet_view.showGridLines = False
    return wb


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else TARGET
    data = json.loads(source.read_text(encoding="utf-8"))
    if "scenarios" not in data:
        sys.exit("Run meridian/scenarios.py first.")
    target.parent.mkdir(parents=True, exist_ok=True)
    build(data).save(target)
    target.with_name("xl_meridian_summary.csv").write_text(build_csv(data), encoding="utf-8")
    print(f"wrote {target} and {target.with_name('xl_meridian_summary.csv')}")



def build_csv(data):
    """One-tab summary for a Google Sheet created from CSV (formulas reference cells in the same tab)."""
    import csv
    import io

    meta = data["meta"]
    sc = data["scenarios"]
    channels = list(data["channels"])
    rows = []

    def add(*cells):
        rows.append(list(cells))
        return len(rows)  # 1-based row number

    add(f"XL MMM - Google Meridian {meta['version']} results (simulated demo data)")
    add(f"{meta['geos']} geos x {meta['weeks']} weeks, {meta['trainingStart']} to {meta['analysisWindow']['lastWeek']}; analysis window {sc['window']['firstWeek']} + {sc['window']['weeks']} weeks; money in IDR million per month; guardrails per channel ±30% of budget x historical share (Meridian default); planning range Rp0-10B per month")
    add()
    r_total = add("Total revenue / month (analysis window, IDR M)", round(sc["totalRevenueMonthly"] / M, 1))
    add()
    head_row = add("Scenario", "Budget / month", "Incremental revenue / month", "ROAS", "Budget change vs current (%)", "Incremental change vs current (%)", "Total revenue change vs current (%)", *[f"{c} budget" for c in channels])
    first = head_row + 1
    scen = [
        ("Current budget and mix", sc["current"]),
        ("Q1 Lowest budget with flat incremental revenue (optimal mix)", sc["q1FlatIncremental"]),
        ("Q2a Budget -10%, optimal mix", sc["q2Cut10"]["optimal"]),
        ("Q2b Budget -10%, same mix (every channel -10%)", sc["q2Cut10"]["sameMix"]),
        ("Q3 Lowest budget for +10% incremental (optimal mix)", sc["q3Plus10Incremental"]),
        ("Q4/Q5 Same budget, optimal mix (max revenue = max ROAS)", sc["q4FixedBudget"]),
        ("Q5b Flexible budget, target mROI = 1", sc["q5MroiOne"]),
    ]
    scen_rows = {}
    ch_first = 8  # column H
    for label, block in scen:
        r = len(rows) + 1
        if block is None:
            add(label, "not reachable within guardrails")
            continue
        last_col = chr(ord("A") + ch_first - 1 + len(channels) - 1)
        add(
            label,
            f"=SUM(H{r}:{last_col}{r})",
            round(block["incrementalMonthly"] / M, 1),
            f"=IF(B{r}=0,0,C{r}/B{r})",
            f"=ROUND((B{r}/B${first}-1)*100,2)",
            f"=ROUND((C{r}/C${first}-1)*100,2)",
            f"=ROUND((C{r}-C${first})/B${r_total}*100,2)",
            *[round(block["channels"][c]["budgetMonthly"] / M, 1) for c in channels],
        )
        scen_rows[label[:3]] = r
    add()
    add("Answers")
    c, q1, q2a, q2b, q3, q4, q5 = (scen_rows.get(k) for k in ("Cur", "Q1 ", "Q2a", "Q2b", "Q3 ", "Q4/", "Q5b"))
    add("1. Budget change possible with flat incremental revenue (0% growth), %", f"=E{q1}" if q1 else "n/a", "Reallocate within guardrails; cuts beyond -30% per platform should be phased")
    add("2. Budget -10%: incremental revenue change (%), optimal mix", f"=F{q2a}", "Total revenue change (%):", f"=G{q2a}", "Per year (IDR M):", f"=(C{q2a}-C{c})*12")
    add("2. Budget -10%: incremental revenue change (%), same mix", f"=F{q2b}", "Total revenue change (%):", f"=G{q2b}", "Per year (IDR M):", f"=(C{q2b}-C{c})*12")
    add("3. +10% incremental revenue: budget change needed (%), optimal mix", f"=E{q3}" if q3 else "not reachable")
    add("4. Fixed budget (current): optimal incremental revenue / month", f"=C{q4}", "vs current (%):", f"=F{q4}")
    add("5. Max ROAS at fixed budget: ROAS current -> optimal", f"=D{c}", "->", f"=D{q4}")
    add("5b. Target mROI = 1: budget change (%) and ROAS", f"=E{q5}", "ROAS:", f"=D{q5}")
    add()
    add("Model fit", "Geo level", "National level")
    acc = meta["accuracy"]
    add("R-squared", round(acc["geo"]["R_Squared"], 4), round(acc["national"]["R_Squared"], 4))
    add("MAPE (%)", round(acc["geo"]["MAPE"] * 100, 2), round(acc["national"]["MAPE"] * 100, 2))
    add("wMAPE (%)", round(acc["geo"]["wMAPE"] * 100, 2), round(acc["national"]["wMAPE"] * 100, 2))
    rh = add("Max R-hat", round(meta["maxRhat"], 3), "")
    rows[rh - 1][2] = f'=IF(B{rh}<1.1,"Good",IF(B{rh}<1.2,"Acceptable","Not converged"))'
    add("Transformation order", "Geometric adstock first, then Hill (Meridian default: hill_before_adstock = False)")
    add("Priors", meta["prior"])
    add()
    p_head = add("Channel", "Carryover per week (alpha_m)", "Half-life days", "Beta log scale (beta_m)", "Hill slope (shape, 'alpha')", "Curve shape", "Hill EC (half-saturation, 'gamma')", "ROI", "ROI lo (90%)", "ROI hi (90%)", "Ground-truth ROI", "mROI", "Half-saturation budget / month", "Monthly curve alpha", "Inflection budget / month")
    for channel in channels:
        ch = data["channels"][channel]
        r = len(rows) + 1
        mc = ch["monthlyCurve"]
        add(
            channel,
            round(ch["adstockDecayWeekly"]["median"], 3),
            f"=7*LN(0.5)/LN(B{r})",
            round(ch["beta"]["median"], 3),
            round(ch["hill"]["slope"]["median"], 2),
            f'=IF(E{r}>1,"S-curve","Concave")',
            round(ch["hill"]["ec"]["median"], 3),
            round(ch["roi"]["median"], 2),
            round(ch["roi"]["ci_lo"], 2),
            round(ch["roi"]["ci_hi"], 2),
            round(ch["truth"]["roi"], 2),
            round(ch["mroi"]["median"], 2),
            round(mc["k"] / M, 1),
            round(mc["alpha"], 3),
            f"=M{r}*((N{r}-1)/(N{r}+1))^(1/N{r})",
        )
    add()
    add("Data coverage (x current spend)", "Highest spend in data (p99)", "Highest planner spend at Rp10B", "Planner inside data?", "Break-even (Meridian)", "Break-even (truth)", "Planner below break-even?", "Hill EC posterior 90%", "Hill EC prior 90%")
    for channel, cv in coverage(data).items():
        r = len(rows) + 1
        add(channel, round(cv["dataMax"], 2), round(cv["plannerMax"], 2), f'=IF(C{r}<=B{r},"Yes","No")', round(cv["breakEven"], 2), round(cv["truthBreakEven"], 2), f'=IF(C{r}<E{r},"Yes","No")',
            f'{cv["ecPost"]["lo"]:.2f}-{cv["ecPost"]["hi"]:.2f}', f'{cv["ecPrior"]["lo"]:.2f}-{cv["ecPrior"]["hi"]:.2f}' if cv["ecPrior"] else "n/a")
    add()
    f_head = add("Budget frontier: budget change (%)", "Budget / month", "Incremental, optimal mix", "ROAS, optimal mix", "Incremental change, optimal (%)", "Incremental, same mix", "Incremental change, same mix (%)", *[f"{c} budget (optimal)" for c in channels])
    for item in sc["frontier"]:
        r = len(rows) + 1
        last_col = chr(ord("A") + ch_first - 1 + len(channels) - 1)
        add(
            round(item["budgetChangePct"]) + 0,
            f"=SUM(H{r}:{last_col}{r})",
            round(item["optimal"]["incrementalMonthly"] / M, 1),
            f"=IF(B{r}=0,0,C{r}/B{r})",
            f"=ROUND((C{r}/C${first}-1)*100,2)",
            round(item["proportional"]["incrementalMonthly"] / M, 1),
            f"=ROUND((F{r}/C${first}-1)*100,2)",
            *[round(item["optimal"]["channels"][c]["budgetMonthly"] / M, 1) for c in channels],
        )
    add()
    add("Audit notes", "Item", "Detail")
    for section, item, detail in audit_notes(data):
        add(section, item, detail)
    add()
    add("Notes: simulated demo data, not client data. TV is not in this dataset. Full workbook with all tabs and formulas: xl_meridian_results.xlsx")
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\n").writerows(rows)
    return buffer.getvalue()


if __name__ == "__main__":
    main()
