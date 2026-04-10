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
    "copilot.github.com": "github-copilot"
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

  // Pruefe ob optionaler Dienst aktiviert ist
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    var optional = settings.optionalServices || {};
    var standard = settings.standardServices || {};
    var optionalList = ["deepseek", "grok", "meta", "poe", "github-copilot"];
    var toggleableStandard = ["copilot", "claude", "google"];

    if (optionalList.indexOf(service) !== -1 && !optional[service]) {
      return;
    }
    if (toggleableStandard.indexOf(service) !== -1 && standard[service] === false) {
      return;
    }

    initTracking();
  });

  function initTracking() {
    var lastText = "";
    var lastTime = 0;
    var DEBOUNCE = 3000;

    // Gesamte Service-Konfiguration: promptInput + optionale Modi + optionaler Modell-Selektor
    var SERVICE_CONFIG = {
      chatgpt:    {
        promptInput:   '#prompt-textarea',
        modelSelector: '[data-testid="model-switcher-dropdown-button"]',
        modes: {
          think:        'button.__composer-pill[aria-label*="Think"]',
          deepResearch: 'button.__composer-pill[aria-label*="Deep Research"]'
        }
      },
      claude:     {
        promptInput:   '[data-testid="chat-input"]',
        modelSelector: '[data-testid="model-selector-dropdown"] .whitespace-nowrap',
        modes: {
          think: '[data-testid="model-selector-dropdown"] span'
        }
      },
      gemini:     { promptInput: '.ql-editor[contenteditable="true"]' },
      perplexity: { promptInput: '#ask-input' },
      copilot:    { promptInput: '[data-testid="composer-input"]' }
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
      if (!cfg || !cfg.modelSelector) return null;
      var el = document.querySelector(cfg.modelSelector);
      return el ? el.textContent.trim() : null;
    }
    // Receive real token data from the MAIN world interceptor (interceptor.js)
    // and forward it to the background service worker.
    // Uses hudActiveCard + lastRequestId: ChatGPT blocks concurrent requests,
    // so the most recent card/id always corresponds to this interceptor response.
    var detectedModelSlug = null; // vom interceptor gesetzt, bevor Nachricht gesendet wird

    window.addEventListener('message', function(e) {
      if (e.source !== window) return;
      if (!e.data) return;
      if (e.data.service !== service) return;

      // Modell früh erkannt (conversation/init JSON) → Dots-Animation → sanfter Übergang
      if (e.data.type === 'ai-model-detected') {
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
      if (!chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage({
        type: 'real-token-data',
        service: service,
        promptTokens: e.data.promptTokens || 0,
        responseTokens: e.data.responseTokens || 0,
        requestId: lastRequestId
      }, function() { void chrome.runtime.lastError; });
      // Update HUD with verified real token counts + model
      hudUpdateTokens(hudActiveCard, e.data.promptTokens || 0, e.data.responseTokens || 0, true);
      var model = e.data.model || detectedModelSlug;
      if (model) hudUpdateModel(hudActiveCard, model);
    });

    // ─── Token HUD ─────────────────────────────────────────────────
    var HUD_LABELS = {
      chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude',
      copilot: 'Copilot', perplexity: 'Perplexity', deepseek: 'DeepSeek',
      grok: 'Grok', meta: 'Meta AI', poe: 'Poe', 'github-copilot': 'GitHub Copilot'
    };

    // HUD energy profiles (mirrors PROFILES in background.js)
    var HUD_PROFILES = {
      jegham: {chatgpt:{b:0.120,r:0.00105},copilot:{b:0.120,r:0.00105},gemini:{b:0.050,r:0.00065},
               claude:{b:0.120,r:0.00240},perplexity:{b:0.100,r:0.00100},google:{b:0.300,r:0},
               deepseek:{b:0.080,r:0.00080},grok:{b:0.120,r:0.00100},meta:{b:0.080,r:0.00070},
               poe:{b:0.120,r:0.00100},'github-copilot':{b:0.120,r:0.00105}},
      altman: {chatgpt:{b:0.094,r:0.00082},copilot:{b:0.094,r:0.00082},gemini:{b:0.039,r:0.00051},
               claude:{b:0.094,r:0.00188},perplexity:{b:0.078,r:0.00078},google:{b:0.235,r:0},
               deepseek:{b:0.063,r:0.00063},grok:{b:0.094,r:0.00078},meta:{b:0.063,r:0.00055},
               poe:{b:0.094,r:0.00078},'github-copilot':{b:0.094,r:0.00082}},
      epoch:  {chatgpt:{b:0.056,r:0.00049},copilot:{b:0.056,r:0.00049},gemini:{b:0.023,r:0.00030},
               claude:{b:0.056,r:0.00112},perplexity:{b:0.047,r:0.00047},google:{b:0.140,r:0},
               deepseek:{b:0.037,r:0.00037},grok:{b:0.056,r:0.00047},meta:{b:0.037,r:0.00033},
               poe:{b:0.056,r:0.00047},'github-copilot':{b:0.056,r:0.00049}}
    };
    var activeHudProfile = 'altman'; // default; overwritten by storage read below
    chrome.storage.local.get('settings', function(d) {
      if (d.settings && d.settings.energyProfile) activeHudProfile = d.settings.energyProfile;
    });

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
        '.stack{display:flex;flex-direction:column;gap:8px;align-items:flex-end;}',
        '.box{',
          'width:215px;',
          'background:rgba(6,13,26,0.96);',
          'border:1px solid rgba(65,197,255,0.18);',
          'border-radius:10px;',
          'padding:11px 13px 10px;',
          'box-shadow:0 16px 48px rgba(0,0,0,0.55),0 0 0 0.5px rgba(65,197,255,0.06) inset;',
          'pointer-events:auto;',
          'animation:si .38s cubic-bezier(.34,1.56,.64,1) both;',
          'font-family:"Segoe UI",Arial,sans-serif;',
        '}',
        '.box.out{animation:so .28s ease both;}',
        '.box.dim{opacity:0.35;transition:opacity .6s ease;}',
        '.box.dim:hover{opacity:1;transition:opacity .2s ease;}',
        '.hdr{display:flex;align-items:center;justify-content:space-between;',
          'margin-bottom:9px;padding-bottom:8px;border-bottom:1px solid rgba(65,197,255,0.08);}',
        '.sn{font:700 12px "Segoe UI",Arial,sans-serif;color:#ddeeff;letter-spacing:.3px;}',
        '.dot{width:6px;height:6px;border-radius:50%;background:#41c5ff;',
          'box-shadow:0 0 6px rgba(65,197,255,0.7);animation:bl 2s ease-in-out infinite;flex-shrink:0;}',
        '.xi{background:none;border:none;color:#1e3050;cursor:pointer;font-size:13px;',
          'line-height:1;padding:0;pointer-events:auto;transition:color .2s;}',
        '.xi:hover{color:#41c5ff;}',
        '.row{display:flex;align-items:center;padding:4px 0;gap:7px;}',
        '.dir{font:700 9px "Segoe UI",Arial,sans-serif;letter-spacing:.9px;width:40px;flex-shrink:0;}',
        '.di{color:#41c5ff;}.do{color:#f59e0b;}',
        '.cnt{font:700 20px "Courier New",Consolas,monospace;flex:1;line-height:1;min-width:0;}',
        '.ci{color:#41c5ff;}.co{color:#f59e0b;}',
        '.cnt.spin{color:#1e3a58;animation:bl 0.9s ease-in-out infinite;}',
        '.un{font:600 8px "Segoe UI",Arial,sans-serif;color:#1a3050;',
          'text-transform:uppercase;letter-spacing:.5px;}',
        '.ft{margin-top:7px;padding-top:6px;border-top:1px solid rgba(65,197,255,0.06);',
          'display:flex;align-items:center;gap:5px;}',
        '.wv{font:600 10px "Courier New",Consolas,monospace;color:#2a4a6a;}',
        '.wl{font:600 8px "Segoe UI",Arial,sans-serif;color:#1a3050;',
          'text-transform:uppercase;letter-spacing:.5px;}',
        '.rb{margin-left:auto;font:700 7px "Segoe UI",Arial,sans-serif;padding:2px 5px;',
          'border-radius:3px;background:rgba(65,197,255,0.1);color:#41c5ff;',
          'letter-spacing:.6px;opacity:0;transition:opacity .3s;}',
        '.rb.on{opacity:1;}',
        '.hm{font:500 10px "Courier New",Consolas,monospace;color:#2a5a7a;',
          'letter-spacing:.2px;margin-top:2px;min-height:12px;}'
      ].join('');

      hudStack = document.createElement('div');
      hudStack.className = 'stack';
      hudRoot.appendChild(styleEl);
      hudRoot.appendChild(hudStack);
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
          '<span class="rb hr">REAL</span>' +
        '</div>';
      hudStack.appendChild(box);
      hudCards.push(box);
      hudActiveCard = box;
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

    function hudUpdateTokens(card, inTok, outTok, isReal) {
      if (!card) return;
      card._outputReceived = true;
      clearTimeout(card._earlyHideTimer);

      // Card was hidden early (3s elapsed) → show a fresh result card instead
      if (card._hiddenEarly) {
        hudShowResult(inTok, outTok, isReal);
        return;
      }

      // Card still visible → update in place
      var elIn = card.querySelector('.hi');
      var elOut = card.querySelector('.ho');
      var elWh = card.querySelector('.hw');
      var elR = card.querySelector('.hr');
      if (elIn && inTok > 0) elIn.textContent = inTok;
      if (elOut) { elOut.classList.remove('spin'); hudCountUp(elOut, outTok, 850); }
      var prof = HUD_PROFILES[activeHudProfile] || HUD_PROFILES.altman;
      var svcCfg = prof[service] || prof.chatgpt;
      var wh = (svcCfg.b + outTok * svcCfg.r).toFixed(2);
      if (elWh) elWh.textContent = wh + ' Wh';
      if (isReal && elR) elR.classList.add('on');
      clearTimeout(card._hudTimer);
      card._hudTimer = setTimeout(function() { hudHideCard(card); }, 8000);
    }

    function hudShowResult(inTok, outTok, isReal) {
      hudBuild();
      var svcName = HUD_LABELS[service] || service;
      var prof    = HUD_PROFILES[activeHudProfile] || HUD_PROFILES.altman;
      var svcCfg  = prof[service] || prof.chatgpt;
      var wh      = (svcCfg.b + outTok * svcCfg.r).toFixed(2);
      var box     = document.createElement('div');
      box.className = 'box';
      box.innerHTML =
        '<div class="hdr">' +
          '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span class="sn">' + svcName + '</span>' +
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
          (isReal ? '<span class="rb on">REAL</span>' : '') +
        '</div>';
      hudStack.appendChild(box);
      hudCards.push(box);
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
        'background:rgba(6,13,26,0.96);',
        'border:1px solid rgba(65,197,255,0.25);',
        'border-radius:8px;padding:8px 14px;',
        'display:flex;align-items:center;gap:8px;',
        'font:600 12px "Segoe UI",Arial,sans-serif;',
        'color:#ddeeff;pointer-events:none;',
        'box-shadow:0 8px 28px rgba(0,0,0,0.55);'
      ].join('');

      // Modell-Wert-Span mit Transition für sanften Übergang
      var modelVal = document.createElement('span');
      modelVal.style.cssText = 'transition:opacity 0.35s ease;opacity:0.45;';
      modelVal.textContent = '···';

      var modelRow = document.createElement('span');
      modelRow.style.cssText = 'font:500 10px "Segoe UI",Arial,sans-serif;color:#41c5ff;margin-top:2px;display:block;';
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

      toast.innerHTML = '<span style="color:#41c5ff;font-size:13px;">&#9889;</span>';
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
        var text = getInputText();
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
        var inputText = getInputText();
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


