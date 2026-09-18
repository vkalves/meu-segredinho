const periodData = {
  "7d": {
    gross: 42860,
    net: 33020,
    subscriptions: 1142,
    ticket: 37.53,
    trend: 7.8,
    values: [4200, 5350, 4880, 6720, 5980, 7420, 8310],
    labels: ["12 set", "13 set", "14 set", "15 set", "16 set", "17 set", "18 set"],
  },
  "30d": {
    gross: 184760,
    net: 142540,
    subscriptions: 4862,
    ticket: 38.01,
    trend: 18.4,
    values: [18600, 21400, 20300, 26600, 25100, 32400, 40360],
    labels: ["20 ago", "25 ago", "30 ago", "04 set", "09 set", "14 set", "18 set"],
  },
  "90d": {
    gross: 511320,
    net: 394100,
    subscriptions: 13412,
    ticket: 38.12,
    trend: 21.6,
    values: [52400, 61700, 58900, 72400, 78900, 86100, 100920],
    labels: ["jun", "01 jul", "15 jul", "01 ago", "15 ago", "01 set", "18 set"],
  },
  year: {
    gross: 1825640,
    net: 1405730,
    subscriptions: 46980,
    ticket: 38.86,
    trend: 34.9,
    values: [142000, 198500, 221300, 267400, 286700, 321200, 388540],
    labels: ["mar", "abr", "mai", "jun", "jul", "ago", "set"],
  },
};

const platformInfo = {
  all: { label: "Todas", share: 1, netFactor: 1, trendOffset: 0 },
  onlyfans: { label: "OnlyFans", share: 0.48, netFactor: 0.8, trendOffset: 2.8 },
  privacy: { label: "Privacy", share: 0.35, netFactor: 0.8, trendOffset: -3.6 },
  telegram: { label: "Telegram", share: 0.17, netFactor: 0.96, trendOffset: -1.3 },
};

const viewCopy = {
  overview: ["Visão geral", "Acompanhe o desempenho consolidado da operação."],
  platforms: ["Plataformas", "Compare receita, participação e avanço das metas."],
  creators: ["Criadoras", "Veja o desempenho individual no período selecionado."],
  reports: ["Relatórios", "Consulte e exporte as movimentações da operação."],
  goals: ["Metas", "Ajuste a meta mensal e acompanhe o ritmo da agência."],
};

const state = {
  view: "overview",
  period: readStorage("privame-period", "30d"),
  platform: "all",
  goal: Number(readStorage("privame-goal", "260000")) || 260000,
};

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The interface remains fully functional when storage is unavailable.
  }
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const brlDecimal = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function getSummary(period = state.period, platform = state.platform) {
  if (!periodData[period]) throw new Error("Período inválido.");
  if (!platformInfo[platform]) throw new Error("Plataforma inválida.");

  const base = periodData[period];
  const info = platformInfo[platform];
  const gross = Math.round(base.gross * info.share);
  const net = platform === "all" ? base.net : Math.round(gross * info.netFactor);
  const subscriptions = Math.max(1, Math.round(base.subscriptions * info.share));
  const ticket = gross / subscriptions;
  const trend = Math.max(0, base.trend + info.trendOffset);
  const values = base.values.map((value, index) => {
    if (platform === "all") return value;
    const rhythm = 0.94 + ((index + Object.keys(platformInfo).indexOf(platform)) % 3) * 0.035;
    return Math.round(value * info.share * rhythm);
  });

  return { gross, net, subscriptions, ticket, trend, values, labels: base.labels, platform: info.label };
}

function formatCompact(value) {
  return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
}

function renderSummary() {
  const summary = getSummary();
  document.getElementById("gross-revenue").textContent = brl.format(summary.gross);
  document.getElementById("net-revenue").textContent = brl.format(summary.net);
  document.getElementById("subscriptions").textContent = integer.format(summary.subscriptions);
  document.getElementById("average-ticket").textContent = brlDecimal.format(summary.ticket);
  document.getElementById("gross-trend").innerHTML = `↗ ${summary.trend.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span>vs. período anterior</span>`;
  document.getElementById("net-trend").innerHTML = `↗ ${Math.max(0, summary.trend - 1.5).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span>após taxas</span>`;
  document.getElementById("subscriptions-trend").innerHTML = `↗ ${Math.max(0, summary.trend - 5.8).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span>novas e renovadas</span>`;
  document.getElementById("ticket-trend").innerHTML = `↗ ${Math.max(0, summary.trend / 3.5).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span>por assinatura</span>`;
  document.getElementById("chart-caption").textContent = state.platform === "all" ? "Receita consolidada no período" : `Receita de ${summary.platform} no período`;
  document.getElementById("donut-total").textContent = formatCompact(summary.gross);

  drawRevenueChart(summary.values, summary.labels);
  updatePlatformCards();
  updateDonut();
  updateTransactions();
  updateGoal();
}

