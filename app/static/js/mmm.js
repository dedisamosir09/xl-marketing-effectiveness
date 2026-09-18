(() => {
  const root = document.querySelector("[data-mmm-dashboard]");
  if (!root) return;

  const state = {
    dateStart: "2026-04-03",
    dateEnd: "2026-08-24",
    product: "Prepaid",
    kpi: "Revenue",
    responseChannel: "Meta",
    plannerMode: "budget",
    planningUnit: "month",
    planningStart: "2026-08-25",
    planningPeriods: 3,
    maxDecrease: 30,
    maxIncrease: 60,
    primaryValue: 0,
    locked: new Set(),
    manualBudgets: {},
    lastScenario: null,
    savedScenarios: [],
  };

  const elements = {
    status: root.querySelector("[data-mmm-status]"),
    scopeCopy: root.querySelector("[data-mmm-scope-copy]"),
    scorecards: root.querySelector("[data-mmm-scorecards]"),
    trend: root.querySelector("[data-mmm-trend]"),
    decomposition: root.querySelector("[data-mmm-decomposition]"),
    channelMatrix: root.querySelector("[data-mmm-channel-matrix]"),
    channelTable: root.querySelector("[data-mmm-channel-table]"),
    responseChannel: root.querySelector("[data-mmm-response-channel]"),
    responseSummary: root.querySelector("[data-mmm-response-summary]"),
    responseCurve: root.querySelector("[data-mmm-response-curve]"),
    carryoverCurve: root.querySelector("[data-mmm-carryover-curve]"),
    responseLabels: root.querySelector("[data-response-labels]"),
    carryoverLabels: root.querySelector("[data-carryover-labels]"),
    responseUsage: root.querySelector("[data-response-usage]"),
    carryoverUsage: root.querySelector("[data-carryover-usage]"),
    hiatusPanel: root.querySelector("[data-hiatus-panel]"),
    hiatusWeeks: root.querySelector("[data-hiatus-weeks]"),
    hiatusWeeksOutput: root.querySelector("[data-hiatus-weeks-output]"),
    hiatusTolerance: root.querySelector("[data-hiatus-tolerance]"),
    hiatusToleranceOutput: root.querySelector("[data-hiatus-tolerance-output]"),
    hiatusResults: root.querySelector("[data-hiatus-results]"),
    hiatusFeedback: root.querySelector("[data-hiatus-feedback]"),
    hiatusTrajectory: root.querySelector("[data-hiatus-trajectory]"),
    plannerWorkspace: root.querySelector("[data-planner-workspace]"),
    plannerActiveSummary: root.querySelector("[data-planner-active-summary]"),
    plannerPresets: root.querySelector("[data-planner-presets]"),
    plannerPrimary: root.querySelector("[data-planner-primary]"),
    plannerPrimaryLabel: root.querySelector("[data-planner-primary-label]"),
    plannerPrimaryPrefix: root.querySelector("[data-planner-primary-prefix]"),
    plannerPrimarySuffix: root.querySelector("[data-planner-primary-suffix]"),
    planningStart: root.querySelector("[data-planning-start]"),
    planningPeriods: root.querySelector("[data-planning-periods]"),
    planningPeriodSuffix: root.querySelector("[data-planning-period-suffix]"),
    planningEndDate: root.querySelector("[data-planning-end-date]"),
    planningPeriodSummary: root.querySelector("[data-planning-period-summary]"),
    maxDecrease: root.querySelector("[data-max-decrease]"),
    maxDecreaseOutput: root.querySelector("[data-max-decrease-output]"),
    maxIncrease: root.querySelector("[data-max-increase]"),
    maxIncreaseOutput: root.querySelector("[data-max-increase-output]"),
    constraints: root.querySelector("[data-planner-constraints]"),
    manualInputs: root.querySelector("[data-manual-inputs]"),
    runScenario: root.querySelector("[data-run-scenario]"),
    resultCopy: root.querySelector("[data-planner-result-copy]"),
    plannerResults: root.querySelector("[data-planner-results]"),
    allocation: root.querySelector("[data-planner-allocation]"),
    recommendation: root.querySelector("[data-planner-recommendation]"),
    saveScenario: root.querySelector("[data-save-scenario]"),
    savedScenarios: root.querySelector("[data-saved-scenarios]"),
    modelMetrics: root.querySelector("[data-mmm-model-metrics]"),
  };

  let dataset = null;
  let currentSummary = null;
  let tooltip = null;
  let plannerSolveTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function tooltipText(lines) {
    return escapeHtml(lines.filter(Boolean).join("\n"));
  }

  function pulse(element) {
    if (!element) return;
    element.classList.remove("is-updated");
    window.requestAnimationFrame(() => {
      element.classList.add("is-updated");
      window.setTimeout(() => element.classList.remove("is-updated"), 460);
    });
  }

  function positionTooltip(clientX, clientY) {
    if (!tooltip || tooltip.hidden) return;
    const gap = 14;
    const bounds = tooltip.getBoundingClientRect();
    let left = clientX + gap;
    let top = clientY + gap;
    if (left + bounds.width > window.innerWidth - 10) left = clientX - bounds.width - gap;
    if (top + bounds.height > window.innerHeight - 10) top = clientY - bounds.height - gap;
    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${Math.max(10, top)}px`;
  }

  function showTooltip(target, clientX, clientY) {
    if (!target || !target.dataset.tooltipText) return;
    tooltip.textContent = target.dataset.tooltipText;
    tooltip.hidden = false;
    positionTooltip(clientX, clientY);
  }

  function bindChartTooltips() {
    tooltip = document.createElement("div");
    tooltip.className = "mmm-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    root.addEventListener("pointerover", (event) => {
      const target = event.target.closest?.("[data-tooltip-text]");
      if (target) showTooltip(target, event.clientX, event.clientY);
    });
    root.addEventListener("pointermove", (event) => {
      if (!tooltip.hidden) positionTooltip(event.clientX, event.clientY);
    });
    root.addEventListener("pointerout", (event) => {
      const target = event.target.closest?.("[data-tooltip-text]");
      if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
      tooltip.hidden = true;
    });
    root.addEventListener("focusin", (event) => {
      const target = event.target.closest?.("[data-tooltip-text]");
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      showTooltip(target, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    });
    root.addEventListener("focusout", (event) => {
      if (event.target.closest?.("[data-tooltip-text]")) tooltip.hidden = true;
    });
  }

  function queuePlannerSolve(delay = 120) {
    window.clearTimeout(plannerSolveTimer);
    plannerSolveTimer = window.setTimeout(() => {
      solvePlanner();
      pulse(elements.plannerWorkspace?.querySelector(".mmm-planner-output"));
    }, delay);
  }

  function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function compactNumber(value, digits = 1) {
    const number = Number.isFinite(value) ? value : 0;
    const absolute = Math.abs(number);
    if (absolute >= 1e12) return `${(number / 1e12).toFixed(digits).replace(/\.0$/, "")}T`;
    if (absolute >= 1e9) return `${(number / 1e9).toFixed(digits).replace(/\.0$/, "")}B`;
    if (absolute >= 1e6) return `${(number / 1e6).toFixed(digits).replace(/\.0$/, "")}M`;
    if (absolute >= 1e3) return `${(number / 1e3).toFixed(digits).replace(/\.0$/, "")}K`;
    return Math.round(number).toLocaleString("en-US");
  }

  function formatCurrency(value, digits = 2) {
    return `Rp${compactNumber(value, digits)}`;
  }

  function formatSignedCurrency(value, digits = 2) {
    const sign = value > 1 ? "+" : value < -1 ? "−" : "";
    return `${sign}${formatCurrency(Math.abs(value), digits)}`;
  }

  function formatPercent(value, digits = 1) {
    return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
  }

  function formatRatio(value) {
    return `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
  }

  function dayCount(start, end) {
    return Math.max(1, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1);
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function utcDate(value) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? new Date("2026-08-25T00:00:00Z") : date;
  }

  function addUtcMonths(date, months) {
    const monthIndex = date.getUTCMonth() + months;
    const year = date.getUTCFullYear() + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
  }

  function formatCalendarDate(date) {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  function nextDay(value) {
    const date = utcDate(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return isoDate(date);
  }

  function planningWindow() {
    const limits = { week: 52, month: 24, year: 5 };
    const periods = clamp(Math.round(Number(state.planningPeriods) || 1), 1, limits[state.planningUnit]);
    const start = utcDate(state.planningStart);
    let endExclusive;
    if (state.planningUnit === "week") endExclusive = new Date(start.getTime() + periods * 7 * 86400000);
    else if (state.planningUnit === "year") endExclusive = addUtcMonths(start, periods * 12);
    else endExclusive = addUtcMonths(start, periods);
    const end = new Date(endExclusive.getTime() - 86400000);
    const days = Math.max(1, Math.round((endExclusive - start) / 86400000));
    const unitLabel = `${state.planningUnit}${periods === 1 ? "" : "s"}`;
    return {
      start,
      end,
      days,
      periods,
      unitLabel,
      label: `${periods} ${unitLabel}`,
      rangeLabel: `${formatCalendarDate(start)} – ${formatCalendarDate(end)}`,
    };
  }

  function renderPlanningPeriod() {
    const limits = { week: 52, month: 24, year: 5 };
    const window = planningWindow();
    state.planningPeriods = window.periods;
    elements.planningStart.value = state.planningStart;
    elements.planningPeriods.value = String(window.periods);
    elements.planningPeriods.max = String(limits[state.planningUnit]);
    elements.planningPeriodSuffix.textContent = window.unitLabel;
    elements.planningEndDate.textContent = formatCalendarDate(window.end);
    elements.planningPeriodSummary.innerHTML = `<strong>${escapeHtml(window.label)} · ${window.days} days</strong><span>${escapeHtml(window.rangeLabel)}. Budget and KPI references are scaled from the selected analysis window to this exact duration.</span>`;
    root.querySelectorAll("[data-planning-unit]").forEach((button) => {
      const active = button.dataset.planningUnit === state.planningUnit;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
  }

  function filteredRows() {
    return dataset.rows.filter((row) => row.date >= state.dateStart && row.date <= state.dateEnd);
  }

  function summarize(rows) {
    const summary = {
      actual: 0, predicted: 0, baseline: 0, promotion: 0, seasonality: 0, other: 0,
      spend: {}, media: {}, totalSpend: 0, totalMedia: 0,
    };
    dataset.channels.forEach((channel) => {
      summary.spend[channel.name] = 0;
      summary.media[channel.name] = 0;
    });
    rows.forEach((row) => {
      ["actual", "predicted", "baseline", "promotion", "seasonality", "other"].forEach((key) => {
        summary[key] += row[key];
      });
      dataset.channels.forEach((channel) => {
        summary.spend[channel.name] += row.spend[channel.name] || 0;
        summary.media[channel.name] += row.media[channel.name] || 0;
      });
    });
    summary.totalSpend = Object.values(summary.spend).reduce((total, value) => total + value, 0);
    summary.totalMedia = Object.values(summary.media).reduce((total, value) => total + value, 0);
    return summary;
  }

  function scorecard(label, value, note, emphasis = false) {
    return `<article class="mmm-scorecard${emphasis ? " emphasis" : ""}"><span class="mmm-scorecard-label">${escapeHtml(label)}</span><strong class="mmm-scorecard-value">${escapeHtml(value)}</strong><span class="mmm-scorecard-note">${escapeHtml(note)}</span></article>`;
  }

  function renderScorecards(summary) {
    const contribution = safeDivide(summary.totalMedia, summary.predicted) * 100;
    const iROAS = safeDivide(summary.totalMedia, summary.totalSpend);
    elements.scorecards.innerHTML = [
      scorecard("Actual Business KPI", formatCurrency(summary.actual), `${state.kpi} observed in the selected period`),
      scorecard("Baseline / Organic KPI", formatCurrency(summary.baseline), "Demand expected without modeled media"),
      scorecard("Incremental Marketing KPI", formatCurrency(summary.totalMedia), "Modeled channel contribution", true),
      scorecard("Marketing Contribution", formatPercent(contribution), "Share of modeled business outcome"),
      scorecard("Total Media Spend", formatCurrency(summary.totalSpend), "Investment included in the model"),
      scorecard("Overall iROAS", formatRatio(iROAS), "Incremental revenue divided by spend", true),
    ].join("");
  }

  function aggregateWeeks(rows) {
    const groups = [];
    rows.forEach((row, index) => {
      const bucket = Math.floor(index / 7);
      if (!groups[bucket]) groups[bucket] = { date: row.date, actual: 0, predicted: 0 };
      groups[bucket].actual += row.actual;
      groups[bucket].predicted += row.predicted;
    });
    return groups;
  }

  function svgPath(points) {
    return points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  }

  function renderTrend(rows) {
    const groups = aggregateWeeks(rows);
    if (!groups.length) {
      elements.trend.innerHTML = '<div class="mmm-empty-chart">No model output for this period.</div>';
      return;
    }
    const width = 760;
    const height = 270;
    const margin = { left: 56, right: 18, top: 18, bottom: 36 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(...groups.flatMap((group) => [group.actual, group.predicted])) * 1.08;
    const x = (index) => margin.left + safeDivide(index, Math.max(groups.length - 1, 1)) * plotWidth;
    const y = (value) => margin.top + plotHeight - safeDivide(value, maxValue) * plotHeight;
    const actualPoints = groups.map((group, index) => [x(index), y(group.actual)]);
    const predictedPoints = groups.map((group, index) => [x(index), y(group.predicted)]);
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const gy = margin.top + plotHeight * (1 - ratio);
      return `<line x1="${margin.left}" y1="${gy}" x2="${width - margin.right}" y2="${gy}" stroke="#e9ecf3"/><text x="${margin.left - 8}" y="${gy + 4}" text-anchor="end" fill="#8a94a8" font-size="10">${compactNumber(maxValue * ratio, 1)}</text>`;
    }).join("");
    const labels = groups.map((group, index) => {
      if (index !== 0 && index !== groups.length - 1 && index % Math.ceil(groups.length / 5) !== 0) return "";
      const label = new Date(`${group.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      return `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" fill="#8a94a8" font-size="10">${label}</text>`;
    }).join("");
    const areaPath = `${svgPath(actualPoints)} L${actualPoints.at(-1)[0]},${margin.top + plotHeight} L${actualPoints[0][0]},${margin.top + plotHeight} Z`;
    const dots = actualPoints.map((point, index) => `<circle cx="${point[0]}" cy="${point[1]}" r="9" fill="transparent" tabindex="0" aria-label="Week of ${groups[index].date}" data-tooltip-text="${tooltipText([`Week of ${groups[index].date}`, `Actual: ${formatCurrency(groups[index].actual)}`, `Predicted: ${formatCurrency(groups[index].predicted)}`, `Variance: ${formatPercent(safeDivide(groups[index].actual - groups[index].predicted, groups[index].predicted) * 100)}`])}"></circle>`).join("");
    elements.trend.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Actual and predicted revenue trend"><defs><linearGradient id="mmmTrendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec0a68" stop-opacity=".18"/><stop offset="1" stop-color="#ec0a68" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${areaPath}" fill="url(#mmmTrendArea)"/><path d="${svgPath(predictedPoints)}" fill="none" stroke="#172a91" stroke-width="2.4" stroke-dasharray="6 5"/><path d="${svgPath(actualPoints)}" fill="none" stroke="#ec0a68" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }

  function renderDecomposition(summary) {
    const items = [
      ["Baseline / Organic", summary.baseline, "#172a91"],
      ["Marketing", summary.totalMedia, "#ec0a68"],
      ["Promotion", summary.promotion, "#7355dc"],
      ["Seasonality", summary.seasonality, "#16a4c2"],
      ["Other Controls", summary.other, "#a1acc1"],
    ];
    const total = items.reduce((sum, item) => sum + item[1], 0);
    const maximum = Math.max(...items.map((item) => item[1]), 1);
    elements.decomposition.innerHTML = items.map(([label, value, color]) => {
      const share = safeDivide(value, total) * 100;
      return `<div class="mmm-decomp-row" tabindex="0" data-tooltip-text="${tooltipText([label, `Modeled value: ${formatCurrency(value)}`, `Share of outcome: ${formatPercent(share)}`])}"><div class="mmm-decomp-meta"><strong>${label}</strong><span>${formatCurrency(value)}</span></div><div class="mmm-decomp-track"><div class="mmm-decomp-bar" style="width:${safeDivide(value, maximum) * 100}%;background:${color}"></div></div><span class="mmm-decomp-share">${formatPercent(share)} of modeled outcome</span></div>`;
    }).join("");
  }

  function channelMetrics(summary) {
    return dataset.channels.map((channel) => {
      const spend = summary.spend[channel.name] || 0;
      const incremental = summary.media[channel.name] || 0;
      const iROAS = safeDivide(incremental, spend);
      const mROI = iROAS * safeDivide(channel.mROI, channel.iROAS);
      return { ...channel, spend, incremental, iROAS, mROI, contribution: safeDivide(incremental, summary.totalMedia) * 100 };
    });
  }

  function renderChannelMatrix(metrics) {
    const width = 520;
    const height = 320;
    const margin = { left: 52, right: 22, top: 24, bottom: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxX = Math.max(4.5, ...metrics.map((item) => item.mROI)) * 1.12;
    const maxY = Math.max(5.5, ...metrics.map((item) => item.iROAS)) * 1.12;
    const x = (value) => margin.left + safeDivide(value, maxX) * plotWidth;
    const y = (value) => margin.top + plotHeight - safeDivide(value, maxY) * plotHeight;
    const maxSpend = Math.max(...metrics.map((item) => item.spend), 1);
    const grid = [0, .25, .5, .75, 1].map((ratio) => `<line x1="${x(maxX * ratio)}" y1="${margin.top}" x2="${x(maxX * ratio)}" y2="${margin.top + plotHeight}" stroke="#edf0f5"/><line x1="${margin.left}" y1="${y(maxY * ratio)}" x2="${margin.left + plotWidth}" y2="${y(maxY * ratio)}" stroke="#edf0f5"/>`).join("");
    const bubbles = metrics.map((item) => {
      const radius = 10 + Math.sqrt(safeDivide(item.spend, maxSpend)) * 18;
      const selected = item.name === state.responseChannel;
      return `<g data-channel-point="${item.name}" tabindex="0" role="button" aria-label="Select ${item.name}" data-tooltip-text="${tooltipText([item.name, `Spend: ${formatCurrency(item.spend)}`, `Incremental revenue: ${formatCurrency(item.incremental)}`, `iROAS: ${formatRatio(item.iROAS)}`, `Marginal ROI: ${formatRatio(item.mROI)}`, `Decision: ${item.action}`])}" style="cursor:pointer"><circle cx="${x(item.mROI)}" cy="${y(item.iROAS)}" r="${radius + (selected ? 4 : 0)}" fill="${item.color}" fill-opacity="${selected ? .2 : .12}"/><circle cx="${x(item.mROI)}" cy="${y(item.iROAS)}" r="${radius}" fill="${item.color}" fill-opacity=".83" stroke="#fff" stroke-width="3"/><text x="${x(item.mROI)}" y="${y(item.iROAS) + 4}" text-anchor="middle" fill="#fff" font-size="10" font-weight="800" pointer-events="none">${item.name}</text></g>`;
    }).join("");
    elements.channelMatrix.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Channel iROAS and marginal ROI matrix"><rect x="${x(1)}" y="${margin.top}" width="${Math.max(0, x(maxX) - x(1))}" height="${Math.max(0, y(1) - margin.top)}" rx="8" fill="#eef9f5"/>${grid}<line x1="${x(1)}" y1="${margin.top}" x2="${x(1)}" y2="${margin.top + plotHeight}" stroke="#9bacbd" stroke-dasharray="4 4"/><line x1="${margin.left}" y1="${y(1)}" x2="${margin.left + plotWidth}" y2="${y(1)}" stroke="#9bacbd" stroke-dasharray="4 4"/>${bubbles}<text x="${margin.left + plotWidth / 2}" y="${height - 8}" text-anchor="middle" fill="#69758d" font-size="11" font-weight="700">Marginal ROI · next unit of spend</text><text x="14" y="${margin.top + plotHeight / 2}" transform="rotate(-90 14 ${margin.top + plotHeight / 2})" text-anchor="middle" fill="#69758d" font-size="11" font-weight="700">Average iROAS</text></svg>`;
    elements.channelMatrix.querySelectorAll("[data-channel-point]").forEach((node) => {
      node.addEventListener("click", () => selectResponseChannel(node.dataset.channelPoint));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectResponseChannel(node.dataset.channelPoint);
        }
      });
    });
  }

  function renderChannelTable(metrics) {
    elements.channelTable.innerHTML = metrics.map((item) => `<tr data-channel-row="${item.name}" class="${item.name === state.responseChannel ? "selected" : ""}" tabindex="0" data-tooltip-text="${tooltipText([`${item.name} · ${item.action}`, item.reason, `Average iROAS: ${formatRatio(item.iROAS)}`, `Next-spend mROI: ${formatRatio(item.mROI)}`, `Directional headroom: ${formatPercent(item.headroom, 0)}`])}"><td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${item.color}"></i>${item.name}</span></td><td class="numeric">${formatCurrency(item.spend)}</td><td class="numeric">${formatCurrency(item.incremental)}</td><td class="numeric">${formatPercent(item.contribution)}</td><td class="numeric">${formatRatio(item.iROAS)}</td><td class="numeric">${formatRatio(item.mROI)}</td><td class="numeric">${formatPercent(item.headroom, 0)}</td><td><span class="mmm-action-badge ${item.action.toLowerCase()}">${item.action}</span></td></tr>`).join("");
    elements.channelTable.querySelectorAll("[data-channel-row]").forEach((row) => {
      row.addEventListener("click", () => selectResponseChannel(row.dataset.channelRow));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectResponseChannel(row.dataset.channelRow);
      });
    });
  }

  function responseParameters(channel, spend, incremental) {
    const alpha = channel.alpha;
    const iROAS = safeDivide(incremental, spend);
    const mROI = iROAS * safeDivide(channel.mROI, channel.iROAS);
    const ratio = clamp(safeDivide(mROI, iROAS), .08, alpha - .05);
    const t = Math.max(.03, alpha / ratio - 1);
    const halfSaturation = spend / Math.pow(t, 1 / alpha);
    const maxOutcome = incremental * (1 + t) / t;
    return { alpha, halfSaturation, maxOutcome };
  }

  function responseValue(spend, parameters) {
    if (spend <= 0) return 0;
    const spendPower = Math.pow(spend, parameters.alpha);
    const halfPower = Math.pow(parameters.halfSaturation, parameters.alpha);
    return parameters.maxOutcome * spendPower / (spendPower + halfPower);
  }

  function marginalValue(spend, parameters) {
    if (spend <= 0) return Number.POSITIVE_INFINITY;
    const alpha = parameters.alpha;
    const halfPower = Math.pow(parameters.halfSaturation, alpha);
    const spendPower = Math.pow(spend, alpha);
    return parameters.maxOutcome * alpha * halfPower * Math.pow(spend, alpha - 1) / Math.pow(spendPower + halfPower, 2);
  }

  function selectedMetric() {
    return channelMetrics(currentSummary).find((channel) => channel.name === state.responseChannel) || channelMetrics(currentSummary)[0];
  }

  function plannerChannelPoint(metric) {
    const reference = state.lastScenario?.reference?.channels?.find((channel) => channel.name === metric.name);
    const spend = reference?.currentSpend ?? metric.spend;
    const incremental = reference?.currentOutcome ?? metric.incremental;
    const parameters = reference?.parameters ?? responseParameters(metric, spend, incremental);
    return { spend, incremental, parameters, iROAS: safeDivide(incremental, spend), mROI: marginalValue(spend, parameters) };
  }

  function renderResponseSummary(metric) {
    const current = plannerChannelPoint(metric);
    const scenarioBudget = state.lastScenario?.budgets?.[metric.name] ?? current.spend;
    const scenarioOutcome = state.lastScenario?.outcomes?.[metric.name] ?? current.incremental;
    const budgetChange = safeDivide(scenarioBudget - current.spend, current.spend) * 100;
    const horizon = state.lastScenario?.horizonLabel ?? "Selected analysis period";
    elements.responseSummary.innerHTML = [
      ["Current Reference Spend", formatCurrency(current.spend), horizon],
      ["Scenario Spend", formatCurrency(scenarioBudget), Math.abs(budgetChange) < .05 ? "No change from current" : `${budgetChange >= 0 ? "+" : ""}${formatPercent(budgetChange)} vs current`],
      ["Scenario Incremental Revenue", formatCurrency(scenarioOutcome), "Evaluated on the response curve"],
      ["Decision Signal", metric.action, `${formatRatio(current.mROI)} current marginal ROI`],
    ].map(([label, value, note]) => `<div class="mmm-mini-card"><span>${label}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></div>`).join("");
    elements.responseUsage.textContent = Math.abs(budgetChange) < .05
      ? `${metric.name} remains at ${formatCurrency(current.spend)} for the ${horizon}; current and scenario markers overlap because the planner recommends no change.`
      : `${metric.name} moves from ${formatCurrency(current.spend)} to ${formatCurrency(scenarioBudget)} (${budgetChange >= 0 ? "+" : ""}${formatPercent(budgetChange)}) for the ${horizon}; the scenario marker shows the modeled return at that exact budget.`;
  }

  function renderResponseCurve(metric) {
    const width = 640;
    const height = 300;
    const margin = { left: 58, right: 22, top: 20, bottom: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const current = plannerChannelPoint(metric);
    const parameters = current.parameters;
    const scenarioSpend = state.lastScenario?.budgets?.[metric.name] ?? current.spend;
    const scenarioOutcome = responseValue(scenarioSpend, parameters);
    const maxSpend = Math.max(current.spend * 1.75, scenarioSpend * 1.25, 1);
    const points = Array.from({ length: 61 }, (_, index) => {
      const spend = maxSpend * index / 60;
      return { spend, outcome: responseValue(spend, parameters) };
    });
    const maxOutcome = Math.max(...points.map((point) => point.outcome), 1) * 1.08;
    const x = (value) => margin.left + safeDivide(value, maxSpend) * plotWidth;
    const y = (value) => margin.top + plotHeight - safeDivide(value, maxOutcome) * plotHeight;
    const line = svgPath(points.map((point) => [x(point.spend), y(point.outcome)]));
    const area = `${line} L${x(maxSpend)},${margin.top + plotHeight} L${x(0)},${margin.top + plotHeight} Z`;
    const historicalStart = current.spend * .6;
    const historicalEnd = current.spend * 1.3;
    const budgetDelta = scenarioSpend - current.spend;
    const budgetChange = safeDivide(budgetDelta, current.spend) * 100;
    const grid = [0, .5, 1].map((ratio) => `<line x1="${margin.left}" y1="${y(maxOutcome * ratio)}" x2="${margin.left + plotWidth}" y2="${y(maxOutcome * ratio)}" stroke="#ebedf4"/><text x="${margin.left - 8}" y="${y(maxOutcome * ratio) + 4}" text-anchor="end" fill="#8b95a8" font-size="10">${compactNumber(maxOutcome * ratio, 1)}</text>`).join("");
    const hoverPoints = points.filter((_, index) => index % 5 === 0).map((point) => {
      const marginal = marginalValue(Math.max(point.spend, maxSpend / 1000), parameters);
      return `<circle cx="${x(point.spend)}" cy="${y(point.outcome)}" r="9" fill="transparent" tabindex="0" aria-label="Spend ${formatCurrency(point.spend)}" data-tooltip-text="${tooltipText([`${metric.name} response`, `Spend: ${formatCurrency(point.spend)}`, `Expected incremental revenue: ${formatCurrency(point.outcome)}`, `Marginal ROI at this point: ${formatRatio(marginal)}`, point.spend > historicalEnd ? "Outside historical support range" : "Within historical support range"])}"></circle>`;
    }).join("");
    elements.responseCurve.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.name} response curve linked to the current planner scenario"><defs><linearGradient id="mmmResponseArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${metric.color}" stop-opacity=".24"/><stop offset="1" stop-color="${metric.color}" stop-opacity=".02"/></linearGradient></defs>${grid}<rect x="${x(historicalStart)}" y="${margin.top}" width="${Math.max(0, x(Math.min(historicalEnd, maxSpend)) - x(historicalStart))}" height="${plotHeight}" fill="#6f78a2" opacity=".07"/><path d="${area}" fill="url(#mmmResponseArea)"/><path d="${line}" fill="none" stroke="${metric.color}" stroke-width="3"/><line x1="${x(current.spend)}" y1="${y(current.incremental)}" x2="${x(current.spend)}" y2="${margin.top + plotHeight}" stroke="#172a91" stroke-dasharray="5 4"/><line x1="${x(scenarioSpend)}" y1="${y(scenarioOutcome)}" x2="${x(scenarioSpend)}" y2="${margin.top + plotHeight}" stroke="#ec0a68" stroke-dasharray="3 4"/><circle cx="${x(current.spend)}" cy="${y(current.incremental)}" r="5.5" fill="#172a91" stroke="#fff" stroke-width="2" data-tooltip-text="${tooltipText(["Current planning reference", `Spend: ${formatCurrency(current.spend)}`, `Incremental revenue: ${formatCurrency(current.incremental)}`, `Average iROAS: ${formatRatio(current.iROAS)}`])}"></circle><circle cx="${x(scenarioSpend)}" cy="${y(scenarioOutcome)}" r="${Math.abs(budgetDelta) < 1 ? 8 : 5.5}" fill="${Math.abs(budgetDelta) < 1 ? "none" : "#ec0a68"}" stroke="#ec0a68" stroke-width="2.5" data-tooltip-text="${tooltipText(["Planner scenario point", `Spend: ${formatCurrency(scenarioSpend)}`, `Expected incremental revenue: ${formatCurrency(scenarioOutcome)}`, `Change from current: ${budgetChange >= 0 ? "+" : ""}${formatPercent(budgetChange)}`])}"></circle>${hoverPoints}<text x="${x(current.spend)}" y="${margin.top + plotHeight + 17}" text-anchor="middle" fill="#172a91" font-size="9" font-weight="700">Reference</text><text x="${x(scenarioSpend)}" y="${Math.max(margin.top + 10, y(scenarioOutcome) - 11)}" text-anchor="middle" fill="#ec0a68" font-size="9" font-weight="700">${Math.abs(budgetDelta) < 1 ? "Scenario = reference" : "Scenario"}</text><text x="${margin.left + plotWidth / 2}" y="${height - 7}" text-anchor="middle" fill="#6f7b92" font-size="10">Media spend</text><text x="${x((historicalStart + Math.min(historicalEnd, maxSpend)) / 2)}" y="${margin.top + 13}" text-anchor="middle" fill="#727d94" font-size="9">Modeled support</text></svg>`;
    elements.responseLabels.innerHTML = [
      ["Current reference", formatCurrency(current.spend), formatCurrency(current.incremental), "current"],
      ["Planner scenario", formatCurrency(scenarioSpend), formatCurrency(scenarioOutcome), "scenario"],
      ["Budget delta", formatSignedCurrency(budgetDelta), Math.abs(budgetChange) < .05 ? "No change" : `${budgetChange >= 0 ? "+" : ""}${formatPercent(budgetChange)}`, budgetDelta > 1 ? "positive" : budgetDelta < -1 ? "negative" : "neutral"],
    ].map(([label, value, note, className]) => `<div class="mmm-visible-label ${className}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
  }

  function renderCarryover(metric) {
    const width = 640;
    const height = 300;
    const margin = { left: 54, right: 22, top: 20, bottom: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const selectedWeeks = Number(elements.hiatusWeeks.value);
    const selectedDay = selectedWeeks * 7;
    const maxDays = 56;
    const points = Array.from({ length: maxDays + 1 }, (_, day) => ({ day, remaining: Math.pow(.5, day / metric.halfLifeDays) * 100 }));
    const x = (day) => margin.left + day / maxDays * plotWidth;
    const y = (value) => margin.top + plotHeight - value / 100 * plotHeight;
    const line = svgPath(points.map((point) => [x(point.day), y(point.remaining)]));
    const area = `${line} L${x(maxDays)},${margin.top + plotHeight} L${x(0)},${margin.top + plotHeight} Z`;
    const remainingAtSelected = Math.pow(.5, selectedDay / metric.halfLifeDays) * 100;
    const recoveryDays = Math.ceil(metric.halfLifeDays * 2);
    const scenarioBudget = state.lastScenario?.budgets?.[metric.name] ?? metric.spend;
    const grid = [0, 25, 50, 75, 100].map((value) => `<line x1="${margin.left}" y1="${y(value)}" x2="${margin.left + plotWidth}" y2="${y(value)}" stroke="#ebedf4"/><text x="${margin.left - 8}" y="${y(value) + 4}" text-anchor="end" fill="#8b95a8" font-size="10">${value}%</text>`).join("");
    const hoverPoints = points.map((point) => `<circle cx="${x(point.day)}" cy="${y(point.remaining)}" r="8" fill="transparent" tabindex="0" aria-label="Day ${point.day}" data-tooltip-text="${tooltipText([`${metric.name} carryover`, `Day after media stops: ${point.day}`, `Estimated effect remaining: ${formatPercent(point.remaining)}`, point.day <= metric.halfLifeDays ? "Within the first half-life" : "Beyond the first half-life"])}"></circle>`).join("");
    elements.carryoverCurve.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.name} carryover decay through the selected ${selectedWeeks}-week hiatus"><defs><linearGradient id="mmmCarryArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${metric.color}" stop-opacity=".22"/><stop offset="1" stop-color="${metric.color}" stop-opacity=".02"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#mmmCarryArea)"/><path d="${line}" fill="none" stroke="${metric.color}" stroke-width="3"/><line x1="${x(metric.halfLifeDays)}" y1="${margin.top}" x2="${x(metric.halfLifeDays)}" y2="${margin.top + plotHeight}" stroke="#7355dc" stroke-dasharray="5 4"/><circle cx="${x(metric.halfLifeDays)}" cy="${y(50)}" r="5" fill="#7355dc" stroke="#fff" stroke-width="2" data-tooltip-text="${tooltipText([`${metric.name} half-life`, `${metric.halfLifeDays.toFixed(1)} days after media stops`, "50% of the modeled effect remains", "Used by the Hiatus Simulator"])}"></circle><line x1="${x(selectedDay)}" y1="${margin.top}" x2="${x(selectedDay)}" y2="${margin.top + plotHeight}" stroke="#ec0a68" stroke-width="2" stroke-dasharray="3 4"/><circle cx="${x(selectedDay)}" cy="${y(remainingAtSelected)}" r="6" fill="#ec0a68" stroke="#fff" stroke-width="2" data-tooltip-text="${tooltipText([`${selectedWeeks}-week hiatus`, `Day ${selectedDay}`, `Modeled effect remaining: ${formatPercent(remainingAtSelected)}`])}"></circle>${hoverPoints}<text x="${x(metric.halfLifeDays)}" y="${margin.top + 13}" text-anchor="middle" fill="#7355dc" font-size="9" font-weight="700">Half-life ${metric.halfLifeDays.toFixed(1)}d</text><text x="${x(selectedDay)}" y="${Math.max(margin.top + 25, y(remainingAtSelected) - 10)}" text-anchor="${selectedDay === 0 ? "start" : "middle"}" fill="#ec0a68" font-size="9" font-weight="700">Selected ${selectedWeeks}w · ${formatPercent(remainingAtSelected, 0)} left</text>${[0, 14, 28, 42, 56].map((day) => `<text x="${x(day)}" y="${height - 10}" text-anchor="middle" fill="#8993a7" font-size="10">${day / 7}w</text>`).join("")}</svg>`;
    elements.carryoverLabels.innerHTML = [
      ["Effect at pause start", "100%", `${metric.name} baseline`, "current"],
      ["Modeled half-life", `${metric.halfLifeDays.toFixed(1)} days`, "50% effect remains", "scenario"],
      [`After ${selectedWeeks} week${selectedWeeks === 1 ? "" : "s"}`, formatPercent(remainingAtSelected), `Day ${selectedDay}`, remainingAtSelected >= 50 ? "positive" : "negative"],
      ["Recovery guide", `${recoveryDays} days`, "Approx. two half-lives", "neutral"],
    ].map(([label, value, note, className]) => `<div class="mmm-visible-label ${className}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
    elements.carryoverUsage.textContent = `${metric.name} receives ${formatCurrency(scenarioBudget)} in the active planner scenario. After a ${selectedWeeks}-week pause, ${formatPercent(remainingAtSelected)} of the modeled media effect remains; the decay rate comes from the ${metric.halfLifeDays.toFixed(1)}-day half-life, not from budget size.`;
  }

  function hiatusDecline(metric, weeks) {
    const days = weeks * 7;
    if (!days) return 0;
    const decay = Math.pow(.5, 1 / metric.halfLifeDays);
    const averageRemaining = safeDivide(1 - Math.pow(decay, days), days * (1 - decay));
    const lostEffect = 1 - averageRemaining;
    const scenarioContribution = state.lastScenario?.outcomes?.[metric.name] ?? metric.incremental;
    const scenarioKpi = state.lastScenario?.totalKpi ?? currentSummary.predicted;
    return safeDivide(scenarioContribution, scenarioKpi) * lostEffect * 100;
  }

  function renderHiatus(metric) {
    const weeks = Number(elements.hiatusWeeks.value);
    const tolerance = Number(elements.hiatusTolerance.value);
    elements.hiatusWeeksOutput.textContent = `${weeks} week${weeks === 1 ? "" : "s"}`;
    elements.hiatusToleranceOutput.textContent = `${tolerance}%`;
    const decline = hiatusDecline(metric, weeks);
    let safeWeeks = 0;
    for (let candidate = 0; candidate <= 8; candidate += 1) {
      if (hiatusDecline(metric, candidate) <= tolerance) safeWeeks = candidate;
    }
    const daysInScope = state.lastScenario?.reference?.planningDays ?? Math.max(filteredRows().length, 1);
    const scenarioBudget = state.lastScenario?.budgets?.[metric.name] ?? metric.spend;
    const savings = scenarioBudget / daysInScope * weeks * 7;
    const isSafe = decline <= tolerance;
    const recoveryDays = Math.ceil(metric.halfLifeDays * 2);
    const values = [
      ["Projected KPI decline", formatPercent(decline), isSafe ? "safe" : "risk"],
      ["Tolerance status", isSafe ? "Within limit" : "Above limit", isSafe ? "safe" : "risk"],
      ["Directional safe hiatus", `${safeWeeks} weeks`, ""],
      ["Estimated media savings", formatCurrency(savings), ""],
    ];
    elements.hiatusResults.innerHTML = values.map(([label, value, className]) => `<div class="mmm-hiatus-metric ${className}"><span>${label}</span><strong>${value}</strong></div>`).join("");
    root.querySelectorAll("[data-hiatus-preset]").forEach((button) => button.classList.toggle("active", Number(button.dataset.hiatusPreset) === weeks));
    elements.hiatusFeedback.className = `mmm-hiatus-feedback ${isSafe ? "safe" : "risk"}`;
    elements.hiatusFeedback.innerHTML = isSafe
      ? `<strong>${metric.name} pause remains within tolerance.</strong> A ${weeks}-week pause is estimated to reduce total KPI by ${formatPercent(decline)} versus the ${formatPercent(tolerance, 0)} limit. Allow approximately ${recoveryDays} days after reactivation for the modeled effect to rebuild.`
      : `<strong>${metric.name} pause exceeds tolerance.</strong> Reduce the pause to about ${safeWeeks} weeks or retain a maintenance budget. The projected decline is ${formatPercent(decline)} versus the ${formatPercent(tolerance, 0)} limit.`;

    const trajectory = Array.from({ length: 9 }, (_, week) => ({ week, decline: hiatusDecline(metric, week) }));
    const width = 720;
    const height = 230;
    const margin = { left: 42, right: 18, top: 30, bottom: 34 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxDecline = Math.max(tolerance, ...trajectory.map((item) => item.decline), 1) * 1.2;
    const x = (week) => margin.left + (week + .5) / trajectory.length * plotWidth;
    const y = (value) => margin.top + plotHeight - safeDivide(value, maxDecline) * plotHeight;
    const barWidth = plotWidth / trajectory.length * .56;
    const thresholdY = y(tolerance);
    const bars = trajectory.map((item) => {
      const aboveTolerance = item.decline > tolerance;
      const selected = item.week === weeks;
      const barY = y(item.decline);
      const barHeight = Math.max(2, margin.top + plotHeight - barY);
      const color = aboveTolerance ? "#ec0a68" : selected ? "#4f38bc" : "#8879dc";
      return `<g tabindex="0" data-tooltip-text="${tooltipText([`${metric.name} · ${item.week}-week pause`, `Projected KPI decline: ${formatPercent(item.decline)}`, `Allowed decline: ${formatPercent(tolerance, 0)}`, aboveTolerance ? "Above tolerance" : "Within tolerance"])}"><rect x="${x(item.week) - barWidth / 2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}" opacity="${selected ? "1" : ".82"}"/>${selected ? `<rect x="${x(item.week) - barWidth / 2 - 4}" y="${Math.max(margin.top, barY - 4)}" width="${barWidth + 8}" height="${barHeight + 8}" rx="7" fill="none" stroke="#172a91" stroke-width="2"/>` : ""}<text x="${x(item.week)}" y="${Math.max(margin.top + 10, barY - 7)}" text-anchor="middle" fill="${aboveTolerance ? "#b92568" : "#4f4a83"}" font-size="10" font-weight="750">${formatPercent(item.decline)}</text><text x="${x(item.week)}" y="${height - 11}" text-anchor="middle" fill="${selected ? "#172a91" : "#8993a7"}" font-size="10" font-weight="${selected ? "800" : "600"}">${item.week}w</text></g>`;
    }).join("");
    elements.hiatusTrajectory.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected KPI decline by hiatus week with a ${tolerance}% allowed decline threshold"><line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#dfe3ed"/><line x1="${margin.left}" y1="${thresholdY}" x2="${width - margin.right}" y2="${thresholdY}" stroke="#ec0a68" stroke-width="2" stroke-dasharray="6 5"/><rect x="${width - margin.right - 108}" y="${Math.max(margin.top, thresholdY - 20)}" width="108" height="17" rx="8.5" fill="#fff0f5"/><text x="${width - margin.right - 8}" y="${Math.max(margin.top + 12, thresholdY - 8)}" text-anchor="end" fill="#b92568" font-size="10" font-weight="800">Allowed ${formatPercent(tolerance, 0)}</text>${bars}</svg>`;
  }

  function selectResponseChannel(channelName) {
    state.responseChannel = channelName;
    elements.responseChannel.value = channelName;
    renderChannelsAndResponse();
    root.querySelectorAll("[data-allocation-channel]").forEach((button) => button.classList.toggle("selected", button.dataset.allocationChannel === channelName));
    pulse(elements.responseCurve.closest(".mmm-panel"));
    pulse(elements.carryoverCurve.closest(".mmm-panel"));
  }

  function renderChannelsAndResponse() {
    const metrics = channelMetrics(currentSummary);
    renderChannelMatrix(metrics);
    renderChannelTable(metrics);
    const metric = selectedMetric();
    renderResponseSummary(metric);
    renderResponseCurve(metric);
    renderCarryover(metric);
    renderHiatus(metric);
  }

  function plannerReference() {
    const rows = filteredRows();
    const summary = summarize(rows);
    const selectedDays = Math.max(rows.length, 1);
    const window = planningWindow();
    const factor = window.days / selectedDays;
    const channels = dataset.channels.map((channel) => {
      const currentSpend = summary.spend[channel.name] * factor;
      const currentOutcome = summary.media[channel.name] * factor;
      return { ...channel, currentSpend, currentOutcome, parameters: responseParameters(channel, currentSpend, currentOutcome) };
    });
    const nonMedia = (summary.baseline + summary.promotion + summary.seasonality + summary.other) * factor;
    return { channels, nonMedia, factor, selectedDays, planningDays: window.days, planningWindow: window, currentBudget: channels.reduce((sum, channel) => sum + channel.currentSpend, 0), currentMedia: channels.reduce((sum, channel) => sum + channel.currentOutcome, 0) };
  }

  function plannerBounds(reference) {
    const bounds = {};
    reference.channels.forEach((channel) => {
      if (state.locked.has(channel.name)) {
        bounds[channel.name] = { floor: channel.currentSpend, ceiling: channel.currentSpend };
      } else {
        bounds[channel.name] = {
          floor: channel.currentSpend * (1 - state.maxDecrease / 100),
          ceiling: channel.currentSpend * (1 + state.maxIncrease / 100),
        };
      }
    });
    return bounds;
  }

  function evaluatePlan(reference, budgets) {
    const outcomes = {};
    const marginals = {};
    reference.channels.forEach((channel) => {
      outcomes[channel.name] = responseValue(budgets[channel.name], channel.parameters);
      marginals[channel.name] = marginalValue(budgets[channel.name], channel.parameters);
    });
    const budget = Object.values(budgets).reduce((sum, value) => sum + value, 0);
    const media = Object.values(outcomes).reduce((sum, value) => sum + value, 0);
    const blendedMarginal = safeDivide(reference.channels.reduce((sum, channel) => sum + marginals[channel.name] * budgets[channel.name], 0), budget);
    return { budgets, outcomes, budget, media, totalKpi: reference.nonMedia + media, iROAS: safeDivide(media, budget), mROI: blendedMarginal };
  }

  function allocateToBudget(reference, targetBudget, bounds) {
    const budgets = {};
    reference.channels.forEach((channel) => { budgets[channel.name] = bounds[channel.name].floor; });
    const floorTotal = Object.values(budgets).reduce((sum, value) => sum + value, 0);
    const ceilingTotal = Object.values(bounds).reduce((sum, bound) => sum + bound.ceiling, 0);
    const warnings = [];
    const constrainedTarget = clamp(targetBudget, floorTotal, ceilingTotal);
    if (targetBudget < floorTotal) warnings.push(`Requested budget is below the ${formatCurrency(floorTotal)} constraint floor.`);
    if (targetBudget > ceilingTotal) warnings.push(`Only ${formatCurrency(ceilingTotal)} can be allocated within current channel ceilings.`);
    let remaining = constrainedTarget - floorTotal;
    const step = Math.max(constrainedTarget / 1400, 1);
    let guard = 0;
    while (remaining > 1 && guard < 5000) {
      const eligible = reference.channels.filter((channel) => budgets[channel.name] < bounds[channel.name].ceiling - 1);
      if (!eligible.length) break;
      eligible.sort((a, b) => marginalValue(budgets[b.name], b.parameters) - marginalValue(budgets[a.name], a.parameters));
      const chosen = eligible[0];
      const addition = Math.min(step, remaining, bounds[chosen.name].ceiling - budgets[chosen.name]);
      budgets[chosen.name] += addition;
      remaining -= addition;
      guard += 1;
    }
    return { budgets, warnings };
  }

  function solvePlanner() {
    const reference = plannerReference();
    const bounds = plannerBounds(reference);
    const warnings = [];
    let budgets = {};
    let label = "Available Budget";
    let targetNote = "Budget allocated to the highest modeled marginal returns within constraints.";

    if (state.plannerMode === "budget") {
      const allocation = allocateToBudget(reference, state.primaryValue * 1e9, bounds);
      budgets = allocation.budgets;
      warnings.push(...allocation.warnings);
    } else if (state.plannerMode === "target") {
      label = "Target KPI";
      targetNote = "Minimum modeled media allocation required to pursue the KPI target.";
      reference.channels.forEach((channel) => { budgets[channel.name] = bounds[channel.name].floor; });
      const targetKpi = state.primaryValue * 1e9;
      const step = Math.max(reference.currentBudget / 1500, 1);
      let evaluation = evaluatePlan(reference, budgets);
      let guard = 0;
      while (evaluation.totalKpi < targetKpi && guard < 6000) {
        const eligible = reference.channels.filter((channel) => budgets[channel.name] < bounds[channel.name].ceiling - 1);
        if (!eligible.length) break;
        eligible.sort((a, b) => marginalValue(budgets[b.name], b.parameters) - marginalValue(budgets[a.name], a.parameters));
        const chosen = eligible[0];
        budgets[chosen.name] += Math.min(step, bounds[chosen.name].ceiling - budgets[chosen.name]);
        evaluation = evaluatePlan(reference, budgets);
        guard += 1;
      }
      if (evaluatePlan(reference, budgets).totalKpi < targetKpi) warnings.push("Target KPI is outside the modeled range under the active constraints.");
    } else if (state.plannerMode === "roi") {
      label = "Target ROI";
      targetNote = "Largest modeled allocation that preserves the requested portfolio iROAS.";
      reference.channels.forEach((channel) => { budgets[channel.name] = bounds[channel.name].floor; });
      const targetROI = state.primaryValue;
      const step = Math.max(reference.currentBudget / 1600, 1);
      let guard = 0;
      while (guard < 6000) {
        const eligible = reference.channels.filter((channel) => budgets[channel.name] < bounds[channel.name].ceiling - 1);
        const candidates = eligible.map((channel) => {
          const trial = { ...budgets, [channel.name]: Math.min(bounds[channel.name].ceiling, budgets[channel.name] + step) };
          return { channel, trial, evaluation: evaluatePlan(reference, trial) };
        }).filter((candidate) => candidate.evaluation.iROAS >= targetROI);
        if (!candidates.length) break;
        candidates.sort((a, b) => b.evaluation.media - a.evaluation.media);
        budgets = candidates[0].trial;
        guard += 1;
      }
      if (evaluatePlan(reference, budgets).iROAS < targetROI) warnings.push("Target ROI cannot be reached at the active channel floors.");
    } else {
      label = "Manual What-If";
      targetNote = "User-defined allocation evaluated against the same response curves.";
      reference.channels.forEach((channel) => {
        const requested = (Number(state.manualBudgets[channel.name]) || 0) * 1e9;
        budgets[channel.name] = clamp(requested, bounds[channel.name].floor, bounds[channel.name].ceiling);
        if (Math.abs(budgets[channel.name] - requested) > 1) warnings.push(`${channel.name} was adjusted to the active min/max constraint.`);
      });
    }

    const evaluation = evaluatePlan(reference, budgets);
    const currentPlan = evaluatePlan(reference, Object.fromEntries(reference.channels.map((channel) => [channel.name, channel.currentSpend])));
    evaluation.reference = reference;
    evaluation.currentPlan = currentPlan;
    evaluation.uplift = safeDivide(evaluation.totalKpi - currentPlan.totalKpi, currentPlan.totalKpi) * 100;
    evaluation.warnings = [...new Set(warnings)];
    evaluation.modeLabel = label;
    evaluation.targetNote = targetNote;
    evaluation.horizonLabel = `${reference.planningWindow.label} · ${reference.planningDays} days`;
    state.lastScenario = evaluation;
    renderPlannerOutput(evaluation);
    const metric = selectedMetric();
    renderResponseSummary(metric);
    renderResponseCurve(metric);
    renderCarryover(metric);
    renderHiatus(metric);
    elements.saveScenario.disabled = false;
  }

  function renderPlannerControls() {
    const reference = plannerReference();
    const modeConfig = {
      budget: ["Available Media Budget", "Rp", "B", reference.currentBudget / 1e9 * 1.15],
      target: ["Target Business KPI", "Rp", "B", reference.nonMedia / 1e9 + reference.currentMedia / 1e9 * 1.06],
      roi: ["Minimum Portfolio iROAS", "", "x", Math.max(1, safeDivide(reference.currentMedia, reference.currentBudget) - .15)],
      manual: ["Total Manual Budget", "Rp", "B", reference.currentBudget / 1e9],
    };
    const modeSummary = {
      budget: "The planner reallocates a fixed media budget toward the strongest marginal returns.",
      target: "The planner finds the minimum modeled spend needed to pursue the selected business KPI target.",
      roi: "The planner maximizes scalable investment while protecting the minimum portfolio iROAS.",
      manual: "The planner evaluates your channel-level budget choices using the same response curves.",
    };
    const config = modeConfig[state.plannerMode];
    if (!state.primaryValue || state.plannerMode === "manual") state.primaryValue = config[3];
    elements.plannerPrimaryLabel.textContent = config[0];
    elements.plannerPrimaryPrefix.textContent = config[1];
    elements.plannerPrimarySuffix.textContent = config[2];
    elements.plannerPrimary.value = state.primaryValue.toFixed(state.plannerMode === "roi" ? 2 : 1);
    elements.plannerPrimary.disabled = state.plannerMode === "manual";
    elements.maxDecreaseOutput.textContent = `${state.maxDecrease}%`;
    elements.maxIncreaseOutput.textContent = `${state.maxIncrease}%`;
    root.querySelectorAll("[data-planner-mode]").forEach((button) => {
      const active = button.dataset.plannerMode === state.plannerMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    elements.plannerActiveSummary.innerHTML = `<strong>${config[0]}:</strong> ${modeSummary[state.plannerMode]} <span>${escapeHtml(reference.planningWindow.label)} planning horizon · ${reference.planningDays} days</span>`;
    elements.plannerPresets.hidden = state.plannerMode !== "budget";
    if (state.plannerMode === "budget") {
      const factor = safeDivide(state.primaryValue * 1e9, reference.currentBudget);
      root.querySelectorAll("[data-budget-multiplier]").forEach((button) => {
        button.classList.toggle("active", Math.abs(Number(button.dataset.budgetMultiplier) - factor) < .011);
      });
    }

    elements.constraints.innerHTML = reference.channels.map((channel) => `<div class="mmm-constraint-row"><strong><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</strong><span>${formatCurrency(channel.currentSpend)} current</span><label class="mmm-lock"><input type="checkbox" data-channel-lock="${channel.name}" ${state.locked.has(channel.name) ? "checked" : ""}>Lock</label></div>`).join("");
    elements.constraints.querySelectorAll("[data-channel-lock]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) state.locked.add(input.dataset.channelLock); else state.locked.delete(input.dataset.channelLock);
      solvePlanner();
      pulse(elements.plannerWorkspace.querySelector(".mmm-planner-output"));
    }));

    if (state.plannerMode === "manual") {
      elements.manualInputs.hidden = false;
      reference.channels.forEach((channel) => {
        if (!(channel.name in state.manualBudgets)) state.manualBudgets[channel.name] = channel.currentSpend / 1e9;
      });
      elements.manualInputs.innerHTML = reference.channels.map((channel) => `<label class="mmm-field"><span>${channel.name} Budget · RpB</span><input type="number" min="0" step="0.1" value="${Number(state.manualBudgets[channel.name]).toFixed(1)}" data-manual-channel="${channel.name}"></label>`).join("");
      elements.manualInputs.querySelectorAll("[data-manual-channel]").forEach((input) => input.addEventListener("input", () => {
        state.manualBudgets[input.dataset.manualChannel] = input.value;
        queuePlannerSolve();
      }));
    } else {
      elements.manualInputs.hidden = true;
      elements.manualInputs.innerHTML = "";
    }
  }

  function renderPlannerOutput(scenario) {
    elements.resultCopy.textContent = scenario.targetNote;
    const values = [
      ["Scenario Budget", formatCurrency(scenario.budget), scenario.horizonLabel, true],
      ["Expected KPI", formatCurrency(scenario.totalKpi), `${formatPercent(scenario.uplift)} vs current plan`],
      ["Incremental Revenue", formatCurrency(scenario.media), "Modeled media contribution"],
      ["Portfolio iROAS", formatRatio(scenario.iROAS), "Incremental revenue / spend"],
      ["Blended mROI", formatRatio(scenario.mROI), "Marginal efficiency at scenario"],
    ];
    elements.plannerResults.innerHTML = values.map(([label, value, note, primary]) => `<div class="mmm-result-card${primary ? " primary" : ""}" tabindex="0" data-tooltip-text="${tooltipText([label, value, note])}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");

    const maxBudget = Math.max(...scenario.reference.channels.flatMap((channel) => [channel.currentSpend, scenario.budgets[channel.name]]), 1);
    elements.allocation.innerHTML = `<div class="mmm-allocation-heading"><div><strong>Current vs Scenario Allocation</strong><small>Same scale across channels · select a channel to inspect its response curve</small></div><div class="mmm-allocation-legend"><span><i class="current"></i>Current</span><span><i class="scenario"></i>Scenario</span></div></div><div class="mmm-allocation-list">${scenario.reference.channels.map((channel) => {
      const scenarioBudget = scenario.budgets[channel.name];
      const absoluteChange = scenarioBudget - channel.currentSpend;
      const change = safeDivide(scenarioBudget - channel.currentSpend, channel.currentSpend) * 100;
      const changeClass = change > .05 ? "positive" : change < -.05 ? "negative" : "neutral";
      const action = change > .05 ? "Increase" : change < -.05 ? "Decrease" : "No change";
      const selected = channel.name === state.responseChannel ? " selected" : "";
      return `<button type="button" class="mmm-allocation-channel-card${selected}" data-allocation-channel="${channel.name}" data-tooltip-text="${tooltipText([channel.name, `Current: ${formatCurrency(channel.currentSpend)}`, `Scenario: ${formatCurrency(scenarioBudget)}`, `Delta: ${formatSignedCurrency(absoluteChange)} (${change >= 0 ? "+" : ""}${formatPercent(change)})`, `Expected incremental revenue: ${formatCurrency(scenario.outcomes[channel.name])}`])}"><span class="mmm-allocation-card-header"><strong><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</strong><em class="${changeClass}">${action}</em></span><span class="mmm-allocation-pair"><span class="mmm-allocation-line"><small>Current</small><span class="mmm-allocation-track"><i class="current" style="width:${safeDivide(channel.currentSpend, maxBudget) * 100}%"></i></span><b>${formatCurrency(channel.currentSpend)}</b></span><span class="mmm-allocation-line"><small>Scenario</small><span class="mmm-allocation-track"><i class="scenario" style="width:${safeDivide(scenarioBudget, maxBudget) * 100}%;background:linear-gradient(90deg,${channel.color},#7355dc)"></i></span><b>${formatCurrency(scenarioBudget)}</b></span></span><span class="mmm-allocation-delta ${changeClass}">Delta ${formatSignedCurrency(absoluteChange)} · ${Math.abs(change) < .05 ? "0.0% · No change" : `${change >= 0 ? "+" : ""}${formatPercent(change)}`}</span></button>`;
    }).join("")}</div>${scenario.warnings.length ? `<div class="mmm-warning-row"><strong>Constraint note:</strong> ${scenario.warnings.map(escapeHtml).join(" ")}</div>` : ""}`;

    elements.allocation.querySelectorAll("[data-allocation-channel]").forEach((button) => button.addEventListener("click", () => {
      selectResponseChannel(button.dataset.allocationChannel);
      elements.responseCurve.closest(".mmm-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    }));

    const movements = scenario.reference.channels.map((channel) => ({
      ...channel,
      scenarioBudget: scenario.budgets[channel.name],
      change: safeDivide(scenario.budgets[channel.name] - channel.currentSpend, channel.currentSpend) * 100,
    }));
    const increase = [...movements].sort((a, b) => b.change - a.change)[0];
    const decrease = [...movements].sort((a, b) => a.change - b.change)[0];
    if (Math.abs(increase.change) < .1 && Math.abs(decrease.change) < .1) {
      elements.recommendation.innerHTML = '<span class="mmm-recommendation-title">Scenario interpretation</span><strong>No meaningful reallocation.</strong> The selected inputs reproduce the current plan. Change the budget, target, constraints, or manual channel values to test an alternative.';
    } else if (increase.change <= .1) {
      elements.recommendation.innerHTML = `<span class="mmm-recommendation-title">Scenario interpretation</span><strong>Contraction scenario.</strong> Reduce ${decrease.name} most (${formatPercent(Math.abs(decrease.change))}) while protecting ${increase.name}, which retains the strongest relative allocation under the active return and constraint assumptions.`;
    } else {
      elements.recommendation.innerHTML = `<span class="mmm-recommendation-title">Scenario interpretation</span><strong>Prioritize ${increase.name} (${increase.change >= 0 ? "+" : ""}${formatPercent(increase.change)})</strong> because its modeled marginal return supports additional investment. ${decrease.change < -.1 ? `Reduce ${decrease.name} by ${formatPercent(Math.abs(decrease.change))} as its next-spend efficiency is comparatively lower.` : "No channel requires a material reduction under this scenario."}`;
    }

  }

  function renderSavedScenarios() {
    if (!state.savedScenarios.length) {
      elements.savedScenarios.innerHTML = '<div class="mmm-scenario-empty">Run and save a scenario to compare investment choices here.</div>';
      return;
    }
    elements.savedScenarios.innerHTML = `<div class="mmm-scenario-table"><table><thead><tr><th>Scenario</th><th>Budget</th><th>Expected KPI</th><th>Incremental Revenue</th><th>iROAS</th><th>Uplift</th><th></th></tr></thead><tbody>${state.savedScenarios.map((scenario, index) => `<tr><td><strong>${escapeHtml(scenario.name)}</strong><br><small>${escapeHtml(scenario.horizonLabel)}</small></td><td>${formatCurrency(scenario.budget)}</td><td>${formatCurrency(scenario.totalKpi)}</td><td>${formatCurrency(scenario.media)}</td><td>${formatRatio(scenario.iROAS)}</td><td>${formatPercent(scenario.uplift)}</td><td><button class="mmm-remove-scenario" type="button" data-remove-scenario="${index}">Remove</button></td></tr>`).join("")}</tbody></table></div>`;
    elements.savedScenarios.querySelectorAll("[data-remove-scenario]").forEach((button) => button.addEventListener("click", () => {
      state.savedScenarios.splice(Number(button.dataset.removeScenario), 1);
      renderSavedScenarios();
    }));
  }

  function renderModelMetrics() {
    const meta = dataset.meta;
    const metrics = [
      ["Model Version", meta.modelVersion],
      ["Training Window", meta.trainingWindow],
      ["Train R²", meta.trainR2.toFixed(3)],
      ["Test R²", meta.testR2.toFixed(3)],
      ["wMAPE", formatPercent(meta.wMAPE)],
    ];
    elements.modelMetrics.innerHTML = metrics.map(([label, value]) => `<div class="mmm-model-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  }

  function refreshPlanningScenario() {
    state.primaryValue = 0;
    state.manualBudgets = {};
    state.lastScenario = null;
    renderPlanningPeriod();
    renderPlannerControls();
    solvePlanner();
    pulse(elements.plannerWorkspace);
  }

  function renderAll({ resetPlanner = false } = {}) {
    const rows = filteredRows();
    currentSummary = summarize(rows);
    elements.scopeCopy.textContent = `${state.kpi} impact for ${state.product} · ${rows.length} days selected`;
    renderScorecards(currentSummary);
    renderTrend(rows);
    renderDecomposition(currentSummary);
    renderChannelsAndResponse();
    if (resetPlanner) {
      state.primaryValue = 0;
      state.manualBudgets = {};
      state.lastScenario = null;
      elements.saveScenario.disabled = true;
    }
    renderPlannerControls();
    solvePlanner();
  }

  function bindControls() {
    const dateStart = root.querySelector('[data-mmm-filter="dateStart"]');
    const dateEnd = root.querySelector('[data-mmm-filter="dateEnd"]');
    [dateStart, dateEnd].forEach((input) => {
      input.min = dataset.meta.defaultStart;
      input.max = dataset.meta.defaultEnd;
    });
    dateStart.value = state.dateStart;
    dateEnd.value = state.dateEnd;
    renderPlanningPeriod();
    dateStart.addEventListener("change", () => {
      state.dateStart = dateStart.value <= state.dateEnd ? dateStart.value : state.dateEnd;
      dateStart.value = state.dateStart;
      renderAll({ resetPlanner: true });
    });
    dateEnd.addEventListener("change", () => {
      state.dateEnd = dateEnd.value >= state.dateStart ? dateEnd.value : state.dateStart;
      dateEnd.value = state.dateEnd;
      renderAll({ resetPlanner: true });
    });
    root.querySelector('[data-mmm-filter="product"]').addEventListener("change", (event) => { state.product = event.target.value; renderAll(); });
    root.querySelector('[data-mmm-filter="kpi"]').addEventListener("change", (event) => { state.kpi = event.target.value; renderAll(); });
    root.querySelector("[data-mmm-reset]").addEventListener("click", () => {
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      state.product = dataset.meta.product;
      state.kpi = dataset.meta.businessKpis[0];
      state.responseChannel = "Meta";
      state.planningUnit = "month";
      state.planningPeriods = 3;
      state.planningStart = nextDay(dataset.meta.defaultEnd);
      dateStart.value = state.dateStart;
      dateEnd.value = state.dateEnd;
      elements.responseChannel.value = state.responseChannel;
      renderPlanningPeriod();
      renderAll({ resetPlanner: true });
    });

    elements.responseChannel.innerHTML = dataset.channels.map((channel) => `<option value="${channel.name}">${channel.name}</option>`).join("");
    elements.responseChannel.value = state.responseChannel;
    elements.responseChannel.addEventListener("change", () => selectResponseChannel(elements.responseChannel.value));
    root.querySelectorAll("[data-planning-unit]").forEach((button) => button.addEventListener("click", () => {
      state.planningUnit = button.dataset.planningUnit;
      state.planningPeriods = { week: 4, month: 3, year: 1 }[state.planningUnit];
      refreshPlanningScenario();
    }));
    elements.planningStart.addEventListener("change", () => {
      if (!elements.planningStart.value) return;
      state.planningStart = elements.planningStart.value;
      refreshPlanningScenario();
    });
    elements.planningPeriods.addEventListener("change", () => {
      state.planningPeriods = Number(elements.planningPeriods.value) || 1;
      refreshPlanningScenario();
    });
    elements.hiatusWeeks.addEventListener("input", () => {
      const metric = selectedMetric();
      renderCarryover(metric);
      renderHiatus(metric);
      pulse(elements.hiatusPanel);
      pulse(elements.carryoverCurve.closest(".mmm-panel"));
    });
    elements.hiatusTolerance.addEventListener("input", () => {
      renderHiatus(selectedMetric());
      pulse(elements.hiatusPanel);
    });
    root.querySelectorAll("[data-hiatus-preset]").forEach((button) => button.addEventListener("click", () => {
      elements.hiatusWeeks.value = button.dataset.hiatusPreset;
      const metric = selectedMetric();
      renderCarryover(metric);
      renderHiatus(metric);
      pulse(elements.hiatusPanel);
      pulse(elements.carryoverCurve.closest(".mmm-panel"));
    }));

    root.querySelectorAll("[data-planner-mode]").forEach((button) => button.addEventListener("click", () => {
      state.plannerMode = button.dataset.plannerMode;
      state.primaryValue = 0;
      state.lastScenario = null;
      renderPlannerControls();
      solvePlanner();
      pulse(elements.plannerWorkspace.querySelector(".mmm-planner-output"));
    }));
    elements.plannerPrimary.addEventListener("input", () => {
      state.primaryValue = Number(elements.plannerPrimary.value) || 0;
      root.querySelectorAll("[data-budget-multiplier]").forEach((button) => button.classList.remove("active"));
      queuePlannerSolve();
    });
    root.querySelectorAll("[data-budget-multiplier]").forEach((button) => button.addEventListener("click", () => {
      const reference = plannerReference();
      state.primaryValue = reference.currentBudget / 1e9 * Number(button.dataset.budgetMultiplier);
      elements.plannerPrimary.value = state.primaryValue.toFixed(1);
      root.querySelectorAll("[data-budget-multiplier]").forEach((item) => item.classList.toggle("active", item === button));
      solvePlanner();
      pulse(elements.plannerWorkspace.querySelector(".mmm-planner-output"));
    }));
    elements.maxDecrease.addEventListener("input", () => {
      state.maxDecrease = Number(elements.maxDecrease.value);
      elements.maxDecreaseOutput.textContent = `${state.maxDecrease}%`;
      queuePlannerSolve();
    });
    elements.maxIncrease.addEventListener("input", () => {
      state.maxIncrease = Number(elements.maxIncrease.value);
      elements.maxIncreaseOutput.textContent = `${state.maxIncrease}%`;
      queuePlannerSolve();
    });
    elements.runScenario.addEventListener("click", () => {
      state.primaryValue = Number(elements.plannerPrimary.value) || state.primaryValue;
      solvePlanner();
      pulse(elements.plannerWorkspace.querySelector(".mmm-planner-output"));
      elements.plannerResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    elements.saveScenario.addEventListener("click", () => {
      if (!state.lastScenario) return;
      if (state.savedScenarios.length >= 3) state.savedScenarios.shift();
      state.savedScenarios.push({
        name: `${state.lastScenario.modeLabel} ${state.savedScenarios.length + 1}`,
        budget: state.lastScenario.budget,
        totalKpi: state.lastScenario.totalKpi,
        media: state.lastScenario.media,
        iROAS: state.lastScenario.iROAS,
        uplift: state.lastScenario.uplift,
        horizonLabel: state.lastScenario.horizonLabel,
      });
      renderSavedScenarios();
      const original = elements.saveScenario.textContent;
      elements.saveScenario.textContent = "Scenario saved";
      window.setTimeout(() => { elements.saveScenario.textContent = original; }, 1200);
    });
  }

  async function initialize() {
    try {
      const response = await fetch("/static/data/mmm.json");
      if (!response.ok) throw new Error(`MMM dataset returned ${response.status}`);
      dataset = await response.json();
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      state.planningStart = nextDay(dataset.meta.defaultEnd);
      bindChartTooltips();
      bindControls();
      renderModelMetrics();
      renderSavedScenarios();
      renderAll({ resetPlanner: true });
      elements.status.hidden = true;
    } catch (error) {
      elements.status.classList.add("error");
      elements.status.innerHTML = `<span class="mmm-status-pulse" aria-hidden="true"></span>Unable to load the MMM demo: ${escapeHtml(error.message)}`;
    }
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (!dataset) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderTrend(filteredRows());
      renderChannelsAndResponse();
    }, 160);
  });

  initialize();
})();
