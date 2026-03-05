# Research #002e: Rechenbasis Perplexity, Copilot, Google Suche & Optionale Dienste

## Ziel
Rechenbasis fuer alle Dienste, die KEINE direkten Messwerte aus Jegham et al. haben.
Methode: Analogieschaetzung basierend auf bekannter Hardware und Modellarchitektur.

---

## 1. Google Suche (traditionell, ohne AI Overview)

### Verfuegbare Daten:

| Quelle | Wert | Jahr | Typ |
|--------|------|------|-----|
| Google offizieller Blogpost | 0.3 Wh (0.0003 kWh) | 2009 | Gemessen |
| Aktualisierte Schaetzungen | ~0.04 Wh | 2024 | Geschaetzt |
| Google (indirekt) | 0.2 gCO2e pro Suche | 2025 | Offiziell |

### Analyse:

Der Wert von 2009 (0.3 Wh) ist veraltet. Googles Rechenzentren sind seitdem
~7x effizienter geworden (PUE von ~1.2 auf 1.09, schnellere Hardware, bessere
Software). Der reale Wert liegt heute wahrscheinlich bei 0.04-0.1 Wh.

ABER: Google Suche liefert mittlerweile haeufig "AI Overviews" (KI-generierte
Zusammenfassungen oben in den Suchergebnissen). Diese verbrauchen deutlich mehr,
da sie Gemini im Hintergrund nutzen.

### Empfohlene Werte:

```javascript
// Klassische Google Suche (ohne AI Overview)
google: { whBase: 0.08, whPerToken: 0, label: "Google Suche" }
```

**Begruendung**:
- 0.3 Wh (2009) ÷ ~4 (Effizienzsteigerung) ≈ 0.08 Wh
- Konservativer als die niedrigste Schaetzung (0.04 Wh)
- Kein Token-Zuschlag, da Google-Suche keine variable Antwortlaenge hat
- Falls AI Overview aktiv: waere naeher an 0.24 Wh (Gemini-Niveau), aber das
  kann die Extension nicht unterscheiden

### Quellen:
- Google Blog (2009): 0.0003 kWh pro Suche
- MIT Technology Review (Aug 2025): Analyse der Google-Energiedaten
- Google (2025): 0.2 gCO2e pro Suche → bei ~380 gCO2/kWh ≈ 0.0005 kWh ≈ 0.5 Wh
  (ABER: Google nutzt viel Erneuerbare, also ist CO2 kein guter Proxy fuer Wh)

---

## 2. Perplexity

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell (Free) | Sonar (basiert auf Llama 3.3 70B) | Perplexity Blog (Feb 2025) |
| Modell (Pro) | GPT-4o, Claude, Gemini etc. (waehlbar) | Perplexity Help Center |
| Hardware | Cerebras CS-3 (Sonar) + NVIDIA A100 (AWS) | Perplexity/Cerebras |
| TPS | **1.200 TPS** (Sonar auf Cerebras!) | Cerebras Pressemitteilung |
| Besonderheit | Fuehrt zusaetzlich Web-Suche durch | - |

### Analyse:

Perplexity ist besonders, weil es:
1. Ein LLM fuer die Antwort nutzt (Sonar = Llama 70B)
2. PLUS eine Web-Suche durchfuehrt (mehrere Quellen laden und verarbeiten)
3. Die Quellen zusammenfasst und zitiert

Der Web-Suche-Overhead ist relevant: Perplexity ruft typischerweise 5-10
Webseiten ab, extrahiert relevante Passagen und fasst sie zusammen.

### Energieschaetzung:

**Sonar-Modell (Free-Tier):**
- Llama 70B auf Cerebras = extrem schnell (1.200 TPS)
- Cerebras-Chips sind ~3-5x energieeffizienter als GPUs bei Inference
- Geschaetzte Energie pro Token: deutlich niedriger als GPU-basierte Modelle

```
LLM-Anteil:   ~0.15 Wh (70B Modell, aber extrem schnelle Hardware)
Web-Suche:    ~0.05 Wh (5-10 HTTP-Requests + Extraktion)
Gesamt:       ~0.20 Wh pro Anfrage
```

**Pro-Tier (z.B. mit GPT-4o):**
- Nutzt GPT-4o/Claude/Gemini ueber API → deren Energieverbrauch + Web-Suche
- Geschaetzt: ~0.5-1.0 Wh (Modell-Energie + Web-Suche-Overhead)

