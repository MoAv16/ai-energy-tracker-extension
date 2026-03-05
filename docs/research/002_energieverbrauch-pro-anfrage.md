# Research #002: Energieverbrauch pro KI-Anfrage – Wissenschaftliche Basis

## Fragestellung
Wie viel Energie (Wh) verbraucht eine einzelne KI-Anfrage tatsaechlich?
Ziel: Von "grober Schaetzung" auf wissenschaftlich belegbare Werte kommen.

---

## Kernerkenntnisse

### Unsere bisherigen Werte waren FALSCH

| Dienst | Bisher in Extension | Tatsaechlich |
|--------|-------------------|-------------|
| ChatGPT (Standard) | 3.0 Wh | **0.3–0.42 Wh** |
| Google Gemini | 2.5 Wh | **0.24 Wh** |
| Claude Sonnet | 2.5 Wh | **0.84 Wh** |
| Google Suche | 0.3 Wh | **0.04–0.3 Wh** |
| Reasoning (o3) | 3.0 Wh (!) | **7–39 Wh** |

**Fazit**: Standard-Modelle verbrauchen ~10x WENIGER als angenommen,
Reasoning-Modelle ~10x MEHR. Die Unterschiede zwischen Modellen sind enorm.

---

## Quellen und Belege

### 1. Sam Altman (OpenAI CEO) – Januar 2025
- **Aussage**: Eine typische ChatGPT-Anfrage verbraucht ca. **0.34 Wh**
- **Kontext**: Oeffentliche Aussage, keine detaillierte Methodik veroeffentlicht
- **Bewertung**: Offiziell, aber moeglicherweise konservativ geschaetzt

### 2. Epoch AI – Februar 2025
- **Ergebnis**: ~**0.3 Wh** pro typischer Anfrage (500 Output-Tokens)
- **Methodik**: Bottom-up-Berechnung basierend auf ~100B aktiven Parametern (MoE), H100 GPUs
- **Quelle**: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- **Bewertung**: Serioes, detaillierte Methodik, deckt sich mit Altmans Aussage

### 3. Google – August 2025 (ERSTE GEMESSENE DATEN)
- **Ergebnis**: Median Gemini Text-Prompt = **0.24 Wh**, **0.03 gCO2e**, **0.26 mL Wasser**
- **Quelle**: Google Paper "Measuring the environmental impact of delivering AI at Google Scale" (arXiv:2508.15734)
- **Bewertung**: GEMESSEN, nicht geschaetzt! Erste offizielle Messdaten eines KI-Anbieters.
- **Hinweis**: Exkludiert Netzwerk-Energie, Endgeraete, Training, vorgelagerten Wasserverbrauch
- **Trend**: Energieverbrauch pro Gemini-Prompt fiel um **33x** zwischen Mai 2024 und Mai 2025

### 4. Jegham et al. – Mai 2025 (30-MODELL-BENCHMARK)
- **Paper**: "How Hungry is AI?" (arXiv:2505.09598)
- **Methodik**: Infrastruktur-bewusste Messung von 30 Modellen in kommerziellen Rechenzentren
- **Bewertung**: Bisher umfassendste vergleichende Messung

#### Ergebnisse nach Prompt-Laenge:

**Kurze Prompts (100 Input / 300 Output Tokens):**

| Modell | Wh pro Anfrage |
|--------|---------------|
| GPT-4.1 nano | 0.10 |
| GPT-4o mini | 0.42 |
| GPT-4o | 0.42 |
| GPT-4.1 mini | 0.42 |
| GPT-4.1 | 0.92 |
| Claude 3.7 Sonnet | 0.84 |
| o3 (Reasoning) | 7.03 |
| DeepSeek-R1 (Reasoning) | 23.82 |

**Mittlere Prompts (1k Input / 1k Output Tokens):**

| Modell | Wh pro Anfrage |
|--------|---------------|
| GPT-4.1 nano | 0.27 |
| GPT-4o | 1.21 |
| GPT-4o mini | 1.42 |
| Claude 3.7 Sonnet | 2.78 |
| o3 (Reasoning) | 21.41 |
| DeepSeek-R1 (Reasoning) | 29.00 |

**Lange Prompts (10k Input / 1.5k Output Tokens):**

| Modell | Wh pro Anfrage |
|--------|---------------|
| GPT-4.1 nano | 0.45 |
| GPT-4o | 1.79 |
| GPT-4o mini | 2.11 |
| Claude 3.7 Sonnet | 5.52 |
| o3 (Reasoning) | 39.22 |
| DeepSeek-R1 (Reasoning) | 33.63 |

