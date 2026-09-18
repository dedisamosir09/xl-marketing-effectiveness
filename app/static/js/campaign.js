(() => {
  const dashboardRoot = document.querySelector("[data-scorecards]");
  if (!dashboardRoot) return;

  const CHANNEL_COLORS = {
    Google: "#3156d3",
    Meta: "#7355dc",
    TikTok: "#ec0a68",
    X: "#18a2bd",
  };

  const CAMPAIGN_OBJECTIVES = ["Awareness", "Consideration", "Conversion", "Social Media Engagement"];

  const LEARNING_CONFIG = {
    Awareness: { metrics: ["cpm", "impressions", "videoViews", "cpv"], defaultMetric: "cpm", bubbleMetric: "impressions" },
    Consideration: { metrics: ["ctr", "cpc", "clicks", "sessions", "cps"], defaultMetric: "ctr", bubbleMetric: "sessions" },
    Conversion: { metrics: ["roas", "cpa", "purchases", "conversionRate", "revenue"], defaultMetric: "roas", bubbleMetric: "purchases" },
    "Social Media Engagement": { metrics: ["cpv", "videoViews", "ctr", "cpc"], defaultMetric: "cpv", bubbleMetric: "videoViews" },
  };

  const FILTERS = [
    { key: "product", label: "Product", all: "All products", field: "product" },
    { key: "mediaPlan", label: "Media plan", all: "All media plans", field: "mediaPlan" },
    { key: "funnel", label: "Campaign Objective", all: "All campaign objectives", field: "funnel" },
    { key: "channel", label: "Channel", all: "All channels", field: "channel" },
    { key: "placement", label: "Placement", all: "All placements", field: "placement" },
    { key: "campaign", label: "Campaign", all: "All campaigns", field: "campaign" },
  ];

  const METRICS = {
    spend: { label: "Total Spend", group: "Delivery", format: formatCurrency, direction: "neutral" },
    impressions: { label: "Impressions", group: "Delivery", format: formatCount, direction: "up" },
    videoViews: { label: "Video Views", group: "Delivery", format: formatCount, direction: "up" },
    clicks: { label: "Link Clicks", group: "Traffic", format: formatCount, direction: "up" },
    sessions: { label: "Sessions", group: "Traffic", format: formatCount, direction: "up" },
    purchases: { label: "Purchases", group: "Conversion", format: formatCount, direction: "up" },
    revenue: { label: "Revenue", group: "Business Value", format: formatCurrency, direction: "up" },
    ctr: { label: "CTR", group: "Traffic", format: formatPercent, direction: "up" },
    conversionRate: { label: "Conversion Rate", group: "Conversion", format: formatPercent, direction: "up" },
    cpm: { label: "CPM", group: "Cost Efficiency", format: formatCurrency, direction: "down" },
    cpv: { label: "CPV", group: "Cost Efficiency", format: formatCurrency, direction: "down" },
    cpc: { label: "CPC", group: "Cost Efficiency", format: formatCurrency, direction: "down" },
    cps: { label: "CPS", group: "Cost Efficiency", format: formatCurrency, direction: "down" },
    cpa: { label: "CPA", group: "Cost Efficiency", format: formatCurrency, direction: "down" },
    roas: { label: "Observed ROAS", group: "Business Value", format: formatRoas, direction: "up" },
    aov: { label: "Average Order Value", group: "Business Value", format: formatCurrency, direction: "up" },
  };

  const SCORECARDS = [
    { key: "spend", label: "Total Spend", icon: "wallet", definition: "Actual media spending within the selected scope." },
    { key: "impressions", label: "Total Impressions", icon: "eye", definition: "Total number of recorded ad impressions." },
    { key: "purchases", label: "Total Purchases", icon: "bag", definition: "Recorded purchases generated within the selected scope." },
    { key: "sessions", label: "Total Sessions", icon: "session", definition: "Recorded website or app sessions associated with campaign traffic." },
    { key: "revenue", label: "Total Revenue", icon: "revenue", definition: "Observed revenue recorded for the selected campaigns." },
    { key: "roas", label: "Observed ROAS", icon: "trend", definition: "Observed revenue divided by actual media spend; this is not incremental ROAS." },
    { key: "activeCampaigns", label: "Active Campaigns", icon: "campaign", definition: "Distinct campaigns with recorded activity in the selected period." },
  ];

  const ICONS = {
    wallet: '<svg viewBox="0 0 24 24"><path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M3 12s3.2-5.5 9-5.5S21 12 21 12s-3.2 5.5-9 5.5S3 12 3 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    session: '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3V5Z"/><path d="M8 9h8m-8 4h5"/></svg>',
    revenue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 8.5h-3.2a2 2 0 0 0 0 4h1.4a2 2 0 0 1 0 4H9.5M12 6.5v11"/></svg>',
    trend: '<svg viewBox="0 0 24 24"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>',
    campaign: '<svg viewBox="0 0 24 24"><path d="m4 14 11-5v10L4 14Z"/><path d="M15 11.5c3 0 5-1.5 5-3.5v12c0-2-2-3.5-5-3.5M6 15l1.5 5h3L9 15.8"/></svg>',
  };

  const state = {
    filters: {
      product: "All",
      mediaPlan: "All",
      funnel: "All",
      channel: "All",
      placement: "All",
      campaign: "All",
    },
    dateStart: "2026-04-03",
    dateEnd: "2026-08-24",
    metric: "impressions",
    granularity: "daily",
    compare: true,
    trendObjective: "All",
    trendChannels: new Set(),
    trendChannelsCustomized: false,
    learningObjective: "Conversion",
    learningMetric: "roas",
    tableSearch: "",
    tableSort: { key: "spend", direction: "desc" },
    tablePage: 1,
  };

  const elements = {
    status: document.querySelector("[data-dashboard-status]"),
    scorecards: document.querySelector("[data-scorecards]"),
    chips: document.querySelector("[data-filter-chips]"),
    trendMetric: document.querySelector("[data-trend-metric]"),
    trendObjective: document.querySelector("[data-trend-objective]"),
    trendChannelControl: document.querySelector("[data-trend-channel-control]"),
    trendChannelTrigger: document.querySelector("[data-trend-channel-trigger]"),
    trendChannelLabel: document.querySelector("[data-trend-channel-label]"),
    trendChannelMenu: document.querySelector("[data-trend-channel-menu]"),
    trendChannelAll: document.querySelector("[data-trend-channel-all]"),
    trendChannelOptions: document.querySelector("[data-trend-channel-options]"),
    trendSummary: document.querySelector("[data-trend-summary]"),
    trendChart: document.querySelector("[data-trend-chart]"),
    trendLegend: document.querySelector("[data-trend-legend]"),
    compareToggle: document.querySelector("[data-compare-toggle]"),
    funnel: document.querySelector("[data-funnel]"),
    pacing: document.querySelector("[data-budget-pacing]"),
    channels: document.querySelector("[data-channel-comparison]"),
    clearChannel: document.querySelector("[data-clear-channel]"),
    learningMetric: document.querySelector("[data-learning-metric]"),
    learningObjective: document.querySelector("[data-learning-objective]"),
    learningDescription: document.querySelector("[data-learning-description]"),
    efficiency: document.querySelector("[data-efficiency-map]"),
    tableBody: document.querySelector("[data-performance-table]"),
    tableCount: document.querySelector("[data-table-count]"),
    pagination: document.querySelector("[data-pagination]"),
    tableSearch: document.querySelector("[data-table-search]"),
    signals: document.querySelector("[data-signals]"),
  };

  let dataset;
  let campaigns = [];
  let campaignById = new Map();
  let rows = [];
  let currentRows = [];
  let previousRows = [];
  let currentSummary = createSummary();
  let previousSummary = createSummary();
  let currentCampaignSummary = [];
  let trendContext = null;
  let efficiencyContext = null;

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

  function formatDecimal(value, digits) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number.isFinite(value) ? value : 0);
  }

  function compactNumber(value, digits = 1) {
    const absolute = Math.abs(value);
    if (absolute >= 1e9) return formatDecimal(value / 1e9, digits) + "B";
    if (absolute >= 1e6) return formatDecimal(value / 1e6, digits) + "M";
    if (absolute >= 1e3) return formatDecimal(value / 1e3, digits) + "K";
    return formatDecimal(value, value < 100 ? 1 : 0);
  }

  function formatCurrency(value) {
    const absolute = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (absolute >= 1e9) return sign + "Rp" + formatDecimal(absolute / 1e9, 2) + "B";
    if (absolute >= 1e6) return sign + "Rp" + formatDecimal(absolute / 1e6, 1) + "M";
    if (absolute >= 1e3) return sign + "Rp" + formatDecimal(absolute / 1e3, 1) + "K";
    return sign + "Rp" + formatDecimal(absolute, 0);
  }

  function formatCount(value) {
    return compactNumber(value, value >= 1e6 ? 2 : 1);
  }

  function formatPercent(value) {
    return formatDecimal(value, value >= 10 ? 1 : 2) + "%";
  }

  function formatRoas(value) {
    return formatDecimal(value, 2) + "x";
  }

  function formatAxis(value, metricKey) {
    if (["spend", "revenue", "cpm", "cpv", "cpc", "cps", "cpa", "aov"].includes(metricKey)) {
      return formatCurrency(value);
    }
    if (["ctr", "conversionRate"].includes(metricKey)) return formatPercent(value);
    if (metricKey === "roas") return formatRoas(value);
    return compactNumber(value, 1);
  }

  function formatDate(isoDate) {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(isoDate + "T00:00:00Z"));
  }

  function formatPeriodLabel(key, granularity) {
    if (granularity === "monthly") {
      return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" })
        .format(new Date(key + "-01T00:00:00Z"));
    }
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" })
      .format(new Date(key + "T00:00:00Z"));
  }

  function parseDate(isoDate) {
    return new Date(isoDate + "T00:00:00Z");
  }

  function toIsoDate(dateValue) {
    return dateValue.toISOString().slice(0, 10);
  }

  function addDays(dateValue, days) {
    const result = new Date(dateValue);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  function daysInclusive(start, end) {
    return Math.round((parseDate(end) - parseDate(start)) / 86400000) + 1;
  }

  function createSummary() {
    return {
      spend: 0,
      impressions: 0,
      videoViews: 0,
      clicks: 0,
      sessions: 0,
      purchases: 0,
      revenue: 0,
      campaignIds: new Set(),
      activeCampaigns: 0,
      ctr: 0,
      conversionRate: 0,
      cpm: 0,
      cpv: 0,
      cpc: 0,
      cps: 0,
      cpa: 0,
      roas: 0,
      aov: 0,
    };
  }

  function finalizeSummary(summary) {
    summary.activeCampaigns = summary.campaignIds.size;
    summary.ctr = safeDivide(summary.clicks, summary.impressions) * 100;
    summary.conversionRate = safeDivide(summary.purchases, summary.sessions) * 100;
    summary.cpm = safeDivide(summary.spend, summary.impressions) * 1000;
    summary.cpv = safeDivide(summary.spend, summary.videoViews);
    summary.cpc = safeDivide(summary.spend, summary.clicks);
    summary.cps = safeDivide(summary.spend, summary.sessions);
    summary.cpa = safeDivide(summary.spend, summary.purchases);
    summary.roas = safeDivide(summary.revenue, summary.spend);
    summary.aov = safeDivide(summary.revenue, summary.purchases);
    return summary;
  }

  function summarize(inputRows) {
    const summary = createSummary();
    inputRows.forEach((row) => {
      summary.spend += row.spend;
      summary.impressions += row.impressions;
      summary.videoViews += row.videoViews;
      summary.clicks += row.clicks;
      summary.sessions += row.sessions;
      summary.purchases += row.purchases;
      summary.revenue += row.revenue;
      summary.campaignIds.add(row.campaignId);
    });
    return finalizeSummary(summary);
  }

  function getPreviousRange() {
    const duration = daysInclusive(state.dateStart, state.dateEnd);
    const previousEnd = addDays(parseDate(state.dateStart), -1);
    const previousStart = addDays(previousEnd, -(duration - 1));
    return { start: toIsoDate(previousStart), end: toIsoDate(previousEnd) };
  }

  function rowMatchesDimension(row, key, value) {
    if (value === "All") return true;
    const campaign = campaignById.get(row.campaignId);
    const definition = FILTERS.find((item) => item.key === key);
    return campaign && definition && campaign[definition.field] === value;
  }

  function filterRows(range, excludedFilter) {
    return rows.filter((row) => {
      if (row.date < range.start || row.date > range.end) return false;
      return FILTERS.every((definition) => {
        if (definition.key === excludedFilter) return true;
        return rowMatchesDimension(row, definition.key, state.filters[definition.key]);
      });
    });
  }

  function aggregateByTime(inputRows, granularity) {
    const grouped = new Map();
    inputRows.forEach((row) => {
      const key = granularity === "monthly" ? row.date.slice(0, 7) : row.date;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, groupRows]) => ({ key, summary: summarize(groupRows) }));
  }

  function aggregateCampaigns(inputRows) {
    const grouped = new Map();
    inputRows.forEach((row) => {
      if (!grouped.has(row.campaignId)) grouped.set(row.campaignId, []);
      grouped.get(row.campaignId).push(row);
    });
    return Array.from(grouped.entries()).map(([campaignId, groupRows]) => {
      const campaign = campaignById.get(campaignId);
      return Object.assign({}, campaign, summarize(groupRows));
    });
  }

  function aggregateByChannel(inputRows) {
    const grouped = new Map();
    inputRows.forEach((row) => {
      const campaign = campaignById.get(row.campaignId);
      if (!campaign) return;
      if (!grouped.has(campaign.channel)) grouped.set(campaign.channel, []);
      grouped.get(campaign.channel).push(row);
    });
    return Array.from(grouped.entries()).map(([channel, groupRows]) => ({
      channel,
      summary: summarize(groupRows),
    }));
  }

  function metricValue(summary, key) {
    return Number(summary[key]) || 0;
  }

  function deltaPercent(current, previous) {
    if (!previous) return current ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function deltaClass(metricKey, delta) {
    const direction = metricKey === "activeCampaigns" ? "neutral" : METRICS[metricKey].direction;
    if (direction === "neutral" || Math.abs(delta) < 0.05) return "neutral";
    const isPositive = direction === "down" ? delta < 0 : delta > 0;
    return isPositive ? "positive" : "negative";
  }

  function metricFormatter(metricKey) {
    if (metricKey === "activeCampaigns") return (value) => formatDecimal(value, 0);
    return METRICS[metricKey].format;
  }

  function sparklinePath(values) {
    if (!values.length) return "";
    const width = 52;
    const height = 15;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum || 1;
    return values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / span) * height;
      return (index ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
    }).join(" ");
  }

  function setupMetricSelect() {
    const groups = ["Delivery", "Traffic", "Conversion", "Cost Efficiency", "Business Value"];
    elements.trendMetric.innerHTML = groups.map((group) => {
      const options = Object.entries(METRICS)
        .filter(([, metric]) => metric.group === group)
        .map(([key, metric]) => '<option value="' + key + '">' + escapeHtml(metric.label) + "</option>")
        .join("");
      return '<optgroup label="' + escapeHtml(group) + '">' + options + "</optgroup>";
    }).join("");
    elements.trendMetric.value = state.metric;
  }

  function renderFilterOptions() {
    let eligible = campaigns.slice();
    FILTERS.forEach((definition) => {
      const select = document.querySelector('[data-filter="' + definition.key + '"]');
      const values = Array.from(new Set(eligible.map((campaign) => campaign[definition.field]))).sort();
      if (state.filters[definition.key] !== "All" && !values.includes(state.filters[definition.key])) {
        state.filters[definition.key] = "All";
      }

      const allLabel = definition.key === "campaign"
        ? definition.all + " (" + values.length + ")"
        : definition.all;
      select.innerHTML = '<option value="All">' + escapeHtml(allLabel) + "</option>" +
        values.map((value) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>").join("");
      select.value = state.filters[definition.key];

      if (state.filters[definition.key] !== "All") {
        eligible = eligible.filter((campaign) => campaign[definition.field] === state.filters[definition.key]);
      }
    });

    document.querySelector('[data-filter="dateStart"]').value = state.dateStart;
    document.querySelector('[data-filter="dateEnd"]').value = state.dateEnd;
  }

  function renderFilterChips() {
    const chips = [];
    if (state.dateStart !== dataset.meta.defaultStart || state.dateEnd !== dataset.meta.defaultEnd) {
      chips.push({ key: "dateRange", label: "Date", value: formatDate(state.dateStart) + " – " + formatDate(state.dateEnd) });
    }
    FILTERS.forEach((definition) => {
      const value = state.filters[definition.key];
      if (value !== "All") chips.push({ key: definition.key, label: definition.label, value });
    });

    if (!chips.length) {
      elements.chips.innerHTML = '<span class="empty-chip">No additional filters</span>';
      return;
    }

    elements.chips.innerHTML = chips.map((chip) =>
      '<span class="filter-chip"><strong>' + escapeHtml(chip.label) + ':</strong> ' +
      escapeHtml(chip.value) +
      '<button type="button" aria-label="Remove ' + escapeHtml(chip.label) + ' filter" data-chip-key="' +
      escapeHtml(chip.key) + '">×</button></span>'
    ).join("");
  }

  function getAvailableTrendObjectives() {
    const available = new Set(currentRows.map((row) => {
      const campaign = campaignById.get(row.campaignId);
      return campaign ? campaign.funnel : null;
    }).filter(Boolean));
    return CAMPAIGN_OBJECTIVES.filter((objective) => available.has(objective));
  }

  function renderTrendObjectiveControl() {
    const available = getAvailableTrendObjectives();
    if (state.trendObjective !== "All" && !available.includes(state.trendObjective)) {
      state.trendObjective = "All";
      state.trendChannelsCustomized = false;
    }
    elements.trendObjective.innerHTML = '<option value="All">All objectives</option>' +
      available.map((objective) => '<option value="' + escapeHtml(objective) + '">' +
        escapeHtml(objective) + "</option>").join("");
    elements.trendObjective.value = state.trendObjective;
  }

  function filterRowsByTrendObjective(inputRows) {
    if (state.trendObjective === "All") return inputRows;
    return inputRows.filter((row) => {
      const campaign = campaignById.get(row.campaignId);
      return campaign && campaign.funnel === state.trendObjective;
    });
  }

  function getAvailableTrendChannels() {
    const available = new Set(filterRowsByTrendObjective(currentRows).map((row) => {
      const campaign = campaignById.get(row.campaignId);
      return campaign ? campaign.channel : null;
    }).filter(Boolean));
    return Object.keys(CHANNEL_COLORS).filter((channel) => available.has(channel));
  }

  function getSelectedTrendChannels() {
    const available = getAvailableTrendChannels();
    if (!state.trendChannelsCustomized) return available;
    let selected = available.filter((channel) => state.trendChannels.has(channel));
    if (!selected.length && state.trendChannels.size && available.length) {
      state.trendChannels = new Set(available);
      selected = available;
    }
    return selected;
  }

  function renderTrendChannelControl() {
    const available = getAvailableTrendChannels();
    if (!state.trendChannelsCustomized) state.trendChannels = new Set(available);
    const selected = getSelectedTrendChannels();
    const allSelected = available.length > 0 && selected.length === available.length;

    if (!selected.length) elements.trendChannelLabel.textContent = "No channels";
    else if (allSelected && available.length > 1) elements.trendChannelLabel.textContent = "All channels";
    else if (allSelected) elements.trendChannelLabel.textContent = available[0];
    else if (selected.length === 1) elements.trendChannelLabel.textContent = selected[0];
    else elements.trendChannelLabel.textContent = selected.length + " channels";

    elements.trendChannelAll.checked = allSelected;
    elements.trendChannelAll.indeterminate = selected.length > 0 && !allSelected;
    elements.trendChannelAll.disabled = !available.length;
    elements.trendChannelOptions.innerHTML = available.map((channel) =>
      '<label class="channel-check-row" style="--option-color:' + CHANNEL_COLORS[channel] + '">' +
      '<input type="checkbox" data-trend-channel-value="' + escapeHtml(channel) + '"' +
      (selected.includes(channel) ? " checked" : "") + "><span>" + escapeHtml(channel) +
      '</span><i class="channel-option-dot" aria-hidden="true"></i></label>'
    ).join("");
  }

  function closeTrendChannelMenu() {
    elements.trendChannelMenu.hidden = true;
    elements.trendChannelTrigger.setAttribute("aria-expanded", "false");
  }

  function filterRowsByTrendScope(inputRows, selectedChannels) {
    const selected = new Set(selectedChannels);
    return inputRows.filter((row) => {
      const campaign = campaignById.get(row.campaignId);
      return campaign && selected.has(campaign.channel) &&
        (state.trendObjective === "All" || campaign.funnel === state.trendObjective);
    });
  }

  function renderTrendLegend(selectedChannels, aggregateAll) {
    if (!selectedChannels.length) {
      elements.trendLegend.innerHTML = "";
      return;
    }
    const channels = aggregateAll
      ? '<span><i class="channel-legend-line aggregate"></i>All channels · aggregated</span>'
      : selectedChannels.map((channel) =>
        '<span><i class="channel-legend-line" style="--legend-color:' + CHANNEL_COLORS[channel] + '"></i>' +
        escapeHtml(channel) + "</span>"
      ).join("");
    const periods = '<i class="trend-legend-divider" aria-hidden="true"></i>' +
      '<span><i class="period-legend-line"></i>Current</span>' +
      (state.compare ? '<span><i class="period-legend-line previous"></i>Previous</span>' : "");
    elements.trendLegend.innerHTML = channels + periods;
  }

  function renderScorecards() {
    const daily = aggregateByTime(currentRows, "daily");
    const recent = daily.slice(-18);
    elements.scorecards.innerHTML = SCORECARDS.map((card) => {
      const currentValue = metricValue(currentSummary, card.key);
      const previousValue = metricValue(previousSummary, card.key);
      const delta = deltaPercent(currentValue, previousValue);
      const classification = deltaClass(card.key, delta);
      const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "—";
      const values = recent.map((item) => metricValue(item.summary, card.key));
      const formatter = metricFormatter(card.key);
      const tag = card.key === "activeCampaigns" ? "article" : "button";
      const interaction = card.key === "activeCampaigns"
        ? ""
        : ' type="button" data-scorecard-metric="' + card.key + '" aria-label="Show ' + escapeHtml(card.label) + ' trend"';
      const active = state.metric === card.key ? " active" : "";
      return "<" + tag + ' class="scorecard' + active + '" title="' + escapeHtml(card.definition) + '"' + interaction + ">" +
        '<div class="scorecard-top"><span class="scorecard-label">' + escapeHtml(card.label) + "</span>" +
        '<span class="scorecard-icon" aria-hidden="true">' + ICONS[card.icon] + "</span></div>" +
        '<div class="scorecard-value">' + escapeHtml(formatter(currentValue)) + "</div>" +
        '<div class="scorecard-footer"><span class="metric-delta ' + classification + '">' +
        arrow + " " + formatDecimal(Math.abs(delta), 1) + "%</span>" +
        '<svg class="sparkline" viewBox="0 0 52 15" aria-hidden="true"><path d="' + sparklinePath(values) + '"/></svg>' +
        '<span class="comparison-label">vs previous period</span></div>' +
        "</" + tag + ">";
    }).join("");
  }

  function buildTrendSeries(inputRows, selectedChannels, aggregateAll) {
    if (aggregateAll) {
      return [{
        channel: "All channels",
        color: "#ec0a68",
        aggregate: true,
        values: aggregateByTime(inputRows, state.granularity).map((item) => ({
          key: item.key,
          value: metricValue(item.summary, state.metric),
        })),
      }];
    }
    const grouped = new Map(selectedChannels.map((channel) => [channel, []]));
    inputRows.forEach((row) => {
      const campaign = campaignById.get(row.campaignId);
      if (campaign && grouped.has(campaign.channel)) grouped.get(campaign.channel).push(row);
    });
    return selectedChannels.map((channel) => ({
      channel,
      color: CHANNEL_COLORS[channel],
      aggregate: false,
      values: aggregateByTime(grouped.get(channel), state.granularity).map((item) => ({
        key: item.key,
        value: metricValue(item.summary, state.metric),
      })),
    }));
  }

  function renderTrend() {
    const metric = METRICS[state.metric];
    const availableChannels = getAvailableTrendChannels();
    const selectedChannels = getSelectedTrendChannels();
    const aggregateAll = availableChannels.length > 1 && selectedChannels.length === availableChannels.length;
    const trendCurrentRows = filterRowsByTrendScope(currentRows, selectedChannels);
    const trendPreviousRows = filterRowsByTrendScope(previousRows, selectedChannels);
    const trendCurrentSummary = summarize(trendCurrentRows);
    const trendPreviousSummary = summarize(trendPreviousRows);
    const currentSeries = buildTrendSeries(trendCurrentRows, selectedChannels, aggregateAll);
    const previousSeries = buildTrendSeries(trendPreviousRows, selectedChannels, aggregateAll);
    const currentValue = metricValue(trendCurrentSummary, state.metric);
    const previousValue = metricValue(trendPreviousSummary, state.metric);
    const delta = deltaPercent(currentValue, previousValue);
    const classification = deltaClass(state.metric, delta);
    const directionWord = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
    const availableCount = availableChannels.length;
    const focusLabel = !selectedChannels.length
      ? "No channels selected"
      : aggregateAll
        ? "All channels · aggregated"
        : selectedChannels.length === 1
          ? selectedChannels[0]
          : selectedChannels.length + " of " + availableCount + " channels";
    const objectiveLabel = state.trendObjective === "All" ? "All objectives" : state.trendObjective;

    elements.trendSummary.innerHTML =
      '<div class="trend-stat"><span>Selected metric</span><strong>' + escapeHtml(metric.format(currentValue)) + "</strong></div>" +
      '<div class="trend-stat"><span>Previous period</span><strong>' + escapeHtml(metric.format(previousValue)) + "</strong></div>" +
      '<div class="trend-stat"><span>Period movement</span><strong class="' +
      (classification === "positive" ? "good" : classification === "negative" ? "bad" : "") + '">' +
      escapeHtml(directionWord.charAt(0).toUpperCase() + directionWord.slice(1)) + " " +
      formatDecimal(Math.abs(delta), 1) + "%</strong></div>" +
      '<div class="trend-stat"><span>Channel focus</span><strong>' + escapeHtml(focusLabel) + "</strong></div>" +
      '<div class="trend-stat"><span>Campaign objective</span><strong>' + escapeHtml(objectiveLabel) + "</strong></div>";

    renderTrendLegend(selectedChannels, aggregateAll);
    renderTrendSvg(currentSeries, previousSeries, selectedChannels, aggregateAll);
  }

  function renderTrendSvg(currentSeries, previousSeries, selectedChannels, aggregateAll) {
    const axisKeys = Array.from(new Set(currentSeries.flatMap((series) => series.values.map((item) => item.key)))).sort();
    if (!selectedChannels.length || !axisKeys.length) {
      const message = selectedChannels.length
        ? "No trend data available for the current filters."
        : "Select at least one channel to display the trend.";
      elements.trendChart.innerHTML = '<div class="empty-visual">' + escapeHtml(message) + "</div>";
      trendContext = null;
      return;
    }

    const width = 1120;
    const height = 330;
    const margin = { top: 24, right: 24, bottom: 44, left: 82 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const allCurrentValues = currentSeries.flatMap((series) => series.values.map((item) => item.value));
    const allPreviousValues = state.compare
      ? previousSeries.flatMap((series) => series.values.map((item) => item.value))
      : [];
    const maximum = Math.max(...allCurrentValues, ...allPreviousValues, 1) * 1.08;
    const xPosition = (index, length) => margin.left + (length === 1 ? plotWidth / 2 : (index / (length - 1)) * plotWidth);
    const yPosition = (value) => margin.top + plotHeight - (value / maximum) * plotHeight;
    const prepareSeries = (seriesList) => seriesList.map((series) => ({
      channel: series.channel,
      color: series.color,
      aggregate: series.aggregate,
      points: series.values.map((item, index) => ({
        x: xPosition(index, series.values.length),
        y: yPosition(item.value),
        key: item.key,
        value: item.value,
      })),
    }));
    const preparedCurrent = prepareSeries(currentSeries);
    const preparedPrevious = prepareSeries(previousSeries);
    const path = (points) => points.map((point, index) =>
      (index ? "L" : "M") + point.x.toFixed(2) + " " + point.y.toFixed(2)
    ).join(" ");
    const baseline = margin.top + plotHeight;
    const areaPath = (points) => points.length
      ? "M" + points[0].x.toFixed(2) + " " + baseline.toFixed(2) + " L" +
        points.map((point) => point.x.toFixed(2) + " " + point.y.toFixed(2)).join(" L") +
        " L" + points[points.length - 1].x.toFixed(2) + " " + baseline.toFixed(2) + " Z"
      : "";

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const value = maximum * (index / 4);
      const y = yPosition(value);
      return '<line class="chart-grid-line" x1="' + margin.left + '" y1="' + y + '" x2="' +
        (width - margin.right) + '" y2="' + y + '"/><text class="chart-axis-label" x="' +
        (margin.left - 12) + '" y="' + (y + 4) + '" text-anchor="end">' +
        escapeHtml(formatAxis(value, state.metric)) + "</text>";
    }).join("");

    const labelIndexes = [];
    const labelCount = Math.min(axisKeys.length, 6);
    for (let index = 0; index < labelCount; index += 1) {
      labelIndexes.push(Math.round(index * (axisKeys.length - 1) / Math.max(labelCount - 1, 1)));
    }
    const xTicks = Array.from(new Set(labelIndexes)).map((index) =>
      '<text class="chart-axis-label" x="' + xPosition(index, axisKeys.length) + '" y="' + (height - 14) +
      '" text-anchor="middle">' + escapeHtml(formatPeriodLabel(axisKeys[index], state.granularity)) + "</text>"
    ).join("");

    const gradientDefinitions = aggregateAll
      ? '<defs><linearGradient id="trend-all-line-gradient" gradientUnits="userSpaceOnUse" x1="' + margin.left +
        '" y1="0" x2="' + (width - margin.right) + '" y2="0">' +
        '<stop offset="0%" stop-color="' + CHANNEL_COLORS.Google + '"/><stop offset="34%" stop-color="' +
        CHANNEL_COLORS.Meta + '"/><stop offset="68%" stop-color="' + CHANNEL_COLORS.TikTok +
        '"/><stop offset="100%" stop-color="' + CHANNEL_COLORS.X + '"/></linearGradient>' +
        '<linearGradient id="trend-all-area-gradient" gradientUnits="userSpaceOnUse" x1="' + margin.left +
        '" y1="0" x2="' + (width - margin.right) + '" y2="0">' +
        '<stop offset="0%" stop-color="' + CHANNEL_COLORS.Google + '"/><stop offset="34%" stop-color="' +
        CHANNEL_COLORS.Meta + '"/><stop offset="68%" stop-color="' + CHANNEL_COLORS.TikTok +
        '"/><stop offset="100%" stop-color="' + CHANNEL_COLORS.X + '"/></linearGradient>' +
        '<linearGradient id="trend-all-fade-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="' + margin.top +
        '" x2="0" y2="' + baseline + '"><stop offset="0%" stop-color="#fff" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
        '<mask id="trend-all-area-mask"><rect x="' + margin.left + '" y="' + margin.top + '" width="' +
        plotWidth + '" height="' + plotHeight + '" fill="url(#trend-all-fade-gradient)"/></mask></defs>'
      : "";
    const aggregateArea = aggregateAll && preparedCurrent[0]
      ? '<path class="trend-all-area" d="' + areaPath(preparedCurrent[0].points) +
        '" fill="url(#trend-all-area-gradient)" mask="url(#trend-all-area-mask)"/>'
      : "";
    const previousPaths = state.compare ? preparedPrevious.map((series) =>
      '<path class="' + (aggregateAll ? "trend-all-previous" : "trend-channel-previous") + '" d="' +
      path(series.points) + '"' + (aggregateAll ? "" : ' style="stroke:' + series.color + '"') + '/>'
    ).join("") : "";
    const currentPaths = preparedCurrent.map((series) =>
      '<path class="' + (aggregateAll ? "trend-all-current" : "trend-channel-current") + '" d="' +
      path(series.points) + '"' + (aggregateAll ? "" : ' style="stroke:' + series.color + '"') + '/>'
    ).join("");
    const dots = !aggregateAll && axisKeys.length <= 14 ? preparedCurrent.map((series) =>
      series.points.map((point) => '<circle class="trend-channel-point" cx="' + point.x + '" cy="' + point.y +
        '" r="3.2" style="stroke:' + series.color + '"/>').join("")
    ).join("") : "";

    elements.trendChart.innerHTML =
      '<svg class="trend-svg" data-trend-svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' +
      escapeHtml(METRICS[state.metric].label + (aggregateAll ? " aggregated trend for all channels" : " trend by selected channel")) + '">' +
      gradientDefinitions + yTicks + xTicks + aggregateArea + previousPaths + currentPaths + dots +
      '<line class="chart-crosshair" data-chart-crosshair x1="0" x2="0" y1="' + margin.top +
      '" y2="' + (margin.top + plotHeight) + '" opacity="0"/>' +
      '<rect data-chart-hit x="' + margin.left + '" y="' + margin.top + '" width="' + plotWidth +
      '" height="' + plotHeight + '" fill="transparent" style="cursor:crosshair"/>' +
      '</svg><div class="chart-tooltip" data-chart-tooltip hidden></div>';

    trendContext = {
      currentSeries: preparedCurrent,
      previousSeries: preparedPrevious,
      axisKeys,
      width,
      height,
      margin,
      plotWidth,
    };
    bindTrendInteraction();
  }

  function bindTrendInteraction() {
    const svg = elements.trendChart.querySelector("[data-trend-svg]");
    const crosshair = elements.trendChart.querySelector("[data-chart-crosshair]");
    const tooltip = elements.trendChart.querySelector("[data-chart-tooltip]");
    if (!svg || !trendContext) return;

    const locateIndex = (event) => {
      const bounds = svg.getBoundingClientRect();
      const viewX = ((event.clientX - bounds.left) / bounds.width) * trendContext.width;
      const ratio = (viewX - trendContext.margin.left) / trendContext.plotWidth;
      return Math.max(0, Math.min(trendContext.axisKeys.length - 1,
        Math.round(ratio * Math.max(trendContext.axisKeys.length - 1, 1))));
    };
    const pointAt = (series, index) => {
      if (!series || !series.points.length) return null;
      const mappedIndex = Math.round(index * (series.points.length - 1) / Math.max(trendContext.axisKeys.length - 1, 1));
      return series.points[mappedIndex];
    };

    svg.addEventListener("pointermove", (event) => {
      const index = locateIndex(event);
      const x = trendContext.margin.left + (trendContext.axisKeys.length === 1
        ? trendContext.plotWidth / 2
        : (index / (trendContext.axisKeys.length - 1)) * trendContext.plotWidth);
      const currentPoints = trendContext.currentSeries.map((series) => pointAt(series, index)).filter(Boolean);
      const topPoint = currentPoints.slice().sort((a, b) => a.y - b.y)[0];
      const bounds = svg.getBoundingClientRect();
      const left = Math.min((x / trendContext.width) * bounds.width + 14, elements.trendChart.clientWidth - 230);
      const top = Math.max(((topPoint ? topPoint.y : trendContext.margin.top) / trendContext.height) * bounds.height - 10, 6);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("opacity", "1");
      tooltip.hidden = false;
      tooltip.style.left = Math.max(6, left) + "px";
      tooltip.style.top = top + "px";
      const channelRows = trendContext.currentSeries.map((series) => {
        const current = pointAt(series, index);
        const previousSeries = trendContext.previousSeries.find((item) => item.channel === series.channel);
        const previous = pointAt(previousSeries, index);
        return '<div class="tooltip-channel-row"><i class="tooltip-channel-dot' +
          (series.aggregate ? " aggregate" : "") + '" style="--tooltip-color:' + series.color +
          '"></i><span>' + escapeHtml(series.channel) + '</span><b>' +
          escapeHtml(METRICS[state.metric].format(current ? current.value : 0)) + '</b>' +
          (state.compare && previous
            ? '<small>Previous: ' + escapeHtml(METRICS[state.metric].format(previous.value)) + '</small>'
            : "") + '</div>';
      }).join("");
      tooltip.innerHTML = '<strong>' + escapeHtml(formatPeriodLabel(trendContext.axisKeys[index], state.granularity)) +
        "</strong>" + channelRows + '<span class="previous-value">Click to filter this period</span>';
    });

    svg.addEventListener("pointerleave", () => {
      crosshair.setAttribute("opacity", "0");
      tooltip.hidden = true;
    });

    svg.addEventListener("click", (event) => {
      const index = locateIndex(event);
      const selectedKey = trendContext.axisKeys[index];
      if (state.granularity === "daily") {
        state.dateStart = selectedKey;
        state.dateEnd = selectedKey;
      } else {
        const monthStart = selectedKey + "-01";
        const nextMonth = addDays(new Date(selectedKey + "-01T00:00:00Z"), 32);
        const endOfMonth = addDays(new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 1)), -1);
        state.dateStart = monthStart < dataset.meta.defaultStart ? dataset.meta.defaultStart : monthStart;
        state.dateEnd = toIsoDate(endOfMonth) > dataset.meta.defaultEnd ? dataset.meta.defaultEnd : toIsoDate(endOfMonth);
      }
      state.tablePage = 1;
      renderAll();
    });
  }

  function renderFunnel() {
    const stages = [
      { label: "Impressions", value: currentSummary.impressions, rate: null, rateLabel: "Campaign reach" },
      { label: "Link Clicks", value: currentSummary.clicks, rate: currentSummary.ctr, rateLabel: "CTR" },
      { label: "Sessions", value: currentSummary.sessions, rate: safeDivide(currentSummary.sessions, currentSummary.clicks) * 100, rateLabel: "Click-to-session" },
      { label: "Purchases", value: currentSummary.purchases, rate: currentSummary.conversionRate, rateLabel: "Session conversion" },
    ];
    const maximum = Math.max(currentSummary.impressions, 1);
    elements.funnel.innerHTML = stages.map((stage) => {
      const width = Math.max(7, Math.sqrt(stage.value / maximum) * 100);
      return '<div class="funnel-stage"><div class="funnel-label"><span>' +
        escapeHtml(stage.label) + "</span><strong>" + escapeHtml(formatCount(stage.value)) +
        '</strong></div><div class="funnel-track"><div class="funnel-fill" style="width:' +
        width.toFixed(2) + '%"></div></div><div class="funnel-rate">' +
        (stage.rate === null
          ? "<strong>100%</strong> " + escapeHtml(stage.rateLabel)
          : "<strong>" + escapeHtml(formatPercent(stage.rate)) + "</strong> " + escapeHtml(stage.rateLabel)) +
        "</div></div>";
    }).join("");
  }

  function renderBudgetPacing() {
    const selectedCampaignIds = currentSummary.campaignIds;
    const totalDefaultDays = daysInclusive(dataset.meta.defaultStart, dataset.meta.defaultEnd);
    const overlapStart = state.dateStart < dataset.meta.defaultStart ? dataset.meta.defaultStart : state.dateStart;
    const overlapEnd = state.dateEnd > dataset.meta.defaultEnd ? dataset.meta.defaultEnd : state.dateEnd;
    const selectedDays = overlapEnd >= overlapStart ? daysInclusive(overlapStart, overlapEnd) : 0;
    const periodFactor = selectedDays / totalDefaultDays;
    const planned = campaigns
      .filter((campaign) => selectedCampaignIds.has(campaign.id))
      .reduce((sum, campaign) => sum + campaign.plannedBudget * periodFactor, 0);
    const utilization = safeDivide(currentSummary.spend, planned) * 100;
    const variance = currentSummary.spend - planned;
    const status = utilization > 105 ? "Above plan" : utilization < 90 ? "Below plan" : "On pace";
    const statusClass = utilization > 105 ? "over" : "";

    elements.pacing.innerHTML =
      '<div class="pacing-hero"><div class="pacing-value"><span>Budget utilization</span><strong>' +
      escapeHtml(formatPercent(utilization)) + '</strong></div><div class="pacing-status"><span>Status</span><strong class="' +
      statusClass + '">' + escapeHtml(status) + "</strong></div></div>" +
      '<div class="pacing-track"><div class="pacing-fill" style="width:' +
      Math.min(Math.max(utilization, 0), 100).toFixed(2) + '%"></div><span class="pacing-target" aria-hidden="true"></span></div>' +
      '<div class="pacing-breakdown"><div class="pacing-stat"><span>Planned budget</span><strong>' +
      escapeHtml(formatCurrency(planned)) + '</strong></div><div class="pacing-stat"><span>Actual spend</span><strong>' +
      escapeHtml(formatCurrency(currentSummary.spend)) + '</strong></div><div class="pacing-stat"><span>Variance</span><strong>' +
      escapeHtml(formatCurrency(variance)) + '</strong></div><div class="pacing-stat"><span>Campaigns in scope</span><strong>' +
      escapeHtml(formatDecimal(currentSummary.activeCampaigns, 0)) + "</strong></div></div>";
  }

  function formatSignedPoints(value) {
    if (Math.abs(value) < 0.05) return "0.0pp";
    return (value > 0 ? "+" : "−") + formatDecimal(Math.abs(value), 1) + "pp";
  }

  function renderChannelDelta(metricKey, currentValue, previousValue) {
    const delta = deltaPercent(currentValue, previousValue);
    const classification = deltaClass(metricKey, delta);
    const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "—";
    return '<span class="channel-delta ' + classification + '">' + arrow + " " +
      formatDecimal(Math.abs(delta), 1) + "% vs previous</span>";
  }

  function getChannelRole(spendShare, revenueShare, medianSpendShare) {
    const efficiencyIndex = safeDivide(revenueShare, spendShare);
    const highScale = spendShare >= medianSpendShare;
    if (efficiencyIndex >= 1.15 && highScale) {
      return { label: "Core driver", className: "core", description: "High observed outcome efficiency at meaningful scale." };
    }
    if (efficiencyIndex >= 1.15) {
      return { label: "Scale test", className: "scale", description: "Strong observed efficiency at lower scale; validate headroom before increasing spend." };
    }
    if (efficiencyIndex <= 0.85 && highScale) {
      return { label: "Optimize", className: "optimize", description: "Meaningful spend scale with an observed revenue-share deficit." };
    }
    if (efficiencyIndex <= 0.85) {
      return { label: "Monitor", className: "monitor", description: "Lower scale and below-index observed revenue share." };
    }
    return { label: "Maintain", className: "maintain", description: "Observed revenue share is broadly aligned with spend share." };
  }

  function renderChannelIdentity(item, badge, detail) {
    return '<span class="channel-card-identity"><span class="channel-name"><i class="channel-mark"></i>' +
      escapeHtml(item.channel) + '</span><span class="channel-role ' + escapeHtml(badge.className) + '" title="' +
      escapeHtml(badge.description) + '">' + escapeHtml(badge.label) + '</span><small>' +
      escapeHtml(detail) + "</small></span>";
  }

  function renderChannelShareBar(label, className, value, share) {
    const accessibleLabel = label + " " + value + ", " + formatPercent(share) + " of total";
    return '<span class="channel-share-row ' + className + '" aria-label="' + escapeHtml(accessibleLabel) +
      '" title="' + escapeHtml(accessibleLabel) + '"><span class="channel-bar-label">' + escapeHtml(label) +
      '</span><span class="channel-bar-track"><span class="channel-bar-fill" style="width:' +
      Math.max(0, Math.min(share, 100)).toFixed(2) + '%"></span></span><span class="channel-bar-value"><strong>' +
      escapeHtml(value) + '</strong><small>Share ' + escapeHtml(formatPercent(share)) + "</small></span></span>";
  }

  function renderBusinessChannel(item, previousSummary, totals, medianSpendShare) {
    const spendShare = safeDivide(item.summary.spend, totals.spend) * 100;
    const purchaseShare = safeDivide(item.summary.purchases, totals.purchases) * 100;
    const revenueShare = safeDivide(item.summary.revenue, totals.revenue) * 100;
    const shareGap = revenueShare - spendShare;
    const gapClass = shareGap > 0.05 ? "positive" : shareGap < -0.05 ? "negative" : "neutral";
    const role = getChannelRole(spendShare, revenueShare, medianSpendShare);
    const color = CHANNEL_COLORS[item.channel] || "#6558ef";
    const selected = state.filters.channel === item.channel ? " selected" : "";
    return '<button class="channel-card business-view' + selected + '" type="button" data-channel-value="' +
      escapeHtml(item.channel) + '" style="--channel-color:' + color + '">' +
      renderChannelIdentity(item, role, "Observed performance") +
      '<span class="channel-share-stack">' +
      renderChannelShareBar("Spend", "spend", formatCurrency(item.summary.spend), spendShare) +
      renderChannelShareBar("Purchases", "purchases", formatCount(item.summary.purchases), purchaseShare) +
      renderChannelShareBar("Revenue", "revenue", formatCurrency(item.summary.revenue), revenueShare) +
      '</span><span class="channel-kpi-grid"><span class="channel-kpi"><small>Observed share gap</small><strong class="' +
      gapClass + '">' + formatSignedPoints(shareGap) + '</strong><em>Revenue share − spend share</em></span>' +
      '<span class="channel-kpi"><small>Observed ROAS</small><strong>' + formatRoas(item.summary.roas) + '</strong>' +
      renderChannelDelta("roas", item.summary.roas, previousSummary.roas) + '</span>' +
      '<span class="channel-kpi"><small>CPA</small><strong>' + formatCurrency(item.summary.cpa) + '</strong>' +
      renderChannelDelta("cpa", item.summary.cpa, previousSummary.cpa) + "</span></span></button>";
  }

  function renderChannels() {
    const selectedRange = { start: state.dateStart, end: state.dateEnd };
    const visibleRows = filterRows(selectedRange);
    const benchmarkRows = filterRows(selectedRange, "channel");
    const previousVisibleRows = filterRows(getPreviousRange());
    const channels = aggregateByChannel(visibleRows).sort((a, b) => b.summary.spend - a.summary.spend);
    const benchmarkChannels = aggregateByChannel(benchmarkRows);
    const previousChannels = new Map(aggregateByChannel(previousVisibleRows)
      .map((item) => [item.channel, item.summary]));
    const totals = summarize(benchmarkRows);
    const spendShares = benchmarkChannels.map((item) => safeDivide(item.summary.spend, totals.spend) * 100);
    const medianSpendShare = median(spendShares);
    elements.clearChannel.hidden = state.filters.channel === "All";

    if (!channels.length) {
      elements.channels.innerHTML = '<div class="empty-visual">No channel comparison is available.</div>';
      return;
    }

    elements.channels.innerHTML = channels.map((item) => {
      const previousSummary = previousChannels.get(item.channel) || createSummary();
      return renderBusinessChannel(item, previousSummary, totals, medianSpendShare);
    }).join("");
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function getLockedLearningObjective() {
    if (state.filters.funnel !== "All") return state.filters.funnel;
    if (state.filters.campaign === "All") return null;
    const campaign = campaigns.find((item) => item.campaign === state.filters.campaign);
    return campaign ? campaign.funnel : null;
  }

  function renderLearningControls() {
    const lockedObjective = getLockedLearningObjective();
    const objective = lockedObjective || state.learningObjective;
    const config = LEARNING_CONFIG[objective] || LEARNING_CONFIG.Conversion;
    state.learningObjective = objective;
    if (!config.metrics.includes(state.learningMetric)) state.learningMetric = config.defaultMetric;

    elements.learningObjective.innerHTML = CAMPAIGN_OBJECTIVES.map((value) =>
      '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + "</option>"
    ).join("");
    elements.learningObjective.value = objective;
    elements.learningObjective.disabled = Boolean(lockedObjective);
    elements.learningObjective.title = lockedObjective
      ? "Controlled by the global Campaign Objective or Campaign filter."
      : "Filter this benchmark to one comparable campaign objective.";

    elements.learningMetric.innerHTML = config.metrics.map((key) =>
      '<option value="' + key + '">' + escapeHtml(METRICS[key].label) + "</option>"
    ).join("");
    elements.learningMetric.value = state.learningMetric;

    const metric = METRICS[state.learningMetric];
    const bubbleMetric = METRICS[config.bubbleMetric];
    const directionNote = metric.direction === "down"
      ? "Lower values are better and are positioned higher on the chart."
      : "Higher values are better.";
    elements.learningDescription.textContent = objective + " campaigns only. Spend is compared with " +
      metric.label + "; bubble size represents " + bubbleMetric.label + ". " + directionNote;

    return { objective, metricKey: state.learningMetric, bubbleKey: config.bubbleMetric };
  }

  function getEfficiencyDiagnosis(item, spendSplit, metricSplit, metricKey, sampleSize) {
    if (sampleSize < 2) {
      return {
        label: "Selected campaign",
        className: "neutral",
        meaning: "At least two campaigns are required for a relative benchmark. Clear the Campaign filter to restore comparison.",
      };
    }
    const highSpend = item.spend >= spendSplit;
    const value = metricValue(item, metricKey);
    const strongPerformance = METRICS[metricKey].direction === "down"
      ? value <= metricSplit
      : value >= metricSplit;
    const metricLabel = METRICS[metricKey].label;
    if (!highSpend && strongPerformance) {
      return {
        label: "Future opportunity",
        className: "opportunity",
        meaning: "Stronger observed " + metricLabel + " at lower spend. Reuse the pattern in a controlled future test before scaling.",
      };
    }
    if (highSpend && strongPerformance) {
      return {
        label: "Winning pattern",
        className: "efficient",
        meaning: "Stronger observed " + metricLabel + " at meaningful spend. Carry the audience, creative, and placement learning into the next cycle.",
      };
    }
    if (!highSpend && !strongPerformance) {
      return {
        label: "Limited impact",
        className: "priority",
        meaning: "Weaker observed " + metricLabel + " at lower spend. Improve the setup before repeating this campaign pattern.",
      };
    }
    return {
      label: "Efficiency review",
      className: "attention",
      meaning: "Weaker observed " + metricLabel + " at meaningful spend. Review targeting, creative, placement, and landing experience before reuse.",
    };
  }

  function showEfficiencyTooltip(point, clientX, clientY) {
    const tooltip = elements.efficiency.querySelector("[data-efficiency-tooltip]");
    if (!tooltip || !efficiencyContext) return;
    const item = efficiencyContext.items.get(point.dataset.campaignValue);
    if (!item) return;
    const diagnosis = getEfficiencyDiagnosis(
      item,
      efficiencyContext.spendSplit,
      efficiencyContext.metricSplit,
      efficiencyContext.metricKey,
      efficiencyContext.sampleSize
    );
    const color = CHANNEL_COLORS[item.channel] || "#6558ef";
    const metric = METRICS[efficiencyContext.metricKey];
    const bubbleMetric = METRICS[efficiencyContext.bubbleKey];
    tooltip.innerHTML = '<strong>' + escapeHtml(item.campaign) + '</strong>' +
      '<div class="efficiency-tooltip-meta"><i style="--tooltip-color:' + color + '"></i>' +
      escapeHtml(item.channel) + ' · ' + escapeHtml(item.funnel) + '</div>' +
      '<div class="efficiency-tooltip-grid"><span>Spend</span><b>' + escapeHtml(formatCurrency(item.spend)) + '</b>' +
      '<span>' + escapeHtml(metric.label) + '</span><b>' + escapeHtml(metric.format(metricValue(item, efficiencyContext.metricKey))) + '</b>' +
      '<span>' + escapeHtml(bubbleMetric.label) + ' · bubble size</span><b>' +
      escapeHtml(bubbleMetric.format(metricValue(item, efficiencyContext.bubbleKey))) + '</b></div>' +
      '<div class="efficiency-diagnosis ' + diagnosis.className + '"><span>' + escapeHtml(diagnosis.label) +
      '</span><p>' + escapeHtml(diagnosis.meaning) + '</p></div>';
    tooltip.hidden = false;

    const wrapRect = elements.efficiency.getBoundingClientRect();
    const pointRect = point.getBoundingClientRect();
    const anchorX = Number.isFinite(clientX) ? clientX : pointRect.left + pointRect.width / 2;
    const anchorY = Number.isFinite(clientY) ? clientY : pointRect.top + pointRect.height / 2;
    const left = Math.min(Math.max(8, anchorX - wrapRect.left + 14), Math.max(8, wrapRect.width - tooltip.offsetWidth - 8));
    let top = anchorY - wrapRect.top - tooltip.offsetHeight - 14;
    if (top < 8) top = anchorY - wrapRect.top + 14;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function bindEfficiencyInteraction() {
    const tooltip = elements.efficiency.querySelector("[data-efficiency-tooltip]");
    const points = elements.efficiency.querySelectorAll("[data-campaign-value]");
    if (!tooltip) return;
    points.forEach((point) => {
      point.addEventListener("pointerenter", (event) => showEfficiencyTooltip(point, event.clientX, event.clientY));
      point.addEventListener("pointermove", (event) => showEfficiencyTooltip(point, event.clientX, event.clientY));
      point.addEventListener("pointerleave", () => { tooltip.hidden = true; });
      point.addEventListener("focus", () => showEfficiencyTooltip(point));
      point.addEventListener("blur", () => { tooltip.hidden = true; });
      point.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setDimensionFilter("campaign", point.dataset.campaignValue);
      });
    });
  }

  function renderEfficiencyMap() {
    const settings = renderLearningControls();
    const metric = METRICS[settings.metricKey];
    const bubbleMetric = METRICS[settings.bubbleKey];
    const items = currentCampaignSummary.filter((item) => {
      const value = metricValue(item, settings.metricKey);
      return item.funnel === settings.objective && Number.isFinite(value) && (metric.direction !== "down" || value > 0);
    });
    if (!items.length) {
      efficiencyContext = null;
      elements.efficiency.innerHTML = '<div class="empty-visual">No ' + escapeHtml(settings.objective) +
        ' campaigns are available for the current filters.</div>';
      return;
    }

    const width = 1120;
    const height = 385;
    const margin = { top: 28, right: 26, bottom: 55, left: 82 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const metricValues = items.map((item) => metricValue(item, settings.metricKey));
    const bubbleValues = items.map((item) => metricValue(item, settings.bubbleKey));
    const maximumSpend = Math.max(...items.map((item) => item.spend), 1) * 1.08;
    const rawMinimumMetric = Math.min(...metricValues);
    const rawMaximumMetric = Math.max(...metricValues);
    const metricPadding = (rawMaximumMetric - rawMinimumMetric || rawMaximumMetric || 1) * 0.12;
    const minimumMetric = Math.max(0, rawMinimumMetric - metricPadding);
    const maximumMetric = rawMaximumMetric + metricPadding;
    const metricSpan = maximumMetric - minimumMetric || 1;
    const maximumBubble = Math.max(...bubbleValues, 1);
    const spendSplit = median(items.map((item) => item.spend));
    const metricSplit = median(metricValues);
    const x = (value) => margin.left + (value / maximumSpend) * plotWidth;
    const y = metric.direction === "down"
      ? (value) => margin.top + ((value - minimumMetric) / metricSpan) * plotHeight
      : (value) => margin.top + plotHeight - ((value - minimumMetric) / metricSpan) * plotHeight;
    const splitX = x(spendSplit);
    const splitY = y(metricSplit);
    efficiencyContext = {
      spendSplit,
      metricSplit,
      metricKey: settings.metricKey,
      bubbleKey: settings.bubbleKey,
      sampleSize: items.length,
      items: new Map(items.map((item) => [item.campaign, item])),
    };

    const diagnoses = items.map((item) =>
      getEfficiencyDiagnosis(item, spendSplit, metricSplit, settings.metricKey, items.length));
    const winningCount = diagnoses.filter((item) => item.className === "efficient").length;
    const reviewCount = diagnoses.filter((item) => item.className === "attention").length;
    const opportunityCount = diagnoses.filter((item) => item.className === "opportunity").length;
    const learningSummary = '<div class="learning-summary" aria-label="Campaign benchmark summary">' +
      '<span class="learning-stat"><small>Campaigns compared</small><strong>' + formatDecimal(items.length, 0) + '</strong></span>' +
      '<span class="learning-stat winning"><small>Winning patterns</small><strong>' + formatDecimal(winningCount, 0) + '</strong></span>' +
      '<span class="learning-stat opportunity"><small>Future opportunities</small><strong>' + formatDecimal(opportunityCount, 0) + '</strong></span>' +
      '<span class="learning-stat attention"><small>Review candidates</small><strong>' + formatDecimal(reviewCount, 0) + '</strong></span>' +
      '<span class="learning-stat benchmark"><small>Median ' + escapeHtml(metric.label) + '</small><strong>' +
      escapeHtml(metric.format(metricSplit)) + '</strong></span></div>';

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const value = minimumMetric + metricSpan * (index / 4);
      const position = y(value);
      return '<line class="chart-grid-line" x1="' + margin.left + '" y1="' + position + '" x2="' +
        (width - margin.right) + '" y2="' + position + '"/><text class="chart-axis-label" x="' +
        (margin.left - 12) + '" y="' + (position + 4) + '" text-anchor="end">' +
        escapeHtml(formatAxis(value, settings.metricKey)) + "</text>";
    }).join("");
    const xTicks = Array.from({ length: 5 }, (_, index) => {
      const value = maximumSpend * (index / 4);
      const position = x(value);
      return '<text class="chart-axis-label" x="' + position + '" y="' + (height - 20) +
        '" text-anchor="middle">' + escapeHtml(formatCurrency(value)) + "</text>";
    }).join("");

    const points = items.map((item) => {
      const bubbleValue = metricValue(item, settings.bubbleKey);
      const metricValueForItem = metricValue(item, settings.metricKey);
      const radius = 4.5 + Math.sqrt(bubbleValue / maximumBubble) * 10;
      const selected = state.filters.campaign === item.campaign ? " selected" : "";
      const color = CHANNEL_COLORS[item.channel] || "#6558ef";
      const diagnosis = getEfficiencyDiagnosis(item, spendSplit, metricSplit, settings.metricKey, items.length);
      const accessibleLabel = item.campaign + ", " + item.channel + ", Campaign objective " + item.funnel +
        ", Spend " + formatCurrency(item.spend) + ", " + metric.label + " " + metric.format(metricValueForItem) +
        ", " + bubbleMetric.label + " " + bubbleMetric.format(bubbleValue) + ", " + diagnosis.label;
      return '<circle class="scatter-point' + selected + '" data-campaign-value="' + escapeHtml(item.campaign) +
        '" cx="' + x(item.spend).toFixed(2) + '" cy="' + y(metricValueForItem).toFixed(2) + '" r="' +
        radius.toFixed(2) + '" style="--point-color:' + color + '" tabindex="0" role="button" aria-describedby="efficiency-tooltip" aria-label="' +
        escapeHtml(accessibleLabel) + '"></circle>';
    }).join("");

    const quadrantLayer = items.length > 1
      ? '<rect class="scatter-quadrant opportunity" x="' + margin.left + '" y="' + margin.top +
        '" width="' + (splitX - margin.left) + '" height="' + (splitY - margin.top) + '"/>' +
        '<rect class="scatter-quadrant attention" x="' + splitX + '" y="' + splitY +
        '" width="' + (width - margin.right - splitX) + '" height="' + (margin.top + plotHeight - splitY) + '"/>' +
        '<line class="chart-grid-line" x1="' + splitX + '" y1="' + margin.top + '" x2="' + splitX +
        '" y2="' + (margin.top + plotHeight) + '" stroke-dasharray="5 5"/>' +
        '<line class="chart-grid-line" x1="' + margin.left + '" y1="' + splitY + '" x2="' +
        (width - margin.right) + '" y2="' + splitY + '" stroke-dasharray="5 5"/>' +
        '<text class="quadrant-label" x="' + (margin.left + 12) + '" y="' + (margin.top + 20) + '">Future opportunity</text>' +
        '<text class="quadrant-label" x="' + (splitX + 12) + '" y="' + (margin.top + 20) + '">Winning pattern</text>' +
        '<text class="quadrant-label" x="' + (margin.left + 12) + '" y="' + (splitY + 20) + '">Limited impact</text>' +
        '<text class="quadrant-label" x="' + (splitX + 12) + '" y="' + (splitY + 20) + '">Efficiency review</text>'
      : "";
    const yAxisLabel = metric.label + (metric.direction === "down" ? " · lower is better" : "");
    elements.efficiency.innerHTML = learningSummary +
      '<svg class="scatter-svg" viewBox="0 0 ' + width + " " + height +
      '" role="img" aria-label="Campaign spend versus ' + escapeHtml(metric.label) + '">' +
      quadrantLayer + yTicks + xTicks + points +
      '<text class="chart-axis-label" x="' + (margin.left + plotWidth / 2) + '" y="' + (height - 2) +
      '" text-anchor="middle">Spend</text>' +
      '<text class="chart-axis-label" transform="translate(18 ' + (margin.top + plotHeight / 2) +
      ') rotate(-90)" text-anchor="middle">' + escapeHtml(yAxisLabel) + '</text></svg>' +
      '<div class="chart-tooltip efficiency-tooltip" id="efficiency-tooltip" data-efficiency-tooltip role="tooltip" hidden></div>';
    bindEfficiencyInteraction();
  }

  function tableValue(item, key) {
    return item[key];
  }

  function renderTable() {
    const query = state.tableSearch.trim().toLowerCase();
    let items = currentCampaignSummary.filter((item) =>
      !query || [item.campaign, item.channel, item.mediaPlan, item.funnel, item.placement]
        .some((value) => String(value).toLowerCase().includes(query))
    );
    const sort = state.tableSort;
    items = items.slice().sort((a, b) => {
      const first = tableValue(a, sort.key);
      const second = tableValue(b, sort.key);
      let comparison;
      if (typeof first === "string") comparison = first.localeCompare(second);
      else comparison = (first || 0) - (second || 0);
      return sort.direction === "asc" ? comparison : -comparison;
    });

    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    if (state.tablePage > pageCount) state.tablePage = pageCount;
    const start = (state.tablePage - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    if (!pageItems.length) {
      elements.tableBody.innerHTML = '<tr><td colspan="12"><div class="empty-visual">No campaigns match the current search.</div></td></tr>';
    } else {
      elements.tableBody.innerHTML = pageItems.map((item) => {
        const selected = state.filters.campaign === item.campaign ? " selected" : "";
        const color = CHANNEL_COLORS[item.channel] || "#6558ef";
        return '<tr class="' + selected.trim() + '" data-table-campaign="' + escapeHtml(item.campaign) + '">' +
          '<td class="campaign-cell" title="' + escapeHtml(item.campaign) + '">' + escapeHtml(item.campaign) + "</td>" +
          '<td><span class="channel-pill" style="--pill-color:' + color + '">' + escapeHtml(item.channel) + "</span></td>" +
          "<td>" + escapeHtml(item.mediaPlan) + "</td>" +
          '<td><span class="funnel-pill">' + escapeHtml(item.funnel) + "</span></td>" +
          '<td class="numeric">' + formatCurrency(item.spend) + "</td>" +
          '<td class="numeric">' + formatCount(item.impressions) + "</td>" +
          '<td class="numeric">' + formatCount(item.sessions) + "</td>" +
          '<td class="numeric">' + formatCount(item.purchases) + "</td>" +
          '<td class="numeric">' + formatCurrency(item.revenue) + "</td>" +
          '<td class="numeric">' + formatPercent(item.ctr) + "</td>" +
          '<td class="numeric">' + formatCurrency(item.cpa) + "</td>" +
          '<td class="numeric roas-cell">' + formatRoas(item.roas) + "</td></tr>";
      }).join("");
    }

    const shownStart = items.length ? start + 1 : 0;
    const shownEnd = Math.min(start + pageSize, items.length);
    elements.tableCount.textContent = "Showing " + shownStart + "–" + shownEnd + " of " + items.length + " campaigns";
    renderPagination(pageCount);
    renderSortHeaders();
  }

  function renderPagination(pageCount) {
    const buttons = [];
    buttons.push('<button type="button" data-page="' + (state.tablePage - 1) + '"' +
      (state.tablePage === 1 ? " disabled" : "") + ' aria-label="Previous page">‹</button>');
    const candidatePages = new Set([1, pageCount, state.tablePage - 1, state.tablePage, state.tablePage + 1]);
    Array.from(candidatePages)
      .filter((page) => page >= 1 && page <= pageCount)
      .sort((a, b) => a - b)
      .forEach((page, index, sorted) => {
        if (index && page - sorted[index - 1] > 1) buttons.push("<span>…</span>");
        buttons.push('<button type="button" data-page="' + page + '" class="' +
          (page === state.tablePage ? "active" : "") + '">' + page + "</button>");
      });
    buttons.push('<button type="button" data-page="' + (state.tablePage + 1) + '"' +
      (state.tablePage === pageCount ? " disabled" : "") + ' aria-label="Next page">›</button>');
    elements.pagination.innerHTML = buttons.join("");
  }

  function renderSortHeaders() {
    document.querySelectorAll("[data-sort]").forEach((button) => {
      const isActive = button.dataset.sort === state.tableSort.key;
      button.classList.toggle("active", isActive);
      button.classList.toggle("asc", isActive && state.tableSort.direction === "asc");
      button.classList.toggle("desc", isActive && state.tableSort.direction === "desc");
    });
  }

  function percentile(values, percentileValue) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(percentileValue * sorted.length));
    return sorted[index];
  }

  function renderSignals() {
    const channelItems = aggregateByChannel(currentRows);
    const bestChannel = channelItems.slice().sort((a, b) => b.summary.roas - a.summary.roas)[0];
    const spendThreshold = percentile(currentCampaignSummary.map((item) => item.spend), 0.75);
    const roasMedian = median(currentCampaignSummary.map((item) => item.roas));
    const riskCampaign = currentCampaignSummary
      .filter((item) => item.spend >= spendThreshold && item.roas < roasMedian)
      .sort((a, b) => b.spend - a.spend)[0];
    const roasDelta = deltaPercent(currentSummary.roas, previousSummary.roas);
    const trendDirection = roasDelta >= 0 ? "improved" : "softened";
    const trendClass = roasDelta >= 0 ? "Efficiency movement" : "Efficiency watch";

    const signals = [
      {
        type: "Channel signal",
        title: bestChannel ? bestChannel.channel + " leads observed ROAS" : "No channel leader available",
        text: bestChannel
          ? formatRoas(bestChannel.summary.roas) + " observed ROAS with " +
            formatCurrency(bestChannel.summary.revenue) + " recorded revenue."
          : "Broaden the filters to compare channel performance.",
      },
      {
        type: "Campaign attention",
        title: riskCampaign ? riskCampaign.campaign : "No high-spend risk detected",
        text: riskCampaign
          ? "High spend relative to peers with " + formatRoas(riskCampaign.roas) +
            " observed ROAS. Review placement and campaign objective execution."
          : "No campaign currently combines upper-quartile spend with below-median ROAS.",
      },
      {
        type: trendClass,
        title: "Observed ROAS " + trendDirection + " " + formatDecimal(Math.abs(roasDelta), 1) + "%",
        text: "Movement is compared with the immediately preceding period and remains descriptive, not incremental.",
      },
    ];

    elements.signals.innerHTML = signals.map((signal) =>
      '<article class="signal-card"><span class="signal-type">' + escapeHtml(signal.type) +
      "</span><strong>" + escapeHtml(signal.title) + "</strong><p>" + escapeHtml(signal.text) + "</p></article>"
    ).join("");
  }

  function renderAll() {
    renderFilterOptions();
    currentRows = filterRows({ start: state.dateStart, end: state.dateEnd });
    const previousRange = getPreviousRange();
    previousRows = filterRows(previousRange);
    currentSummary = summarize(currentRows);
    previousSummary = summarize(previousRows);
    currentCampaignSummary = aggregateCampaigns(currentRows);

    renderFilterChips();
    renderScorecards();
    renderTrendObjectiveControl();
    renderTrendChannelControl();
    renderTrend();
    renderFunnel();
    renderBudgetPacing();
    renderChannels();
    renderEfficiencyMap();
    renderTable();
    renderSignals();
  }

  function setDimensionFilter(key, value) {
    state.filters[key] = state.filters[key] === value ? "All" : value;
    if (key === "channel" || key === "campaign") state.trendChannelsCustomized = false;
    if (key === "channel" && state.filters.campaign !== "All") {
      const campaign = campaigns.find((item) => item.campaign === state.filters.campaign);
      if (campaign && campaign.channel !== state.filters.channel && state.filters.channel !== "All") {
        state.filters.campaign = "All";
      }
    }
    state.tablePage = 1;
    renderAll();
  }

  function resetFilters() {
    FILTERS.forEach((definition) => { state.filters[definition.key] = "All"; });
    state.dateStart = dataset.meta.defaultStart;
    state.dateEnd = dataset.meta.defaultEnd;
    state.tableSearch = "";
    state.tablePage = 1;
    state.trendObjective = "All";
    state.trendChannels = new Set();
    state.trendChannelsCustomized = false;
    state.learningObjective = "Conversion";
    state.learningMetric = "roas";
    elements.tableSearch.value = "";
    closeTrendChannelMenu();
    renderAll();
  }

  function bindEvents() {
    document.querySelectorAll("[data-filter]").forEach((control) => {
      control.addEventListener("change", () => {
        const key = control.dataset.filter;
        if (key === "dateStart") {
          state.dateStart = control.value;
          if (state.dateStart > state.dateEnd) state.dateEnd = state.dateStart;
        } else if (key === "dateEnd") {
          state.dateEnd = control.value;
          if (state.dateEnd < state.dateStart) state.dateStart = state.dateEnd;
        } else {
          state.filters[key] = control.value;
          if (key === "channel") state.trendChannelsCustomized = false;
        }
        state.tablePage = 1;
        renderAll();
      });
    });

    document.querySelector("[data-reset-filters]").addEventListener("click", resetFilters);

    elements.chips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chip-key]");
      if (!button) return;
      const key = button.dataset.chipKey;
      if (key === "dateRange") {
        state.dateStart = dataset.meta.defaultStart;
        state.dateEnd = dataset.meta.defaultEnd;
      } else {
        state.filters[key] = "All";
        if (key === "channel" || key === "campaign") state.trendChannelsCustomized = false;
      }
      state.tablePage = 1;
      renderAll();
    });

    elements.trendMetric.addEventListener("change", () => {
      state.metric = elements.trendMetric.value;
      renderScorecards();
      renderTrend();
    });

    elements.trendObjective.addEventListener("change", () => {
      state.trendObjective = elements.trendObjective.value;
      renderTrendChannelControl();
      renderTrend();
    });

    elements.learningObjective.addEventListener("change", () => {
      state.learningObjective = elements.learningObjective.value;
      state.learningMetric = LEARNING_CONFIG[state.learningObjective].defaultMetric;
      renderEfficiencyMap();
    });

    elements.learningMetric.addEventListener("change", () => {
      state.learningMetric = elements.learningMetric.value;
      renderEfficiencyMap();
    });

    elements.trendChannelTrigger.addEventListener("click", () => {
      const willOpen = elements.trendChannelMenu.hidden;
      elements.trendChannelMenu.hidden = !willOpen;
      elements.trendChannelTrigger.setAttribute("aria-expanded", String(willOpen));
    });

    elements.trendChannelAll.addEventListener("change", () => {
      const available = getAvailableTrendChannels();
      state.trendChannelsCustomized = true;
      state.trendChannels = elements.trendChannelAll.checked ? new Set(available) : new Set();
      renderTrendChannelControl();
      renderTrend();
    });

    elements.trendChannelOptions.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-trend-channel-value]");
      if (!checkbox) return;
      state.trendChannelsCustomized = true;
      if (checkbox.checked) state.trendChannels.add(checkbox.dataset.trendChannelValue);
      else state.trendChannels.delete(checkbox.dataset.trendChannelValue);
      renderTrendChannelControl();
      renderTrend();
    });

    document.addEventListener("click", (event) => {
      if (!elements.trendChannelControl.contains(event.target)) closeTrendChannelMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeTrendChannelMenu();
    });

    document.querySelectorAll("[data-granularity]").forEach((button) => {
      button.addEventListener("click", () => {
        state.granularity = button.dataset.granularity;
        document.querySelectorAll("[data-granularity]").forEach((item) =>
          item.classList.toggle("active", item === button));
        renderTrend();
      });
    });

    elements.compareToggle.addEventListener("click", () => {
      state.compare = !state.compare;
      elements.compareToggle.classList.toggle("active", state.compare);
      elements.compareToggle.setAttribute("aria-pressed", String(state.compare));
      renderTrend();
    });

    elements.scorecards.addEventListener("click", (event) => {
      const card = event.target.closest("[data-scorecard-metric]");
      if (!card) return;
      state.metric = card.dataset.scorecardMetric;
      elements.trendMetric.value = state.metric;
      renderScorecards();
      renderTrend();
      document.querySelector(".trend-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    elements.channels.addEventListener("click", (event) => {
      const row = event.target.closest("[data-channel-value]");
      if (row) setDimensionFilter("channel", row.dataset.channelValue);
    });

    elements.clearChannel.addEventListener("click", () => {
      state.filters.channel = "All";
      state.trendChannelsCustomized = false;
      state.tablePage = 1;
      renderAll();
    });

    elements.efficiency.addEventListener("click", (event) => {
      const point = event.target.closest("[data-campaign-value]");
      if (point) setDimensionFilter("campaign", point.dataset.campaignValue);
    });

    elements.tableBody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-table-campaign]");
      if (row) setDimensionFilter("campaign", row.dataset.tableCampaign);
    });

    elements.tableSearch.addEventListener("input", () => {
      state.tableSearch = elements.tableSearch.value;
      state.tablePage = 1;
      renderTable();
    });

    document.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.sort;
        if (state.tableSort.key === key) {
          state.tableSort.direction = state.tableSort.direction === "asc" ? "desc" : "asc";
        } else {
          state.tableSort.key = key;
          state.tableSort.direction = ["campaign", "channel", "mediaPlan", "funnel"].includes(key) ? "asc" : "desc";
        }
        state.tablePage = 1;
        renderTable();
      });
    });

    elements.pagination.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.tablePage = Number(button.dataset.page);
      renderTable();
    });
  }

  async function initialize() {
    setupMetricSelect();
    bindEvents();
    const response = await fetch("/static/data/campaign-performance.json");
    if (!response.ok) throw new Error("Unable to load campaign data.");
    dataset = await response.json();
    campaigns = dataset.campaigns;
    campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    rows = dataset.rows.map((row) => ({
      date: row[0],
      campaignId: row[1],
      spend: row[2],
      impressions: row[3],
      videoViews: row[4],
      clicks: row[5],
      sessions: row[6],
      purchases: row[7],
      revenue: row[8],
    }));
    state.dateStart = dataset.meta.defaultStart;
    state.dateEnd = dataset.meta.defaultEnd;
    renderAll();
    elements.status.hidden = true;
  }

  initialize().catch((error) => {
    elements.status.classList.add("error");
    elements.status.innerHTML = "Campaign data could not be loaded. Please refresh the page.";
    console.error(error);
  });
})();
