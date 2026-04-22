// AI Energy Monitor v3 - Background Service Worker
var _ = chrome.i18n.getMessage;

// Precise tokenizer for ChatGPT (cl100k_base / gpt-4)
// Exposes self.chatgptCountTokens(text) → exact token count
try { importScripts('../lib/gpt-tokenizer-cl100k.js'); } catch (e) { /* fallback to char estimate */ }

// Zentrales Storage-Modul (File System API + chrome.storage Puffer)
importScripts('storage.js');

// --- Energie-Modell: Profile ---
// Drei kalibrierte Quell-Profile. Das aktive Profil wird aus chrome.storage.local geladen.
// Formel: E(Wh) = (whBase + N_out × whPerToken) × PUE_FACTOR
//   whBase     = fixer Overhead – enthält implizit GPU + CPU + RAM (gemessen als Ganzes)
//                  GPU_FACTOR: GPU-Rechenanteil          → in whBase enthalten
//                  CPU_FACTOR: Scheduling, Tokenizer     → in whBase enthalten
//                  RAM_FACTOR: KV-Cache, Aktivierungen   → in whBase enthalten
//   whPerToken = Decode-Aufwand pro OUTPUT-Token (autoregressive Generation)
//   PUE_FACTOR = Power Usage Effectiveness, Kühlungs-Overhead Rechenzentrum (nutzereinstellbar)
//   WUE_FACTOR = Water Usage Effectiveness – Wasserverbrauch, kein Energiemultiplikator,
//                wird separat im Wasserverbrauchs-Feature ausgewertet
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

const DEFAULT_PROFILE = 'jegham'; // empirische Messung als Standardbasis
const DEFAULT_GOOGLE_BASELINE = 'classic'; // conservative: Google 2009 official value
const GOOGLE_BASELINE_REVISED_WH = 0.040;  // Vanderbauwhede arXiv:2407.16894 (Jan. 2025)

// ── PUE / WUE ────────────────────────────────────────────────────────────────
// PUE_FACTOR: einziger aktiver Multiplikator in calcWh (nutzereinstellbar)
// WUE_FACTOR: Referenzwert für zukünftiges Wasserverbrauchs-Feature, kein Energiefaktor
const PUE_VALUES      = { hyperscale: 1.09, industry: 1.56 };
const DEFAULT_PUE_PROFILE = 'industry';
const NO_PUE_SERVICES = new Set(['google']); // bereits All-inclusive, kein PUE-Aufschlag
const WUE_FACTOR      = 1.0; // L/kWh – Wasserverbrauch, nicht in Wh-Formel

let PUE_FACTOR = PUE_VALUES[DEFAULT_PUE_PROFILE];

// ── Feature Flag: Neue Strategie-Architektur ─────────────────────────────────
// false = Production (bisheriges Verhalten), true = Development (neue Strategy Maps)
let featureFlags = {};

// ── Token-Strategie pro Dienst ────────────────────────────────────────────────
// prompt:   Methode für Input-Token-Zählung beim Abschicken
// response: Methode für Output-Token-Zählung (interim, bis Interceptor feuert)
// Methoden: 'interceptor' | 'cl100k' | 'dom'
// 'interceptor' als response = dom als Zwischenwert, Interceptor überschreibt final
const TOKEN_STRATEGIES = {
  chatgpt:          { prompt: 'cl100k',      response: 'interceptor' },
  claude:           { prompt: 'interceptor', response: 'interceptor' },
  copilot:          { prompt: 'cl100k',      response: 'dom'         },
  gemini:           { prompt: 'dom',         response: 'dom'         },
  perplexity:       { prompt: 'dom',         response: 'dom'         },
  deepseek:         { prompt: 'dom',         response: 'dom'         },
  grok:             { prompt: 'dom',         response: 'dom'         },
  meta:             { prompt: 'dom',         response: 'dom'         },
  poe:              { prompt: 'dom',         response: 'dom'         },
  'github-copilot': { prompt: 'cl100k',      response: 'dom'         },
  'google-ai-mode': { prompt: 'dom',         response: 'dom'         },
  google:           { prompt: 'dom',         response: 'dom'         },
  mistral:          { prompt: 'dom',         response: 'dom'         },
};