### 5. EPRI (Electric Power Research Institute) – 2024
- **Ergebnis**: **2.9 Wh** pro ChatGPT-Anfrage
- **Quelle**: "Powering Intelligence" White Paper
- **Bewertung**: Fruehe Schaetzung, gilt mittlerweile als UEBERHOELT (vor Altmans/Epoch-Zahlen)
- **Hinweis**: Dies war die Quelle fuer unsere bisherigen ~3 Wh Werte!

### 6. Alex de Vries (Joule, 2023)
- **Ergebnis**: ~**3 Wh** pro ChatGPT-Anfrage
- **Quelle**: "The growing energy footprint of artificial intelligence" (Joule, Okt 2023)
- **Bewertung**: Basierte auf GPT-3.5-Aera-Annahmen. Ebenfalls UEBERHOELT.

### 7. Luccioni et al. (ACM FAccT, 2024)
- **Ergebnis**: BLOOM-176B: **4 Wh** pro Anfrage (0.004 kWh)
- **Quelle**: "Power Hungry Processing" – Erste systematische Inference-Energiemessungen
- **Bewertung**: Gemessen, aber BLOOM ist kein optimiertes Produktionsmodell

### 8. Reasoning-Modelle – Der Energiemultiplikator
- **Ergebnis**: Chain-of-Thought Reasoning verbraucht **30x mehr Energie im Durchschnitt**, Spitzen bis **700x**
- **Quelle**: arXiv:2505.14733, "The Energy Cost of Reasoning" (2025)
- **Erklaerung**: Reasoning-Modelle generieren ~2.5x mehr Output-Tokens (interner Denkprozess), was den Energieverbrauch direkt multipliziert

---

## Google Suche als Referenzwert

| Jahr | Schaetzung | Quelle |
|------|-----------|--------|
| 2009 | 0.3 Wh (0.0003 kWh) | Google offizieller Blogpost |
| ~2024 | ~0.04 Wh | Aktualisierte unabhaengige Schaetzungen |

- Der 0.3 Wh Wert ist von 2009 und VERALTET, wird aber ueberall noch zitiert
- Google-Rechenzentren sind seitdem deutlich effizienter geworden
- Fuer die Extension: **0.3 Wh beibehalten** als konservativer Wert (Worst Case)

---

## Wasser- und CO2-Verbrauch

### Wasser pro KI-Anfrage

| Dienst/Modell | Wasser | Quelle |
|--------------|--------|--------|
| Google Gemini (Text) | 0.26 mL | Google Paper (Aug 2025) |
| ChatGPT (GPT-3 Aera) | 16.9 mL | Li et al., UC Riverside |
| DeepSeek-R1 | >150 mL | Jegham et al. (2025) |
| Populaere Behauptung | ~519 mL ("1 Wasserflasche") | Oft zitiert, aber stark uebertrieben |

### CO2 pro kWh (Rechenzentren)

| Region | gCO2e/kWh | Quelle |
|--------|----------|--------|
| Globaler DC-Durchschnitt | 395.65 | IEA Emissions Factors 2024 |
| US-Rechenzentren | 548 | arXiv:2411.09786 |
| Deutschland (Strommix) | ~380 | IEA 2024 |
| Google DCs | ~0 (100% erneuerbar) | Google Nachhaltigkeitsbericht |

---

## Rechenzentrum-Effizienz (PUE)

| Typ | PUE | Bedeutung |
|-----|-----|-----------|
| Google/Hyperscale | 1.09 | Fuer 1 kWh Compute nur 0.09 kWh Overhead |
| Branchendurchschnitt | 1.56 | Fuer 1 kWh Compute 0.56 kWh Overhead |
| Aeltere Rechenzentren | 1.5–2.0 | Bis zu 100% Overhead |

---

## Empfohlene neue Werte fuer die Extension

### Standard-Modelle (typische Nutzung: ~300-500 Output Tokens)

| Dienst | whBase (neu) | whPerToken (neu) | Begruendung |
|--------|-------------|-----------------|-------------|
| ChatGPT (GPT-4o/mini) | 0.4 | 0.0010 | Altman 0.34 + Jegham 0.42 Wh, aufgerundet |
| Google Gemini | 0.25 | 0.0008 | Google gemessen: 0.24 Wh |
| Claude (Sonnet) | 0.85 | 0.0012 | Jegham: 0.84 Wh (kurz), hoechste Öko-Effizienz |
| Perplexity | 0.5 | 0.0010 | Mix aus Sonar + Drittanbieter-Modellen |
| Microsoft Copilot | 0.4 | 0.0010 | GPT-4o basiert |
| Google Suche | 0.3 | 0 | Konservativer Wert (2009), real evtl. 0.04 |
| DeepSeek (Chat) | 0.35 | 0.0008 | Effiziente MoE-Architektur, aehnlich GPT-4o |
| Grok | 0.5 | 0.0010 | Keine Messdaten, geschaetzt wie GPT-4o Klasse |
| Meta AI | 0.3 | 0.0008 | Llama 4, optimiert, Open Source |
| Poe | 0.5 | 0.0010 | Variiert je nach gewaehltem Modell |
| GitHub Copilot | 0.4 | 0.0010 | GPT-4.1 basiert |

