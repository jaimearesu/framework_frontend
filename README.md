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
└── legacy/               die alte Oberfläche (bis der Umbau fertig ist)
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

## Umbau (5 Etappen)

- [x] **1 Grundgerüst:** Design, Menü, API-Client, Login-Status, Übersicht, Test-Modus, Anfragen-Protokoll
- [x] **2 Objekte + Code & DNA:** Objekt-Baum, Details, Rollen, Kind anhängen (mit DNA-Eintrag), Pfad auflösen, Code-Editor (CodeMirror) mit Live-Vorschau, DNA-Prüfung mit Baum
- [x] **3 SSF-Studio:** Spielwiese per Klick, Editor, Ausführen (POST mit Body / GET mit Ziel / als Fremder), Ergebnis mit HTML-Vorschau und Fehler-Tipps, 9 Beispiele, Referenz aller 15 Werkzeuge, Grenzen
- [x] **4 Daten & Suche, Relationen, Rechte, Tresor:** 15 Such-Beispiele, Tabelle/JSON, Blättern, Löschen, Testdaten; Relationen mit Join-Erklärung; Triplets, Rollen vergeben/entziehen, „Was sieht ein Fremder?“; Tresor (Werte nie sichtbar, im Protokoll geschwärzt)
- [ ] **5 Systemcheck** ("Teste alles") und Feinschliff
