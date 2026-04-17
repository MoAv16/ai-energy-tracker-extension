// AI Energy Monitor – Unternehmens-Dashboard

const SERVICES = {
  chatgpt:          { label: 'ChatGPT',     color: '#5b8af0' },
  copilot:          { label: 'Copilot',     color: '#0ea5e9' },
  gemini:           { label: 'Gemini',      color: '#f59e0b' },
  claude:           { label: 'Claude',      color: '#c084fc' },
  perplexity:       { label: 'Perplexity',  color: '#f97316' },
  google:           { label: 'Google',      color: '#2ac878' },
  'google-ai-mode': { label: 'Google AI',   color: '#34d399' },
};

const CO2_PER_KWH = 380;

// ── Abteilungs-Definitionen ───────────────────────────────
// id        : interner Schlüssel
// name      : Anzeigename
// color     : Akzentfarbe der Abteilung
// members   : Mitgliederzahl
// scale     : Skalierungsfaktor relativ zu "Meine Abteilung" (MY_DEPT_ID)
// profile   : Dienst-Verteilung (Anteile, müssen nicht 1 ergeben)

const DEFAULT_DEPTS = [
  {
    id: 'it', name: 'IT & Entwicklung', color: '#5b8af0', members: 12, scale: 1.0,
    profile: { chatgpt: 0.35, copilot: 0.30, claude: 0.20, gemini: 0.15 },
  },
  {
    id: 'marketing', name: 'Marketing', color: '#f59e0b', members: 8, scale: 0.75,
    profile: { chatgpt: 0.50, gemini: 0.30, perplexity: 0.20 },
  },
  {
    id: 'sales', name: 'Vertrieb', color: '#10b981', members: 15, scale: 0.60,
    profile: { chatgpt: 0.60, copilot: 0.25, gemini: 0.15 },
  },
  {
    id: 'hr', name: 'HR & Verwaltung', color: '#c084fc', members: 6, scale: 0.30,
    profile: { chatgpt: 0.70, gemini: 0.20, claude: 0.10 },
  },
  {
    id: 'finance', name: 'Finanzen', color: '#f97316', members: 9, scale: 0.45,
    profile: { copilot: 0.50, chatgpt: 0.35, claude: 0.15 },
  },
  {
    id: 'product', name: 'Produkt & Design', color: '#0ea5e9', members: 7, scale: 0.55,
    profile: { claude: 0.40, chatgpt: 0.35, gemini: 0.25 },
  },
];

// Welche Abteilung gehört dem aktuellen Nutzer
let DEPTS = DEFAULT_DEPTS.map(dept => ({ ...dept, profile: { ...(dept.profile || {}) } }));
let MY_DEPT_ID = 'it';
let COMPANY_CONFIG = null;

// ── Zustand ────────────────────────────────────────────────
let currentDays   = 7;
let currentDeptId = null;
let allDeptsData  = {};
let charts        = {};

// ── Chart.js Defaults ─────────────────────────────────────
Chart.defaults.color       = '#7a6a58';
Chart.defaults.borderColor = 'rgba(160,130,90,0.15)';
Chart.defaults.font.family = "ui-monospace, 'SF Mono', Consolas, monospace";
Chart.defaults.font.size   = 10;

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
  const d = new Date(iso + 'T00:00:00');
  if (days <= 14) return d.toLocaleDateString('de', { month: 'numeric', day: 'numeric' });
  return d.toLocaleDateString('de', { month: 'short', day: 'numeric' });
}

