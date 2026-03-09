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
