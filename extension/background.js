// AI Energy Monitor v3 - Background Service Worker
var _ = chrome.i18n.getMessage;

// --- Energie-Modell: Profile ---
// Drei kalibrierte Quell-Profile. Das aktive Profil wird aus chrome.storage.local geladen.
// Formel: E(Wh) = whBase + N_out * whPerToken
//   whBase     = fixer Overhead (Server-Start, Input-Prefill, TTFT-Latenz)
//   whPerToken = Decode-Aufwand pro OUTPUT-Token (autoregressive Generation)
//
// Skalierungsfaktoren (Referenz: Jegham @ ChatGPT 300 Out-Token = 0.435 Wh):
//   jegham: 1.000x  — empirische Messung, konservativ   (Jegham et al. arXiv:2505.09598)
//   altman: 0.782x  — OpenAI-CEO, 0.34 Wh Durchschnitt (blog.samaltman.com, Jun. 2025)
//   epoch:  0.465x  — FLOP-basiert, 0.30 Wh @ 100in+500out (Epoch AI, Feb. 2025)

// Token-Schätzung
const CHARS_PER_TOKEN      = 4;    // Zeichen pro Token, Englisch BPE (3.8–4.2)
const DECODE_PREFILL_RATIO = 2.5;  // β: Output-Tokens 2.5x teurer als Input-Tokens
const REF_WH               = 0.30; // Epoch AI Referenz-Wh
const REF_N_IN             = 100;  // Input-Tokens der Referenz
const REF_N_OUT            = 500;  // Output-Tokens der Referenz

const DEFAULT_PROFILE = 'altman'; // bekannteste oeffentliche Zahl (OpenAI CEO)
const DEFAULT_GOOGLE_BASELINE = 'classic'; // conservative: Google 2009 official value
const GOOGLE_BASELINE_REVISED_WH = 0.040;  // Vanderbauwhede arXiv:2407.16894 (Jan. 2025)

// Service-Labels: unabhaengig vom Profil
const SERVICE_LABELS = {
  chatgpt:          'ChatGPT',
  copilot:          'Microsoft Copilot',
  gemini:           'Google Gemini',
  claude:           'Claude',
  perplexity:       'Perplexity',
  google:           'Google Search',
  'google-ai-mode': 'Google AI Mode',
  deepseek:         'DeepSeek',
  grok:             'Grok',
  meta:             'Meta AI',
  poe:              'Poe',
  'github-copilot': 'GitHub Copilot'
};