function animateNum(el, target, decimals) {
  if (!el) return;
  const start = performance.now();
  const dur   = 600;
  (function tick(now) {
    const t    = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = decimals === 0
      ? Math.round(target * ease).toLocaleString('de')
      : (target * ease).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

function kill(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function cloneDefaultDepts() {
  return DEFAULT_DEPTS.map(dept => ({ ...dept, profile: { ...(dept.profile || {}) } }));
}

function getDashboardIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('dashboardId') || '';
}

function applyCompanyBranding(config) {
  const name = config?.companyName || config?.name || 'Unternehmen';
  const tagline = config?.companyTagline || 'Unternehmens-Dashboard';
  document.title = `${name} ${tagline}`;

  const nameEl = document.getElementById('legacyCompanyName');
  const taglineEl = document.getElementById('legacyCompanyTagline');
  const footerEl = document.getElementById('legacyCompanyFooter');
  const logoEl = document.getElementById('legacyCompanyLogo');

  if (nameEl) nameEl.textContent = name;
  if (taglineEl) taglineEl.textContent = tagline;
  if (footerEl) footerEl.textContent = `Alle Daten lokal gespeichert · ${name} · ${tagline}`;

  if (logoEl) {
    if (config?.logoDataUrl) {
      logoEl.src = config.logoDataUrl;
      logoEl.alt = name;
      logoEl.style.display = '';
    } else if (config?.logoUrl) {
      logoEl.src = /^https?:|^chrome-extension:|^\.\.?\//.test(config.logoUrl)
        ? config.logoUrl
        : chrome.runtime.getURL(config.logoUrl);
      logoEl.alt = name;
      logoEl.style.display = '';
    } else {
      logoEl.removeAttribute('src');
      logoEl.alt = '';
      logoEl.style.display = 'none';
    }
  }
}

function applyCompanyConfig(config) {
  COMPANY_CONFIG = config || null;
  DEPTS = (config?.departments?.length ? config.departments : cloneDefaultDepts()).map(dept => ({
    ...dept,
    profile: { ...(dept.profile || {}) }
  }));
  MY_DEPT_ID = config?.myDepartmentId || DEPTS[0]?.id || 'it';
  applyCompanyBranding(config || {});
}

function loadCompanyConfig() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: 'company-dashboard-get', id: getDashboardIdFromUrl() || null },
      resp => resolve(resp?.dashboard || null)
    );
  });
}

// ── Storage ───────────────────────────────────────────────

function loadRange(days) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'get-range', days }, resp => {
      if (chrome.runtime.lastError || !resp?.data) {
        const dates = dateRange(days);
        chrome.storage.local.get(dates.map(d => 'day_' + d), result => {
          const map = {};
          dates.forEach(d => {
            map[d] = result['day_' + d] || { services: {}, totalWh: 0, requests: [] };
          });
          resolve(map);
        });
      } else {
        resolve(resp.data);
      }
    });
  });
}

// ── Abteilungs-Datensimulation ────────────────────────────
// MY_DEPT_ID bekommt die echten Nutzerdaten.
// Alle anderen Abteilungen erhalten skalierte Demo-Daten
// mit abteilungsspezifischer Dienst-Verteilung.

function buildDeptData(realByDate, dept) {
  if (dept.id === MY_DEPT_ID) return realByDate;

  // Profil-Summe normieren
  const profKeys = Object.keys(dept.profile);
  const profSum  = profKeys.reduce((s, k) => s + dept.profile[k], 0);

  const sim = {};
  Object.entries(realByDate).forEach(([date, day]) => {
    const realTotal = day.totalWh || 0;
    // Leichte Zufallsvariation pro Tag (±15 %) für realistischere Kurven
    const jitter    = 0.85 + (Math.sin(date.replace(/-/g, '') * dept.members) * 0.5 + 0.5) * 0.30;
    const simTotal  = realTotal * dept.scale * jitter;

    const services = {};
    profKeys.forEach(svc => {
      const share = dept.profile[svc] / profSum;
      const wh    = simTotal * share;
      // Anfragen-Schätzung basierend auf echten Daten oder Mitgliederzahl
      const refCount = day.services?.[svc]?.count || Math.ceil(dept.members * 0.3);
      const count    = Math.max(1, Math.round(refCount * dept.scale * jitter));
      services[svc] = { wh, count };
    });

    sim[date] = { services, totalWh: simTotal, requests: [] };
  });
  return sim;
}

function buildAllDeptsData(realByDate) {
  const all = {};
  DEPTS.forEach(dept => {
    all[dept.id] = buildDeptData(realByDate, dept);
  });
  return all;
}

// ── Aggregations ──────────────────────────────────────────

function aggTotals(byDate) {
  let wh = 0, reqs = 0;
  Object.values(byDate).forEach(day => {
    wh   += day.totalWh || 0;
    reqs += Object.values(day.services || {}).reduce((s, v) => s + (v.count || 0), 0);
  });
  return { wh, reqs };
}

