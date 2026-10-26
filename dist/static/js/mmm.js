(() => {
  const root = document.querySelector("[data-mmm-dashboard]");
  if (!root) return;

  const STORAGE_KEY = "xl-mmm-saved-scenarios-v3";
  const MAX_SAVED = 3;
  const MODE_LABELS = { budget: "Available budget", target: "Target KPI" };
  const MODE_COPY = {
    budget: "Spend an available monthly budget across the selected channels. The planner moves money to the channels whose next rupiah returns the most, within the guardrails.",
    target: "Set a monthly revenue target (baseline + media). The planner finds the smallest budget across the selected channels that reaches it.",
  };
  const SIGNAL_CLASS = { "Invest more": "invest", Hold: "hold", Reduce: "reduce", "Test & learn": "test" };

  const state = {
    dateStart: "2026-04-03",
    dateEnd: "2026-08-24",
    mode: "budget",
    primaryValue: null,
    preset: 1,
    horizonStart: "2026-08-25",
    horizonMonths: 3,
    selected: new Set(),
    locked: new Set(),
    maxDecrease: 30,
    maxIncrease: 60,
    hiatusChannel: "Meta",
    hiatusWeeks: 2,
    tolerance: 3,
    saved: [],
  };

  const q = (selector) => root.querySelector(selector);
  const el = {
    status: q("[data-mmm-status]"),
    scopeCopy: q("[data-mmm-scope-copy]"),
    dateStart: q('[data-mmm-filter="dateStart"]'),
    dateEnd: q('[data-mmm-filter="dateEnd"]'),
    reset: q("[data-mmm-reset]"),
    drHeadline: q("[data-dr-headline]"),
    drCharts: q("[data-dr-charts]"),
    drInsights: q("[data-dr-insights]"),
    drRecommendation: q("[data-dr-recommendation]"),
    drTable: q("[data-dr-table]"),
    modeCopy: q("[data-planner-mode-copy]"),
    primary: q("[data-planner-primary]"),
    primaryLabel: q("[data-planner-primary-label]"),
    primaryPrefix: q("[data-planner-primary-prefix]"),
    primarySuffix: q("[data-planner-primary-suffix]"),
    primaryHelper: q("[data-planner-primary-helper]"),
    presets: q("[data-planner-presets]"),
    horizonStart: q("[data-horizon-start]"),
    horizonMonths: q("[data-horizon-months]"),
    horizonEnd: q("[data-horizon-end]"),
    channels: q("[data-planner-channels]"),
    guardrailSummary: q("[data-guardrail-summary]"),
    maxDecrease: q("[data-max-decrease]"),
    maxDecreaseOutput: q("[data-max-decrease-output]"),
    maxIncrease: q("[data-max-increase]"),
    maxIncreaseOutput: q("[data-max-increase-output]"),
    resultTitle: q("[data-planner-result-title]"),
    horizonCopy: q("[data-planner-horizon-copy]"),
    banner: q("[data-planner-banner]"),
    kpis: q("[data-planner-kpis]"),
    allocation: q("[data-planner-allocation]"),
    recommendation: q("[data-planner-recommendation]"),
    save: q("[data-save-scenario]"),
    hiatusPanel: q("[data-hiatus-panel]"),
    hiatusChannels: q("[data-hiatus-channels]"),
    tolerance: q("[data-hiatus-tolerance]"),
    toleranceOutput: q("[data-hiatus-tolerance-output]"),
    carryover: q("[data-mmm-carryover-curve]"),
    carryoverCaption: q("[data-carryover-caption]"),
    hiatusResults: q("[data-hiatus-results]"),
    hiatusFeedback: q("[data-hiatus-feedback]"),
    hiatusTrajectory: q("[data-hiatus-trajectory]"),
    saved: q("[data-saved-scenarios]"),
  };

  let dataset = null;
  let DPM = 30.4375;
  let curves = {};
  let reference = null;
  let scenario = null;
  let tooltip = null;
  let solveTimer = null;

  // ---------- formatting ----------
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }
  const sum = (items, accessor) => items.reduce((total, item) => total + (Number(accessor(item)) || 0), 0);
  const safeDivide = (a, b) => (b ? a / b : 0);
  const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

  function compact(value, digits = 2) {
    const number = Number.isFinite(value) ? value : 0;
    const absolute = Math.abs(number);
    if (absolute >= 1e12) return `${(number / 1e12).toFixed(digits)}T`;
    if (absolute >= 1e9) return `${(number / 1e9).toFixed(digits)}B`;
    if (absolute >= 1e6) return `${(number / 1e6).toFixed(absolute >= 1e8 ? 0 : 1)}M`;
    if (absolute >= 1e3) return `${(number / 1e3).toFixed(0)}K`;
    return `${Math.round(number)}`;
  }
  const rp = (value, digits = 2) => `${value < 0 ? "−" : ""}Rp${compact(Math.abs(value), digits)}`;
  const signedRp = (value, digits = 2) => (Math.abs(value) < 1 ? "Rp0" : `${value > 0 ? "+" : "−"}Rp${compact(Math.abs(value), digits)}`);
  const pct = (value, digits = 1) => `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
  const signedPct = (value, digits = 1) => {
    const number = Number.isFinite(value) ? value : 0;
    if (Math.abs(number) < 0.05) return "0.0%";
    return `${number > 0 ? "+" : "−"}${Math.abs(number).toFixed(digits)}%`;
  };
  const ratio = (value) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
  const axisRp = (value) => {
    if (value === 0) return "0";
    if (Math.abs(value) >= 1e9) return `${Number((value / 1e9).toFixed(2))}B`;
    if (Math.abs(value) >= 1e6) return `${Number((value / 1e6).toFixed(1))}M`;
    return compact(value, 0);
  };

  function niceTicks(maximum, count = 4) {
    const raw = (maximum > 0 ? maximum : 1) / count;
    const exponent = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * exponent).find((candidate) => candidate >= raw);
    const top = Math.ceil(maximum / step - 1e-9) * step;
    const ticks = [];
    for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
    return { max: top, ticks };
  }

  function niceCeil(value) {
    if (!(value > 0)) return 1;
    const exponent = Math.pow(10, Math.floor(Math.log10(value)));
    for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (step * exponent >= value) return step * exponent;
    }
    return 10 * exponent;
  }

  function utcDate(value) { return new Date(`${value}T00:00:00Z`); }
  function isoDate(date) { return date.toISOString().slice(0, 10); }
  function formatDate(value) {
    return utcDate(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }
  function addMonths(value, months) {
    const date = utcDate(value);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
    target.setUTCDate(target.getUTCDate() - 1);
    return isoDate(target);
  }
  function nextDay(value) {
    const date = utcDate(value);
    date.setUTCDate(date.getUTCDate() + 1);
    return isoDate(date);
  }

  // ---------- response curves ----------
  function response(name, spend) {
    const c = curves[name];
    if (!c || spend <= 0) return 0;
    const sa = Math.pow(spend, c.alpha);
    return c.m * sa / (sa + c.ka);
  }
  function marginal(name, spend) {
    const c = curves[name];
    if (!c || spend <= 0) return 0;
    const sa = Math.pow(spend, c.alpha);
    return c.m * c.alpha * c.ka * Math.pow(spend, c.alpha - 1) / Math.pow(sa + c.ka, 2);
  }
  function averageReturn(name, spend) { return spend > 0 ? response(name, spend) / spend : 0; }

  function buildCurves() {
    const share = dataset.meta.efficientRangeShare || 0.98;
    curves = {};
    dataset.channels.forEach((channel) => {
      const { alpha, k, m } = channel.curve;
      curves[channel.name] = { alpha, k, m, ka: Math.pow(k, alpha) };
      const peakSpend = k * Math.pow(alpha - 1, 1 / alpha);
      const peak = averageReturn(channel.name, peakSpend);
      const bisect = (lo, hi, rising) => {
        for (let i = 0; i < 70; i += 1) {
          const mid = (lo + hi) / 2;
          const below = averageReturn(channel.name, mid) < share * peak;
          if (below === rising) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      };
      let breakEven = null;
      let lo = k * Math.pow((alpha - 1) / (alpha + 1), 1 / alpha);
      if (marginal(channel.name, lo) > 1) {
        let hi = k * 60;
        for (let i = 0; i < 80; i += 1) {
          const mid = (lo + hi) / 2;
          if (marginal(channel.name, mid) > 1) lo = mid; else hi = mid;
        }
        breakEven = (lo + hi) / 2;
      }
      Object.assign(curves[channel.name], {
        color: channel.color,
        halfLife: channel.halfLifeDays,
        band: { low: bisect(peakSpend * 1e-3, peakSpend, true), high: bisect(peakSpend, peakSpend * 50, false), peakSpend, peakIroas: peak },
        breakEven,
      });
    });
  }

  function channelSignal(monthly, totalMonthly, name) {
    const band = curves[name].band;
    const mroi = marginal(name, monthly);
    const share = safeDivide(monthly, totalMonthly);
    if (share < (dataset.meta.smallChannelShare || 0.05)) return "Test & learn";
    if (monthly < band.low && mroi > 1) return "Invest more";
    if (monthly > band.high || mroi < 1) return "Reduce";
    return "Hold";
  }

  function buildReference() {
    const rows = dataset.rows.filter((row) => row.date >= state.dateStart && row.date <= state.dateEnd);
    const days = Math.max(rows.length, 1);
    const toMonth = DPM / days;
    const channels = dataset.channels.map((channel) => {
      const spend = sum(rows, (row) => row.spend[channel.name]);
      const observed = sum(rows, (row) => (row.observed || {})[channel.name]);
      const monthly = spend * toMonth;
      const incr = response(channel.name, monthly);
      const observedRoas = safeDivide(observed, spend);
      return {
        name: channel.name,
        color: channel.color,
        monthly,
        incr,
        iroas: safeDivide(incr, monthly),
        mroi: marginal(channel.name, monthly),
        observedRoas,
        incrementalShare: safeDivide(safeDivide(incr, monthly), observedRoas),
        band: curves[channel.name].band,
        breakEven: curves[channel.name].breakEven,
        halfLife: curves[channel.name].halfLife,
      };
    });
    const totalMonthly = sum(channels, (channel) => channel.monthly);
    channels.forEach((channel) => { channel.signal = channelSignal(channel.monthly, totalMonthly, channel.name); });
    const media = sum(channels, (channel) => channel.incr);
    const nonMedia = sum(rows, (row) => row.baseline + row.promotion + row.seasonality + row.other) * toMonth;
    return {
      rows,
      days,
      channels,
      byName: Object.fromEntries(channels.map((channel) => [channel.name, channel])),
      totalMonthly,
      media,
      nonMedia,
      totalKpi: nonMedia + media,
      iroas: safeDivide(media, totalMonthly),
    };
  }

  // ---------- optimizer ----------
  function guardrailBounds() {
    const bounds = {};
    reference.channels.forEach((channel) => {
      const selected = state.selected.has(channel.name);
      const locked = selected && state.locked.has(channel.name);
      if (!selected) bounds[channel.name] = { floor: 0, ceil: 0, selected, locked: false };
      else if (locked) bounds[channel.name] = { floor: channel.monthly, ceil: channel.monthly, selected, locked };
      else bounds[channel.name] = { floor: channel.monthly * (1 - state.maxDecrease / 100), ceil: channel.monthly * (1 + state.maxIncrease / 100), selected, locked };
    });
    return bounds;
  }

  // Global optimum for separable S-shaped curves: dynamic programming over the budget above the channel floors.
  // Floors, locks and the total are always respected exactly; ceilings are respected to grid precision.
  function optimize(budget, bounds, grid = 1000) {
    const names = reference.channels.map((channel) => channel.name);
    const floors = names.map((name) => bounds[name].floor);
    const allocation = Object.fromEntries(names.map((name, index) => [name, floors[index]]));
    const slack = budget - floors.reduce((total, value) => total + value, 0);
    if (!(slack > 1)) return allocation;
    const unit = slack / grid;
    const caps = names.map((name, index) => Math.max(0, Math.min(grid, Math.floor((bounds[name].ceil - floors[index]) / unit + 1e-6))));
    if (caps.reduce((total, value) => total + value, 0) < grid) {
      const shortfall = grid - caps.reduce((total, value) => total + value, 0);
      const widest = caps.indexOf(Math.max(...caps));
      caps[widest] += shortfall;
    }
    let previous = new Float64Array(grid + 1).fill(-Infinity);
    previous[0] = 0;
    const choices = [];
    names.forEach((name, index) => {
      const cap = caps[index];
      const values = new Float64Array(cap + 1);
      for (let x = 0; x <= cap; x += 1) values[x] = response(name, floors[index] + x * unit);
      const next = new Float64Array(grid + 1).fill(-Infinity);
      const choice = new Int32Array(grid + 1).fill(-1);
      for (let g = 0; g <= grid; g += 1) {
        if (previous[g] === -Infinity) continue;
        const limit = Math.min(cap, grid - g);
        for (let x = 0; x <= limit; x += 1) {
          const value = previous[g] + values[x];
          if (value > next[g + x]) { next[g + x] = value; choice[g + x] = x; }
        }
      }
      choices.push(choice);
      previous = next;
    });
    let g = grid;
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const x = Math.max(choices[index][g], 0);
      allocation[names[index]] = floors[index] + x * unit;
      g -= x;
    }
    return allocation;
  }

  function mediaOf(allocation) {
    return sum(Object.entries(allocation), ([name, spend]) => response(name, spend));
  }

  function proportional(budget, bounds) {
    const allocation = {};
    let fixed = 0;
    let flexible = 0;
    reference.channels.forEach((channel) => {
      const bound = bounds[channel.name];
      if (!bound.selected) return;
      if (bound.locked) fixed += channel.monthly; else flexible += channel.monthly;
    });
    const factor = flexible ? Math.max(0, (budget - fixed) / flexible) : 0;
    reference.channels.forEach((channel) => {
      const bound = bounds[channel.name];
      allocation[channel.name] = !bound.selected ? 0 : bound.locked ? channel.monthly : channel.monthly * factor;
    });
    return { allocation, factor };
  }

  // Reference for the channels selected in the planner (the "pool").
  function poolReference() {
    const channels = reference.channels.filter((channel) => state.selected.has(channel.name));
    const excluded = reference.channels.filter((channel) => !state.selected.has(channel.name));
    return {
      names: channels.map((channel) => channel.name),
      budget: sum(channels, (channel) => channel.monthly),
      media: sum(channels, (channel) => channel.incr),
      excluded,
      label: channels.length === reference.channels.length ? `all ${channels.length} channels` : channels.map((channel) => channel.name).join(" + "),
    };
  }

  function planScenario() {
    const bounds = guardrailBounds();
    const pool = poolReference();
    const floorTotal = sum(Object.values(bounds), (bound) => bound.floor);
    const ceilTotal = sum(Object.values(bounds), (bound) => bound.ceil);
    const tolerance = Math.max(pool.budget * 0.001, 1);
    const notes = [];
    let allocation;
    let status = "optimized";

    if (state.mode === "budget") {
      const budget = Math.max(0, (Number(state.primaryValue) || 0) * 1e9);
      if (budget >= floorTotal - tolerance && budget <= ceilTotal + tolerance) {
        allocation = optimize(budget, bounds);
      } else {
        const result = proportional(budget, bounds);
        allocation = result.allocation;
        status = budget < floorTotal ? "below" : "above";
        const change = (result.factor - 1) * 100;
        notes.push(status === "below"
          ? `Budget is below the lowest total the guardrails allow for ${pool.label} (${rp(floorTotal)}/month). Every unlocked channel is cut by ${pct(Math.abs(change), 0)} instead of optimized — this is outside the modeled range, treat it as directional.`
          : `Budget is above the highest total the guardrails allow for ${pool.label} (${rp(ceilTotal)}/month). Every unlocked channel is raised by ${pct(change, 0)} instead of optimized — this is outside the modeled range, treat it as directional.`);
      }
    } else {
      const target = Math.max(0, (Number(state.primaryValue) || 0) * 1e9);
      const needed = target - reference.nonMedia;
      const maxPlan = optimize(ceilTotal, bounds, 300);
      if (needed <= mediaOf(optimize(floorTotal, bounds, 300))) {
        allocation = optimize(floorTotal, bounds);
        notes.push(`The target is already reached at the lowest budget the guardrails allow for ${pool.label} (${rp(floorTotal)}/month).`);
      } else if (mediaOf(maxPlan) < needed) {
        allocation = optimize(ceilTotal, bounds);
        status = "unreachable";
        notes.push(`The target needs ${rp(needed)}/month of incremental revenue from ${pool.label}, more than the curves can deliver within the guardrails (${rp(mediaOf(maxPlan))}/month). Showing the maximum-guardrail plan.`);
      } else {
        let low = floorTotal;
        let high = ceilTotal;
        for (let i = 0; i < 22; i += 1) {
          const mid = (low + high) / 2;
          if (mediaOf(optimize(mid, bounds, 200)) >= needed) high = mid; else low = mid;
        }
        allocation = optimize(high, bounds);
      }
    }
    return evaluate(allocation, bounds, status, notes, pool);
  }

  function position(channel, spend) {
    if (spend <= 0) return { label: "Not funded", className: "muted" };
    const mroi = marginal(channel.name, spend);
    if (spend > channel.band.high && mroi < 1) return { label: "Past break-even", className: "danger" };
    if (spend > channel.band.high) return { label: "Above efficient range", className: "warn" };
    if (spend < channel.band.low) return { label: "Below efficient range", className: "info" };
    return { label: "In efficient range", className: "good" };
  }

  function guardLabel(channel, spend, bound) {
    if (!bound.selected) return "Not in pool";
    if (bound.locked) return "Locked";
    const tolerance = Math.max(channel.monthly * 0.006, 1);
    if (spend > bound.ceil + tolerance || spend < bound.floor - tolerance) return "Outside guardrail";
    if (Math.abs(spend - bound.ceil) <= tolerance && spend > channel.monthly + tolerance) return `At +${state.maxIncrease}% cap`;
    if (Math.abs(spend - bound.floor) <= tolerance && spend < channel.monthly - tolerance) return `At −${state.maxDecrease}% floor`;
    return "";
  }

  function evaluate(allocation, bounds, status, notes, pool) {
    const plans = reference.channels.map((channel) => {
      const spend = allocation[channel.name] || 0;
      const incr = response(channel.name, spend);
      return {
        ...channel,
        inPool: bounds[channel.name].selected,
        scenario: spend,
        scenarioIncr: incr,
        delta: spend - channel.monthly,
        deltaPct: safeDivide(spend - channel.monthly, channel.monthly) * 100,
        incrDelta: incr - channel.incr,
        scenarioIroas: safeDivide(incr, spend),
        scenarioMroi: marginal(channel.name, spend),
        position: position(channel, spend),
        guard: guardLabel(channel, spend, bounds[channel.name]),
      };
    });
    const budget = sum(plans, (plan) => plan.scenario);
    const media = sum(plans, (plan) => plan.scenarioIncr);
    const isPast = (plan) => plan.scenario > 0 && plan.scenarioMroi < 1 && plan.scenario > plan.band.high;
    const lockedPast = plans.filter((plan) => isPast(plan) && bounds[plan.name]?.locked);
    const pastBreakEven = plans.filter((plan) => isPast(plan) && !bounds[plan.name]?.locked);
    if (lockedPast.length) {
      notes.push(`${lockedPast.map((plan) => `${plan.name} is locked at ${rp(plan.scenario)}/month, past break-even (next Rp1 returns ${ratio(plan.scenarioMroi)})`).join("; ")}. Unlock it to let the planner rebalance.`);
    }
    if (pastBreakEven.length) {
      notes.push(`${pastBreakEven.map((plan) => plan.name).join(" and ")} ${pastBreakEven.length > 1 ? "are" : "is"} funded past break-even (next Rp1 returns less than Rp1) because the budget must be fully spent and stronger channels are at their caps. Consider a smaller budget or wider caps.`);
    }
    if (pool.excluded.length) {
      notes.push(`Not in this scenario: ${pool.excluded.map((channel) => `${channel.name} (reference ${rp(channel.monthly)}/month, ${rp(channel.incr)} incremental revenue)`).join(", ")}. Comparisons use the reference of the selected channels only (${rp(pool.budget)}/month).`);
    }
    return {
      mode: state.mode,
      status,
      notes,
      plans,
      pool,
      byName: Object.fromEntries(plans.map((plan) => [plan.name, plan])),
      budget,
      media,
      totalKpi: reference.nonMedia + media,
      iroas: safeDivide(media, budget),
      mroi: safeDivide(sum(plans, (plan) => plan.scenarioMroi * plan.scenario), budget),
      poolBudget: pool.budget,
      poolMedia: pool.media,
      budgetDelta: budget - pool.budget,
      mediaDelta: media - pool.media,
      mediaDeltaPct: safeDivide(media - pool.media, pool.media) * 100,
      months: state.horizonMonths,
    };
  }

  // ---------- tooltips ----------
  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "mmm-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }
  function placeTooltip(x, y) {
    if (!tooltip || tooltip.hidden) return;
    const box = tooltip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + box.width > window.innerWidth - 8) left = x - box.width - 14;
    if (top + box.height > window.innerHeight - 8) top = y - box.height - 14;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }
  function showTooltip(html, x, y) {
    ensureTooltip();
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    placeTooltip(x, y);
  }
  function hideTooltip() { if (tooltip) tooltip.hidden = true; }

  function bindStaticTooltips() {
    root.addEventListener("pointerover", (event) => {
      const target = event.target.closest?.("[data-tooltip-text]");
      if (target) showTooltip(escapeHtml(target.dataset.tooltipText).replace(/\n/g, "<br>"), event.clientX, event.clientY);
    });
    root.addEventListener("pointermove", (event) => {
      if (event.target.closest?.("[data-tooltip-text]")) placeTooltip(event.clientX, event.clientY);
    });
    root.addEventListener("pointerout", (event) => {
      const target = event.target.closest?.("[data-tooltip-text]");
      if (target && !(event.relatedTarget && target.contains(event.relatedTarget))) hideTooltip();
    });
  }

  // ---------- section 01: diminishing return ----------
  function diminishingChart(channel) {
    const W = 560;
    const H = 292;
    const m = { l: 56, r: 50, t: 26, b: 42 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const plan = scenario?.byName[channel.name];
    const scenarioSpend = plan ? plan.scenario : null;
    const xAxis = niceTicks(Math.max(channel.monthly * 1.9, channel.band.high * 1.5, (scenarioSpend || 0) * 1.15), 4);
    const xMax = xAxis.max;
    const samples = Array.from({ length: 141 }, (_, i) => {
      const spend = (xMax * i) / 140;
      return { spend, incr: response(channel.name, spend), roas: averageReturn(channel.name, spend) };
    });
    const yAxis = niceTicks(Math.max(...samples.map((s) => s.incr)) * 1.05, 4);
    const rAxis = niceTicks(channel.band.peakIroas * 1.3, 4);
    const yMax = yAxis.max;
    const rMax = rAxis.max;
    const x = (v) => m.l + (v / xMax) * pw;
    const y = (v) => m.t + ph - (v / yMax) * ph;
    const yr = (v) => m.t + ph - (v / rMax) * ph;
    const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const incrPath = path(samples.map((s) => [x(s.spend), y(s.incr)]));
    const roasPath = path(samples.filter((s) => s.spend > 0).map((s) => [x(s.spend), yr(s.roas)]));
    const grid = yAxis.ticks.map((v) => `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}" class="dr-grid"/><text x="${m.l - 8}" y="${y(v) + 3.5}" text-anchor="end" class="dr-axis">${axisRp(v)}</text>`).join("")
      + rAxis.ticks.map((v) => `<text x="${m.l + pw + 8}" y="${yr(v) + 3.5}" class="dr-axis">${Number(v.toFixed(2))}x</text>`).join("");
    const xTicks = xAxis.ticks.map((v) => `<text x="${x(v)}" y="${m.t + ph + 16}" text-anchor="middle" class="dr-axis">${axisRp(v)}</text>`).join("");
    const bx1 = x(channel.band.low);
    const bx2 = x(Math.min(channel.band.high, xMax));
    const box = `<rect x="${bx1}" y="${m.t}" width="${Math.max(0, bx2 - bx1)}" height="${ph}" class="dr-box"/><text x="${(bx1 + bx2) / 2}" y="${m.t + 12}" text-anchor="middle" class="dr-box-label">Efficient range</text>`;
    const cx = x(channel.monthly);
    const cy = y(channel.incr);
    const current = `<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${m.t + ph}" class="dr-current-line"/><circle cx="${cx}" cy="${cy}" r="5.5" class="dr-current-dot" data-tooltip-text="${escapeHtml(`Current budget ${rp(channel.monthly)}/month\nIncremental revenue ${rp(channel.incr)}/month\niROAS ${ratio(channel.iroas)} · next Rp1 ${ratio(channel.mroi)}`)}"/><text x="${cx}" y="${m.t + ph - 6}" text-anchor="middle" class="dr-marker-label current">Current ${rp(channel.monthly)}</text>`;
    let scenarioMarker = "";
    if (plan && plan.inPool && Math.abs(plan.scenario - channel.monthly) > channel.monthly * 0.005) {
      const sx = x(plan.scenario);
      const sy = y(plan.scenarioIncr);
      const labelY = Math.max(m.t + 24, sy - 12);
      scenarioMarker = `<line x1="${sx}" x2="${sx}" y1="${sy}" y2="${m.t + ph}" class="dr-scenario-line"/><circle cx="${sx}" cy="${sy}" r="6.5" class="dr-scenario-dot" data-tooltip-text="${escapeHtml(`Scenario budget ${rp(plan.scenario)}/month (${signedPct(plan.deltaPct)})\nIncremental revenue ${rp(plan.scenarioIncr)}/month (${signedRp(plan.incrDelta)})\niROAS ${ratio(plan.scenarioIroas)} · next Rp1 ${ratio(plan.scenarioMroi)}`)}"/><text x="${sx}" y="${labelY}" text-anchor="middle" class="dr-marker-label scenario">Scenario ${rp(plan.scenario)}</text>`;
    }
    const signalClass = SIGNAL_CLASS[channel.signal];
    return `<article class="mmm-panel mmm-dr-card" data-dr-channel="${channel.name}">
      <header><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span><span class="mmm-signal ${signalClass}">${channel.signal}</span></header>
      <p class="mmm-dr-card-copy">Efficient range <strong>${rp(channel.band.low)}–${rp(channel.band.high)}</strong>/month · peak iROAS ${ratio(channel.band.peakIroas)}${plan && !plan.inPool ? ' · <em class="mmm-not-in-pool">not in scenario pool</em>' : ""}</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${channel.name} incremental revenue and iROAS by monthly budget" data-dr-svg="${channel.name}" data-xmax="${xMax}" data-ymax="${yMax}">
        ${box}${grid}${xTicks}
        <path d="${incrPath}" class="dr-incr" style="stroke:${channel.color}"/>
        <path d="${roasPath}" class="dr-roas" style="stroke:${channel.color}"/>
        ${current}${scenarioMarker}
        <line class="dr-hover-line" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" opacity="0"/>
        <rect class="dr-hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/>
        <text x="${m.l + pw / 2}" y="${H - 4}" text-anchor="middle" class="dr-axis-title">Budget per month (Rp)</text>
        <text x="12" y="${m.t + ph / 2}" transform="rotate(-90 12 ${m.t + ph / 2})" text-anchor="middle" class="dr-axis-title">Incremental revenue / month</text>
        <text x="${W - 8}" y="${m.t + ph / 2}" transform="rotate(90 ${W - 8} ${m.t + ph / 2})" text-anchor="middle" class="dr-axis-title">iROAS</text>
      </svg>
    </article>`;
  }

  function bindDiminishingHover() {
    el.drCharts.querySelectorAll("[data-dr-svg]").forEach((svg) => {
      const name = svg.dataset.drSvg;
      const xMax = Number(svg.dataset.xmax);
      const hit = svg.querySelector(".dr-hit");
      const line = svg.querySelector(".dr-hover-line");
      const m = { l: 56, r: 50 };
      const W = 560;
      hit.addEventListener("pointermove", (event) => {
        const box = svg.getBoundingClientRect();
        const vx = ((event.clientX - box.left) / box.width) * W;
        const spend = clamp(((vx - m.l) / (W - m.l - m.r)) * xMax, 0, xMax);
        line.setAttribute("x1", vx);
        line.setAttribute("x2", vx);
        line.setAttribute("opacity", "1");
        const incr = response(name, spend);
        showTooltip(`<strong>${escapeHtml(name)} · ${rp(spend)}/month</strong><br>Incremental revenue ${rp(incr)}/month<br>iROAS ${ratio(averageReturn(name, spend))} · next Rp1 ${ratio(marginal(name, spend))}`, event.clientX, event.clientY);
      });
      hit.addEventListener("pointerleave", () => { line.setAttribute("opacity", "0"); hideTooltip(); });
    });
  }

  function channelInsight(channel) {
    const range = `${rp(channel.band.low)}–${rp(channel.band.high)}/month`;
    const peak = ratio(channel.band.peakIroas);
    if (channel.signal === "Reduce") return `<strong>${channel.name} is past its efficient range.</strong> Efficiency peaks at ${range} (iROAS ≈${peak}); the current ${rp(channel.monthly)}/month earns ${ratio(channel.iroas)} on average and only ${ratio(channel.mroi)} on the next rupiah.`;
    if (channel.signal === "Invest more") return `<strong>${channel.name} still has headroom.</strong> Efficiency peaks at ${range} (iROAS ≈${peak}); the current ${rp(channel.monthly)}/month is below that range and the next rupiah returns ${ratio(channel.mroi)}.`;
    if (channel.signal === "Test & learn") return `<strong>${channel.name} reaches peak efficiency quickly on a small base.</strong> The efficient range is ${range} (iROAS ≈${peak}); the current ${rp(channel.monthly)}/month returns ${ratio(channel.mroi)} on the next rupiah — validate with a controlled test.`;
    return `<strong>${channel.name} is operating inside its efficient range</strong> (${range}, iROAS ≈${peak}); keep spend within that range — it can fund reallocation without leaving it.`;
  }

  function renderDiminishing() {
    const channels = reference.channels;
    const invest = channels.filter((channel) => channel.signal === "Invest more").sort((a, b) => b.mroi - a.mroi);
    const reduce = channels.filter((channel) => channel.signal === "Reduce").sort((a, b) => (b.monthly - b.band.high) - (a.monthly - a.band.high));
    const test = channels.filter((channel) => channel.signal === "Test & learn");
    const hold = channels.filter((channel) => channel.signal === "Hold");
    if (invest.length && reduce.length) el.drHeadline.textContent = `${invest[0].name} has the most headroom, while ${reduce[0].name} is already past its efficient range`;
    else if (invest.length) el.drHeadline.textContent = `${invest[0].name} has the most headroom for additional investment`;
    else if (reduce.length) el.drHeadline.textContent = `${reduce[0].name} is past its efficient range — rebalance before adding budget`;
    else el.drHeadline.textContent = "Every channel is operating close to its efficient range";

    el.drCharts.innerHTML = channels.map(diminishingChart).join("");
    bindDiminishingHover();
    el.drInsights.innerHTML = channels.map((channel) => `<li style="--channel-color:${channel.color}">${channelInsight(channel)}</li>`).join("");

    const bullets = [];
    if (invest.length) bullets.push(`Direct additional investment to ${invest.map((c) => c.name).join(" and ")} first — the next rupiah returns ${invest.map((c) => `${ratio(c.mroi)} (${c.name})`).join(", ")}.`);
    if (reduce.length) bullets.push(`Bring ${reduce.map((c) => c.name).join(" and ")} back toward ${reduce.length > 1 ? "their" : "its"} efficient range (${reduce.map((c) => `${rp(c.band.high)}/month`).join(", ")}) before adding budget.`);
    if (test.length) bullets.push(`Fund ${test.map((c) => c.name).join(" and ")} as a controlled test within ${test.map((c) => `${rp(c.band.low)}–${rp(c.band.high)}/month`).join(", ")}.`);
    if (hold.length) bullets.push(`Keep ${hold.map((c) => c.name).join(" and ")} inside ${hold.length > 1 ? "their" : "its"} efficient range (${hold.map((c) => `${rp(c.band.low)}–${rp(c.band.high)}/month`).join(", ")}); trimming within that range is acceptable when reallocating.`);
    el.drRecommendation.innerHTML = `<p class="mmm-kicker">Recommendation</p><ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;

    el.drTable.innerHTML = channels.map((channel) => `<tr>
      <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span></td>
      <td class="numeric">${ratio(channel.observedRoas)}</td>
      <td class="numeric">${ratio(channel.iroas)}</td>
      <td class="numeric">${pct(channel.incrementalShare * 100, 0)}</td>
      <td class="numeric">${rp(channel.monthly)}</td>
      <td class="numeric">${rp(channel.band.low)}–${rp(channel.band.high)}</td>
      <td class="numeric">${ratio(channel.mroi)}</td>
      <td><span class="mmm-signal ${SIGNAL_CLASS[channel.signal]}">${channel.signal}</span></td>
    </tr>`).join("") + `<tr class="total"><td><strong>Portfolio</strong></td><td class="numeric">${ratio(safeDivide(sum(channels, (c) => c.observedRoas * c.monthly), reference.totalMonthly))}</td><td class="numeric">${ratio(reference.iroas)}</td><td class="numeric">${pct(safeDivide(reference.iroas, safeDivide(sum(channels, (c) => c.observedRoas * c.monthly), reference.totalMonthly)) * 100, 0)}</td><td class="numeric">${rp(reference.totalMonthly)}</td><td></td><td class="numeric">${ratio(safeDivide(sum(channels, (c) => c.mroi * c.monthly), reference.totalMonthly))}</td><td></td></tr>`;
  }

  // ---------- section 02: planner ----------
  function defaultPrimary() {
    const pool = poolReference();
    if (state.mode === "budget") return pool.budget / 1e9 * (state.preset ?? 1);
    return Math.round((reference.nonMedia + pool.media) * 1.03 / 1e8) / 10;
  }

  function renderPlannerControls() {
    const pool = poolReference();
    root.querySelectorAll("[data-planner-mode]").forEach((button) => {
      const active = button.dataset.plannerMode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    el.modeCopy.textContent = MODE_COPY[state.mode];
    if (state.primaryValue === null) state.primaryValue = defaultPrimary();
    el.presets.hidden = state.mode !== "budget";
    const bounds = guardrailBounds();
    const poolText = `Reference for ${pool.label}: ${rp(pool.budget)}/month${pool.excluded.length ? ` (all channels ${rp(reference.totalMonthly)})` : ""}.`;
    if (state.mode === "budget") {
      el.primaryLabel.textContent = "Available media budget per month";
      el.primarySuffix.textContent = "B / month";
      el.primary.step = "0.05";
      el.primary.value = Number(state.primaryValue).toFixed(2);
      el.primaryHelper.textContent = `${poolText} Guardrails allow ${rp(sum(Object.values(bounds), (b) => b.floor))}–${rp(sum(Object.values(bounds), (b) => b.ceil))}/month.`;
      root.querySelectorAll("[data-budget-multiplier]").forEach((button) => {
        button.classList.toggle("active", state.preset !== null && Number(button.dataset.budgetMultiplier) === state.preset);
      });
    } else {
      el.primaryLabel.textContent = "Target KPI: revenue per month (baseline + media)";
      el.primarySuffix.textContent = "B / month";
      el.primary.step = "0.1";
      el.primary.value = Number(state.primaryValue).toFixed(1);
      el.primaryHelper.textContent = `Current with ${pool.label}: ${rp(reference.nonMedia + pool.media)}/month = baseline & other drivers ${rp(reference.nonMedia)} + media ${rp(pool.media)}. ${poolText}`;
    }

    el.horizonStart.value = state.horizonStart;
    el.horizonMonths.value = String(state.horizonMonths);
    el.horizonEnd.textContent = formatDate(addMonths(state.horizonStart, state.horizonMonths));

    el.channels.innerHTML = `<div class="mmm-channel-table-head"><span>Channel</span><span>Reference / month</span><span>Include</span><span>Lock</span></div>` + reference.channels.map((channel) => {
      const selected = state.selected.has(channel.name);
      return `<div class="mmm-channel-row${selected ? "" : " excluded"}">
        <span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span>
        <span>${rp(channel.monthly)}</span>
        <label class="mmm-toggle"><input type="checkbox" data-include-channel="${channel.name}" ${selected ? "checked" : ""}><span class="sr-only">Include ${channel.name}</span></label>
        <label class="mmm-toggle lock"><input type="checkbox" data-lock-channel="${channel.name}" ${state.locked.has(channel.name) && selected ? "checked" : ""} ${selected ? "" : "disabled"}><span class="sr-only">Lock ${channel.name}</span></label>
      </div>`;
    }).join("") + `<div class="mmm-channel-row total"><span>Reference · ${pool.names.length} selected</span><span>${rp(pool.budget)}</span><span></span><span></span></div>`;

    el.maxDecrease.value = state.maxDecrease;
    el.maxIncrease.value = state.maxIncrease;
    el.maxDecreaseOutput.textContent = `${state.maxDecrease}%`;
    el.maxIncreaseOutput.textContent = `${state.maxIncrease}%`;
    el.guardrailSummary.textContent = `−${state.maxDecrease}% / +${state.maxIncrease}%`;
  }

  function renderPlannerOutput() {
    const s = scenario;
    const pool = s.pool;
    el.resultTitle.textContent = s.status === "below" || s.status === "above" ? "Equal % change (outside guardrails)" : "Recommended channel mix";
    el.horizonCopy.textContent = `${MODE_LABELS[s.mode]} · ${pool.label} · ${state.horizonMonths} month${state.horizonMonths === 1 ? "" : "s"} (${formatDate(state.horizonStart)} – ${formatDate(addMonths(state.horizonStart, state.horizonMonths))})`;
    el.banner.hidden = !s.notes.length;
    el.banner.className = `mmm-planner-banner ${s.status === "optimized" ? "info" : "warn"}`;
    el.banner.innerHTML = s.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("");

    const months = state.horizonMonths;
    const cards = [
      ["Reference budget / month", rp(s.poolBudget), `${pool.label} · ${rp(s.poolBudget * months)} over ${months} mo`, ""],
      ["Scenario budget / month", rp(s.budget), `${signedRp(s.budgetDelta)} (${signedPct(safeDivide(s.budgetDelta, s.poolBudget) * 100)}) vs reference · ${rp(s.budget * months)} over ${months} mo`, "primary"],
      ["Incremental revenue / month", rp(s.media), `${signedRp(s.mediaDelta)} (${signedPct(s.mediaDeltaPct)}) vs reference ${rp(s.poolMedia)} · ${rp(s.media * months)} over ${months} mo`, s.mediaDelta >= 0 ? "good" : "bad"],
      ["Portfolio iROAS · mROI", `${ratio(s.iroas)} · ${ratio(s.mroi)}`, `Reference iROAS ${ratio(safeDivide(s.poolMedia, s.poolBudget))} · mROI = return on the next Rp1`, s.mroi >= 1 ? "" : "bad"],
    ];
    el.kpis.innerHTML = cards.map(([label, value, note, cls]) => `<div class="mmm-kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");

    const scaleMax = Math.max(...s.plans.map((plan) => Math.max(plan.monthly, plan.scenario)), 1) * 1.05;
    el.allocation.innerHTML = s.plans.map((plan) => `<tr class="${plan.inPool ? "" : "excluded"}">
      <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${plan.color}"></i>${plan.name}</span>${plan.guard ? `<small class="mmm-guard">${plan.guard}</small>` : ""}</td>
      <td class="numeric">${rp(plan.monthly)}</td>
      <td><div class="mmm-bar-pair"><span class="current" style="width:${(plan.monthly / scaleMax) * 100}%"></span><span class="scenario" style="width:${(plan.scenario / scaleMax) * 100}%;background:${plan.color}"></span></div><strong class="mmm-bar-value">${rp(plan.scenario)}</strong></td>
      <td class="numeric ${plan.inPool && plan.delta > 1 ? "up" : plan.inPool && plan.delta < -1 ? "down" : ""}">${plan.inPool ? signedPct(plan.deltaPct) : "—"}<small>${plan.inPool ? signedRp(plan.delta) : "not in pool"}</small></td>
      <td class="numeric ${plan.inPool && plan.incrDelta > 1 ? "up" : plan.inPool && plan.incrDelta < -1 ? "down" : ""}">${plan.inPool ? signedRp(plan.incrDelta) : "—"}</td>
      <td class="numeric">${plan.scenario > 0 ? ratio(plan.scenarioMroi) : "—"}</td>
      <td><span class="mmm-position ${plan.position.className}">${plan.inPool ? plan.position.label : "Not in pool"}</span></td>
    </tr>`).join("") + `<tr class="total"><td><strong>Selected channels</strong><small>${escapeHtml(pool.label)}</small></td><td class="numeric"><strong>${rp(s.poolBudget)}</strong></td><td><strong class="mmm-bar-value">${rp(s.budget)}</strong></td><td class="numeric">${signedPct(safeDivide(s.budgetDelta, s.poolBudget) * 100)}<small>${signedRp(s.budgetDelta)}</small></td><td class="numeric ${s.mediaDelta >= 0 ? "up" : "down"}">${signedRp(s.mediaDelta)}</td><td class="numeric">${ratio(s.mroi)}</td><td></td></tr>`;

    const inPool = s.plans.filter((plan) => plan.inPool);
    const up = inPool.filter((plan) => plan.delta > plan.monthly * 0.01 + 1).sort((a, b) => b.delta - a.delta);
    const down = inPool.filter((plan) => plan.delta < -(plan.monthly * 0.01 + 1)).sort((a, b) => a.delta - b.delta);
    const moved = sum(up, (plan) => plan.delta);
    let text;
    if (!up.length && !down.length) {
      text = `The reference mix of ${pool.label} is kept. Modeled incremental revenue stays at ${rp(s.media)}/month.`;
    } else if (Math.abs(s.budgetDelta) < s.poolBudget * 0.005) {
      text = `Within the same ${rp(s.budget)}/month for ${pool.label}, move ${rp(moved)} from ${down.map((p) => p.name).join(" and ") || "—"} into ${up.map((p) => p.name).join(" and ") || "—"}. Incremental revenue changes ${signedRp(s.mediaDelta)}/month (${signedPct(s.mediaDeltaPct)}), ${signedRp(s.mediaDelta * months)} over ${months} months.`;
    } else {
      const moves = `${up.length ? `Increase ${up.map((p) => `${p.name} (${signedPct(p.deltaPct, 0)})`).join(", ")}` : "No channel increases"}${down.length ? `; reduce ${down.map((p) => `${p.name} (${signedPct(p.deltaPct, 0)})`).join(", ")}` : ""}.`;
      const perRupiah = Math.abs(safeDivide(s.mediaDelta, s.budgetDelta));
      text = s.budgetDelta > 0
        ? `Budget rises ${rp(s.budgetDelta)}/month versus the ${pool.label} reference. ${moves} Incremental revenue changes ${signedRp(s.mediaDelta)}/month (${signedPct(s.mediaDeltaPct)}) — about Rp${perRupiah.toFixed(2)} per extra rupiah, including the gain from moving money into higher-return channels.`
        : s.mediaDelta < 0
          ? `Budget falls ${rp(Math.abs(s.budgetDelta))}/month versus the ${pool.label} reference. ${moves} Incremental revenue changes ${signedRp(s.mediaDelta)}/month (${signedPct(s.mediaDeltaPct)}) — about Rp${perRupiah.toFixed(2)} of revenue given up per rupiah saved.`
          : `Budget falls ${rp(Math.abs(s.budgetDelta))}/month, yet incremental revenue still changes ${signedRp(s.mediaDelta)}/month (${signedPct(s.mediaDeltaPct)}) because money moves into higher-return channels. ${moves}`;
    }
    el.recommendation.innerHTML = `<span class="mmm-kicker">Interpretation</span><p>${text}</p>`;
    el.save.disabled = false;
  }

  function solve({ pulse = false } = {}) {
    scenario = planScenario();
    renderPlannerOutput();
    renderDiminishing();
    renderHiatus();
    if (pulse) flash(el.kpis);
  }

  function queueSolve() {
    window.clearTimeout(solveTimer);
    solveTimer = window.setTimeout(() => solve({ pulse: true }), 140);
  }

  function flash(node) {
    if (!node) return;
    node.classList.remove("is-updated");
    window.requestAnimationFrame(() => {
      node.classList.add("is-updated");
      window.setTimeout(() => node.classList.remove("is-updated"), 450);
    });
  }

  // ---------- section 03: pause planner ----------
  function lostEffect(halfLife, days) {
    if (!days) return 0;
    const decay = Math.pow(0.5, 1 / halfLife);
    const averageRemaining = (1 - Math.pow(decay, days)) / (days * (1 - decay));
    return 1 - averageRemaining;
  }

  function renderHiatus() {
    el.hiatusChannels.innerHTML = reference.channels.map((channel) => `<button type="button" class="${channel.name === state.hiatusChannel ? "active" : ""}" data-hiatus-channel="${channel.name}"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</button>`).join("");
    root.querySelectorAll("[data-hiatus-preset]").forEach((button) => button.classList.toggle("active", Number(button.dataset.hiatusPreset) === state.hiatusWeeks));
    el.tolerance.value = state.tolerance;
    el.toleranceOutput.textContent = `${state.tolerance}%`;

    const plan = scenario.byName[state.hiatusChannel];
    const halfLife = plan.halfLife;
    const weeks = state.hiatusWeeks;
    const days = weeks * 7;
    el.carryoverCaption.textContent = `${plan.name} · half-life ${halfLife.toFixed(1)} days`;
    renderCarryover(plan, days);

    if (plan.scenario <= 0) {
      el.hiatusResults.innerHTML = "";
      el.hiatusFeedback.className = "mmm-hiatus-feedback";
      el.hiatusFeedback.innerHTML = `<strong>${plan.name} is not funded in the active scenario.</strong> There is nothing to pause — include it in the planner to evaluate a pause.`;
      el.hiatusTrajectory.innerHTML = "";
      return;
    }

    const share = safeDivide(plan.scenarioIncr, scenario.totalKpi);
    const declineAt = (w) => share * lostEffect(halfLife, w * 7) * 100;
    const decline = declineAt(weeks);
    let safeWeeks = 0;
    for (let w = 0; w <= 8; w += 1) if (declineAt(w) <= state.tolerance) safeWeeks = w;
    // Revenue accounting: the paused budget would have produced iROAS x budget of incremental revenue.
    // Part of that loss shows up during the pause (effect decays), the rest while the effect rebuilds after restart.
    const daily = plan.scenarioIncr / DPM;
    const savings = plan.scenario / DPM * days;
    const lostTotal = daily * days;
    const lostDuring = lostTotal * lostEffect(halfLife, days);
    const lostAfter = lostTotal - lostDuring;
    const net = savings - lostTotal;
    const within = decline <= state.tolerance;
    const recovery = Math.ceil(halfLife * 2);

    const cards = [
      ["KPI decline during pause", pct(decline), within ? "good" : "bad", `Allowed ${state.tolerance}% · ${within ? "within limit" : "above limit"}`],
      ["Longest pause within limit", `${safeWeeks} week${safeWeeks === 1 ? "" : "s"}`, "", "Whole weeks, directional"],
      ["Media budget saved", rp(savings), "good", `${rp(plan.scenario)}/month for ${days} days`],
      ["Revenue lost during pause", rp(lostDuring), "bad", `Effect fades to ${pct(Math.pow(0.5, days / halfLife) * 100, 0)} by restart`],
      ["Revenue lost after restart", rp(lostAfter), "bad", `While the effect rebuilds (≈${recovery} days)`],
      ["Net (saved − total lost)", signedRp(net), net >= 0 ? "good" : "bad", `Total lost ${rp(lostTotal)} = iROAS ${ratio(plan.scenarioIroas)} × saved budget`],
    ];
    el.hiatusResults.innerHTML = cards.map(([label, value, cls, note]) => `<div class="mmm-hiatus-metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
    el.hiatusFeedback.className = `mmm-hiatus-feedback ${within ? "safe" : "risk"}`;
    const economics = net < 0
      ? `Pausing saves ${rp(savings)} of budget but gives up about ${rp(lostTotal)} of incremental revenue (net ${signedRp(net)}), because every rupiah in ${plan.name} returns ${ratio(plan.scenarioIroas)} on average. Pause only if the budget itself must be released.`
      : `The paused budget returns less than it costs (iROAS ${ratio(plan.scenarioIroas)}), so the pause is cash-positive (net ${signedRp(net)}).`;
    if (within) {
      el.hiatusFeedback.innerHTML = `<strong>A ${weeks}-week ${plan.name} pause keeps the KPI decline within ${state.tolerance}% (${pct(decline)}).</strong> ${economics}`;
    } else {
      el.hiatusFeedback.innerHTML = `<strong>A ${weeks}-week ${plan.name} pause exceeds the ${state.tolerance}% limit (${pct(decline)}).</strong> Shorten it to ${safeWeeks} week${safeWeeks === 1 ? "" : "s"} or keep a maintenance budget. ${economics}`;
    }

    const W = 640;
    const H = 210;
    const m = { l: 40, r: 16, t: 28, b: 30 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const items = Array.from({ length: 8 }, (_, i) => ({ week: i + 1, decline: declineAt(i + 1) }));
    const maxValue = niceCeil(Math.max(state.tolerance, ...items.map((item) => item.decline)) * 1.18);
    const x = (week) => m.l + ((week - 0.5) / items.length) * pw;
    const y = (value) => m.t + ph - (value / maxValue) * ph;
    const bw = (pw / items.length) * 0.56;
    const ty = y(state.tolerance);
    const bars = items.map((item) => {
      const over = item.decline > state.tolerance;
      const selected = item.week === weeks;
      const top = y(item.decline);
      return `<g data-tooltip-text="${escapeHtml(`${item.week}-week pause\nKPI decline ${pct(item.decline)} (limit ${state.tolerance}%)\nSaved ${rp(plan.scenario / DPM * item.week * 7)} · lost ${rp(daily * item.week * 7 * lostEffect(halfLife, item.week * 7))}`)}"><rect x="${x(item.week) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, m.t + ph - top)}" rx="4" class="hb ${over ? "over" : "ok"}${selected ? " selected" : ""}"/><text x="${x(item.week)}" y="${top - 6}" text-anchor="middle" class="hb-label${over ? " over" : ""}">${pct(item.decline)}</text><text x="${x(item.week)}" y="${H - 10}" text-anchor="middle" class="hb-axis${selected ? " selected" : ""}">${item.week}w</text></g>`;
    }).join("");
    el.hiatusTrajectory.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected KPI decline by pause length">
      <line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" class="hb-base"/>
      <line x1="${m.l}" x2="${W - m.r}" y1="${ty}" y2="${ty}" class="hb-threshold"/>
      ${bars}
      <text x="${m.l}" y="${m.t - 12}" class="hb-threshold-label">Allowed decline ${state.tolerance}% (dashed line)</text>
    </svg>`;
  }

  function renderCarryover(plan, days) {
    const W = 560;
    const H = 250;
    const m = { l: 44, r: 16, t: 22, b: 34 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const maxDays = 56;
    const x = (day) => m.l + (day / maxDays) * pw;
    const y = (value) => m.t + ph - (value / 100) * ph;
    const points = Array.from({ length: maxDays + 1 }, (_, day) => [x(day), y(Math.pow(0.5, day / plan.halfLife) * 100)]);
    const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${x(maxDays)},${m.t + ph} L${x(0)},${m.t + ph} Z`;
    const remaining = Math.pow(0.5, days / plan.halfLife) * 100;
    const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}" class="dr-grid"/><text x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end" class="dr-axis">${v}%</text>`).join("");
    const ticks = [0, 14, 28, 42, 56].map((d) => `<text x="${x(d)}" y="${H - 12}" text-anchor="middle" class="dr-axis">${d / 7}w</text>`).join("");
    const hx = x(plan.halfLife);
    const px = x(days);
    el.carryover.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${plan.name} carryover decay">
      ${grid}${ticks}
      <rect x="${x(0)}" y="${m.t}" width="${px - x(0)}" height="${ph}" class="co-pause"/>
      <path d="${area}" fill="${plan.color}" opacity=".12"/>
      <path d="${line}" fill="none" stroke="${plan.color}" stroke-width="3"/>
      <line x1="${hx}" x2="${hx}" y1="${m.t}" y2="${m.t + ph}" class="co-half"/>
      <circle cx="${hx}" cy="${y(50)}" r="4.5" class="co-half-dot" data-tooltip-text="${escapeHtml(`Half-life ${plan.halfLife.toFixed(1)} days: 50% of the media effect remains`)}"/>
      <text x="${hx + 6}" y="${y(50) - 8}" class="co-label half">Half-life ${plan.halfLife.toFixed(1)}d · 50%</text>
      <circle cx="${px}" cy="${y(remaining)}" r="5.5" class="co-pause-dot" data-tooltip-text="${escapeHtml(`Day ${days}: ${pct(remaining)} of the effect remains`)}"/>
      <text x="${Math.min(px + 8, W - 150)}" y="${Math.max(m.t + 34, y(remaining) - 10)}" class="co-label pause">Restart day ${days} · ${pct(remaining, 0)} left</text>
      <text x="${x(0) + 6}" y="${m.t + 12}" class="co-label muted">Pause window</text>
    </svg>`;
  }

  // ---------- section 04: saved scenarios ----------
  function scopeKey() { return [dataset.meta.modelVersion, state.dateStart, state.dateEnd].join("|"); }

  function persist() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope: scopeKey(), saved: state.saved })); } catch (_error) { /* optional */ }
  }
  function restore() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (stored && stored.scope === scopeKey() && Array.isArray(stored.saved)) state.saved = stored.saved.slice(0, MAX_SAVED);
    } catch (_error) { state.saved = []; }
  }
  function clearSaved() {
    state.saved = [];
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (_error) { /* optional */ }
  }

  function snapshot() {
    const s = scenario;
    const label = s.mode === "budget" ? `Budget ${rp(s.budget)}/mo` : `Target KPI ${rp(Number(state.primaryValue) * 1e9)}/mo`;
    const poolTag = s.pool.excluded.length ? ` · ${s.pool.names.length} ch` : "";
    const base = `${label}${poolTag}`;
    const sameName = state.saved.filter((item) => item.name === base || item.name.startsWith(`${base} ·`)).length;
    return {
      name: sameName ? `${base} · ${sameName + 1}` : base,
      mode: MODE_LABELS[s.mode],
      months: state.horizonMonths,
      poolLabel: s.pool.label,
      poolNames: s.pool.names,
      poolBudget: s.poolBudget,
      poolMedia: s.poolMedia,
      budget: s.budget,
      media: s.media,
      iroas: s.iroas,
      mroi: s.mroi,
      channels: s.plans.map((plan) => ({
        name: plan.name,
        color: plan.color,
        inPool: plan.inPool,
        locked: state.locked.has(plan.name) && plan.inPool,
        refBudget: plan.monthly,
        budget: plan.scenario,
        refIncr: plan.incr,
        incr: plan.scenarioIncr,
        mroi: plan.scenarioMroi,
      })),
      settings: {
        mode: state.mode,
        primaryValue: state.primaryValue,
        preset: state.preset,
        selected: [...state.selected],
        locked: [...state.locked],
        maxDecrease: state.maxDecrease,
        maxIncrease: state.maxIncrease,
        horizonStart: state.horizonStart,
        horizonMonths: state.horizonMonths,
      },
      fingerprint: `${s.mode}|${s.plans.map((plan) => `${plan.name}:${plan.inPool ? 1 : 0}:${Math.round(plan.scenario / 1e6)}`).join("|")}`,
    };
  }

  function referenceRecord() {
    return {
      name: "Current reference",
      mode: "—",
      isReference: true,
      months: state.horizonMonths,
      poolLabel: `all ${reference.channels.length} channels`,
      poolNames: reference.channels.map((c) => c.name),
      poolBudget: reference.totalMonthly,
      poolMedia: reference.media,
      budget: reference.totalMonthly,
      media: reference.media,
      iroas: reference.iroas,
      mroi: safeDivide(sum(reference.channels, (c) => c.mroi * c.monthly), reference.totalMonthly),
      channels: reference.channels.map((c) => ({ name: c.name, color: c.color, inPool: true, locked: false, refBudget: c.monthly, budget: c.monthly, refIncr: c.incr, incr: c.incr, mroi: c.mroi })),
    };
  }

  function renderSaved() {
    const ref = referenceRecord();
    const records = [ref, ...state.saved];
    const saved = state.saved;
    const best = saved.slice().sort((a, b) => b.media - a.media)[0];
    const efficient = saved.slice().sort((a, b) => b.iroas - a.iroas)[0];
    let copy;
    if (!saved.length) copy = "No plan saved yet. Adjust the planner and click <em>Save scenario</em> (up to three). Each saved plan keeps its own reference budget — the current budget of the channels selected in that plan.";
    else if (saved.length === 1) copy = `<strong>${escapeHtml(saved[0].name)}</strong>: reference ${rp(saved[0].poolBudget)}/month for ${escapeHtml(saved[0].poolLabel)} → scenario ${rp(saved[0].budget)}/month; incremental revenue ${signedRp(saved[0].media - saved[0].poolMedia)}/month versus that reference.`;
    else if (best.name === efficient.name) copy = `<strong>${escapeHtml(best.name)}</strong> gives both the highest incremental revenue (${rp(best.media)}/month) and the highest iROAS (${ratio(best.iroas)}).`;
    else copy = `<strong>${escapeHtml(best.name)}</strong> maximizes incremental revenue (${rp(best.media)}/month), while <strong>${escapeHtml(efficient.name)}</strong> is the most efficient (${ratio(efficient.iroas)}). Choose by whether growth or efficiency is the binding goal.`;

    const summaryRows = records.map((record, index) => {
      const budgetDelta = record.budget - record.poolBudget;
      const mediaDelta = record.media - record.poolMedia;
      return `<tr class="${record.isReference ? "reference" : ""}">
      <td><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.mode)}${record.isReference ? "" : ` · ${record.months} mo`}</small></td>
      <td>${escapeHtml(record.poolLabel)}</td>
      <td class="numeric">${rp(record.poolBudget)} → <strong>${rp(record.budget)}</strong><small>${record.isReference ? "reference" : `${signedRp(budgetDelta)} (${signedPct(safeDivide(budgetDelta, record.poolBudget) * 100)})`}</small></td>
      <td class="numeric">${rp(record.poolMedia)} → <strong>${rp(record.media)}</strong><small class="${record.isReference ? "" : mediaDelta >= 0 ? "up" : "down"}">${record.isReference ? "reference" : `${signedRp(mediaDelta)} (${signedPct(safeDivide(mediaDelta, record.poolMedia) * 100)})`}</small></td>
      <td class="numeric">${ratio(safeDivide(record.poolMedia, record.poolBudget))} → <strong>${ratio(record.iroas)}</strong></td>
      <td>${record.isReference ? "" : `<div class="mmm-row-actions"><button type="button" data-load-scenario="${index - 1}">Load</button><button type="button" data-remove-scenario="${index - 1}">Remove</button></div>`}</td>
    </tr>`;
    }).join("");

    const breakdown = records.map((record) => {
      const rows = record.channels.map((channel) => {
        const delta = channel.budget - channel.refBudget;
        return `<tr class="${channel.inPool ? "" : "excluded"}">
          <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span>${channel.locked ? '<small class="mmm-guard">Locked</small>' : ""}</td>
          <td>${channel.inPool ? "Included" : "Not in pool"}</td>
          <td class="numeric">${channel.inPool ? rp(channel.refBudget) : `<span class="struck">${rp(channel.refBudget)}</span>`}</td>
          <td class="numeric">${rp(channel.budget)}</td>
          <td class="numeric ${channel.inPool && delta > 1 ? "up" : channel.inPool && delta < -1 ? "down" : ""}">${channel.inPool && !record.isReference ? `${signedPct(safeDivide(delta, channel.refBudget) * 100)}<small>${signedRp(delta)}</small>` : "—"}</td>
          <td class="numeric">${channel.inPool ? `${rp(channel.refIncr)} → ${rp(channel.incr)}` : "—"}</td>
          <td class="numeric">${channel.budget > 0 ? ratio(channel.mroi) : "—"}</td>
        </tr>`;
      }).join("");
      const excluded = record.channels.filter((channel) => !channel.inPool);
      return `<tbody class="mmm-breakdown-group">
        <tr class="group"><td colspan="7"><strong>${escapeHtml(record.name)}</strong> · reference ${rp(record.poolBudget)}/month for ${escapeHtml(record.poolLabel)}${excluded.length ? ` · not in pool: ${excluded.map((c) => `${c.name} (${rp(c.refBudget)})`).join(", ")}` : ""}</td></tr>
        ${rows}
        <tr class="total"><td><strong>Selected channels</strong></td><td>${record.poolNames.length} of ${record.channels.length}</td><td class="numeric"><strong>${rp(record.poolBudget)}</strong></td><td class="numeric"><strong>${rp(record.budget)}</strong></td><td class="numeric">${record.isReference ? "—" : signedPct(safeDivide(record.budget - record.poolBudget, record.poolBudget) * 100)}</td><td class="numeric">${rp(record.poolMedia)} → ${rp(record.media)}</td><td class="numeric">${ratio(record.mroi)}</td></tr>
      </tbody>`;
    }).join("");

    el.saved.innerHTML = `<p class="mmm-saved-copy">${copy}</p>
      <div class="mmm-table-wrap"><table><thead><tr><th>Scenario</th><th>Channels in pool</th><th class="numeric">Budget / month<br>reference → scenario</th><th class="numeric">Incremental revenue / month<br>reference → scenario</th><th class="numeric">iROAS<br>reference → scenario</th><th></th></tr></thead><tbody>${summaryRows}</tbody></table></div>
      <div class="mmm-breakdown-heading"><span class="mmm-kicker">Channel breakdown</span><p>Reference = current monthly budget of each channel in the analysis period. A plan's reference total only counts the channels selected in that plan.</p></div>
      <div class="mmm-table-wrap mmm-breakdown"><table><thead><tr><th>Channel</th><th>Pool</th><th class="numeric">Reference / month</th><th class="numeric">Scenario / month</th><th class="numeric">Change</th><th class="numeric">Incr. revenue ref → scenario</th><th class="numeric">mROI</th></tr></thead>${breakdown}</table></div>`;
  }

  // ---------- orchestration ----------
  function refreshAll({ resetPrimary = false } = {}) {
    reference = buildReference();
    if (resetPrimary) state.primaryValue = null;
    const totalSpend = sum(reference.rows, (row) => sum(Object.values(row.spend), (v) => v));
    el.scopeCopy.innerHTML = `<span class="mmm-scope-pill"><i></i>Model estimate · Channel × Day</span><span>${reference.days} days selected · total spend ${rp(totalSpend)} → <strong>current budget ${rp(reference.totalMonthly)}/month</strong> · incremental revenue ${rp(reference.media)}/month (${ratio(reference.iroas)})</span>`;
    renderPlannerControls();
    solve();
    renderSaved();
  }

  function bindEvents() {
    el.dateStart.min = el.dateEnd.min = dataset.meta.defaultStart;
    el.dateStart.max = el.dateEnd.max = dataset.meta.defaultEnd;
    el.dateStart.value = state.dateStart;
    el.dateEnd.value = state.dateEnd;
    const onDate = () => {
      state.dateStart = el.dateStart.value || dataset.meta.defaultStart;
      state.dateEnd = el.dateEnd.value || dataset.meta.defaultEnd;
      if (state.dateStart > state.dateEnd) [state.dateStart, state.dateEnd] = [state.dateEnd, state.dateStart];
      el.dateStart.value = state.dateStart;
      el.dateEnd.value = state.dateEnd;
      clearSaved();
      refreshAll({ resetPrimary: true });
    };
    el.dateStart.addEventListener("change", onDate);
    el.dateEnd.addEventListener("change", onDate);

    el.reset.addEventListener("click", () => {
      Object.assign(state, {
        dateStart: dataset.meta.defaultStart,
        dateEnd: dataset.meta.defaultEnd,
        mode: "budget",
        preset: 1,
        horizonStart: nextDay(dataset.meta.defaultEnd),
        horizonMonths: 3,
        selected: new Set(dataset.channels.map((c) => c.name)),
        locked: new Set(),
        maxDecrease: 30,
        maxIncrease: 60,
        hiatusChannel: "Meta",
        hiatusWeeks: 2,
        tolerance: 3,
      });
      el.dateStart.value = state.dateStart;
      el.dateEnd.value = state.dateEnd;
      clearSaved();
      refreshAll({ resetPrimary: true });
    });

    root.querySelectorAll("[data-planner-mode]").forEach((button) => button.addEventListener("click", () => {
      state.mode = button.dataset.plannerMode;
      state.primaryValue = null;
      state.preset = 1;
      renderPlannerControls();
      solve({ pulse: true });
    }));
    el.primary.addEventListener("input", () => {
      state.primaryValue = Number(el.primary.value) || 0;
      if (state.mode === "budget") state.preset = null;
      root.querySelectorAll("[data-budget-multiplier]").forEach((button) => button.classList.remove("active"));
      queueSolve();
    });
    root.querySelectorAll("[data-budget-multiplier]").forEach((button) => button.addEventListener("click", () => {
      state.preset = Number(button.dataset.budgetMultiplier);
      state.primaryValue = poolReference().budget / 1e9 * state.preset;
      renderPlannerControls();
      solve({ pulse: true });
    }));
    el.horizonStart.addEventListener("change", () => {
      if (!el.horizonStart.value) return;
      state.horizonStart = el.horizonStart.value;
      renderPlannerControls();
      solve();
    });
    el.horizonMonths.addEventListener("change", () => {
      state.horizonMonths = clamp(Math.round(Number(el.horizonMonths.value) || 1), 1, 12);
      renderPlannerControls();
      solve();
    });
    el.channels.addEventListener("change", (event) => {
      const include = event.target.closest("[data-include-channel]");
      const lock = event.target.closest("[data-lock-channel]");
      if (include) {
        const name = include.dataset.includeChannel;
        if (!include.checked && state.selected.size === 1) { include.checked = true; return; }
        if (include.checked) state.selected.add(name); else { state.selected.delete(name); state.locked.delete(name); }
      }
      if (lock) {
        const name = lock.dataset.lockChannel;
        if (lock.checked) state.locked.add(name); else state.locked.delete(name);
      }
      // Preset budgets and the default revenue target follow the reference of the selected channels.
      if (include && (state.mode === "target" || state.preset !== null)) state.primaryValue = null;
      renderPlannerControls();
      solve({ pulse: true });
    });
    el.maxDecrease.addEventListener("input", () => { state.maxDecrease = Number(el.maxDecrease.value); renderPlannerControls(); queueSolve(); });
    el.maxIncrease.addEventListener("input", () => { state.maxIncrease = Number(el.maxIncrease.value); renderPlannerControls(); queueSolve(); });

    el.save.addEventListener("click", () => {
      const record = snapshot();
      const duplicate = state.saved.findIndex((item) => item.fingerprint === record.fingerprint);
      if (duplicate >= 0) { record.name = state.saved[duplicate].name; state.saved.splice(duplicate, 1, record); }
      else { if (state.saved.length >= MAX_SAVED) state.saved.shift(); state.saved.push(record); }
      persist();
      renderSaved();
      const original = el.save.textContent;
      el.save.textContent = duplicate >= 0 ? "Scenario updated" : "Scenario saved";
      window.setTimeout(() => { el.save.textContent = original; }, 1200);
    });
    el.saved.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-scenario]");
      const load = event.target.closest("[data-load-scenario]");
      if (remove) { state.saved.splice(Number(remove.dataset.removeScenario), 1); persist(); renderSaved(); }
      if (load) {
        const record = state.saved[Number(load.dataset.loadScenario)];
        if (!record) return;
        const settings = record.settings || {};
        Object.assign(state, {
          mode: settings.mode || "budget",
          primaryValue: settings.primaryValue ?? null,
          preset: settings.preset ?? null,
          selected: new Set(settings.selected || reference.channels.map((c) => c.name)),
          locked: new Set(settings.locked || []),
          maxDecrease: settings.maxDecrease ?? state.maxDecrease,
          maxIncrease: settings.maxIncrease ?? state.maxIncrease,
          horizonStart: settings.horizonStart || state.horizonStart,
          horizonMonths: settings.horizonMonths || state.horizonMonths,
        });
        renderPlannerControls();
        solve({ pulse: true });
        root.querySelector("[data-planner-section]").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    el.hiatusPanel.addEventListener("click", (event) => {
      const channel = event.target.closest("[data-hiatus-channel]");
      const preset = event.target.closest("[data-hiatus-preset]");
      if (channel) state.hiatusChannel = channel.dataset.hiatusChannel;
      if (preset) state.hiatusWeeks = Number(preset.dataset.hiatusPreset);
      if (channel || preset) renderHiatus();
    });
    el.tolerance.addEventListener("input", () => { state.tolerance = Number(el.tolerance.value); renderHiatus(); });
  }

  async function initialize() {
    try {
      const responseData = await fetch("/static/data/mmm.json");
      if (!responseData.ok) throw new Error(`MMM dataset returned ${responseData.status}`);
      dataset = await responseData.json();
      DPM = dataset.meta.daysPerMonth || DPM;
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      state.horizonStart = nextDay(dataset.meta.defaultEnd);
      state.selected = new Set(dataset.channels.map((channel) => channel.name));
      buildCurves();
      bindStaticTooltips();
      bindEvents();
      refreshAll({ resetPrimary: true });
      restore();
      renderSaved();
      el.status.hidden = true;
    } catch (error) {
      el.status.classList.add("error");
      el.status.innerHTML = `<span class="mmm-status-pulse" aria-hidden="true"></span>Unable to load the MMM demo: ${escapeHtml(error.message)}`;
      console.error(error);
    }
  }

  initialize();
})();
