// Test Center Script

var _ = chrome.i18n.getMessage;

function tag(id, ok, text) {
  var el = document.getElementById(id);
  if (!el) return;
  el.className = "tag " + (ok ? "ok" : "fail");
  el.textContent = text;
}

function log(container, msg) {
  var el = document.getElementById(container);
  if (!el) return;
  var line = document.createElement("div");
  line.textContent = "[" + new Date().toLocaleTimeString() + "] " + msg;
  el.prepend(line);
}

// --- 1. Extension-Status ---
function checkStatus() {
  var icon = document.getElementById('refreshIcon');
  if (icon) {
    icon.style.transition = 'transform 0.6s ease';
    icon.style.transform = 'rotate(360deg)';
    setTimeout(function() {
      icon.style.transition = 'none';
      icon.style.transform = 'rotate(0deg)';
    }, 620);
  }

  // Kurz Loading-State zeigen
  ['s1','s2','s3'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'tag wait';
    el.textContent = '…';
  });

  setTimeout(function() {
  try {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      tag("s1", true, _("yesId", [chrome.runtime.id]));
    } else {
      tag("s1", false, _("no"));
    }
  } catch(e) {
    tag("s1", false, _("no") + " - " + e.message);
  }

  try {
    chrome.storage.local.get(null, function(data) {
      if (chrome.runtime.lastError) {
        tag("s2", false, "Error: " + chrome.runtime.lastError.message);
        return;
      }
      var days = 0;
      for (var k in data) { if (k.indexOf("day_") === 0) days++; }
      tag("s2", true, _("yesDays", [String(days)]));
    });
  } catch(e) {
    tag("s2", false, _("no") + " - " + e.message);
  }

  try {
    chrome.runtime.sendMessage({ type: "get-stats" }, function(resp) {
      if (chrome.runtime.lastError) {
        tag("s3", false, "Error: " + chrome.runtime.lastError.message);
        return;
      }
      if (resp) {
        tag("s3", true, _("yesWhToday", [String((resp.totalWh || 0).toFixed(1))]));
      } else {
        tag("s3", false, _("noResponse"));
      }
    });
  } catch(e) {
    tag("s3", false, _("no") + " - " + e.message);
  }
  }, 350);
}

var btnStatus = document.getElementById("btnStatus");
if (btnStatus) btnStatus.addEventListener("click", checkStatus);
checkStatus();

// --- 2. Does the extension count correctly? ---
function simRequest(service, promptText) {
  log("simResult", _("simSending", [service]));

  chrome.runtime.sendMessage({
    type: "prompt-submitted",
    service: service,
    promptText: promptText,
    responseText: ""
  }, function(resp) {
    if (chrome.runtime.lastError) {
      log("simResult", _("simError", [chrome.runtime.lastError.message]));
      return;
    }

    var hint = (resp && resp.suggestion) ? _("simTip", [resp.suggestion]) : "";
    log("simResult", _("simSuccess") + hint);

    setTimeout(function() {
      chrome.runtime.sendMessage({ type: "get-stats" }, function(stats) {
        if (stats && stats.services && stats.services[service]) {
          var s = stats.services[service];
          log("simResult", _("simStatus", [service, String(s.count), s.wh.toFixed(1)]));
        }
      });
    }, 500);
  });
}

var simButtons = ["simChatgpt", "simCopilot", "simGemini", "simClaude", "simGoogle"];
simButtons.forEach(function(id) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", function() {
    simRequest(btn.getAttribute("data-service"), btn.getAttribute("data-prompt"));
  });
});

