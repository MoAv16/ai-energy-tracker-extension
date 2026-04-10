// AI Energy Monitor – Dashboard
// Reads directly from chrome.storage.local

const SERVICES = {
  chatgpt:    { label: "ChatGPT",     color: "#5b8af0" },
  copilot:    { label: "Copilot",     color: "#41c5ff" },
  gemini:     { label: "Gemini",      color: "#f59e0b" },
  claude:     { label: "Claude",      color: "#c084fc" },
  perplexity: { label: "Perplexity",  color: "#f97316" },
  google:     { label: "Google",      color: "#2ac878" },
};

const CO2_PER_KWH = 380;

// Chart global defaults matching popup aesthetic
Chart.defaults.color          = "#4d6680";
Chart.defaults.borderColor    = "rgba(65,197,255,0.07)";
Chart.defaults.font.family    = "'Courier New', Consolas, monospace";
Chart.defaults.font.size      = 10;

let currentDays = 7;
let charts      = {};
let currentData = {}; // wird bei jedem refresh gesetzt

// ── Helpers ───────────────────────────────────────────────

function dateRange(days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function fmtDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  if (days <= 14) return d.toLocaleDateString("en", { month: "numeric", day: "numeric" });
  if (days <= 30) return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function animateNum(el, target, decimals) {
  const start = performance.now();
  const dur = 600;
  (function tick(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = decimals === 0
      ? Math.round(target * ease).toLocaleString()
      : (target * ease).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

// ── Storage ───────────────────────────────────────────────
// Liest via Background-Message: nutzt EnergiStorage.getDayData()
// → Filesystem-Daten wenn Ordner verbunden, sonst chrome.storage.local

function loadRange(days) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'get-range', days }, resp => {
      if (chrome.runtime.lastError || !resp?.data) {
        // Fallback: direkt aus chrome.storage.local
        const dates = dateRange(days);
        chrome.storage.local.get(dates.map(d => "day_" + d), result => {
          const map = {};
          dates.forEach(d => {
            map[d] = result["day_" + d] || { services: {}, totalWh: 0, requests: [] };
          });
          resolve(map);
        });
      } else {
        resolve(resp.data);
      }
    });
  });
}

// ── Charts ────────────────────────────────────────────────

function kill(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

function chartTrend(byDate, days) {
  kill("trend");
  const dates  = Object.keys(byDate).sort();
  const labels = dates.map(d => fmtDate(d, days));
  const data   = dates.map(d => +(byDate[d].totalWh || 0).toFixed(3));

  const ctx  = document.getElementById("trendChart").getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, "rgba(65,197,255,0.18)");
  grad.addColorStop(1, "rgba(65,197,255,0.01)");

  charts.trend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data,
        borderColor: "#41c5ff",
        backgroundColor: grad,
        borderWidth: 1.5,
        pointRadius: days <= 14 ? 2 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: "#41c5ff",
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#07101f",
          borderColor: "rgba(65,197,255,0.2)",
          borderWidth: 1,
          titleFont: { family: "'Courier New', monospace", size: 10 },
          bodyFont:  { family: "'Courier New', monospace", size: 10 },
          callbacks: { label: c => " " + c.parsed.y.toFixed(3) + " Wh" }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, maxTicksLimit: days <= 14 ? 14 : 8 }
        },
        y: {
          grid: { color: "rgba(65,197,255,0.05)" },
          ticks: { callback: v => v + " Wh" },
          beginAtZero: true,
        }
      }
    }
  });
}

