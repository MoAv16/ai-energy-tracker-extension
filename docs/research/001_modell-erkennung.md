# Research #001: KI-Modell-Erkennung in Content Scripts

## Fragestellung
Kann ein Browser-Extension Content Script erkennen, welches KI-Modell der Nutzer
in ChatGPT, Gemini und Perplexity aktuell ausgewaehlt hat?

## Ergebnisse

### ChatGPT (chatgpt.com)
- **Modelle**: GPT-4o, GPT-4o mini, GPT-4, GPT-3.5, o1, o1-mini, o3-mini
- **DOM-Erkennung**: JA moeglich
  - Der Modell-Selektor ist ein Button/Dropdown im oberen Bereich des Chats
  - Frueher: `<div data-testid="model-selector">` mit dem Modellnamen als Text
  - Aktuell (2025/2026): Der Modellname steht oft in einem Button oberhalb des Eingabefelds
  - Moegliche Selektoren:
    - `button[data-testid="model-selector"]` → textContent enthaelt Modellnamen
    - `[class*="model"]` Elemente im Header-Bereich
    - Der Text "GPT-4o", "GPT-4" etc. ist im DOM sichtbar
  - **Risiko**: OpenAI aendert die DOM-Struktur regelmaessig
  - **Alternative**: In der URL steht manchmal `?model=gpt-4o` (nicht immer zuverlaessig)

### Google Gemini (gemini.google.com)
- **Modelle**: Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash, Gemini Ultra
- **DOM-Erkennung**: JA moeglich
  - Der Modell-Selektor ist ein Dropdown im oberen Bereich
  - Moegliche Selektoren:
    - `[data-model-slug]` Attribut an Elementen
    - Dropdown-Button mit dem Modellnamen als sichtbarer Text
    - `mat-select` oder aehnliche Angular/Material-Komponenten
  - **Risiko**: Google aendert die UI haeufig

### Perplexity (perplexity.ai)
- **Modelle**: Default, Pro (Claude, GPT-4, Gemini etc.), verschiedene "Focus"-Modi
- **DOM-Erkennung**: JA moeglich
  - Modell-Auswahl ist ein Dropdown/Popover unter dem Eingabefeld
  - Der aktuell gewaehlte Modellname ist als Text im DOM sichtbar
  - "Pro" vs "Quick" Modus ist ebenfalls erkennbar
  - **Risiko**: Perplexity hat haeufige UI-Updates

## Technischer Ansatz

### Empfehlung: Robuster DOM-Scanner
Statt feste Selektoren zu verwenden, einen flexiblen Scanner bauen:

```javascript
function detectModel(service) {
  // Strategie: Suche nach bekannten Modellnamen im sichtbaren DOM
  var modelNames = {
    chatgpt: ["gpt-4o", "gpt-4o mini", "gpt-4", "gpt-3.5", "o1", "o1-mini", "o3-mini", "o3", "o4-mini"],
    gemini: ["gemini 2.0", "gemini 1.5 pro", "gemini 1.5 flash", "gemini ultra", "gemini flash"],
    perplexity: ["sonar", "claude", "gpt-4", "gemini", "pro", "quick"]
  };

  var candidates = modelNames[service] || [];

  // Suche in Buttons, Selects, Dropdowns im oberen Bereich
  var headerEls = document.querySelectorAll(
    "button, [role='combobox'], [role='listbox'], select, " +
    "[class*='model'], [class*='selector'], [data-testid*='model']"
  );

  for (var i = 0; i < headerEls.length; i++) {
    var text = (headerEls[i].textContent || "").toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) {
      if (text.indexOf(candidates[j]) !== -1) {
        return candidates[j];
      }
    }
  }

  return "unbekannt";
}
```

### Vor- und Nachteile

**Vorteile:**
- Kein API-Zugriff noetig, rein DOM-basiert
- Funktioniert sofort ohne zusaetzliche Berechtigungen
- Modellnamen-basierte Suche ist robuster als feste CSS-Selektoren

**Nachteile:**
- Fragil – DOM-Aenderungen koennen die Erkennung brechen
- Nicht 100% zuverlaessig
- Muss regelmaessig getestet und angepasst werden
- Manche Modellnamen sind generisch ("Pro", "Quick")

## Fazit
**JA, es ist technisch moeglich.** Der beste Ansatz ist ein textbasierter Scanner,
der nach bekannten Modellnamen im DOM sucht, statt sich auf spezifische
CSS-Selektoren zu verlassen. Die Erkennung wird nie 100% stabil sein,
da alle drei Anbieter ihre UI regelmaessig aendern, aber fuer eine
Energieverbrauchsschaetzung reicht eine "best effort"-Erkennung.

## Naechste Schritte
- [ ] Auf chatgpt.com testen: DOM-Inspektion des Modell-Selektors
- [ ] Auf gemini.google.com testen: DOM-Inspektion
- [ ] Auf perplexity.ai testen: DOM-Inspektion
- [ ] detectModel() in universal.js einbauen
- [ ] Modellname an background.js mitsenden und in Statistik speichern

## Status: MACHBAR – Umsetzung moeglich