// --- 3. Demo data / Delete ---
var btnSimWeek = document.getElementById("btnSimWeek");
if (btnSimWeek) btnSimWeek.addEventListener("click", function() {
  if (!confirm(_("confirmTestData"))) return;

  var whRates = { chatgpt: 3.0, copilot: 3.0, gemini: 2.5, claude: 2.5, google: 0.3 };
  var items = {};
  for (var i = 14; i >= 8; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var date = d.toISOString().slice(0, 10);
    var services = {};
    var totalWh = 0;
    for (var svc in whRates) {
      var count = svc === "google" ? 15 + Math.floor(Math.random() * 30) : 2 + Math.floor(Math.random() * 12);
      var pt = count * (50 + Math.floor(Math.random() * 150));
      var rt = svc === "google" ? 0 : count * (100 + Math.floor(Math.random() * 400));
      var svcWh = count * whRates[svc] + (pt + rt) * 0.0003;
      services[svc] = { count: count, wh: Math.round(svcWh * 100) / 100, promptTokens: pt, responseTokens: rt, timeSpentMs: count * 60000 };
      totalWh += svcWh;
    }
    items["day_" + date] = { services: services, totalWh: Math.round(totalWh * 100) / 100, requests: [] };
  }
  chrome.storage.local.set(items, function() {
    log("dataResult", _("testDataGenerated"));
  });
});

var btnGen30Days = document.getElementById("btnGen30Days");
if (btnGen30Days) btnGen30Days.addEventListener("click", function() {
  if (!confirm("30 Tage Testdaten erzeugen?\nBestehende Tagesdaten werden überschrieben.")) return;

  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    generateTestData(30, settings);
  });
});

// Energy Profiles (synchronized with background.js)
var PROFILES = {
  jegham: {
    chatgpt:    { whBase: 0.120, whPerToken: 0.00105 },
    copilot:    { whBase: 0.120, whPerToken: 0.00105 },
    gemini:     { whBase: 0.050, whPerToken: 0.00065 },
    claude:     { whBase: 0.120, whPerToken: 0.00240 },
    perplexity: { whBase: 0.100, whPerToken: 0.00100 },
    google:     { whBase: 0.300, whPerToken: 0 },
    'google-ai-mode': { whBase: 0.120, whPerToken: 0.00065 },
    deepseek:   { whBase: 0.080, whPerToken: 0.00080 },
    grok:       { whBase: 0.120, whPerToken: 0.00100 },
    meta:       { whBase: 0.080, whPerToken: 0.00070 },
    poe:        { whBase: 0.120, whPerToken: 0.00100 },
    'github-copilot': { whBase: 0.120, whPerToken: 0.00105 }
  },
  altman: {
    chatgpt:    { whBase: 0.094, whPerToken: 0.00082 },
    copilot:    { whBase: 0.094, whPerToken: 0.00082 },
    gemini:     { whBase: 0.039, whPerToken: 0.00051 },
    claude:     { whBase: 0.094, whPerToken: 0.00188 },
    perplexity: { whBase: 0.078, whPerToken: 0.00078 },
    google:     { whBase: 0.235, whPerToken: 0 },
    'google-ai-mode': { whBase: 0.094, whPerToken: 0.00051 },
    deepseek:   { whBase: 0.063, whPerToken: 0.00063 },
    grok:       { whBase: 0.094, whPerToken: 0.00078 },
    meta:       { whBase: 0.063, whPerToken: 0.00055 },
    poe:        { whBase: 0.094, whPerToken: 0.00078 },
    'github-copilot': { whBase: 0.094, whPerToken: 0.00082 }
  },
  epoch: {
    chatgpt:    { whBase: 0.056, whPerToken: 0.00049 },
    copilot:    { whBase: 0.056, whPerToken: 0.00049 },
    gemini:     { whBase: 0.023, whPerToken: 0.00030 },
    claude:     { whBase: 0.056, whPerToken: 0.00112 },
    perplexity: { whBase: 0.047, whPerToken: 0.00047 },
    google:     { whBase: 0.140, whPerToken: 0 },
    'google-ai-mode': { whBase: 0.056, whPerToken: 0.00030 },
    deepseek:   { whBase: 0.037, whPerToken: 0.00037 },
    grok:       { whBase: 0.056, whPerToken: 0.00047 },
    meta:       { whBase: 0.037, whPerToken: 0.00033 },
    poe:        { whBase: 0.056, whPerToken: 0.00047 },
    'github-copilot': { whBase: 0.056, whPerToken: 0.00049 }
  }
};

var PUE_VALUES = { hyperscale: 1.09, industry: 1.56 };
var GOOGLE_BASELINE_REVISED_WH = 0.040;
var NO_PUE_SERVICES = new Set(['google']);
var HIGH_CONSUMPTION_EXTRA_WH = 1.55; // test-only uplift: 0.44 Wh -> about 1.9 Wh