function chartDonut(byDate) {
  kill("donut");
  const totals = {};
  Object.values(byDate).forEach(day =>
    Object.entries(day.services || {}).forEach(([k, v]) => {
      totals[k] = (totals[k] || 0) + (v.wh || 0);
    })
  );
  const keys = Object.keys(totals).filter(k => totals[k] > 0);
  if (!keys.length) return;

  charts.donut = new Chart(document.getElementById("donutChart"), {
    type: "doughnut",
    data: {
      labels: keys.map(k => (SERVICES[k] || { label: k }).label),
      datasets: [{
        data: keys.map(k => +totals[k].toFixed(3)),
        backgroundColor: keys.map(k => (SERVICES[k] || { color: "#888" }).color),
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { animateRotate: true, duration: 700, easing: "easeOutQuart" },
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 7, padding: 10, usePointStyle: true, pointStyle: "circle", font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: "#07101f",
          borderColor: "rgba(65,197,255,0.2)",
          borderWidth: 1,
          callbacks: { label: c => " " + c.parsed.toFixed(3) + " Wh" }
        }
      }
    }
  });
}

function chartStack(byDate, days) {
  kill("stack");
  const dates = Object.keys(byDate).sort();
  const labels = dates.map(d => fmtDate(d, days));

  const svcs = new Set();
  Object.values(byDate).forEach(day => Object.keys(day.services || {}).forEach(s => svcs.add(s)));

  const datasets = [...svcs].map(svc => ({
    label: (SERVICES[svc] || { label: svc }).label,
    backgroundColor: (SERVICES[svc] || { color: "#888" }).color,
    data: dates.map(d => +((byDate[d].services || {})[svc]?.wh || 0).toFixed(3)),
    borderWidth: 0,
    borderRadius: 2,
    borderSkipped: false,
  }));

  charts.stack = new Chart(document.getElementById("stackChart"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      interaction: { mode: "index" },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 7, padding: 10, usePointStyle: true, pointStyle: "circle", font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: "#07101f",
          borderColor: "rgba(65,197,255,0.2)",
          borderWidth: 1,
          callbacks: { label: c => " " + c.dataset.label + ": " + c.parsed.y.toFixed(3) + " Wh" }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 10 } },
        y: { stacked: true, grid: { color: "rgba(65,197,255,0.05)" }, ticks: { callback: v => v + " Wh" }, beginAtZero: true }
      }
    }
  });
}

// ── Panels ────────────────────────────────────────────────

function renderHero(byDate, days) {
  const today = new Date().toISOString().slice(0, 10);
  const todayWh = byDate[today]?.totalWh || 0;
  const periodWh = Object.values(byDate).reduce((s, d) => s + (d.totalWh || 0), 0);
  const reqs = Object.values(byDate).reduce((s, d) =>
    s + Object.values(d.services || {}).reduce((x, v) => x + (v.count || 0), 0), 0);
  const co2 = periodWh / 1000 * CO2_PER_KWH;

  animateNum(document.getElementById("statToday"),  todayWh,  2);
  animateNum(document.getElementById("statPeriod"), periodWh, 2);
  animateNum(document.getElementById("statReqs"),   reqs,     0);
  animateNum(document.getElementById("statCo2"),    co2,      2);

  const avg = days > 0 ? (periodWh / days).toFixed(2) : "0.00";
  document.getElementById("subToday").textContent  = chrome.i18n.getMessage("dashVsAvg",     [avg]);
  document.getElementById("subPeriod").textContent = chrome.i18n.getMessage("dashOverDays",  [days]);
  document.getElementById("subReqs").textContent   = chrome.i18n.getMessage("dashPerDayAvg", [(reqs / days).toFixed(1)]);
}

