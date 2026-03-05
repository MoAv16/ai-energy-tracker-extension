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

// --- 1. Is the extension working? ---
document.getElementById("btnStatus").addEventListener("click", function() {
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
});

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

// --- 3. Live detection ---
try {
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") return;
    for (var key in changes) {
      if (key.indexOf("day_") !== 0) continue;
      var newVal = changes[key].newValue;
      var oldVal = changes[key].oldValue;
      if (!newVal || !newVal.services) continue;
      for (var svc in newVal.services) {
        var oldCount = (oldVal && oldVal.services && oldVal.services[svc]) ? oldVal.services[svc].count : 0;
        var newCount = newVal.services[svc].count;
        if (newCount > oldCount) {
          log("liveResult", _("liveDetected", [svc.toUpperCase(), String(newCount), newVal.services[svc].wh.toFixed(1)]));
        }
      }
    }
  });
} catch(e) {
  log("liveResult", _("listenerError", [e.message]));
}

// --- 4. Demo data / Delete ---
document.getElementById("btnSimWeek").addEventListener("click", function() {
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

document.getElementById("btnClear").addEventListener("click", function() {
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

document.getElementById("btnCheckAll").addEventListener("click", function() {
  checkAllUrls();
});

// --- 5. Raw data ---
document.getElementById("btnRead").addEventListener("click", function() {
  chrome.storage.local.get(null, function(data) {
    document.getElementById("storageOut").textContent = JSON.stringify(data, null, 2);
  });
});