function calcWhForService(serviceKey, promptTokens, responseTokens, profile, pueProfile, googleBaseline) {
  var p = PROFILES[profile] || PROFILES['jegham'];
  var svc = p[serviceKey];
  if (!svc) return 0;
  
  var raw = svc.whBase + (responseTokens || 0) * svc.whPerToken;
  
  // Google search baseline override
  if (serviceKey === 'google' && googleBaseline === 'revised') {
    raw = GOOGLE_BASELINE_REVISED_WH;
  }
  
  // PUE Multiplikator (Cooling overhead)
  var pue = NO_PUE_SERVICES.has(serviceKey) ? 1.0 : (PUE_VALUES[pueProfile] || PUE_VALUES['industry']);
  return raw * pue;
}

function generateTestData(days, settings, options) {
  options = options || {};
  var profile = settings.energyProfile || 'jegham';
  var pueProfile = settings.pueProfile || 'industry';
  var googleBaseline = settings.googleSearchBaseline || 'classic';
  var highConsumptionMode = !!options.highConsumption;
  
  // Service probabilities (weekday vs weekend)
  var SVC_CFG = {
    chatgpt:    { prob: 0.85, avgCount: 7 },
    copilot:    { prob: 0.60, avgCount: 5 },
    gemini:     { prob: 0.45, avgCount: 4 },
    claude:     { prob: 0.70, avgCount: 6 },
    perplexity: { prob: 0.30, avgCount: 3 },
    google:     { prob: 0.90, avgCount: 8 }
  };

  var data = {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.toISOString().slice(0, 10);
    var dow = d.getDay();
    var isWeekend = dow === 0 || dow === 6;
    var dayFactor = isWeekend ? 0.20 : 1.0;
    var services = {}, totalWh = 0, requests = [];

    Object.keys(SVC_CFG).forEach(function(svc) {
      var cfg = SVC_CFG[svc];
      if (Math.random() > cfg.prob * dayFactor) return;
      var count = Math.max(1, Math.round((Math.random() * cfg.avgCount + 1) * dayFactor));
      var totalWh_svc = 0;
      
      for (var r = 0; r < count; r++) {
        var promptTok   = Math.floor(Math.random() * 130) + 40;
        var responseTok = Math.floor(Math.random() * 380) + 80;
        var wh = calcWhForService(svc, promptTok, responseTok, profile, pueProfile, googleBaseline);
        if (highConsumptionMode && svc !== 'google') {
          wh += HIGH_CONSUMPTION_EXTRA_WH;
        }
        totalWh_svc += wh;
      }
      
      var promptTok_total   = count * (Math.floor(Math.random() * 130) + 40);
      var responseTok_total = count * (Math.floor(Math.random() * 380) + 80);
      
      services[svc] = { 
        wh: Math.round(totalWh_svc * 100) / 100, 
        count: count, 
        promptTokens: promptTok_total, 
        responseTokens: responseTok_total 
      };
      totalWh += totalWh_svc;
      
      var perReq = totalWh_svc / count;
      for (var k = 0; k < Math.min(count, 3); k++) {
        requests.push({
          service: svc, 
          wh: Math.round(perReq * 100) / 100,
          promptPreview: "Testanfrage " + (k + 1),
          time: d.getTime() + Math.floor(Math.random() * 57600000) + 28800000,
          promptTokens: Math.floor(promptTok_total / count),
          responseTokens: Math.floor(responseTok_total / count),
        });
      }
    });

    data["day_" + dateStr] = { services: services, totalWh: Math.round(totalWh * 100) / 100, requests: requests };
  }

  var btn = document.getElementById(options.triggerButtonId || ("btnGen" + days + "Days"));
  if (btn) {
    btn.textContent = "Wird gespeichert…";
    btn.disabled = true;
  }
  
  chrome.storage.local.set(data, function() {
    var suffix = highConsumptionMode ? " (Hoher Verbrauch)" : "";
    log("dataResult", days + " Tage Testdaten" + suffix + " mit " + profile + "-Profil erfolgreich gespeichert.");
    if (btn) {
      btn.textContent = days + " Tage";
      btn.disabled = false;
    }
  });
}

