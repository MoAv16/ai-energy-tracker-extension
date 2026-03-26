// Content Script: Google Search - normal search and Google AI Mode (udm=50)
(function() {
  var params   = new URLSearchParams(window.location.search);
  var query    = params.get('q');
  if (!query || window.location.pathname !== '/search') return;

  var isAiMode = params.get('udm') === '50';

  chrome.storage.local.get('settings', function(data) {
    var settings = data.settings || {};
    // Both google modes share the same settings toggle
    if ((settings.standardServices || {})['google'] === false) return;

    if (isAiMode) {
      runAiMode(query);
    } else {
      chrome.runtime.sendMessage({
        type: 'prompt-submitted',
        service: 'google',
        promptText: query
      });
    }
  });

  // ── Energy profile (mirrors PROFILES in background.js for google-ai-mode) ─
  var ENERGY = {
    jegham: { b: 0.120, r: 0.00065 },
    altman: { b: 0.094, r: 0.00051 },
    epoch:  { b: 0.056, r: 0.00030 }
  };
  var activeProfile = 'altman';
  chrome.storage.local.get('settings', function(d) {
    if (d.settings && d.settings.energyProfile) activeProfile = d.settings.energyProfile;
  });

  function calcWh(responseTokens) {
    var p = ENERGY[activeProfile] || ENERGY.altman;
    return p.b + (responseTokens || 0) * p.r;
  }

  // ── AI Mode: main flow ────────────────────────────────────────────────────
  function runAiMode(query) {
    showDetectionToast();
    chrome.runtime.sendMessage({
      type: 'prompt-submitted',
      service: 'google-ai-mode',
      promptText: query,
      responseText: ''
    });
    waitForAIResponse();
  }

  // ── Detection Toast (same pattern as universal.js) ────────────────────────
  function showDetectionToast() {
    var toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;top:58px;right:20px;z-index:2147483647;' +
      'background:rgba(6,13,26,0.93);border:1px solid rgba(65,197,255,0.2);' +
      'border-radius:8px;padding:7px 13px;display:flex;align-items:center;gap:8px;' +
      'font:600 12px "Segoe UI",Arial,sans-serif;color:#ddeeff;pointer-events:none;' +
      'box-shadow:0 8px 28px rgba(0,0,0,0.45);';
    toast.innerHTML =
      '<span style="color:#41c5ff;font-size:13px;">&#9889;</span>' +
      '<span>Google AI Mode detected</span>';
    document.body.appendChild(toast);
    toast.animate(
      [{ transform: 'translateX(112%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 360, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'both' }
    );
    setTimeout(function() {
      var out = toast.animate(
        [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(112%)', opacity: 0 }],
        { duration: 260, easing: 'ease', fill: 'both' }
      );
      out.onfinish = function() { if (toast.parentNode) toast.remove(); };
    }, 1800);
  }

  // ── HUD (Shadow DOM, appears once AI response is collected) ───────────────
  var hudHost = null;
  var hudRoot = null;
  var hudTimer = null;

  function buildHud() {
    if (hudHost) return;
    hudHost = document.createElement('div');
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
        'text-transform:uppercase;letter-spacing:.5px;}'
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
      '</div>';

    hudRoot.appendChild(style);
    hudRoot.appendChild(box);
    hudRoot.querySelector('#xi').addEventListener('click', hudHide);
  }

  function hudShow(responseTokens) {
    buildHud();
    clearTimeout(hudTimer);
    var box  = hudRoot.querySelector('.box');
    var elOut = hudRoot.querySelector('#ho');
    var elWh  = hudRoot.querySelector('#hw');
    if (box) box.classList.remove('out');
    if (elOut) elOut.textContent = responseTokens;
    if (elWh)  elWh.textContent  = calcWh(responseTokens).toFixed(2) + ' Wh';
    hudHost.style.display = 'block';
    hudTimer = setTimeout(hudHide, 8000);
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

  // ── MutationObserver: wait for AI response in DOM ─────────────────────────
  // Selectors in priority order (most specific first)
  var AI_SELECTORS = [
    'div[data-subtree="aimc"]',
    'div[data-attrid="AIOverview"]',
    'div[jsname="N760b"]'
  ];

  function waitForAIResponse() {
    var collected = '';
    var debounce  = null;

    var obs = new MutationObserver(function() {
      for (var i = 0; i < AI_SELECTORS.length; i++) {
        var el = document.querySelector(AI_SELECTORS[i]);
        if (!el) continue;
        var text = (el.innerText || '').trim();
        if (text.length > collected.length) {
          collected = text;
          clearTimeout(debounce);
          debounce = setTimeout(function() {
            obs.disconnect();
            var tokens = Math.ceil(collected.length / 4);
            chrome.runtime.sendMessage({
              type: 'response-received',
              service: 'google-ai-mode',
              responseText: collected
            });
            hudShow(tokens);
          }, 2500);
        }
        break; // Only check the first matching selector
      }
    });

    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Safety timeout: disconnect after 15 seconds if no AI response appears
    setTimeout(function() { obs.disconnect(); }, 15000);
  }
})();