function drawRevenueChart(values, labels) {
  const min = Math.min(...values) * 0.78;
  const max = Math.max(...values) * 1.08;
  const width = 680;
  const startX = 20;
  const baseY = 225;
  const chartHeight = 190;
  const points = values.map((value, index) => ({
    x: startX + (index * width) / (values.length - 1),
    y: baseY - ((value - min) / Math.max(1, max - min)) * chartHeight,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${points.at(-1).x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;
  document.getElementById("revenue-line").setAttribute("d", line);
  document.getElementById("revenue-area").setAttribute("d", area);
  document.getElementById("revenue-points").innerHTML = points
    .map((point) => `<circle class="point" cx="${point.x}" cy="${point.y}" r="5" />`)
    .join("");
  document.getElementById("axis-labels").innerHTML = labels.map((label) => `<span>${label}</span>`).join("");
}

function updatePlatformCards() {
  const gross = periodData[state.period].gross;
  Object.entries(platformInfo).forEach(([key, info]) => {
    if (key === "all") return;
    const value = document.querySelector(`[data-platform-value="${key}"]`);
    const card = document.querySelector(`[data-platform-card="${key}"]`);
    if (value) value.textContent = brl.format(Math.round(gross * info.share));
    if (card) card.hidden = state.platform !== "all" && state.platform !== key;
  });
}

function updateDonut() {
  const donut = document.getElementById("platform-donut");
  const shares = {
    onlyfans: document.getElementById("share-onlyfans"),
    privacy: document.getElementById("share-privacy"),
    telegram: document.getElementById("share-telegram"),
  };

  if (state.platform === "all") {
    donut.style.background = "conic-gradient(#ed887c 0 48%, #cba58f 48% 83%, #665047 83% 100%)";
    shares.onlyfans.textContent = "48%";
    shares.privacy.textContent = "35%";
    shares.telegram.textContent = "17%";
    return;
  }

  const color = { onlyfans: "#ed887c", privacy: "#cba58f", telegram: "#665047" }[state.platform];
  donut.style.background = `conic-gradient(${color} 0 100%)`;
  Object.entries(shares).forEach(([key, element]) => {
    element.textContent = key === state.platform ? "100%" : "0%";
  });
}

function updateTransactions() {
  document.querySelectorAll("[data-row-platform]").forEach((row) => {
    row.hidden = state.platform !== "all" && row.dataset.rowPlatform !== state.platform;
  });
}

function updateGoal() {
  const current = getSummary(state.period, "all").gross;
  const percent = Math.min(100, Math.round((current / state.goal) * 100));
  const remaining = Math.max(0, state.goal - current);
  document.getElementById("goal-current").firstChild.textContent = `${brl.format(current)} `;
  document.getElementById("goal-target-label").textContent = brl.format(state.goal);
  document.getElementById("goal-percent").textContent = `${percent}%`;
  document.getElementById("goal-ring").style.setProperty("--progress", `${percent}%`);
  document.getElementById("goal-remaining").textContent = brl.format(remaining);
  document.getElementById("goal-input").value = state.goal;
}

function setPeriod(period, announce = false) {
  if (!periodData[period]) throw new Error("Período inválido.");
  state.period = period;
  document.getElementById("period-select").value = period;
  writeStorage("privame-period", period);
  renderSummary();
  if (announce) showToast("Período atualizado no dashboard.");
}

function setPlatform(platform, announce = false) {
  if (!platformInfo[platform]) throw new Error("Plataforma inválida.");
  state.platform = platform;
  document.querySelectorAll("[data-platform]").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === platform);
  });
  renderSummary();
  if (announce) showToast(`Filtro aplicado: ${platformInfo[platform].label}.`);
}

function setView(view) {
  if (!viewCopy[view]) return;
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view-section").forEach((section) => {
    section.hidden = !section.dataset.views.split(" ").includes(view);
  });
  const lower = document.querySelector(".lower-grid");
  const visibleLower = [...lower.children].filter((child) => !child.hidden).length;
  lower.hidden = visibleLower === 0;
  lower.classList.toggle("single", visibleLower === 1);
  document.getElementById("view-title").textContent = viewCopy[view][0];
  document.getElementById("view-subtitle").textContent = viewCopy[view][1];
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-message").textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function saveGoal(value, announce = true) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 50000) throw new Error("A meta precisa ser de pelo menos R$ 50.000.");
  state.goal = parsed;
  writeStorage("privame-goal", parsed);
  updateGoal();
  if (announce) showToast("Meta mensal atualizada.");
  return { goal: parsed, progressPercent: Math.min(100, Math.round((periodData[state.period].gross / parsed) * 100)) };
}