// Energie-Profile (whBase / whPerToken pro Dienst)
const PROFILES = {
  // ── Jegham et al. arXiv:2505.09598 (Mai 2025) ─────────────────────────────
  // ACM FAccT peer-reviewed, empirische GPU-Messung. ChatGPT @ 300 out = 0.435 Wh
  // Source: https://arxiv.org/abs/2505.09598
  jegham: {
    chatgpt:          { whBase: 0.120, whPerToken: 0.00105 },
    copilot:          { whBase: 0.120, whPerToken: 0.00105 },
    gemini:           { whBase: 0.050, whPerToken: 0.00065 },
    claude:           { whBase: 0.120, whPerToken: 0.00240 },
    perplexity:       { whBase: 0.100, whPerToken: 0.00100 },
    google:           { whBase: 0.300, whPerToken: 0       },
    'google-ai-mode': { whBase: 0.120, whPerToken: 0.00065 },
    deepseek:         { whBase: 0.080, whPerToken: 0.00080 },
    grok:             { whBase: 0.120, whPerToken: 0.00100 },
    meta:             { whBase: 0.080, whPerToken: 0.00070 },
    poe:              { whBase: 0.120, whPerToken: 0.00100 },
    'github-copilot': { whBase: 0.120, whPerToken: 0.00105 }
  },
  // ── Sam Altman / OpenAI "The Gentle Singularity" (Jun. 2025) ──────────────
  // CEO-Blog, 0.34 Wh Durchschnitt. ChatGPT @ 300 out = 0.340 Wh. Skala: 0.782x
  // Source: https://blog.samaltman.com/the-gentle-singularity
  altman: {
    chatgpt:          { whBase: 0.094, whPerToken: 0.00082 },
    copilot:          { whBase: 0.094, whPerToken: 0.00082 },
    gemini:           { whBase: 0.039, whPerToken: 0.00051 },
    claude:           { whBase: 0.094, whPerToken: 0.00188 },
    perplexity:       { whBase: 0.078, whPerToken: 0.00078 },
    google:           { whBase: 0.235, whPerToken: 0       },
    'google-ai-mode': { whBase: 0.094, whPerToken: 0.00051 },
    deepseek:         { whBase: 0.063, whPerToken: 0.00063 },
    grok:             { whBase: 0.094, whPerToken: 0.00078 },
    meta:             { whBase: 0.063, whPerToken: 0.00055 },
    poe:              { whBase: 0.094, whPerToken: 0.00078 },
    'github-copilot': { whBase: 0.094, whPerToken: 0.00082 }
  },
  // ── Epoch AI "How much energy does ChatGPT use?" (Feb. 2025) ──────────────
  // FLOP-basierte Ableitung, transparente Methodik. ChatGPT @ 100in+500out = 0.300 Wh. Skala: 0.465x
  // Source: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
  epoch: {
    chatgpt:          { whBase: 0.056, whPerToken: 0.00049 },
    copilot:          { whBase: 0.056, whPerToken: 0.00049 },
    gemini:           { whBase: 0.023, whPerToken: 0.00030 },
    claude:           { whBase: 0.056, whPerToken: 0.00112 },
    perplexity:       { whBase: 0.047, whPerToken: 0.00047 },
    google:           { whBase: 0.140, whPerToken: 0       },
    'google-ai-mode': { whBase: 0.056, whPerToken: 0.00030 },
    deepseek:         { whBase: 0.037, whPerToken: 0.00037 },
    grok:             { whBase: 0.056, whPerToken: 0.00047 },
    meta:             { whBase: 0.037, whPerToken: 0.00033 },
    poe:              { whBase: 0.056, whPerToken: 0.00047 },
    'github-copilot': { whBase: 0.056, whPerToken: 0.00049 }
  }
};

// Aktive Dienste-Konfiguration (wird durch applyProfile() befuellt)
let SERVICES = {};

function applyProfile(key, googleBaseline) {
  const p = PROFILES[key] || PROFILES[DEFAULT_PROFILE];
  SERVICES = {};
  for (const svc in p) {
    SERVICES[svc] = { whBase: p[svc].whBase, whPerToken: p[svc].whPerToken, label: SERVICE_LABELS[svc] };
  }
  // Google search baseline is independent of LLM profiles – override if revised is selected
  if ((googleBaseline || DEFAULT_GOOGLE_BASELINE) === 'revised' && SERVICES['google']) {
    SERVICES['google'].whBase = GOOGLE_BASELINE_REVISED_WH;
  }
}

async function loadActiveProfile() {
  const data = await chrome.storage.local.get('settings');
  const profile  = (data.settings && data.settings.energyProfile)      || DEFAULT_PROFILE;
  const baseline = (data.settings && data.settings.googleSearchBaseline) || DEFAULT_GOOGLE_BASELINE;
  applyProfile(profile, baseline);
}

// Apply defaults synchronously; async loadActiveProfile() will override
applyProfile(DEFAULT_PROFILE, DEFAULT_GOOGLE_BASELINE);

