# Research #005: KI-generierte Bilder – Energieverbrauch und DOM-Erkennung

## Fragestellung

Wie viel Energie verbraucht eine KI-generierte Bilderzeugung?
Und wie können KI-generierte Bilder im Browser zuverlässig erkannt werden?

Scope dieser Recherche: **ChatGPT (DALL-E 3 / GPT-4o native image generation)**

---

## Wichtigstes Vorabergebnis: Datenlage

| Quelle | Wert | Modell | Typ |
|--------|------|--------|-----|
| Luccioni et al. 2024 (ACM FAccT) | **2.9 Wh** Ø / Bild | Diffusion-Modelle (A100) | Gemessen |
| Luccioni – Stable Diffusion XL | **11.4 Wh** / Bild | SDXL (100+ Schritte) | Gemessen |
| "30× mehr als Text"-Claim | **~9 Wh** / Bild | GPT-4o Image (abgeleitet) | Geschaetzt |
| DALL-E 3 offiziell | ❌ keine Daten | — | — |

**Fazit**: Fuer kommerzielle Modelle wie DALL-E 3 gibt es keine veroeffentlichten
Messwerte. Als zitierfaehige Untergrenze verwenden wir **2.9 Wh** (Luccioni 2024).

---

## Quellenanalyse

### 1. Luccioni et al. – "Power Hungry Processing" (ACM FAccT 2024)
- **Paper**: arXiv:2311.16863
- **Methodik**: Direkte Leistungsmessung auf A100-GPUs, 10 Modelle, 33 Aufgaben
- **Kernbefund**: Bildgenerierung ist **~62× energieintensiver als Textgenerierung**
  auf derselben Hardware (0.047 Wh Text vs. 2.9 Wh Bild im Durchschnitt)
- **Spitzenwert**: Stable Diffusion XL bei 100+ Diffusionsschritten: 11.4 Wh / Bild
- **Einschraenkung**: Open-Source-Modelle auf Forschungs-Hardware – kommerzielle
  Anbieter (OpenAI) betreiben deutlich groessere Modelle mit mehr Rechenschritten

### 2. Skalierungsueberlegung (intern)
Unser Textbaseline (0.3–0.42 Wh, Altman/Jegham) ist ~7–9× hoeher als Luccionis
Textbaseline (0.047 Wh). Bei gleicher Skalierung:

```
Skalierter Bildwert = 2.9 Wh × (0.35 / 0.047) ≈ 21.6 Wh / Bild
```

Das liegt nah am "30× Text"-Wert (~9 Wh). Bandbreite: **2.9 Wh (Minimum) – ~20 Wh (skaliert)**.

### 3. GPT-4o Image Generation (April 2025)
- Natives Bildgenerierungsmodell, integriert in ChatGPT
- Kein eigenstaendiger DALL-E-Aufruf mehr – direkt im Autoregressive-Modell
- Energiedaten: nicht veroeffentlicht
- Qualitaet und Groesse (1024×1024 HD) legen hoehere Werte als Open-Source nahe

---

## Empfohlener Wert fuer die Extension

**2.9 Wh pro generiertem Bild** – direkt aus Luccioni (peer-reviewed, gemessen)

Dieser Wert gilt einheitlich ueber alle drei Energie-Profile (jegham/altman/epoch),
da die Bildgenerierungsforschung nicht die gleichen Skalierungsfaktoren erlaubt
wie die tokenbasierte Textgenerierung.

```javascript
// In background.js, PROFILES – nur fuer chatgpt (einziger tracked Service)
chatgpt: { whBase: ..., whPerToken: ..., whPerImage: 2.9 }
```

**Hinweis**: Dieser Wert ist konservativ (Untergrenze). DALL-E 3 / GPT-4o Image
verbraucht durch hoehere Modellgroesse und Qualitaet wahrscheinlich mehr –
aber belegbare Zahlen fehlen.

---

## DOM-Erkennung: ChatGPT (DALL-E 3 / GPT-4o)

### Wo erscheinen generierte Bilder im DOM?

Generierte Bilder erscheinen als `<img>`-Elemente **innerhalb von Assistenz-Nachrichten**:

```
[data-message-author-role="assistant"]
  └── div.markdown (oder aehnlich)
       └── img[src="https://..."]
```

### Erkennbare URL-Muster (ChatGPT-CDN)

| Muster | Beschreibung |
|--------|-------------|
| `oaidalleapiprodscus.blob.core.windows.net` | DALL-E 3 via ChatGPT (aelteres Format) |
| `files.oaiusercontent.com` | GPT-4o native image generation (2025) |
| `oaiusercontent.com` | Allgemeines OpenAI-CDN fuer User-Content |

### Erkennungsstrategie (Zwei-Stufen-Filter)

**Stufe 1 (sicher): URL-Muster**
- Pruefe ob `img.src` eines der obigen OpenAI-CDN-Muster enthaelt
- Sehr zuverlaessig, wenige False Positives

**Stufe 2 (Fallback): Groesse + Container**
- Bild ist >= 100px breit UND hoch
- Bild befindet sich innerhalb einer Assistenz-Antwort
- Verhindert, dass UI-Icons (16–48px) gezaehlt werden

### Was NICHT als generiertes Bild gilt

- Avatare / Profilbilder (klein, ausserhalb von Antwort-Containern)
- SVG-Icons und UI-Elemente (andere Selektoren, kein `<img>` mit CDN-URL)
- Vom Nutzer hochgeladene Bilder (erscheinen in User-Nachrichten, nicht Assistenz)

### Timing

DALL-E 3 / GPT-4o Image: Generierungsdauer 10–60 Sekunden typisch.
Der MutationObserver laeuft bis zu 90 Sekunden (laenger als Textbeobachtung mit 120s,
aber getrennt davon, da Bilder nach dem Text erscheinen koennen).

---

## Implementierungsstatus

- [x] Research abgeschlossen (Research #005)
- [x] Implementiert in `universal.js` (`watchForImages()`)
- [x] Implementiert in `background.js` (`recordImageDetection()`, `whPerImage: 2.9`)
- [x] HUD zeigt generierte Bilder an (lila Zeile)
- [x] Popup zeigt Bildanzahl im "Letzter Prompt"-Bereich

---

## Quellenverzeichnis

1. **Luccioni, S., Jernite, Y., Strubell, E.** (2024): "Power Hungry Processing:
   Watts Driving the Cost of AI Deployment?" – ACM FAccT 2024
   https://arxiv.org/pdf/2311.16863

2. **arXiv:2506.17016** (2025): "The Hidden Cost of an Image: Quantifying the
   Energy Consumption of AI Image Generation"
   https://arxiv.org/html/2506.17016v1

3. **arXiv:2511.17031** (2025): "Energy Scaling Laws for Diffusion Models"
   https://arxiv.org/html/2511.17031v1

4. **Ratiftech** (2025): "The real impacts of AI Image Generation: Energy and Environment"
   https://ratiftech.com/2025/04/20/the-real-impacts-of-ai-image-generation-energy-and-environment/

---

## Status: ABGESCHLOSSEN
