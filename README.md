# at0mic Cockpit (Frontend)

Das Cockpit für [at0mic](../framework): Hier siehst du alles Wichtige und kannst jede Funktion des Backends
ausprobieren – Objekte, Code, SSFs, Daten und Suche, Rechte, Tresor und einen Systemcheck.

## Starten

```bash
npm install
npm run dev        # http://localhost:3001
```

Das Backend muss laufen (`npm run dev` im Backend-Ordner). Für den **Test-Modus** zusätzlich im Backend-Ordner:

```bash
npm run dev:test   # zweites Backend auf Port 3100 mit der Test-Datenbank
```

Oben rechts im Cockpit schaltest du zwischen **Live** (echte Datenbank) und **Test** um.

## Einstellungen (`.env`)

| Variable       | Bedeutung                                                                                |
| -------------- | ---------------------------------------------------------------------------------------- |
| `PORT`         | Port des Frontends (Standard 3001)                                                       |
| `API_URL`      | Adresse des Backends (Standard `http://localhost:3000`, Server: `https://api.at0mic.ch`) |
| `TEST_API_URL` | Adresse des Test-Backends (lokal Standard `http://localhost:3100`, auf dem Server leer)  |

## Aufbau

```
server.js                 liefert public/ aus und /config.json (Adressen der Backends)
public/
├── index.html            das Gerüst: Menü links, Topbar, Inhalt
├── css/app.css           Grund-Design (Farben Hell/Dunkel, Gerüst, Bausteine)
├── css/pages.css         Formulare, Reiter und die einzelnen Seiten
├── js/main.js            Startpunkt: Menü, Live/Test, Seiten wechseln
├── js/core/              Bausteine
│   ├── api.js            der einzige Weg zum Backend (liefert immer { ok, status, data, error, ms })
│   ├── config.js         Live/Test und Adressen
│   ├── session.js        "Wer bin ich, läuft der Server?"
│   ├── routes.js         alle Seiten an einem Ort
│   ├── ui.js             h() baut sichere HTML-Elemente, Karten, Hinweise, JSON-Anzeige
│   ├── requestLog.js     Anfragen-Protokoll (Symbol oben rechts)
│   ├── objects.js        Objekt-Liste als Baum, Namen der Kinder, Code laden/speichern
│   ├── dna.js            DNA prüfen (wie das Backend) und Kinder einfügen
│   ├── tree.js           DNA-Baum anzeigen
│   ├── editor.js         Code-Editor (CodeMirror von cdnjs, sonst einfaches Textfeld)
│   └── format.js · icons.js · events.js · storage.js · page.js
├── js/pages/             eine Datei pro Seite
├── js/ssf/               SSF-Studio: Beispiele, Werkzeug-Referenz, Fehler-Tipps, Spielwiese
├── js/data/              Such-Beispiele (Query-DSL) und Testdaten
└── js/check/             Systemcheck: Prüf-Motor (runner.js) und alle Prüfungen (checks.js)
tests/                    automatische Tests der Hilfsfunktionen
```

**Sicherheit:** Texte vom Backend (z.B. Namen von Objekten) werden immer als reiner Text eingesetzt
(`h()` bzw. `textContent`), nie als HTML. So kann niemand über einen Namen Code einschleusen.

## Befehle

| Befehl           | Was er tut                           |
| ---------------- | ------------------------------------ |
| `npm run dev`    | Frontend mit nodemon starten         |
| `npm test`       | Tests der Hilfsfunktionen            |
| `npm run format` | alle Dateien einheitlich formatieren |

## Systemcheck

Unter **Systemcheck** (oder „Teste alles“ unten im Menü) prüft das Cockpit mit einem Klick das ganze
Backend: Verbindung, Objekte, Code, Daten & Suche, Joins, Rechte, SSFs, Tresor und Sicherheit als Fremder.
Dabei entsteht eine Domain `check-…` mit Test-Daten. Es gibt noch keine Route zum Löschen von Objekten,
darum läuft der Check standardmässig im **Test-Modus**; im Live-Modus muss man ihn ausdrücklich bestätigen.

## Umbau (5 Etappen, abgeschlossen)

- [x] **1 Grundgerüst:** Design, Menü, API-Client, Login-Status, Übersicht, Test-Modus, Anfragen-Protokoll
- [x] **2 Objekte + Code & DNA:** Objekt-Baum, Details, Rollen, Kind anhängen (mit DNA-Eintrag), Pfad auflösen, Code-Editor (CodeMirror) mit Live-Vorschau, DNA-Prüfung mit Baum
- [x] **3 SSF-Studio:** Spielwiese per Klick, Editor, Ausführen (POST mit Body / GET mit Ziel / als Fremder), Ergebnis mit HTML-Vorschau und Fehler-Tipps, 10 Beispiele (inkl. Verkaufsautomat), Referenz aller 17 Werkzeuge, Grenzen
- [x] **4 Daten & Suche, Relationen, Rechte, Tresor:** 15 Such-Beispiele, Tabelle/JSON, Blättern, Löschen, Testdaten; Relationen mit Join-Erklärung; Triplets, Rollen vergeben/entziehen, „Was sieht ein Fremder?“; Tresor (Werte nie sichtbar, im Protokoll geschwärzt)
- [x] **5 Systemcheck:** „Teste alles“ mit 69 Prüfungen in 11 Gruppen (inkl. Klonen & Zügeln, Sicherheit als Fremder und Löschen & Aufräumen am Schluss), Bericht zum Kopieren; Schnellstart auf der Übersicht; alte Oberfläche entfernt
- [x] **Klonen & Zügeln:** Reiter „Klonen & Zügeln“ auf der Objekt-Seite (Kopie als neue Domain mit Version und optional Daten; Zügeln in eine andere Familie mit Warnung und DNA-Eintrag), Herkunft in der Übersicht
- [x] **Löschen:** Reiter „Löschen“ auf der Objekt-Seite (nur ohne Kinder, Name abtippen + Rückfrage, bei Kindern auf Wunsch aus der DNA des Eltern-Objekts entfernen); der Systemcheck räumt am Schluss alles auf
- [x] **Gast-Hinweis:** Gäste sehen oben, dass ihre Objekte nur 24 Stunden bleiben (mit Link zum Einloggen im Live-Modus)