function aggServices(byDate) {
  const totals = {}, counts = {};
  Object.values(byDate).forEach(day =>
    Object.entries(day.services || {}).forEach(([k, v]) => {
      totals[k] = (totals[k] || 0) + (v.wh    || 0);
      counts[k] = (counts[k] || 0) + (v.count || 0);
    })
  );
  return { totals, counts };
}

// ── Hero ──────────────────────────────────────────────────

function renderHero() {
  let totalWh = 0, totalReqs = 0;
  DEPTS.forEach(dept => {
    const t  = aggTotals(allDeptsData[dept.id]);
    totalWh  += t.wh;
    totalReqs += t.reqs;
  });
  const totalSavingsWh = totalWh * 4.76 - totalWh;
  const co2 = totalWh / 1000 * CO2_PER_KWH;

  animateNum(document.getElementById('heroTotalWh'), totalWh,      2);
  animateNum(document.getElementById('heroDepts'),   totalSavingsWh, 2);
  animateNum(document.getElementById('heroReqs'),    totalReqs,    0);
  animateNum(document.getElementById('heroCo2'),     co2,          1);

  document.getElementById('heroTotalSub').textContent = `über ${currentDays} Tage`;
  document.getElementById('heroDeptSub').textContent  = `~ 79 % Einsparungen`;
  document.getElementById('heroReqSub').textContent   = `Ø ${(totalReqs / currentDays).toFixed(0)} / Tag`;
}

// ── Meine Abteilung ────────────────────────────────────────

function renderMyDept() {
  const dept   = DEPTS.find(d => d.id === MY_DEPT_ID);
  const byDate = allDeptsData[MY_DEPT_ID];
  const { wh, reqs } = aggTotals(byDate);
  const { totals: svcTotals } = aggServices(byDate);

  const dot = document.getElementById('myDeptDot');
  if (dot) dot.style.background = dept.color;
  document.getElementById('myDeptName').textContent = dept.name;
  document.getElementById('myDeptMeta').textContent = `${dept.members} Mitglieder`;

  animateNum(document.getElementById('myDeptWh'),   wh,   2);
  animateNum(document.getElementById('myDeptReqs'), reqs, 0);
  document.getElementById('myDeptWhSub').textContent  = `über ${currentDays} Tage`;
  document.getElementById('myDeptReqSub').textContent = `Ø ${(reqs / currentDays).toFixed(1)} / Tag`;

  // Donut-Chart
  kill('myDonut');
  const keys = Object.keys(svcTotals).filter(k => svcTotals[k] > 0);
  if (!keys.length) return;

  charts.myDonut = new Chart(document.getElementById('myDeptDonut'), {
    type: 'doughnut',
    data: {
      labels: keys.map(k => (SERVICES[k] || { label: k }).label),
      datasets: [{
        data: keys.map(k => +svcTotals[k].toFixed(3)),
        backgroundColor: keys.map(k => (SERVICES[k] || { color: '#888' }).color),
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      animation: { animateRotate: true, duration: 700 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 6, padding: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 9 } }
        },
        tooltip: {
          backgroundColor: 'rgba(247,243,237,0.98)',
          borderColor: 'rgba(160,130,90,0.25)',
          borderWidth: 1,
          titleColor: '#2c2318',
          bodyColor: '#5a4c3c',
          callbacks: { label: c => ' ' + c.parsed.toFixed(3) + ' Wh' }
        }
      }
    }
  });
}

// ── Abteilungs-Karten ─────────────────────────────────────

