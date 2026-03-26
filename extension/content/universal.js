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
    var suggestionBanner = null;

    // Receive real token data from the MAIN world interceptor (interceptor.js)
    // and forward it to the background service worker.
    window.addEventListener('message', function(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== 'ai-real-tokens') return;
      if (e.data.service !== service) return;
      chrome.runtime.sendMessage({
        type: 'real-token-data',
        service: service,
        promptTokens: e.data.promptTokens || 0,
        responseTokens: e.data.responseTokens || 0
      });
      // Update HUD with verified real token counts
      hudUpdateTokens(e.data.promptTokens || 0, e.data.responseTokens || 0, true);
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

    var hudHost = null;
    var hudRoot = null;
    var hudTimer = null;

    function hudQ(id) { return hudRoot ? hudRoot.querySelector('#' + id) : null; }

    function hudBuild() {
      if (hudHost) return;
      hudHost = document.createElement('div');
      hudHost.id = '__aem-hud__';
      hudHost.style.cssText = 'position:fixed;top:70px;right:20px;z-index:2147483647;display:none;pointer-events:none;';
      document.body.appendChild(hudHost);
      hudRoot = hudHost.attachShadow({ mode: 'open' });

      var svcName = HUD_LABELS[service] || service;

      // All styles scoped inside Shadow DOM - zero page interference
      var styleEl = document.createElement('style');
      styleEl.textContent = [
        '@keyframes si{from{transform:translateX(112%);opacity:0}to{transform:translateX(0);opacity:1}}',
        '@keyframes so{from{transform:translateX(0);opacity:1}to{transform:translateX(112%);opacity:0}}',
        '@keyframes bl{0%,100%{opacity:1}50%{opacity:0.25}}',
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
        '.rb.on{opacity:1;}'
      ].join('');

      var box = document.createElement('div');
      box.className = 'box';
      box.innerHTML =
        '<div class="hdr">' +
          '<div style="display:flex;align-items:center;gap:7px;">' +
            '<div class="dot"></div>' +
            '<span class="sn">' + svcName + '</span>' +
          '</div>' +
          '<button class="xi" id="xi">&#x2715;</button>' +
        '</div>' +
        '<div class="row"><span class="dir di">IN &#8593;</span>' +
          '<span class="cnt ci" id="hi">0</span><span class="un">tokens</span></div>' +
        '<div class="row"><span class="dir do">OUT &#8595;</span>' +
          '<span class="cnt co spin" id="ho">&#8226;&#8226;&#8226;</span><span class="un">tokens</span></div>' +
        '<div class="ft">' +
          '<span class="wl">energy</span>' +
          '<span class="wv" id="hw">&mdash;</span>' +
          '<span class="rb" id="hr">REAL</span>' +
        '</div>';

      hudRoot.appendChild(styleEl);
      hudRoot.appendChild(box);
      hudRoot.querySelector('#xi').addEventListener('click', hudHide);
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

    function hudShow(inTokens) {
      hudBuild();
      clearTimeout(hudTimer);
      var box = hudRoot.querySelector('.box');
      var elIn = hudQ('hi'), elOut = hudQ('ho'), elWh = hudQ('hw'), elR = hudQ('hr');
      if (box) box.classList.remove('out');
      if (elIn) elIn.textContent = inTokens;
      if (elOut) { elOut.textContent = '\u2022\u2022\u2022'; elOut.classList.add('spin'); }
      if (elWh) elWh.innerHTML = '&mdash;';
      if (elR) elR.classList.remove('on');
      hudHost.style.display = 'block';
      hudSchedule();
    }

    function hudUpdateTokens(inTok, outTok, isReal) {
      if (!hudHost || hudHost.style.display === 'none') return;
      clearTimeout(hudTimer);
      var elIn = hudQ('hi'), elOut = hudQ('ho'), elWh = hudQ('hw'), elR = hudQ('hr');
      if (elIn && inTok > 0) elIn.textContent = inTok;
      if (elOut) { elOut.classList.remove('spin'); hudCountUp(elOut, outTok, 850); }
      // Wh preview mirrors calcWh in background.js: base + outputTokens * rate
      var prof = HUD_PROFILES[activeHudProfile] || HUD_PROFILES.altman;
      var svcCfg = prof[service] || prof.chatgpt;
      var wh = (svcCfg.b + outTok * svcCfg.r).toFixed(2);
      if (elWh) elWh.textContent = wh + ' Wh';
      if (isReal && elR) elR.classList.add('on');
      hudSchedule();
    }

    function hudHide() {
      if (!hudHost) return;
      var box = hudRoot ? hudRoot.querySelector('.box') : null;
      if (box) {
        box.classList.add('out');
        setTimeout(function() { if (hudHost) hudHost.style.display = 'none'; }, 300);
      } else {
        hudHost.style.display = 'none';
      }
    }

    function hudSchedule() {
      clearTimeout(hudTimer);
      hudTimer = setTimeout(hudHide, 8000);
    }

    // Brief detection toast when AI site is first detected
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
      toast.innerHTML =
        '<span style="color:#41c5ff;font-size:13px;">&#9889;</span>' +
        '<span>' + svcName + ' detected</span>';
      document.body.appendChild(toast);
      // Slide down from extension icon area (top-right)
      toast.animate(
        [{ transform: 'translateY(-12px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'both' }
      );
      // Hold longer, then fade out (ausblassen)
      setTimeout(function() {
        var out = toast.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 700, easing: 'ease', fill: 'both' }
        );
        out.onfinish = function() { toast.remove(); };
      }, 3500);
    })();
    // ─── End HUD ───────────────────────────────────────────────────

    // Finde das Eingabefeld
    function findInput() {
      // Versuch 1: Aktives Element wenn es editierbar ist
      var active = document.activeElement;
      if (active) {
        if (active.tagName === "TEXTAREA") return active;
        if (active.getAttribute("contenteditable") === "true") return active;
        if (active.tagName === "INPUT" && active.type === "text") return active;
      }
      // Versuch 2: Bekannte Selektoren
      var selectors = [
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
        ".ProseMirror",
        "[data-testid='text-input']"
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
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

      // Show HUD with estimated IN token count immediately
      hudShow(Math.ceil(text.length / 4));

      chrome.runtime.sendMessage({
        type: "prompt-submitted",
        service: service,
        promptText: text,
        responseText: ""
      }, function(resp) {
        if (resp && resp.suggestion) {
          showSuggestion(resp.suggestion);
        }
      });

      // Antwort beobachten
      watchForResponse();
    }

    // Enter-Taste abfangen
    document.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        var text = getInputText();
        if (text) {
          // Kurz warten damit das Senden durchgeht
          setTimeout(function() { submitPrompt(text); }, 100);
        }
      }
    }, true);

    // Klick auf jeden Button beobachten der nach "Senden" aussieht
    document.addEventListener("click", function(e) {
      var btn = e.target.closest("button");
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
    function watchForResponse() {
      var collected = "";
      var timeout = null;
      var obs = new MutationObserver(function() {
        // Suche nach dem laengsten Textblock der sich veraendert
        var candidates = document.querySelectorAll(
          "[data-message-author-role='assistant'], " +
          ".markdown, .prose, .response-content, " +
          "[class*='message'][class*='assistant'], " +
          "[class*='response'], [class*='answer'], " +
          "[data-is-streaming]"
        );
        for (var i = candidates.length - 1; i >= 0; i--) {
          var t = (candidates[i].innerText || "").trim();
          if (t.length > collected.length) {
            collected = t;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
              chrome.runtime.sendMessage({
                type: "response-received",
                service: service,
                responseText: collected
              });
              // Update HUD with DOM-based estimate (fallback for non-intercepted services)
              hudUpdateTokens(0, Math.ceil(collected.length / 4), false);
              obs.disconnect();
            }, 2500);
            break;
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(function() { obs.disconnect(); }, 60000);
    }

    // Alternativ-Vorschlag Banner
    function showSuggestion(text) {
      if (suggestionBanner) suggestionBanner.remove();
      suggestionBanner = document.createElement("div");
      suggestionBanner.style.cssText =
        "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);" +
        "background:#003770;color:#fff;padding:10px 20px;border-radius:6px;" +
        "font:13px Arial,sans-serif;z-index:99999;max-width:500px;" +
        "box-shadow:0 2px 12px rgba(0,0,0,0.3);cursor:pointer;";
      suggestionBanner.textContent = text;
      suggestionBanner.addEventListener("click", function() { suggestionBanner.remove(); });
      document.body.appendChild(suggestionBanner);
      setTimeout(function() { if (suggestionBanner) suggestionBanner.remove(); }, 8000);
    }
  }
})();