var btnGenHighConsumption = document.getElementById("btnGenHighConsumption");
if (btnGenHighConsumption) btnGenHighConsumption.addEventListener("click", function() {
  if (!confirm("90 Tage Testdaten erzeugen?\nBestehende Tagesdaten werden überschrieben.")) return;

  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    generateTestData(90, settings, { triggerButtonId: "btnGenHighConsumption" });
  });
});



var btnClear = document.getElementById("btnClear");
if (btnClear) btnClear.addEventListener("click", function() {
  if (!confirm(_("confirmDeleteAll"))) return;
  chrome.storage.local.clear(function() {
    log("dataResult", _("allDataDeleted"));
  });
});

// --- 6. URL detection ---
var URL_MAP = {
  "ChatGPT": ["https://chatgpt.com", "https://chat.com", "https://gpt.com", "https://chat.openai.com"],
  "Microsoft Copilot": ["https://copilot.com", "https://copilot.microsoft.com", "https://copilot.cloud.microsoft", "https://m365copilot.com", "https://www.bing.com/chat"],
  "Google Gemini": ["https://gemini.google.com", "https://aistudio.google.com"],
  "Claude": ["https://claude.ai"],
  "Perplexity": ["https://www.perplexity.ai", "https://perplexity.ai"],
  "Google Search": ["https://www.google.com/search?q=test", "https://www.google.de/search?q=test"],
  "DeepSeek": ["https://chat.deepseek.com"],
  "Grok": ["https://grok.com"],
  "Meta AI": ["https://www.meta.ai"],
  "Poe": ["https://poe.com"],
  "GitHub Copilot": ["https://github.com/copilot"]
};

function buildUrlCheckUI() {
  var container = document.getElementById("urlCheckList");
  container.innerHTML = "";

  for (var service in URL_MAP) {
    var urls = URL_MAP[service];
    var block = document.createElement("div");
    block.style.cssText = "margin-bottom:12px;";

    var title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:4px;";
    title.textContent = service;
    block.appendChild(title);

    for (var i = 0; i < urls.length; i++) {
      var row = document.createElement("div");
      row.className = "row";
      row.setAttribute("data-url", urls[i]);

      var urlSpan = document.createElement("span");
      urlSpan.style.cssText = "font-family:monospace;font-size:12px;word-break:break-all;flex:1;";
      urlSpan.textContent = urls[i];

      var tagSpan = document.createElement("span");
      tagSpan.className = "tag wait";
      tagSpan.textContent = _("urlNotChecked");
      tagSpan.setAttribute("data-url-tag", urls[i]);

      row.appendChild(urlSpan);
      row.appendChild(tagSpan);
      block.appendChild(row);
    }

    container.appendChild(block);
  }
}

function checkSingleUrl(url) {
  var tagEl = document.querySelector("[data-url-tag='" + url + "']");
  if (!tagEl) return;
  tagEl.className = "tag wait";
  tagEl.textContent = _("urlChecking");

  fetch(url, { method: "HEAD", mode: "no-cors", redirect: "follow" })
    .then(function() {
      tagEl.className = "tag ok";
      tagEl.textContent = _("urlReachable");
    })
    .catch(function() {
      var img = new Image();
      var done = false;
      var timeout = setTimeout(function() {
        if (done) return;
        done = true;
        tagEl.className = "tag ok";
        tagEl.textContent = _("urlCorsBlocked");
      }, 3000);
      img.onload = function() {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        tagEl.className = "tag ok";
        tagEl.textContent = _("urlReachable");
      };
      img.onerror = function() {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        tagEl.className = "tag ok";
        tagEl.textContent = _("urlServerResponds");
      };
      img.src = url + "/favicon.ico?" + Date.now();
    });
}

function checkAllUrls() {
  for (var service in URL_MAP) {
    var urls = URL_MAP[service];
    for (var i = 0; i < urls.length; i++) {
      checkSingleUrl(urls[i]);
    }
  }
}

buildUrlCheckUI();

var btnCheckAll = document.getElementById("btnCheckAll");
if (btnCheckAll) btnCheckAll.addEventListener("click", function() {
  checkAllUrls();
});

