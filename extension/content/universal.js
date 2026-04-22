// Universelles Content Script fuer alle KI-Chat-Dienste
// Statt fragiler DOM-Selektoren pro Dienst nutzen wir einen robusten Ansatz:
// Wir beobachten ALLE Tastendruecke und Klicks auf Submit-artige Buttons
(function() {
  var SERVICE_MAP = {
    // ChatGPT
    "chatgpt.com": "chatgpt",
    "chat.com": "chatgpt",
    "gpt.com": "chatgpt",
    "chat.openai.com": "chatgpt",
    "openai.com": "chatgpt",
    // Gemini / Bard / AI Studio
    "gemini.google.com": "gemini",
    "bard.google.com": "gemini",
    "aistudio.google.com": "gemini",
    // Copilot / Bing / M365
    "copilot.com": "copilot",
    "www.copilot.com": "copilot",
    "copilot.microsoft.com": "copilot",
    "copilot.cloud.microsoft": "copilot",
    "m365.cloud.microsoft": "copilot",
    "m365copilot.com": "copilot",
    "www.bing.com": "copilot",
    "m.bing.com": "copilot",
    "edgeservices.bing.com": "copilot",
    // Perplexity
    "www.perplexity.ai": "perplexity",
    "perplexity.ai": "perplexity",
    // Claude
    "claude.ai": "claude",
    // Optionale
    "chat.deepseek.com": "deepseek",
    "grok.com": "grok",
    "x.com": "grok",
    "www.meta.ai": "meta",
    "meta.ai": "meta",
    "poe.com": "poe",
    "www.poe.com": "poe",
    "github.com": "github-copilot",
    "copilot.github.com": "github-copilot",
    "chat.mistral.ai": "mistral"
  };

  // URL-Filter: Manche Domains haben KI-Chat nur auf bestimmten Pfaden
  var hostname = window.location.hostname;
  var pathname = window.location.pathname;
  var service = SERVICE_MAP[hostname];

  // Bing: nur Chat-Pfade, nicht normale Suche
  if (hostname === "www.bing.com" || hostname === "m.bing.com") {
    if (pathname.indexOf("/chat") === -1 && pathname.indexOf("/copilot") === -1 && pathname.indexOf("/new") === -1) {
      return;
    }
  }
  if (hostname === "edgeservices.bing.com" && pathname.indexOf("/edgesvc/chat") === -1) {
    return;
  }
  // OpenAI: nur /chatgpt Pfad
  if (hostname === "openai.com" && pathname.indexOf("/chatgpt") === -1) {
    return;
  }
  // GitHub: nur /copilot Pfad
  if (hostname === "github.com" && pathname.indexOf("/copilot") === -1) {
    return;
  }
  // x.com: nur /i/grok Pfad
  if (hostname === "x.com" && pathname.indexOf("/i/grok") === -1) {
    return;
  }
  if (!service) return;

  var DEFAULT_TOKEN_SAVER_PROMPT = "Antworte kurz, keine Emojis, nur das Wesentliche";
  var OPTIONAL_LIST = ["copilot", "claude", "google", "deepseek", "grok", "meta", "poe", "github-copilot", "mistral"];

  // Module-level settings — updated live via chrome.storage.onChanged
  var tokenSaverMode   = false;
  var tokenSaverPrompt = DEFAULT_TOKEN_SAVER_PROMPT;
  var devMode = false;
  var activeHudProfile = 'jegham';
  var trackingInitialized = false;

  function isServiceEnabled(settings) {
    var optional = settings.optionalServices || {};
    var standard = settings.standardServices || {};
    if (OPTIONAL_LIST.indexOf(service) !== -1 && !optional[service]) {
      if (!(standard[service] !== false && (service === "copilot" || service === "claude" || service === "google"))) {
        return false;
      }
    }
    if ((service === "copilot" || service === "claude" || service === "google") &&
        !optional.hasOwnProperty(service) && standard[service] === false) {
      return false;
    }
    return true;
  }

  function applySettings(settings) {
    tokenSaverMode   = !!settings.tokenSaverMode;
    tokenSaverPrompt = settings.tokenSaverPrompt || DEFAULT_TOKEN_SAVER_PROMPT;
    devMode = !!settings.devMode;
    activeHudProfile = settings.energyProfile || 'jegham';
  }

  // Initial settings load + tracking start
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    applySettings(settings);
    if (isServiceEnabled(settings)) {
      trackingInitialized = true;
      initTracking();
    }
  });

  // Live-update: always track devMode flag so switching modes works instantly.
  // Full settings live-update is DEV only — in production, changes apply after page reload.
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local' || !changes.settings) return;
    var newSettings = changes.settings.newValue || {};
    devMode = !!newSettings.devMode;
    if (!devMode) return;
    applySettings(newSettings);
    if (!trackingInitialized && isServiceEnabled(newSettings)) {
      trackingInitialized = true;
      initTracking();
    }
  });

  function initTracking() {
    var lastText = "";
    var lastTime = 0;
    var DEBOUNCE = 3000;

    function calcXp(totalTokens) {
      if (totalTokens < 400) return 5;
      if (totalTokens === 400) return 0;
      return -Math.ceil((totalTokens - 400) / 100);
    }

    function fmtXp(xp) {
      if (xp > 0) return '+' + xp + ' XP';
      if (xp < 0) return String(xp) + ' XP';
      return '0 XP';
    }

    function reflowHudStack() {
      var top = 70;
      ['__aem-hud__', '__aem-google-search-hud__', '__aem-google-ai-hud__', '__aem-achievement-hud__'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        el.style.right = '20px';
        el.style.top = top + 'px';
        var rect = el.getBoundingClientRect();
        if (!rect.height) return;
        top = Math.ceil(rect.bottom + 8);
      });
    }

    function showAchievementUnlockHud(options) {
      if (!options) return;
      var old = document.getElementById('__aem-achievement-hud__');
      if (old) old.remove();

      var hud = document.createElement('div');
      hud.id = '__aem-achievement-hud__';
      hud.style.cssText = [
        'position:fixed',
        'top:70px',
        'right:20px',
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
          '<button id="__aem-achievement-btn__" style="margin-top:8px;background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:6px 9px;font:600 11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">Zum Achievement</button>' +
        '</div>' +
        '<button id="__aem-achievement-close__" style="align-self:flex-start;background:none;border:none;color:#9c8c7a;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;">×</button>';

      document.body.appendChild(hud);

      function removeHud() {
        if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
        reflowHudStack();
      }

      hud.querySelector('#__aem-achievement-btn__').addEventListener('click', function() {
        window.location.href = chrome.runtime.getURL('pages/dashboard/dashboard.html');
        removeHud();
      });
      hud.querySelector('#__aem-achievement-close__').addEventListener('click', removeHud);
      reflowHudStack();
      setTimeout(removeHud, 7000);
    }

    // Gesamte Service-Konfiguration: promptInput + optionale Modi + optionaler Modell-Selektor
    var SERVICE_CONFIG = {
      chatgpt:    {
        promptInput:   '#prompt-textarea',
        modelSelector: '[data-testid="model-switcher-dropdown-button"]',
        model: {
          strategy:    'interceptor-first',
          domSelector: '[data-testid="model-switcher-dropdown-button"]'
        },
        modes: {
          think:        'button.__composer-pill[aria-label*="Think"]',
          deepResearch: 'button.__composer-pill[aria-label*="Deep Research"]'
        }
      },
      claude:     {
        promptInput:   '[data-testid="chat-input"]',
        modelSelector: '[data-testid="model-selector-dropdown"] .whitespace-nowrap',
        model: {
          strategy:    'interceptor-first',
          domSelector: '[data-testid="model-selector-dropdown"] .whitespace-nowrap'
        },
        modes: {
          think: '[data-testid="model-selector-dropdown"] span'
        }
      },
      gemini:     {
        promptInput: '.ql-editor[contenteditable="true"]',
        model: { strategy: 'dom-only', domSelector: null }
      },
      perplexity: {
        promptInput: '#ask-input',
        model: { strategy: 'dom-only', domSelector: null }
      },
      copilot:    {
        promptInput: '[data-testid="composer-input"]',
        model: { strategy: 'dom-only', domSelector: null }
      },
      mistral:    {
        promptInput: 'textarea',
        model: {
          strategy:    'dom-only',
          domSelector: '[data-testid="model-selector"] span, .model-selector button span'
        }
      }
    };

    function isPromptInput(el) {
      if (!el) return false;
      var cfg = SERVICE_CONFIG[service];
      if (!cfg) return true; // Service nicht gemappt → altes Verhalten beibehalten
      return !!(el.matches && (el.matches(cfg.promptInput) || el.closest(cfg.promptInput)));
    }

    function getActiveMode() {
      var cfg = SERVICE_CONFIG[service];
      if (!cfg || !cfg.modes) return null;
      for (var mode in cfg.modes) {
        if (document.querySelector(cfg.modes[mode])) return mode;
      }
      return null;
    }

    function getActiveModel() {
      var cfg = SERVICE_CONFIG[service];
      if (!cfg) return null;

      if (devMode && cfg.model) {
        var strategy = cfg.model.strategy;
        var domResult = cfg.model.domSelector
          ? (function() { var el = document.querySelector(cfg.model.domSelector); return el ? el.textContent.trim() : null; })()
          : null;
        if (strategy === 'interceptor-first') return detectedModelSlug || domResult;
        if (strategy === 'dom-first')         return domResult || detectedModelSlug;
        return domResult; // dom-only
      }

      // Production: bisheriges Verhalten
      if (!cfg.modelSelector) {
        console.warn('[EnergiScout] getActiveModel: kein modelSelector für service:', service);
        return null;
      }
      var el = document.querySelector(cfg.modelSelector);
      var result = el ? el.textContent.trim() : null;
      console.log('[EnergiScout] getActiveModel:', result,
        '| selector:', cfg.modelSelector,
        '| el found:', !!el,
        '| innerHTML:', el ? el.innerHTML : 'n/a',
        '| aria-label:', el ? el.getAttribute('aria-label') : 'n/a',
        '| data-testid:', el ? el.getAttribute('data-testid') : 'n/a'
      );
      if (!el) {
        var allBtns = document.querySelectorAll('button[data-testid]');
        var btnInfo = [];
        for (var i = 0; i < Math.min(allBtns.length, 10); i++) {
          btnInfo.push(allBtns[i].getAttribute('data-testid') + ': "' + allBtns[i].textContent.trim().slice(0, 40) + '"');
        }
        console.warn('[EnergiScout] getActiveModel: Selector nicht gefunden. Buttons mit data-testid:', btnInfo);
      }
      return result;
    }
    // Receive real token data from the MAIN world interceptor (interceptor.js)
    // and forward it to the background service worker.
    // Uses hudActiveCard + lastRequestId: ChatGPT blocks concurrent requests,
    // so the most recent card/id always corresponds to this interceptor response.
    var detectedModelSlug = null; // vom interceptor gesetzt, bevor Nachricht gesendet wird

    window.addEventListener('message', function(e) {
      if (e.source !== window) return;
      if (!e.data) return;
      if (e.data.type === 'ai-model-detected' || e.data.type === 'ai-real-tokens') {
        console.log('[EnergiScout] postMessage empfangen:', e.data.type, '| e.data.service:', e.data.service, '| erwartet:', service, '| match:', e.data.service === service);
      }
      if (e.data.service !== service) return;

      // Modell früh erkannt (conversation/init JSON) → Dots-Animation → sanfter Übergang
      if (e.data.type === 'ai-model-detected') {
        console.log('[EnergiScout] ai-model-detected received:', e.data.model, '| detectionToastModelEl:', !!detectionToastModelEl);
        detectedModelSlug = e.data.model;
        clearInterval(detectionToastDotsTimer);
        if (detectionToastModelEl) {
          detectionToastModelEl.style.opacity = '0';
          setTimeout(function() {
            if (detectionToastModelEl) {
              detectionToastModelEl.textContent = e.data.model;
              detectionToastModelEl.style.opacity = '1';
            }
          }, 200);
        }
        return;
      }

      if (e.data.type !== 'ai-real-tokens') return;
      console.log('[EnergiScout] ai-real-tokens received:', { promptTokens: e.data.promptTokens, responseTokens: e.data.responseTokens, model: e.data.model });
      if (!chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage({
        type: 'real-token-data',
        service: service,
        promptTokens: e.data.promptTokens || 0,
        responseTokens: e.data.responseTokens || 0,
        requestId: lastRequestId
      }, function() { void chrome.runtime.lastError; });
      // Update HUD with verified real token counts + model
      var model = e.data.model || detectedModelSlug;
      hudUpdateTokens(hudActiveCard, e.data.promptTokens || 0, e.data.responseTokens || 0, true, model);
      if (model) hudUpdateModel(hudActiveCard, model);
    });

    // ─── Token HUD ─────────────────────────────────────────────────
    var HUD_LABELS = {
      chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude',
      copilot: 'Copilot', perplexity: 'Perplexity', deepseek: 'DeepSeek',
      grok: 'Grok', meta: 'Meta AI', poe: 'Poe', 'github-copilot': 'GitHub Copilot',
      mistral: 'Mistral AI'
    };

    // HUD energy profiles (mirrors PROFILES in background.js)
    var HUD_PROFILES = {
      jegham: {chatgpt:{b:0.120,r:0.00105},copilot:{b:0.120,r:0.00105},gemini:{b:0.050,r:0.00065},
               claude:{b:0.120,r:0.00240},perplexity:{b:0.100,r:0.00100},google:{b:0.300,r:0},
               deepseek:{b:0.080,r:0.00080},grok:{b:0.120,r:0.00100},meta:{b:0.080,r:0.00070},
               poe:{b:0.120,r:0.00100},'github-copilot':{b:0.120,r:0.00105},mistral:{b:0.090,r:0.00090}},
      altman: {chatgpt:{b:0.094,r:0.00082},copilot:{b:0.094,r:0.00082},gemini:{b:0.039,r:0.00051},
               claude:{b:0.094,r:0.00188},perplexity:{b:0.078,r:0.00078},google:{b:0.235,r:0},
               deepseek:{b:0.063,r:0.00063},grok:{b:0.094,r:0.00078},meta:{b:0.063,r:0.00055},
               poe:{b:0.094,r:0.00078},'github-copilot':{b:0.094,r:0.00082},mistral:{b:0.070,r:0.00070}},
      epoch:  {chatgpt:{b:0.056,r:0.00049},copilot:{b:0.056,r:0.00049},gemini:{b:0.023,r:0.00030},
               claude:{b:0.056,r:0.00112},perplexity:{b:0.047,r:0.00047},google:{b:0.140,r:0},
               deepseek:{b:0.037,r:0.00037},grok:{b:0.056,r:0.00047},meta:{b:0.037,r:0.00033},
               poe:{b:0.056,r:0.00047},'github-copilot':{b:0.056,r:0.00049},mistral:{b:0.042,r:0.00042}}
    };
    // Container (fixed, always in DOM) + stack of cards (one per request)
    var hudHost = null;
    var hudRoot = null;
    var hudStack = null;  // flex-column inside shadow DOM
    var hudCards = [];    // active card elements
    var hudActiveCard = null; // most recent card (used by interceptor path)
    var lastRequestId = null; // tracks the most recently submitted requestId (interceptor path)

    function hudBuild() {
      if (hudHost) return;
      hudHost = document.createElement('div');
      hudHost.id = '__aem-hud__';
      hudHost.style.cssText = 'position:fixed;top:70px;right:20px;z-index:2147483647;pointer-events:none;';
      document.body.appendChild(hudHost);
      hudRoot = hudHost.attachShadow({ mode: 'open' });

      // All styles scoped inside Shadow DOM - zero page interference
      var styleEl = document.createElement('style');
      styleEl.textContent = [
        '@keyframes si{from{transform:translateX(112%);opacity:0}to{transform:translateX(0);opacity:1}}',
        '@keyframes so{from{transform:translateX(0);opacity:1}to{transform:translateX(112%);opacity:0}}',
        '@keyframes bl{0%,100%{opacity:1}50%{opacity:0.25}}',
        '@keyframes op{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.45)}55%{box-shadow:0 0 0 5px rgba(16,185,129,0)}}',
        '.stack{display:flex;flex-direction:column;gap:8px;align-items:flex-end;}',
        '.box{',
          'width:215px;',
          'background:rgba(247,243,237,0.97);',
          'border:1px solid rgba(160,130,90,0.22);',
          'border-radius:8px;',
          'padding:11px 13px 10px;',
          'box-shadow:0 8px 24px rgba(44,35,24,0.13);',
          'pointer-events:auto;',
          'animation:si .38s cubic-bezier(.34,1.56,.64,1) both;',
          'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
        '}',
        '.box.out{animation:so .28s ease both;}',
        '.box.dim{opacity:0.4;transition:opacity .6s ease;}',
        '.box.dim:hover{opacity:1;transition:opacity .2s ease;}',
        '.hdr{display:flex;align-items:center;justify-content:space-between;',
          'margin-bottom:9px;padding-bottom:8px;border-bottom:1px solid rgba(160,130,90,0.14);}',
        '.sn{font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2c2318;letter-spacing:-.1px;}',
        '.dot{width:6px;height:6px;border-radius:50%;background:#10b981;',
          'animation:op 2.2s ease-in-out infinite;flex-shrink:0;}',
        '.xi{background:none;border:none;color:#c8b99a;cursor:pointer;font-size:13px;',
          'line-height:1;padding:0;pointer-events:auto;transition:color .2s;}',
        '.xi:hover{color:#2c2318;}',
        '.row{display:flex;align-items:center;padding:4px 0;gap:7px;}',
        '.dir{font:700 9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.9px;width:40px;flex-shrink:0;}',
        '.di{color:#059669;}.do{color:#d97706;}',
        '.cnt{font:700 20px ui-monospace,"SF Mono",Consolas,monospace;flex:1;line-height:1;min-width:0;}',
        '.ci{color:#059669;}.co{color:#d97706;}',
        '.cnt.spin{color:#c8b99a;animation:bl 0.9s ease-in-out infinite;}',
        '.un{font:600 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#9c8c7a;',
          'text-transform:uppercase;letter-spacing:.5px;}',
        '.ft{margin-top:7px;padding-top:6px;border-top:1px solid rgba(160,130,90,0.12);',
          'display:flex;align-items:center;gap:5px;}',
        '.wv{font:600 10px ui-monospace,"SF Mono",Consolas,monospace;color:#5a4c3c;}',
        '.wl{font:600 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#9c8c7a;',
          'text-transform:uppercase;letter-spacing:.5px;}',
        '.rb{margin-left:auto;font:700 7px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2px 5px;',
          'border-radius:3px;background:rgba(16,185,129,0.12);color:#059669;',
          'border:1px solid rgba(16,185,129,0.25);letter-spacing:.6px;opacity:0;transition:opacity .3s;}',
        '.rb.on{opacity:1;}',
        '.hm{font:500 10px ui-monospace,"SF Mono",Consolas,monospace;color:#7a6a58;',
          'letter-spacing:.1px;margin-top:2px;min-height:12px;}',
        '.xp{margin-left:6px;font:800 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2px 6px;',
          'border-radius:999px;letter-spacing:.08em;text-transform:uppercase;}',
        '.xp.pos{background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);}',
        '.xp.neg{background:rgba(217,119,6,0.10);color:#d97706;border:1px solid rgba(217,119,6,0.22);}',
        '.xp.zero{background:rgba(160,130,90,0.10);color:#7a6a58;border:1px solid rgba(160,130,90,0.18);}'
      ].join('');

      hudStack = document.createElement('div');
      hudStack.className = 'stack';
      hudRoot.appendChild(styleEl);
      hudRoot.appendChild(hudStack);
      reflowHudStack();
    }

    function hudCountUp(el, target, ms) {
      var t0 = Date.now();
      var from = parseInt(el.textContent) || 0;
      (function step() {
        var p = Math.min((Date.now() - t0) / ms, 1);
        var e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(step);
      })();
    }

    function hudHideCard(card) {
      clearTimeout(card._dimTimer);
      clearTimeout(card._hudTimer);
      card.classList.add('out');
      setTimeout(function() {
        if (card.parentNode) card.parentNode.removeChild(card);
        var idx = hudCards.indexOf(card);
        if (idx !== -1) hudCards.splice(idx, 1);
        if (hudActiveCard === card) {
          hudActiveCard = hudCards.length > 0 ? hudCards[hudCards.length - 1] : null;
        }
        reflowHudStack();
      }, 300);
    }

    function hudShow(inTokens, model) {
      hudBuild();
      var svcName = HUD_LABELS[service] || service;
      var box = document.createElement('div');
      box.className = 'box';
      box.innerHTML =
        '<div class="hdr">' +
          '<div style="display:flex;flex-direction:column;">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
              '<div class="dot"></div>' +
              '<span class="sn">' + svcName + '</span>' +
            '</div>' +
            '<span class="hm hmod">' + (model || '') + '</span>' +
          '</div>' +
          '<button class="xi">&#x2715;</button>' +
        '</div>' +
        '<div class="row"><span class="dir di">IN &#8593;</span>' +
          '<span class="cnt ci hi">' + inTokens + '</span><span class="un">tokens</span></div>' +
        '<div class="row"><span class="dir do">OUT &#8595;</span>' +
          '<span class="cnt co spin ho">&#8226;&#8226;&#8226;</span><span class="un">tokens</span></div>' +
        '<div class="ft">' +
          '<span class="wl">energy</span>' +
          '<span class="wv hw">&mdash;</span>' +
          '<span class="xp zero hx">0 XP</span>' +
          '<span class="rb hr">REAL</span>' +
        '</div>';
      hudStack.appendChild(box);
      hudCards.push(box);
      hudActiveCard = box;
      box._inTokens = inTokens || 0;
      reflowHudStack();
      box.querySelector('.xi').addEventListener('click', function() { hudHideCard(box); });
      // After 3s: if OUT not yet received → hide card, mark as hiddenEarly.
      // hudUpdateTokens will then show a fresh result card when output arrives.
      box._outputReceived = false;
      box._hiddenEarly    = false;
      box._earlyHideTimer = setTimeout(function() {
        if (!box._outputReceived) {
          box._hiddenEarly = true;
          hudHideCard(box);
        }
      }, 3000);
    }

    function hudUpdateTokens(card, inTok, outTok, isReal, model) {
      if (!card) return;
      card._outputReceived = true;
      clearTimeout(card._earlyHideTimer);
      var effectiveInTok = inTok > 0 ? inTok : (card._inTokens || 0);
      if (inTok > 0) card._inTokens = inTok;

      // Card was hidden early (3s elapsed) → show a fresh result card instead
      if (card._hiddenEarly) {
        hudShowResult(effectiveInTok, outTok, isReal, model);
        return;
      }

      // Card still visible → update in place
      var elIn = card.querySelector('.hi');
      var elOut = card.querySelector('.ho');
      var elWh = card.querySelector('.hw');
      var elXp = card.querySelector('.hx');
      var elR = card.querySelector('.hr');
      if (elIn) elIn.textContent = effectiveInTok;
      if (elOut) { elOut.classList.remove('spin'); hudCountUp(elOut, outTok, 850); }
      var prof = HUD_PROFILES[activeHudProfile] || HUD_PROFILES.altman;
      var svcCfg = prof[service] || prof.chatgpt;
      var wh = (svcCfg.b + outTok * svcCfg.r).toFixed(2);
      var xp = calcXp(effectiveInTok + outTok);
      if (elWh) elWh.textContent = wh + ' Wh';
      if (elXp) {
        elXp.textContent = fmtXp(xp);
        elXp.className = 'xp hx ' + (xp > 0 ? 'pos' : xp < 0 ? 'neg' : 'zero');
      }
      if (isReal && elR) elR.classList.add('on');
      clearTimeout(card._hudTimer);
      card._hudTimer = setTimeout(function() { hudHideCard(card); }, 8000);
    }

    function hudShowResult(inTok, outTok, isReal, model) {
      hudBuild();
      var svcName = HUD_LABELS[service] || service;
      var prof    = HUD_PROFILES[activeHudProfile] || HUD_PROFILES.altman;
      var svcCfg  = prof[service] || prof.chatgpt;
      var wh      = (svcCfg.b + outTok * svcCfg.r).toFixed(2);
      var xp      = calcXp((inTok || 0) + outTok);
      var resolvedModel = model || detectedModelSlug;
      var box     = document.createElement('div');
      box.className = 'box';
      box.innerHTML =
        '<div class="hdr">' +
          '<div style="display:flex;flex-direction:column;">' +
            '<div style="display:flex;align-items:center;gap:7px;">' +
              '<span class="sn">' + svcName + '</span>' +
            '</div>' +
            '<span class="hm hmod">' + (resolvedModel || '') + '</span>' +
          '</div>' +
          '<button class="xi">&#x2715;</button>' +
        '</div>' +
        '<div class="row"><span class="dir di">IN &#8593;</span>' +
          '<span class="cnt ci hi">' + (inTok || 0) + '</span><span class="un">tokens</span></div>' +
        '<div class="row"><span class="dir do">OUT &#8595;</span>' +
          '<span class="cnt co ho">' + outTok + '</span><span class="un">tokens</span></div>' +
        '<div class="ft">' +
          '<span class="wl">energy</span>' +
          '<span class="wv">' + wh + ' Wh</span>' +
          '<span class="xp ' + (xp > 0 ? 'pos' : xp < 0 ? 'neg' : 'zero') + '">' + fmtXp(xp) + '</span>' +
          (isReal ? '<span class="rb on">REAL</span>' : '') +
        '</div>';
      hudStack.appendChild(box);
      hudCards.push(box);
      box._inTokens = inTok || 0;
      reflowHudStack();
      box.querySelector('.xi').addEventListener('click', function() { hudHideCard(box); });
      box._outputReceived = true;
      box._hiddenEarly    = false;
      box._hudTimer = setTimeout(function() { hudHideCard(box); }, 8000);
    }

    function hudUpdateModel(card, model) {
      if (!card || !model) return;
      var el = card.querySelector('.hmod');
      if (el) el.textContent = model;
    }

    function hudHide() {
      var cards = hudCards.slice();
      for (var i = 0; i < cards.length; i++) hudHideCard(cards[i]);
    }

    // Detection toast mit animierter Modell-Zeile
    var detectionToastModelEl = null;
    var detectionToastDotsTimer = null;
    (function showDetectionToast() {
      var svcName = HUD_LABELS[service] || service;
      var toast = document.createElement('div');
      toast.style.cssText = [
        'position:fixed;top:60px;right:12px;z-index:2147483647;',
        'background:rgba(247,243,237,0.97);',
        'border:1px solid rgba(160,130,90,0.22);',
        'border-radius:8px;padding:8px 14px;',
        'display:flex;align-items:center;gap:8px;',
        'font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
        'color:#2c2318;pointer-events:none;',
        'box-shadow:0 8px 24px rgba(44,35,24,0.13);'
      ].join('');

      // Modell-Wert-Span mit Transition für sanften Übergang
      var modelVal = document.createElement('span');
      modelVal.style.cssText = 'transition:opacity 0.35s ease;opacity:0.5;font-family:ui-monospace,"SF Mono",Consolas,monospace;';
      modelVal.textContent = '···';

      var modelRow = document.createElement('span');
      modelRow.style.cssText = 'font:500 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#059669;margin-top:2px;display:block;';
      modelRow.appendChild(document.createTextNode('Model: '));
      modelRow.appendChild(modelVal);
      detectionToastModelEl = modelVal;

      // Dots-Animation während auf Modell gewartet wird
      var dots = ['·', '··', '···'];
      var di = 0;
      detectionToastDotsTimer = setInterval(function() {
        if (detectionToastModelEl === modelVal) modelVal.textContent = dots[di++ % 3];
      }, 380);

      var textCol = document.createElement('div');
      textCol.style.cssText = 'display:flex;flex-direction:column;';
      textCol.innerHTML = '<span>' + svcName + ' detected</span>';
      textCol.appendChild(modelRow);

      toast.innerHTML = '<span style="color:#10b981;font-size:13px;">&#9889;</span>';
      toast.appendChild(textCol);
      document.body.appendChild(toast);
      toast.animate(
        [{ transform: 'translateY(-12px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'both' }
      );
      setTimeout(function() {
        clearInterval(detectionToastDotsTimer);
        var out = toast.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 700, easing: 'ease', fill: 'both' }
        );
        out.onfinish = function() { toast.remove(); detectionToastModelEl = null; };
      }, 3500);
    })();

    chrome.runtime.onMessage.addListener(function(msg) {
      if (!msg || msg.type !== 'achievement-unlocked' || !msg.event) return;
      showAchievementUnlockHud({
        id: msg.event.id,
        title: msg.event.title,
        image: chrome.runtime.getURL(msg.event.image)
      });
    });
    // ─── End HUD ───────────────────────────────────────────────────

    // Recursive shadow-DOM query – pierces all open shadow roots
    function deepQuery(selector, root) {
      root = root || document;
      var el = root.querySelector(selector);
      if (el) return el;
      var all = root.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        if (all[i].shadowRoot) {
          var found = deepQuery(selector, all[i].shadowRoot);
          if (found) return found;
        }
      }
      return null;
    }

    // Finde das Eingabefeld
    function findInput() {
      // Versuch 1: Aktives Element - auch tief in Shadow DOM verfolgen
      var active = document.activeElement;
      // Dive into nested shadow roots to find the truly focused element
      while (active && active.shadowRoot && active.shadowRoot.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      if (active) {
        if (active.tagName === "TEXTAREA") return active;
        if (active.getAttribute("contenteditable") === "true") return active;
        if (active.tagName === "INPUT" && active.type === "text") return active;
      }
      // Versuch 2: Bekannte Selektoren (inkl. Shadow DOM)
      var selectors = [
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
        ".ProseMirror",
        "[data-testid='text-input']"
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = deepQuery(selectors[i]);
        if (el) return el;
      }
      return null;
    }

    function getInputText() {
      var input = findInput();
      if (!input) return "";
      return (input.innerText || input.value || input.textContent || "").trim();
    }

    function hasTokenSaverSuffix(text) {
      return String(text || "").toLowerCase().indexOf(tokenSaverPrompt.toLowerCase()) !== -1;
    }

    function appendTokenSaverPrompt() {
      if (service !== "chatgpt" || !tokenSaverMode) return getInputText();
      var input = findInput();
      if (!input) return "";

      var currentText = (input.innerText || input.value || input.textContent || "").trim();
      if (!currentText || hasTokenSaverSuffix(currentText)) return currentText;

      var nextText = currentText + "\n\n" + tokenSaverPrompt;

      if (input.tagName === "TEXTAREA" || (input.tagName === "INPUT" && input.type === "text")) {
        input.value = nextText;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return nextText;
      }

      if (input.getAttribute("contenteditable") === "true" || input.tagName === "DIV") {
        input.focus();
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        var inserted = false;
        try {
          inserted = document.execCommand("insertText", false, "\n\n" + tokenSaverPrompt);
        } catch (_) {
          inserted = false;
        }

        if (!inserted) {
          input.textContent = nextText;
        }

        input.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: "\n\n" + tokenSaverPrompt
        }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return nextText;
      }

      return currentText;
    }

    function submitPrompt(text) {
      var now = Date.now();
      if (text === lastText && (now - lastTime) < DEBOUNCE) return;
      if (text.length < 2) return;
      lastText = text;
      lastTime = now;

      // Show HUD with estimated IN token count immediately, then capture the
      // created card so watchForResponse can target it even after hudActiveCard
      // has moved on to the next prompt's card.
      var detectedModel = getActiveModel();
      var svcLabel = HUD_LABELS[service] || service;
      if (detectedModel === svcLabel) detectedModel = null; // Service-Name ist kein Modell-Name
      hudShow(Math.ceil(text.length / 4), detectedModel || detectedModelSlug);
      var myCard = hudActiveCard;
      var myRequestId = null; // filled in via sendResponse callback below

      if (!chrome.runtime || !chrome.runtime.id) return; // extension context invalidated
      chrome.runtime.sendMessage({
        type: "prompt-submitted",
        service: service,
        promptText: text,
        responseText: "",
        mode: getActiveMode(),
        model: getActiveModel()
      }, function(resp) {
        if (chrome.runtime.lastError) return; // service worker was sleeping
        if (resp && resp.requestId) {
          myRequestId = resp.requestId;
          lastRequestId = resp.requestId; // keep global in sync for interceptor path
        }
      });

      // Pass the captured card + a getter for this prompt's requestId.
      // watchForResponse will only update myCard and report to myRequestId,
      // regardless of how many new prompts arrive before the response finishes.
      watchForResponse(myCard, function() { return myRequestId; });
    }

    // Enter-Taste abfangen
    document.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        if (!isPromptInput(e.target)) return;
        var text = appendTokenSaverPrompt() || getInputText();
        if (text) {
          // Kurz warten damit das Senden durchgeht
          setTimeout(function() { submitPrompt(text); }, 100);
        }
      }
    }, true);

    // Klick auf jeden Button beobachten der nach "Senden" aussieht
    document.addEventListener("click", function(e) {
      // Also check composed path to catch clicks inside shadow DOM (e.g. Copilot)
      var composedPath = e.composedPath ? e.composedPath() : [];
      var btn = e.target.closest("button");
      if (!btn) {
        for (var p = 0; p < composedPath.length; p++) {
          if (composedPath[p].tagName === "BUTTON") { btn = composedPath[p]; break; }
        }
      }
      if (!btn) return;

      var dominated = false;
      var aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      var testid = (btn.getAttribute("data-testid") || "").toLowerCase();
      var text = (btn.textContent || "").toLowerCase().trim();
      var svg = btn.querySelector("svg");

      var sendWords = ["send", "senden", "submit", "absenden", "nachricht"];
      for (var i = 0; i < sendWords.length; i++) {
        if (aria.indexOf(sendWords[i]) !== -1 || testid.indexOf(sendWords[i]) !== -1 || text.indexOf(sendWords[i]) !== -1) {
          dominated = true;
          break;
        }
      }

      // Buttons mit nur einem SVG-Icon und keinem Text sind oft Send-Buttons
      if (!dominated && svg && text.length < 3) {
        dominated = true;
      }

      if (dominated) {
        var inputText = appendTokenSaverPrompt() || getInputText();
        if (inputText) {
          setTimeout(function() { submitPrompt(inputText); }, 100);
        }
      }
    }, true);

    // Antwort-Beobachtung
    // myCard   – the HUD card created for this specific prompt (captured in submitPrompt)
    // getReqId – getter function returning the requestId for this prompt (set async via sendResponse)
    function watchForResponse(myCard, getReqId) {
      var collected = "";
      var timeout = null;
      // Gemini: tight selector targets only the actual response content elements,
      // avoiding broad class wildcards that match UI chrome (footers, related questions, etc.)
      var SELECTOR = (service === 'gemini')
        ? "model-response, .model-response-text, response-content, .markdown, [data-is-streaming]"
        : (service === 'copilot')
        ? "[data-testid='ai-message']"
        : "[data-message-author-role='assistant'], " +
          ".markdown, .prose, .response-content, " +
          "[class*='message'][class*='assistant'], " +
          "[class*='response'], [class*='answer'], " +
          "[data-is-streaming], " +
          "model-response, .model-response-text, " +
          "[class*='model-response'], response-content";

      // Snapshot existing elements (with content) so we don't re-report
      // previous conversation turns — each new response is a new DOM element
      var prevElements = new Set();
      var prevCandidates = document.querySelectorAll(SELECTOR);
      for (var j = 0; j < prevCandidates.length; j++) {
        if ((prevCandidates[j].innerText || '').trim().length > 10) {
          prevElements.add(prevCandidates[j]);
        }
      }

      var obs = new MutationObserver(function() {
        var candidates = document.querySelectorAll(SELECTOR);
        for (var i = candidates.length - 1; i >= 0; i--) {
          if (prevElements.has(candidates[i])) continue; // skip pre-existing elements
          var t = (candidates[i].innerText || "").trim();
          if (t.length > collected.length) {
            collected = t;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
              if (!chrome.runtime || !chrome.runtime.id) { obs.disconnect(); return; }
              chrome.runtime.sendMessage({
                type: "response-received",
                service: service,
                responseText: collected,
                requestId: getReqId() // target this prompt's request, not the latest one
              }, function() { void chrome.runtime.lastError; });
              // Update this prompt's HUD card (not hudActiveCard which may have moved on)
              hudUpdateTokens(myCard, 0, Math.ceil(collected.length / 4), false);
              obs.disconnect();
            }, 2500);
            break;
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(function() { obs.disconnect(); }, 120000);
    }

  }
})();
