<p align="center">
  <img src="Logo/AI Monitor Logo Chrome Store.png" alt="AI Energy Monitor Banner" width="100%">
</p>

<p align="center">
  <img src="Logo/AI Monitor - Logo 128px.png" alt="AI Energy Monitor Logo" width="80">
</p>

<h1 align="center">AI Energy Monitor</h1>

<p align="center">
  <strong>Track the energy consumption of your AI usage in watt-hours.</strong><br>
  A Chrome and Edge extension that monitors how much energy your AI interactions consume –<br>
  with real-time tracking, gamification, dashboards, and full data export. All data stays local.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.9.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-green" alt="Platform">
  <img src="https://img.shields.io/badge/data-100%25%20local-orange" alt="Privacy">
</p>

---

## The Problem

A single ChatGPT query uses about **10x more electricity** than a Google search. With AI usage growing rapidly across enterprises and everyday users, the energy impact is massive – yet completely invisible.

<p align="center">
  <img src="Logo/IEA Consumption Chart.png" alt="IEA Data Centre Energy Forecast 2020-2035" width="700">
  <br>
  <sub>Source: IEA – Global data centre electricity consumption forecast (2020–2035)</sub>
</p>

---

## Features

### Real-Time HUD
Every AI request shows a floating card with tokens in/out, energy in Wh, detected model name, and XP delta — with slide-in animation. Disappears automatically after a few seconds.

### Gamification
Earn XP for efficient prompts, lose XP for long outputs. Level up from *Welcome Newbie* to *Energiescout* across 10 levels. Unlock achievements and trophies for milestones and special actions.

### Personal Dashboard
Full-page dashboard with interactive weekly bar chart, per-day breakdowns, service comparison table, and period views (day / week / month / year). Export your data as CSV or JSON.

### Company Dashboard
Team-level energy tracking with configurable budgets, department profiles, company logo, and a race feature for friendly competition. Ideal for enterprise sustainability reporting.

### Token Saver
Optional ChatGPT mode that appends a brevity prompt to every message, reducing output tokens and improving your XP score automatically.

### Google Search Tracking
Tracks energy for both classic Google Search and Google AI Mode (udm=50). Includes a toggle to append `-ai` to searches, routing queries away from AI Overview.

### Smart Suggestions
Detects simple factual queries (what is, who is, capital of…) and suggests using Google Search instead — saving energy where AI isn't needed.

### Supported Platforms

| Always Active | Configurable | Optional |
|---|---|---|
| ChatGPT | Microsoft Copilot | DeepSeek |
| Google Gemini | Claude | Grok (xAI) |
| Perplexity | Google Search | Meta AI |
| | | Poe |
| | | GitHub Copilot |
| | | Mistral AI |

### Privacy First
- All data stored locally via File System Access API + `chrome.storage.local`
- No external servers, no tracking, no data leaves your device
- No chat content or prompts are ever recorded

---

## Installation

### Chrome / Edge Web Store
Search for **"AI Energy Monitor"** in the Chrome Web Store or Edge Add-ons.

### Manual Installation (Developer Mode)
1. Clone this repository
2. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `extension/` folder

---

## Build

```bash
# Create a Chrome Web Store ZIP
python build.py

# or
npm run build
```

Reads the version from `extension/manifest.json` and creates `AI Monitor v{version}.zip`.

---

## Research

The `docs/research/` folder contains the scientific basis for energy calculations:

- **Per-model energy estimates** (ChatGPT, Gemini, Claude, and more)
- **Reasoning model overhead** calculations
- **Three calibrated profiles**: Jegham (empirical), Altman (OpenAI estimate), Epoch (FLOP-based)

All estimates are based on published data from the IEA, Sam Altman's blog, and peer-reviewed research.

---

## Tech Stack

- **Chrome Extension** – Manifest V3, Service Worker, Content Scripts
- **Frontend** – Vanilla HTML/CSS/JS (no frameworks)
- **Storage** – File System Access API (OPFS) + `chrome.storage.local` buffer
- **Charts** – Canvas API
- **Tokenizer** – cl100k (ChatGPT exact), DOM estimation (others)
- **i18n** – Chrome built-in `chrome.i18n` (EN + DE)
- **Build** – Python script

---

## Privacy Policy

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

---

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License](https://creativecommons.org/licenses/by-nc-nd/4.0/).