function renderDeptGrid() {
  const grid = document.getElementById('deptGrid');
  grid.innerHTML = '';

  DEPTS.forEach((dept, i) => {
    const byDate = allDeptsData[dept.id];
    const { wh, reqs } = aggTotals(byDate);
    const { totals: svcTotals } = aggServices(byDate);

    // Mini-Balken: Top-4 Dienste
    const sorted   = Object.entries(svcTotals).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const barTotal = sorted.reduce((s, [, v]) => s + v, 0) || 1;

    const isMyDept = dept.id === MY_DEPT_ID;
    const card     = document.createElement('div');
    card.className = 'dept-card';
    card.style.animationDelay = (i * 0.06) + 's';

    const badge = isMyDept
      ? '<span class="my-badge" style="font-size:8px;margin-left:4px">Meine</span>'
      : '';

    card.innerHTML = `
      <div class="dept-card-header">
        <div class="dept-color-dot" style="background:${dept.color}"></div>
        <span class="dept-card-name">${dept.name}${badge}</span>
        <span class="dept-card-members">${dept.members} Mitglieder</span>
      </div>
      <div class="dept-card-wh">${wh.toFixed(2)}<span>Wh</span></div>
      <div class="dept-card-sub">${reqs} Anfragen · ${currentDays}d</div>
      <div class="dept-mini-bars">
        ${sorted.map(([svc, v]) => {
          const pct = (v / barTotal * 100).toFixed(1);
          return `<div class="dept-mini-bar" style="background:${(SERVICES[svc] || { color: '#888' }).color};width:${pct}%"></div>`;
        }).join('')}
      </div>
      <span class="dept-card-chevron">›</span>
    `;

    card.addEventListener('click', () => openDetail(dept.id));
    grid.appendChild(card);
  });
}

// ── Detail-Ansicht ────────────────────────────────────────

function openDetail(deptId) {
  currentDeptId = deptId;
  const dept   = DEPTS.find(d => d.id === deptId);
  const byDate = allDeptsData[deptId];
  const { wh, reqs } = aggTotals(byDate);
  const co2 = wh / 1000 * CO2_PER_KWH;
  const { totals: svcTotals, counts: svcCounts } = aggServices(byDate);

  // Ansicht wechseln
  document.getElementById('viewMain').classList.add('hidden');
  document.getElementById('viewDetail').classList.remove('hidden');

  // Header befüllen
  const dot = document.getElementById('detailDot');
  if (dot) dot.style.background = dept.color;
  document.getElementById('detailName').textContent = dept.name;
  document.getElementById('detailMeta').textContent =
    `${dept.members} Mitglieder${dept.id !== MY_DEPT_ID ? ' · Demo-Daten' : ''}`;

  // Detail-Hero
  animateNum(document.getElementById('dWh'),      wh,           2);
  animateNum(document.getElementById('dReqs'),    reqs,         0);
  animateNum(document.getElementById('dMembers'), dept.members, 0);
  animateNum(document.getElementById('dCo2'),     co2,          1);

  document.getElementById('dWhSub').textContent     = `über ${currentDays} Tage`;
  document.getElementById('dReqSub').textContent    = `Ø ${(reqs / currentDays).toFixed(1)} / Tag`;
  document.getElementById('dMemberSub').textContent =
    `Ø ${dept.members > 0 ? (wh / dept.members).toFixed(2) : '—'} Wh / Person`;

  renderDetailTrend(byDate);
  renderDetailDonut(svcTotals);
  renderDetailTable(svcTotals, svcCounts);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderDetailTrend(byDate) {
  kill('detailTrend');
  const dates  = Object.keys(byDate).sort();
  const labels = dates.map(d => fmtDate(d, currentDays));
  const data   = dates.map(d => +((byDate[d].totalWh) || 0).toFixed(3));

  const ctx  = document.getElementById('detailTrend').getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  const hex  = '#10b981';
  grad.addColorStop(0, 'rgba(16,185,129,0.18)');
  grad.addColorStop(1, 'rgba(16,185,129,0.01)');

  charts.detailTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: hex,
        backgroundColor: grad,
        borderWidth: 1.5,
        pointRadius: currentDays <= 14 ? 2 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: hex,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(247,243,237,0.98)',
          borderColor: 'rgba(160,130,90,0.25)',
          borderWidth: 1,
          titleColor: '#2c2318',
          bodyColor: '#5a4c3c',
          callbacks: { label: c => ' ' + c.parsed.y.toFixed(3) + ' Wh' }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, maxTicksLimit: currentDays <= 14 ? 14 : 8 }
        },
        y: {
          grid: { color: 'rgba(160,130,90,0.12)' },
          ticks: { callback: v => v + ' Wh' },
          beginAtZero: true,
        }
      }
    }
  });
}