// URL-Erkennung collapse
var urlCheckSection = document.getElementById("urlCheckSection");
var urlCheckToggle = document.getElementById("urlCheckToggle");
if (urlCheckSection && urlCheckToggle) {
  urlCheckToggle.addEventListener("click", function() {
    urlCheckSection.classList.toggle("is-collapsed");
  });
}

// --- 5. Raw data ---
var btnRead = document.getElementById("btnRead");
if (btnRead) btnRead.addEventListener("click", function() {
  chrome.storage.local.get(null, function(data) {
    document.getElementById("storageOut").textContent = JSON.stringify(data, null, 2);
  });
});

// --- 7. Developer Options: Modus-Switch ---
(function() {
  var btnProd = document.getElementById('modeProduction');
  var btnDev  = document.getElementById('modeDevelopment');

  var STYLE_ACTIVE   = 'background:#10b981;color:#fff;';
  var STYLE_INACTIVE = 'background:#fefcf8;color:#7a6a58;';

  function applyVisual(isDev) {
    if (!btnProd || !btnDev) return;
    // Preserve existing inline styles (flex, padding etc.) — only override bg+color
    btnProd.style.background = isDev ? '#fefcf8' : '#10b981';
    btnProd.style.color      = isDev ? '#7a6a58' : '#fff';
    btnDev.style.background  = isDev ? '#10b981' : '#fefcf8';
    btnDev.style.color       = isDev ? '#fff'    : '#7a6a58';
    var details = document.getElementById('devModeDetails');
    if (details) details.classList.toggle('visible', isDev);
  }

  function setMode(isDev) {
    chrome.storage.local.get('settings', function(data) {
      var s = data.settings || {};
      s.devMode = isDev;
      chrome.storage.local.set({ settings: s }, function() {
        applyVisual(isDev);
      });
    });
  }

  chrome.storage.local.get('settings', function(data) {
    applyVisual(!!((data.settings || {}).devMode));
  });

  var versionEl = document.getElementById('devProdVersion');
  if (versionEl) versionEl.textContent = 'v' + chrome.runtime.getManifest().version;

  var modal   = document.getElementById('devModeModal');
  var btnConfirm = document.getElementById('devModalConfirm');
  var btnCancel  = document.getElementById('devModalCancel');

  if (btnCancel) btnCancel.addEventListener('click', function() {
    modal.classList.remove('visible');
  });

  if (btnConfirm) btnConfirm.addEventListener('click', function() {
    modal.classList.remove('visible');
    setMode(true);
  });

  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.classList.remove('visible');
  });

  if (btnProd) btnProd.addEventListener('click', function() { setMode(false); });
  if (btnDev)  btnDev.addEventListener('click',  function() {
    modal.classList.add('visible');
  });
})();

// --- 7. Developer Options ---
function _obOpenDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('energiescout', 1);
    req.onupgradeneeded = function(e) { e.target.result.createObjectStore('fs'); };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

function _obSaveHandle(handle) {
  return _obOpenDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction('fs', 'readwrite').objectStore('fs').put(handle, 'rootHandle');
      req.onsuccess = function() { resolve(); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  });
}

function _obGetRootHandle() {
  return _obOpenDB().then(function(db) {
    return new Promise(function(resolve) {
      var req = db.transaction('fs', 'readonly').objectStore('fs').get('rootHandle');
      req.onsuccess = function(e) { resolve(e.target.result || null); };
      req.onerror = function() { resolve(null); };
    });
  }).catch(function() { return null; });
}

function showDevRepairButton(show, label) {
  var btn = document.getElementById('btnRepairExtensionFolder');
  if (!btn) return;
  btn.style.display = show ? '' : 'none';
  if (label) btn.textContent = label;
}