// ── Modell-Slug Normalisierung ────────────────────────────────────────────────
// Mappt interne API-Slugs auf lesbare Anzeigenamen (partial-match via startsWith)
const MODEL_SLUGS = {
  'gpt-4o-mini':   'GPT-4o mini',
  'gpt-4o':        'GPT-4o',
  'o3-mini':       'o3 mini',
  'o3':            'o3',
  'o1-mini':       'o1 mini',
  'o1-preview':    'o1',
  'o1':            'o1',
  'claude-opus':   'Claude Opus',
  'claude-sonnet': 'Claude Sonnet',
  'claude-haiku':  'Claude Haiku',
};

function normalizeModel(slug) {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  for (const key of Object.keys(MODEL_SLUGS)) {
    if (lower.startsWith(key) || lower.includes(key)) return MODEL_SLUGS[key];
  }
  return slug; // unbekannte Slugs unverändert speichern
}

// Gibt die passende Tokenizer-Funktion zurück abhängig von Strategie
function resolveTokenFn(serviceKey, role) {
  const strategy = TOKEN_STRATEGIES[serviceKey] || { prompt: 'dom', response: 'dom' };
  const method   = strategy[role];
  // 'interceptor' als response-Methode: dom als Interim, wird von updateWithRealTokens überschrieben
  if ((method === 'cl100k' || method === 'interceptor' && role === 'prompt') && self.chatgptCountTokens) {
    return self.chatgptCountTokens;
  }
  return estimateTokens;
}

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
  'github-copilot': 'GitHub Copilot',
  mistral:          'Mistral AI'
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
    'github-copilot': { whBase: 0.120, whPerToken: 0.00105 },
    mistral:          { whBase: 0.090, whPerToken: 0.00090 }
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
    'github-copilot': { whBase: 0.094, whPerToken: 0.00082 },
    mistral:          { whBase: 0.070, whPerToken: 0.00070 }
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
    'github-copilot': { whBase: 0.056, whPerToken: 0.00049 },
    mistral:          { whBase: 0.042, whPerToken: 0.00042 }
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