### Reasoning-Modelle (wenn Modellerkennung implementiert)

| Modell-Typ | whBase | whPerToken | Begruendung |
|-----------|--------|-----------|-------------|
| o3 / o3-pro | 7.0 | 0.0050 | Jegham: 7.03 Wh (kurz), bis 39 Wh (lang) |
| DeepSeek Reasoner | 8.0 | 0.0060 | Jegham: 23.82 Wh (kurz), extrem energieintensiv |
| "Think Deeper" Modi | 5.0 | 0.0040 | Konservative Schaetzung fuer Reasoning-Modi |

---

## Zitierbare Aussagen fuer IHK-Praesentation

1. "Eine typische ChatGPT-Anfrage verbraucht ca. 0.3 Wh Strom."
   – Sam Altman (OpenAI CEO), Januar 2025; bestaetigt durch Epoch AI

2. "Googles Gemini verbraucht im Median 0.24 Wh pro Text-Prompt – die erste
   offiziell gemessene Zahl eines KI-Anbieters."
   – Google Paper, arXiv:2508.15734, August 2025

3. "Reasoning-Modelle wie o3 verbrauchen 7–39 Wh pro Anfrage – ueber 70x
   mehr als die effizientesten Modelle."
   – Jegham et al., arXiv:2505.09598, Mai 2025

4. "Chain-of-Thought Reasoning verbraucht durchschnittlich 30x mehr Energie."
   – arXiv:2505.14733, 2025

5. "Der globale Stromverbrauch von Rechenzentren betrug 2024 ca. 415 TWh
   und soll bis 2030 auf 945 TWh steigen."
   – IEA Energy and AI Report, 2025

6. "Goldman Sachs prognostiziert einen Anstieg der Rechenzentrum-Nachfrage
   um 165% bis 2030."
   – Goldman Sachs Research, 2024

---

## Quellenverzeichnis

1. Epoch AI (Feb 2025): "How much energy does ChatGPT use?"
   https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use

2. IEA (2025): "Energy and AI"
   https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai

3. Goldman Sachs (2024): "AI to drive 165% increase in data center power demand by 2030"
   https://www.goldmansachs.com/insights/articles/ai-to-drive-165-increase-in-data-center-power-demand-by-2030

4. Jegham et al. (Mai 2025): "How Hungry is AI?" (arXiv:2505.09598)
   https://arxiv.org/abs/2505.09598

5. Google (Aug 2025): "Measuring the environmental impact of AI at Google Scale" (arXiv:2508.15734)
   https://arxiv.org/abs/2508.15734

6. EPRI (2024): "Powering Intelligence" White Paper
   https://www.epri.com/research/products/3002028905

7. de Vries (Okt 2023): "The growing energy footprint of AI" (Joule)
   https://www.cell.com/joule/fulltext/S2542-4351(23)00365-3

8. Luccioni et al. (2024): "Power Hungry Processing" (ACM FAccT)
   https://arxiv.org/pdf/2311.16863

9. arXiv:2505.14733 (2025): "The Energy Cost of Reasoning"
   https://arxiv.org/abs/2505.14733

10. Patterson et al. (2021): "Carbon Emissions and Large Neural Network Training"
    https://arxiv.org/abs/2104.10350

11. Li et al., UC Riverside: Wasserverbrauch von KI-Systemen

12. arXiv:2411.09786 (2024): "Environmental Burden of US Data Centers"
    https://arxiv.org/html/2411.09786v1

---

## Status: ABGESCHLOSSEN
Die bisherigen Werte in der Extension (3.0 / 2.5 / 0.3 Wh) basierten auf
veralteten EPRI/de Vries Schaetzungen von 2023/2024. Aktuelle Messungen
(Altman, Google, Jegham 2025) zeigen deutlich niedrigere Werte fuer
Standard-Modelle, aber dramatisch hoehere fuer Reasoning-Modelle.

Naechster Schritt: background.js mit den neuen Werten aktualisieren.