function renderDetailDonut(svcTotals) {
  kill('detailDonut');
  const keys = Object.keys(svcTotals).filter(k => svcTotals[k] > 0);
  if (!keys.length) return;

  charts.detailDonut = new Chart(document.getElementById('detailDonut'), {
    type: 'doughnut',
    data: {
      labels: keys.map(k => (SERVICES[k] || { label: k }).label),
      datasets: [{
        data: keys.map(k => +svcTotals[k].toFixed(3)),
        backgroundColor: keys.map(k => (SERVICES[k] || { color: '#888' }).color),
        borderWidth: 0,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: { animateRotate: true, duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 7, padding: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: 'rgba(247,243,237,0.98)',
          borderColor: 'rgba(160,130,90,0.25)',
          borderWidth: 1,
          titleColor: '#2c2318',
          bodyColor: '#5a4c3c',
          callbacks: { label: c => ' ' + c.parsed.toFixed(3) + ' Wh' }
        }
      }
    }
  });
}

function renderDetailTable(svcTotals, svcCounts) {
  const sorted = Object.entries(svcTotals).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0]?.[1] || 1;
  const table  = document.getElementById('detailSvcTable');
  table.innerHTML = '';

  if (!sorted.length) {
    table.innerHTML =
      '<tr><td colspan="4" style="color:var(--text-dim);padding:16px 0;text-align:center">Keine Daten im Zeitraum</td></tr>';
    return;
  }

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th>Dienst</th>' +
    '<th></th>' +
    '<th style="text-align:right">Energie</th>' +
    '<th style="text-align:right">Anfragen</th>' +
    '</tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  sorted.forEach(([svc, wh], i) => {
    const info = SERVICES[svc] || { label: svc, color: '#888' };
    const pct  = (wh / max * 100).toFixed(1);
    const tr   = document.createElement('tr');
    tr.innerHTML =
      `<td><span class="svc-dot" style="background:${info.color}"></span>${info.label}</td>` +
      `<td><div class="svc-bar-wrap"><div class="svc-bar-fill" style="background:${info.color}" data-pct="${pct}"></div></div></td>` +
      `<td class="svc-num">${wh.toFixed(3)} Wh</td>` +
      `<td class="svc-count">${svcCounts[svc] || 0}×</td>`;
    tbody.appendChild(tr);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const fill = tr.querySelector('.svc-bar-fill');
        if (fill) fill.style.width = pct + '%';
      }, 40 + i * 40);
    });
  });
  table.appendChild(tbody);
}

// ── Effizienz-Rennen ──────────────────────────────────────

