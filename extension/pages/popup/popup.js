// AI Energy Monitor v3 - Popup

var _ = chrome.i18n.getMessage;

// ── IndexedDB: Handle speichern (gleiche DB wie storage.js) ──────────────────
function _obOpenDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('energiescout', 1);
    req.onupgradeneeded = function(e) { e.target.result.createObjectStore('fs'); };
    req.onsuccess  = function(e) { resolve(e.target.result); };
    req.onerror    = function(e) { reject(e.target.error); };
  });
}

function _obSaveHandle(handle) {
  return _obOpenDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction('fs', 'readwrite').objectStore('fs').put(handle, 'rootHandle');
      req.onsuccess = function() { resolve(); };
      req.onerror   = function(e) { reject(e.target.error); };
    });
  });
}

// Animate a numeric element from 0 to target with ease-out cubic
function animateCountUp(el, target, duration) {
  var start = performance.now();
  (function step(now) {
    var p = Math.min((now - start) / duration, 1);
    var eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(1);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target.toFixed(1);
  })(performance.now());
}

// Standard-Dienste
var STANDARD_SERVICES = {
  chatgpt:    { label: "ChatGPT" },
  copilot:    { label: "Copilot" },
  gemini:     { label: "Gemini" },
  claude:     { label: "Claude" },
  perplexity: { label: "Perplexity" },
  google:             { label: _("googleSearch") },
  "google-ai-mode":   { label: _("googleAiSearch") }
};

// Optionale Dienste
var OPTIONAL_SERVICES = {
  deepseek:         { label: "DeepSeek" },
  grok:             { label: "Grok" },
  meta:             { label: "Meta AI" },
  poe:              { label: "Poe" },
  "github-copilot": { label: "GitHub Copilot" },
  mistral:          { label: "Mistral AI" }
};

// Aktive Dienste (wird beim Start geladen)
var SERVICES = Object.assign({}, STANDARD_SERVICES);
var LEVELS = [
  { level: 0,  xp: 0,    name: "Welcome Newbie",        file: "Welcome Newbie.png" },
  { level: 1,  xp: 100,  name: "Sparanfänger",          file: "Spar-Anfänger.png" },
  { level: 2,  xp: 300,  name: "Watt-Wächter",          file: "Watt-Wächter.png" },
  { level: 3,  xp: 600,  name: "Stromflüsterer",        file: "Strom-Flüsterer.png" },
  { level: 4,  xp: 1000, name: "Nachhaltigkeits-Ninja", file: "Nachhaltigkeits-Ninja.png" },
  { level: 5,  xp: 1400, name: "Energie-Alchemist",     file: "Energie-Alchemist.png" },
  { level: 6,  xp: 2000, name: "Energie-Champion",      file: "Energie-Champion.png" },
  { level: 7,  xp: 2400, name: "Energie-Kraftwerk",     file: "Energie-Kraftwerk.png" },
  { level: 8,  xp: 3000, name: "Sparfuchs",             file: "Sparfuchs.png" },
  { level: 9,  xp: 3500, name: "Energie-König",         file: "Energie-König.png" },
  { level: 10, xp: 4000, name: "Energiescout",          file: "Energie Scout.png" }
];


function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentLevel(xp) {
  var current = LEVELS[0];
  for (var i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) current = LEVELS[i];
  }
  return current;
}

function getNextLevel(xp) {
  for (var i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].xp > xp) return LEVELS[i];
  }
  return null;
}

