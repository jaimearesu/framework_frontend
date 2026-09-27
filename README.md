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
├── css/app.css           das ganze Design (Hell/Dunkel, Handy)
├── js/main.js            Startpunkt: Menü, Live/Test, Seiten wechseln
├── js/core/              Bausteine
│   ├── api.js            der einzige Weg zum Backend (liefert immer { ok, status, data, error, ms })
│   ├── config.js         Live/Test und Adressen
│   ├── session.js        "Wer bin ich, läuft der Server?"
│   ├── routes.js         alle Seiten an einem Ort
│   ├── ui.js             h() baut sichere HTML-Elemente, Karten, Hinweise, JSON-Anzeige
│   ├── requestLog.js     Anfragen-Protokoll (Symbol oben rechts)
│   └── format.js · icons.js · events.js · storage.js · page.js
├── js/pages/             eine Datei pro Seite
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
- [ ] **2 Objekte + Code & DNA**
- [ ] **3 SSF-Studio** mit Beispiel-Bibliothek und Werkzeug-Referenz
- [ ] **4 Daten & Suche, Relationen, Rechte, Tresor**
- [ ] **5 Systemcheck** ("Teste alles") und Feinschliff
