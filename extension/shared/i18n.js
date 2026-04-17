// i18n Helper – translates all elements with data-i18n attributes
(function() {
  document.querySelectorAll("[data-i18n]").forEach(function(el) {
    var key = el.getAttribute("data-i18n");
    var msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-title]").forEach(function(el) {
    var key = el.getAttribute("data-i18n-title");
    var msg = chrome.i18n.getMessage(key);
    if (msg) document.title = msg;
  });
  // Set html lang attribute
  var lang = chrome.i18n.getUILanguage().split("-")[0];
  document.documentElement.lang = lang;
})();
