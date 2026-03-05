// Content Script: Google Search
// Trackt Suchanfragen - einfach bei Seitenladung zaehlen
(function() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("q");
  if (!query) return;

  chrome.runtime.sendMessage({
    type: "prompt-submitted",
    service: "google",
    promptText: query
  });
})();