function setupRaceCollapse() {
  const panel = document.getElementById('racePanel');
  const toggle = document.getElementById('raceToggle');
  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function getRaceDates() {
  const now   = new Date();
  const dates = [];
  const dow = (now.getDay() + 6) % 7; // 0 = Mon
  for (let i = dow; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function buildRaceStandings() {
  const dates = getRaceDates();
  const standings = DEPTS.map(dept => {
    const byDate = allDeptsData[dept.id] || {};
    let totalWh = 0;
    dates.forEach(d => { totalWh += (byDate[d]?.totalWh || 0); });
    const whPerMember = dept.members > 0 ? totalWh / dept.members : totalWh;
    return { deptId: dept.id, totalWh, whPerMember, members: dept.members };
  });
  standings.sort((a, b) => a.whPerMember - b.whPerMember);
  standings.forEach((s, i) => {
    s.rank = i + 1;
    s.gapToLeader = s.whPerMember - (standings[0]?.whPerMember || 0);
  });
  return standings;
}

function getRacePeriodLabel() {
  const now = new Date();
  const dow      = (now.getDay() + 6) % 7;
  const daysLeft = 6 - dow;
  const kw       = getISOWeek(now);
  const left     = daysLeft === 0 ? 'letzter Tag' : `noch ${daysLeft} Tag${daysLeft === 1 ? '' : 'e'}`;
  return `KW ${kw} · ${left}`;
}

function updateRaceSummary(standings) {
  const summary = document.getElementById('raceSummary');
  if (!summary) return;

  const values = summary.querySelectorAll('.race-stat-value');
  if (values.length < 3) return;

  const leader = standings[0];
  const leaderDept = DEPTS.find(d => d.id === leader?.deptId);
  values[0].textContent = leaderDept
    ? `${leaderDept.name} · ${leader.whPerMember.toFixed(2)} Wh`
    : '—';

  let closest = null;
  for (let i = 1; i < standings.length; i++) {
    const prev = standings[i - 1];
    const cur = standings[i];
    const diff = cur.whPerMember - prev.whPerMember;
    if (!closest || diff < closest.diff) closest = { prev, cur, diff };
  }
  if (closest) {
    const a = DEPTS.find(d => d.id === closest.prev.deptId);
    const b = DEPTS.find(d => d.id === closest.cur.deptId);
    values[1].textContent = `${a?.name || '—'} vs. ${b?.name || '—'} · ${closest.diff.toFixed(2)} Wh`;
  } else {
    values[1].textContent = '—';
  }

  const mine = standings.find(s => s.deptId === MY_DEPT_ID);
  if (!mine) {
    values[2].textContent = '—';
    return;
  }
  values[2].textContent = `Platz ${mine.rank} · ${mine.gapToLeader.toFixed(2)} Wh Rückstand`;
}

function renderRaceSection() {
  const standings = buildRaceStandings();

  const labelEl = document.getElementById('racePeriodLabel');
  if (labelEl) labelEl.textContent = getRacePeriodLabel();

  const track = document.getElementById('raceTrack');
  if (!track) return;
  track.innerHTML = '';
  updateRaceSummary(standings);

  const maxWh = standings[standings.length - 1]?.whPerMember || 1;
  const minWh = standings[0]?.whPerMember || 0;
  const range = maxWh - minWh || 1;

  standings.forEach((s, idx) => {
    const dept    = DEPTS.find(d => d.id === s.deptId);
    const isMe    = s.deptId === MY_DEPT_ID;
    const isFirst = s.rank === 1;
    const lanePct = Math.max(14, Math.round((1 - (s.whPerMember - minWh) / range) * 78 + 18));
    const gapText = isFirst ? 'Führung' : `+${s.gapToLeader.toFixed(2)} Wh`;
    const subText = `Platz ${s.rank}`;
    const badge = isMe ? '<span class="race-role-badge">Mein Team</span>' : '';

    const row = document.createElement('div');
    row.className = 'race-row' + (isMe ? ' race-row-me' : '');

    const rankHtml = isFirst
      ? '<span class="race-trophy"></span>'
      : `<span class="race-rank-num">${s.rank}</span>`;

    row.innerHTML =
      `<div class="race-rank">${rankHtml}</div>` +
      `<div class="race-lane">` +
        `<div class="race-identity">` +
          `<div class="race-headline">` +
            `<div class="race-dept-dot" style="background:${dept.color}"></div>` +
            `<span class="race-dept-name">${dept.name}</span>` +
            `${badge}` +
          `</div>` +
          `<div class="race-lane-track">` +
            `<div class="race-lane-progress" style="background:${dept.color}" data-pct="${lanePct}"></div>` +
            `<div class="race-runner" style="--runner-color:${dept.color}" data-pct="${lanePct}"></div>` +
          `</div>` +
        `</div>` +
        `<div class="race-gap">` +
          `<span class="race-gap-value">${s.whPerMember.toFixed(2)} Wh</span>` +
          `<span class="race-gap-sub">${gapText} · ${subText}</span>` +
        `</div>` +
      `</div>`;

    track.appendChild(row);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const fill = row.querySelector('.race-lane-progress');
        const runner = row.querySelector('.race-runner');
        if (fill) fill.style.width = fill.dataset.pct + '%';
        if (runner) runner.style.left = runner.dataset.pct + '%';
      }, 40 + idx * 70);
    });
  });

  const hint = document.getElementById('raceHint');
  if (hint) {
    const mine = standings.find(s => s.deptId === MY_DEPT_ID);
    if (mine && mine.rank === 1) {
      hint.className = 'race-hint race-hint-leader';
      hint.innerHTML =
        '<div class="race-hint-tag">Pole Position</div>' +
        '<div class="race-hint-copy"><strong>Eure Abteilung führt das Feld an.</strong> Jetzt geht es darum, den Vorsprung bis zum Periodenende sauber zu verteidigen.</div>';
    } else if (mine) {
      hint.className = 'race-hint';
      const above = standings.find(s => s.rank === mine.rank - 1);
      const diff  = above ? (mine.whPerMember - above.whPerMember).toFixed(2) : '0.00';
      hint.innerHTML =
        `<div class="race-hint-tag">Push</div>` +
        `<div class="race-hint-copy"><strong>Noch ${diff} Wh pro Mitglied bis zum nächsten Überholmanöver.</strong> Vor euch liegt ${DEPTS.find(d => d.id === above?.deptId)?.name || 'das nächste Team'} auf Platz ${mine.rank - 1}.</div>`;
    } else {
      hint.className = 'race-hint';
      hint.textContent = '';
    }
  }

  checkRaceFinalization(standings);
  renderLastRace();
}

