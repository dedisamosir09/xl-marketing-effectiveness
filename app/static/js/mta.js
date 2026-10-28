(() => {
  const root = document.querySelector("[data-mta-dashboard]");
  if (!root) return;

  const CHANNELS = ["Google", "Meta", "TikTok", "X"];
  const CHANNEL_COLORS = {
    Google: "#3156d3",
    Meta: "#7355dc",
    TikTok: "#ec0a68",
    X: "#16a4c2",
  };
  const MODEL_OPTIONS = [
    ["first", "First Touch"],
    ["last", "Last Touch"],
    ["linear", "Linear"],
    ["dataDriven", "Data-Driven (Demo)"],
  ];
  const FILTER_DEFS = [
    { key: "product", label: "Product", all: "All products", field: "product" },
    { key: "mediaPlan", label: "Media Plan", all: "All media plans", field: "mediaPlan" },
    { key: "objective", label: "Campaign Objective", all: "All objectives", field: "objective" },
    { key: "channel", label: "Channel", all: "All channels", field: "channel" },
    { key: "placement", label: "Placement", all: "All placements", field: "placement" },
    { key: "campaign", label: "Campaign", all: "All campaigns", field: "campaign" },
  ];
  // One journey, shown in common MyXL marketing terms. Stage columns of the flow chart.
  const JOURNEY_STAGES = ["First ad", "Last ad", "Arrive", "Browse", "Find package", "Result"];
  const STEP_LABELS = {
    "Deep Link": "Deep link",
    "App Open": "Opened MyXL",
    "App Install": "Installed MyXL",
    "App Store": "App Store",
    "Promo View": "Promo page",
    "Promo Banner": "Promo banner",
    "Package List": "Package list",
    "Package Detail": "Package detail",
    "Payment Success": "Bought package",
    "Recharge Success": "Recharged",
    "First Open": "Installed & opened",
    "Payment Failed": "Payment failed",
    "Exit": "Left without buying",
    "Install Abandoned": "Install abandoned",
  };
  const EVENT_JOURNEYS = {
    "Package Purchase": { title: "Package purchase", result: "Bought package" },
    Recharge: { title: "Recharge", result: "Recharged" },
    "App Install": { title: "App install", result: "Installed & opened" },
  };

  const state = {
    filters: {
      product: "All",
      mediaPlan: "All",
      objective: "All",
      channel: "All",
      placement: "All",
      campaign: "All",
    },
    dateStart: "2026-04-03",
    dateEnd: "2026-08-24",
    model: "linear",
    scope: "All",
    userType: "All",
    lookback: "30",
    targetEvent: "Package Purchase",
    pathNode: null,
    pathFilter: null,
    pathPage: 1,
    search: "",
    page: 1,
  };

  const elements = {
    status: root.querySelector("[data-mta-status]"),
    scorecards: root.querySelector("[data-mta-scorecards]"),
    chips: root.querySelector("[data-mta-filter-chips]"),
    journeyLegend: root.querySelector("[data-journey-legend]"),
    journeyVisual: root.querySelector("[data-journey-visual]"),
    journeyFunnel: root.querySelector("[data-journey-funnel]"),
    journeySankey: root.querySelector("[data-journey-sankey]"),
    journeyPaths: root.querySelector("[data-journey-paths]"),
    clearJourney: root.querySelector("[data-clear-journey]"),
    touchpointHealth: root.querySelector("[data-touchpoint-health]"),
    timeHealth: root.querySelector("[data-time-health]"),
    attributionSearch: root.querySelector("[data-attribution-search]"),
    attributionDescription: root.querySelector("[data-attribution-description]"),
    attributionConversionHeading: root.querySelector("[data-attribution-conversion-heading]"),
    attributionValueHeading: root.querySelector("[data-attribution-value-heading]"),
    attributionTable: root.querySelector("[data-attribution-table]"),
    attributionCount: root.querySelector("[data-attribution-count]"),
    attributionPagination: root.querySelector("[data-attribution-pagination]"),
    journeySignals: root.querySelector("[data-journey-signals]"),
  };

  let dataset = null;
  let rows = [];
  let currentRows = [];
  let topPathContext = [];
  let tooltip = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]);
  }

  function safeDivide(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
  }

  function compactNumber(value, digits = 1) {
    const number = Number.isFinite(value) ? value : 0;
    const absolute = Math.abs(number);
    if (absolute >= 1e9) return `${(number / 1e9).toFixed(digits).replace(/\.0$/, "")}B`;
    if (absolute >= 1e6) return `${(number / 1e6).toFixed(digits).replace(/\.0$/, "")}M`;
    if (absolute >= 1e3) return `${(number / 1e3).toFixed(digits).replace(/\.0$/, "")}K`;
    return Math.round(number).toLocaleString("en-US");
  }

  function formatCount(value) {
    return Math.round(value || 0).toLocaleString("en-US");
  }

  function formatCurrency(value) {
    const number = Number.isFinite(value) ? value : 0;
    if (Math.abs(number) >= 1e9) return `Rp${(number / 1e9).toFixed(2).replace(/0$/, "").replace(/\.0$/, "")}B`;
    if (Math.abs(number) >= 1e6) return `Rp${(number / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    if (Math.abs(number) >= 1e3) return `Rp${(number / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
    return `Rp${Math.round(number).toLocaleString("en-US")}`;
  }

  function formatPercent(value, digits = 1) {
    return `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
  }

  function formatDuration(hours) {
    if (!Number.isFinite(hours)) return "-";
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hrs`;
    return `${(hours / 24).toFixed(1)} days`;
  }

  function modelLabel(key) {
    const match = MODEL_OPTIONS.find(([value]) => value === key);
    return match ? match[1] : key;
  }

  function formatAttributedCount(value) {
    return (Number.isFinite(value) ? value : 0).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function eventMetricProfile() {
    if (state.targetEvent === "App Install") {
      return {
        outcomeLabel: "App Installs",
        outcomeNote: "Recorded app-install events",
        outcomeNoun: "installs",
        rateLabel: "Install Rate",
        rateNote: "Installs divided by observed journeys",
        attributedLabel: "Attributed Installs",
        attributedIcon: "conversion",
        creditKey: "conversions",
        formatCredit: formatAttributedCount,
        tableConversionHeading: "Attributed Installs",
        tableValueHeading: "Install Credit Share",
        pathLabel: "Installs",
        terminalLabel: "Install",
        detailDescription: "Attributed installs and install-credit share follow the selected MTA model and are not incremental.",
      };
    }
    if (state.targetEvent === "Recharge") {
      return {
        outcomeLabel: "Recharges",
        outcomeNote: "Recorded recharge events",
        outcomeNoun: "recharges",
        rateLabel: "Recharge Conversion Rate",
        rateNote: "Recharges divided by observed journeys",
        attributedLabel: "Attributed Recharge Revenue",
        attributedIcon: "revenue",
        creditKey: "revenue",
        formatCredit: formatCurrency,
        tableConversionHeading: "Attributed Recharges",
        tableValueHeading: "Attributed Revenue",
        pathLabel: "Recharge Value",
        terminalLabel: "Recharge",
        detailDescription: "Attributed recharges and revenue follow the selected MTA model and are not incremental.",
      };
    }
    if (state.targetEvent === "Package Purchase") {
      return {
        outcomeLabel: "Package Purchases",
        outcomeNote: "Recorded package-purchase events",
        outcomeNoun: "purchases",
        rateLabel: "Purchase Conversion Rate",
        rateNote: "Purchases divided by observed journeys",
        attributedLabel: "Attributed Purchase Revenue",
        attributedIcon: "revenue",
        creditKey: "revenue",
        formatCredit: formatCurrency,
        tableConversionHeading: "Attributed Purchases",
        tableValueHeading: "Attributed Revenue",
        pathLabel: "Revenue",
        terminalLabel: "Purchase",
        detailDescription: "Attributed purchases and revenue follow the selected MTA model and are not incremental.",
      };
    }
    return {
      outcomeLabel: "Total Outcomes",
      outcomeNote: "Recorded outcomes across conversion events",
      outcomeNoun: "outcomes",
      rateLabel: "Journey Outcome Rate",
      rateNote: "Outcomes divided by observed journeys",
      attributedLabel: "Attributed Outcomes",
      attributedIcon: "conversion",
      creditKey: "conversions",
      formatCredit: formatAttributedCount,
      tableConversionHeading: "Attributed Outcomes",
      tableValueHeading: "Outcome Credit Share",
      pathLabel: "Outcomes",
      terminalLabel: "Outcome",
      detailDescription: "Attributed outcomes and outcome-credit share follow the selected MTA model and are not incremental.",
    };
  }

  function formatJourneyValue(revenue, conversions) {
    const profile = eventMetricProfile();
    if (profile.creditKey === "revenue") {
      const suffix = state.targetEvent === "Recharge" ? "observed recharge value" : "observed purchase revenue";
      return `${formatCurrency(revenue)} ${suffix}`;
    }
    return `${formatCount(conversions)} observed ${profile.outcomeNoun}`;
  }

  const stepLabel = (name) => STEP_LABELS[name] || name;

  // Split the recorded path into: ads seen, how the user arrived, what they browsed, package viewed, result.
  function journeyParts(row) {
    const rest = (row.endToEndPath || []).slice((row.channels || []).length);
    const result = stepLabel(rest[rest.length - 1] || "");
    if (row.targetEvent === "App Install") return { arrive: "App Store", browse: null, view: null, result };
    return {
      arrive: stepLabel(rest[0] || ""),
      browse: rest.length > 2 ? stepLabel(rest[1]) : null,
      view: rest.length > 3 ? stepLabel(rest[2]) : null,
      result,
    };
  }

  // Flow-chart nodes, each fixed to its stage column.
  function stageNodes(row) {
    const channels = row.channels || [];
    const parts = journeyParts(row);
    const nodes = [[0, channels[0]], [1, channels[channels.length - 1]], [2, parts.arrive]];
    if (parts.browse) nodes.push([3, parts.browse]);
    if (parts.view) nodes.push([4, parts.view]);
    nodes.push([5, parts.result]);
    return nodes.filter(([, name]) => name);
  }

  // Full journey: every ad in order, then the in-app steps.
  function fullPath(row) {
    const parts = journeyParts(row);
    return [...(row.channels || []), parts.arrive, parts.browse, parts.view, parts.result].filter(Boolean);
  }

  function visibleChannels() {
    return state.filters.channel === "All" ? CHANNELS : [state.filters.channel];
  }

  function uniqueChannels(row) {
    return [...new Set(row.channels || [])];
  }

  function weightedMedian(source, valueAccessor, weightAccessor) {
    const items = source
      .map((item) => ({ value: valueAccessor(item), weight: weightAccessor(item) }))
      .filter((item) => Number.isFinite(item.value) && item.weight > 0)
      .sort((a, b) => a.value - b.value);
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let cumulative = 0;
    for (const item of items) {
      cumulative += item.weight;
      if (cumulative >= total / 2) return item.value;
    }
    return items.length ? items[items.length - 1].value : 0;
  }

  function rowMatchesFilter(row, definition, value) {
    if (value === "All") return true;
    return row[definition.field] === value;
  }

  function filteredRows(options = {}) {
    const skipFilter = options.skipFilter || null;
    const ignoreJourney = Boolean(options.ignoreJourney);
    return rows.filter((row) => {
      if (row.date < state.dateStart || row.date > state.dateEnd) return false;
      for (const definition of FILTER_DEFS) {
        if (definition.key === skipFilter) continue;
        if (!rowMatchesFilter(row, definition, state.filters[definition.key])) return false;
      }
      if (state.scope !== "All" && row.outcome !== state.scope) return false;
      if (state.userType !== "All" && row.userType !== state.userType) return false;
      if (state.targetEvent !== "All" && row.targetEvent !== state.targetEvent) return false;
      if (row.durationHours > Number(state.lookback) * 24) return false;
      if (!ignoreJourney) {
        if (state.pathNode && !stageNodes(row).some(([, name]) => name === state.pathNode)) return false;
        if (state.pathFilter && fullPath(row).join(" → ") !== state.pathFilter) return false;
      }
      return true;
    });
  }

  function summarize(source) {
    return source.reduce((summary, row) => {
      summary.users += row.users;
      summary.journeys += row.journeys;
      summary.touchpoints += row.touchpoints;
      summary.conversions += row.conversions;
      summary.revenue += row.revenue;
      return summary;
    }, { users: 0, journeys: 0, touchpoints: 0, conversions: 0, revenue: 0 });
  }

  function setSelectOptions(element, options, selected, allLabel = null) {
    if (!element) return;
    const values = allLabel === null ? options : [["All", allLabel], ...options.map((value) => [value, value])];
    element.innerHTML = values.map(([value, label]) => (
      `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  }

  function populateControls() {
    const dateStart = root.querySelector('[data-mta-filter="dateStart"]');
    const dateEnd = root.querySelector('[data-mta-filter="dateEnd"]');
    dateStart.value = state.dateStart;
    dateStart.min = dataset.meta.defaultStart;
    dateStart.max = dataset.meta.defaultEnd;
    dateEnd.value = state.dateEnd;
    dateEnd.min = dataset.meta.defaultStart;
    dateEnd.max = dataset.meta.defaultEnd;

    setSelectOptions(root.querySelector('[data-mta-control="model"]'), MODEL_OPTIONS, state.model);
    setSelectOptions(root.querySelector('[data-mta-control="scope"]'), [
      ["All", "All journeys"], ["Converted", "Converted"], ["Non-Converted", "Non-converted"],
    ], state.scope);
    setSelectOptions(root.querySelector('[data-mta-control="userType"]'), [
      ["All", "All user types"], ["New User", "New User"], ["Existing User", "Existing User"], ["Returning User", "Returning User"],
    ], state.userType);
    setSelectOptions(root.querySelector('[data-mta-control="lookback"]'), [
      ["7", "7 days"], ["14", "14 days"], ["30", "30 days"],
    ], state.lookback);
    const events = [...new Set(rows.map((row) => row.targetEvent))].sort();
    setSelectOptions(root.querySelector('[data-mta-control="targetEvent"]'), [
      ["All", "All conversion events"], ...events.map((value) => [value, value]),
    ], state.targetEvent);
    refreshFilterOptions();
  }

  function refreshFilterOptions() {
    FILTER_DEFS.forEach((definition) => {
      const eligible = filteredRows({ skipFilter: definition.key, ignoreJourney: true });
      const values = [...new Set(eligible.map((row) => row[definition.field]))];
      values.sort((a, b) => String(a).localeCompare(String(b)));
      if (state.filters[definition.key] !== "All" && !values.includes(state.filters[definition.key])) {
        state.filters[definition.key] = "All";
      }
      setSelectOptions(
        root.querySelector(`[data-mta-filter="${definition.key}"]`),
        values,
        state.filters[definition.key],
        definition.all,
      );
    });
  }

  function clearJourneySelection() {
    state.pathNode = null;
    state.pathFilter = null;
  }

  function resetState() {
    FILTER_DEFS.forEach((definition) => { state.filters[definition.key] = "All"; });
    state.dateStart = dataset.meta.defaultStart;
    state.dateEnd = dataset.meta.defaultEnd;
    state.model = "linear";
    state.scope = "All";
    state.userType = "All";
    state.lookback = "30";
    state.targetEvent = dataset.meta.defaultTargetEvent || "Package Purchase";
    state.search = "";
    state.page = 1;
    clearJourneySelection();
    elements.attributionSearch.value = "";
    populateControls();
    render();
  }

  function bindEvents() {
    root.querySelectorAll("[data-mta-filter]").forEach((element) => {
      element.addEventListener("change", () => {
        const key = element.dataset.mtaFilter;
        if (key === "dateStart" || key === "dateEnd") {
          state[key] = element.value;
          if (state.dateStart > state.dateEnd) {
            if (key === "dateStart") state.dateEnd = state.dateStart;
            else state.dateStart = state.dateEnd;
          }
        } else {
          state.filters[key] = element.value;
        }
        state.page = 1;
        clearJourneySelection();
        render();
      });
    });

    root.querySelectorAll("[data-mta-control]").forEach((element) => {
      element.addEventListener("change", () => {
        state[element.dataset.mtaControl] = element.value;
        state.page = 1;
        clearJourneySelection();
        render();
      });
    });

    root.querySelector("[data-mta-reset]").addEventListener("click", resetState);
    elements.clearJourney.addEventListener("click", () => {
      clearJourneySelection();
      state.page = 1;
      render();
    });

    elements.attributionSearch.addEventListener("input", () => {
      state.search = elements.attributionSearch.value.trim().toLowerCase();
      state.page = 1;
      renderAttributionTable();
    });

    elements.chips.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-clear]");
      if (!button) return;
      const key = button.dataset.clear;
      if (key === "path") clearJourneySelection();
      else if (key in state.filters) state.filters[key] = "All";
      else if (key === "scope" || key === "userType" || key === "targetEvent") state[key] = "All";
      state.page = 1;
      render();
    });

    elements.journeyVisual.addEventListener("click", (event) => {
      const node = event.target.closest("[data-journey-node]");
      if (node) {
        state.pathNode = decodeURIComponent(node.dataset.journeyNode);
        state.pathFilter = null;
        state.page = 1;
        render();
        return;
      }
      const pageButton = event.target.closest("button[data-path-page]");
      if (pageButton) {
        if (!pageButton.disabled) {
          state.pathPage = Number(pageButton.dataset.pathPage);
          renderTopPaths();
        }
        return;
      }
      const path = event.target.closest("[data-path-index]");
      if (path) {
        const item = topPathContext[Number(path.dataset.pathIndex)];
        if (item) {
          state.pathFilter = item.path;
          state.pathNode = null;
          state.page = 1;
          render();
        }
      }
    });

    root.addEventListener("click", (event) => {
      const channelTarget = event.target.closest("[data-channel-select]");
      if (channelTarget) {
        const channel = channelTarget.dataset.channelSelect;
        state.filters.channel = state.filters.channel === channel ? "All" : channel;
        clearJourneySelection();
        state.page = 1;
        render();
        return;
      }
      const modelTarget = event.target.closest("[data-model-select]");
      if (modelTarget) {
        state.model = modelTarget.dataset.modelSelect;
        root.querySelector('[data-mta-control="model"]').value = state.model;
        state.page = 1;
        render();
        return;
      }
      const pageTarget = event.target.closest("button[data-page]");
      if (pageTarget && !pageTarget.disabled) {
        state.page = Number(pageTarget.dataset.page);
        renderAttributionTable();
      }
    });
  }

  function renderChips() {
    const chips = [];
    chips.push(`<span class="mta-chip">${escapeHtml(state.dateStart)} - ${escapeHtml(state.dateEnd)}</span>`);
    chips.push(`<span class="mta-chip">${escapeHtml(modelLabel(state.model))} attribution</span>`);
    chips.push(`<span class="mta-chip">${escapeHtml(state.lookback)}-day lookback</span>`);
    FILTER_DEFS.forEach((definition) => {
      const value = state.filters[definition.key];
      if (value !== "All") {
        chips.push(`<span class="mta-chip">${escapeHtml(definition.label)}: ${escapeHtml(value)} <button type="button" data-clear="${definition.key}" aria-label="Clear ${escapeHtml(definition.label)}">×</button></span>`);
      }
    });
    [["scope", "Scope"], ["userType", "User"], ["targetEvent", "Event"]].forEach(([key, label]) => {
      if (state[key] !== "All") {
        chips.push(`<span class="mta-chip">${label}: ${escapeHtml(state[key])} <button type="button" data-clear="${key}" aria-label="Clear ${label}">×</button></span>`);
      }
    });
    if (state.pathNode || state.pathFilter) {
      const label = state.pathNode ? `Journey node: ${state.pathNode}` : `Path: ${state.pathFilter}`;
      chips.push(`<span class="mta-chip">${escapeHtml(label)} <button type="button" data-clear="path" aria-label="Clear journey selection">×</button></span>`);
    }
    elements.chips.innerHTML = chips.length ? chips.join("") : '<span class="mta-chip empty">All journey data</span>';
  }

  function renderScorecards() {
    const summary = summarize(currentRows);
    const profile = eventMetricProfile();
    const allowedChannels = new Set(visibleChannels());
    const attributed = attributionByChannel(currentRows, state.model)
      .filter((item) => allowedChannels.has(item.channel))
      .reduce((result, item) => ({
        conversions: result.conversions + item.conversions,
        revenue: result.revenue + item.revenue,
      }), { conversions: 0, revenue: 0 });
    const medianTouches = weightedMedian(
      currentRows.filter((row) => row.conversions > 0),
      (row) => safeDivide(row.touchpoints, row.journeys),
      (row) => row.conversions,
    );
    const medianTime = weightedMedian(
      currentRows.filter((row) => row.conversions > 0),
      (row) => row.durationHours,
      (row) => row.conversions,
    );
    const cards = [
      ["Unique Users", formatCount(summary.users), "Deduplicated users in selected aggregate scope", "users"],
      ["Total Journeys", formatCount(summary.journeys), "Observed journeys within the lookback window", "journey"],
      ["Total Touchpoints", formatCount(summary.touchpoints), "Recorded marketing touchpoints", "touch"],
      [profile.outcomeLabel, formatCount(summary.conversions), profile.outcomeNote, "conversion"],
      [profile.rateLabel, formatPercent(safeDivide(summary.conversions, summary.journeys) * 100), profile.rateNote, "rate"],
      [profile.attributedLabel, profile.formatCredit(attributed[profile.creditKey]), `${modelLabel(state.model)} credit; not incremental`, profile.attributedIcon],
      ["Median Touchpoints to Convert", medianTouches.toFixed(1), "Weighted median among converting journeys", "touch"],
      ["Median Time to Convert", formatDuration(medianTime), "Weighted median among converting journeys", "time"],
    ];
    const icons = {
      users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-4 2.1-6 5.5-6s5.1 2 5.5 6M16 7.5a2.5 2.5 0 0 1 0 5M16 14c2.8.3 4.2 2 4.5 5"/></svg>',
      journey: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/></svg>',
      touch: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 11 7.4-4m-7.4 6 7.4 4"/></svg>',
      conversion: '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17l9-10"/><circle cx="12" cy="12" r="9"/></svg>',
      rate: '<svg viewBox="0 0 24 24"><path d="m5 17 5-5 3 3 6-8"/><path d="M15 7h4v4"/></svg>',
      revenue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 8.5h-3.2a2 2 0 0 0 0 4h1.4a2 2 0 0 1 0 4H9.5M12 6.5v11"/></svg>',
      time: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
    };
    elements.scorecards.innerHTML = cards.map(([label, value, note, icon]) => `
      <article class="mta-scorecard">
        <div class="mta-scorecard-top"><p class="mta-scorecard-label">${label}</p><span class="mta-scorecard-icon">${icons[icon]}</span></div>
        <p class="mta-scorecard-value">${value}</p>
        <p class="mta-scorecard-note">${note}</p>
      </article>
    `).join("");
  }

  function updateJourneyMeta() {
    elements.journeyLegend.innerHTML = `${CHANNELS.map((channel) => `<span><i style="background:${CHANNEL_COLORS[channel]}"></i>${channel}</span>`).join("")}<span><i class="app"></i>In-app step</span><span><i class="good"></i>Converted</span><span><i class="bad"></i>Dropped</span>`;
    elements.clearJourney.hidden = !(state.pathNode || state.pathFilter);
  }

  function nodeColor(name) {
    if (CHANNEL_COLORS[name]) return CHANNEL_COLORS[name];
    if (/Bought|Recharged|opened/i.test(name)) return "#1b8c68";
    if (/failed|abandoned|Left/i.test(name)) return "#c34452";
    if (/detail|Search/i.test(name)) return "#ec0a68";
    if (/Install|Store/i.test(name)) return "#7a5be2";
    return "#9aa6be";
  }

  function aggregateSankey(source) {
    const nodes = new Map();
    const links = new Map();
    source.forEach((row) => {
      const path = stageNodes(row);
      path.forEach(([level, name], index) => {
        const key = `${level}|${name}`;
        if (!nodes.has(key)) nodes.set(key, { key, name, level, journeys: 0, conversions: 0, revenue: 0 });
        const node = nodes.get(key);
        node.journeys += row.journeys;
        node.conversions += row.conversions;
        node.revenue += row.revenue;
        if (index < path.length - 1) {
          const targetKey = `${path[index + 1][0]}|${path[index + 1][1]}`;
          const linkKey = `${key}>>${targetKey}`;
          if (!links.has(linkKey)) links.set(linkKey, { source: key, target: targetKey, journeys: 0, conversions: 0, revenue: 0 });
          const link = links.get(linkKey);
          link.journeys += row.journeys;
          link.conversions += row.conversions;
          link.revenue += row.revenue;
        }
      });
    });
    return { nodes: [...nodes.values()], links: [...links.values()] };
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "mta-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function bindTooltipTargets() {
    const tip = ensureTooltip();
    elements.journeyVisual.querySelectorAll("[data-tooltip]").forEach((target) => {
      target.addEventListener("mouseenter", () => {
        tip.innerHTML = decodeURIComponent(target.dataset.tooltip);
        tip.hidden = false;
      });
      target.addEventListener("mousemove", (event) => {
        const x = Math.min(window.innerWidth - tip.offsetWidth - 12, event.clientX + 14);
        const y = Math.min(window.innerHeight - tip.offsetHeight - 12, event.clientY + 14);
        tip.style.left = `${Math.max(8, x)}px`;
        tip.style.top = `${Math.max(8, y)}px`;
      });
      target.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  function renderSankey() {
    const target = elements.journeySankey;
    if (!currentRows.length) {
      target.innerHTML = '<div class="journey-empty">No observed journeys match the selected filters.</div>';
      return;
    }
    const data = aggregateSankey(currentRows);
    const width = 1180;
    const height = 392;
    const marginX = 28;
    const marginRight = 150;
    const marginTop = 40;
    const marginBottom = 14;
    const nodeWidth = 15;
    const maxLevel = JOURNEY_STAGES.length - 1;
    const columnX = (level) => marginX + (width - marginX - marginRight - nodeWidth) * safeDivide(level, maxLevel);
    const byLevel = new Map();
    data.nodes.forEach((node) => {
      if (!byLevel.has(node.level)) byLevel.set(node.level, []);
      byLevel.get(node.level).push(node);
    });
    const position = new Map();
    byLevel.forEach((levelNodes, level) => {
      levelNodes.sort((a, b) => b.journeys - a.journeys || a.name.localeCompare(b.name));
      const gap = 10;
      const available = height - marginTop - marginBottom - gap * Math.max(0, levelNodes.length - 1);
      const total = levelNodes.reduce((sum, node) => sum + node.journeys, 0) || 1;
      const rawHeights = levelNodes.map((node) => Math.max(24, available * node.journeys / total));
      const scaleDown = Math.min(1, available / rawHeights.reduce((sum, value) => sum + value, 0));
      let y = marginTop;
      levelNodes.forEach((node, index) => {
        const nodeHeight = rawHeights[index] * scaleDown;
        position.set(node.key, { x: columnX(level), y, height: nodeHeight, node, sourceOffset: 0, targetOffset: 0 });
        y += nodeHeight + gap;
      });
    });

    const headerSvg = JOURNEY_STAGES.map((label, level) => {
      const x = columnX(level);
      return `<text class="sankey-stage" x="${x}" y="18">${escapeHtml(label)}</text>`;
    }).join("");

    const orderedLinks = [...data.links].sort((a, b) => b.journeys - a.journeys);
    const linkSvg = orderedLinks.map((link) => {
      const source = position.get(link.source);
      const target = position.get(link.target);
      if (!source || !target) return "";
      const sourceScale = safeDivide(source.height, source.node.journeys);
      const targetScale = safeDivide(target.height, target.node.journeys);
      const strokeWidth = Math.max(1.4, link.journeys * Math.min(sourceScale, targetScale));
      const y1 = source.y + source.sourceOffset + strokeWidth / 2;
      const y2 = target.y + target.targetOffset + strokeWidth / 2;
      source.sourceOffset += strokeWidth;
      target.targetOffset += strokeWidth;
      const x1 = source.x + nodeWidth;
      const x2 = target.x;
      const curve = Math.max(22, (x2 - x1) * 0.48);
      const tooltipHtml = `<strong>${escapeHtml(source.node.name)} → ${escapeHtml(target.node.name)}</strong>${formatCount(link.journeys)} journeys · ${formatPercent(safeDivide(link.conversions, link.journeys) * 100)} CVR<br>${formatJourneyValue(link.revenue, link.conversions)}`;
      return `<path class="sankey-link" d="M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}" stroke="${nodeColor(source.node.name)}" stroke-width="${strokeWidth.toFixed(2)}" data-tooltip="${encodeURIComponent(tooltipHtml)}"></path>`;
    }).join("");

    const nodeSvg = data.nodes.map((node) => {
      const item = position.get(node.key);
      const labelX = item.x + nodeWidth + 7;
      const anchor = "start";
      const labelY = item.y + Math.min(item.height / 2, 12);
      const tooltipHtml = `<strong>${escapeHtml(JOURNEY_STAGES[node.level])}: ${escapeHtml(node.name)}</strong>${formatCount(node.journeys)} journeys · ${formatPercent(safeDivide(node.conversions, node.journeys) * 100)} CVR<br>${formatJourneyValue(node.revenue, node.conversions)}<br>Click to filter the dashboard`;
      return `
        <g class="sankey-node" data-journey-node="${encodeURIComponent(node.name)}" data-tooltip="${encodeURIComponent(tooltipHtml)}">
          <rect x="${item.x}" y="${item.y}" width="${nodeWidth}" height="${Math.max(4, item.height)}" rx="3" fill="${nodeColor(node.name)}"></rect>
          <text class="sankey-label" x="${labelX}" y="${labelY}" text-anchor="${anchor}">${escapeHtml(node.name)}</text>
          <text class="sankey-value" x="${labelX}" y="${labelY + 12}" text-anchor="${anchor}">${compactNumber(node.journeys)} journeys</text>
        </g>`;
    }).join("");

    target.innerHTML = `<div class="journey-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Full journey flow from first ad to result">${headerSvg}${linkSvg}${nodeSvg}</svg></div>`;
    bindTooltipTargets();
  }

  function getTopPaths() {
    const grouped = new Map();
    currentRows.forEach((row) => {
      const nodes = fullPath(row);
      const path = nodes.join(" → ");
      if (!grouped.has(path)) grouped.set(path, { path, nodes, journeys: 0, conversions: 0, revenue: 0 });
      const item = grouped.get(path);
      item.journeys += row.journeys;
      item.conversions += row.conversions;
      item.revenue += row.revenue;
    });
    return [...grouped.values()].sort((a, b) => b.journeys - a.journeys);
  }

  const PATHS_PER_PAGE = 5;

  function renderTopPaths() {
    topPathContext = getTopPaths();
    if (!topPathContext.length) {
      elements.journeyPaths.innerHTML = '<div class="journey-empty small">No observed journeys match the selected filters.</div>';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(topPathContext.length / PATHS_PER_PAGE));
    state.pathPage = Math.min(Math.max(1, state.pathPage), totalPages);
    const start = (state.pathPage - 1) * PATHS_PER_PAGE;
    const pageItems = topPathContext.slice(start, start + PATHS_PER_PAGE);
    const total = summarize(currentRows).journeys;
    const profile = eventMetricProfile();
    const pageButtons = [];
    pageButtons.push(`<button type="button" data-path-page="${state.pathPage - 1}"${state.pathPage === 1 ? " disabled" : ""} aria-label="Previous page">‹</button>`);
    const firstPage = Math.max(1, Math.min(state.pathPage - 1, totalPages - 2));
    for (let page = firstPage; page <= Math.min(totalPages, firstPage + 2); page += 1) {
      pageButtons.push(`<button type="button" data-path-page="${page}" class="${page === state.pathPage ? "active" : ""}">${page}</button>`);
    }
    pageButtons.push(`<button type="button" data-path-page="${state.pathPage + 1}"${state.pathPage === totalPages ? " disabled" : ""} aria-label="Next page">›</button>`);
    elements.journeyPaths.innerHTML = `<div class="top-path-list">
      <div class="top-path-head"><span>Journey (ads → in-app steps → result)</span><span>Journeys</span><span>Share</span><span>${escapeHtml(profile.pathLabel)}</span></div>
      ${pageItems.map((item, offset) => `
      <button class="top-path-row" type="button" data-path-index="${start + offset}">
        <span class="top-path-nodes"><span class="path-rank">${start + offset + 1}</span>${item.nodes.map((node, nodeIndex) => `${nodeIndex ? '<span class="path-arrow">→</span>' : ""}<span class="path-node" style="--node:${nodeColor(node)}">${escapeHtml(node)}</span>`).join("")}</span>
        <span class="path-stat"><strong>${formatCount(item.journeys)}</strong></span>
        <span class="path-stat"><strong>${formatPercent(safeDivide(item.journeys, total) * 100)}</strong></span>
        <span class="path-stat"><strong>${profile.creditKey === "revenue" ? formatCurrency(item.revenue) : formatCount(item.conversions)}</strong></span>
      </button>
    `).join("")}</div>
    <div class="top-path-footer">
      <span>Showing ${start + 1}-${start + pageItems.length} of ${formatCount(topPathContext.length)} journey ${topPathContext.length === 1 ? "path" : "paths"}, most common first</span>
      ${totalPages > 1 ? `<div class="mta-pagination">${pageButtons.join("")}</div>` : ""}
    </div>`;
  }

  // One funnel per conversion event in scope, all shown at once.
  function funnelFor(event, source) {
    const meta = EVENT_JOURNEYS[event] || { title: event, result: "Converted" };
    const sum = (predicate, key = "journeys") => source.filter(predicate).reduce((total, row) => total + row[key], 0);
    const journeys = sum(() => true);
    const converted = sum(() => true, "conversions");
    let stages;
    let drops;
    if (event === "App Install") {
      stages = [["Reached App Store", journeys], [meta.result, converted]];
      drops = [["Install abandoned", sum((row) => journeyParts(row).result === "Install abandoned")]];
    } else {
      const browsed = sum((row) => Boolean(journeyParts(row).browse));
      const viewed = sum((row) => Boolean(journeyParts(row).view));
      stages = [
        ["Arrived in MyXL", journeys],
        ["Browsed the app", Math.min(journeys, browsed)],
        ["Looked at packages", Math.min(browsed, viewed)],
        [meta.result, Math.min(viewed, converted)],
      ];
      const left = (row) => journeyParts(row).result === "Left without buying";
      drops = [
        ["Left right away", sum((row) => left(row) && !journeyParts(row).browse)],
        ["Left while browsing", sum((row) => left(row) && journeyParts(row).browse && !journeyParts(row).view)],
        ["Left after viewing packages", sum((row) => left(row) && Boolean(journeyParts(row).view))],
        ["Payment failed", sum((row) => journeyParts(row).result === "Payment failed")],
      ];
    }
    let biggest = null;
    stages.forEach((stage, index) => {
      if (!index) return;
      const lost = 1 - safeDivide(stage[1], stages[index - 1][1]);
      if (!biggest || lost > biggest.lost) biggest = { from: stages[index - 1][0], to: stage[0], lost };
    });
    const lastAd = new Map();
    source.forEach((row) => {
      const channels = row.channels || [];
      const channel = channels[channels.length - 1];
      if (channel) lastAd.set(channel, (lastAd.get(channel) || 0) + row.journeys);
    });
    const mix = [...lastAd.entries()].sort((a, b) => b[1] - a[1]).map(([channel, value]) => ({ channel, share: safeDivide(value, journeys) * 100 }));
    return { title: meta.title, journeys, stages, drops, biggest, mix };
  }

  function renderJourneyFunnel() {
    const target = elements.journeyFunnel;
    const order = ["Package Purchase", "Recharge", "App Install"];
    const events = order.filter((event) => currentRows.some((row) => row.targetEvent === event));
    const funnels = events
      .map((event) => funnelFor(event, currentRows.filter((row) => row.targetEvent === event)))
      .filter((funnel) => funnel.journeys > 0);
    if (!funnels.length) {
      target.innerHTML = '<div class="journey-empty small">No journey funnel is available for the selected filters.</div>';
      return;
    }
    target.classList.toggle("single", funnels.length === 1);
    target.innerHTML = funnels.map((funnel) => {
      const top = funnel.stages[0][1];
      const rows = funnel.stages.map(([label, value], index) => {
        const width = Math.max(2, safeDivide(value, top) * 100);
        const kept = index ? `${formatPercent(safeDivide(value, funnel.stages[index - 1][1]) * 100)} continued` : "Start";
        return `<div class="journey-funnel-row">
          <span class="journey-funnel-label">${escapeHtml(label)}</span>
          <span class="journey-funnel-value">${formatCount(value)}<small>${kept}</small></span>
          <div class="journey-funnel-track"><div class="journey-funnel-fill" style="width:${width.toFixed(1)}%"></div></div>
        </div>`;
      }).join("");
      const drops = funnel.drops.map(([label, value]) => `<span class="journey-drop"><strong>${formatCount(value)}</strong>${escapeHtml(label)}</span>`).join("");
      const biggest = funnel.biggest
        ? `<p class="journey-biggest"><strong>Biggest drop:</strong> ${escapeHtml(funnel.biggest.from)} → ${escapeHtml(funnel.biggest.to)} (${formatPercent(funnel.biggest.lost * 100)} did not continue)</p>`
        : "";
      const mix = funnel.mix.map((item) => `<span><i style="background:${CHANNEL_COLORS[item.channel] || "#9aa6be"}"></i>${escapeHtml(item.channel)} ${formatPercent(item.share)}</span>`).join("");
      return `<article class="journey-funnel-card">
        <header><h4>${escapeHtml(funnel.title)}</h4><span>${formatCount(funnel.journeys)} journeys</span></header>
        <div class="journey-mix"><em>Brought in by (last ad)</em>${mix}</div>
        <div class="journey-funnel">${rows}</div>
        <div class="journey-drops">${drops}</div>
        ${biggest}
      </article>`;
    }).join("");
  }

  function renderJourney() {
    renderJourneyFunnel();
    renderSankey();
    renderTopPaths();
  }

  function renderBarChart(target, items, valueAccessor, formatter, className = "") {
    const max = Math.max(...items.map(valueAccessor), 0.0001);
    target.innerHTML = `<div class="metric-bar-list">${items.map((item) => `
      <div class="metric-bar-row">
        <span class="metric-bar-label">${escapeHtml(item.label)}</span>
        <div class="metric-bar-track"><div class="metric-bar-fill ${className}" style="width:${Math.max(1, safeDivide(valueAccessor(item), max) * 100).toFixed(1)}%"></div></div>
        <span class="metric-bar-value">${formatter(valueAccessor(item), item)}${item.sub ? `<small class="metric-bar-sub">${escapeHtml(item.sub)}</small>` : ""}</span>
      </div>
    `).join("")}</div>`;
  }

  function renderJourneyHealth() {
    const touchBuckets = [
      { label: "1 touch", min: 0, max: 1.5 },
      { label: "2 touches", min: 1.5, max: 2.5 },
      { label: "3 touches", min: 2.5, max: 3.5 },
      { label: "4 touches", min: 3.5, max: 4.5 },
      { label: "5+ touches", min: 4.5, max: Infinity },
    ].map((bucket) => {
      const matches = currentRows.filter((row) => {
        const average = safeDivide(row.touchpoints, row.journeys);
        return average >= bucket.min && average < bucket.max;
      });
      const summary = summarize(matches);
      return {
        label: bucket.label,
        value: safeDivide(summary.conversions, summary.journeys) * 100,
        sub: `${compactNumber(summary.journeys)} journeys`,
      };
    });
    renderBarChart(elements.touchpointHealth, touchBuckets, (item) => item.value, (value) => formatPercent(value));

    const timeBuckets = [
      { label: "< 1 hr", min: 0, max: 1 },
      { label: "1-6 hrs", min: 1, max: 6 },
      { label: "6-24 hrs", min: 6, max: 24 },
      { label: "1-3 days", min: 24, max: 72 },
      { label: "3-7 days", min: 72, max: 168 },
      { label: "7+ days", min: 168, max: Infinity },
    ].map((bucket) => ({
      label: bucket.label,
      value: currentRows
        .filter((row) => row.durationHours >= bucket.min && row.durationHours < bucket.max)
        .reduce((sum, row) => sum + row.conversions, 0),
    }));
    const converted = timeBuckets.reduce((sum, item) => sum + item.value, 0);
    timeBuckets.forEach((item) => { item.sub = `${formatPercent(safeDivide(item.value, converted) * 100)} share`; });
    renderBarChart(elements.timeHealth, timeBuckets, (item) => item.value, (value) => compactNumber(value), "magenta");
  }

  function channelCreditWeights(row, model) {
    const touches = row.channels || [];
    if (!touches.length) return {};
    const raw = touches.map((channel, index) => {
      if (model === "first") return index === 0 ? 1 : 0;
      if (model === "last") return index === touches.length - 1 ? 1 : 0;
      if (model === "linear") return 1;
      const positionWeight = touches.length === 1 ? 1 : 0.45 + 0.75 * index / (touches.length - 1);
      const channelPrior = { Google: 1.12, Meta: 1.04, TikTok: 0.91, X: 0.82 }[channel] || 1;
      return positionWeight * channelPrior;
    });
    const total = raw.reduce((sum, value) => sum + value, 0) || 1;
    return touches.reduce((credits, channel, index) => {
      credits[channel] = (credits[channel] || 0) + raw[index] / total;
      return credits;
    }, {});
  }

  function attributionByChannel(source, model) {
    const result = Object.fromEntries(CHANNELS.map((channel) => [channel, { channel, conversions: 0, revenue: 0 }]));
    source.forEach((row) => {
      if (!row.conversions) return;
      const weights = channelCreditWeights(row, model);
      Object.entries(weights).forEach(([channel, weight]) => {
        if (!result[channel]) result[channel] = { channel, conversions: 0, revenue: 0 };
        result[channel].conversions += row.conversions * weight;
        result[channel].revenue += row.revenue * weight;
      });
    });
    return Object.values(result);
  }

  function channelRoles(source) {
    const result = Object.fromEntries(CHANNELS.map((channel) => [channel, { channel, first: 0, assist: 0, last: 0 }]));
    source.forEach((row) => {
      if (!row.conversions || !row.channels.length) return;
      const touches = row.channels;
      result[touches[0]].first += row.conversions;
      result[touches[touches.length - 1]].last += row.conversions;
      touches.slice(1, -1).forEach((channel) => { result[channel].assist += row.conversions; });
      if (touches.length === 2) result[touches[0]].assist += row.conversions * 0.35;
      if (touches.length === 1) result[touches[0]].assist += row.conversions * 0.15;
    });
    return Object.values(result);
  }

  function attributionDetails() {
    const grouped = new Map();
    const allowedChannels = new Set(visibleChannels());
    currentRows.forEach((row) => {
      const weights = row.conversions ? channelCreditWeights(row, state.model) : {};
      uniqueChannels(row).filter((channel) => allowedChannels.has(channel)).forEach((channel) => {
        const key = `${row.campaign}|${channel}|${row.objective}`;
        if (!grouped.has(key)) grouped.set(key, {
          campaign: row.campaign,
          channel,
          objective: row.objective,
          journeys: 0,
          first: 0,
          assists: 0,
          last: 0,
          conversions: 0,
          revenue: 0,
        });
        const item = grouped.get(key);
        item.journeys += row.journeys;
        if (row.channels[0] === channel) item.first += row.conversions;
        if (row.channels[row.channels.length - 1] === channel) item.last += row.conversions;
        if (row.channels.slice(1, -1).includes(channel)) item.assists += row.conversions;
        if (row.channels.length === 2 && row.channels[0] === channel) item.assists += row.conversions * 0.35;
        item.conversions += row.conversions * (weights[channel] || 0);
        item.revenue += row.revenue * (weights[channel] || 0);
      });
    });
    const metricKey = eventMetricProfile().creditKey;
    return [...grouped.values()].sort((a, b) => b[metricKey] - a[metricKey] || b.journeys - a.journeys);
  }

  function renderAttributionTable() {
    const profile = eventMetricProfile();
    const allItems = attributionDetails();
    const searched = state.search
      ? allItems.filter((item) => `${item.campaign} ${item.channel} ${item.objective}`.toLowerCase().includes(state.search))
      : allItems;
    const pageSize = 8;
    const totalPages = Math.max(1, Math.ceil(searched.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * pageSize;
    const items = searched.slice(start, start + pageSize);
    const totalAttributedConversions = allItems.reduce((sum, item) => sum + item.conversions, 0);
    elements.attributionDescription.textContent = profile.detailDescription;
    elements.attributionConversionHeading.textContent = profile.tableConversionHeading;
    elements.attributionValueHeading.textContent = profile.tableValueHeading;
    elements.attributionTable.innerHTML = items.length ? items.map((item) => `
      <tr data-channel-select="${item.channel}">
        <td class="campaign-name-cell" title="${escapeHtml(item.campaign)}">${escapeHtml(item.campaign)}</td>
        <td><span class="channel-pill"><i style="background:${CHANNEL_COLORS[item.channel] || "#7f899d"}"></i>${item.channel}</span></td>
        <td>${escapeHtml(item.objective)}</td>
        <td class="numeric">${formatCount(item.journeys)}</td>
        <td class="numeric">${formatCount(item.first)}</td>
        <td class="numeric">${formatCount(item.assists)}</td>
        <td class="numeric">${formatCount(item.last)}</td>
        <td class="numeric">${item.conversions.toFixed(1)}</td>
        <td class="numeric">${profile.creditKey === "revenue" ? formatCurrency(item.revenue) : formatPercent(safeDivide(item.conversions, totalAttributedConversions) * 100)}</td>
      </tr>
    `).join("") : '<tr><td colspan="9">No attribution detail matches the selected scope.</td></tr>';
    elements.attributionCount.textContent = searched.length
      ? `Showing ${start + 1}-${Math.min(start + pageSize, searched.length)} of ${searched.length} campaign-channel rows`
      : "No campaign-channel rows";
    const pageButtons = [];
    pageButtons.push(`<button type="button" data-page="${Math.max(1, state.page - 1)}"${state.page === 1 ? " disabled" : ""} aria-label="Previous page">‹</button>`);
    const firstPage = Math.max(1, Math.min(state.page - 1, totalPages - 2));
    for (let page = firstPage; page <= Math.min(totalPages, firstPage + 2); page += 1) {
      pageButtons.push(`<button type="button" data-page="${page}" class="${page === state.page ? "active" : ""}">${page}</button>`);
    }
    pageButtons.push(`<button type="button" data-page="${Math.min(totalPages, state.page + 1)}"${state.page === totalPages ? " disabled" : ""} aria-label="Next page">›</button>`);
    elements.attributionPagination.innerHTML = pageButtons.join("");
  }

  function renderSignals() {
    const profile = eventMetricProfile();
    const allowedChannels = new Set(visibleChannels());
    const roles = channelRoles(currentRows).filter((role) => allowedChannels.has(role.channel));
    const topFirst = [...roles].sort((a, b) => b.first - a.first)[0];
    const topAssist = [...roles].sort((a, b) => b.assist - a.assist)[0];
    const topLast = [...roles].sort((a, b) => b.last - a.last)[0];
    const topPath = getTopPaths()[0];
    const summary = summarize(currentRows);
    const highTouchRows = currentRows.filter((row) => safeDivide(row.touchpoints, row.journeys) >= 3.5);
    const highTouch = summarize(highTouchRows);
    let signals = [["No observed journey signal", "Adjust filters or expand the lookback window to restore journey coverage."]];
    if (summary.journeys && state.filters.channel !== "All") {
      const channel = state.filters.channel;
      const role = roles[0];
      const roleTotal = role.first + role.assist + role.last;
      const attribution = attributionByChannel(currentRows, state.model).find((item) => item.channel === channel);
      const attributionBody = profile.creditKey === "revenue"
        ? `${channel} receives ${attribution ? attribution.conversions.toFixed(1) : "0.0"} attributed ${profile.outcomeNoun} and ${formatCurrency(attribution ? attribution.revenue : 0)} attributed revenue.`
        : `${channel} receives ${formatAttributedCount(attribution ? attribution.conversions : 0)} attributed ${profile.outcomeNoun}.`;
      signals = [
        [`${channel} role in selected journeys`, `${formatPercent(safeDivide(role.first, roleTotal) * 100)} initiator · ${formatPercent(safeDivide(role.assist, roleTotal) * 100)} assister · ${formatPercent(safeDivide(role.last, roleTotal) * 100)} closer.`],
        [`${modelLabel(state.model)} attribution credit`, attributionBody],
        ["Longer journeys show potential friction", `${formatCount(highTouch.journeys)} journeys average 4+ touchpoints with ${formatPercent(safeDivide(highTouch.conversions, highTouch.journeys) * 100)} observed CVR.`],
        ["Most common path", topPath ? `${topPath.path} accounts for ${formatPercent(safeDivide(topPath.journeys, summary.journeys) * 100)} of selected journeys.` : "No path available."],
      ];
    } else if (summary.journeys) {
      signals = [
        [`${topFirst.channel} opens the most converting journeys`, `${formatPercent(safeDivide(topFirst.first, roles.reduce((sum, role) => sum + role.first, 0)) * 100)} of observed first-touch conversion roles. Review its reach and entry creative.`],
        [`${topAssist.channel} is the strongest assist signal`, `${formatCount(topAssist.assist)} assisted conversion-role events. Avoid judging this channel only on last-click results.`],
        [`${topLast.channel} closes most often`, `${formatPercent(safeDivide(topLast.last, roles.reduce((sum, role) => sum + role.last, 0)) * 100)} of observed closing roles. Validate whether search or retargeting is capturing existing demand.`],
        ["Longer journeys show potential friction", `${formatCount(highTouch.journeys)} journeys average 4+ touchpoints with ${formatPercent(safeDivide(highTouch.conversions, highTouch.journeys) * 100)} observed CVR.`],
        ["Most common path", topPath ? `${topPath.path} accounts for ${formatPercent(safeDivide(topPath.journeys, summary.journeys) * 100)} of selected journeys.` : "No path available."],
      ];
    }
    elements.journeySignals.innerHTML = signals.map(([title, body]) => `<div class="mta-signal"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`).join("");
  }

  function render() {
    refreshFilterOptions();
    currentRows = filteredRows();
    state.pathPage = 1;
    const dateStart = root.querySelector('[data-mta-filter="dateStart"]');
    const dateEnd = root.querySelector('[data-mta-filter="dateEnd"]');
    dateStart.value = state.dateStart;
    dateEnd.value = state.dateEnd;
    root.querySelector('[data-mta-control="model"]').value = state.model;
    root.querySelector('[data-mta-control="scope"]').value = state.scope;
    root.querySelector('[data-mta-control="userType"]').value = state.userType;
    root.querySelector('[data-mta-control="lookback"]').value = state.lookback;
    root.querySelector('[data-mta-control="targetEvent"]').value = state.targetEvent;
    updateJourneyMeta();
    renderChips();
    renderScorecards();
    renderJourney();
    renderJourneyHealth();
    renderAttributionTable();
    renderSignals();
  }

  async function init() {
    try {
      const response = await fetch("/static/data/mta.json");
      if (!response.ok) throw new Error(`Data request failed (${response.status})`);
      dataset = await response.json();
      rows = dataset.rows || [];
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      state.targetEvent = dataset.meta.defaultTargetEvent || "Package Purchase";
      populateControls();
      bindEvents();
      render();
      elements.status.hidden = true;
    } catch (error) {
      elements.status.classList.add("error");
      elements.status.innerHTML = `<span class="status-pulse" aria-hidden="true"></span>Unable to load MTA demo data. ${escapeHtml(error.message)}`;
    }
  }

  init();
})();