function applyBuildModeBadge(isDev) {
  if (isDev) {
    chrome.action.setBadgeText({ text: 'DEV' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } else {
    updateBadge();
  }
}

async function loadActiveProfile() {
  const data = await chrome.storage.local.get('settings');
  const profile    = (data.settings && data.settings.energyProfile)       || DEFAULT_PROFILE;
  const baseline   = (data.settings && data.settings.googleSearchBaseline) || DEFAULT_GOOGLE_BASELINE;
  const pueProfile = (data.settings && data.settings.pueProfile)           || DEFAULT_PUE_PROFILE;
  applyProfile(profile, baseline);
  PUE_FACTOR = PUE_VALUES[pueProfile] || PUE_VALUES[DEFAULT_PUE_PROFILE];
  featureFlags = (data.settings && data.settings.featureFlags) || {};
  applyBuildModeBadge(Object.values(featureFlags).some(v => !!v));
}

// Apply defaults synchronously; async loadActiveProfile() will override
applyProfile(DEFAULT_PROFILE, DEFAULT_GOOGLE_BASELINE);

const DAILY_LIMIT_WH = 100;
const WEEKLY_LIMIT_WH = 500;
const GAMIFICATION_KEY = 'gamification';
const GAMIFICATION_VERSION = 2;
const ACHIEVEMENT_EVENT_KEY = 'achievement_unlock_event';

const LEVEL_ACHIEVEMENTS = [
  { level: 0, xp: 0,    name: 'Welcome Newbie',        file: 'Welcome Newbie.png' },
  { level: 1, xp: 100,  name: 'Sparanfänger',          file: 'Spar-Anfänger.png' },
  { level: 2, xp: 300,  name: 'Watt-Wächter',          file: 'Watt-Wächter.png' },
  { level: 3, xp: 600,  name: 'Stromflüsterer',        file: 'Strom-Flüsterer.png' },
  { level: 4, xp: 1000, name: 'Nachhaltigkeits-Ninja', file: 'Nachhaltigkeits-Ninja.png' },
  { level: 5, xp: 1400, name: 'Energie-Alchemist',     file: 'Energie-Alchemist.png' },
  { level: 6, xp: 2000, name: 'Energie-Champion',      file: 'Energie-Champion.png' },
  { level: 7, xp: 2400, name: 'Energie-Kraftwerk',     file: 'Energie-Kraftwerk.png' },
  { level: 8, xp: 3000, name: 'Sparfuchs',             file: 'Sparfuchs.png' },
  { level: 9, xp: 3500, name: 'Energie-König',         file: 'Energie-König.png' },
  { level: 10, xp: 4000, name: 'Energiescout',         file: 'Energie Scout.png' }
];

const SPECIAL_ACHIEVEMENT_KEYS = {
  GOOGLE_NO_AI: 'hintertuer',
  CUSTOMIZE_CALC: 'wissensdurst',
  RACE_WINNER: 'sieger-sind-eben-sieger'
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureGamificationState() {
  const data = await chrome.storage.local.get([GAMIFICATION_KEY, 'settings']);
  const existing = data[GAMIFICATION_KEY];
  const normalized = {
    version: GAMIFICATION_VERSION,
    xp: existing && typeof existing.xp === 'number' ? existing.xp : 0,
    specials: existing && existing.specials ? existing.specials : {}
  };

  if (!existing || existing.version !== GAMIFICATION_VERSION) {
    const all = await chrome.storage.local.get(null);
    const dayKeys = Object.keys(all).filter(key => /^day_\d{4}-\d{2}-\d{2}$/.test(key));
    let totalXp = 0;
    for (const key of dayKeys) {
      const day = all[key] || {};
      if (!Array.isArray(day.requests)) continue;
      for (const req of day.requests) {
        totalXp += calcRequestXp(req.service, req.promptTokens || 0, req.responseTokens || 0);
      }
    }
    normalized.xp = totalXp;
  }

  if ((data.settings || {}).googleNoAI) {
    normalized.specials[SPECIAL_ACHIEVEMENT_KEYS.GOOGLE_NO_AI] = {
      unlocked: true,
      unlockedAt: normalized.specials[SPECIAL_ACHIEVEMENT_KEYS.GOOGLE_NO_AI]?.unlockedAt || new Date().toISOString()
    };
  }

  if (!existing ||
      existing.version !== normalized.version ||
      existing.xp !== normalized.xp ||
      JSON.stringify(existing.specials || {}) !== JSON.stringify(normalized.specials)) {
    await chrome.storage.local.set({ [GAMIFICATION_KEY]: normalized });
  }

  return normalized;
}

async function awardXp(amount, preferredTabId) {
  if (!amount) return;
  const state = await ensureGamificationState();
  const prevLevel = getLevelAchievement(state.xp);
  state.xp += amount;
  const nextLevel = getLevelAchievement(state.xp);
  const update = { [GAMIFICATION_KEY]: state };
  if (nextLevel.level > prevLevel.level) {
    const event = {
      nonce: Date.now(),
      id: String(nextLevel.level),
      title: nextLevel.name,
      image: 'assets/achievements/' + nextLevel.file,
      kind: 'level'
    };
    update[ACHIEVEMENT_EVENT_KEY] = event;
    emitAchievementToTab(event, preferredTabId);
  }
  await chrome.storage.local.set(update);
}

function calcRequestXp(serviceKey, promptTokens, responseTokens) {
  if (serviceKey === 'google') return 15;

  const totalTokens = (promptTokens || 0) + (responseTokens || 0);
  if (totalTokens < 400) return 5;
  if (totalTokens === 400) return 0;
  return -Math.ceil((totalTokens - 400) / 100);
}

function getLevelAchievement(xp) {
  let current = LEVEL_ACHIEVEMENTS[0];
  for (const item of LEVEL_ACHIEVEMENTS) {
    if (xp >= item.xp) current = item;
  }
  return current;
}

function emitAchievementToTab(event, preferredTabId) {
  try {
    if (preferredTabId) {
      chrome.tabs.sendMessage(preferredTabId, { type: 'achievement-unlocked', event: event }, function() {
        if (!chrome.runtime.lastError) return;
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(tabs) {
          if (!tabs || !tabs.length || !tabs[0].id) return;
          chrome.tabs.sendMessage(tabs[0].id, { type: 'achievement-unlocked', event: event }, function() {
            void chrome.runtime.lastError;
          });
        });
      });
      return;
    }

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(tabs) {
      if (!tabs || !tabs.length || !tabs[0].id) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'achievement-unlocked', event: event }, function() {
        void chrome.runtime.lastError;
      });
    });
  } catch (e) {
    void e;
  }
}

