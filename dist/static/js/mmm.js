(() => {
  const root = document.querySelector("[data-mmm-dashboard]");
  if (!root) return;

  const STORAGE_KEY = "xl-mmm-saved-scenarios-v4"; // v4: Target KPI = incremental revenue from media
  const MAX_SAVED = 3;
  const MODE_LABELS = { budget: "Available budget", target: "Target KPI" };
  const MODE_COPY = {
    budget: "",
    target: "Set a monthly target for incremental revenue from media (revenue caused by the ads, without baseline). The planner finds the smallest budget across the selected channels that reaches it.",
  };
  // Planning range: Rp0-10B per month, inside the spend levels the Meridian training data cover.
  const planningCap = () => dataset.meta.planningCapMonthly || 10e9;
  const SIGNAL_CLASS ={ "Invest more": "invest", Hold: "hold", Reduce: "reduce", "Test & learn": "test" };

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
    maxIncrease: 30,
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
    resultTitle: q("[data-planner-result-title]"),
    horizonCopy: q("[data-planner-horizon-copy]"),
    kpis: q("[data-planner-kpis]"),
    allocation: q("[data-planner-allocation]"),
    calc: q("[data-planner-calc]"),
    save: q("[data-save-scenario]"),
    hiatusPanel: q("[data-hiatus-panel]"),
    hiatusChannels: q("[data-hiatus-channels]"),
    tolerance: q("[data-hiatus-tolerance]"),
    toleranceOutput: q("[data-hiatus-tolerance-output]"),
    carryover: q("[data-mmm-carryover-curve]"),
    carryoverCaption: q("[data-carryover-caption]"),
    hiatusResults: q("[data-hiatus-results]"),
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
  const rp = (value, digits = 2) => `${value < 0 ? "-" : ""}Rp${compact(Math.abs(value), digits)}`;
  const signedRp = (value, digits = 2) => (Math.abs(value) < 1 ? "Rp0" : `${value > 0 ? "+" : "-"}Rp${compact(Math.abs(value), digits)}`);
  const pct = (value, digits = 1) => `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
  const signedPct = (value, digits = 1) => {
    const number = Number.isFinite(value) ? value : 0;
    if (Math.abs(number) < 0.05) return "0.0%";
    return `${number > 0 ? "+" : "-"}${Math.abs(number).toFixed(digits)}%`;
  };
  const ratio = (value) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}x`;
  const signedRatio = (value) => (Math.abs(value) < 0.005 ? "0.00x" : `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}x`);
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
        observedMax: channel.observedMaxMonthlySpend || null,
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
        observedMax: curves[channel.name].observedMax,
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
  // Meridian-style guardrails: each channel's limits follow its historical share of the new budget.
  // share = new budget (minus locked channels) × channel reference ÷ reference of the unlocked channels;
  // floor = (1 - max decrease) × share, ceiling = (1 + max increase) × share.
  function lockedTotal() {
    return sum(reference.channels.filter((c) => state.selected.has(c.name) && state.locked.has(c.name)), (c) => c.monthly);
  }

  function guardrailBounds(budget) {
    const bounds = {};
    const locked = lockedTotal();
    const flexibleRef = sum(reference.channels.filter((c) => state.selected.has(c.name) && !state.locked.has(c.name)), (c) => c.monthly);
    const flexibleBudget = Math.max(0, budget - locked);
    reference.channels.forEach((channel) => {
      const selected = state.selected.has(channel.name);
      const isLocked = selected && state.locked.has(channel.name);
      if (!selected) bounds[channel.name] = { floor: 0, ceil: 0, share: 0, selected, locked: false };
      else if (isLocked) bounds[channel.name] = { floor: channel.monthly, ceil: channel.monthly, share: channel.monthly, selected, locked: true };
      else {
        const share = flexibleRef ? flexibleBudget * channel.monthly / flexibleRef : 0;
        bounds[channel.name] = { floor: share * (1 - state.maxDecrease / 100), ceil: share * (1 + state.maxIncrease / 100), share, selected, locked: false };
      }
    });
    return bounds;
  }

  function planAt(budget, grid = 1000) {
    const bounds = guardrailBounds(budget);
    return { allocation: optimize(budget, bounds, grid), bounds };
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
    const pool = poolReference();
    const locked = lockedTotal();
    const notes = [];
    let plan;
    let status = "optimized";

    if (state.mode === "budget") {
      const requested = Math.max(0, (Number(state.primaryValue) || 0) * 1e9);
      const budget = Math.min(requested, planningCap());
      if (requested > budget + 1) notes.push(`The planner covers Rp0-${rp(planningCap())}/month, the spend levels the Meridian training data cover. Showing the plan at ${rp(budget)}/month.`);
      if (budget < locked - Math.max(pool.budget * 0.001, 1)) {
        const bounds = guardrailBounds(budget);
        plan = { allocation: proportional(budget, bounds).allocation, bounds };
        status = "below";
        notes.push(`The budget is below the locked channels (${rp(locked)}/month); only the locked channels are funded.`);
      } else {
        plan = planAt(budget);
      }
    } else {
      // Target = incremental revenue from media per month (baseline excluded).
      const needed = Math.max(0, (Number(state.primaryValue) || 0) * 1e9);
      const cap = planningCap();
      if (needed <= 0) {
        plan = planAt(locked);
        status = "no-target";
        notes.push("Enter a target above Rp0 for incremental revenue from media.");
      } else if (locked > 0 && needed <= mediaOf(planAt(locked, 300).allocation)) {
        plan = planAt(locked);
        notes.push(`The target is already reached with the locked channels only (${rp(locked)}/month).`);
      } else if (mediaOf(planAt(cap, 300).allocation) < needed) {
        plan = planAt(cap);
        status = "unreachable";
        notes.push(`The target of ${rp(needed)}/month incremental revenue from ${pool.label} is more than the curves deliver within the Rp0-${rp(cap)}/month planning range (at most ${rp(mediaOf(plan.allocation))}/month). Showing the plan at ${rp(cap)}/month.`);
      } else {
        let low = locked;
        let high = cap;
        for (let i = 0; i < 32; i += 1) {
          const mid = (low + high) / 2;
          if (mediaOf(planAt(mid, 200).allocation) >= needed) high = mid; else low = mid;
        }
        plan = planAt(high);
      }
    }
    return evaluate(plan.allocation, plan.bounds, status, notes, pool);
  }

  // Where the optimizer put the channel inside its allowed range, and why (mROI = return on the next Rp1).
  function position(channel, spend, bound) {
    if (spend <= 0) return { label: "Not funded", className: "muted" };
    const mroi = marginal(channel.name, spend);
    if (mroi < 1) {
      const c = curves[channel.name];
      const inflection = c.k * Math.pow(Math.max(c.alpha - 1, 0) / (c.alpha + 1), 1 / c.alpha);
      if (spend < inflection) return { label: "Too small to pay back", className: "warn", note: `At this budget the channel is below its effective level: the next Rp1 returns ${ratio(mroi)}. It needs more budget to work, or none.` };
      return { label: "Past break-even", className: "danger", note: "The next Rp1 returns less than Rp1." };
    }
    if (!bound || !bound.selected) return { label: "Not in pool", className: "muted" };
    if (bound.locked) return { label: "Locked", className: "muted", note: "Kept at the reference budget." };
    const tolerance = Math.max(bound.share * 0.006, channel.monthly * 0.006, (bound.ceil - bound.floor) * 0.04, 1); // optimizer grid steps
    if (spend >= bound.ceil - tolerance && bound.ceil > bound.share + tolerance) return { label: "Room to grow", className: "good", note: `High return on the next Rp1 (mROI ${ratio(mroi)}), above the channels that were cut: raised to the +${state.maxIncrease}% limit.` };
    if (spend <= bound.floor + tolerance && bound.floor < bound.share - tolerance) return { label: "Lower return", className: "warn", note: `Lower return on the next Rp1 (mROI ${ratio(mroi)}): cut to the -${state.maxDecrease}% limit; the money earns more in other channels.` };
    return { label: "Balanced", className: "info", note: `Inside its allowed range; the next Rp1 returns about the same as in the other channels (mROI ${ratio(mroi)}).` };
  }

  function guardLabel(channel, spend, bound) {
    if (!bound.selected) return "Not in pool";
    if (bound.locked) return "Locked";
    const tolerance = Math.max(bound.share * 0.006, channel.monthly * 0.006, (bound.ceil - bound.floor) * 0.04, 1); // optimizer grid steps
    if (spend > bound.ceil + tolerance || spend < bound.floor - tolerance) return "Outside guardrail";
    if (Math.abs(spend - bound.ceil) <= tolerance && bound.ceil > bound.share + tolerance) return `At +${state.maxIncrease}% cap`;
    if (Math.abs(spend - bound.floor) <= tolerance && bound.floor < bound.share - tolerance) return `At -${state.maxDecrease}% floor`;
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
        position: position(channel, spend, bounds[channel.name]),
        guard: guardLabel(channel, spend, bounds[channel.name]),
      };
    });
    const budget = sum(plans, (plan) => plan.scenario);
    const media = sum(plans, (plan) => plan.scenarioIncr);
    return {
      mode: state.mode,
      status,
      notes,
      plans,
      pool,
      bounds,
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
    // Show the curve up to break-even (and the loss zone after it), never far past the data.
    const bound = scenario?.bounds?.[channel.name];
    const reach = channel.breakEven ? channel.breakEven * 1.12 : channel.band.peakSpend * 2;
    const xAxis = niceTicks(Math.max(channel.monthly * 1.9, reach, (scenarioSpend || 0) * 1.15, bound && bound.selected ? bound.ceil * 1.1 : 0), 4);
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
    // Allowed range: Meridian's default spend constraint (±30% of the channel's share of the scenario budget).
    let box = "";
    let bx1 = m.l;
    let bx2 = m.l;
    if (bound && bound.selected && !bound.locked && bound.ceil > 0) {
      bx1 = x(bound.floor);
      bx2 = x(Math.min(bound.ceil, xMax));
      box = `<rect x="${bx1}" y="${m.t}" width="${Math.max(0, bx2 - bx1)}" height="${ph}" class="dr-box"/><text x="${(bx1 + bx2) / 2}" y="${m.t + 12}" text-anchor="middle" class="dr-box-label">Allowed range</text>`;
    }
    let peakMark = "";
    if (channel.band.peakSpend > 0 && channel.band.peakSpend < xMax) {
      const px = x(channel.band.peakSpend);
      const py = yr(channel.band.peakIroas);
      peakMark = `<circle cx="${px}" cy="${py}" r="3.5" class="dr-peak" style="stroke:${channel.color}" data-tooltip-text="${escapeHtml(`Peak iROAS ${ratio(channel.band.peakIroas)} at ${rp(channel.band.peakSpend)}/month\nAverage return for this channel alone; the planner allocates by the next Rp1 (mROI) across channels.`)}"/><text x="${px}" y="${py - 8}" text-anchor="middle" class="dr-peak-label">Peak iROAS ${ratio(channel.band.peakIroas)}</text>`;
    }
    let lossZone = "";
    let breakEvenMark = "";
    if (channel.breakEven && channel.breakEven < xMax) {
      const bx = x(channel.breakEven);
      lossZone = `<rect x="${bx}" y="${m.t}" width="${m.l + pw - bx}" height="${ph}" class="dr-loss"/>`;
      const label = `Break-even ${rp(channel.breakEven)}`;
      const right = bx + 8 + label.length * 6 > m.l + pw;
      const nearBox = bx <= bx2 + 8 && bx >= bx1 - 8;
      breakEvenMark = `<line x1="${bx}" x2="${bx}" y1="${m.t}" y2="${m.t + ph}" class="dr-be-line"/><text x="${right ? bx - 5 : bx + 5}" y="${nearBox ? m.t + 28 : m.t + 12}" text-anchor="${right ? "end" : "start"}" class="dr-be-label">${label}</text>`;
    }
    // Spend beyond the training data is not marked on the chart (client request); the planner never goes there (Rp10B cap).
    const beyondData = "";
    const cx = x(channel.monthly);
    const cy = y(channel.incr);
    const current = `<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${m.t + ph}" class="dr-current-line"/><circle cx="${cx}" cy="${cy}" r="5.5" class="dr-current-dot" data-tooltip-text="${escapeHtml(`Current budget ${rp(channel.monthly)}/month\nIncremental revenue ${rp(channel.incr)}/month\niROAS ${ratio(channel.iroas)} · next Rp1 ${ratio(channel.mroi)}`)}"/><text x="${cx < m.l + 90 ? cx + 6 : cx}" y="${m.t + ph - 6}" text-anchor="${cx < m.l + 90 ? "start" : "middle"}" class="dr-marker-label current">Current ${rp(channel.monthly)} · mROI ${ratio(channel.mroi)}</text>`;
    let scenarioMarker = "";
    if (plan && plan.inPool && Math.abs(plan.scenario - channel.monthly) > channel.monthly * 0.005) {
      const sx = x(plan.scenario);
      const sy = y(plan.scenarioIncr);
      // Keep the scenario label clear of the current label (both sit low when budgets are small vs the curve).
      const labelY = Math.min(Math.max(m.t + 24, sy - 12), m.t + ph - 24);
      scenarioMarker = `<line x1="${sx}" x2="${sx}" y1="${sy}" y2="${m.t + ph}" class="dr-scenario-line"/><circle cx="${sx}" cy="${sy}" r="6.5" class="dr-scenario-dot" data-tooltip-text="${escapeHtml(`Scenario budget ${rp(plan.scenario)}/month (${signedPct(plan.deltaPct)})\nIncremental revenue ${rp(plan.scenarioIncr)}/month (${signedRp(plan.incrDelta)})\niROAS ${ratio(plan.scenarioIroas)} · next Rp1 ${ratio(plan.scenarioMroi)}`)}"/><text x="${sx < m.l + 90 ? sx + 8 : sx}" y="${labelY}" text-anchor="${sx < m.l + 90 ? "start" : "middle"}" class="dr-marker-label scenario">Scenario ${rp(plan.scenario)} · mROI ${ratio(plan.scenarioMroi)}</text>`;
    }
    return `<article class="mmm-panel mmm-dr-card" data-dr-channel="${channel.name}">
      <header><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span></header>
      <p class="mmm-dr-card-copy">${bound && bound.selected && !bound.locked ? `Allowed range <strong>${rp(bound.floor)} - ${rp(bound.ceil)}</strong>/month at ${rp(scenario.budget)} budget · ` : bound && bound.locked ? "Locked at reference budget · " : ""}peak iROAS ${ratio(channel.band.peakIroas)} at ${rp(channel.band.peakSpend)} · ${channel.band.peakIroas < 1 ? '<em class="mmm-not-in-pool">iROAS below 1x at any budget</em>' : `break-even <strong>${channel.breakEven ? rp(channel.breakEven) : "-"}</strong>`} · mROI now <strong class="${channel.mroi < 1 ? "mmm-loss" : "mmm-gain"}">${ratio(channel.mroi)}</strong>${plan && !plan.inPool ? ' · <em class="mmm-not-in-pool">not in scenario pool</em>' : ""}</p>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${channel.name} incremental revenue and iROAS by monthly budget" data-dr-svg="${channel.name}" data-xmax="${xMax}" data-ymax="${yMax}">
        ${lossZone}${beyondData}${box}${grid}${xTicks}
        <path d="${incrPath}" class="dr-incr" style="stroke:${channel.color}"/>
        <path d="${roasPath}" class="dr-roas" style="stroke:${channel.color}"/>
        ${peakMark}${breakEvenMark}${current}${scenarioMarker}
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

  function renderDiminishing() {
    const channels = reference.channels;
    // Headline follows the planner: which channels it raises (highest return on the next Rp1) and which it cuts.
    const plans = scenario ? scenario.plans.filter((plan) => plan.inPool) : [];
    const up = plans.filter((plan) => plan.position.label === "Room to grow").map((plan) => plan.name);
    const down = plans.filter((plan) => plan.position.label === "Lower return").map((plan) => plan.name);
    const list = (names) => names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    // In Target KPI mode, say which target the scenario budget comes from.
    const lead = scenario && scenario.mode === "target"
      ? `Target ${rp(Number(state.primaryValue) * 1e9)} incremental revenue → ${rp(scenario.budget)}/month budget:`
      : `At ${rp(scenario?.budget || 0)}/month`;
    if (up.length && down.length) el.drHeadline.textContent = `${lead} the planner moves budget to ${list(up)} and away from ${list(down)}`;
    else if (up.length) el.drHeadline.textContent = `${lead} ${list(up)} ${up.length > 1 ? "get" : "gets"} the most extra budget`;
    else if (down.length) el.drHeadline.textContent = `${lead} ${list(down)} ${down.length > 1 ? "are" : "is"} cut the most`;
    else el.drHeadline.textContent = `${lead} every channel stays inside its allowed range`;

    el.drCharts.innerHTML = channels.map(diminishingChart).join("");
    bindDiminishingHover();
    el.drTable.innerHTML = channels.map((channel) => `<tr>
      <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span></td>
      <td class="numeric">${ratio(channel.observedRoas)}</td>
      <td class="numeric">${ratio(channel.iroas)}</td>
      <td class="numeric">${pct(channel.incrementalShare * 100, 0)}</td>
      <td class="numeric">${rp(channel.monthly)}</td>
      <td class="numeric">${ratio(channel.band.peakIroas)} at ${rp(channel.band.peakSpend)}</td>
      <td class="numeric">${ratio(channel.mroi)}</td>
    </tr>`).join("") + `<tr class="total"><td><strong>Portfolio</strong></td><td class="numeric">${ratio(safeDivide(sum(channels, (c) => c.observedRoas * c.monthly), reference.totalMonthly))}</td><td class="numeric">${ratio(reference.iroas)}</td><td class="numeric">${pct(safeDivide(reference.iroas, safeDivide(sum(channels, (c) => c.observedRoas * c.monthly), reference.totalMonthly)) * 100, 0)}</td><td class="numeric">${rp(reference.totalMonthly)}</td><td></td><td class="numeric">${ratio(safeDivide(sum(channels, (c) => c.mroi * c.monthly), reference.totalMonthly))}</td></tr>`;
  }

  // ---------- section 02: planner ----------
  function defaultPrimary() {
    const pool = poolReference();
    if (state.mode === "budget") return pool.budget / 1e9 * (state.preset ?? 1);
    return Math.round(pool.media * 1.1 / 1e8) / 10; // +10% incremental revenue
  }

  function renderPlannerControls() {
    const pool = poolReference();
    root.querySelectorAll("[data-planner-mode]").forEach((button) => {
      const active = button.dataset.plannerMode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    el.modeCopy.textContent = MODE_COPY[state.mode];
    el.modeCopy.hidden = !MODE_COPY[state.mode];
    if (state.primaryValue === null) state.primaryValue = defaultPrimary();
    el.presets.hidden = state.mode !== "budget";
    const poolText = `Reference for ${pool.label}: ${rp(pool.budget)}/month${pool.excluded.length ? ` (all channels ${rp(reference.totalMonthly)})` : ""}.`;
    if (state.mode === "budget") {
      el.primaryLabel.textContent = "Available media budget per month";
      el.primarySuffix.textContent = "B / month";
      el.primary.step = "0.05";
      el.primary.max = String(planningCap() / 1e9);
      el.primary.value = Number(state.primaryValue).toFixed(2);
      el.primaryHelper.textContent = `${poolText} Planning range Rp0-${rp(planningCap())}/month (covered by the model data); the budget is spent in full.`;
      root.querySelectorAll("[data-budget-multiplier]").forEach((button) => {
        button.classList.toggle("active", state.preset !== null && Number(button.dataset.budgetMultiplier) === state.preset);
      });
    } else {
      el.primaryLabel.textContent = "Target incremental revenue from media per month";
      el.primarySuffix.textContent = "B / month";
      el.primary.step = "0.1";
      el.primary.removeAttribute("max");
      el.primary.value = Number(state.primaryValue).toFixed(1);
      const maxTarget = mediaOf(planAt(planningCap(), 300).allocation);
      el.primaryHelper.textContent = `Revenue caused by the ads, without baseline. Current with ${pool.label}: ${rp(pool.media)}/month from ${rp(pool.budget)} budget. Reachable: up to ${rp(maxTarget)}/month (at Rp${planningCap() / 1e9}B budget).`;
    }

    el.horizonStart.value = state.horizonStart;
    el.horizonMonths.value = String(state.horizonMonths);
    el.horizonEnd.textContent = formatDate(addMonths(state.horizonStart, state.horizonMonths));

    el.channels.innerHTML = `<div class="mmm-channel-table-head"><span>Channel</span><span>Reference / month</span><span>Allowed range / month</span><span>Include</span><span>Lock</span></div>` + reference.channels.map((channel) => {
      const selected = state.selected.has(channel.name);
      return `<div class="mmm-channel-row${selected ? "" : " excluded"}">
        <span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span>
        <span>${rp(channel.monthly)}</span>
        <span class="mmm-allowed-range" data-allowed-range="${channel.name}">-</span>
        <label class="mmm-toggle"><input type="checkbox" data-include-channel="${channel.name}" ${selected ? "checked" : ""}><span class="sr-only">Include ${channel.name}</span></label>
        <label class="mmm-toggle lock"><input type="checkbox" data-lock-channel="${channel.name}" ${state.locked.has(channel.name) && selected ? "checked" : ""} ${selected ? "" : "disabled"}><span class="sr-only">Lock ${channel.name}</span></label>
      </div>`;
    }).join("") + `<div class="mmm-channel-row total"><span>Reference · ${pool.names.length} selected</span><span>${rp(pool.budget)}</span><span class="mmm-allowed-range" data-allowed-range="__total">-</span><span></span><span></span></div>`;
  }

  // Allowed ranges depend on the scenario budget, so they are filled in after each solve.
  function renderAllowedRanges(s) {
    reference.channels.forEach((channel) => {
      const cell = el.channels.querySelector(`[data-allowed-range="${channel.name}"]`);
      const bound = s.bounds[channel.name];
      if (cell) cell.textContent = !bound.selected ? "-" : bound.locked ? "Locked" : `${rp(bound.floor)} - ${rp(bound.ceil)}`;
    });
    const total = el.channels.querySelector('[data-allowed-range="__total"]');
    if (total) total.textContent = `at ${rp(s.budget)} budget`;
  }

  // Every number in the result cards and table, with the inputs needed to recompute it.
  function renderCalculation(s, months) {
    const inPool = s.plans.filter((plan) => plan.inPool);
    const excluded = s.plans.filter((plan) => !plan.inPool);
    const refIroas = safeDivide(s.poolMedia, s.poolBudget);
    const rows = inPool.map((plan) => `<tr>
      <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${plan.color}"></i>${plan.name}</span></td>
      <td class="numeric">${rp(plan.monthly)}</td>
      <td class="numeric">${rp(plan.incr)}</td>
      <td class="numeric">${ratio(plan.iroas)}</td>
      <td class="numeric">${rp(plan.scenario)}</td>
      <td class="numeric">${rp(plan.scenarioIncr)}</td>
      <td class="numeric">${ratio(plan.scenarioIroas)}</td>
      <td class="numeric">${signedRp(plan.incrDelta)}</td>
      <td class="numeric">${ratio(plan.scenarioMroi)}</td>
    </tr>`).join("");
    const total = `<tr class="total">
      <td><strong>Total</strong></td>
      <td class="numeric"><strong>${rp(s.poolBudget)}</strong></td>
      <td class="numeric"><strong>${rp(s.poolMedia)}</strong></td>
      <td class="numeric"><strong>${ratio(refIroas)}</strong></td>
      <td class="numeric"><strong>${rp(s.budget)}</strong></td>
      <td class="numeric"><strong>${rp(s.media)}</strong></td>
      <td class="numeric"><strong>${ratio(s.iroas)}</strong></td>
      <td class="numeric"><strong>${signedRp(s.mediaDelta)}</strong></td>
      <td class="numeric"><strong>${ratio(s.mroi)}</strong></td>
    </tr>`;
    el.calc.innerHTML = `<div class="mmm-calc-head"><span class="mmm-kicker">How the numbers are calculated</span><small>Per month. Incr. revenue = incremental revenue. Small differences are rounding.${excluded.length ? ` Not in this scenario: ${excluded.map((p) => p.name).join(", ")} (not counted).` : ""}</small></div>${s.notes.length ? `<p class="mmm-calc-note">${s.notes.map(escapeHtml).join(" ")}</p>` : ""}
      <div class="mmm-table-wrap mmm-calc-table"><table>
        <thead>
          <tr class="group"><th rowspan="2">Channel</th><th colspan="3" class="numeric">Reference (current)</th><th colspan="3" class="numeric">Scenario</th><th rowspan="2" class="numeric">Revenue Δ</th><th rowspan="2" class="numeric">mROI</th></tr>
          <tr><th class="numeric">Budget</th><th class="numeric">Incr. revenue</th><th class="numeric">iROAS</th><th class="numeric">Budget</th><th class="numeric">Incr. revenue</th><th class="numeric">iROAS</th></tr>
        </thead>
        <tbody>${rows}${total}</tbody>
      </table></div>`;
  }

  function renderPlannerOutput() {
    const s = scenario;
    const pool = s.pool;
    el.resultTitle.textContent = s.status === "below" ? "Locked channels only" : s.status === "no-target" ? "No target set" : "Recommended channel mix";
    el.horizonCopy.textContent = `${MODE_LABELS[s.mode]} · ${pool.label} · ${state.horizonMonths} month${state.horizonMonths === 1 ? "" : "s"} (${formatDate(state.horizonStart)} - ${formatDate(addMonths(state.horizonStart, state.horizonMonths))})`;
    const months = state.horizonMonths;
    const cards = [
      ["Reference budget / month", rp(s.poolBudget), `${pool.label} · ${rp(s.poolBudget * months)} over ${months} mo`, ""],
      ["Scenario budget / month", rp(s.budget), `<span class="mmm-nowrap">${signedRp(s.budgetDelta)} (${signedPct(safeDivide(s.budgetDelta, s.poolBudget) * 100)})</span> vs reference · ${rp(s.budget * months)} over ${months} mo`, "primary"],
      ["Incremental revenue / month", rp(s.media), `<span class="mmm-nowrap">${signedRp(s.mediaDelta)} (${signedPct(s.mediaDeltaPct)})</span> vs reference ${rp(s.poolMedia)} · ${rp(s.media * months)} over ${months} mo${s.mode === "target" ? ` · target ${rp(Number(state.primaryValue) * 1e9)}` : ""}`, s.mediaDelta >= 0 ? "good" : "bad"],
      ["Portfolio iROAS · mROI", `${ratio(s.iroas)} · ${ratio(s.mroi)}`, `Reference iROAS ${ratio(safeDivide(s.poolMedia, s.poolBudget))} · mROI = return on the next Rp1`, s.mroi >= 1 ? "" : "bad"],
    ];
    el.kpis.innerHTML = cards.map(([label, value, note, cls]) => `<div class="mmm-kpi ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");

    // Scenario cell: the recommended budget, with the allowed range (same numbers as the setup table) under it.
    const rangeBar = (plan) => {
      const bound = s.bounds[plan.name];
      if (!plan.inPool || !bound) return `<strong class="mmm-bar-value">-</strong>`;
      return `<strong class="mmm-bar-value">${rp(plan.scenario)}</strong><small class="mmm-range-note">${bound.locked ? "Locked" : `Allowed ${rp(bound.floor)} - ${rp(bound.ceil)}`}</small>`;
    };
    el.allocation.innerHTML = s.plans.map((plan) => `<tr class="${plan.inPool ? "" : "excluded"}">
      <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${plan.color}"></i>${plan.name}</span></td>
      <td class="numeric">${rp(plan.monthly)}</td>
      <td>${rangeBar(plan)}</td>
      <td class="numeric ${plan.inPool && plan.delta > 1 ? "up" : plan.inPool && plan.delta < -1 ? "down" : ""}">${plan.inPool ? signedPct(plan.deltaPct) : "-"}<small>${plan.inPool ? signedRp(plan.delta) : "not in pool"}</small></td>
      <td class="numeric ${plan.inPool && plan.incrDelta > 1 ? "up" : plan.inPool && plan.incrDelta < -1 ? "down" : ""}">${plan.inPool ? signedRp(plan.incrDelta) : "-"}</td>
      <td class="numeric">${plan.scenario > 0 ? ratio(plan.scenarioMroi) : "-"}</td>
      <td><span class="mmm-position ${plan.position.className}"${plan.position.note ? ` data-tooltip-text="${escapeHtml(plan.position.note)}"` : ""}>${plan.inPool ? plan.position.label : "Not in pool"}</span></td>
    </tr>`).join("") + `<tr class="total"><td><strong>Selected channels</strong><small>${escapeHtml(pool.label)}</small></td><td class="numeric"><strong>${rp(s.poolBudget)}</strong></td><td><strong class="mmm-bar-value">${rp(s.budget)}</strong></td><td class="numeric">${signedPct(safeDivide(s.budgetDelta, s.poolBudget) * 100)}<small>${signedRp(s.budgetDelta)}</small></td><td class="numeric ${s.mediaDelta >= 0 ? "up" : "down"}">${signedRp(s.mediaDelta)}</td><td class="numeric">${ratio(s.mroi)}</td><td></td></tr>`;

    renderCalculation(s, months);
    el.save.disabled = false;
  }

  function solve({ pulse = false } = {}) {
    scenario = planScenario();
    renderAllowedRanges(scenario);
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
    const share = safeDivide(plan.scenarioIncr, scenario.totalKpi);
    const declineAt = (w) => share * lostEffect(halfLife, w * 7) * 100;
    let safeWeeks = 0;
    for (let w = 0; w <= 8; w += 1) if (declineAt(w) <= state.tolerance) safeWeeks = w;
    if (state.hiatusAutoWeeks) {
      // Moving the allowed-decline slider selects the longest pause that stays within it.
      state.hiatusWeeks = Math.max(1, safeWeeks);
      state.hiatusAutoWeeks = false;
    }
    root.querySelectorAll("[data-hiatus-preset]").forEach((button) => button.classList.toggle("active", Number(button.dataset.hiatusPreset) === state.hiatusWeeks));
    const weeks = state.hiatusWeeks;
    const days = weeks * 7;
    const recovery = Math.ceil(halfLife * 2);
    el.carryoverCaption.textContent = `${plan.name} · half-life ${halfLife.toFixed(1)} days`;
    renderCarryover(plan, days, recovery);

    if (plan.scenario <= 0) {
      el.hiatusResults.innerHTML = `<p class="mmm-hiatus-empty"><strong>${plan.name} is not funded in the active scenario.</strong> There is nothing to pause - include it in the planner to evaluate a pause.</p>`;
      el.hiatusTrajectory.innerHTML = "";
      return;
    }

    const decline = declineAt(weeks);
    // Revenue accounting: the paused budget would have produced iROAS x budget of incremental revenue.
    // Part of that loss shows up during the pause (effect decays), the rest while the effect rebuilds after restart.
    const daily = plan.scenarioIncr / DPM;
    const savings = plan.scenario / DPM * days;
    const lostTotal = daily * days;
    const lostDuring = lostTotal * lostEffect(halfLife, days);
    const lostAfter = lostTotal - lostDuring;
    const within = decline <= state.tolerance;
    const remainingAtRestart = Math.pow(0.5, days / halfLife);
    const rebuilt = 1 - (1 - remainingAtRestart) * Math.pow(0.5, recovery / halfLife);

    const cards = [
      ["KPI decline during pause", pct(decline), within ? "good" : "bad", `Allowed ${state.tolerance}% · ${within ? "within limit" : "above limit"}`],
      [`Max pause allowed at ${state.tolerance}%`, safeWeeks ? `${safeWeeks} week${safeWeeks === 1 ? "" : "s"}` : "Less than 1 week", safeWeeks ? "" : "bad", safeWeeks ? "Whole weeks, directional" : "Even a 1-week pause exceeds the limit"],
      ["Media budget saved", rp(savings), "good", `${rp(plan.scenario)}/month for ${days} days`],
      ["Revenue lost during pause", rp(lostDuring), "bad", `Effect fades to ${pct(Math.pow(0.5, days / halfLife) * 100, 0)} by restart`],
      ["Revenue lost after restart", rp(lostAfter), "bad", `Day ${days}-${days + recovery}: effect rebuilds to ${pct(rebuilt * 100, 0)}`],
      ["Net (saved - total lost)", signedRp(savings - lostTotal), savings - lostTotal >= 0 ? "good" : "bad", `Total lost ${rp(lostTotal)}`],
    ];
    el.hiatusResults.innerHTML = cards.map(([label, value, cls, note]) => `<div class="mmm-hiatus-metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");

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
      return `<g data-tooltip-text="${escapeHtml(`${item.week}-week pause\nKPI decline ${pct(item.decline)} (limit ${state.tolerance}%)\nSaved ${rp(plan.scenario / DPM * item.week * 7)} · lost ${rp(daily * item.week * 7 * lostEffect(halfLife, item.week * 7))}`)}"><rect x="${x(item.week) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, m.t + ph - top)}" rx="4" class="hb ${over ? "over" : "ok"}${selected ? " selected" : ""}"/>${(() => { const inside = Math.abs(top - 6 - ty) < 10 && m.t + ph - top > 22; return `<text x="${x(item.week)}" y="${inside ? top + 15 : top - 6}" text-anchor="middle" class="hb-label${over ? " over" : ""}${inside ? " inside" : ""}">${pct(item.decline)}</text>`; })()}<text x="${x(item.week)}" y="${H - 10}" text-anchor="middle" class="hb-axis${selected ? " selected" : ""}">${item.week}w</text></g>`;
    }).join("");
    el.hiatusTrajectory.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected KPI decline by pause length">
      <line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" class="hb-base"/>
      <line x1="${m.l}" x2="${W - m.r}" y1="${ty}" y2="${ty}" class="hb-threshold"/>
      ${bars}
      <text x="${m.l}" y="${m.t - 12}" class="hb-threshold-label">Allowed decline ${state.tolerance}% (dashed line)</text>
    </svg>`;
  }

  function renderCarryover(plan, days, recovery) {
    const W = 460;
    const H = 440;
    const m = { l: 44, r: 16, t: 22, b: 34 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const maxDays = Math.max(56, Math.ceil((days + recovery * 1.5) / 14) * 14);
    const x = (day) => m.l + (day / maxDays) * pw;
    const y = (value) => m.t + ph - (value / 100) * ph;
    const remainingAt = Math.pow(0.5, days / plan.halfLife);
    // Effect while paused decays; after restart it rebuilds toward 100% at the same speed.
    const effect = (day) => (day <= days ? Math.pow(0.5, day / plan.halfLife) : 1 - (1 - remainingAt) * Math.pow(0.5, (day - days) / plan.halfLife)) * 100;
    const steps = maxDays * 2;
    const points = Array.from({ length: steps + 1 }, (_, i) => { const day = (i / steps) * maxDays; return [x(day), y(effect(day))]; });
    const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${x(maxDays)},${m.t + ph} L${x(0)},${m.t + ph} Z`;
    const remaining = remainingAt * 100;
    const recoveredDay = days + recovery;
    const recovered = effect(Math.min(recoveredDay, maxDays));
    const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}" class="dr-grid"/><text x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end" class="dr-axis">${v}%</text>`).join("");
    const tickStep = maxDays > 84 ? 28 : 14;
    const ticks = Array.from({ length: Math.floor(maxDays / tickStep) + 1 }, (_, i) => i * tickStep).map((d) => `<text x="${x(d)}" y="${H - 12}" text-anchor="middle" class="dr-axis">${d / 7}w</text>`).join("");
    const hx = x(plan.halfLife);
    const px = x(days);
    const rx = x(Math.min(recoveredDay, maxDays));
    const halfMarker = plan.halfLife < days
      ? `<line x1="${hx}" x2="${hx}" y1="${m.t}" y2="${m.t + ph}" class="co-half"/>
      <circle cx="${hx}" cy="${y(50)}" r="4.5" class="co-half-dot" data-tooltip-text="${escapeHtml(`Half-life ${plan.halfLife.toFixed(1)} days: 50% of the media effect remains`)}"/>
      <text x="${hx + 6}" y="${y(50) - 8}" class="co-label half">Half-life ${plan.halfLife.toFixed(1)}d · 50%</text>`
      : "";
    el.carryover.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${plan.name} carryover decay and recovery">
      <defs>
        <linearGradient id="coPauseGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#f9a8c0" stop-opacity=".25"/><stop offset="1" stop-color="#e11d48" stop-opacity=".35"/></linearGradient>
        <linearGradient id="coRecoveryGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#86efac" stop-opacity=".5"/><stop offset="1" stop-color="#16a34a" stop-opacity=".12"/></linearGradient>
      </defs>
      ${grid}${ticks}
      <rect x="${x(0)}" y="${m.t}" width="${px - x(0)}" height="${ph}" fill="url(#coPauseGrad)"/>
      <rect x="${px}" y="${m.t}" width="${rx - px}" height="${ph}" fill="url(#coRecoveryGrad)"/>
      <path d="${area}" fill="${plan.color}" opacity=".1"/>
      <path d="${line}" fill="none" stroke="${plan.color}" stroke-width="3"/>
      ${halfMarker}
      <line x1="${rx}" x2="${rx}" y1="${m.t}" y2="${m.t + ph}" class="co-recovered"/>
      <circle cx="${px}" cy="${y(remaining)}" r="5.5" class="co-pause-dot" data-tooltip-text="${escapeHtml(`Restart day ${days}: ${pct(remaining)} of the effect remains`)}"/>
      <text x="${Math.min(px + 8, W - 150)}" y="${Math.min(m.t + ph - 10, y(remaining) + 18)}" class="co-label pause">Restart day ${days} · ${pct(remaining, 0)} left</text>
      <circle cx="${rx}" cy="${y(recovered)}" r="5" class="co-recovered-dot" data-tooltip-text="${escapeHtml(`Day ${recoveredDay}: effect back to ${pct(recovered)}`)}"/>
      <text x="${Math.min(rx + 6, W - 120)}" y="${y(recovered) - 10}" class="co-label recovered">Day ${recoveredDay} · ${pct(recovered, 0)}</text>
      <text x="${x(0) + 6}" y="${m.t + 12}" class="co-label pausehead">Pause ${days} days</text>
      <text x="${px + 6}" y="${px - x(0) < 90 ? m.t + 28 : m.t + 12}" class="co-label recoveredhead">Recovery ≈${recovery} days</text>
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
    const label = s.mode === "budget" ? `Budget ${rp(s.budget)}/mo` : `Target incr. revenue ${rp(Number(state.primaryValue) * 1e9)}/mo`;
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

  function renderSaved() {
    const saved = state.saved;
    const best = saved.slice().sort((a, b) => b.media - a.media)[0];
    const efficient = saved.slice().sort((a, b) => b.iroas - a.iroas)[0];
    let copy;
    if (!saved.length) copy = "No plan saved yet. Adjust the planner and click <em>Save scenario</em> (up to three). Each plan is compared with the current budget of the channels selected in that plan.";
    else if (saved.length === 1) copy = `<strong>${escapeHtml(saved[0].name)}</strong>: current ${rp(saved[0].poolBudget)}/month for ${escapeHtml(saved[0].poolLabel)} → scenario ${rp(saved[0].budget)}/month; incremental revenue ${signedRp(saved[0].media - saved[0].poolMedia)}/month versus current.`;
    else if (best.name === efficient.name) copy = `<strong>${escapeHtml(best.name)}</strong> gives both the highest incremental revenue (${rp(best.media)}/month) and the highest iROAS (${ratio(best.iroas)}).`;
    else copy = `<strong>${escapeHtml(best.name)}</strong> maximizes incremental revenue (${rp(best.media)}/month), while <strong>${escapeHtml(efficient.name)}</strong> is the most efficient (${ratio(efficient.iroas)}). Choose by whether growth or efficiency is the binding goal.`;

    if (!saved.length) { el.saved.innerHTML = `<p class="mmm-saved-copy">${copy}</p>`; return; }

    const rows = saved.map((record, index) => {
      const budgetDelta = record.budget - record.poolBudget;
      const mediaDelta = record.media - record.poolMedia;
      const refIroas = safeDivide(record.poolMedia, record.poolBudget);
      return `<tr>
      <td><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.mode)} · ${record.months} mo</small></td>
      <td>${escapeHtml(record.poolLabel)}</td>
      <td class="numeric ref">${rp(record.poolBudget)}</td>
      <td class="numeric"><strong>${rp(record.budget)}</strong><small>${signedRp(budgetDelta)} (${signedPct(safeDivide(budgetDelta, record.poolBudget) * 100)})</small></td>
      <td class="numeric ref">${rp(record.poolMedia)}</td>
      <td class="numeric"><strong>${rp(record.media)}</strong><small class="${mediaDelta >= 0 ? "up" : "down"}">${signedRp(mediaDelta)} (${signedPct(safeDivide(mediaDelta, record.poolMedia) * 100)})</small></td>
      <td class="numeric ref">${ratio(refIroas)}</td>
      <td class="numeric"><strong>${ratio(record.iroas)}</strong><small class="${record.iroas >= refIroas ? "up" : "down"}">${signedRatio(record.iroas - refIroas)}</small></td>
      <td><div class="mmm-row-actions"><button type="button" data-load-scenario="${index}">Load</button><button type="button" data-remove-scenario="${index}">Remove</button></div></td>
    </tr>`;
    }).join("");

    el.saved.innerHTML = `<p class="mmm-saved-copy">${copy}</p>
      <div class="mmm-table-wrap mmm-saved-table"><table>
        <thead>
          <tr class="group"><th rowspan="2">Scenario</th><th rowspan="2">Channels</th><th colspan="2" class="numeric">Budget / month</th><th colspan="2" class="numeric">Incremental revenue / month</th><th colspan="2" class="numeric">iROAS</th><th rowspan="2"></th></tr>
          <tr><th class="numeric ref">Current</th><th class="numeric">Scenario</th><th class="numeric ref">Current</th><th class="numeric">Scenario</th><th class="numeric ref">Current</th><th class="numeric">Scenario</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="mmm-footnote">Current = current monthly budget and modeled result of the channels selected in that scenario only.</p>
      <div class="mmm-saved-detail-toggle"><button type="button" class="mmm-button ghost" data-toggle-saved-detail aria-expanded="${state.savedDetailOpen ? "true" : "false"}">${state.savedDetailOpen ? "Hide detail per channel" : "Show detail per channel"}</button></div>
      ${state.savedDetailOpen ? savedDetail(saved) : ""}`;
  }

  // Per-channel breakdown of every saved plan; channel rows add up to the plan's summary row.
  function savedDetail(saved) {
    const groups = saved.map((record) => {
      const rows = (record.channels || []).map((channel) => {
        if (!channel.inPool) {
          return `<tr class="excluded"><td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span></td><td>Not in scenario</td><td class="numeric ref">-</td><td class="numeric">-</td><td class="numeric ref">-</td><td class="numeric">-</td><td class="numeric ref">-</td><td class="numeric">-</td></tr>`;
        }
        const budgetDelta = channel.budget - channel.refBudget;
        const incrDelta = channel.incr - channel.refIncr;
        const refIroas = safeDivide(channel.refIncr, channel.refBudget);
        const iroas = safeDivide(channel.incr, channel.budget);
        return `<tr>
          <td><span class="mmm-channel-name"><i class="mmm-channel-dot" style="background:${channel.color}"></i>${channel.name}</span>${channel.locked ? '<small class="mmm-guard">Locked</small>' : ""}</td>
          <td>Included</td>
          <td class="numeric ref">${rp(channel.refBudget)}</td>
          <td class="numeric"><strong>${rp(channel.budget)}</strong><small>${signedRp(budgetDelta)} (${signedPct(safeDivide(budgetDelta, channel.refBudget) * 100)})</small></td>
          <td class="numeric ref">${rp(channel.refIncr)}</td>
          <td class="numeric"><strong>${rp(channel.incr)}</strong><small class="${incrDelta >= 0 ? "up" : "down"}">${signedRp(incrDelta)} (${signedPct(safeDivide(incrDelta, channel.refIncr) * 100)})</small></td>
          <td class="numeric ref">${ratio(refIroas)}</td>
          <td class="numeric"><strong>${ratio(iroas)}</strong><small class="${iroas >= refIroas ? "up" : "down"}">${signedRatio(iroas - refIroas)}</small></td>
        </tr>`;
      }).join("");
      const refIroas = safeDivide(record.poolMedia, record.poolBudget);
      return `<tbody>
        <tr class="group-row"><td colspan="8"><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(record.mode)} · ${record.months} mo · ${escapeHtml(record.poolLabel)}</td></tr>
        ${rows}
        <tr class="total"><td><strong>Total</strong></td><td>${(record.poolNames || []).length} channel${(record.poolNames || []).length === 1 ? "" : "s"}</td><td class="numeric ref"><strong>${rp(record.poolBudget)}</strong></td><td class="numeric"><strong>${rp(record.budget)}</strong></td><td class="numeric ref"><strong>${rp(record.poolMedia)}</strong></td><td class="numeric"><strong>${rp(record.media)}</strong></td><td class="numeric ref"><strong>${ratio(refIroas)}</strong></td><td class="numeric"><strong>${ratio(record.iroas)}</strong></td></tr>
      </tbody>`;
    }).join("");
    return `<div class="mmm-saved-detail">
      <p class="mmm-kicker">Detail per channel</p>
      <div class="mmm-table-wrap mmm-saved-table"><table>
        <thead>
          <tr class="group"><th rowspan="2">Channel</th><th rowspan="2">Status</th><th colspan="2" class="numeric">Budget / month</th><th colspan="2" class="numeric">Incremental revenue / month</th><th colspan="2" class="numeric">iROAS</th></tr>
          <tr><th class="numeric ref">Current</th><th class="numeric">Scenario</th><th class="numeric ref">Current</th><th class="numeric">Scenario</th><th class="numeric ref">Current</th><th class="numeric">Scenario</th></tr>
        </thead>
        ${groups}
      </table></div>
      <p class="mmm-footnote">Channel rows add up to each plan's total in the table above. Channels not in a scenario are not counted.</p>
    </div>`;
  }

  // ---------- orchestration ----------
  function refreshAll({ resetPrimary = false } = {}) {
    reference = buildReference();
    if (resetPrimary) state.primaryValue = null;
    const totalSpend = sum(reference.rows, (row) => sum(Object.values(row.spend), (v) => v));
    el.scopeCopy.innerHTML = `<span class="mmm-scope-pill"><i></i>${escapeHtml(dataset.meta.modelLabel || "Model estimate")}</span><span>${reference.days} days selected · total spend ${rp(totalSpend)} → <strong>current budget ${rp(reference.totalMonthly)}/month</strong> · incremental revenue ${rp(reference.media)}/month (${ratio(reference.iroas)})</span>`;
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
        maxIncrease: 30,
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
      // Preset budgets and the default incremental-revenue target follow the reference of the selected channels.
      if (include && (state.mode === "target" || state.preset !== null)) state.primaryValue = null;
      renderPlannerControls();
      solve({ pulse: true });
    });

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
      if (event.target.closest("[data-toggle-saved-detail]")) { state.savedDetailOpen = !state.savedDetailOpen; renderSaved(); return; }
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
    el.tolerance.addEventListener("input", () => { state.tolerance = Number(el.tolerance.value); state.hiatusAutoWeeks = true; renderHiatus(); });
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