function renderPopupXp(state) {
  var xp = (state && state.xp) || 0;
  var current = getCurrentLevel(xp);
  var next = getNextLevel(xp);
  var levelEl = document.getElementById("popupXpLevel");
  var totalEl = document.getElementById("popupXpTotal");
  var nextEl = document.getElementById("popupXpNext");
  var metaEl = document.getElementById("popupXpMeta");
  var fillEl = document.getElementById("popupXpFill");
  if (!levelEl || !totalEl || !nextEl || !metaEl || !fillEl) return;

  var imgEl = document.getElementById("popupAchievementImg");
  if (imgEl && current.file) {
    imgEl.src = chrome.runtime.getURL("assets/achievements/" + current.file);
    imgEl.alt = current.name;
    imgEl.onload = function() { imgEl.classList.add("loaded"); };
    imgEl.onerror = function() { imgEl.classList.remove("loaded"); };
    imgEl.onclick = function() {
      chrome.tabs.create({ url: chrome.runtime.getURL("pages/dashboard/dashboard.html") + "#achievement=" });
    };
  }

  levelEl.textContent = "Level " + current.level;
  totalEl.textContent = xp + " XP";

  if (next) {
    var spanStart = current.xp;
    var spanSize = Math.max(next.xp - spanStart, 1);
    var spanProgress = Math.max(0, Math.min(xp - spanStart, spanSize));
    var pct = (spanProgress / spanSize) * 100;
    nextEl.textContent = "Noch " + (next.xp - xp) + " XP";
    metaEl.textContent = spanProgress + " / " + spanSize + " XP bis Level " + next.level;
    requestAnimationFrame(function() { fillEl.style.width = pct.toFixed(1) + "%"; });
  } else {
    nextEl.textContent = "Max-Level";
    metaEl.textContent = "Alle Level-Achievements freigeschaltet";
    requestAnimationFrame(function() { fillEl.style.width = "100%"; });
  }
}

function showAchievementHud(options) {
  if (!options) return;
  var old = document.getElementById('achievementHud');
  if (old) old.remove();

  var hud = document.createElement('div');
  hud.id = 'achievementHud';
  hud.style.cssText = [
    'position:fixed',
    'top:46px',
    'left:12px',
    'right:12px',
    'z-index:2147483647',
    'background:rgba(247,243,237,0.98)',
    'border:1px solid rgba(16,185,129,0.25)',
    'border-radius:10px',
    'box-shadow:0 12px 28px rgba(44,35,24,0.16)',
    'padding:10px',
    'display:flex',
    'gap:10px',
    'align-items:center'
  ].join(';');

  var img = document.createElement('img');
  img.src = options.image;
  img.alt = options.title;
  img.style.cssText = 'width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;';

  var body = document.createElement('div');
  body.style.cssText = 'min-width:0;flex:1;';
  body.innerHTML =
    '<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#059669">Achievement unlocked</div>' +
    '<div style="font-size:13px;font-weight:700;color:#1a1008;line-height:1.2;margin-top:3px">' + options.title + '</div>' +
    '<button id="achievementHudBtn" style="margin-top:7px;background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:5px 8px;font:600 10px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">Zum Achievement</button>';

  var close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = 'align-self:flex-start;background:none;border:none;color:#9c8c7a;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;';

  hud.appendChild(img);
  hud.appendChild(body);
  hud.appendChild(close);
  document.body.appendChild(hud);

  function removeHud() {
    if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
  }

  close.addEventListener('click', removeHud);
  body.querySelector('#achievementHudBtn').addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/dashboard/dashboard.html') });
    removeHud();
  });

  setTimeout(removeHud, 7000);
}

function getCurrentWeekDays() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatTime(ms) {
  if (!ms || ms < 60000) return _("lessThan1Min");
  const min = Math.round(ms / 60000);
  if (min < 60) return min + _("minuteUnit");
  return (min / 60).toFixed(1) + _("hourUnit");
}

var DAY_LABELS = [
  _("dayMon"), _("dayTue"), _("dayWed"), _("dayThu"),
  _("dayFri"), _("daySat"), _("daySun")
];

function renderWeekDays(weekDays) {
  var container = document.getElementById("weekDays");
  container.innerHTML = "";
  var todayStr = getToday();
  for (var i = 0; i < 7; i++) {
    var span = document.createElement("span");
    span.className = "week-day";
    span.textContent = DAY_LABELS[i];
    if (weekDays[i] === todayStr) span.classList.add("today");
    if (weekDays[i] > todayStr) span.classList.add("future");
    container.appendChild(span);
  }
}

// ── Chart interactive state ──────────────────────────────────────────────────
var _chartValues   = [];
var _chartWeekDays = [];
var _chartHovered  = -1;
var _chartAllData  = {};
var _chartDetailOpen = false;