function exportCsv() {
  const headers = ["Data", "Plataforma", "Origem", "Bruto", "Líquido", "Status"];
  const rows = [...document.querySelectorAll("#transactions-table tr")]
    .filter((row) => !row.hidden)
    .map((row) => [...row.cells].map((cell) => cell.textContent.trim()));
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `privame-relatorio-${state.period}-${state.platform}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Relatório CSV exportado.");
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("show");
  document.getElementById("mobile-menu").setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
  document.getElementById("mobile-menu").setAttribute("aria-expanded", "false");
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-platform]").forEach((button) => button.addEventListener("click", () => setPlatform(button.dataset.platform)));
document.getElementById("period-select").addEventListener("change", (event) => setPeriod(event.target.value));
document.getElementById("save-goal").addEventListener("click", () => {
  try {
    saveGoal(document.getElementById("goal-input").value);
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById("refresh-button").addEventListener("click", () => {
  const now = new Date();
  document.getElementById("last-update").textContent = `Atualizado hoje, ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  renderSummary();
  showToast("Dados demonstrativos atualizados.");
});
document.getElementById("export-report").addEventListener("click", exportCsv);
document.getElementById("mobile-menu").addEventListener("click", openSidebar);
document.getElementById("sidebar-overlay").addEventListener("click", closeSidebar);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      // Unsupported implementations are ignored without affecting the visible dashboard.
    }
  };

  register({
    name: "read_revenue_summary",
    title: "Consultar resumo de faturamento",
    description: "Retorna o resumo demonstrativo de receita da Privame para um período e plataforma.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["7d", "30d", "90d", "year"] },
        platform: { type: "string", enum: ["all", "onlyfans", "privacy", "telegram"] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute(input = {}) {
      const period = input.period || state.period;
      const platform = input.platform || state.platform;
      const summary = getSummary(period, platform);
      return { period, platform, gross: summary.gross, net: summary.net, subscriptions: summary.subscriptions, averageTicket: Number(summary.ticket.toFixed(2)), trendPercent: summary.trend };
    },
  });

  register({
    name: "set_dashboard_filters",
    title: "Alterar filtros do dashboard",
    description: "Atualiza o período e a plataforma exibidos no dashboard Privame.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["7d", "30d", "90d", "year"] },
        platform: { type: "string", enum: ["all", "onlyfans", "privacy", "telegram"] },
      },
      minProperties: 1,
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || (input.period === undefined && input.platform === undefined)) throw new Error("Informe period ou platform.");
      if (input.period !== undefined) setPeriod(input.period);
      if (input.platform !== undefined) setPlatform(input.platform);
      return { period: state.period, platform: state.platform };
    },
  });

  register({
    name: "update_monthly_goal",
    title: "Atualizar meta mensal",
    description: "Salva uma nova meta mensal e atualiza o progresso visível no dashboard.",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number", minimum: 50000 } },
      required: ["amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || typeof input.amount !== "number") throw new Error("Informe amount como número.");
      return saveGoal(input.amount, false);
    },
  });

  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}

document.getElementById("period-select").value = periodData[state.period] ? state.period : "30d";
state.period = document.getElementById("period-select").value;
setView("overview");
renderSummary();
registerWebMcpTools();
