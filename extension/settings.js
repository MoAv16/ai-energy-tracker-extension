// Settings Script

var _ = chrome.i18n.getMessage;

// Load settings
chrome.storage.local.get("settings", function(data) {
  var settings = data.settings || {};
  var optional = settings.optionalServices || {};
  var standard = settings.standardServices || {};

  // Load active energy profile (default: altman)
  var activeProfile = settings.energyProfile || 'altman';
  var profileRadio = document.querySelector('input[name="energyProfile"][value="' + activeProfile + '"]');
  if (profileRadio) profileRadio.checked = true;

  // Load google search baseline (default: classic)
  var activeBaseline = settings.googleSearchBaseline || 'classic';
  var baselineRadio = document.querySelector('input[name="googleBaseline"][value="' + activeBaseline + '"]');
  if (baselineRadio) baselineRadio.checked = true;

  var stdBoxes = document.querySelectorAll("#standardList input[type='checkbox']");
  for (var i = 0; i < stdBoxes.length; i++) {
    var svc = stdBoxes[i].getAttribute("data-service");
    stdBoxes[i].checked = standard[svc] !== false;
  }

  var optBoxes = document.querySelectorAll("#optionalList input[type='checkbox']");
  for (var i = 0; i < optBoxes.length; i++) {
    var svc = optBoxes[i].getAttribute("data-service");
    if (optional[svc]) {
      optBoxes[i].checked = true;
    }
  }
});

function saveAll() {
  var stdBoxes = document.querySelectorAll("#standardList input[type='checkbox']");
  var standard = {};
  for (var i = 0; i < stdBoxes.length; i++) {
    var svc = stdBoxes[i].getAttribute("data-service");
    standard[svc] = stdBoxes[i].checked;
  }

  var optBoxes = document.querySelectorAll("#optionalList input[type='checkbox']");
  var optional = {};
  for (var i = 0; i < optBoxes.length; i++) {
    var svc = optBoxes[i].getAttribute("data-service");
    optional[svc] = optBoxes[i].checked;
  }

  chrome.storage.local.get("settings", function(data) {
    var settings = data.settings || {};
    settings.standardServices = standard;
    settings.optionalServices = optional;
    chrome.storage.local.set({ settings: settings }, function() {
      var msg = document.getElementById("savedMsg");
      msg.style.display = "block";
      setTimeout(function() { msg.style.display = "none"; }, 2000);
    });
  });
}

document.getElementById("standardList").addEventListener("change", saveAll);
document.getElementById("optionalList").addEventListener("change", saveAll);

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
  chrome.tabs.create({ url: chrome.runtime.getURL("devtest.html") });
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