// ── Letztes Rennen / Podest ───────────────────────────────

function getLastRaceDates() {
  const now   = new Date();
  const dates = [];
  const dow       = (now.getDay() + 6) % 7; // 0=Mo
  const lastSun   = new Date(now); lastSun.setDate(now.getDate() - dow - 1);
  const lastMon   = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
  for (const d = new Date(lastMon); d <= lastSun; d.setDate(d.getDate() + 1))
    dates.push(new Date(d).toISOString().slice(0, 10));
  return dates;
}

function getLastRaceLabel() {
  const now = new Date();
  const dow     = (now.getDay() + 6) % 7;
  const lastSun = new Date(now); lastSun.setDate(now.getDate() - dow - 1);
  return `KW ${getISOWeek(lastSun)}`;
}

async function renderLastRace() {
  const wrap = document.getElementById('podiumWrap');
  const sub  = document.getElementById('lastRaceSub');
  if (!wrap) return;

  // Lade 35 Tage um immer die letzte vollständige Periode abzudecken
  const real35  = await loadRange(35);
  const data35  = buildAllDeptsData(real35);
  const dates   = getLastRaceDates();

  // Verfügbare Daten prüfen
  const hasData = dates.some(date =>
    DEPTS.some(dept => (data35[dept.id]?.[date]?.totalWh || 0) > 0)
  );

  if (sub) sub.textContent = getLastRaceLabel();

  if (!hasData) {
    wrap.innerHTML = '<div class="podium-no-data">Noch keine abgeschlossenen Rennen vorhanden.</div>';
    return;
  }

  // Standings berechnen
  const standings = DEPTS.map(dept => {
    const byDate = data35[dept.id] || {};
    let totalWh = 0;
    dates.forEach(d => { totalWh += (byDate[d]?.totalWh || 0); });
    const whPerMember = dept.members > 0 ? totalWh / dept.members : totalWh;
    return { deptId: dept.id, whPerMember };
  });
  standings.sort((a, b) => a.whPerMember - b.whPerMember);
  standings.forEach((s, i) => s.rank = i + 1);
  const labels = ['Sieger', 'Starkes Finish', 'Auf dem Podium'];
  const fills  = [
    'linear-gradient(180deg, #ffd978, #f59e0b)',
    'linear-gradient(180deg, #f1dfc5, #b59a75)',
    'linear-gradient(180deg, #e1b58e, #b96b34)',
  ];

  wrap.innerHTML = standings.slice(0, 3).map((s, i) => {
    const dept = DEPTS.find(d => d.id === s.deptId);
    const isMe = s.deptId === MY_DEPT_ID;
    return `
      <div class="podium-place">
        <div class="podium-rank" style="background:${fills[i]}">${s.rank}</div>
        <div class="podium-copy">
          <div class="podium-head">
            <div class="podium-dot" style="background:${dept.color}"></div>
            <div class="podium-name" style="${isMe ? 'color:#ffffff' : ''}">${dept.name}</div>
          </div>
          <div class="podium-note">${labels[i]}${isMe ? ' · euer Team' : ''}</div>
        </div>
        <div class="podium-wh">${s.whPerMember.toFixed(2)} Wh</div>
      </div>`;
  }).join('');
}

