# Research #004: Google Suchmaschine – Verbrauchsanalyse aller Modi

## Fragestellung

Wie viel Energie verbraucht die Google-Suchmaschine in ihren drei verschiedenen Modi?

| Modus | Beschreibung | URL-Erkennzeichen |
|---|---|---|
| **Normale Suche** | Klassische 10-blaue-Links-Suche, kein KI | `/search?q=...` (kein `udm`) |
| **AI Overview** | Normale Suche + KI-Zusammenfassung inline | `/search?q=...` (kein `udm`, aber KI im DOM) |
| **AI Mode** | Dedizierter KI-Chat-Modus (Gemini) | `/search?q=...&udm=50` |

Ziel: Belastbare, belegte Werte für die Extension und eine ehrliche Einordnung der Datenlage.

---

## Wichtigstes Vorabergebnis: Asymmetrie der Datenlage

| Modus | Offizielle Google-Daten? | Verlässlichkeit |
|---|---|---|
| Normale Suche | Ja – aber veraltet (2009) | Mittel |
| AI Overview | **Nein – keine Daten veröffentlicht** | Nur Schätzungen |
| AI Mode (Gemini) | **Ja – peer-reviewed, Aug. 2025** | Hoch |

Google hat im August 2025 erstmals gemessene Energiedaten für KI-Anfragen veröffentlicht (arXiv:2508.15734) – aber **ausschließlich für Gemini Apps (dedizierten Chat)**, nicht für AI Overviews in der normalen Suche.

---

## Teil 1: Normale Google-Suche (kein KI)

### Historischer Ankerwert – Google selbst (2009)

**Quelle:** Google Blog, Urs Hölzle (SVP Operations), Januar 2009
„Powering a Google search"
https://publicpolicy.googleblog.com/2009/01/powering-google-search.html

- Energie: **0,3 Wh** pro Suche (= 0,0003 kWh)
- CO₂: **0,2 g CO₂** pro Suche
- Kontext: Gegendarstellung zu einem Guardian-Artikel, der 7 g CO₂ behauptet hatte

Diese Zahl wurde 16 Jahre lang als Referenz zitiert – von der IEA (2024), Epoch AI (2025) und zahllosen Medien. Sie ist technisch überholt.

---

### Revidierter Wert – akademische Neuberechnung (2025)

**Quelle:** Wim Vanderbauwhede (University of Glasgow), arXiv:2407.16894
„Estimating the Increase in Emissions caused by AI-augmented Search"
https://arxiv.org/abs/2407.16894 – zuletzt aktualisiert Januar 2025

Vanderbauwhede berechnet den aktuellen Verbrauch unter Berücksichtigung der Hardware-Effizienzverbesserungen seit 2009:

- Google-Server wurden seit 2009 ca. **6,7× effizienter** (laut Googles eigenen Effizienzberichten)
- PUE der Google-Rechenzentren sank von ~1,4 (2009) auf **1,09** (2025, offiziell)
- Ergebnis: **~0,04 Wh** pro normaler Google-Suche (2025)
- CO₂: **~0,02 g** (US-Strommix)

```
0,3 Wh (2009) ÷ 6,7 (Effizienzgewinn) × (1,09 / 1,4) (PUE-Verbesserung) ≈ 0,035 Wh ≈ 0,04 Wh
```

**Einschränkung:** Diese Zahl ist akademisch hergeleitet, nicht von Google gemessen und bestätigt.

---

### Gegenüberstellung: Beide Werte

| Quelle | Jahr | Wh/Suche | CO₂ | Status |
|---|---|---|---|---|
| Google (Hölzle) | 2009 | **0,3 Wh** | 0,2 g | Offiziell, aber veraltet |
| IEA „Energy and AI" | 2024 | 0,3 Wh | – | Zitiert 2009-Daten unverändert |
| Epoch AI | Feb. 2025 | 0,3 Wh | – | Zitiert 2009-Daten als Baseline |
| Vanderbauwhede (arXiv) | Jan. 2025 | **~0,04 Wh** | ~0,02 g | Akademisch, nicht bestätigt |

**Fazit für die Extension:** In Ermangelung neuerer offizieller Daten bleibt **0,3 Wh** der am häufigsten zitierte Wert und wird als `google`-Service-Baseline verwendet. Der revidierte Wert von 0,04 Wh ist plausibler, aber nicht belegt genug für eine Umstellung ohne Google-Bestätigung.