async function unlockSpecialAchievement(id) {
  if (!id) return;
  const state = await ensureGamificationState();
  if (state.specials[id] && state.specials[id].unlocked) return false;
  state.specials[id] = { unlocked: true, unlockedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [GAMIFICATION_KEY]: state });
  return true;
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
  const raw = s.whBase + (responseTokens || 0) * s.whPerToken;
  // Formel: E(Wh) = (whBase + N_out × whPerToken) × PUE_FACTOR
  // Google-Suche ist bereits All-inclusive → PUE_FACTOR dort nicht anwenden.
  const pue = NO_PUE_SERVICES.has(serviceKey) ? 1.0 : PUE_FACTOR;
  return raw * pue;
}

// --- Storage Helpers ---
async function getDayData(date) {
  return EnergiStorage.getDayData(date);
}

async function saveDayData(date, dayData) {
  return EnergiStorage.saveDayData(date, dayData);
}

// --- Session Tracking ---
const activeSessions = new Map(); // tabId -> { service, startTime }

// --- Core: Record a request ---
async function recordRequest(serviceKey, data = {}) {
  const today = getToday();
  const dayData = await getDayData(today);

  let promptTokens, responseTokens;
  // @flag newModelDetection
  if (featureFlags.newModelDetection) {
    promptTokens   = resolveTokenFn(serviceKey, 'prompt')(data.promptText);
    responseTokens = resolveTokenFn(serviceKey, 'response')(data.responseText);
  } else {
    const tokenize = (serviceKey === 'chatgpt' || serviceKey === 'copilot') && self.chatgptCountTokens
      ? self.chatgptCountTokens
      : estimateTokens;
    promptTokens   = tokenize(data.promptText);
    responseTokens = tokenize(data.responseText);
  }
  // @flag:end
  const wh = calcWh(serviceKey, promptTokens, responseTokens);
  const xpAwarded = calcRequestXp(serviceKey, promptTokens, responseTokens);

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
    id: data.requestId || Date.now(), // stable ID for parallel-request tracking
    service: serviceKey,
    time: Date.now(),
    wh: Math.round(wh * 100) / 100,
    promptTokens,
    responseTokens,
    promptPreview: (data.promptText || "").slice(0, 80),
    model: featureFlags.newModelDetection ? normalizeModel(data.model) : (data.model || null), // @flag:ternary newModelDetection
    xpAwarded
  });
  if (dayData.requests.length > 50) {
    dayData.requests = dayData.requests.slice(-50);
  }

  await saveDayData(today, dayData);
  await awardXp(xpAwarded, data.tabId);
  await updateBadge();
  await checkLimits(dayData.totalWh);
  await maybeShowFirstDetectionHint(serviceKey);
}

// --- Erster KI-Request: Hinweis-Fenster zeigen ---
async function maybeShowFirstDetectionHint(serviceKey) {
  const data = await chrome.storage.local.get(['_firstRequestSeen', '_fsConnected']);
  // Nur einmal anzeigen, und nur wenn Onboarding noch nicht abgeschlossen
  if (data._firstRequestSeen || data._fsConnected) return;

  await chrome.storage.local.set({ _firstRequestSeen: true });

  const label = SERVICE_LABELS[serviceKey] || serviceKey;
  chrome.notifications.create('first-ai-detected', {
    type:               'basic',
    iconUrl:            'assets/icons/icon128.png',
    title:              _('firstDetectTitle'),
    message:            _('firstDetectMsg', [label]),
    requireInteraction: true
  });
}

