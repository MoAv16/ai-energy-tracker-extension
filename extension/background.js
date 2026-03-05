// AI Energy Monitor v3 - Background Service Worker
var _ = chrome.i18n.getMessage;

// --- Konstanten ---
// Standard-Dienste (immer aktiv)
const SERVICES = {
  chatgpt:    { whBase: 3.0, whPerToken: 0.0003, label: "ChatGPT" },
  copilot:    { whBase: 3.0, whPerToken: 0.0003, label: "Microsoft Copilot" },
  gemini:     { whBase: 2.5, whPerToken: 0.00025, label: "Google Gemini" },
  claude:     { whBase: 2.5, whPerToken: 0.00025, label: "Claude" },
  perplexity: { whBase: 2.5, whPerToken: 0.00025, label: "Perplexity" },
  google:     { whBase: 0.3, whPerToken: 0, label: "Google Search" },
  // Optionale Dienste (nur aktiv wenn in Einstellungen aktiviert)
  deepseek:       { whBase: 2.5, whPerToken: 0.00025, label: "DeepSeek" },
  grok:           { whBase: 3.0, whPerToken: 0.0003, label: "Grok" },
  meta:           { whBase: 2.5, whPerToken: 0.00025, label: "Meta AI" },
  poe:            { whBase: 2.5, whPerToken: 0.00025, label: "Poe" },
  "github-copilot": { whBase: 3.0, whPerToken: 0.0003, label: "GitHub Copilot" }
};

const DAILY_LIMIT_WH = 100;
const WEEKLY_LIMIT_WH = 500;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function calcWh(serviceKey, promptTokens, responseTokens) {
  const s = SERVICES[serviceKey];
  if (!s) return 0;
  const totalTokens = (promptTokens || 0) + (responseTokens || 0);
  return s.whBase + totalTokens * s.whPerToken;
}

