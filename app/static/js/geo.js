(() => {
  const root = document.querySelector("[data-geo-dashboard]");
  if (!root) return;

  const CLUSTERS = {
    powerhouse: { order: 1, name: "Powerhouse Cities", color: "#1237d0", action: "Protect & Scale", description: "High investment, high interest, and a large customer base. Drive the most impact and deliver scale." },
    rising: { order: 2, name: "Rising Stars", color: "#4f9e3d", action: "Optimize & Grow", description: "High investment with a developing interest and customer base. Strong growth potential." },
    potential: { order: 3, name: "Potential Cities", color: "#ff8a00", action: "Test & Increase", description: "High interest, but lower investment. Increase share of voice and capture unmet demand." },
    emerging: { order: 4, name: "Emerging Base", color: "#7664bf", action: "Nurture & Monitor", description: "Lower interest and investment. Nurture awareness and build the market gradually." },
  };

  const LENSES = {
    demand: {
      label: "Demand",
      color: "#3048c8",
      description: "Potential leads across Indonesia, adjusted by adoption gap, demand signal, growth, value, and network readiness.",
      defaultMetric: "opportunityScore",
      metrics: [
        ["opportunityScore", "Opportunity Score", (value) => `${Math.round(value)}/100`],
        ["potentialLeads", "Potential Leads", formatCount],
        ["interestedAudience", "Interested Audience", formatCount],
        ["investmentGap", "Demand–Investment Gap", formatPpt],
      ],
    },
    adoption: {
      label: "Adoption",
      color: "#6d55d9",
      description: "Customer penetration and untapped addressable-market gap by geography.",
      defaultMetric: "adoptionGapCount",
      metrics: [
        ["adoptionGapCount", "Adoption Gap", formatCount],
        ["penetration", "Customer Penetration", formatPercent],
        ["customerBase", "Customer Base", formatCount],
        ["newActivations", "Estimated New Activations", formatCount],
      ],
    },
    value: {
      label: "Value",
      color: "#ec0a68",
      description: "Observed business value and customer economics by geography; not incremental impact.",
      defaultMetric: "revenue",
      metrics: [
        ["revenue", "Observed Revenue", formatCurrency],
        ["arpu", "ARPU", formatCurrency],
        ["roas", "Observed ROAS", formatRoas],
        ["highValueCustomers", "High-Value Customers", formatCount],
      ],
    },
    growth: {
      label: "Growth",
      color: "#218b69",
      description: "Customer and revenue momentum to surface accelerating and declining markets.",
      defaultMetric: "customerGrowth",
      metrics: [
        ["customerGrowth", "Customer Growth", formatPercentNumber],
        ["revenueGrowth", "Revenue Growth", formatPercentNumber],
        ["newActivations", "Estimated New Activations", formatCount],
        ["churnRisk", "Churn Risk", formatPercentNumber],
      ],
    },
  };

  const ICONS = {
    audience: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a2.5 2.5 0 0 1 0 5M16 14c2.8 0 4.5 1.8 4.5 4.5"/></svg>',
    signal: '<svg viewBox="0 0 24 24"><path d="M5 19v-3m4 3v-7m4 7V9m4 10V5"/><path d="m4 10 5-4 4 2 6-5"/></svg>',
    gap: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 5"/></svg>',
    market: '<svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11M8 20v-6h8v6M3 20h18"/></svg>',
    wallet: '<svg viewBox="0 0 24 24"><path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z"/></svg>',
    value: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 8.5h-3.2a2 2 0 0 0 0 4h1.4a2 2 0 0 1 0 4H9.5M12 6.5v11"/></svg>',
    growth: '<svg viewBox="0 0 24 24"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>',
    network: '<svg viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M11 18.5a2 2 0 0 1 2 0"/><circle cx="12" cy="20" r=".8"/></svg>',
  };

  const state = {
    dateStart: "2026-04-03",
    dateEnd: "2026-08-24",
    filters: { product: "All", province: "All", city: "All", mediaPlan: "All", objective: "All", channel: "All", placement: "All", campaign: "All" },
    lens: "demand",
    mapMetric: "opportunityScore",
    level: "city",
    selectedKey: null,
    search: "",
  };

  const elements = {
    status: root.querySelector("[data-geo-status]"),
    chips: root.querySelector("[data-geo-filter-chips]"),
    mapMetric: root.querySelector("[data-geo-map-metric]"),
    mapDescription: root.querySelector("[data-geo-map-description]"),
    mapHeat: root.querySelector("[data-geo-map-heat]"),
    mapBubbles: root.querySelector("[data-geo-map-bubbles]"),
    mapLegend: root.querySelector("[data-geo-map-legend]"),
    marketSummary: root.querySelector("[data-geo-market-summary]"),
    scorecards: root.querySelector("[data-geo-scorecards]"),
    matrix: root.querySelector("[data-geo-matrix]"),
    clusters: root.querySelector("[data-geo-clusters]"),
    alignment: root.querySelector("[data-geo-alignment]"),
    action: root.querySelector("[data-geo-action]"),
    table: root.querySelector("[data-geo-table]"),
    tableCount: root.querySelector("[data-geo-table-count]"),
    search: root.querySelector("[data-geo-search]"),
    clearSelection: root.querySelector("[data-geo-clear-selection]"),
  };

  let dataset;
  let cities = [];
  let rows = [];
  let contextEntities = [];
  let tooltip;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  }

  function safeDivide(numerator, denominator) { return denominator ? numerator / denominator : 0; }
  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
  function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0); }
  function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))); }
  function median(values) {
    const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!ordered.length) return 0;
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }
  function compact(value, digits = 1) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: digits }).format(value || 0); }
  function formatCount(value) { return compact(value, value >= 1_000_000 ? 2 : 1); }
  function formatCurrency(value) {
    const absolute = Math.abs(value || 0);
    if (absolute >= 1e9) return `Rp${(value / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `Rp${(value / 1e6).toFixed(1)}M`;
    if (absolute >= 1e3) return `Rp${(value / 1e3).toFixed(0)}K`;
    return `Rp${Math.round(value || 0).toLocaleString("en-US")}`;
  }
  function formatPercent(value) { return `${((value || 0) * 100).toFixed(1)}%`; }
  function formatPercentNumber(value) { return `${Number(value || 0).toFixed(1)}%`; }
  function formatRoas(value) { return `${Number(value || 0).toFixed(2)}x`; }
  function formatPpt(value) { return `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(1)} ppt`; }
  function formatInteger(value) { return Math.round(value || 0).toLocaleString("en-US"); }
  function weightedAverage(items, valueKey, weightKey = "addressable") {
    const weight = sum(items.map((item) => item[weightKey]));
    return safeDivide(sum(items.map((item) => item[valueKey] * item[weightKey])), weight);
  }
  function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

  function metricConfig() {
    return LENSES[state.lens].metrics.find(([key]) => key === state.mapMetric) || LENSES[state.lens].metrics[0];
  }

  function filterRows() {
    const allowedCities = new Set(cities.filter((city) => {
      if (state.filters.province !== "All" && city.province !== state.filters.province) return false;
      if (state.filters.city !== "All" && city.id !== state.filters.city) return false;
      return true;
    }).map((city) => city.id));
    return rows.filter((row) => {
      if (!allowedCities.has(row.cityId) || row.date < state.dateStart || row.date > state.dateEnd) return false;
      return ["product", "mediaPlan", "objective", "channel", "placement", "campaign"].every((key) => state.filters[key] === "All" || row[key] === state.filters[key]);
    });
  }

  function selectedCities() {
    return cities.filter((city) => {
      if (state.filters.province !== "All" && city.province !== state.filters.province) return false;
      if (state.filters.city !== "All" && city.id !== state.filters.city) return false;
      return true;
    });
  }

  function emptyMedia() { return { spend: 0, impressions: 0, sessions: 0, interested: 0, purchases: 0, revenue: 0 }; }

  function cityEntities() {
    const media = new Map();
    filterRows().forEach((row) => {
      if (!media.has(row.cityId)) media.set(row.cityId, emptyMedia());
      const target = media.get(row.cityId);
      ["spend", "impressions", "sessions", "interested", "purchases", "revenue"].forEach((key) => { target[key] += row[key]; });
    });
    const periodDays = Math.max(1, Math.round((new Date(`${state.dateEnd}T00:00:00Z`) - new Date(`${state.dateStart}T00:00:00Z`)) / 86400000) + 1);
    return selectedCities().map((city) => {
      const activity = media.get(city.id) || emptyMedia();
      const interestedAudience = Math.min(city.potentialLeads, Math.round(Math.sqrt(activity.interested * city.potentialLeads) * .2));
      return {
        ...city,
        ...activity,
        key: `city:${city.id}`,
        type: "city",
        adoptionGapCount: Math.max(0, city.addressable - city.customerBase),
        penetration: safeDivide(city.customerBase, city.addressable),
        interestedAudience,
        newActivations: Math.round(city.customerBase * city.customerGrowth / 100 * periodDays / 365),
        revenueGrowth: city.customerGrowth * 1.12,
        roas: safeDivide(activity.revenue, activity.spend),
      };
    });
  }

  function provinceEntities(cityItems) {
    const groups = new Map();
    cityItems.forEach((city) => {
      if (!groups.has(city.province)) groups.set(city.province, []);
      groups.get(city.province).push(city);
    });
    return [...groups.entries()].map(([province, items]) => {
      const addressable = sum(items.map((item) => item.addressable));
      const customerBase = sum(items.map((item) => item.customerBase));
      const spend = sum(items.map((item) => item.spend));
      const revenue = sum(items.map((item) => item.revenue));
      return {
        id: slug(province),
        key: `province:${slug(province)}`,
        name: province,
        province,
        region: unique(items.map((item) => item.region)).join(", "),
        type: "province",
        lat: weightedAverage(items, "lat"),
        lon: weightedAverage(items, "lon"),
        population: sum(items.map((item) => item.population)),
        addressable,
        customerBase,
        potentialLeads: sum(items.map((item) => item.potentialLeads)),
        networkReadiness: weightedAverage(items, "networkReadiness"),
        customerGrowth: weightedAverage(items, "customerGrowth", "customerBase"),
        revenueGrowth: weightedAverage(items, "revenueGrowth", "revenue"),
        arpu: weightedAverage(items, "arpu", "customerBase"),
        highValueCustomers: sum(items.map((item) => item.highValueCustomers)),
        churnRisk: weightedAverage(items, "churnRisk", "customerBase"),
        adoptionGapCount: Math.max(0, addressable - customerBase),
        penetration: safeDivide(customerBase, addressable),
        interestedAudience: sum(items.map((item) => item.interestedAudience)),
        newActivations: sum(items.map((item) => item.newActivations)),
        spend,
        impressions: sum(items.map((item) => item.impressions)),
        sessions: sum(items.map((item) => item.sessions)),
        interested: sum(items.map((item) => item.interested)),
        purchases: sum(items.map((item) => item.purchases)),
        revenue,
        roas: safeDivide(revenue, spend),
        cityCount: items.length,
      };
    });
  }

  function normalize(items, key) {
    const values = items.map((item) => Number(item[key] || 0));
    const minimum = Math.min(...values, 0);
    const maximum = Math.max(...values, 0);
    return (value) => maximum === minimum ? .5 : clamp((Number(value || 0) - minimum) / (maximum - minimum), 0, 1);
  }

  function enrichEntities(items) {
    if (!items.length) return [];
    const totalDemand = sum(items.map((item) => item.interestedAudience));
    const totalSpend = sum(items.map((item) => item.spend));
    const spendIntensityMedian = median(items.map((item) => safeDivide(item.spend, item.addressable))) || 1;
    const demandIntensityMedian = median(items.map((item) => safeDivide(item.interestedAudience, item.addressable))) || 1;
    const normalizers = {
      potentialLeads: normalize(items, "potentialLeads"),
      adoptionGapCount: normalize(items, "adoptionGapCount"),
      customerGrowth: normalize(items, "customerGrowth"),
      arpu: normalize(items, "arpu"),
    };
    const demandRateValues = items.map((item) => ({ ...item, demandRate: safeDivide(item.interestedAudience, item.addressable) }));
    const demandRateNormalizer = normalize(demandRateValues, "demandRate");
    return demandRateValues.map((item) => {
      const demandShare = safeDivide(item.interestedAudience, totalDemand);
      const spendShare = safeDivide(item.spend, totalSpend);
      const investmentGap = (demandShare - spendShare) * 100;
      const investmentIndex = safeDivide(safeDivide(item.spend, item.addressable), spendIntensityMedian);
      const demandIndex = safeDivide(item.demandRate, demandIntensityMedian);
      const opportunityScore = Math.round(100 * (
        normalizers.potentialLeads(item.potentialLeads) * .28 +
        normalizers.adoptionGapCount(item.adoptionGapCount) * .24 +
        demandRateNormalizer(item.demandRate) * .20 +
        normalizers.customerGrowth(item.customerGrowth) * .16 +
        normalizers.arpu(item.arpu) * .12
      ) * (.78 + .22 * item.networkReadiness / 100));
      let cluster = "emerging";
      if (demandIndex >= 1 && investmentIndex >= 1) cluster = "powerhouse";
      else if (demandIndex >= 1 && investmentIndex < 1) cluster = "potential";
      else if (demandIndex < 1 && investmentIndex >= 1) cluster = "rising";
      let action = CLUSTERS[cluster].action;
      if (item.networkReadiness < 65) action = "Hold & Prepare";
      else if (item.customerGrowth >= 13 && cluster !== "powerhouse") action = "Accelerate Growth";
      return { ...item, demandShare, spendShare, investmentGap, investmentIndex, demandIndex, opportunityScore, cluster, action };
    });
  }

  function buildContext() {
    const cityItems = cityEntities();
    return enrichEntities(state.level === "province" ? provinceEntities(cityItems) : cityItems);
  }

  function selectedEntity() { return contextEntities.find((entity) => entity.key === state.selectedKey) || null; }

  function aggregateSet(items) {
    if (!items.length) return null;
    const addressable = sum(items.map((item) => item.addressable));
    const customerBase = sum(items.map((item) => item.customerBase));
    const spend = sum(items.map((item) => item.spend));
    const revenue = sum(items.map((item) => item.revenue));
    return {
      name: items.length === 1 ? items[0].name : "Indonesia",
      type: items.length === 1 ? items[0].type : "national",
      potentialLeads: sum(items.map((item) => item.potentialLeads)),
      interestedAudience: sum(items.map((item) => item.interestedAudience)),
      addressable,
      customerBase,
      adoptionGapCount: Math.max(0, addressable - customerBase),
      penetration: safeDivide(customerBase, addressable),
      newActivations: sum(items.map((item) => item.newActivations)),
      highValueCustomers: sum(items.map((item) => item.highValueCustomers)),
      spend,
      revenue,
      roas: safeDivide(revenue, spend),
      arpu: weightedAverage(items, "arpu", "customerBase"),
      customerGrowth: weightedAverage(items, "customerGrowth", "customerBase"),
      revenueGrowth: weightedAverage(items, "revenueGrowth", "revenue"),
      churnRisk: weightedAverage(items, "churnRisk", "customerBase"),
      networkReadiness: weightedAverage(items, "networkReadiness"),
      opportunityScore: weightedAverage(items, "opportunityScore", "potentialLeads"),
      investmentGap: sum(items.map((item) => item.investmentGap * item.demandShare)),
      cluster: items.length === 1 ? items[0].cluster : null,
      action: items.length === 1 ? items[0].action : null,
    };
  }

  function activeSet() {
    const selected = selectedEntity();
    return selected ? [selected] : contextEntities;
  }

  function renderLensControls() {
    const lens = LENSES[state.lens];
    root.querySelectorAll("[data-geo-lens]").forEach((button) => {
      const active = button.dataset.geoLens === state.lens;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    root.querySelectorAll("[data-geo-level]").forEach((button) => button.classList.toggle("active", button.dataset.geoLevel === state.level));
    elements.mapDescription.textContent = lens.description;
    elements.mapMetric.innerHTML = lens.metrics.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
    elements.mapMetric.value = state.mapMetric;
    root.querySelectorAll("[data-geo-grain-label]").forEach((node) => { node.textContent = state.level === "city" ? "City" : "Province"; });
    root.querySelectorAll("[data-geo-table-grain]").forEach((node) => { node.textContent = state.level === "city" ? "City" : "Province"; });
  }

  function renderMap() {
    if (!contextEntities.length) {
      elements.mapHeat.innerHTML = "";
      elements.mapBubbles.innerHTML = "";
      elements.mapLegend.textContent = "No markets in the selected scope";
      return;
    }
    const [metricKey, metricLabel, formatter] = metricConfig();
    const values = contextEntities.map((entity) => Math.abs(Number(entity[metricKey] || 0)));
    const maximum = Math.max(...values, 1);
    const selected = selectedEntity();
    const topLabels = new Set([...contextEntities].sort((a, b) => Math.abs(b[metricKey]) - Math.abs(a[metricKey])).slice(0, 8).map((entity) => entity.key));
    if (selected) topLabels.add(selected.key);
    const project = (entity) => ({
      x: clamp(20 + (entity.lon - 94.5) / 46.7 * 1835, 28, 1847),
      y: clamp(40 + (6.5 - entity.lat) / 17.5 * 650, 42, 704),
    });
    elements.mapHeat.innerHTML = contextEntities.map((entity) => {
      const point = project(entity);
      const ratio = Math.sqrt(Math.abs(entity[metricKey] || 0) / maximum);
      const cluster = CLUSTERS[entity.cluster];
      const radius = (state.level === "province" ? 78 : 46) + ratio * (state.level === "province" ? 82 : 54);
      const opacity = .12 + ratio * .13;
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${cluster.color}" fill-opacity="${opacity.toFixed(2)}"></circle>`;
    }).join("");
    elements.mapBubbles.innerHTML = contextEntities.map((entity) => {
      const point = project(entity);
      const ratio = Math.sqrt(Math.abs(entity[metricKey] || 0) / maximum);
      const radius = 8 + ratio * 22;
      const cluster = CLUSTERS[entity.cluster];
      const selectedClass = selected?.key === entity.key ? " selected" : selected ? " dimmed" : "";
      const tooltipText = `<strong>${escapeHtml(entity.name)}</strong>${[
        `${escapeHtml(metricLabel)}: ${escapeHtml(formatter(entity[metricKey]))}`,
        `Potential leads: ${formatCount(entity.potentialLeads)}`,
        `Customer base: ${formatCount(entity.customerBase)}`,
        `Spend: ${formatCurrency(entity.spend)} · ROAS: ${formatRoas(entity.roas)}`,
        `${cluster.name} · ${entity.action}`,
      ].map((line) => `<span>${line}</span>`).join("")}`;
      return `<g><circle class="geo-map-bubble${selectedClass}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${cluster.color}" fill-opacity="${(.38 + ratio * .56).toFixed(2)}" stroke="#ffffff" stroke-width="3.5" tabindex="0" role="button" aria-label="${escapeHtml(entity.name)}, ${escapeHtml(cluster.name)}, ${escapeHtml(metricLabel)} ${escapeHtml(formatter(entity[metricKey]))}" data-geo-key="${entity.key}" data-geo-tooltip="${escapeHtml(tooltipText)}"></circle>${topLabels.has(entity.key) ? `<text class="geo-map-label" x="${(point.x + radius + 7).toFixed(1)}" y="${(point.y + 5).toFixed(1)}">${escapeHtml(entity.name)}</text>` : ""}</g>`;
    }).join("");
    elements.mapLegend.innerHTML = `<div class="geo-legend-metric"><strong>Bubble size &amp; opacity</strong><span>Low</span><span class="geo-legend-size-scale" aria-hidden="true"><i></i><i></i></span><span>High ${escapeHtml(metricLabel)}</span></div><div class="geo-legend-clusters"><strong>Bubble + map color</strong>${Object.entries(CLUSTERS).sort((a, b) => a[1].order - b[1].order).map(([, cluster]) => `<span class="geo-legend-item"><i class="geo-legend-dot" style="--cluster-color:${cluster.color}"></i>${escapeHtml(cluster.name)}</span>`).join("")}</div>`;
  }

  function summaryMetrics(summary) {
    return {
      demand: [["Potential Leads", formatCount(summary.potentialLeads)], ["Interested Audience", formatCount(summary.interestedAudience)], ["Demand Coverage", formatPercent(safeDivide(summary.interestedAudience, summary.potentialLeads))], ["Investment Gap", summary.type === "national" ? "Market view" : formatPpt(summary.investmentGap)]],
      adoption: [["Customer Base", formatCount(summary.customerBase)], ["Penetration", formatPercent(summary.penetration)], ["Untapped Base", formatCount(summary.adoptionGapCount)], ["New Activations", formatCount(summary.newActivations)]],
      value: [["Observed Revenue", formatCurrency(summary.revenue)], ["Observed ROAS", formatRoas(summary.roas)], ["ARPU", formatCurrency(summary.arpu)], ["High-Value Base", formatCount(summary.highValueCustomers)]],
      growth: [["Customer Growth", formatPercentNumber(summary.customerGrowth)], ["Revenue Growth", formatPercentNumber(summary.revenueGrowth)], ["New Activations", formatCount(summary.newActivations)], ["Churn Risk", formatPercentNumber(summary.churnRisk)]],
    }[state.lens];
  }

  function renderMarketSummary() {
    const summary = aggregateSet(activeSet());
    if (!summary) { elements.marketSummary.innerHTML = '<div class="geo-empty-state">No market data matches the selected filters.</div>'; return; }
    const selected = selectedEntity();
    const target = selected || [...contextEntities].sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
    const cluster = selected ? CLUSTERS[selected.cluster] : null;
    const metrics = summaryMetrics(summary);
    const insight = selected
      ? `<strong>${escapeHtml(selected.action)}</strong>${escapeHtml(actionNarrative(selected))}`
      : `<strong>Top priority: ${escapeHtml(target?.name || "—")}</strong>${target ? `${formatCount(target.potentialLeads)} potential leads with an opportunity score of ${target.opportunityScore}/100.` : "No priority market is available."}`;
    elements.marketSummary.innerHTML = `
      <p class="geo-summary-eyebrow">${selected ? "Selected market" : "National opportunity snapshot"}</p>
      <div class="geo-summary-title-row"><h3>${escapeHtml(summary.name)}</h3>${cluster ? `<span class="geo-cluster-pill" style="--pill-color:${cluster.color}">${escapeHtml(cluster.name)}</span>` : ""}</div>
      <div class="geo-summary-score"><strong>${Math.round(summary.opportunityScore)}</strong><span>Opportunity Score / 100</span></div>
      <div class="geo-summary-grid">${metrics.map(([label, value]) => `<div class="geo-summary-metric"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="geo-summary-insight">${insight}</div>`;
  }

  function renderScorecards() {
    const summary = aggregateSet(activeSet());
    if (!summary) { elements.scorecards.innerHTML = ""; return; }
    const items = {
      demand: [
        ["Potential Leads", formatCount(summary.potentialLeads), "Modeled non-customer addressable opportunity", "audience", "#3048c8"],
        ["Interested Audience", formatCount(summary.interestedAudience), "Estimated deduplicated observed demand", "signal", "#6558ef"],
        ["Demand Coverage", formatPercent(safeDivide(summary.interestedAudience, summary.potentialLeads)), "Interested audience relative to potential leads", "gap", "#ec0a68"],
        ["Underinvested Markets", formatInteger(activeSet().filter((item) => item.investmentGap > 1).length), "Demand share exceeds spend share by >1 ppt", "market", "#218b69"],
      ],
      adoption: [
        ["Customer Base", formatCount(summary.customerBase), "Existing customer base in scope", "audience", "#6d55d9"],
        ["Customer Penetration", formatPercent(summary.penetration), "Customers divided by addressable market", "signal", "#3048c8"],
        ["Adoption Gap", formatCount(summary.adoptionGapCount), "Addressable market not yet in the customer base", "gap", "#ec0a68"],
        ["Estimated Activations", formatCount(summary.newActivations), "Growth-based estimate for the selected period", "growth", "#218b69"],
      ],
      value: [
        ["Observed Revenue", formatCurrency(summary.revenue), "Observed media-linked revenue, not incremental", "value", "#ec0a68"],
        ["Observed ROAS", formatRoas(summary.roas), "Observed revenue divided by media spend", "growth", "#3048c8"],
        ["Weighted ARPU", formatCurrency(summary.arpu), "Weighted customer value indicator", "wallet", "#7615a7"],
        ["High-Value Customers", formatCount(summary.highValueCustomers), "Estimated higher-value customer segment", "audience", "#218b69"],
      ],
      growth: [
        ["Customer Growth", formatPercentNumber(summary.customerGrowth), "Weighted annualized growth signal", "growth", "#218b69"],
        ["Revenue Growth", formatPercentNumber(summary.revenueGrowth), "Weighted revenue momentum", "value", "#ec0a68"],
        ["Fast-Growing Markets", formatInteger(activeSet().filter((item) => item.customerGrowth >= 12).length), "Markets with ≥12% customer growth", "market", "#3048c8"],
        ["Churn Risk", formatPercentNumber(summary.churnRisk), "Weighted customer churn risk indicator", "gap", "#d05a43"],
      ],
    }[state.lens];
    elements.scorecards.innerHTML = items.map(([label, value, note, icon, color]) => `<article class="geo-scorecard"><div class="geo-scorecard-top"><span class="geo-scorecard-label">${label}</span><span class="geo-scorecard-icon" style="--score-color:${color}">${ICONS[icon]}</span></div><div class="geo-scorecard-value">${value}</div><div class="geo-scorecard-note">${note}</div></article>`).join("");
  }

  function stableHash(value) {
    return [...String(value)].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
  }

  function matrixDisplayLayout(items) {
    const bounds = {
      powerhouse: { x: [.57, .93], y: [.58, .92] },
      rising: { x: [.57, .93], y: [.08, .42] },
      potential: { x: [.07, .43], y: [.58, .92] },
      emerging: { x: [.07, .43], y: [.08, .42] },
    };
    const positions = new Map();
    Object.keys(CLUSTERS).forEach((clusterKey) => {
      const group = items.filter((item) => item.cluster === clusterKey);
      if (!group.length) return;
      const area = bounds[clusterKey];
      const columns = Math.ceil(Math.sqrt(group.length * 1.25));
      const rows = Math.ceil(group.length / columns);
      const byDemand = [...group].sort((a, b) => b.demandIndex - a.demandIndex || a.name.localeCompare(b.name));
      for (let row = 0; row < rows; row += 1) {
        const rowItems = byDemand.slice(row * columns, (row + 1) * columns).sort((a, b) => a.investmentIndex - b.investmentIndex || a.name.localeCompare(b.name));
        rowItems.forEach((item, column) => {
          const hash = stableHash(item.key);
          const jitterX = ((hash % 101) / 100 - .5) * .025;
          const jitterY = (((hash >>> 8) % 101) / 100 - .5) * .025;
          const xFraction = clamp((column + 1) / (rowItems.length + 1) + jitterX, .06, .94);
          const yFraction = clamp((rows - row) / (rows + 1) + jitterY, .06, .94);
          positions.set(item.key, {
            x: area.x[0] + xFraction * (area.x[1] - area.x[0]),
            y: area.y[0] + yFraction * (area.y[1] - area.y[0]),
          });
        });
      }
    });
    return positions;
  }

  function renderMatrix() {
    if (!contextEntities.length) { elements.matrix.innerHTML = '<div class="geo-empty-state">No markets available for comparison.</div>'; return; }
    const width = 760, height = 430;
    const margin = { left: 62, right: 24, top: 30, bottom: 54 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const x = (value) => margin.left + value * plotWidth;
    const y = (value) => margin.top + (1 - value) * plotHeight;
    const positions = matrixDisplayLayout(contextEntities);
    const maxCustomers = Math.max(...contextEntities.map((item) => item.customerBase), 1);
    const selected = selectedEntity();
    const labelKeys = new Set([...contextEntities].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 10).map((item) => item.key));
    if (selected) labelKeys.add(selected.key);
    const points = contextEntities.map((entity) => {
      const position = positions.get(entity.key) || { x: .5, y: .5 };
      const pointX = x(position.x);
      const pointY = y(position.y);
      const radius = 4 + Math.sqrt(entity.customerBase / maxCustomers) * 15;
      const cluster = CLUSTERS[entity.cluster];
      const pointClass = selected?.key === entity.key ? " selected" : selected ? " dimmed" : "";
      const tooltipText = `<strong>${escapeHtml(entity.name)}</strong><span>Cluster ${cluster.order} · ${escapeHtml(cluster.name)}</span><span>Investment index: ${entity.investmentIndex.toFixed(2)}x · Demand index: ${entity.demandIndex.toFixed(2)}x</span><span>Potential leads: ${formatCount(entity.potentialLeads)} · Customer base: ${formatCount(entity.customerBase)}</span><span>Action: ${escapeHtml(entity.action)}</span>`;
      return `<g><circle class="geo-matrix-point${pointClass}" cx="${pointX.toFixed(1)}" cy="${pointY.toFixed(1)}" r="${radius.toFixed(1)}" fill="${cluster.color}" fill-opacity=".9" stroke="#fff" stroke-width="2" tabindex="0" role="button" aria-label="${escapeHtml(entity.name)}, ${escapeHtml(cluster.name)}" data-geo-key="${entity.key}" data-geo-tooltip="${escapeHtml(tooltipText)}"></circle>${labelKeys.has(entity.key) ? `<text class="geo-matrix-label" x="${(pointX + radius + 3).toFixed(1)}" y="${(pointY + 3).toFixed(1)}">${escapeHtml(entity.name)}</text>` : ""}</g>`;
    }).join("");
    elements.matrix.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Market opportunity matrix comparing demand and investment index"><rect x="${margin.left}" y="${margin.top}" width="${plotWidth/2}" height="${plotHeight/2}" fill="${CLUSTERS.potential.color}" opacity=".045"/><rect x="${x(.5)}" y="${margin.top}" width="${plotWidth/2}" height="${plotHeight/2}" fill="${CLUSTERS.powerhouse.color}" opacity=".045"/><rect x="${margin.left}" y="${y(.5)}" width="${plotWidth/2}" height="${plotHeight/2}" fill="${CLUSTERS.emerging.color}" opacity=".045"/><rect x="${x(.5)}" y="${y(.5)}" width="${plotWidth/2}" height="${plotHeight/2}" fill="${CLUSTERS.rising.color}" opacity=".045"/><line x1="${x(.5)}" y1="${margin.top}" x2="${x(.5)}" y2="${margin.top+plotHeight}" stroke="#bdc4d6" stroke-dasharray="6 6"/><line x1="${margin.left}" y1="${y(.5)}" x2="${margin.left+plotWidth}" y2="${y(.5)}" stroke="#bdc4d6" stroke-dasharray="6 6"/><text class="geo-matrix-quadrant potential" x="${margin.left+12}" y="${margin.top+18}">CLUSTER 3 · POTENTIAL CITIES</text><text class="geo-matrix-quadrant powerhouse" x="${x(.5)+12}" y="${margin.top+18}">CLUSTER 1 · POWERHOUSE CITIES</text><text class="geo-matrix-quadrant emerging" x="${margin.left+12}" y="${margin.top+plotHeight-12}">CLUSTER 4 · EMERGING BASE</text><text class="geo-matrix-quadrant rising" x="${x(.5)+12}" y="${margin.top+plotHeight-12}">CLUSTER 2 · RISING STARS</text>${points}<line x1="${margin.left}" y1="${margin.top+plotHeight}" x2="${margin.left+plotWidth}" y2="${margin.top+plotHeight}" stroke="#bfc7d8"/><line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top+plotHeight}" stroke="#bfc7d8"/><text class="geo-matrix-axis" x="${margin.left+plotWidth/2}" y="${height-12}" text-anchor="middle">INVESTMENT (MEDIA BUDGET INDEX) →</text><text class="geo-matrix-axis" x="18" y="${margin.top+plotHeight/2}" text-anchor="middle" transform="rotate(-90 18 ${margin.top+plotHeight/2})">INTEREST / DEMAND INDEX →</text><text class="geo-matrix-threshold" x="${x(.5)}" y="${margin.top+plotHeight+20}" text-anchor="middle">Median threshold</text></svg>`;
  }

  function renderClusters() {
    const scopedItems = activeSet();
    const totalCustomers = sum(scopedItems.map((item) => item.customerBase));
    elements.clusters.innerHTML = Object.entries(CLUSTERS).map(([key, config]) => {
      const items = scopedItems.filter((item) => item.cluster === key);
      const customerShare = safeDivide(sum(items.map((item) => item.customerBase)), totalCustomers);
      return `<article class="geo-cluster-card" style="--cluster-color:${config.color}"><div class="geo-cluster-head"><div><small>Cluster ${config.order}</small><strong>${config.name}</strong></div><span>${items.length}</span></div><p>${config.description}</p><div class="geo-cluster-share"><span>% customers</span><strong>${formatPercent(customerShare)}</strong></div></article>`;
    }).join("");
  }

  function renderAlignment() {
    const scopedItems = activeSet();
    if (!scopedItems.length) { elements.alignment.innerHTML = '<div class="geo-empty-state">No demand–investment gap is available.</div>'; return; }
    const positives = [...scopedItems].filter((item) => item.investmentGap >= 0).sort((a, b) => b.investmentGap - a.investmentGap).slice(0, 4);
    const negatives = [...scopedItems].filter((item) => item.investmentGap < 0).sort((a, b) => a.investmentGap - b.investmentGap).slice(0, 3);
    const items = [...positives, ...negatives];
    const maxShare = Math.max(...items.flatMap((item) => [item.demandShare, item.spendShare]), .01);
    elements.alignment.innerHTML = items.map((item) => `<div class="geo-alignment-row" role="button" tabindex="0" data-geo-key="${item.key}"><div class="geo-alignment-name"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(CLUSTERS[item.cluster].name)}</span></div><div class="geo-share-bars"><div class="geo-share-bar"><span>Demand</span><div class="geo-share-track"><i style="--bar-color:#3048c8;width:${item.demandShare/maxShare*100}%"></i></div><b>${formatPercent(item.demandShare)}</b></div><div class="geo-share-bar"><span>Spend</span><div class="geo-share-track"><i style="--bar-color:#ec0a68;width:${item.spendShare/maxShare*100}%"></i></div><b>${formatPercent(item.spendShare)}</b></div></div><div class="geo-gap-value ${item.investmentGap >= 0 ? "positive" : "negative"}">${formatPpt(item.investmentGap)}</div></div>`).join("");
  }

  function actionNarrative(entity) {
    if (entity.networkReadiness < 65) return "Potential exists, but network readiness should improve before aggressive media scaling.";
    if (entity.cluster === "potential") return "Demand share is ahead of media investment. Run a controlled budget increase and validate conversion quality.";
    if (entity.cluster === "powerhouse") return "This market combines scale and demand. Protect coverage and optimize marginal efficiency rather than cutting broadly.";
    if (entity.cluster === "rising") return "Investment is established while demand is developing. Improve creative and targeting, then scale where growth confirms the signal.";
    return "Use low-cost awareness and measured tests while monitoring whether demand and adoption accelerate.";
  }

  function readinessLabel(value) { return value >= 80 ? "High" : value >= 65 ? "Medium" : "Low"; }
  function readinessColor(value) { return value >= 80 ? "#218b69" : value >= 65 ? "#d49320" : "#c84555"; }

  function renderAction() {
    const selected = selectedEntity();
    const target = selected || [...contextEntities].sort((a, b) => b.opportunityScore - a.opportunityScore)[0];
    if (!target) { elements.action.innerHTML = '<div class="geo-empty-state">No recommendation is available.</div>'; return; }
    const cluster = CLUSTERS[target.cluster];
    const efficiencySignal = target.roas >= 3 ? "Strong" : target.roas >= 2 ? "Healthy" : "Review";
    elements.action.innerHTML = `<div class="geo-action-content"><div class="geo-action-hero"><div class="geo-action-market"><strong>${selected ? escapeHtml(target.name) : `Top priority · ${escapeHtml(target.name)}`}</strong><span class="geo-action-signal" style="--action-color:${cluster.color}">${escapeHtml(target.action)}</span></div><h3>${escapeHtml(cluster.name)}</h3><p>${escapeHtml(actionNarrative(target))}</p></div><div class="geo-action-checks"><div class="geo-action-check"><i style="--check-color:${target.investmentGap >= 0 ? "#218b69" : "#c84555"}">1</i><span>Demand–Investment Gap</span><strong>${formatPpt(target.investmentGap)}</strong></div><div class="geo-action-check"><i style="--check-color:${readinessColor(target.networkReadiness)}">2</i><span>Network Readiness</span><strong>${readinessLabel(target.networkReadiness)} · ${Math.round(target.networkReadiness)}/100</strong></div><div class="geo-action-check"><i style="--check-color:${target.roas >= 2 ? "#218b69" : "#c84555"}">3</i><span>Observed Efficiency</span><strong>${efficiencySignal} · ${formatRoas(target.roas)}</strong></div></div><p class="geo-action-footnote">Direction is based on modeled market potential and observed media signals. Incremental lift and final channel budget remain within MMM or a geo experiment.</p></div>`;
  }

  function renderTable() {
    const query = state.search.trim().toLowerCase();
    const sorted = [...activeSet()].filter((item) => !query || `${item.name} ${item.province} ${item.region}`.toLowerCase().includes(query)).sort((a, b) => b.opportunityScore - a.opportunityScore);
    const selected = selectedEntity();
    elements.table.innerHTML = sorted.map((item, index) => {
      const cluster = CLUSTERS[item.cluster];
      return `<tr class="${selected?.key === item.key ? "selected" : ""}" tabindex="0" data-geo-key="${item.key}"><td><span class="geo-rank">${index + 1}</span></td><td><div class="geo-market-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.type === "city" ? item.province : item.region)}</span></div></td><td class="numeric"><span class="geo-score-badge">${item.opportunityScore}</span></td><td class="numeric">${formatCount(item.potentialLeads)}</td><td class="numeric">${formatCount(item.adoptionGapCount)}</td><td class="numeric">${formatCurrency(item.spend)}</td><td class="numeric">${formatRoas(item.roas)}</td><td class="numeric">${formatPercentNumber(item.customerGrowth)}</td><td class="numeric"><span class="geo-readiness" style="--readiness-color:${readinessColor(item.networkReadiness)}"><i></i>${Math.round(item.networkReadiness)}</span></td><td><span class="geo-action-tag" style="--action-color:${cluster.color}">${escapeHtml(item.action)}</span></td></tr>`;
    }).join("") || '<tr><td colspan="10"><div class="geo-empty-state">No markets match the search.</div></td></tr>';
    elements.tableCount.textContent = `${sorted.length} ${state.level === "city" ? "cities" : "provinces"} in scope`;
  }

  function renderChips() {
    const chips = [];
    if (state.dateStart !== dataset.meta.defaultStart || state.dateEnd !== dataset.meta.defaultEnd) chips.push(["date", `${state.dateStart} – ${state.dateEnd}`]);
    Object.entries(state.filters).forEach(([key, value]) => { if (value !== "All") chips.push([key, key === "city" ? cities.find((city) => city.id === value)?.name || value : value]); });
    if (state.selectedKey) chips.push(["selection", selectedEntity()?.name || "Selected market"]);
    elements.chips.innerHTML = chips.length ? chips.map(([key, label]) => `<span class="geo-filter-chip">${escapeHtml(label)}<button type="button" aria-label="Clear ${escapeHtml(label)}" data-geo-clear-chip="${key}">×</button></span>`).join("") : '<span class="geo-empty-chip">No additional filters</span>';
  }

  function renderAll() {
    contextEntities = buildContext();
    if (state.selectedKey && !contextEntities.some((item) => item.key === state.selectedKey)) state.selectedKey = null;
    renderLensControls();
    renderChips();
    renderMap();
    renderMarketSummary();
    renderScorecards();
    renderMatrix();
    renderClusters();
    renderAlignment();
    renderAction();
    renderTable();
    elements.clearSelection.hidden = !state.selectedKey;
  }

  function optionMarkup(values, allLabel, selected) {
    return [`<option value="All">${allLabel}</option>`, ...values.map((value) => `<option value="${escapeHtml(value.value ?? value)}">${escapeHtml(value.label ?? value)}</option>`)].join("");
  }

  function populateFilters() {
    const controls = Object.fromEntries([...root.querySelectorAll("[data-geo-filter]")].map((control) => [control.dataset.geoFilter, control]));
    controls.dateStart.min = dataset.meta.historyStart;
    controls.dateStart.max = dataset.meta.defaultEnd;
    controls.dateStart.value = state.dateStart;
    controls.dateEnd.min = dataset.meta.historyStart;
    controls.dateEnd.max = dataset.meta.defaultEnd;
    controls.dateEnd.value = state.dateEnd;
    controls.product.innerHTML = optionMarkup(unique(rows.map((row) => row.product)), "All products", state.filters.product);
    controls.province.innerHTML = optionMarkup(unique(cities.map((city) => city.province)), "All provinces", state.filters.province);
    refreshCityOptions();
    controls.mediaPlan.innerHTML = optionMarkup(unique(rows.map((row) => row.mediaPlan)), "All media plans", state.filters.mediaPlan);
    controls.objective.innerHTML = optionMarkup(unique(rows.map((row) => row.objective)), "All objectives", state.filters.objective);
    controls.channel.innerHTML = optionMarkup(unique(rows.map((row) => row.channel)), "All channels", state.filters.channel);
    controls.placement.innerHTML = optionMarkup(unique(rows.map((row) => row.placement)), "All placements", state.filters.placement);
    controls.campaign.innerHTML = optionMarkup(unique(rows.map((row) => row.campaign)).map((value) => ({ value, label: value })), "All campaigns", state.filters.campaign);
    Object.entries(state.filters).forEach(([key, value]) => { if (controls[key]) controls[key].value = value; });
  }

  function refreshCityOptions() {
    const cityControl = root.querySelector('[data-geo-filter="city"]');
    const choices = cities.filter((city) => state.filters.province === "All" || city.province === state.filters.province).sort((a, b) => a.name.localeCompare(b.name)).map((city) => ({ value: city.id, label: city.name }));
    if (state.filters.city !== "All" && !choices.some((choice) => choice.value === state.filters.city)) state.filters.city = "All";
    cityControl.innerHTML = optionMarkup(choices, "All cities", state.filters.city);
    cityControl.value = state.filters.city;
  }

  function chooseEntity(key) {
    state.selectedKey = state.selectedKey === key ? null : key;
    renderAll();
  }

  function clearChip(key) {
    if (key === "date") { state.dateStart = dataset.meta.defaultStart; state.dateEnd = dataset.meta.defaultEnd; }
    else if (key === "selection") state.selectedKey = null;
    else if (key in state.filters) {
      state.filters[key] = "All";
      if (key === "province") state.filters.city = "All";
    }
    populateFilters();
    renderAll();
  }

  function showTooltip(target, x, y) {
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "geo-tooltip";
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = target.dataset.geoTooltip;
    tooltip.hidden = false;
    const left = clamp(x, 8, Math.max(8, window.innerWidth - 300));
    const top = clamp(y, 8, Math.max(8, window.innerHeight - 170));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() { if (tooltip) tooltip.hidden = true; }

  function bindControls() {
    root.querySelectorAll("[data-geo-filter]").forEach((control) => control.addEventListener("change", () => {
      const key = control.dataset.geoFilter;
      if (key === "dateStart") {
        state.dateStart = control.value <= state.dateEnd ? control.value : state.dateEnd;
        control.value = state.dateStart;
      } else if (key === "dateEnd") {
        state.dateEnd = control.value >= state.dateStart ? control.value : state.dateStart;
        control.value = state.dateEnd;
      } else {
        state.filters[key] = control.value;
        if (key === "province") refreshCityOptions();
      }
      state.selectedKey = null;
      renderAll();
    }));
    root.querySelector("[data-geo-reset]").addEventListener("click", () => {
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      Object.keys(state.filters).forEach((key) => { state.filters[key] = "All"; });
      state.lens = "demand";
      state.mapMetric = LENSES.demand.defaultMetric;
      state.level = "city";
      state.selectedKey = null;
      state.search = "";
      elements.search.value = "";
      populateFilters();
      renderAll();
    });
    root.querySelectorAll("[data-geo-lens]").forEach((button) => button.addEventListener("click", () => {
      state.lens = button.dataset.geoLens;
      state.mapMetric = LENSES[state.lens].defaultMetric;
      renderAll();
    }));
    root.querySelectorAll("[data-geo-level]").forEach((button) => button.addEventListener("click", () => {
      state.level = button.dataset.geoLevel;
      state.selectedKey = null;
      renderAll();
    }));
    elements.mapMetric.addEventListener("change", () => { state.mapMetric = elements.mapMetric.value; renderMap(); });
    elements.clearSelection.addEventListener("click", () => { state.selectedKey = null; renderAll(); });
    elements.search.addEventListener("input", () => { state.search = elements.search.value; renderTable(); });
    root.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-geo-clear-chip]");
      if (chip) { clearChip(chip.dataset.geoClearChip); return; }
      const keyed = event.target.closest("[data-geo-key]");
      if (keyed) chooseEntity(keyed.dataset.geoKey);
    });
    root.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const keyed = event.target.closest("[data-geo-key]");
      if (keyed) { event.preventDefault(); chooseEntity(keyed.dataset.geoKey); }
    });
    root.addEventListener("pointerover", (event) => {
      const target = event.target.closest("[data-geo-tooltip]");
      if (target) showTooltip(target, event.clientX, event.clientY);
    });
    root.addEventListener("pointermove", (event) => {
      const target = event.target.closest("[data-geo-tooltip]");
      if (target && tooltip && !tooltip.hidden) showTooltip(target, event.clientX, event.clientY);
    });
    root.addEventListener("pointerout", (event) => { if (event.target.closest("[data-geo-tooltip]")) hideTooltip(); });
    root.addEventListener("focusin", (event) => {
      const target = event.target.closest("[data-geo-tooltip]");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      showTooltip(target, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    root.addEventListener("focusout", (event) => { if (event.target.closest("[data-geo-tooltip]")) hideTooltip(); });
  }

  async function initialize() {
    try {
      const response = await fetch("/static/data/geo.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      dataset = await response.json();
      cities = dataset.cities;
      rows = dataset.rows;
      state.dateStart = dataset.meta.defaultStart;
      state.dateEnd = dataset.meta.defaultEnd;
      populateFilters();
      bindControls();
      renderAll();
      elements.status.hidden = true;
    } catch (error) {
      elements.status.classList.add("error");
      elements.status.innerHTML = '<span aria-hidden="true">!</span> Geographic opportunity data could not be loaded.';
    }
  }

  initialize();
})();