function handleFolderValidationResponse(resp, pathInfo) {
  var resultEl = document.getElementById('folderValidationResult');
  var pathLine = pathInfo ? pathInfo + '\n' : '';

  if (!resp || resp.reason === 'not-connected') {
    if (resultEl) resultEl.textContent = 'Kein Onboarding-Ordner verbunden.';
    showDevRepairButton(true, 'Onboarding reparieren');
    return;
  }
  if (resp.reason === 'error') {
    if (resultEl) resultEl.textContent = pathLine + 'Prüfung fehlgeschlagen: ' + (resp.error || 'Unbekannter Fehler');
    showDevRepairButton(true, 'Reparieren');
    return;
  }
  if (resp.ok) {
    var version = resp.meta && resp.meta.extensionVersion ? ' · Version ' + resp.meta.extensionVersion : '';
    if (resultEl) resultEl.textContent = pathLine + 'Ordnerstruktur vollständig.' + version;
    showDevRepairButton(false);
  } else {
    if (resultEl) resultEl.innerHTML = pathLine.replace(/\n/, '<br>') + 'Ordnerstruktur unvollständig. Fehlend:<br>' + (resp.missing || []).map(function(item) { return '• ' + item; }).join('<br>');
    showDevRepairButton(true, 'Ordnerstruktur reparieren');
  }
}

var validateFolderBtn = document.getElementById('btnValidateExtensionFolder');
if (validateFolderBtn) {
  validateFolderBtn.addEventListener('click', function() {
    var resultEl = document.getElementById('folderValidationResult');
    if (resultEl) resultEl.textContent = 'Prüfe Ordnerstruktur ...';
    showDevRepairButton(false);

    _obGetRootHandle().then(function(handle) {
      var pathInfo = handle ? '📁 ' + handle.name : '(kein Ordner verbunden)';

      chrome.runtime.sendMessage({ type: 'validate-extension-folder-structure' }, function(resp) {
        if (chrome.runtime.lastError) {
          if (resultEl) resultEl.textContent = 'Prüfung fehlgeschlagen: ' + chrome.runtime.lastError.message;
          showDevRepairButton(true, 'Reparieren');
          return;
        }
        handleFolderValidationResponse(resp, pathInfo);
      });
    });
  });
}

var repairFolderBtn = document.getElementById('btnRepairExtensionFolder');
if (repairFolderBtn) {
  repairFolderBtn.addEventListener('click', function() {
    var resultEl = document.getElementById('folderValidationResult');
    if (resultEl) resultEl.textContent = 'Reparatur läuft ...';

    chrome.runtime.sendMessage({ type: 'validate-extension-folder-structure' }, function(resp) {
      if (chrome.runtime.lastError) {
        if (resultEl) resultEl.textContent = 'Reparaturprüfung fehlgeschlagen: ' + chrome.runtime.lastError.message;
        return;
      }
      if (!resp || resp.reason === 'not-connected') {
        window.showDirectoryPicker({ startIn: 'documents', id: 'energiescout-root', mode: 'readwrite' })
          .then(function(dirHandle) { return _obSaveHandle(dirHandle).then(function() { return dirHandle; }); })
          .then(function() {
            chrome.runtime.sendMessage({ type: 'fs-connect' }, function(connectResp) {
              if (chrome.runtime.lastError) {
                if (resultEl) resultEl.textContent = 'Reparatur fehlgeschlagen: ' + chrome.runtime.lastError.message;
                return;
              }
              chrome.storage.local.set({ _fsConnected: true }, function() {
                if (!connectResp || !connectResp.connected) {
                  if (resultEl) resultEl.textContent = 'Onboarding konnte nicht repariert werden.';
                  return;
                }
                if (resultEl) resultEl.textContent = 'Onboarding-Ordner verbunden. Prüfe Struktur erneut ...';
                validateFolderBtn.click();
              });
            });
          })
          .catch(function(err) {
            if (err && err.name === 'AbortError') { if (resultEl) resultEl.textContent = 'Ordnerauswahl abgebrochen.'; return; }
            if (resultEl) resultEl.textContent = 'Reparatur fehlgeschlagen: ' + (err && err.message ? err.message : err);
          });
        return;
      }
      chrome.runtime.sendMessage({ type: 'repair-extension-folder-structure' }, function(repairResp) {
        if (chrome.runtime.lastError) {
          if (resultEl) resultEl.textContent = 'Reparatur fehlgeschlagen: ' + chrome.runtime.lastError.message;
          return;
        }
        handleFolderValidationResponse(repairResp);
      });
    });
  });
}