// --- Storage Helpers ---
async function getDayData(date) {
  const key = `day_${date}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || { services: {}, totalWh: 0, requests: [] };
}

async function saveDayData(date, dayData) {
  await chrome.storage.local.set({ [`day_${date}`]: dayData });
}

// --- Session Tracking ---
const activeSessions = new Map(); // tabId -> { service, startTime }

// --- Core: Record a request ---
async function recordRequest(serviceKey, data = {}) {
  const today = getToday();
  const dayData = await getDayData(today);

  const promptTokens = estimateTokens(data.promptText);
  const responseTokens = estimateTokens(data.responseText);
  const wh = calcWh(serviceKey, promptTokens, responseTokens);

  if (!dayData.services[serviceKey]) {
    dayData.services[serviceKey] = { count: 0, wh: 0, promptTokens: 0, responseTokens: 0, timeSpentMs: 0 };
  }

  const svc = dayData.services[serviceKey];
  svc.count++;
  svc.wh += wh;
  svc.promptTokens += promptTokens;
  svc.responseTokens += responseTokens;
  dayData.totalWh += wh;

  // Request-Log (letzte 50 pro Tag)
  dayData.requests.push({
    service: serviceKey,
    time: Date.now(),
    wh: Math.round(wh * 100) / 100,
    promptTokens,
    responseTokens,
    promptPreview: (data.promptText || "").slice(0, 80)
  });
  if (dayData.requests.length > 50) {
    dayData.requests = dayData.requests.slice(-50);
  }

  await saveDayData(today, dayData);
  await updateBadge();
  await checkLimits(dayData.totalWh);
}

// --- Feature 4: Echtzeit-Badge ---
async function updateBadge() {
  const today = getToday();
  const dayData = await getDayData(today);
  const wh = Math.round(dayData.totalWh);
  const text = wh >= 1000 ? (wh / 1000).toFixed(1) + "k" : String(wh);

  await chrome.action.setBadgeText({ text: wh > 0 ? text : "" });
  await chrome.action.setBadgeBackgroundColor({ color: wh > DAILY_LIMIT_WH ? "#e63946" : "#003770" });
}

// --- Feature 5: Benachrichtigungen ---
let notifiedToday = null;

async function checkLimits(totalWh) {
  const today = getToday();
  if (notifiedToday === today) return;

  if (totalWh >= DAILY_LIMIT_WH) {
    notifiedToday = today;
    chrome.notifications.create("daily-limit", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: _("notifTitle"),
      message: _("notifLimit", [String(Math.round(totalWh))])
    });
  }
}

// --- Feature 6: Idle-Detection ---
chrome.idle.setDetectionInterval(300); // 5 Minuten

chrome.idle.onStateChanged.addListener((state) => {
  if (state === "idle" || state === "locked") {
    // Sessions pausieren
    for (const [tabId, session] of activeSessions) {
      if (session.active) {
        session.active = false;
        session.pausedAt = Date.now();
      }
    }
  } else if (state === "active") {
    for (const [tabId, session] of activeSessions) {
      if (!session.active && session.pausedAt) {
        session.active = true;
        session.startTime += (Date.now() - session.pausedAt);
        delete session.pausedAt;
      }
    }
  }
});

// --- Feature 7: Zeiterfassung pro Tab ---
function identifyService(url) {
  if (!url) return null;
  const patterns = {
    chatgpt: ["chatgpt.com", "chat.com", "gpt.com", "chat.openai.com", "openai.com/chatgpt"],
    gemini: ["gemini.google.com", "bard.google.com", "aistudio.google.com"],
    copilot: ["copilot.com", "www.copilot.com", "copilot.microsoft.com", "copilot.cloud.microsoft", "m365.cloud.microsoft", "m365copilot.com", "www.bing.com/chat", "www.bing.com/copilot", "www.bing.com/new", "m.bing.com/chat", "edgeservices.bing.com/edgesvc/chat"],
    perplexity: ["www.perplexity.ai", "perplexity.ai"],
    claude: ["claude.ai"],
    google: ["www.google.com/search", "www.google.de/search"],
    deepseek: ["chat.deepseek.com"],
    grok: ["grok.com", "x.com/i/grok"],
    meta: ["www.meta.ai", "meta.ai"],
    poe: ["poe.com", "www.poe.com"],
    "github-copilot": ["github.com/copilot", "copilot.github.com"]
  };
  for (const [key, pats] of Object.entries(patterns)) {
    for (const p of pats) {
      if (url.includes(p)) return key;
    }
  }
  return null;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const service = identifyService(tab.url);

  // Alte Session beenden
  if (activeSessions.has(tabId)) {
    endSession(tabId);
  }

  if (service) {
    activeSessions.set(tabId, { service, startTime: Date.now(), active: true });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  endSession(tabId);
});

async function endSession(tabId) {
  const session = activeSessions.get(tabId);
  if (!session) return;
  activeSessions.delete(tabId);

  const elapsed = Date.now() - session.startTime;
  if (elapsed < 2000) return; // Zu kurz, ignorieren

  const today = getToday();
  const dayData = await getDayData(today);
  if (dayData.services[session.service]) {
    dayData.services[session.service].timeSpentMs += elapsed;
    await saveDayData(today, dayData);
  }
}

// --- Feature 8: Alternativ-Vorschläge ---
// Wird im Content Script ausgewertet und per Message geschickt
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "prompt-submitted") {
    recordRequest(msg.service, {
      promptText: msg.promptText,
      responseText: msg.responseText || ""
    });
    // Prüfe ob Google gereicht hätte
    const suggestion = analyzePrompt(msg.promptText);
    sendResponse({ suggestion });
    return true;
  }

  if (msg.type === "response-received") {
    updateResponseTokens(msg.service, msg.responseText);
    return;
  }

  if (msg.type === "get-stats") {
    getDayData(getToday()).then(data => sendResponse(data));
    return true;
  }
});

async function updateResponseTokens(serviceKey, responseText) {
  const today = getToday();
  const dayData = await getDayData(today);
  const tokens = estimateTokens(responseText);
  const extraWh = tokens * (SERVICES[serviceKey]?.whPerToken || 0);

  if (dayData.services[serviceKey]) {
    dayData.services[serviceKey].responseTokens += tokens;
    dayData.services[serviceKey].wh += extraWh;
    dayData.totalWh += extraWh;
  }

  // Update letzten Request
  if (dayData.requests.length > 0) {
    const last = dayData.requests[dayData.requests.length - 1];
    if (last.service === serviceKey) {
      last.responseTokens += tokens;
      last.wh += Math.round(extraWh * 100) / 100;
    }
  }

  await saveDayData(today, dayData);
  await updateBadge();
}

function analyzePrompt(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const simplePatterns = [
    // German
    "was ist", "wer ist", "wann wurde", "wie heisst", "wie heißt",
    "hauptstadt", "einwohner", "wo liegt", "was bedeutet",
    "uebersetze", "übersetze", "wetter", "uhrzeit",
    "wie alt", "wie gross", "wie groß", "wie weit",
    // English
    "what is", "who is", "when was", "where is", "define",
    "capital of", "population of", "translate", "weather",
    "how old", "how far", "how tall", "how big",
    // Universal
    "definition"
  ];
  const isSimple = simplePatterns.some(p => lower.includes(p));
  if (isSimple && text.length < 120) {
    return _("googleSuggestion");
  }
  return null;
}

// --- Cleanup alter Daten (>90 Tage) ---
async function cleanup() {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const keysToRemove = Object.keys(all).filter(key => {
    if (!key.startsWith("day_")) return false;
    return key.replace("day_", "") < cutoffStr;
  });

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

// --- Init ---
cleanup();
updateBadge();
