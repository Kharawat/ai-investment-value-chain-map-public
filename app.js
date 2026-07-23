(() => {
  "use strict";

  const data = window.AI_CHAIN_DATA;
  if (!data || !Array.isArray(data.companies)) {
    document.body.innerHTML =
      '<main class="empty-state"><h1>ไม่สามารถโหลดข้อมูล Dashboard</h1><p>กรุณาตรวจสอบว่าไฟล์ data.js อยู่ในโฟลเดอร์เดียวกับ index.html</p></main>';
    return;
  }

  const state = {
    category: "All",
    query: "",
    sortKey: "company",
    sortDirection: "asc",
    checklistTicker: "ASML",
    lastFocusedElement: null,
    quotes: {},
    quoteLoading: false,
    quoteError: "",
    quoteMeta: null,
  };

  const categories = ["All", "Semiconductor", "Cloud", "Software", "Consumer", "Healthcare", "Space"];
  const matrixColumns = [
    { key: "company", label: "Company" },
    { key: "ai", label: "AI Capex" },
    { key: "semi", label: "Semiconductor Cycle" },
    { key: "enterprise", label: "Enterprise Adoption" },
    { key: "consumer", label: "Consumer Demand" },
    { key: "valuation", label: "Valuation Sensitivity" },
    { key: "rates", label: "Interest Rate Sensitivity" },
    { key: "geo", label: "Geopolitical Risk" },
  ];
  const levelRank = { Unknown: -1, Low: 0, Medium: 1, High: 2, "Very High": 3 };
  const categoryLabels = {
    All: "ทั้งหมด",
    Semiconductor: "Semiconductor",
    Cloud: "Cloud",
    Software: "Software",
    Consumer: "Consumer",
    Healthcare: "Healthcare",
    Space: "Space",
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const byId = (id) => document.getElementById(id);
  let deferredInstallPrompt = null;
  let quoteRetryTimer;

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function layerFor(id) {
    return data.layers.find((layer) => layer.id === id) || {
      title: "Unknown layer",
      label: "Unknown",
      color: "var(--unknown)",
    };
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      showToast("ไม่สามารถบันทึกสถานะใน Browser นี้ได้");
    }
  }

  function renderHeroStats() {
    const verified = data.companies.filter((company) => company.status !== "Needs verification").length;
    const directLinks = data.relationships.filter((relation) => relation.level === "Direct").length;
    byId("hero-stats").innerHTML = `
      <article class="stat-card">
        <div>
          <span class="stat-label">Portfolio map</span>
          <span class="stat-value">${data.companies.length}</span>
          <span class="stat-sub">${verified} verified · 1 pending</span>
        </div>
        <div class="stat-bars" aria-hidden="true">
          ${data.layers.map((layer, index) => `<i style="height:${30 + index * 7}%;background:${escapeHTML(layer.color)}"></i>`).join("")}
        </div>
      </article>
      <article class="stat-card">
        <span class="stat-label">Value chain</span>
        <span class="stat-value">${data.layers.length}</span>
        <span class="stat-sub">business layers</span>
      </article>
      <article class="stat-card">
        <span class="stat-label">Direct links</span>
        <span class="stat-value">${directLinks}</span>
        <span class="stat-sub">tracked relationships</span>
      </article>
    `;
  }

  function renderFilters() {
    byId("category-filters").innerHTML = categories
      .map(
        (category) => `
          <button
            class="filter-button"
            type="button"
            data-category="${escapeHTML(category)}"
            aria-pressed="${state.category === category}"
          >${escapeHTML(categoryLabels[category])}</button>
        `,
      )
      .join("");
  }

  function renderLegend() {
    byId("layer-legend").innerHTML = data.layers
      .map(
        (layer) => `
          <span class="legend-item" style="--layer-color:${escapeHTML(layer.color)}">
            <span class="legend-dot" aria-hidden="true"></span>
            L${layer.id} ${escapeHTML(layer.label)}
          </span>
        `,
      )
      .join("");
  }

  function renderPipeline() {
    byId("pipeline").innerHTML = data.layers
      .map((layer) => {
        const tickers = data.companies.filter((company) => company.layer === layer.id);
        return `
          <article class="pipeline-stage" style="--layer-color:${escapeHTML(layer.color)}">
            <span class="stage-number">LAYER ${layer.id}</span>
            <h3>${escapeHTML(layer.title)}</h3>
            <div class="stage-tickers">
              ${tickers.map((company) => `<span class="stage-ticker">${escapeHTML(company.ticker)}</span>`).join("")}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function filteredCompanies() {
    const query = state.query.trim().toLowerCase();
    return data.companies.filter((company) => {
      const categoryMatch = state.category === "All" || company.category === state.category;
      const searchable = [company.ticker, company.name, company.position, company.summary].join(" ").toLowerCase();
      return categoryMatch && (!query || searchable.includes(query));
    });
  }

  function formatPrice(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: Number(value) >= 1000 ? 2 : 3,
    }).format(Number(value));
  }

  function priceDirection(change) {
    if (!Number.isFinite(Number(change)) || Number(change) === 0) {
      return { className: "flat", icon: "•", label: "ทรงตัว" };
    }
    return Number(change) > 0
      ? { className: "up", icon: "▲", label: "ขึ้น" }
      : { className: "down", icon: "▼", label: "ลง" };
  }

  function priceChangeMarkup(quote, compact = false) {
    if (!quote || !Number.isFinite(Number(quote.changePercent))) {
      return '<span class="price-change unavailable">— ไม่มีข้อมูล</span>';
    }
    const direction = priceDirection(quote.change);
    const sign = Number(quote.changePercent) > 0 ? "+" : "";
    const changeValue = compact
      ? `${sign}${Number(quote.changePercent).toFixed(2)}%`
      : `${direction.label} ${sign}${Number(quote.change).toFixed(2)} (${sign}${Number(quote.changePercent).toFixed(2)}%)`;
    return `
      <span class="price-change ${direction.className}">
        <span aria-hidden="true">${direction.icon}</span>
        ${escapeHTML(changeValue)}
      </span>
    `;
  }

  function companyPriceMarkup(company) {
    if (!company.marketSymbol) {
      return `
        <div class="card-price">
          <span class="price-change unavailable">! รอยืนยัน Ticker</span>
        </div>
      `;
    }
    const quote = state.quotes[company.ticker];
    if (!quote && state.quoteLoading) {
      return '<div class="card-price"><span class="quote-skeleton" aria-label="กำลังโหลดราคา"></span></div>';
    }
    if (!quote) {
      return `
        <div class="card-price">
          <span class="card-price-value">—</span>
          <span class="price-change unavailable">ราคาไม่พร้อม</span>
        </div>
      `;
    }
    return `
      <div class="card-price" aria-label="${escapeHTML(`${company.ticker} ราคา ${formatPrice(quote.price)} ${priceDirection(quote.change).label} ${Number(quote.changePercent).toFixed(2)} เปอร์เซ็นต์`)}">
        <span class="card-price-value">${escapeHTML(formatPrice(quote.price))}</span>
        ${priceChangeMarkup(quote)}
      </div>
    `;
  }

  function renderMarketTape() {
    const container = byId("market-tape-items");
    const liveDot = byId("market-live-dot");
    const statusLabel = byId("market-status-label");
    const updatedLabel = byId("market-updated-label");
    const refreshButton = byId("market-refresh");
    const quotedCompanies = data.companies.filter((company) => company.marketSymbol);

    refreshButton.disabled = state.quoteLoading;
    refreshButton.classList.toggle("loading", state.quoteLoading);
    liveDot.classList.toggle("connected", Boolean(state.quoteMeta) && !state.quoteError);
    liveDot.classList.toggle("error", Boolean(state.quoteError));

    if (state.quoteError) {
      statusLabel.textContent = state.quoteMeta ? "กำลังแสดงราคาล่าสุด" : "ราคายังไม่พร้อม";
      updatedLabel.textContent = state.quoteMeta
        ? `${state.quoteError} · กำลังลองใหม่`
        : state.quoteError;
    } else if (state.quoteLoading && !state.quoteMeta) {
      statusLabel.textContent = "กำลังเชื่อมต่อราคา";
      updatedLabel.textContent = "อัปเดตอัตโนมัติทุก 30 วินาที";
    } else {
      const sessionLabel = state.quoteMeta?.marketStatus === "OPEN" ? "ตลาดเปิด" : "ตลาดปิด";
      statusLabel.textContent = `${sessionLabel} · ${state.quoteMeta?.source || "Market data"}`;
      const updatedAt = state.quoteMeta?.updatedAt ? new Date(state.quoteMeta.updatedAt) : new Date();
      updatedLabel.textContent = `ล่าสุด ${updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · รีเฟรช 30s`;
    }

    container.innerHTML = quotedCompanies
      .map((company) => {
        const quote = state.quotes[company.ticker];
        if (!quote && state.quoteLoading) {
          return `
            <span class="tape-quote">
              <span class="tape-symbol">${escapeHTML(company.ticker)}</span>
              <span class="quote-skeleton" aria-label="กำลังโหลดราคา"></span>
            </span>
          `;
        }
        return `
          <span class="tape-quote">
            <span class="tape-symbol">${escapeHTML(company.ticker)}</span>
            <span class="tape-price">${escapeHTML(quote ? formatPrice(quote.price) : "—")}</span>
            ${priceChangeMarkup(quote, true)}
          </span>
        `;
      })
      .join("");
  }

  function companyCard(company) {
    const layer = layerFor(company.layer);
    const incomplete =
      !company.name ||
      !company.position ||
      !Array.isArray(company.metrics) ||
      company.metrics.length === 0;
    const status = company.status || (incomplete ? "Incomplete data" : "");
    return `
      <button
        class="company-card"
        type="button"
        data-company="${escapeHTML(company.ticker)}"
        style="--layer-color:${escapeHTML(layer.color)}"
        aria-label="เปิดรายละเอียด ${escapeHTML(company.ticker)} ${escapeHTML(company.name || "ไม่ทราบชื่อ")}"
      >
        <span class="card-top">
          <span class="ticker">${escapeHTML(company.ticker)}</span>
          ${status
            ? `<span class="status-badge"><span aria-hidden="true">!</span>${escapeHTML(status)}</span>`
            : `<span class="layer-badge">L${company.layer} · ${escapeHTML(layer.label)}</span>`}
        </span>
        <h3>${escapeHTML(company.name || "ข้อมูลบริษัทไม่ครบ")}</h3>
        <p class="company-position">${escapeHTML(company.position || "Unknown position")}</p>
        <p class="company-summary">${escapeHTML(company.summary || "ยังไม่มีข้อมูลสรุป")}</p>
        ${companyPriceMarkup(company)}
        <span class="card-metrics" aria-label="Metrics สำคัญ">
          ${safeArray(company.metrics).slice(0, 3).map((metric) => `<span class="metric-chip">${escapeHTML(metric)}</span>`).join("")}
        </span>
        <span class="card-arrow" aria-hidden="true">→</span>
      </button>
    `;
  }

  function renderCompanies() {
    const filtered = filteredCompanies();
    const grid = byId("company-grid");
    grid.innerHTML = filtered.length
      ? filtered.map(companyCard).join("")
      : `
        <div class="empty-state">
          <h3>ไม่พบบริษัทที่ค้นหา</h3>
          <p>ลองใช้ Ticker อื่น หรือล้างตัวกรอง</p>
        </div>
      `;
    byId("results-count").textContent = `แสดง ${filtered.length} จาก ${data.companies.length} บริษัท`;
  }

  function renderSPCXAlert() {
    const config = data.spcxConfig;
    byId("spcx-alert").innerHTML = `
      <div>
        <strong>SPCX · ${config.verified ? "Verified" : "Needs verification"}</strong><br />
        ${escapeHTML(config.warning)}
      </div>
    `;
  }

  function renderRelationships() {
    byId("relationship-grid").innerHTML = data.relationships
      .map(
        (relation) => `
          <div
            class="relationship"
            tabindex="0"
            data-tooltip="${escapeHTML(relation.detail)}"
            aria-label="${escapeHTML(`${relation.from} ไป ${relation.to}: ${relation.detail}`)}"
          >
            <strong class="relation-node">${escapeHTML(relation.from)}</strong>
            <span class="relation-line" aria-hidden="true"><span>${escapeHTML(relation.label)}</span></span>
            <strong class="relation-node relation-target">${escapeHTML(relation.to)}</strong>
          </div>
        `,
      )
      .join("");
  }

  function renderScenarios() {
    byId("scenario-list").innerHTML = data.scenarios
      .map(
        (scenario, index) => `
          <details class="scenario-card"${index === 0 ? " open" : ""}>
            <summary>
              <span class="scenario-title-wrap">
                <span class="scenario-index">${String(index + 1).padStart(2, "0")}</span>
                <h3>${escapeHTML(scenario.title)}</h3>
              </span>
              <span class="scenario-chevron" aria-hidden="true">＋</span>
            </summary>
            <div class="scenario-body">
              <section class="scenario-column">
                <h4>สัญญาณที่ต้องดู</h4>
                <ul>${safeArray(scenario.signals).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
              </section>
              <section class="scenario-column impact">
                <h4>ผลกระทบที่เป็นไปได้</h4>
                <ul>${safeArray(scenario.impacts).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
              </section>
              <section class="scenario-column">
                <h4>ข้อควรระวัง</h4>
                <ul>${safeArray(scenario.cautions).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
              </section>
            </div>
          </details>
        `,
      )
      .join("");
  }

  function levelClass(level) {
    return String(level).toLowerCase().replaceAll(" ", "-");
  }

  function matrixComparator(a, b) {
    let result;
    if (state.sortKey === "company") {
      result = a.company.localeCompare(b.company);
    } else {
      result = (levelRank[a[state.sortKey]] ?? -1) - (levelRank[b[state.sortKey]] ?? -1);
    }
    return state.sortDirection === "asc" ? result : -result;
  }

  function renderMatrix() {
    byId("matrix-head").innerHTML = `
      <tr>
        ${matrixColumns
          .map(
            (column) => `
              <th scope="col">
                <button
                  class="sort-button"
                  type="button"
                  data-sort="${escapeHTML(column.key)}"
                  aria-sort="${state.sortKey === column.key ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none"}"
                >
                  ${escapeHTML(column.label)}
                  <span class="sort-icon" aria-hidden="true"></span>
                </button>
              </th>
            `,
          )
          .join("")}
      </tr>
    `;
    const rows = [...data.dependencyMatrix].sort(matrixComparator);
    byId("matrix-body").innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td><span class="matrix-company">${escapeHTML(row.company)}</span></td>
            ${matrixColumns
              .slice(1)
              .map((column) => `<td><span class="level-pill ${levelClass(row[column.key])}">${escapeHTML(row[column.key])}</span></td>`)
              .join("")}
          </tr>
        `,
      )
      .join("");
  }

  function checklistKey(ticker) {
    return `ai-value-chain-checklist:${ticker}`;
  }

  function customSPCXMetrics() {
    return loadJSON("ai-value-chain-spcx-metrics", []);
  }

  function metricsFor(company) {
    const base = safeArray(company.metrics);
    return company.ticker === "SPCX" ? [...base, ...customSPCXMetrics()] : base;
  }

  function checklistState(ticker) {
    return loadJSON(checklistKey(ticker), {});
  }

  function completionFor(company) {
    const metrics = metricsFor(company);
    const checked = checklistState(company.ticker);
    return {
      total: metrics.length,
      done: metrics.filter((metric) => checked[metric]).length,
    };
  }

  function renderTickerTabs() {
    byId("ticker-tabs").innerHTML = data.companies
      .map((company) => {
        const completion = completionFor(company);
        return `
          <button
            class="ticker-tab"
            type="button"
            role="tab"
            data-ticker="${escapeHTML(company.ticker)}"
            aria-selected="${company.ticker === state.checklistTicker}"
            tabindex="${company.ticker === state.checklistTicker ? "0" : "-1"}"
          >
            ${escapeHTML(company.ticker)}
            <span class="tab-completion">${completion.done}/${completion.total}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderChecklist() {
    const company = data.companies.find((item) => item.ticker === state.checklistTicker) || data.companies[0];
    state.checklistTicker = company.ticker;
    const metrics = metricsFor(company);
    const checked = checklistState(company.ticker);
    const completion = completionFor(company);
    const percentage = completion.total ? Math.round((completion.done / completion.total) * 100) : 0;

    renderTickerTabs();
    byId("checklist-card-head").innerHTML = `
      <div>
        <h3>${escapeHTML(company.ticker)} · Earnings focus</h3>
        <p>${escapeHTML(company.position)}</p>
      </div>
      ${company.status ? `<span class="status-badge">${escapeHTML(company.status)}</span>` : ""}
    `;
    byId("checklist-items").innerHTML = metrics.length
      ? metrics
          .map(
            (metric, index) => `
              <label class="check-item">
                <input
                  type="checkbox"
                  data-metric="${escapeHTML(metric)}"
                  ${checked[metric] ? "checked" : ""}
                />
                <span class="checkmark" aria-hidden="true">✓</span>
                <span>${escapeHTML(metric)}</span>
              </label>
            `,
          )
          .join("")
      : '<p class="empty-state">ยังไม่มี Checklist สำหรับบริษัทนี้</p>';
    byId("progress-label").textContent = `${completion.done} / ${completion.total}`;
    byId("progress-bar").style.width = `${percentage}%`;
    byId("spcx-add-form").hidden = company.ticker !== "SPCX";
  }

  function detailList(title, items) {
    return `
      <section class="drawer-section">
        <h3>${escapeHTML(title)}</h3>
        <ul class="detail-list">
          ${safeArray(items).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>ยังไม่มีข้อมูล</li>"}
        </ul>
      </section>
    `;
  }

  function impactRows(items) {
    if (!safeArray(items).length) {
      return '<p class="company-summary">ยังไม่มีข้อมูลความสัมพันธ์ที่ยืนยันแล้ว</p>';
    }
    return `
      <div class="impact-list">
        ${items
          .map(
            (item) => `
              <div class="impact-row">
                <strong>${escapeHTML(item.ticker)}</strong>
                <span class="impact-badge ${levelClass(item.level)}">${escapeHTML(item.level)}</span>
                <span>${escapeHTML(item.note)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function openDrawer(ticker, trigger) {
    const company = data.companies.find((item) => item.ticker === ticker);
    if (!company) {
      showToast(`ไม่พบข้อมูล ${ticker}`);
      return;
    }
    const layer = layerFor(company.layer);
    state.lastFocusedElement = trigger || document.activeElement;
    byId("drawer-content").innerHTML = `
      <p class="drawer-eyebrow">LAYER ${company.layer} · ${escapeHTML(layer.title)}</p>
      <h2 class="drawer-title" id="drawer-title">${escapeHTML(company.ticker)}</h2>
      <p class="drawer-name">${escapeHTML(company.name)}</p>
      <p class="drawer-summary">${escapeHTML(company.summary)}</p>
      ${company.warning ? `<p class="drawer-warning"><strong>Needs verification:</strong> ${escapeHTML(company.warning)}</p>` : ""}
      ${detailList("รายได้หลัก", company.revenue)}
      ${detailList("ลูกค้าหลัก", company.customers)}
      <section class="drawer-section">
        <div class="detail-columns">
          <div class="detail-box">
            <h4>Supplier / Dependency</h4>
            <ul>${safeArray(company.dependencies).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
          </div>
          <div class="detail-box">
            <h4>Growth drivers</h4>
            <ul>${safeArray(company.growthDrivers).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
          </div>
        </div>
      </section>
      ${detailList("Risk factors", company.risks)}
      ${detailList("Metrics ที่ต้องติดตาม", company.metrics)}
      <section class="drawer-section">
        <h3>เมื่องบบริษัทนี้ดี · Potential positive read-through</h3>
        ${impactRows(company.goodImpact)}
      </section>
      <section class="drawer-section">
        <h3>เมื่องบบริษัทนี้แย่ · Potential negative read-through</h3>
        ${impactRows(company.badImpact)}
      </section>
    `;
    const drawer = byId("company-drawer");
    drawer.style.setProperty("--drawer-color", layer.color);
    drawer.hidden = false;
    byId("drawer-backdrop").hidden = false;
    document.body.classList.add("drawer-open");
    byId("drawer-close").focus();
  }

  function closeDrawer() {
    byId("company-drawer").hidden = true;
    byId("drawer-backdrop").hidden = true;
    document.body.classList.remove("drawer-open");
    if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
      state.lastFocusedElement.focus();
    }
  }

  function trapDrawerFocus(event) {
    if (event.key !== "Tab" || byId("company-drawer").hidden) return;
    const focusable = $$('button, [href], input, [tabindex]:not([tabindex="-1"])', byId("company-drawer"))
      .filter((element) => !element.disabled && !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    byId("theme-toggle").setAttribute("aria-pressed", String(isLight));
    $(".theme-icon").textContent = isLight ? "☀" : "☾";
    $(".theme-label").textContent = isLight ? "Light" : "Dark";
    try {
      localStorage.setItem("ai-value-chain-theme", isLight ? "light" : "dark");
    } catch {
      // Theme still applies for the current session.
    }
  }

  let toastTimer;
  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function isStandaloneApp() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function closeInstallSheet() {
    byId("install-sheet").hidden = true;
    byId("install-backdrop").hidden = true;
    document.body.classList.remove("install-open");
    byId("install-app")?.focus();
  }

  function openInstallSheet() {
    byId("install-sheet").hidden = false;
    byId("install-backdrop").hidden = false;
    document.body.classList.add("install-open");
    byId("install-sheet-close").focus();
  }

  async function installApp() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    openInstallSheet();
  }

  function configureInstallExperience() {
    if (isStandaloneApp()) {
      document.body.classList.add("is-standalone");
      byId("install-app").hidden = true;
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      byId("install-app").hidden = false;
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      document.body.classList.add("is-standalone");
      byId("install-app").hidden = true;
      closeInstallSheet();
      showToast("ติดตั้ง AI Value Chain แล้ว");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !["http:", "https:"].includes(window.location.protocol)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    });
  }

  function restoreSavedQuotes() {
    const saved = loadJSON("ai-value-chain-last-quotes", null);
    if (!saved || !saved.quotes || !saved.meta) return;
    state.quotes = saved.quotes;
    state.quoteMeta = saved.meta;
  }

  function saveQuotesForFallback() {
    saveJSON("ai-value-chain-last-quotes", {
      quotes: state.quotes,
      meta: state.quoteMeta,
    });
  }

  function retryQuotesSoon() {
    if (quoteRetryTimer || document.hidden) return;
    quoteRetryTimer = window.setTimeout(() => {
      quoteRetryTimer = undefined;
      fetchQuotes();
    }, 5_000);
  }

  async function fetchQuotes({ manual = false } = {}) {
    if (state.quoteLoading) return;
    if (window.location.protocol === "file:") {
      state.quoteLoading = false;
      state.quoteError = "เปิดเวอร์ชัน Online เพื่อดูราคาล่าสุด";
      renderMarketTape();
      renderCompanies();
      return;
    }

    state.quoteLoading = true;
    if (manual) state.quoteError = "";
    renderMarketTape();

    try {
      const response = await fetch("/api/quotes", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || `Market data error ${response.status}`);
      }

      state.quotes = safeArray(payload.quotes).reduce((quotes, quote) => {
        if (quote?.ticker) quotes[quote.ticker] = quote;
        return quotes;
      }, {});
      state.quoteMeta = {
        source: payload.source,
        marketStatus: payload.marketStatus,
        updatedAt: payload.updatedAt,
      };
      state.quoteError = "";
      clearTimeout(quoteRetryTimer);
      quoteRetryTimer = undefined;
      saveQuotesForFallback();
    } catch (error) {
      state.quoteError = error?.message || "ไม่สามารถโหลดราคาล่าสุด";
      retryQuotesSoon();
    } finally {
      state.quoteLoading = false;
      renderMarketTape();
      renderCompanies();
    }
  }

  function bindEvents() {
    byId("theme-toggle").addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    byId("market-refresh").addEventListener("click", () => {
      fetchQuotes({ manual: true });
    });

    byId("install-app").addEventListener("click", installApp);
    byId("install-sheet-close").addEventListener("click", closeInstallSheet);
    byId("install-backdrop").addEventListener("click", closeInstallSheet);

    byId("company-search").addEventListener("input", (event) => {
      state.query = event.target.value;
      renderCompanies();
    });

    byId("category-filters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      renderFilters();
      renderCompanies();
    });

    byId("clear-filters").addEventListener("click", () => {
      state.category = "All";
      state.query = "";
      byId("company-search").value = "";
      renderFilters();
      renderCompanies();
      byId("company-search").focus();
    });

    byId("company-grid").addEventListener("click", (event) => {
      const card = event.target.closest("[data-company]");
      if (card) openDrawer(card.dataset.company, card);
    });

    byId("drawer-close").addEventListener("click", closeDrawer);
    byId("drawer-backdrop").addEventListener("click", closeDrawer);
    byId("company-drawer").addEventListener("keydown", trapDrawerFocus);

    byId("matrix-head").addEventListener("click", (event) => {
      const button = event.target.closest("[data-sort]");
      if (!button) return;
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDirection = key === "company" ? "asc" : "desc";
      }
      renderMatrix();
    });

    byId("ticker-tabs").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-ticker]");
      if (!tab) return;
      state.checklistTicker = tab.dataset.ticker;
      renderChecklist();
      $(`[data-ticker="${CSS.escape(state.checklistTicker)}"]`, byId("ticker-tabs"))?.focus();
    });

    byId("ticker-tabs").addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const tabs = $$("[data-ticker]", byId("ticker-tabs"));
      const current = tabs.findIndex((tab) => tab.dataset.ticker === state.checklistTicker);
      let next = current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (current + 1) % tabs.length;
      else next = (current - 1 + tabs.length) % tabs.length;
      event.preventDefault();
      state.checklistTicker = tabs[next].dataset.ticker;
      renderChecklist();
      $(`[data-ticker="${CSS.escape(state.checklistTicker)}"]`, byId("ticker-tabs"))?.focus();
    });

    byId("checklist-items").addEventListener("change", (event) => {
      if (!event.target.matches("input[type='checkbox'][data-metric]")) return;
      const saved = checklistState(state.checklistTicker);
      saved[event.target.dataset.metric] = event.target.checked;
      saveJSON(checklistKey(state.checklistTicker), saved);
      renderChecklist();
    });

    byId("reset-checklist").addEventListener("click", () => {
      saveJSON(checklistKey(state.checklistTicker), {});
      renderChecklist();
      showToast(`รีเซ็ต Checklist ${state.checklistTicker} แล้ว`);
    });

    byId("spcx-add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = byId("spcx-metric");
      const value = input.value.trim();
      if (!value) return;
      const custom = customSPCXMetrics();
      if (custom.some((item) => item.toLowerCase() === value.toLowerCase())) {
        showToast("มีหัวข้อนี้อยู่แล้ว");
        return;
      }
      custom.push(value);
      saveJSON("ai-value-chain-spcx-metrics", custom);
      input.value = "";
      renderChecklist();
      input.focus();
    });

    document.addEventListener("keydown", (event) => {
      const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if (event.key === "/" && !isTyping && byId("company-drawer").hidden) {
        event.preventDefault();
        byId("company-search").focus();
      }
      if (event.key === "Escape") {
        if (!byId("install-sheet").hidden) closeInstallSheet();
        else if (!byId("company-drawer").hidden) closeDrawer();
        else if (state.query) {
          state.query = "";
          byId("company-search").value = "";
          renderCompanies();
        }
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) fetchQuotes();
    });
  }

  function init() {
    const savedTheme = (() => {
      try {
        return localStorage.getItem("ai-value-chain-theme");
      } catch {
        return null;
      }
    })();
    applyTheme(savedTheme === "light" ? "light" : "dark");
    restoreSavedQuotes();
    renderHeroStats();
    renderMarketTape();
    renderFilters();
    renderLegend();
    renderPipeline();
    renderCompanies();
    renderSPCXAlert();
    renderRelationships();
    renderScenarios();
    renderMatrix();
    renderChecklist();
    bindEvents();
    configureInstallExperience();
    registerServiceWorker();
    fetchQuotes();
    window.setInterval(() => {
      if (!document.hidden) fetchQuotes();
    }, 30_000);
  }

  try {
    init();
  } catch (error) {
    console.error("Dashboard initialization failed:", error);
    document.body.insertAdjacentHTML(
      "afterbegin",
      '<div class="spcx-alert" role="alert"><strong>เกิดข้อผิดพลาดขณะเปิด Dashboard</strong> กรุณารีเฟรชหน้าและตรวจสอบข้อมูลใน data.js</div>',
    );
  }
})();