function drawWeekChart(values, weekDays) {
  var canvas = document.getElementById("weekChart");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth || 272;
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  _chartValues   = values;
  _chartWeekDays = weekDays;

  var todayStr = getToday();
  var max = Math.max.apply(null, values.concat([0.01]));
  var colW  = w / 7;
  var barW  = colW * 0.55;
  var barX0 = (colW - barW) / 2;
  var hl    = _chartHovered;

  for (var i = 0; i < 7; i++) {
    var x      = colW * i + barX0;
    var rawH   = (values[i] / max) * (h - 18);
    var barH   = values[i] > 0 ? Math.max(rawH, 2) : 0;
    var y      = h - barH;
    var isFuture = weekDays[i] > todayStr;
    var isToday  = weekDays[i] === todayStr;
    var isHL     = (i === hl);

    if (isHL) {
      ctx.fillStyle = "rgba(160,130,90,0.07)";
      ctx.fillRect(colW * i, 0, colW, h);
    }

    ctx.fillStyle = isFuture ? "#e4ddd1"
                  : isToday  ? (isHL ? "#047857" : "#059669")
                              : (isHL ? "#059669" : "#10b981");
    if (barH > 0) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
      else ctx.rect(x, y, barW, barH);
      ctx.fill();
    }

    if (!isFuture && values[i] > 0) {
      ctx.fillStyle = isHL ? "#1a1008" : "#8a9aad";
      ctx.font = (isHL ? "bold " : "") + "9px -apple-system,Arial";
      ctx.textAlign = "center";
      ctx.fillText(values[i].toFixed(1), x + barW / 2, y - 3);
    }
  }
}

function setupChartEvents(weekDays, allData) {
  var canvas  = document.getElementById("weekChart");
  var tooltip = document.getElementById("chartTooltip");
  var detail  = document.getElementById("chartDetail");
  var closeBtn = document.getElementById("chartDetailClose");
  if (!canvas) return;

  _chartAllData = allData;
  var todayStr = getToday();

  function colAt(e) {
    var r   = canvas.getBoundingClientRect();
    var mx  = e.clientX - r.left;          // CSS-Pixel relativ zum Canvas-Rand
    var idx = Math.floor(mx / (r.width / 7));
    return (idx >= 0 && idx < 7) ? idx : -1;
  }

  canvas.addEventListener("mousemove", function(e) {
    var idx = colAt(e);
    if (idx !== _chartHovered) {
      _chartHovered = idx;
      drawWeekChart(_chartValues, _chartWeekDays);
    }
    if (tooltip && idx >= 0 && weekDays[idx] <= todayStr) {
      var d    = allData["day_" + weekDays[idx]] || {};
      var wh   = (d.totalWh || 0).toFixed(2);
      var reqs = 0;
      for (var k in (d.services || {})) reqs += (d.services[k].count || 0);
      tooltip.textContent = DAY_LABELS[idx] + " · " + wh + " Wh · " + reqs + " Anf.";
      tooltip.classList.remove("hidden");
      var colPx = canvas.offsetWidth / 7;
      tooltip.style.left = (colPx * idx + colPx / 2) + "px";
    } else if (tooltip) {
      tooltip.classList.add("hidden");
    }
  });

  canvas.addEventListener("mouseleave", function() {
    _chartHovered = -1;
    drawWeekChart(_chartValues, _chartWeekDays);
    if (tooltip) tooltip.classList.add("hidden");
  });

  function setDetailVisible(visible) {
    var svcPanel   = document.querySelector('.services-panel');
    if (svcPanel)   svcPanel.style.display   = visible ? 'none' : '';
    if (visible) {
      detail.classList.remove("hidden");
    } else {
      detail.classList.add("hidden");
    }
  }

  canvas.addEventListener("click", function(e) {
    if (tooltip) tooltip.classList.add("hidden");
    var idx = colAt(e);
    var todayIdx = 0;
    for (var i = 0; i < weekDays.length; i++) {
      if (weekDays[i] === todayStr) { todayIdx = i; break; }
    }
    var tab = (idx >= 0 && weekDays[idx] <= todayStr) ? "d" + idx : "d" + todayIdx;

    if (!_chartDetailOpen) {
      _chartDetailOpen = true;
      setDetailVisible(true);
      buildDetailTabs(weekDays, todayStr);
    }
    openDetailTab(tab, weekDays);
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", function() {
      _chartDetailOpen = false;
      setDetailVisible(false);
    });
  }
}