const DAILY_LIMIT_WH = 100;
const WEEKLY_LIMIT_WH = 500;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function calcWh(serviceKey, promptTokens, responseTokens) {
  const s = SERVICES[serviceKey];
  if (!s) return 0;
  // Only output tokens drive the per-token cost (autoregressive generation).
  // Input token processing is already covered by whBase.
  return s.whBase + (responseTokens || 0) * s.whPerToken;
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
  // Google AI Mode (udm=50) must be checked before regular Google search
  if ((url.includes('www.google.com/search') || url.includes('www.google.de/search')) &&
      url.includes('udm=50')) {
    return 'google-ai-mode';
  }
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

  // Persist active service so the popup status orb can read it
  chrome.storage.local.set({ _activeService: service || null });

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

  if (msg.type === "real-token-data") {
    updateWithRealTokens(msg.service, msg.promptTokens || 0, msg.responseTokens || 0);
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

  // Skip if the last request already has verified real token data from the interceptor.
  // This prevents the DOM-based estimate from overwriting accurate values.
  const reqs = dayData.requests;
  if (reqs.length > 0) {
    const last = reqs[reqs.length - 1];
    if (last.service === serviceKey && last.realTokens) return;
  }

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

// Replaces the estimated token counts for the last request with real values
// received from the MAIN world fetch interceptor. Uses a delta approach so the
// function is correct regardless of whether updateResponseTokens already ran.
async function updateWithRealTokens(serviceKey, promptTokens, responseTokens) {
  const today = getToday();
  const dayData = await getDayData(today);

  if (!dayData.services[serviceKey]) return;

  // Find the last request record for this service
  let lastIdx = -1;
  for (let i = dayData.requests.length - 1; i >= 0; i--) {
    if (dayData.requests[i].service === serviceKey) { lastIdx = i; break; }
  }
  if (lastIdx === -1) return;

  const last = dayData.requests[lastIdx];
  const svc = dayData.services[serviceKey];

  // Calculate the difference between new (real) and old (estimated) wh
  const oldWh = last.wh || 0;
  const newWh = calcWh(serviceKey, promptTokens, responseTokens);
  const whDiff = newWh - oldWh;

  // Adjust service totals by replacing the old estimates with real values
  svc.promptTokens  = (svc.promptTokens  || 0) - (last.promptTokens  || 0) + promptTokens;
  svc.responseTokens = (svc.responseTokens || 0) - (last.responseTokens || 0) + responseTokens;
  svc.wh = (svc.wh || 0) + whDiff;
  dayData.totalWh = (dayData.totalWh || 0) + whDiff;

  // Overwrite the individual request record with verified data
  last.promptTokens  = promptTokens;
  last.responseTokens = responseTokens;
  last.wh = Math.round(newWh * 100) / 100;
  last.realTokens = true; // Prevents updateResponseTokens from overwriting this

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

// --- Icon: Canvas-generated, replaces static PNG on every load ---
function generateIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;
  const r = Math.round(s * 0.2);

  // Rounded dark background
  ctx.fillStyle = '#0c1425';
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(s - r, 0);
  ctx.arcTo(s, 0, s, r, r); ctx.lineTo(s, s - r);
  ctx.arcTo(s, s, s - r, s, r); ctx.lineTo(r, s);
  ctx.arcTo(0, s, 0, s - r, r); ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r); ctx.closePath();
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(65,197,255,0.3)';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.stroke();

  // Glow at larger sizes
  if (s >= 48) { ctx.shadowColor = '#41c5ff'; ctx.shadowBlur = s * 0.1; }

  // Lightning bolt shape
  const p = s / 100;
  ctx.fillStyle = '#41c5ff';
  ctx.beginPath();
  ctx.moveTo(p*60, p*6);
  ctx.lineTo(p*34, p*48);
  ctx.lineTo(p*50, p*48);
  ctx.lineTo(p*37, p*94);
  ctx.lineTo(p*66, p*52);
  ctx.lineTo(p*50, p*52);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, s, s);
}

async function setCanvasIcon() {
  try {
    const imageData = { '16': generateIcon(16), '48': generateIcon(48), '128': generateIcon(128) };
    await chrome.action.setIcon({ imageData });
  } catch (e) { /* fallback to static PNG */ }
}

// Re-apply profile when user changes setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const newSettings = changes.settings.newValue || {};
    const profile  = newSettings.energyProfile       || DEFAULT_PROFILE;
    const baseline = newSettings.googleSearchBaseline || DEFAULT_GOOGLE_BASELINE;
    applyProfile(profile, baseline);
  }
});

// --- Init ---
cleanup();
updateBadge();
setCanvasIcon();
loadActiveProfile();
