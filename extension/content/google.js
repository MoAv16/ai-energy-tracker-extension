// Content Script: Google Search - normal search and Google AI Mode (udm=50)
(function() {
  function calcAiXp(totalTokens) {
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

  // ── No-AI Search Modifier ─────────────────────────────────────────────────
  // Hängt " -ai" an jede Google-Suchanfrage an, wenn der Toggle aktiv ist.
  var _noAI = false;

  // Einstellung laden (fuer Form-Submit-Fallback)
  chrome.storage.local.get('settings', function(cfg) {
    _noAI = !!(cfg.settings && cfg.settings.googleNoAI);
  });

  // Live-update: devMode flag always tracked; full update is DEV only
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local' || !changes.settings) return;
    var s = changes.settings.newValue || {};
    // @flag liveSettings
    if (!(s.featureFlags || {}).liveSettings) return;
    _noAI = !!s.googleNoAI;
    if (s.energyProfile) activeProfile = s.energyProfile;
  });

  // Suchbox auf der Seite: Form-Submit abfangen (Homepage + Ergebnisseite)
  document.addEventListener('submit', function(e) {
    if (!_noAI) return;
    var form = e.target;
    if (!form || typeof form.action !== 'string') return;
    if (form.action.indexOf('/search') === -1) return;
    var inp = form.querySelector('input[name="q"]') || form.querySelector('textarea[name="q"]');
    if (inp && inp.value && inp.value.indexOf('-ai') === -1) {
      inp.value = inp.value.trim() + ' -ai';
    }
  }, true);

  // ── Tracking-Logik (unverändert) ──────────────────────────────────────────
  var params   = new URLSearchParams(window.location.search);
  var query    = params.get('q');
  if (!query || window.location.pathname !== '/search') return;

  var isAiMode = params.get('udm') === '50';

  chrome.storage.local.get('settings', function(data) {
    var settings = data.settings || {};
    var optional = settings.optionalServices || {};
    var standard = settings.standardServices || {};
    var googleEnabled = optional.hasOwnProperty('google') ? !!optional.google : standard.google !== false;
    if (!googleEnabled) return;

    if (isAiMode) {
      runAiMode(query);
    } else {
      if (!chrome.runtime || !chrome.runtime.id) return; // extension context invalidated
      chrome.runtime.sendMessage({
        type: 'prompt-submitted',
        service: 'google',
        promptText: query
      }, function() { void chrome.runtime.lastError; });
      setTimeout(function() { showSearchHud(); }, 250);
    }
  });

  // ── Energy profile (mirrors PROFILES in background.js for google-ai-mode) ─
  var ENERGY = {
    jegham: { b: 0.120, r: 0.00065 },
    altman: { b: 0.094, r: 0.00051 },
    epoch:  { b: 0.056, r: 0.00030 }
  };
  var activeProfile = 'jegham';
  chrome.storage.local.get('settings', function(d) {
    if (d.settings && d.settings.energyProfile) activeProfile = d.settings.energyProfile;
  });

  function calcWh(responseTokens) {
    var p = ENERGY[activeProfile] || ENERGY.jegham;
    return p.b + (responseTokens || 0) * p.r;
  }

  // ── AI Mode: main flow ────────────────────────────────────────────────────
  function runAiMode(query) {
    showDetectionToast();
    if (!chrome.runtime || !chrome.runtime.id) return; // extension context invalidated
    chrome.runtime.sendMessage({
      type: 'prompt-submitted',
      service: 'google-ai-mode',
      promptText: query,
      responseText: ''
    }, function() { void chrome.runtime.lastError; });
    waitForAIResponse();
    watchForFollowUps();
  }

  // ── Follow-up input detection (SPA: no page reload on follow-up queries) ──
  function watchForFollowUps() {
    var lastText = '';
    var lastTime = 0;
    var DEBOUNCE = 3000;

    // Read text from a given input element (textarea, input, or contenteditable)
    function readInputText(el) {
      if (!el) return '';
      if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) {
        return (el.value || '').trim();
      }
      if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
        return (el.innerText || el.textContent || '').trim();
      }
      return '';
    }

    function onFollowUp(text) {
      var now = Date.now();
      if (text === lastText && (now - lastTime) < DEBOUNCE) return;
      if (text.length < 2) return;
      lastText = text;
      lastTime = now;
      if (!chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage({
        type: 'prompt-submitted',
        service: 'google-ai-mode',
        promptText: text,
        responseText: ''
      }, function() { void chrome.runtime.lastError; });
      // Slight delay so DOM clears old response before we start observing
      setTimeout(function() { waitForAIResponse(true); }, 400);
    }

    // On Enter key: read activeElement directly — the user is typing there
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var text = readInputText(document.activeElement);
      if (text) setTimeout(function() { onFollowUp(text); }, 100);
    }, true);

    // On send button click: look in the button's form first, then activeElement
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (aria.indexOf('send') === -1 && aria.indexOf('submit') === -1 &&
          (btn.textContent.trim() || !btn.querySelector('svg'))) return;
      var form = btn.closest('form');
      var inputEl = form
        ? (form.querySelector('textarea') || form.querySelector('[contenteditable="true"]') || form.querySelector('[role="textbox"]'))
        : readInputText(document.activeElement) ? document.activeElement : null;
      var text = readInputText(inputEl);
      if (text) setTimeout(function() { onFollowUp(text); }, 100);
    }, true);
  }

  // ── Detection Toast (same pattern as universal.js) ────────────────────────
  function showDetectionToast() {
    var toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;top:60px;right:12px;z-index:2147483647;' +
      'background:rgba(6,13,26,0.96);border:1px solid rgba(65,197,255,0.25);' +
      'border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:8px;' +
      'font:600 12px "Segoe UI",Arial,sans-serif;color:#ddeeff;pointer-events:none;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.55);';
    toast.innerHTML =
      '<span style="color:#41c5ff;font-size:13px;">&#9889;</span>' +
      '<span>Google AI Mode detected</span>';
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
      out.onfinish = function() { if (toast.parentNode) toast.remove(); };
    }, 3500);
  }

  var searchHudHost = null;
  var searchHudRoot = null;
  var searchHudTimer = null;

  function buildSearchHud() {
    if (searchHudHost) return;
    searchHudHost = document.createElement('div');
    searchHudHost.id = '__aem-google-search-hud__';
    searchHudHost.style.cssText =
      'position:fixed;top:70px;right:20px;z-index:2147483647;display:none;pointer-events:none;';
    document.body.appendChild(searchHudHost);
    searchHudRoot = searchHudHost.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes si{from{transform:translateX(112%);opacity:0}to{transform:translateX(0);opacity:1}}',
      '@keyframes so{from{transform:translateX(0);opacity:1}to{transform:translateX(112%);opacity:0}}',
      '.box{width:215px;background:rgba(247,243,237,0.97);border:1px solid rgba(16,185,129,0.22);',
        'border-radius:10px;padding:11px 13px 10px;pointer-events:auto;',
        'box-shadow:0 8px 24px rgba(44,35,24,0.13);',
        'animation:si .38s cubic-bezier(.34,1.56,.64,1) both;',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.box.out{animation:so .28s ease both;}',
      '.hdr{display:flex;align-items:center;justify-content:space-between;',
        'margin-bottom:9px;padding-bottom:8px;border-bottom:1px solid rgba(160,130,90,0.14);}',
      '.sn{font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2c2318;letter-spacing:-.1px;}',
      '.dot{width:6px;height:6px;border-radius:50%;background:#10b981;flex-shrink:0;}',
      '.xi{background:none;border:none;color:#c8b99a;cursor:pointer;font-size:13px;',
        'line-height:1;padding:0;pointer-events:auto;transition:color .2s;}',
      '.xi:hover{color:#2c2318;}',
      '.row{display:flex;align-items:center;padding:4px 0;gap:7px;}',
      '.dir{font:700 9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.9px;width:42px;flex-shrink:0;color:#059669;}',
      '.cnt{font:700 20px ui-monospace,"SF Mono",Consolas,monospace;flex:1;line-height:1;min-width:0;color:#059669;}',
      '.un{font:600 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#9c8c7a;',
        'text-transform:uppercase;letter-spacing:.5px;}',
      '.ft{margin-top:7px;padding-top:6px;border-top:1px solid rgba(160,130,90,0.12);',
        'display:flex;align-items:center;gap:5px;}',
      '.wv{font:600 10px ui-monospace,"SF Mono",Consolas,monospace;color:#5a4c3c;}',
      '.wl{font:600 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#9c8c7a;',
        'text-transform:uppercase;letter-spacing:.5px;}',
      '.xp{margin-left:auto;font:800 8px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2px 6px;',
        'border-radius:999px;letter-spacing:.08em;text-transform:uppercase;',
        'background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);}'
    ].join('');

    var box = document.createElement('div');
    box.className = 'box';
    box.innerHTML =
      '<div class="hdr">' +
        '<div style="display:flex;align-items:center;gap:7px;">' +
          '<div class="dot"></div>' +
          '<span class="sn">Google Search</span>' +
        '</div>' +
        '<button class="xi" id="searchXi">&#x2715;</button>' +
      '</div>' +
      '<div class="row">' +
        '<span class="dir">XP</span>' +
        '<span class="cnt">+15</span>' +
        '<span class="un">reward</span>' +
      '</div>' +
      '<div class="ft">' +
        '<span class="wl">reason</span>' +
        '<span class="wv">Google statt KI</span>' +
        '<span class="xp">+15 XP</span>' +
      '</div>';

    searchHudRoot.appendChild(style);
    searchHudRoot.appendChild(box);
    searchHudRoot.querySelector('#searchXi').addEventListener('click', hideSearchHud);
    reflowHudStack();
  }

  function showSearchHud() {
    buildSearchHud();
    clearTimeout(searchHudTimer);
    var box = searchHudRoot.querySelector('.box');
    if (box) box.classList.remove('out');
    searchHudHost.style.display = 'block';
    reflowHudStack();
    searchHudTimer = setTimeout(hideSearchHud, 5000);
  }

  function hideSearchHud() {
    if (!searchHudHost) return;
    var box = searchHudRoot ? searchHudRoot.querySelector('.box') : null;
    if (box) {
      box.classList.add('out');
      setTimeout(function() {
        if (searchHudHost) searchHudHost.style.display = 'none';
        reflowHudStack();
      }, 300);
    } else {
      searchHudHost.style.display = 'none';
      reflowHudStack();
    }
  }

  // ── HUD (Shadow DOM, appears once AI response is collected) ───────────────
  var hudHost = null;
  var hudRoot = null;
  var hudTimer = null;

  function buildHud() {
    if (hudHost) return;
    hudHost = document.createElement('div');
    hudHost.id = '__aem-google-ai-hud__';
    hudHost.style.cssText =
      'position:fixed;top:70px;right:20px;z-index:2147483647;display:none;pointer-events:none;';
    document.body.appendChild(hudHost);
    hudRoot = hudHost.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes si{from{transform:translateX(112%);opacity:0}to{transform:translateX(0);opacity:1}}',
      '@keyframes so{from{transform:translateX(0);opacity:1}to{transform:translateX(112%);opacity:0}}',
      '@keyframes bl{0%,100%{opacity:1}50%{opacity:0.25}}',
      '.box{width:215px;background:rgba(6,13,26,0.96);border:1px solid rgba(65,197,255,0.18);',
        'border-radius:10px;padding:11px 13px 10px;pointer-events:auto;',
        'box-shadow:0 16px 48px rgba(0,0,0,0.55),0 0 0 0.5px rgba(65,197,255,0.06) inset;',
        'animation:si .38s cubic-bezier(.34,1.56,.64,1) both;',
        'font-family:"Segoe UI",Arial,sans-serif;}',
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
      '.dir{font:700 9px "Segoe UI",Arial,sans-serif;letter-spacing:.9px;width:40px;flex-shrink:0;color:#f59e0b;}',
      '.cnt{font:700 20px "Courier New",Consolas,monospace;flex:1;line-height:1;min-width:0;color:#f59e0b;}',
      '.un{font:600 8px "Segoe UI",Arial,sans-serif;color:#1a3050;',
        'text-transform:uppercase;letter-spacing:.5px;}',
      '.ft{margin-top:7px;padding-top:6px;border-top:1px solid rgba(65,197,255,0.06);',
        'display:flex;align-items:center;gap:5px;}',
      '.wv{font:600 10px "Courier New",Consolas,monospace;color:#41c5ff;}',
      '.wl{font:600 8px "Segoe UI",Arial,sans-serif;color:#1a3050;',
        'text-transform:uppercase;letter-spacing:.5px;}',
      '.xp{margin-left:6px;font:800 8px "Segoe UI",Arial,sans-serif;padding:2px 6px;border-radius:999px;',
        'letter-spacing:.08em;text-transform:uppercase;}',
      '.xp.pos{background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);}',
      '.xp.neg{background:rgba(217,119,6,0.10);color:#f59e0b;border:1px solid rgba(217,119,6,0.22);}',
      '.xp.zero{background:rgba(160,130,90,0.10);color:#9c8c7a;border:1px solid rgba(160,130,90,0.18);}'
    ].join('');

    var box = document.createElement('div');
    box.className = 'box';
    box.innerHTML =
      '<div class="hdr">' +
        '<div style="display:flex;align-items:center;gap:7px;">' +
          '<div class="dot"></div>' +
          '<span class="sn">Google AI Mode</span>' +
        '</div>' +
        '<button class="xi" id="xi">&#x2715;</button>' +
      '</div>' +
      '<div class="row">' +
        '<span class="dir">OUT &#8595;</span>' +
        '<span class="cnt" id="ho">0</span>' +
        '<span class="un">tokens</span>' +
      '</div>' +
      '<div class="ft">' +
        '<span class="wl">energy</span>' +
        '<span class="wv" id="hw">&mdash;</span>' +
        '<span class="xp zero" id="hx">0 XP</span>' +
      '</div>';

    hudRoot.appendChild(style);
    hudRoot.appendChild(box);
    hudRoot.querySelector('#xi').addEventListener('click', hudHide);
    reflowHudStack();
  }

  function hudShow(responseTokens) {
    buildHud();
    clearTimeout(hudTimer);
    var box  = hudRoot.querySelector('.box');
    var elOut = hudRoot.querySelector('#ho');
    var elWh  = hudRoot.querySelector('#hw');
    var elXp  = hudRoot.querySelector('#hx');
    var xp    = calcAiXp(responseTokens);
    if (box) box.classList.remove('out');
    if (elOut) elOut.textContent = responseTokens;
    if (elWh)  elWh.textContent  = calcWh(responseTokens).toFixed(2) + ' Wh';
    if (elXp) {
      elXp.textContent = fmtXp(xp);
      elXp.className = 'xp ' + (xp > 0 ? 'pos' : xp < 0 ? 'neg' : 'zero');
    }
    hudHost.style.display = 'block';
    reflowHudStack();
    hudTimer = setTimeout(hudHide, 8000);
  }

  function hudHide() {
    if (!hudHost) return;
    var box = hudRoot ? hudRoot.querySelector('.box') : null;
    if (box) {
      box.classList.add('out');
      setTimeout(function() {
        if (hudHost) hudHost.style.display = 'none';
        reflowHudStack();
      }, 300);
    } else {
      hudHost.style.display = 'none';
      reflowHudStack();
    }
  }

  // ── MutationObserver: wait for AI response in DOM ─────────────────────────
  // Selectors in priority order (most specific first)
  var AI_SELECTORS = [
    'div[data-subtree="aimc"]',
    'div[data-attrid="AIOverview"]',
    'div[jsname="N760b"]'
  ];

  function reportResponse(text) {
    if (!chrome.runtime || !chrome.runtime.id) return;
    var tokens = Math.ceil(text.length / 4);
    chrome.runtime.sendMessage({
      type: 'response-received',
      service: 'google-ai-mode',
      responseText: text
    }, function() { void chrome.runtime.lastError; });
    hudShow(tokens);
  }

  function waitForAIResponse(isFollowUp) {
    // Snapshot current response text so follow-up calls don't re-report the old answer
    var snapshotText = '';
    for (var s = 0; s < AI_SELECTORS.length; s++) {
      var snapEl = document.querySelector(AI_SELECTORS[s]);
      if (snapEl) { snapshotText = (snapEl.innerText || '').trim(); break; }
    }

    // Response already in DOM (initial page load only — skip for follow-ups,
    // because the previous answer is still visible and would be re-reported)
    if (!isFollowUp && snapshotText.length > 50) {
      setTimeout(function() { reportResponse(snapshotText); }, 500);
      return;
    }

    var collected = '';
    var debounce  = null;

    var obs = new MutationObserver(function(mutations) {
      var text = '';

      // 1. Try specific known selectors first
      for (var i = 0; i < AI_SELECTORS.length; i++) {
        var el = document.querySelector(AI_SELECTORS[i]);
        if (!el) continue;
        text = (el.innerText || '').trim();
        if (text) break;
      }

      // 2. Fallback for conversational follow-ups (different DOM structure)
      //    Walk up max 3 levels from the mutated element.
      //    - Start from parentElement for text nodes (they have no innerText)
      //    - Threshold 15 chars: low enough to catch short responses like "3+3=6"
      //    - Depth 3: avoids landing in large page-level containers
      if (!text) {
        for (var m = 0; m < mutations.length; m++) {
          var node = mutations[m].target;
          if (node.nodeType === 3) node = node.parentElement; // text node → element
          for (var d = 0; d < 3; d++) {
            if (!node || node === document.body) break;
            var candidate = (node.innerText || '').trim();
            if (candidate.length >= 15) { text = candidate; break; }
            node = node.parentElement;
          }
          if (text) break;
        }
      }

      // Only collect text that grew AND differs from the pre-query snapshot
      if (text.length > collected.length && text !== snapshotText) {
        collected = text;
        clearTimeout(debounce);
        debounce = setTimeout(function() {
          obs.disconnect();
          reportResponse(collected);
        }, 2500);
      }
    });

    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Safety timeout: disconnect after 15 seconds if no AI response appears
    setTimeout(function() { obs.disconnect(); }, 15000);
  }

  chrome.runtime.onMessage.addListener(function(msg) {
    if (!msg || msg.type !== 'achievement-unlocked' || !msg.event) return;
    showAchievementUnlockHud({
      id: msg.event.id,
      title: msg.event.title,
      image: chrome.runtime.getURL(msg.event.image)
    });
  });
})();