// Klick auf die Notification oeffnet popup.html als kleines Fenster
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId !== 'first-ai-detected') return;
  chrome.notifications.clear('first-ai-detected');
  chrome.windows.create({
    url:    chrome.runtime.getURL('pages/popup/popup.html'),
    type:   'popup',
    width:  340,
    height: 580,
    top:    48,
    left:   screen.availWidth - 360
  });
});

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
      iconUrl: "assets/icons/icon128.png",
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
    // Generate a stable ID before the async recordRequest so it can be
    // returned synchronously and stored in the request record.
    const requestId = Date.now();
    recordRequest(msg.service, {
      promptText: msg.promptText,
      responseText: msg.responseText || "",
      requestId,
      tabId: sender && sender.tab ? sender.tab.id : null
    });
    // Prüfe ob Google gereicht hätte
    const suggestion = analyzePrompt(msg.promptText);
    sendResponse({ suggestion, requestId });
    return true;
  }

  if (msg.type === "response-received") {
    updateResponseTokens(msg.service, msg.responseText, msg.requestId, sender && sender.tab ? sender.tab.id : null)
      .then(() => sendResponse({}))
      .catch(() => sendResponse({}));
    return true;
  }

  if (msg.type === "real-token-data") {
    updateWithRealTokens(msg.service, msg.promptTokens || 0, msg.responseTokens || 0, msg.requestId, sender && sender.tab ? sender.tab.id : null)
      .then(() => sendResponse({}))
      .catch(() => sendResponse({}));
    return true;
  }

  if (msg.type === "get-stats") {
    getDayData(getToday()).then(data => sendResponse(data));
    return true;
  }

  if (msg.type === 'get-gamification-state') {
    ensureGamificationState()
      .then(state => sendResponse({ state }))
      .catch(() => sendResponse({ state: { xp: 0, specials: {} } }));
    return true;
  }

  if (msg.type === 'unlock-special-achievement') {
    unlockSpecialAchievement(msg.id)
      .then(function(unlocked) { sendResponse({ ok: true, unlocked: !!unlocked }); })
      .catch(() => sendResponse({ ok: false, unlocked: false }));
    return true;
  }

  if (msg.type === "fs-connect") {
    // Popup hat Handle in IndexedDB gespeichert → jetzt initialisieren
    EnergiStorage.init().then(async connected => {
      if (connected) {
        await EnergiStorage.flushBuffer();
        await EnergiStorage.migrateLocalStorage();
      }
      sendResponse({ connected });
    });
    return true;
  }

  if (msg.type === "get-range") {
    // Dashboard fragt Daten für N Tage ab – liest aus Filesystem wenn verbunden
    const days  = msg.days || 7;
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    EnergiStorage.init().then(async () => {
      const result = {};
      for (const date of dates) {
        result[date] = await EnergiStorage.getDayData(date);
      }
      sendResponse({ data: result });
    });
    return true;
  }

  if (msg.type === 'company-dashboard-state') {
    EnergiStorage.init().then(async () => {
      const state = await EnergiStorage.listCompanyDashboards();
      sendResponse({
        dashboards: state.index?.dashboards || [],
        activeDashboardId: state.activeDashboardId || null
      });
    }).catch(() => sendResponse({ dashboards: [], activeDashboardId: null }));
    return true;
  }

  if (msg.type === 'company-dashboard-get') {
    EnergiStorage.init().then(async () => {
      const dashboard = await EnergiStorage.getCompanyDashboard(msg.id || null);
      sendResponse({ dashboard: dashboard || null });
    }).catch(() => sendResponse({ dashboard: null }));
    return true;
  }

  if (msg.type === 'company-dashboard-create') {
    EnergiStorage.init().then(async () => {
      const dashboard = await EnergiStorage.saveCompanyDashboard(msg.dashboard || {});
      sendResponse({ ok: true, dashboard });
    }).catch(err => sendResponse({ ok: false, error: String(err || '') }));
    return true;
  }

  if (msg.type === 'company-dashboard-save') {
    EnergiStorage.init().then(async () => {
      const dashboard = await EnergiStorage.saveCompanyDashboard(msg.dashboard || {});
      sendResponse({ ok: true, dashboard });
    }).catch(err => sendResponse({ ok: false, error: String(err || '') }));
    return true;
  }

  if (msg.type === 'company-dashboard-import') {
    EnergiStorage.init().then(async () => {
      const payload = { ...(msg.dashboard || {}), source: 'import' };
      const dashboard = await EnergiStorage.saveCompanyDashboard(payload);
      sendResponse({ ok: true, dashboard });
    }).catch(err => sendResponse({ ok: false, error: String(err || '') }));
    return true;
  }

  if (msg.type === 'company-dashboard-set-active') {
    EnergiStorage.init().then(async () => {
      const ok = await EnergiStorage.setActiveCompanyDashboard(msg.id || null);
      sendResponse({ ok: !!ok });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.type === 'company-dashboard-import-from-storage') {
    EnergiStorage.init().then(async connected => {
      if (!connected) {
        sendResponse({ ok: false, reason: 'not-connected' });
        return;
      }
      const result = await EnergiStorage.importCompanyDashboardFromStorage();
      sendResponse(result);
    }).catch(err => sendResponse({ ok: false, reason: 'error', error: String(err || '') }));
    return true;
  }

  if (msg.type === 'validate-extension-folder-structure') {
    EnergiStorage.init().then(async connected => {
      if (!connected) {
        sendResponse({ ok: false, reason: 'not-connected', missing: [] });
        return;
      }
      const result = await EnergiStorage.validateExtensionFolderStructure();
      sendResponse(result);
    }).catch(err => sendResponse({ ok: false, reason: 'error', error: String(err || '') }));
    return true;
  }

  if (msg.type === 'repair-extension-folder-structure') {
    EnergiStorage.init().then(async connected => {
      if (!connected) {
        sendResponse({ ok: false, reason: 'not-connected', missing: [] });
        return;
      }
      const result = await EnergiStorage.repairExtensionFolderStructure();
      sendResponse(result);
    }).catch(err => sendResponse({ ok: false, reason: 'error', error: String(err || '') }));
    return true;
  }

  if (msg.type === "clear-fs-data") {
    EnergiStorage.init().then(connected => {
      if (!connected) { sendResponse({ ok: false }); return; }
      EnergiStorage.clearDataFolder()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    });
    return true;
  }
});