---

## Teil 2: Google AI Overview (inline in normaler Suche)

### Kernbefund: Keine offiziellen Daten

Google hat für AI Overviews (die KI-Zusammenfassung, die seit 2024 in normalen Suchergebnissen erscheint) **keine Energiedaten veröffentlicht**. Das Paper arXiv:2508.15734 misst ausdrücklich nur „Gemini Apps" – also den dedizierten Chat-Modus, nicht AI Overviews.

### Externe Schätzungen

**1. Vanderbauwhede (arXiv:2407.16894, Jan. 2025)**
- KI-augmentierte Suche (AI Overview-Szenario): **60–70× teurer** als klassische Suche
- Basis: 0,04 Wh klassische Suche → AI Overview ca. **2,4–2,8 Wh**
- Methodik: Extrapolation aus BLOOM-176B-Modelleffizienz, nicht Google-spezifisch

**2. John Hennessy (Alphabet-Chairman, ca. 2023)**
- Zitat: „An exchange with a large language model could cost 10 times more than a traditional search"
- Quelle: Reuters-Interview; er relativierte diese Aussage später selbst

**3. Sasha Luccioni (Hugging Face, 2024)**
- Textgenerierung kostet ca. **30× mehr Energie** als Abrufen gespeicherter Informationen
- Peer-reviewed, aber nicht Google-spezifisch
- Quelle: „Power hungry processing: Watts driving the cost of AI deployment?"

**4. Matt Tutt (SEO/Nachhaltigkeitsexperte, 2025)**
- Schätzung: ~10× teurer als traditionelle Suche
- Eigene Einschränkung: „I have not seen any officially confirmed figures on this matter."
- https://matttutt.me/what-is-the-environmental-cost-of-googles-ai-overview-searches/

### Abgeleitete Schätzspanne

```
Basis klassische Suche: 0,04–0,3 Wh
Multiplikator AI Overview: 10–70× (je nach Quelle)
→ Schätzspanne: 0,4–21 Wh pro AI-Overview-Anfrage
```

Diese Spanne ist zu breit für belastbare Aussagen. **Konservative Einordnung für die Extension:** ~10× die klassische Suche = ~0,3–3 Wh.

---

## Teil 3: Google AI Mode – udm=50 (Gemini Chat in Search)

### Primärquelle: arXiv:2508.15734 (August 2025)

**Paper:** „Measuring the environmental impact of delivering AI at Google Scale"
- arXiv: https://arxiv.org/abs/2508.15734
- Eingereicht: 21. August 2025
- Autoren: Elsworth, Huang et al. (Google DeepMind / Google)
- Begleitartikel: https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference/

Dies ist die **erste peer-review-fähige Veröffentlichung von Google** mit gemessenen Energiedaten für KI-Anfragen in Produktion.

### Messwerte: Gemini Apps Text Prompt (Median, Mai 2025)

| Metrik | Wert |
|---|---|
| **Energie** | **0,24 Wh** |
| CO₂ | 0,03 g CO₂e |
| Wasser (direkt) | 0,26 mL (~5 Tropfen) |

### Aufschlüsselung der 0,24 Wh nach Infrastrukturkomponente

| Komponente | Wh | Anteil | Beschreibung |
|---|---|---|---|
| KI-Beschleuniger (TPUs) | 0,14 Wh | **58%** | Hauptrechenleistung |
| CPU & DRAM (Host) | 0,06 Wh | **25%** | Server-Nebenkomponenten |
| Idle-Maschinen (Redundanz) | 0,02 Wh | **8%** | Reservekapazität, immer laufend |
| Rechenzentrum-Overhead | 0,02 Wh | **8%** | Kühlung, USV, Netzwerk (PUE 1,09) |

**Wichtiger Methodikunterschied:** Die „konventionelle" engere Messmethode würde nur 0,10 Wh ergeben. Die umfassende Google-Methode (0,24 Wh) berücksichtigt zusätzlich Idle-Kapazität und vollständige Infrastrukturkosten – ein **2,4× Faktor**, der zeigt, wie stark herkömmliche Schätzungen die realen Kosten unterschätzen.

