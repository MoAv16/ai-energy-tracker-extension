# 003 – Wie funktionieren KI-Chats und was verbrauchen sie?

## Überblick

KI-Chatbots wie ChatGPT, Gemini oder Copilot sind aus dem Arbeitsalltag nicht mehr wegzudenken. Aber was passiert eigentlich hinter den Kulissen, wenn man eine Frage stellt? Und warum verbraucht das so viel Energie?

---

## 1. Webbasierte KI-Chats – So funktioniert's

### Was sind webbasierte KI-Chats?

Das sind die KI-Dienste, die man im Browser öffnet und direkt loschatten kann. Man stellt eine Frage, die KI antwortet – wie ein Gespräch mit einem sehr schlauen Gegenüber.

**Die bekanntesten Dienste:**
- **ChatGPT** (OpenAI) – der Platzhirsch, über 200 Millionen wöchentliche Nutzer weltweit
- **Google Gemini** – Googles Antwort auf ChatGPT, direkt in die Google-Suche integriert
- **Microsoft Copilot** – in Windows, Office und Bing eingebaut
- **Claude** (Anthropic) – bekannt für lange, durchdachte Antworten
- **Perplexity** – KI-Suche, die Quellen mitliefert

### Was passiert bei jeder Anfrage?

1. Der Nutzer tippt eine Frage ein (z.B. „Was ist Photosynthese?")
2. Der Text wird in sogenannte **Tokens** zerlegt – das ist die Sprache, die KI versteht
3. Die Tokens werden über das Internet an ein **Rechenzentrum** geschickt
4. Dort berechnet ein KI-Modell auf leistungsstarken **GPU-Servern** eine Antwort
5. Die Antwort wird als Tokens zurückgeschickt und im Browser angezeigt

**Wichtig zu verstehen:** Die KI „denkt" nicht auf dem eigenen Computer. Alles passiert in riesigen Rechenzentren – und genau dort entsteht der Energieverbrauch.

### Was sind Tokens?

Tokens sind die kleinste Einheit, in der KI Text verarbeitet. Sie sind weder Buchstaben noch ganze Wörter, sondern etwas dazwischen:

- „Hallo" = 1 Token
- „Energieverbrauch" = 3–4 Tokens
- „Wie viel Energie verbraucht ChatGPT?" = ca. 9 Tokens
- Eine durchschnittliche ChatGPT-Antwort hat ca. **300–800 Tokens**

Je mehr Tokens verarbeitet werden, desto mehr Rechenleistung wird benötigt – und desto mehr Energie wird verbraucht.

### Input-Tokens vs. Output-Tokens

| | Input-Tokens | Output-Tokens |
|--|-------------|---------------|
| **Was ist das?** | Die Frage des Nutzers | Die Antwort der KI |
| **Typische Menge** | 20–100 Tokens | 200–1.000 Tokens |
| **Energieverbrauch** | Geringer (wird nur eingelesen) | Höher (muss Wort für Wort berechnet werden) |

Die Antwort zu erzeugen kostet also **deutlich mehr Energie** als die Frage zu verarbeiten. Deshalb verbraucht eine ausführliche KI-Antwort mehr als eine kurze.

### Energieverbrauch pro Anfrage

| KI-Dienst | Geschätzter Verbrauch pro Anfrage | Vergleich |
|-----------|-----------------------------------|-----------|
| Google-Suche | ca. 0,3 Wh | Basislinie |
| ChatGPT | ca. 3,0 Wh | **10× mehr als Google** |
| Gemini | ca. 2,5 Wh | 8× mehr als Google |
| Claude | ca. 2,5 Wh | 8× mehr als Google |
| Copilot | ca. 3,0 Wh | 10× mehr als Google |

**Die zentrale Erkenntnis:** Eine einzige KI-Anfrage verbraucht ca. **10× mehr Energie** als eine Google-Suche. Das klingt zunächst wenig – aber es summiert sich schnell.

### Warum verbraucht KI so viel mehr als eine Google-Suche?

| | Google-Suche | KI-Chat |
|--|-------------|---------|
| **Was passiert** | Durchsucht einen Index (wie ein Inhaltsverzeichnis) | Berechnet jedes Wort der Antwort einzeln |
| **Hardware** | Normale Server | Spezialisierte GPU-Server (teuer, energiehungrig) |
| **Vergleich** | Wie in einem Buch nachschlagen | Wie einen neuen Text schreiben |
| **Dauer** | Millisekunden | Sekunden |

Eine Google-Suche **findet** etwas. Eine KI **erschafft** etwas. Das Erschaffen kostet mehr Energie.

---

## 2. Was passiert, wenn man länger chattet?

### Das Kontext-Problem

Viele Nutzer wissen nicht: Je länger ein Chat-Gespräch dauert, desto mehr Energie verbraucht **jede einzelne Nachricht**.

**Warum?** Bei jeder neuen Nachricht schickt der Browser den **gesamten bisherigen Gesprächsverlauf** erneut an den Server. Die KI muss alles nochmal lesen, um den Zusammenhang zu verstehen.

| Nachricht Nr. | Was an den Server geschickt wird | Geschätzte Tokens |
|---------------|----------------------------------|-------------------|
| 1 | Nur die erste Frage | ~50 |
| 5 | Fragen 1–5 + alle Antworten | ~3.000 |
| 10 | Fragen 1–10 + alle Antworten | ~8.000 |
| 20 | Fragen 1–20 + alle Antworten | ~20.000 |

**Das bedeutet:** Die 20. Nachricht in einem Chat verbraucht ungefähr **10× mehr Energie** als die erste Nachricht. Jedes Mal wird der gesamte Verlauf mitverarbeitet.

### Tipp für bewusste Nutzung

- Für einzelne Fragen: Neuen Chat starten (spart Kontext)
- Für zusammenhängende Themen: Im selben Chat bleiben (spart Wiederholung)
- Unnötige Nachfragen vermeiden: Lieber einen **präzisen Prompt** formulieren

---

## 3. Die Infrastruktur dahinter: Rechenzentren

### Was steckt hinter der Wolke?

Wenn man ChatGPT eine Frage stellt, passiert die Berechnung in riesigen Rechenzentren. Diese bestehen aus tausenden GPU-Servern – speziellen Computern, die für KI-Berechnungen optimiert sind.

### Energieverbrauch der Rechenzentren

- Ein einzelner **NVIDIA H100 GPU-Server** (Standard für KI) verbraucht ca. **700 Watt** – so viel wie 7 Desktop-PCs gleichzeitig
- Ein typisches KI-Rechenzentrum hat **tausende** solcher Server
- Der **weltweite Stromverbrauch** für KI-Rechenzentren wird auf **85–135 TWh pro Jahr** geschätzt (Stand 2025)
- Das entspricht dem **gesamten Stromverbrauch der Niederlande**

### Kühlwasser – der unsichtbare Verbrauch

KI-Server erzeugen enorme Wärme und müssen gekühlt werden. Dafür werden Millionen Liter Wasser benötigt:

- **Microsoft** meldete 2024 einen Anstieg des Wasserverbrauchs um **34%** – hauptsächlich durch KI
- **Google** meldete einen Anstieg um **20%**
- Ein einzelnes großes Rechenzentrum verbraucht so viel Wasser wie eine **Kleinstadt mit 50.000 Einwohnern**

KI verbraucht also nicht nur Strom, sondern auch **Wasser** – eine Ressource, die in vielen Regionen bereits knapp ist.

---

## 4. Training vs. Nutzung – Wo entsteht der Verbrauch?

### Zwei Phasen des Energieverbrauchs

| | Training | Nutzung (Inferenz) |
|--|----------|---------------------|
| **Was passiert** | Das Modell lernt aus Milliarden von Texten | Das Modell beantwortet Nutzeranfragen |
| **Häufigkeit** | Einmalig (dauert Wochen bis Monate) | Millionenfach, jeden Tag |
| **Energieverbrauch** | Extrem hoch einmalig (GPT-4: geschätzt 50–100 GWh) | Gering pro Anfrage, aber in Summe enorm |
| **Vergleich** | Wie ein Haus bauen | Wie jeden Tag das Licht anschalten |

### Warum die Nutzung das größere Problem ist

Das Training von GPT-4 hat geschätzt **50–100 GWh** gekostet – das ist viel. Aber es passiert einmal.

Die tägliche Nutzung durch **Millionen von Menschen** übersteigt diesen Wert inzwischen bei Weitem:
- 200 Millionen ChatGPT-Nutzer × 10 Anfragen/Tag × 3 Wh = **6 GWh pro Tag**
- Das sind **2.190 GWh pro Jahr** – allein für ChatGPT
- Das Training war also nur ein Bruchteil dessen, was die laufende Nutzung verbraucht

---

## 5. Webbasierte Chats vs. KI-Agenten: Kurzer Exkurs

Neben den bekannten Web-Chats gibt es eine neuere Kategorie: **KI-Agenten**. Diese sind vor allem für Softwareentwickler relevant und verbrauchen deutlich mehr Energie.

### Der Unterschied in einem Satz

- **Web-Chat:** Man stellt eine Frage, die KI antwortet. Fertig.
- **KI-Agent:** Man gibt einen Auftrag, die KI arbeitet selbstständig in mehreren Schritten – liest Dateien, schreibt Code, führt Befehle aus.

### Was man über den Energieverbrauch wissen muss

Ein KI-Agent (z.B. Claude Code, Cursor, GitHub Copilot) schickt nicht eine Anfrage an den Server, sondern **viele hintereinander**. Pro Arbeitsauftrag können das 10, 30 oder sogar 100+ Anfragen sein.

**Beispiel:** Ein Entwickler bittet den Agenten „Erstelle mir ein Dashboard mit Diagrammen":
- Der Agent liest bestehende Dateien (5 Anfragen)
- Der Agent plant die Umsetzung (1 Anfrage)
- Der Agent schreibt Code (3 Anfragen)
- Der Agent prüft auf Fehler (2 Anfragen)
- **Gesamt: ~11 Anfragen = ca. 30–50 Wh** für eine einzige Aufgabe

Zum Vergleich: Dieselbe Frage im Web-Chat („Wie erstelle ich ein Dashboard?") wäre **eine** Anfrage mit ca. 3 Wh.

### Warum das relevant ist

KI-Agenten sind noch eine Nische (primär Entwickler), aber der **Trend geht klar in Richtung Agenten**. In Zukunft werden auch Nicht-Entwickler KI-Agenten nutzen, die eigenständig Aufgaben erledigen – und damit wird der Energieverbrauch pro Nutzer weiter steigen.

---

## 6. Interessante Zahlen und Vergleiche für Präsentationen

### Alltagsvergleiche

| KI-Nutzung | Entspricht ungefähr ... |
|------------|------------------------|
| 1 ChatGPT-Anfrage (3 Wh) | Eine LED-Lampe 18 Minuten lang betreiben |
| 10 Anfragen pro Tag (30 Wh) | Ein Smartphone komplett aufladen |
| 100 Anfragen (300 Wh) | Eine Waschmaschine im Eco-Modus |
| 1 Woche intensiver Nutzung (1.500 Wh) | Ein Kühlschrank 2 Tage lang betreiben |

### Globale Perspektive

- **200 Millionen** ChatGPT-Nutzer weltweit (wöchentlich aktiv)
- Wenn jeder nur **10 Anfragen pro Tag** stellt: **6 GWh pro Tag** – der Tagesverbrauch einer Stadt mit 500.000 Einwohnern
- Der KI-Stromverbrauch weltweit wächst jährlich um geschätzt **30–40%**
- Bis 2030 könnte der Stromverbrauch von Rechenzentren laut IEA auf **über 1.000 TWh** steigen – das wäre mehr als der gesamte Stromverbrauch von Japan

### Überraschendes

- Eine KI-Anfrage verbraucht **10× mehr Energie** als eine Google-Suche – aber viele Fragen, die Nutzer an ChatGPT stellen, hätte eine Google-Suche genauso gut beantwortet
- **70% der ChatGPT-Anfragen** sind einfache Wissensfragen, die keine KI bräuchten (Quelle: Schätzungen verschiedener Studien)
- Jede KI-Antwort wird **Wort für Wort** berechnet – die KI hat die Antwort nicht „fertig im Kopf", sondern berechnet jedes nächste Wort auf Basis aller vorherigen

---

## 7. Zusammenfassung

1. **KI-Chats verbrauchen ca. 10× mehr Energie als eine Google-Suche** – weil sie Antworten berechnen statt nachschlagen.

2. **Je länger ein Gespräch, desto teurer jede Nachricht** – weil der gesamte Verlauf jedes Mal mitverarbeitet wird.

3. **Die Infrastruktur dahinter ist enorm** – tausende GPU-Server in Rechenzentren, die Strom und Kühlwasser verschlingen.

4. **Die tägliche Nutzung verbraucht mehr als das Training** – das Trainieren eines Modells ist einmalig teuer, aber Milliarden von Anfragen pro Tag kosten mehr.

5. **KI-Agenten verbrauchen nochmal deutlich mehr** – weil sie eigenständig in vielen Schritten arbeiten. Dieser Trend wird sich verstärken.

6. **Die wichtigste Frage vor jeder KI-Anfrage:** Brauche ich hier wirklich eine KI – oder reicht eine einfache Suche?