function buildDetailTabs(weekDays, todayStr) {
  var tabsEl = document.getElementById("chartTabs");
  if (!tabsEl) return;
  tabsEl.innerHTML = "";

  for (var i = 0; i < 7; i++) {
    (function(idx) {
      var btn = document.createElement("button");
      btn.className = "chart-tab" + (weekDays[idx] > todayStr ? " dim" : "");
      btn.dataset.tab = "d" + idx;
      btn.textContent = DAY_LABELS[idx];
      btn.addEventListener("click", function() { openDetailTab("d" + idx, weekDays); });
      tabsEl.appendChild(btn);
    })(i);
  }

  var sep = document.createElement("span");
  sep.className = "chart-tab-sep";
  tabsEl.appendChild(sep);

  [["week","W"],["month","M"],["year","J"]].forEach(function(p) {
    var btn = document.createElement("button");
    btn.className = "chart-tab";
    btn.dataset.tab = p[0];
    btn.textContent = p[1];
    btn.addEventListener("click", function() { openDetailTab(p[0], weekDays); });
    tabsEl.appendChild(btn);
  });
}

function openDetailTab(tab, weekDays) {
  document.querySelectorAll(".chart-tab").forEach(function(b) {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  var body = document.getElementById("chartDetailBody");
  if (!body) return;
  var todayStr = getToday();

  if (tab.startsWith("d")) {
    var idx  = parseInt(tab.slice(1));
    var date = weekDays[idx];
    var d    = _chartAllData["day_" + date] || { totalWh: 0, services: {}, requests: [] };
    var reqs = 0;
    var svcRows = [];
    for (var k in (d.services || {})) {
      var s = d.services[k];
      reqs += (s.count || 0);
      if ((s.wh || 0) > 0) svcRows.push({ key: k, wh: s.wh, count: s.count || 0 });
    }
    svcRows.sort(function(a, b) { return b.wh - a.wh; });

    var html = detailRow(DAY_LABELS[idx] + " <span style='color:#b8a890;font-weight:400'>" + formatDateDE(date) + "</span>",
                         '<span class="detail-val em">' + (d.totalWh || 0).toFixed(2) + " Wh</span>");
    html += detailRow("Anfragen", reqs);
    svcRows.slice(0, 4).forEach(function(r) {
      var lbl = (SERVICES[r.key] || { label: r.key }).label;
      html += detailRow(lbl, r.wh.toFixed(2) + " Wh");
    });
    body.innerHTML = html;

  } else if (tab === "week") {
    var wWh = 0, wReqs = 0, bestDay = null, bestWh = 0;
    var dayLines = "";
    for (var i = 0; i < weekDays.length; i++) {
      if (weekDays[i] > todayStr) continue;
      var dd = _chartAllData["day_" + weekDays[i]] || {};
      var dWh = dd.totalWh || 0;
      wWh += dWh;
      for (var k in (dd.services || {})) wReqs += (dd.services[k].count || 0);
      if (dWh > bestWh) { bestWh = dWh; bestDay = DAY_LABELS[i]; }
      if (dWh > 0) dayLines += detailRow(DAY_LABELS[i], dWh.toFixed(2) + " Wh");
    }
    body.innerHTML =
      detailRow("Woche gesamt", '<span class="detail-val em">' + wWh.toFixed(2) + " Wh</span>") +
      detailRow("Anfragen", wReqs) +
      (bestDay ? detailRow("Stärkster Tag", bestDay + " · " + bestWh.toFixed(2) + " Wh") : "") +
      dayLines;

  } else if (tab === "month" || tab === "year") {
    body.innerHTML = '<div class="detail-loading">Lade…</div>';
    loadPeriodData(tab, function(data) {
      var tWh = 0, tReqs = 0;
      var svcMap = {};
      for (var key in data) {
        var dd = data[key] || {};
        tWh += (dd.totalWh || 0);
        for (var k in (dd.services || {})) {
          tReqs += (dd.services[k].count || 0);
          svcMap[k] = (svcMap[k] || 0) + (dd.services[k].wh || 0);
        }
      }
      var label = tab === "month" ? "Monat gesamt" : "Jahr gesamt";
      var topSvc = Object.keys(svcMap).sort(function(a, b) { return svcMap[b] - svcMap[a]; }).slice(0, 3);
      var html =
        detailRow(label, '<span class="detail-val em">' + tWh.toFixed(2) + " Wh</span>") +
        detailRow("Anfragen", tReqs);
      topSvc.forEach(function(k) {
        html += detailRow((SERVICES[k] || { label: k }).label, svcMap[k].toFixed(2) + " Wh");
      });
      body.innerHTML = html;
    });
  }
}

function formatDateDE(iso) {
  var p = iso.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function detailRow(label, value) {
  return '<div class="detail-row"><span class="detail-lbl">' + label +
         '</span><span class="detail-val">' + value + "</span></div>";
}

function loadPeriodData(period, cb) {
  var today = new Date();
  var y = today.getFullYear();
  var keys = [];
  var months = [];
  if (period === "month") {
    months = [today.getMonth()];
  } else {
    for (var mi = 0; mi < 12; mi++) months.push(mi);
  }
  months.forEach(function(m) {
    var days = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= days; d++) {
      keys.push("day_" + y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    }
  });
  chrome.storage.local.get(keys, function(res) { cb(res || {}); });
}

// --- Alle Event-Listener sofort registrieren ---
document.addEventListener("DOMContentLoaded", function() {

  var onboardingEl   = document.getElementById('onboarding');
  var mainContentEl  = document.getElementById('mainContent');

  // ── Onboarding pruefen ────────────────────────────────────────────────────
  chrome.storage.local.get('_fsConnected', function(d) {
    if (d._fsConnected) {
      // Ordner bereits verbunden – normal anzeigen
      showMain();
    } else {
      // Onboarding anzeigen
      onboardingEl.classList.remove('hidden');
    }
  });

  document.getElementById('btnChooseFolder').addEventListener('click', function() {
    window.showDirectoryPicker({ startIn: 'documents', id: 'energiescout-root', mode: 'readwrite' })
      .then(function(dirHandle) {
        return _obSaveHandle(dirHandle).then(function() { return dirHandle; });
      })
      .then(function() {
        // Background informieren: EnergiStorage.init() + flushBuffer()
        chrome.runtime.sendMessage({ type: 'fs-connect' });
        chrome.storage.local.set({ _fsConnected: true });
        onboardingEl.classList.add('hidden');
        showMain();
      })
      .catch(function(e) {
        if (e && e.name !== 'AbortError') {
          document.getElementById('obError').classList.remove('hidden');
        }
      });
  });

  function showMain() {
    mainContentEl.classList.remove('hidden');
    // Optionale Dienste aus Einstellungen laden
    chrome.storage.local.get("settings", loadServicesAndRender);
    chrome.runtime.sendMessage({ type: 'get-gamification-state' }, function(resp) {
      if (chrome.runtime.lastError) return;
      renderPopupXp(resp && resp.state ? resp.state : { xp: 0 });
    });
  }

  function loadServicesAndRender(data) {
    var settings = data.settings || {};
    var optional = settings.optionalServices || {};
    var standard = settings.standardServices || {};
    var toggleable = ["copilot", "claude", "google"];
    for (var i = 0; i < toggleable.length; i++) {
      var svc = toggleable[i];
      var enabled = optional.hasOwnProperty(svc) ? !!optional[svc] : standard[svc] !== false;
      if (!enabled) delete SERVICES[svc];
    }
    for (var key in OPTIONAL_SERVICES) {
      if (optional[key]) {
        SERVICES[key] = OPTIONAL_SERVICES[key];
      }
    }
    renderPopup();
  }

  // ── No-AI Toggle ─────────────────────────────────────────────────────────
  var noAiToggle = document.getElementById('toggleNoAI');
  if (noAiToggle) {
    chrome.storage.local.get('settings', function(d) {
      noAiToggle.checked = !!((d.settings || {}).googleNoAI);
    });
    noAiToggle.addEventListener('change', function() {
      chrome.storage.local.get('settings', function(d) {
        var s = d.settings || {};
        s.googleNoAI = noAiToggle.checked;
        chrome.storage.local.set({ settings: s }, function() {
          if (!noAiToggle.checked) return;
          chrome.runtime.sendMessage({ type: 'unlock-special-achievement', id: 'hintertuer' }, function(resp) {
            if (chrome.runtime.lastError) return;
            if (resp && resp.unlocked) {
              showAchievementHud({
                id: 'hintertuer',
                title: 'Hintertür',
                image: chrome.runtime.getURL('assets/achievements/Hintert%C3%BCr.png')
              });
            }
          });
        });
      });
    });
  }

  var tokenSaverToggle = document.getElementById('toggleTokenSaver');
  if (tokenSaverToggle) {
    chrome.storage.local.get('settings', function(d) {
      tokenSaverToggle.checked = !!((d.settings || {}).tokenSaverMode);
    });
    tokenSaverToggle.addEventListener('change', function() {
      chrome.storage.local.get('settings', function(d) {
        var s = d.settings || {};
        s.tokenSaverMode = tokenSaverToggle.checked;
        chrome.storage.local.set({ settings: s });
      });
    });
  }

  // Status orb: check if current tab is an AI service
  chrome.storage.local.get('_activeService', function(d) {
    if (d._activeService) {
      var orb = document.getElementById('statusOrb');
      var lbl = document.getElementById('statusLabel');
      if (orb) orb.classList.add('active');
      if (lbl) lbl.textContent = d._activeService;
    }
  });

  // Dashboard oeffnen
  document.getElementById("openDashboard").addEventListener("click", function() {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/dashboard/dashboard.html") });
  });

  document.getElementById("openCompanyDashboard").addEventListener("click", function() {
    chrome.storage.local.remove('race_notification');
    var dot = document.querySelector('.race-notif-dot');
    if (dot) dot.remove();
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/company-dashboard/company-dashboard.html") });
  });

  // Rennen-Benachrichtigung prüfen
  chrome.storage.local.get('race_notification', function(data) {
    if (data.race_notification && data.race_notification.pending) {
      var btn = document.getElementById('openCompanyDashboard');
      if (btn) {
        var dot = document.createElement('span');
        dot.className = 'race-notif-dot';
        btn.appendChild(dot);
      }
    }
  });

  // Einstellungen oeffnen
  document.getElementById("openDevTest").addEventListener("click", function() {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/settings/settings.html") });
  });

  function renderPopup() {
  var today = getToday();
  var days = getCurrentWeekDays();
  var keys = days.map(function(d) { return "day_" + d; });

  chrome.storage.local.get(keys, (allData) => {
    if (chrome.runtime.lastError) {
      console.error("Storage Error:", chrome.runtime.lastError);
      allData = {}; // render with empty defaults instead of blank popup
    }

    var todayData = allData["day_" + today] || { services: {}, totalWh: 0, requests: [] };
    var todayWh = todayData.totalWh || 0;
    var whEl = document.getElementById("todayWh");

    // Animate count-up only when today's value changed since last popup open
    chrome.storage.local.get('_lastSeenWh', function(seen) {
      var rec = seen._lastSeenWh || {};
      var lastSeen = (rec.date === today) ? (rec.wh || 0) : 0;
      if (todayWh > lastSeen + 0.05) {
        animateCountUp(whEl, todayWh, 900);
        chrome.storage.local.set({ _lastSeenWh: { date: today, wh: todayWh } });
      } else {
        whEl.textContent = todayWh.toFixed(1);
      }
    });

    var dailyWh = days.map(function(d) {
      var dd = allData["day_" + d];
      return dd ? (dd.totalWh || 0) : 0;
    });
    renderWeekDays(days);
    drawWeekChart(dailyWh, days);
    setupChartEvents(days, allData);

    // Only sum up to today (not future days)
    var weekWh = 0;
    for (var i = 0; i < days.length; i++) {
      if (days[i] <= today) weekWh += dailyWh[i];
    }
    document.getElementById("weekWh").textContent = weekWh.toFixed(1);

    // Tages-Token-Summen pro Dienst aus requests berechnen
    var svcTokens = {};
    (todayData.requests || []).forEach(function(r) {
      if (!r.service) return;
      if (!svcTokens[r.service]) svcTokens[r.service] = { in: 0, out: 0 };
      svcTokens[r.service].in  += r.promptTokens   || 0;
      svcTokens[r.service].out += r.responseTokens || 0;
    });

    function fmtTok(n) {
      if (!n) return '0';
      return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    }

    // ── Dienst-Tabelle rendern ────────────────────────────────────────────────
    var PERIOD_LABELS = { day: 'Tages-Übersicht', week: 'Wochen-Übersicht', month: 'Monats-Übersicht' };
    var _activePeriod = 'day';

    function renderServiceTable(servicesMap, tokMap) {
      var table = document.getElementById("serviceList");
      table.innerHTML = "";
      var serviceRows = [];
      for (var key in SERVICES) {
        var svc = (servicesMap && servicesMap[key]) || { count: 0, wh: 0 };
        if (!(svc.wh > 0 || svc.count > 0)) continue;
        serviceRows.push({ key: key, info: SERVICES[key], svc: svc });
      }
      serviceRows.sort(function(a, b) { return (b.svc.wh || 0) - (a.svc.wh || 0); });
      if (serviceRows.length === 0) return;

      var thead = document.createElement("thead");
      var showTok = !!tokMap;
      thead.innerHTML = '<tr>' +
        '<th class="svc-th svc-th-count">#</th>' +
        '<th class="svc-th svc-th-name">Dienst</th>' +
        '<th class="svc-th svc-th-right">Wh</th>' +
        (showTok ? '<th class="svc-th svc-th-right">Tokens</th>' : '') +
        '</tr>';
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      for (var r = 0; r < serviceRows.length; r++) {
        var row = serviceRows[r];
        var tr = document.createElement("tr");
        var whVal = (row.svc.wh || 0).toFixed(1);
        var tokCell = '';
        if (showTok) {
          var tok = (tokMap && tokMap[row.key]) || { in: 0, out: 0 };
          var tokTotal = (tok.in || 0) + (tok.out || 0);
          tokCell = '<td class="svc-tokens">' + (tokTotal > 0
            ? '<span class="svc-tok-badge">' + fmtTok(tokTotal) + '</span>'
            : '<span style="color:#c8b99a">—</span>') + '</td>';
        }
        tr.innerHTML =
          '<td class="svc-count">' + (row.svc.count || 0) + '</td>' +
          '<td class="svc-name">' + row.info.label + '</td>' +
          '<td class="svc-wh ' + ((row.svc.wh || 0) > 10 ? 'high' : '') + '">' + whVal + '</td>' +
          tokCell;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    function aggregateServices(dayDataList) {
      var agg = {};
      dayDataList.forEach(function(dd) {
        for (var k in (dd.services || {})) {
          if (!agg[k]) agg[k] = { wh: 0, count: 0 };
          agg[k].wh    += dd.services[k].wh    || 0;
          agg[k].count += dd.services[k].count || 0;
        }
      });
      return agg;
    }

    function aggregateTokens(dayDataList) {
      var tok = {};
      dayDataList.forEach(function(dd) {
        (dd.requests || []).forEach(function(r) {
          if (!r.service) return;
          if (!tok[r.service]) tok[r.service] = { in: 0, out: 0 };
          tok[r.service].in  += r.promptTokens   || 0;
          tok[r.service].out += r.responseTokens || 0;
        });
      });
      return tok;
    }

    function switchPeriod(period) {
      _activePeriod = period;
      var lbl = document.getElementById("servicesLabel");
      if (lbl) lbl.textContent = PERIOD_LABELS[period] || 'Tages-Übersicht';
      document.querySelectorAll(".period-tab").forEach(function(b) {
        b.classList.toggle("active", b.dataset.period === period);
      });

      if (period === "day") {
        renderServiceTable(todayData.services, svcTokens);

      } else if (period === "week") {
        var weekDayData = days
          .filter(function(d) { return d <= today; })
          .map(function(d) { return allData["day_" + d] || {}; });
        renderServiceTable(aggregateServices(weekDayData), aggregateTokens(weekDayData));

      } else if (period === "month") {
        document.getElementById("serviceList").innerHTML =
          '<tbody><tr><td colspan="4" style="padding:6px 0;font-size:10px;color:#9c8c7a;font-style:italic">Lade…</td></tr></tbody>';
        loadPeriodData("month", function(data) {
          var dayList = [];
          for (var k in data) dayList.push(data[k]);
          renderServiceTable(aggregateServices(dayList), aggregateTokens(dayList));
        });
      }
    }

    // Initial: Tages-Ansicht
    renderServiceTable(todayData.services, svcTokens);

    // Period-Tab Listener
    document.querySelectorAll(".period-tab").forEach(function(btn) {
      btn.addEventListener("click", function() { switchPeriod(btn.dataset.period); });
    });

  });
  } // end renderPopup
});