async function updateResponseTokens(serviceKey, responseText, requestId, tabId) {
  const today = getToday();
  const dayData = await getDayData(today);
  const reqs = dayData.requests;

  // Find target request: by ID first (parallel-prompt safety), then fallback to last matching service
  let targetIdx = -1;
  if (requestId) {
    for (let i = reqs.length - 1; i >= 0; i--) {
      if (reqs[i].id === requestId) { targetIdx = i; break; }
    }
  }
  if (targetIdx === -1) {
    for (let i = reqs.length - 1; i >= 0; i--) {
      if (reqs[i].service === serviceKey) { targetIdx = i; break; }
    }
  }
  if (targetIdx === -1) return;

  const target = reqs[targetIdx];
  // Skip if this request already has verified real token data from the interceptor.
  if (target.realTokens) return;

  // @flag newModelDetection
  let tokens;
  if (featureFlags.newModelDetection) {
    tokens = resolveTokenFn(serviceKey, 'response')(responseText);
  } else {
    tokens = estimateTokens(responseText);
  }
  // @flag:end

  // Delta approach: only add the difference from the previous estimate for this request.
  const prevTokens = target.responseTokens || 0;
  const delta = tokens - prevTokens;
  if (delta <= 0) return; // Response shrunk or unchanged — skip

  const deltaWh = delta * (SERVICES[serviceKey]?.whPerToken || 0);
  const newWh = calcWh(serviceKey, target.promptTokens || 0, tokens);
  const oldXp = target.xpAwarded || 0;
  const newXp = calcRequestXp(serviceKey, target.promptTokens || 0, tokens);
  const xpDiff = newXp - oldXp;

  if (dayData.services[serviceKey]) {
    dayData.services[serviceKey].responseTokens += delta;
    dayData.services[serviceKey].wh += deltaWh;
    dayData.totalWh += deltaWh;
  }

  target.responseTokens = tokens;
  target.wh = Math.round(newWh * 100) / 100;
  target.xpAwarded = newXp;

  await saveDayData(today, dayData);
  await awardXp(xpDiff, tabId);
  await updateBadge();
}