### Empfohlene Werte:

```javascript
// Perplexity (Free/Sonar) - schnelle Cerebras-Hardware + Web-Suche
perplexity: { whBase: 0.10, whPerToken: 0.00050, label: "Perplexity" }
```

**Begruendung**:
- Basis 0.10 Wh: Web-Suche-Overhead + Infrastruktur
- 0.00050 Wh/Token: Llama 70B auf Cerebras ist effizienter als GPT-4o auf H100
- Bei 300 Output-Tokens: 0.10 + 0.00050 × 300 = 0.25 Wh (plausibel)
- Etwas hoeher als reine Google-Suche (0.08), niedriger als ChatGPT (0.44)

---

## 3. Microsoft Copilot

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell (Standard) | GPT-4o (via Azure OpenAI) | Microsoft |
| Modell (Think Deeper) | o3-Klasse Reasoning | Microsoft |
| Hardware | Azure-Rechenzentren, H100 GPUs | Microsoft |
| PUE | ~1.2 (Azure Durchschnitt) | Microsoft Sustainability Report |

### Analyse:

Copilot nutzt im Kern GPT-4o – also identische Energiekosten wie ChatGPT.
Der Unterschied: Copilot laeuft auf Azure-Infrastruktur (leicht hoeherer PUE
als OpenAIs eigene Cluster), und Copilot fuegt manchmal Bing-Suche hinzu.

### Empfohlene Werte:

```javascript
// Microsoft Copilot (Standard = GPT-4o auf Azure)
copilot: { whBase: 0.14, whPerToken: 0.00115, label: "Microsoft Copilot" }
```

**Begruendung**:
- Basiert auf ChatGPT-Werten (002b): whBase 0.12, whPerToken 0.00105
- +10% Aufschlag fuer Azure-PUE (1.2 vs. ~1.15 bei OpenAI) und Bing-Integration
- Bei 300 Output-Tokens: 0.14 + 0.00115 × 300 = 0.485 Wh
- "Think Deeper" Modus: REASONING_MULTIPLIER × 10 anwenden

---

## 4. DeepSeek Chat (Standard, NICHT R1-Reasoning)

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell | DeepSeek-V3.1 "Terminus" | DeepSeek |
| Architektur | MoE (671B gesamt, ~37B aktiv) | DeepSeek Paper |
| Hardware | NVIDIA H800 (China-Version des H100) | DeepSeek |
| Region | China (hoher Kohlestrom-Anteil) | - |

### Analyse:

DeepSeek-V3 (Chat-Modus, NICHT R1) ist ein MoE-Modell mit nur ~37B aktiven
Parametern – sehr effizient. Aber: Laeuft auf H800 in China mit hoeherem
CO2-Fussabdruck.

Jegham hat DeepSeek-V3 im Benchmark (nicht-Reasoning):

| Prompt | DeepSeek-V3 (Wh) | GPT-4o (Wh) |
|--------|------------------|-------------|
| Kurz | ~0.5-0.8 | 0.42 |
| Oeko-Effizienz | Niedrig (wegen China-Infrastruktur) | Mittel |

### Empfohlene Werte:

```javascript
// DeepSeek Chat (V3, Standard)
deepseek: { whBase: 0.10, whPerToken: 0.00090, label: "DeepSeek" }
```

**Begruendung**:
- MoE mit nur 37B aktiven Parametern → effizient pro Token
- H800 statt H100 → ~10% weniger Performance, ~10% mehr Energie/Token
- China-Infrastruktur: hoeherer PUE (~1.3-1.4)
- Bei 300 Tokens: 0.10 + 0.00090 × 300 = 0.37 Wh

---

## 5. Grok (xAI)

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell | Grok-3 / Grok-4 | xAI |
| Hardware | 100.000 H100 GPUs ("Colossus" Cluster, Memphis) | Diverse Berichte |
| Geschaetzte Groesse | ~300B Parameter (nicht offiziell) | SemiAnalysis |

### Analyse:

xAI hat wenig veroeffentlicht. Grok ist wahrscheinlich ein grosses Dense-Modell
auf H100-Infrastruktur. Aehnlich wie Claude (grosse Parameter, alle aktiv).

### Empfohlene Werte:

```javascript
// Grok (geschaetzt wie grosses Dense-Modell auf H100)
grok: { whBase: 0.12, whPerToken: 0.00150, label: "Grok" }
```

