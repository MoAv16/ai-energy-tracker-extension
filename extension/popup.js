// AI Energy Monitor v3 - Popup

var _ = chrome.i18n.getMessage;

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
  "github-copilot": { label: "GitHub Copilot" }
};

// Aktive Dienste (wird beim Start geladen)
var SERVICES = Object.assign({}, STANDARD_SERVICES);

// --- Psychologische Vergleichsskala ---
function getImpactText(wh) {
  if (wh < 1) return _("impactNone");
  if (wh < 5)
    return _("impactGoogle", [String(Math.round(wh / 0.3))]);
  if (wh < 10)
    return _("impactLed", [String(Math.round(wh / 10 * 60))]);
  if (wh < 20)
    return _("impactPhone", [String(Math.round(wh / 15 * 100))]);
  if (wh < 30)
    return _("impactAfrica", [String(Math.round(wh))]);
  if (wh < 45)
    return _("impactCo2", [String((wh * 0.4).toFixed(0)), String((wh * 0.4 / 150 * 1000).toFixed(0))]);
  if (wh < 60)
    return _("impactWater", [String(Math.round(wh)), String((wh / 3).toFixed(0))]);
  if (wh < 80)
    return _("impactCooling", [String((wh * 0.005).toFixed(1))]);
  if (wh < 100)
    return _("impactFridge", [String(Math.round(wh)), String((wh / 40).toFixed(1))]);
  if (wh < 150)
    return _("impactTv", [String(Math.round(wh))]);
  if (wh < 250)
    return _("impactWashing", [String(Math.round(wh))]);
  return _("impactMax", [String(Math.round(wh))]);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
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

function drawWeekChart(values, weekDays) {
  var canvas = document.getElementById("weekChart");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth;
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  var todayStr = getToday();
  var max = Math.max.apply(null, values.concat([1]));
  var barWidth = (w / 7) * 0.6;
  var gap = (w / 7) * 0.4;

  for (var i = 0; i < 7; i++) {
    var x = (w / 7) * i + gap / 2;
    var barH = (values[i] / max) * (h - 16);
    var y = h - barH;
    var isFuture = weekDays[i] > todayStr;
    var isToday = weekDays[i] === todayStr;

    // Bar
    ctx.fillStyle = isFuture ? "#e8ecf1" : (isToday ? "#003770" : "#41c5ff");
    // roundRect with fallback for older browsers
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, barWidth, barH, 2);
    } else {
      ctx.rect(x, y, barWidth, barH);
    }
    ctx.fill();

    // Wh label above bar (only for past/today with values)
    if (!isFuture && values[i] > 0) {
      ctx.fillStyle = "#6b7a8d";
      ctx.font = "9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(values[i].toFixed(1), x + barWidth / 2, y - 3);
    }
  }
}

// --- Alle Event-Listener sofort registrieren ---
document.addEventListener("DOMContentLoaded", function() {

  // Optionale Dienste aus Einstellungen laden
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    var optional = settings.optionalServices || {};
    var standard = settings.standardServices || {};
    var toggleable = ["copilot", "claude", "google"];
    for (var i = 0; i < toggleable.length; i++) {
      if (standard[toggleable[i]] === false) {
        delete SERVICES[toggleable[i]];
      }
    }
    for (var key in OPTIONAL_SERVICES) {
      if (optional[key]) {
        SERVICES[key] = OPTIONAL_SERVICES[key];
      }
    }
    renderPopup();
  });

  // Status orb: check if current tab is an AI service
  chrome.storage.local.get('_activeService', function(d) {
    if (d._activeService) {
      var orb = document.getElementById('statusOrb');
      var lbl = document.getElementById('statusLabel');
      if (orb) orb.classList.add('active');
      if (lbl) lbl.textContent = d._activeService;
    }
  });

  // Dashboard oeffnen (URL aus Settings, Fallback: settings.html)
  document.getElementById("openDashboard").addEventListener("click", function() {
    chrome.storage.local.get("settings", function(data) {
      var url = (data.settings && data.settings.dashboardUrl) || "";
      if (url) {
        chrome.tabs.create({ url: url });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
      }
    });
  });

  // Einstellungen oeffnen
  document.getElementById("openDevTest").addEventListener("click", function() {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
  });

  function renderPopup() {
  var today = getToday();
  var days = getCurrentWeekDays();
  var keys = days.map(function(d) { return "day_" + d; });

  chrome.storage.local.get(keys, (allData) => {
    if (chrome.runtime.lastError) {
      console.error("Storage Error:", chrome.runtime.lastError);
      return;
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
    document.getElementById("todayCompare").textContent = getImpactText(todayWh);

    var dailyWh = days.map(function(d) {
      var dd = allData["day_" + d];
      return dd ? (dd.totalWh || 0) : 0;
    });
    renderWeekDays(days);
    drawWeekChart(dailyWh, days);

    // Only sum up to today (not future days)
    var weekWh = 0;
    for (var i = 0; i < days.length; i++) {
      if (days[i] <= today) weekWh += dailyWh[i];
    }
    document.getElementById("weekWh").textContent = weekWh.toFixed(1);

    var table = document.getElementById("serviceList");
    table.innerHTML = "";
    for (var key in SERVICES) {
      var info = SERVICES[key];
      var svc = (todayData.services && todayData.services[key]) || { count: 0, wh: 0, timeSpentMs: 0 };
      // Only render services that have been used today
      if (!(svc.wh > 0 || svc.count > 0)) continue;
      var tr = document.createElement("tr");
      var whVal = (svc.wh || 0).toFixed(1);
      tr.innerHTML =
        '<td class="svc-name">' + info.label + '</td>' +
        '<td class="svc-count">' + (svc.count || 0) + 'x</td>' +
        '<td class="svc-wh ' + ((svc.wh || 0) > 10 ? 'high' : '') + '">' + whVal + ' Wh</td>' +
        '<td class="svc-time">' + ((svc.timeSpentMs || 0) > 0 ? formatTime(svc.timeSpentMs) : "-") + '</td>';
      table.appendChild(tr);
    }

    if (todayData.requests && todayData.requests.length > 0) {
      var last = todayData.requests[todayData.requests.length - 1];
      if (last.service !== "google") {
        document.getElementById("lastPromptSection").style.display = "block";
        document.getElementById("lastPromptText").textContent = last.promptPreview || "-";
        var svcLabel = SERVICES[last.service] ? SERVICES[last.service].label : last.service;
        var metaEl = document.getElementById("lastPromptMeta");
        var pTok = last.promptTokens || 0;
        var rTok = last.responseTokens || 0;
        var est = last.realTokens ? "" : "~"; // ~ = estimated, no prefix = real
        metaEl.innerHTML =
          '<span class="token-badge-in">&#8593; IN ' + est + pTok + '</span>' +
          '<span class="token-badge-out">&#8595; OUT ' + est + rTok + '</span>' +
          '<span class="token-wh">' + (last.wh || 0) + ' Wh</span>';
      }
    }

  });
  } // end renderPopup
});