function renderSvcTable(byDate) {
  const totals = {};
  const counts = {};
  Object.values(byDate).forEach(day =>
    Object.entries(day.services || {}).forEach(([k, v]) => {
      totals[k] = (totals[k] || 0) + (v.wh    || 0);
      counts[k] = (counts[k] || 0) + (v.count || 0);
    })
  );
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0]?.[1] || 1;
  const table  = document.getElementById("svcTable");
  table.innerHTML = "";

  if (!sorted.length) {
    table.innerHTML = '<tr><td class="empty">' + chrome.i18n.getMessage("dashNoData") + '</td></tr>';
    return;
  }

  sorted.forEach(([svc, wh], i) => {
    const info = SERVICES[svc] || { label: svc, color: "#888" };
    const pct  = (wh / max * 100).toFixed(1);
    const tr   = document.createElement("tr");
    tr.style.animationDelay = (i * 0.05) + "s";
    tr.innerHTML = `
      <td class="svc-name-cell">
        <span class="svc-color-dot" style="background:${info.color}"></span>${info.label}
      </td>
      <td class="svc-bar-cell">
        <div class="svc-bar-bg">
          <div class="svc-bar-fill" style="background:${info.color}" data-pct="${pct}"></div>
        </div>
      </td>
      <td class="svc-wh-cell">${wh.toFixed(2)} Wh</td>
      <td class="svc-count-cell">${counts[svc]}×</td>
    `;
    table.appendChild(tr);
    requestAnimationFrame(() => {
      setTimeout(() => { tr.querySelector(".svc-bar-fill").style.width = pct + "%"; }, 40 + i * 50);
    });
  });
}

function renderReqLog(byDate) {
  const all = [];
  Object.values(byDate).forEach(day => (day.requests || []).forEach(r => all.push(r)));
  all.sort((a, b) => b.time - a.time);

  const log = document.getElementById("reqLog");
  log.innerHTML = "";

  if (!all.length) {
    log.innerHTML = '<div class="empty">' + chrome.i18n.getMessage("dashNoRequests") + '</div>';
    return;
  }

  all.slice(0, 40).forEach((req, i) => {
    const info    = SERVICES[req.service] || { label: req.service, color: "#888" };
    const preview = (req.promptPreview || "").trim() || "—";
    const row     = document.createElement("div");
    row.className = "req-row";
    row.style.animationDelay = (i * 0.03) + "s";
    row.innerHTML = `
      <span class="req-svc" style="color:${info.color}">${info.label}</span>
      <span class="req-preview" title="${preview.replace(/"/g, "&quot;")}">${preview}</span>
      <span class="req-wh">${(req.wh || 0).toFixed(3)}</span>
      <span class="req-time">${fmtTime(req.time)}</span>
    `;
    log.appendChild(row);
  });
}

// ── CSV Export ────────────────────────────────────────────

function exportCsv(byDate, days) {
  const _ = k => chrome.i18n.getMessage(k) || k;
  const rows = [
    [_("csvDate"), _("csvService"), _("csvRequests"), _("csvPromptTokens"), _("csvResponseTokens"), _("csvWh"), _("csvTime")]
  ];

  Object.keys(byDate).sort().forEach(date => {
    const day = byDate[date];
    Object.entries(day.services || {}).forEach(([svc, sd]) => {
      if (!sd.count && !sd.wh) return;
      rows.push([
        date,
        (SERVICES[svc] || { label: svc }).label,
        sd.count        || 0,
        sd.promptTokens || 0,
        sd.responseTokens || 0,
        (sd.wh || 0).toFixed(4),
        sd.timeSpentMs ? (sd.timeSpentMs / 60000).toFixed(1) : "0"
      ]);
    });
  });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ki-energie-${new Date().toISOString().slice(0, 10)}-${days}d.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main ──────────────────────────────────────────────────

async function refresh(days) {
  const byDate  = await loadRange(days);
  currentData   = byDate;
  renderHero(byDate, days);
  chartTrend(byDate, days);
  chartDonut(byDate);
  chartStack(byDate, days);
  renderSvcTable(byDate);
  renderReqLog(byDate);
}

// Export
document.getElementById("btnExportCsv").addEventListener("click", () => {
  exportCsv(currentData, currentDays);
});

// Range buttons
document.querySelectorAll(".range-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentDays = parseInt(btn.dataset.days);
    refresh(currentDays);
  });
});

// Nav date
document.getElementById("navDate").textContent =
  new Date().toISOString().slice(0, 10);

// Init
refresh(currentDays);

// Live update on new requests
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some(k => k.startsWith("day_"))) {
    refresh(currentDays);
  }
});