// Replaces the estimated token counts for the last request with real values
// received from the MAIN world fetch interceptor. Uses a delta approach so the
// function is correct regardless of whether updateResponseTokens already ran.
async function updateWithRealTokens(serviceKey, promptTokens, responseTokens, requestId, tabId) {
  const today = getToday();
  const dayData = await getDayData(today);

  if (!dayData.services[serviceKey]) return;

  // Find target request: by ID first, then fallback to last matching service
  let lastIdx = -1;
  if (requestId) {
    for (let i = dayData.requests.length - 1; i >= 0; i--) {
      if (dayData.requests[i].id === requestId) { lastIdx = i; break; }
    }
  }
  if (lastIdx === -1) {
    for (let i = dayData.requests.length - 1; i >= 0; i--) {
      if (dayData.requests[i].service === serviceKey) { lastIdx = i; break; }
    }
  }
  if (lastIdx === -1) return;

  const last = dayData.requests[lastIdx];
  const svc = dayData.services[serviceKey];

  // Calculate the difference between new (real) and old (estimated) wh
  const oldWh = last.wh || 0;
  const newWh = calcWh(serviceKey, promptTokens, responseTokens);
  const whDiff = newWh - oldWh;
  const oldXp = last.xpAwarded || 0;
  const newXp = calcRequestXp(serviceKey, promptTokens, responseTokens);
  const xpDiff = newXp - oldXp;

  // Adjust service totals by replacing the old estimates with real values
  svc.promptTokens  = (svc.promptTokens  || 0) - (last.promptTokens  || 0) + promptTokens;
  svc.responseTokens = (svc.responseTokens || 0) - (last.responseTokens || 0) + responseTokens;
  svc.wh = (svc.wh || 0) + whDiff;
  dayData.totalWh = (dayData.totalWh || 0) + whDiff;

  // Overwrite the individual request record with verified data
  last.promptTokens  = promptTokens;
  last.responseTokens = responseTokens;
  last.wh = Math.round(newWh * 100) / 100;
  last.xpAwarded = newXp;
  last.realTokens = true; // Prevents updateResponseTokens from overwriting this

  await saveDayData(today, dayData);
  await awardXp(xpDiff, tabId);
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

// Re-apply profile + PUE when user changes setting
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const newSettings = changes.settings.newValue || {};
    const profile    = newSettings.energyProfile       || DEFAULT_PROFILE;
    const baseline   = newSettings.googleSearchBaseline || DEFAULT_GOOGLE_BASELINE;
    const pueProfile = newSettings.pueProfile           || DEFAULT_PUE_PROFILE;
    applyProfile(profile, baseline);
    PUE_FACTOR = PUE_VALUES[pueProfile] || PUE_VALUES[DEFAULT_PUE_PROFILE];
    featureFlags = newSettings.featureFlags || {};
    applyBuildModeBadge(Object.values(featureFlags).some(v => !!v));
  }
});

// --- Init ---
cleanup();
updateBadge();
loadActiveProfile();
ensureGamificationState();

// Storage initialisieren: Handle aus IndexedDB wiederherstellen
EnergiStorage.init().then(connected => {
  if (connected) EnergiStorage.flushBuffer();
});

// Tageswechsel erkennen: Aggregate für gestern berechnen
let _lastDay = new Date().toISOString().slice(0, 10);
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== _lastDay) {
    EnergiStorage.onDayRollover(_lastDay);
    _lastDay = today;
  }
}, 60_000); // jede Minute prüfen

// Settings-Backup wenn sich Settings ändern
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings?.newValue) {
    EnergiStorage.backupSettings(changes.settings.newValue);
  }
});

// ── Google No-AI: Interception vor dem Seitenaufruf ──────────────────────────
// Einstellung im Memory cachen → synchrone Prüfung in onBeforeNavigate
let _googleNoAI = false;
chrome.storage.local.get('settings', d => {
  _googleNoAI = !!((d.settings || {}).googleNoAI);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    _googleNoAI = !!((changes.settings.newValue || {}).googleNoAI);
  }
});

const GOOGLE_SEARCH_HOSTS = ['www.google.com', 'www.google.de'];

chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;           // nur Haupt-Frame
  if (!_googleNoAI) return;

  try {
    const url = new URL(details.url);
    const q   = url.searchParams.get('q');
    if (!q || q.indexOf('-ai') !== -1) return; // bereits vorhanden

    url.searchParams.set('q', q.trim() + ' -ai');
    chrome.tabs.update(details.tabId, { url: url.toString() });
  } catch (e) { /* ungültige URL, ignorieren */ }
}, {
  url: GOOGLE_SEARCH_HOSTS.map(host => ({
    hostEquals: host,
    pathEquals: '/search'
  }))
});