**Begruendung**:
- Analog zu Claude 3.5 Sonnet (0.421 Wh kurz) als Untergrenze
- Wahrscheinlich weniger optimiert als Anthropic → leicht hoeher
- Bei 300 Tokens: 0.12 + 0.00150 × 300 = 0.57 Wh

---

## 6. Meta AI (Llama 4)

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell | Llama 4 Scout/Maverick | Meta |
| Architektur | MoE (17B aktive Parameter, 16/128 Experts) | Meta Blog (Apr 2025) |
| Hardware | Meta eigene Rechenzentren, H100/A100 GPUs | Meta |
| TPS | Sehr schnell (kleine aktive Parameter) | - |

### Analyse:

Llama 4 nutzt MoE mit nur 17B aktiven Parametern – das ist extrem wenig
(weniger als GPT-4o mini). Daher sehr energieeffizient.

### Empfohlene Werte:

```javascript
// Meta AI (Llama 4, MoE mit 17B aktiven Parametern)
meta: { whBase: 0.06, whPerToken: 0.00040, label: "Meta AI" }
```

**Begruendung**:
- 17B aktive Parameter ≈ Groessenordnung GPT-4.1 nano (0.10 Wh bei Jegham)
- Meta-Rechenzentren: gute Effizienz (PUE ~1.1)
- Bei 300 Tokens: 0.06 + 0.00040 × 300 = 0.18 Wh
- Eines der energieeffizientesten Modelle

---

## 7. Poe (Quora)

### Analyse:

Poe ist eine Multi-Modell-Plattform – der Energieverbrauch haengt komplett
vom gewaehlten Bot/Modell ab. Da die Extension das Modell nicht erkennen kann,
verwenden wir einen Durchschnittswert.

### Empfohlene Werte:

```javascript
// Poe (Durchschnitt ueber verschiedene Modelle)
poe: { whBase: 0.10, whPerToken: 0.00100, label: "Poe" }
```

**Begruendung**:
- Durchschnitt zwischen Llama/Mistral (guenstig) und GPT-4o/Claude (teuer)
- Bei 300 Tokens: 0.10 + 0.00100 × 300 = 0.40 Wh

---

## 8. GitHub Copilot

### Infrastruktur:

| Parameter | Wert | Quelle |
|-----------|------|--------|
| Modell (Standard) | GPT-4.1 / Claude Sonnet 4.6 / Auto | GitHub Docs |
| Hardware | Azure (Microsoft) | GitHub/Microsoft |
| Besonderheit | Kontext = Code (oft laengere Inputs) | - |

### Analyse:

GitHub Copilot nutzt primär GPT-4.1 (Nachfolger von GPT-4o) im "Auto"-Modus.
Code-Anfragen haben oft laengere Kontexte (ganze Dateien als Input).

### Empfohlene Werte:

```javascript
// GitHub Copilot (GPT-4.1 auf Azure, Code-Kontext)
"github-copilot": { whBase: 0.15, whPerToken: 0.00110, label: "GitHub Copilot" }
```

**Begruendung**:
- Basiert auf GPT-4.1 (aehnlich GPT-4o, leicht optimierter)
- Etwas hoeher als ChatGPT wegen typischerweise laengerer Code-Kontexte
- Bei 300 Tokens: 0.15 + 0.00110 × 300 = 0.48 Wh

---

## Gesamtuebersicht: Alle empfohlenen Werte

### Kern-Dienste (immer aktiv):

| Dienst | whBase | whPerToken | Typisch (300 Tok.) | Quelle |
|--------|--------|-----------|-------------------|--------|
| ChatGPT | 0.12 | 0.00105 | 0.44 Wh | Jegham (gemessen) |
| Gemini | 0.05 | 0.00063 | 0.24 Wh | Google (gemessen) |
| Perplexity | 0.10 | 0.00050 | 0.25 Wh | Analogie (Cerebras) |

### Standard-Dienste (abwaehlbar):

| Dienst | whBase | whPerToken | Typisch (300 Tok.) | Quelle |
|--------|--------|-----------|-------------------|--------|
| Copilot | 0.14 | 0.00115 | 0.49 Wh | Analogie (GPT-4o+Azure) |
| Claude | 0.05 | 0.00209 | 0.68 Wh | Jegham (gemessen) |
| Google Suche | 0.08 | 0 | 0.08 Wh | Google 2009 + Korrektur |