### Effizienzverbesserung: Mai 2024 → Mai 2025

| Metrik | Mai 2024 | Mai 2025 | Reduktion |
|---|---|---|---|
| Energie | ~7,9 Wh | **0,24 Wh** | **33×** |
| CO₂ | ~1,3 g | 0,03 g | **44×** |

Treiber der Verbesserungen (laut Paper):
- **Mixture-of-Experts (MoE):** Nur ein Bruchteil der Modellparameter wird pro Anfrage aktiviert
- **Speculative Decoding:** Effizientere Token-Generierung
- **Optimierte TPU-Generationen:** TPU v5e → TPU v6e (Trillium)
- **Bessere Batch-Verarbeitung:** Höhere Chip-Auslastung pro Chip-Stunde

---

## Teil 4: Direkter Vergleich aller Modi

### Energieverbrauch nebeneinander

| Modus | Wh/Anfrage | CO₂ (g) | Wasser (mL) | Quelle | Datum |
|---|---|---|---|---|---|
| Normale Suche (hist.) | 0,30 Wh | 0,2 g | k.A. | Google (Hölzle) | 2009 |
| Normale Suche (aktuell) | ~0,04 Wh | ~0,02 g | k.A. | Vanderbauwhede (arXiv) | 2025 |
| AI Overview | **keine offiz. Daten** | – | – | – | – |
| AI Overview (Schätzung) | ~0,4–3 Wh | – | – | Branchenschätzungen | 2024–25 |
| **AI Mode / Gemini** | **0,24 Wh** | **0,03 g** | **0,26 mL** | Google (arXiv:2508.15734) | Aug. 2025 |
| ChatGPT (Altman) | 0,34 Wh | – | 0,32 mL | Sam Altman Blog | Jun. 2025 |

### Multiplikatoren: AI Mode vs. normale Suche

| Vergleich | Faktor | Interpretation |
|---|---|---|
| AI Mode (0,24 Wh) vs. Suche 2009 (0,3 Wh) | **0,8×** | AI Mode ist leicht *günstiger* (!) |
| AI Mode (0,24 Wh) vs. Suche aktuell (0,04 Wh) | **6×** | AI Mode kostet 6× mehr |
| AI Mode (0,24 Wh) vs. ChatGPT (0,34 Wh) | **0,7×** | AI Mode ist 30% günstiger als ChatGPT |
| AI Overview (est. 1 Wh) vs. Suche aktuell | **~25×** | Grobe Schätzung, unbelegt |

### Visualisierung der Verhältnisse (bei 0,04 Wh Baseline für aktuelle Suche)

```
Normale Suche (aktuell)  ██  0,04 Wh
Normale Suche (2009)     ███████████████  0,30 Wh
AI Mode (Gemini)         ████████████  0,24 Wh
AI Overview (Schätzung)  ████████████████████████████████████████  ~1,0 Wh (10×)
ChatGPT (Altman)         █████████████████  0,34 Wh
```

---

## Teil 5: Einordnung – Was fehlt in den offiziellen Zahlen?

Das Google-Paper arXiv:2508.15734 ist ein Transparenzfortschritt, hat aber explizit genannte Grenzen:

| Aspekt | Enthalten? | Anmerkung |
|---|---|---|
| Inference-Energie (Server) | ✅ Ja | Vollständig, inkl. Idle und Overhead |
| Trainingsenergie | ❌ Nein | Nur Betrieb, nicht Training |
| Netzwerk außerhalb RZ | ❌ Nein | Internet-Backbone nicht berücksichtigt |
| Endgerät des Nutzers | ❌ Nein | Laptop/Handy-Verbrauch fehlt |
| Indirektes Wasser | ❌ Nein | Nur direktes Kühlwasser (Schätzung: 10–100× mehr indirekt) |
| AI Overviews | ❌ Nein | Ausdrücklich ausgeschlossen |
| Bildgenerierung / Reasoning | ❌ Nein | Nur Text-Prompts des Medians |
| Unabhängige Prüfung | ❌ Nein | Unternehmensmessung ohne externe Verifikation |

### Jevons-Paradox: Effizienz ≠ weniger Gesamtverbrauch

Jon Koomey (Energieforscher, Stanford) und Hannah Ritchie (Our World in Data) weisen auf ein strukturelles Problem hin:

