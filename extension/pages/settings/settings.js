// Settings Script

var _ = chrome.i18n.getMessage;
var DEFAULT_OPTIONAL_ON = { copilot: true, claude: true, google: true };


var customizeCalcBtn = document.getElementById("btnCustomizeCalculation");
var calculationAdvanced = document.getElementById("calculationAdvanced");

if (customizeCalcBtn && calculationAdvanced) {
  customizeCalcBtn.addEventListener("click", function() {
    calculationAdvanced.classList.toggle("is-open");
    chrome.runtime.sendMessage({ type: 'unlock-special-achievement', id: 'wissensdurst' }, function(resp) {
      if (chrome.runtime.lastError) return;
      if (!(resp && resp.unlocked)) return;
      showAchievementHud({
        id: 'wissensdurst',
        title: 'Wissensdurst',
        image: chrome.runtime.getURL('assets/achievements/Wissnesdurst.png')
      });
    });
  });
}

function showAchievementHud(options) {
  if (!options) return;
  var old = document.getElementById('achievementHud');
  if (old) old.remove();

  var hud = document.createElement('div');
  hud.id = 'achievementHud';
  hud.style.cssText = [
    'position:fixed',
    'top:18px',
    'right:18px',
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
      '<button id="achievementHudBtn" style="margin-top:8px;background:rgba(16,185,129,0.12);color:#059669;border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:6px 9px;font:600 11px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">Zum Achievement</button>' +
    '</div>' +
    '<button id="achievementHudClose" style="align-self:flex-start;background:none;border:none;color:#9c8c7a;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;">×</button>';

  document.body.appendChild(hud);

  function removeHud() {
    if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
  }

  document.getElementById('achievementHudBtn').addEventListener('click', function() {
    window.location.href = chrome.runtime.getURL('pages/dashboard/dashboard.html');
  });
  document.getElementById('achievementHudClose').addEventListener('click', removeHud);
  setTimeout(removeHud, 7000);
}

function setupOptionalCollapse() {
  var section = document.getElementById("optionalServicesSection");
  var toggle = document.getElementById("optionalServicesToggle");
  if (!section || !toggle) return;

  toggle.addEventListener("click", function() {
    var collapsed = section.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

function getOptionalDefaultState(service) {
  return !!DEFAULT_OPTIONAL_ON[service];
}


// Load settings
chrome.storage.local.get("settings", function(data) {
  var settings = data.settings || {};
  var optional = settings.optionalServices || {};
  var standard = settings.standardServices || {};

  // Load active energy profile (default: jegham)
  var activeProfile = settings.energyProfile || 'jegham';
  var profileRadio = document.querySelector('input[name="energyProfile"][value="' + activeProfile + '"]');
  if (profileRadio) profileRadio.checked = true;

  // Load PUE profile (default: industry)
  var activePue = settings.pueProfile || 'industry';
  var pueRadio = document.querySelector('input[name="pueProfile"][value="' + activePue + '"]');
  if (pueRadio) pueRadio.checked = true;

  // Load water toggle (default: false)
  var waterToggle = document.getElementById('toggleWater');
  if (waterToggle) waterToggle.checked = !!settings.showWater;

  // Load google search baseline (default: classic)
  var activeBaseline = settings.googleSearchBaseline || 'classic';
  var baselineRadio = document.querySelector('input[name="googleBaseline"][value="' + activeBaseline + '"]');
  if (baselineRadio) baselineRadio.checked = true;

  // Load No-AI toggle
  var noAiBox = document.getElementById('toggleGoogleNoAI');
  if (noAiBox) noAiBox.checked = !!settings.googleNoAI;

  var tokenSaverBox = document.getElementById('toggleTokenSaver');
  if (tokenSaverBox) tokenSaverBox.checked = !!settings.tokenSaverMode;
  renderTokenSaverPrompt(settings);

  var optBoxes = document.querySelectorAll("#optionalList input[type='checkbox']");
  for (var i = 0; i < optBoxes.length; i++) {
    var svc = optBoxes[i].getAttribute("data-service");
    optBoxes[i].checked = optional.hasOwnProperty(svc)
      ? !!optional[svc]
      : standard.hasOwnProperty(svc)
        ? standard[svc] !== false
        : getOptionalDefaultState(svc);
  }
});

function saveAll() {
  var optBoxes = document.querySelectorAll("#optionalList input[type='checkbox']");
  var optional = {};
  for (var i = 0; i < optBoxes.length; i++) {
    var svc = optBoxes[i].getAttribute("data-service");
    optional[svc] = optBoxes[i].checked;
  }

  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.optionalServices = optional;
    delete settings.standardServices;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("savedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
}

// No-AI toggle: eigener Listener (nicht Teil von saveAll)
var noAiEl = document.getElementById('toggleGoogleNoAI');
if (noAiEl) {
  noAiEl.addEventListener('change', function() {
    chrome.storage.local.get('settings', function(data) {
      var s = data.settings || {};
      s.googleNoAI = noAiEl.checked;
      chrome.storage.local.set({ settings: s }, function() {
        if (!noAiEl.checked) return;
        chrome.runtime.sendMessage({ type: 'unlock-special-achievement', id: 'hintertuer' }, function(resp) {
          if (chrome.runtime.lastError) return;
          if (!(resp && resp.unlocked)) return;
          showAchievementHud({
            id: 'hintertuer',
            title: 'Hintertür',
            image: chrome.runtime.getURL('assets/achievements/Hintert%C3%BCr.png')
          });
        });
      });
    });
  });
}

var TOKEN_SAVER_DEFAULT = "Antworte kurz, keine Emojis, nur das Wesentliche";

function getTokenSaverPromptText(settings) {
  return settings.tokenSaverPrompt || TOKEN_SAVER_DEFAULT;
}

function renderTokenSaverPrompt(settings) {
  var el = document.getElementById('tokenSaverPromptText');
  if (el) el.textContent = getTokenSaverPromptText(settings);
}

var tokenSaverEl = document.getElementById('toggleTokenSaver');
if (tokenSaverEl) {
  tokenSaverEl.addEventListener('change', function() {
    chrome.storage.local.get('settings', function(data) {
      var s = data.settings || {};
      s.tokenSaverMode = tokenSaverEl.checked;
      chrome.storage.local.set({ settings: s });
    });
  });
}

var btnCustomize = document.getElementById('btnCustomizeTokenSaver');
var editArea = document.getElementById('tokenSaverEditArea');
var promptDisplay = document.getElementById('tokenSaverPromptDisplay');
var promptInput = document.getElementById('tokenSaverPromptInput');

if (btnCustomize && editArea && promptInput) {
  btnCustomize.addEventListener('click', function() {
    chrome.storage.local.get('settings', function(data) {
      promptInput.value = getTokenSaverPromptText(data.settings || {});
      editArea.style.display = 'block';
      btnCustomize.style.display = 'none';
      promptInput.focus();
    });
  });
}

var btnSave = document.getElementById('btnSaveTokenSaverPrompt');
if (btnSave) {
  btnSave.addEventListener('click', function() {
    var val = promptInput.value.trim();
    if (!val) return;
    chrome.storage.local.get('settings', function(data) {
      var s = data.settings || {};
      s.tokenSaverPrompt = val === TOKEN_SAVER_DEFAULT ? undefined : val;
      if (s.tokenSaverPrompt === undefined) delete s.tokenSaverPrompt;
      chrome.storage.local.set({ settings: s }, function() {
        renderTokenSaverPrompt(s);
        editArea.style.display = 'none';
        btnCustomize.style.display = '';
        var msg = document.getElementById('tokenSaverSavedMsg');
        if (msg) { msg.style.display = 'inline'; setTimeout(function() { msg.style.display = 'none'; }, 2000); }
      });
    });
  });
}

var btnReset = document.getElementById('btnResetTokenSaverPrompt');
if (btnReset) {
  btnReset.addEventListener('click', function() {
    promptInput.value = TOKEN_SAVER_DEFAULT;
  });
}

var btnCancel = document.getElementById('btnCancelTokenSaverEdit');
if (btnCancel) {
  btnCancel.addEventListener('click', function() {
    editArea.style.display = 'none';
    btnCustomize.style.display = '';
  });
}

document.getElementById("optionalList").addEventListener("change", saveAll);
setupOptionalCollapse();

document.getElementById("profileList").addEventListener("change", function(e) {
  if (e.target.name !== "energyProfile") return;
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.energyProfile = e.target.value;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("profileSavedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
});

document.getElementById("pueList").addEventListener("change", function(e) {
  if (e.target.name !== "pueProfile") return;
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.pueProfile = e.target.value;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("pueSavedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
});

document.getElementById("toggleWater").addEventListener("change", function() {
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.showWater = document.getElementById("toggleWater").checked;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("waterSavedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
});

document.getElementById("googleBaselineList").addEventListener("change", function(e) {
  if (e.target.name !== "googleBaseline") return;
  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.googleSearchBaseline = e.target.value;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("googleBaselineSavedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
});

document.getElementById("btnDevTest").addEventListener("click", function() {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/devtest/devtest.html") });
});

document.getElementById("btnClearAll").addEventListener("click", function() {
  if (!confirm(_("confirmClearData"))) return;

  chrome.storage.local.get(["settings", "_fsConnected"], function(data) {
    var settings = data.settings;
    var fsConnected = data._fsConnected;
    chrome.storage.local.clear(function() {
      var restore = {};
      if (settings)     restore.settings     = settings;
      if (fsConnected)  restore._fsConnected = fsConnected;
      if (Object.keys(restore).length) chrome.storage.local.set(restore);
      chrome.runtime.sendMessage({ type: 'clear-fs-data' }, function() {
        alert(_("clearedData"));
      });
    });
  });
});