### Optionale Dienste:

| Dienst | whBase | whPerToken | Typisch (300 Tok.) | Quelle |
|--------|--------|-----------|-------------------|--------|
| DeepSeek (Chat) | 0.10 | 0.00090 | 0.37 Wh | Analogie (MoE 37B) |
| Grok | 0.12 | 0.00150 | 0.57 Wh | Analogie (Dense ~300B) |
| Meta AI | 0.06 | 0.00040 | 0.18 Wh | Analogie (MoE 17B) |
| Poe | 0.10 | 0.00100 | 0.40 Wh | Durchschnitt Multi-Modell |
| GitHub Copilot | 0.15 | 0.00110 | 0.48 Wh | Analogie (GPT-4.1+Azure) |

### Vertrauensstufen:

| Stufe | Dienste | Methode |
|-------|---------|---------|
| **Hoch** (gemessen) | Gemini, ChatGPT, Claude | Jegham Benchmark / Google Paper |
| **Mittel** (Analogie) | Copilot, DeepSeek, GitHub Copilot | Basiert auf bekannter Hardware |
| **Niedrig** (Schaetzung) | Perplexity, Grok, Meta AI, Poe | Wenig oeffentliche Daten |

---

## Vergleich: Alt vs. Neu

| Dienst | ALTE Werte (Extension v3) | NEUE Werte | Aenderung |
|--------|--------------------------|-----------|-----------|
| ChatGPT | 3.00 + 0.0003/Tok | 0.12 + 0.00105/Tok | **~7x niedriger Basis** |
| Gemini | 2.50 + 0.00025/Tok | 0.05 + 0.00063/Tok | **~50x niedriger Basis** |
| Claude | 2.50 + 0.00025/Tok | 0.05 + 0.00209/Tok | **~50x niedriger Basis, 8x hoeher/Tok** |
| Copilot | 3.00 + 0.0003/Tok | 0.14 + 0.00115/Tok | **~21x niedriger Basis** |
| Google | 0.30 + 0/Tok | 0.08 + 0/Tok | **~4x niedriger** |
| DeepSeek | 2.50 + 0.00025/Tok | 0.10 + 0.00090/Tok | **~25x niedriger Basis** |
| Grok | 3.00 + 0.0003/Tok | 0.12 + 0.00150/Tok | **~25x niedriger Basis** |
| Meta AI | 2.50 + 0.00025/Tok | 0.06 + 0.00040/Tok | **~42x niedriger Basis** |
| Poe | 2.50 + 0.00025/Tok | 0.10 + 0.00100/Tok | **~25x niedriger Basis** |
| GitHub Copilot | 3.00 + 0.0003/Tok | 0.15 + 0.00110/Tok | **~20x niedriger Basis** |

**Die alten Werte waren dramatisch ueberhoeht!** Sie basierten auf EPRI/de Vries
(2023/2024) Schaetzungen, die inzwischen durch Messungen widerlegt wurden.

---

## Quellenverzeichnis

1. **Google Blog** (2009): Google-Suche verbraucht 0.0003 kWh
2. **Google** (Aug 2025): Gemini = 0.24 Wh, arXiv:2508.15734
3. **Jegham et al.** (Mai 2025): 30-Modell-Benchmark, arXiv:2505.09598
4. **Cerebras** (Feb 2025): Sonar auf CS-3, 1.200 TPS
   https://www.cerebras.ai/press-release/cerebras-powers-perplexity-sonar-with-industrys-fastest-ai-inference
5. **Perplexity Blog** (Feb 2025): "Meet New Sonar" – Llama 3.3 70B
   https://www.perplexity.ai/hub/blog/meet-new-sonar
6. **Meta** (Apr 2025): Llama 4 – 17B aktive Parameter, MoE
   https://ai.meta.com/blog/llama-4-multimodal-intelligence/
7. **MIT Technology Review** (Aug 2025): Google Gemini Energiedaten
   https://www.technologyreview.com/2025/08/21/1122288/google-gemini-ai-energy/
8. **Microsoft Azure**: PUE ~1.2, Sustainability Report
9. **GitHub Docs**: Supported AI Models in Copilot
   https://docs.github.com/en/copilot/reference/ai-models/supported-models

---

## Status: ABGESCHLOSSEN

Alle 11 Dienste haben jetzt eine dokumentierte Rechenbasis.
Naechster Schritt: Werte in background.js einbauen.