function checkRaceFinalization(currentStandings) {
  const now      = new Date();
  const weekKey  = `race_checked_week_${now.getFullYear()}`;
  const curWeek  = getISOWeek(now);

  chrome.storage.local.get([weekKey], data => {
    const lastWeek  = data[weekKey]  || 0;
    const msgs = [];

    if (lastWeek < curWeek - 1) {
      const winner = DEPTS.find(d => d.id === currentStandings[0]?.deptId);
      if (winner) {
        msgs.push(`KW ${curWeek - 1}: ${winner.name} gewinnt das Wochen-Rennen!`);
        if (winner.id === MY_DEPT_ID) {
          chrome.runtime.sendMessage({ type: 'unlock-special-achievement', id: 'sieger-sind-eben-sieger' }, function(resp) {
            if (chrome.runtime.lastError) return;
            if (!(resp && resp.unlocked)) return;
            showAchievementHud({
              id: 'sieger-sind-eben-sieger',
              title: 'Sieger sind eben Sieger!',
              image: chrome.runtime.getURL('assets/achievements/Sieger%20sind%20eben%20Sieger!.png')
            });
          });
        }
      }
    }

    if (msgs.length) {
      const update = {};
      update[weekKey]           = curWeek - 1;
      update['race_notification'] = { pending: true, messages: msgs };
      chrome.storage.local.set(update);
    }
  });
}

function showAchievementHud(options) {
  if (!options) return;
  var old = document.getElementById('achievementHud');
  if (old) old.remove();

  var hud = document.createElement('div');
  hud.id = 'achievementHud';
  hud.style.cssText = [
    'position:fixed',
    'top:18px',
    'right:18px',
    'z-index:2147483647',
    'background:rgba(247,243,237,0.98)',
    'border:1px solid rgba(16,185,129,0.25)',
    'border-radius:12px',
    'box-shadow:0 12px 28px rgba(44,35,24,0.16)',
    'padding:12px',
    'display:flex',
    'gap:12px',
    'align-items:center',
    'max-width:320px'
  ].join(';');

  hud.innerHTML =
    '<img src="' + options.image + '" alt="' + options.title + '" style="width:58px;height:58px;border-radius:12px;object-fit:cover;flex-shrink:0;">' +
    '<div style="min-width:0;flex:1;">' +
      '<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#059669">Achievement unlocked</div>' +
      '<div style="font-size:14px;font-weight:700;color:#1a1008;line-height:1.2;margin-top:3px">' + options.title + '</div>' +
      '<button id="achievementHudBtn" style="margin-top:8px;background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:6px 9px;font:600 11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">Zum Achievement</button>' +
    '</div>' +
    '<button id="achievementHudClose" style="align-self:flex-start;background:none;border:none;color:#9c8c7a;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;">×</button>';

  document.body.appendChild(hud);

  function removeHud() {
    if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
  }

  document.getElementById('achievementHudBtn').addEventListener('click', function() {
    window.location.href = chrome.runtime.getURL('pages/dashboard/dashboard.html');
  });
  document.getElementById('achievementHudClose').addEventListener('click', removeHud);
  setTimeout(removeHud, 7000);
}

setupRaceCollapse();

// ── Zurück-Button ─────────────────────────────────────────

document.getElementById('btnBack').addEventListener('click', () => {
  document.getElementById('viewDetail').classList.add('hidden');
  document.getElementById('viewMain').classList.remove('hidden');
  kill('detailTrend');
  kill('detailDonut');
  currentDeptId = null;
});

// ── Zeitraum-Buttons ──────────────────────────────────────

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDays = parseInt(btn.dataset.days);
    refresh();
  });
});

// ── Haupt-Refresh ─────────────────────────────────────────

async function refresh() {
  const realByDate = await loadRange(currentDays);
  allDeptsData     = buildAllDeptsData(realByDate);

  renderRaceSection();
  renderHero();
  renderMyDept();
  renderDeptGrid();

  // Detail-Ansicht neu rendern, falls geöffnet
  if (currentDeptId) {
    openDetail(currentDeptId);
  }
}

// ── Init ──────────────────────────────────────────────────


async function bootstrap() {
  const config = await loadCompanyConfig();
  if (!config) {
    window.location.href = chrome.runtime.getURL('pages/company-dashboard/company-dashboard.html');
    return;
  }
  applyCompanyConfig(config);
  refresh();
}

bootstrap();

// Live-Update bei neuen Anfragen
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(k => k.startsWith('day_'))) {
    refresh();
  }
});