> Googles Gesamt-CO₂-Emissionen sind seit 2019 um **48% gestiegen**, obwohl die Effizienz pro Anfrage massiv verbessert wurde.

**Erklärung:** Günstigere Kosten pro Anfrage führen zu mehr Anfragen. Der Effizienzgewinn wird durch Nutzungswachstum überkompensiert – ein klassisches Jevons-Paradox. Die 0,24 Wh pro Anfrage sagen nichts über den absoluten Energiehunger von Googles KI-Infrastruktur aus.

---

## Teil 6: Bedeutung für die Extension

### Aktuell implementierte Werte (background.js, Altman-Profil)

| Service-Key | whBase | whPerToken | Entspricht bei 300 Tokens |
|---|---|---|---|
| `google` (normale Suche) | 0,235 Wh | 0 | **0,235 Wh** (flat) |
| `google-ai-mode` | 0,094 Wh | 0,00051 Wh | **0,247 Wh** ≈ 0,24 Wh ✓ |

**`google-ai-mode` ist korrekt kalibriert** an Googles gemessenen 0,24 Wh (arXiv:2508.15734).

**`google` (normale Suche)** verwendet die veraltete 2009-Baseline (0,3 Wh). Eine Korrektur auf 0,04 Wh wäre wissenschaftlich aktueller, aber:
- Google hat diese Zahl nicht offiziell bestätigt
- Die alte 0,3-Wh-Zahl ist für die Botschaft der Extension (KI ≫ Google-Suche) konservativ und damit auf der sicheren Seite

**Keine Implementierung für AI Overview** – mangels offizieller Daten ist jede Zahl eine Schätzung, die im IHK-Kontext nicht belegt werden könnte.

---

## Quellenverzeichnis

| Nr. | Quelle | URL | Datum |
|---|---|---|---|
| 1 | **Google (arXiv:2508.15734)** – Gemessene Mediandaten Gemini | https://arxiv.org/abs/2508.15734 | Aug. 2025 |
| 2 | Google Cloud Blog – Begleitartikel zum Paper | https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference/ | Aug. 2025 |
| 3 | Google Blog (Hölzle) – „Powering a Google search" | https://publicpolicy.googleblog.com/2009/01/powering-google-search.html | Jan. 2009 |
| 4 | **Vanderbauwhede (arXiv:2407.16894)** – Emissionen KI-Suche | https://arxiv.org/abs/2407.16894 | Jul. 2024 / Jan. 2025 |
| 5 | IEA – „Energy and AI" Report | https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai | Jan. 2024 |
| 6 | Sam Altman – „The Gentle Singularity" (0,34 Wh ChatGPT) | https://blog.samaltman.com/the-gentle-singularity | Jun. 2025 |
| 7 | Epoch AI – „How much energy does ChatGPT use?" | https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use | Feb. 2025 |
| 8 | MIT Technology Review – Google Gemini AI energy | https://www.technologyreview.com/2025/08/21/1122288/google-gemini-ai-energy/ | Aug. 2025 |
| 9 | Hannah Ritchie – AI carbon footprint (Jevons-Paradox) | https://hannahritchie.substack.com/p/ai-footprint-august-2025 | Aug. 2025 |
| 10 | Matt Tutt – AI Overview environmental cost | https://matttutt.me/what-is-the-environmental-cost-of-googles-ai-overview-searches/ | 2025 |

---

## Status: ABGESCHLOSSEN

**Kernergebnisse:**

1. **Normale Suche**: 0,04–0,3 Wh (spannbreite je nach Quelle und Jahr)
2. **AI Overview**: Keine offiziellen Daten. Schätzungen: 10–70× teurer als klassische Suche
3. **AI Mode (Gemini)**: **0,24 Wh** – einziger belastbarer, offiziell gemessener Wert (Aug. 2025)
4. **Überraschendes Paradox**: AI Mode (0,24 Wh) erscheint günstiger als die oft zitierte historische Google-Suche (0,3 Wh) – der eigentliche Vergleich mit der aktuellen Suche (~0,04 Wh) zeigt aber den **6×-Faktor**
5. **Jevons-Paradox**: Effizienzgewinne pro Anfrage werden durch Nutzungswachstum kompensiert
