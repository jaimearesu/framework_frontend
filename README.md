# vindelis Cockpit (Frontend)

> **Früher hiess vindelis «at0mic»** (umbenannt am 27.10.2026). Die alten Adressen laufen weiter: `at0mic.ch`, `api.at0mic.ch`, `*.at0mic.site`, `/_at0mic/…` und `at0mic.live` bedeuten dasselbe wie die vindelis-Namen.

Das Cockpit für [vindelis](../framework): Hier siehst du alles Wichtige und kannst jede Funktion des Backends
ausprobieren – Objekte, Code, SSFs, Daten und Suche, Rechte, Tresor, Agenten, KI-Zugänge und einen Systemcheck.

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

| Variable           | Bedeutung                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`             | Port des Frontends (Standard 3001)                                                                                                                                              |
| `API_URL`          | Adresse des Backends (Standard `http://localhost:3000`, Server: `https://api.vindelis.com,https://api.at0mic.ch` – Liste, erste = Hauptadresse; das Cockpit nimmt die passende) |
| `TEST_API_URL`     | Adresse des Test-Backends (lokal Standard `http://localhost:3100`, auf dem Server leer)                                                                                         |
| `BAUARBEITER_KEY`  | Gleicher Wert wie in der `.env` des Backends (Bremse pro Besucher, siehe unten)                                                                                                 |
| `SITE_DOMAIN`      | _optional_: Domain der Kunden-Websites (Liste, erste = Hauptadresse; Standard: Server `vindelis.site,at0mic.site`, lokal `site.localhost`)                                      |
| `SITE_API_URL`     | _optional_: Backend für die Baupläne (Standard: `API_URL`)                                                                                                                      |
| `TRUST_PROXY_HOPS` | _optional_: Zwischenhalte vor dem Server (Standard `1` = Traefik; Server mit Cloudflare: `2`) – gleich wie im Backend                                                           |

## Kunden-Websites (der "Bauarbeiter")

Alles unter der Website-Domain (`shop.vindelis.site`, lokal `shop.site.localhost:3001`) beantwortet der
**Bauarbeiter** im Ordner `site/` – nie das Cockpit. Er holt den Bauplan vom Backend (`GET /api/sites/shop`)
und liefert die Dateien aus. Plan in Notion: "Plan: Bauarbeiter + Bauplan-Format".

- **Adressen:** `/` → `index.html` (oder `index.md`) · `/blog/post` → `blog/post.html`, `.md` oder `blog/post/index.html`
  · Markdown wird als HTML-Seite ausgeliefert (mit dem `style.css` der Website) · fehlt etwas: die `404.html` der
  Website, sonst eine neutrale vindelis-Seite
- **Zwischenspeicher:** Ein Bauplan wird so lange behalten, wie er sagt (`cache`, Standard 60 s), höchstens 200
  Websites. Ist das Backend weg, liefert er den letzten guten Stand weiter aus. "Gibt es nicht" merkt er sich 10 s.
- **Echte Logik:** `POST /_vindelis/run/<pfad>` (JSON-Objekt, max. 64 KB) startet eine öffentliche SSF der eigenen
  Domain (Backend `POST /api/sites/<name>/run/<pfad>`). Antwort `{ result }`; Fehler im SSF-Code nur im Log
  (Besucher sehen 502).
- **Login auf Websites** (Plan „Login auf Websites“, Notion): Besucher melden sich mit ihrem vindelis-Konto auf
  **einer** Website an und sehen dann, was sie dürfen (öffentlich, „nur eingeloggte“, ihre Rollen).
    - `/_vindelis/login?zurueck=/pfad` → vindelis-Seite „Bei … anmelden?“ → `/_vindelis/callback` (Zustand prüfen, Code
      gegen Ausweis tauschen) → zurück. `/_vindelis/logout?zurueck=/pfad` (Link) bzw. `POST /_vindelis/logout`.
      `GET /_vindelis/me` → `{ angemeldet: false }` oder `{ angemeldet: true, uuid }` (nur die UUID).
    - Zwei eigene Cookies (`site/login.js`): Ausweis (7 Tage) und Login (10 Min.), immer `HttpOnly` +
      `SameSite=Lax`, auf dem Server `__Host-` + `Secure`. Das JavaScript der Website sieht den Ausweis nie.
    - Angemeldet: Ausweis geht als `X-Besucher-Ausweis` ans Backend, Antwort `private, no-store`, **nie** in den
      gemeinsamen Zwischenspeicher. Dafür ein **privater** Speicher pro Website und Ausweis (30 s, Schlüssel = Fingerabdruck des Ausweises, Abmelden löscht ihn); gleichzeitige Anfragen derselben Seite teilen sich eine Backend-Anfrage. Private Website: Seite „Diese Website ist privat – Anmelden“ (401), ohne Recht
      „Kein Zugriff – Abmelden“ (403).
    - `POST /_vindelis/run/…` und `POST /_vindelis/logout`: von einer fremden Seite (auch einer Nachbar-Website
      `*.vindelis.site`) → 403. Ohne Herkunft (kein Browser) läuft die SSF nur als Anonymer.
    - Im JavaScript der Website:
        ```js
        const ich = await (await fetch('/_vindelis/me')).json();
        if (!ich.angemeldet) location.href = '/_vindelis/login?zurueck=' + encodeURIComponent(location.pathname);
        ```
- **Sicherheit:** nur die zwei eigenen Login-Cookies, nur GET/HEAD (ausser `POST /_vindelis/run/…` und
  `/_vindelis/logout`), Schutz-Header (`nosniff`, `frame-ancestors 'self'` …), Fehler aus dem Code einer Website nur
  im Log. Ohne Anmeldung ist nur online, was im Backend öffentlich ist.
- **Lokal ausprobieren:** Browser schicken jede Adresse auf `.localhost` an den eigenen PC – also einfach
  `http://<domain>.site.localhost:3001` öffnen (die Domain muss öffentlich sein).

## Aufbau

```
server.js                 Kunden-Websites (site/) zuerst, sonst das Cockpit: public/ und /config.json
site/                     der Bauarbeiter: bauarbeiter.js (Ablauf), host.js (Adresse -> Name),
                          files.js (Adresse -> Datei), cache.js (Zwischenspeicher), pages.js (Fehler/Markdown),
                          login.js (Login auf Websites: Cookies, Rücksprung, Zustand)
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
Backend: Verbindung, Objekte, Code, Daten & Suche, Joins, Rechte, SSFs, Tresor, Sicherheit als Fremder, Sichtbarkeit und KI-Zugang.
Dabei entsteht eine Domain `check-…` mit Test-Daten. Es gibt noch keine Route zum Löschen von Objekten,
darum läuft der Check standardmässig im **Test-Modus**; im Live-Modus muss man ihn ausdrücklich bestätigen.

## Umbau (5 Etappen, abgeschlossen)

- [x] **1 Grundgerüst:** Design, Menü, API-Client, Login-Status, Übersicht, Test-Modus, Anfragen-Protokoll
- [x] **2 Objekte + Code & DNA:** Objekt-Baum, Details, Rollen, Kind anhängen (mit DNA-Eintrag), Pfad auflösen, Code-Editor (CodeMirror) mit Live-Vorschau, DNA-Prüfung mit Baum
- [x] **3 SSF-Studio:** Spielwiese per Klick, Editor, Ausführen (POST mit Body / GET mit Ziel / als Fremder), Ergebnis mit HTML-Vorschau und Fehler-Tipps, 11 Beispiele (inkl. Verkaufsautomat), Referenz aller 17 Werkzeuge, Grenzen
- [x] **4 Daten & Suche, Relationen, Rechte, Tresor:** 15 Such-Beispiele, Tabelle/JSON, Blättern, Löschen, Testdaten; Relationen mit Join-Erklärung; Triplets, Rollen vergeben/entziehen, „Was sieht ein Fremder?“; Tresor (Werte nie sichtbar, im Protokoll geschwärzt)
- [x] **KI-Zugänge** (Plan „MCP“, Etappe 3): Schlüssel erzeugen (Laufzeit 1 Stunde bis 1 Jahr, nur einmal sichtbar, im Anfragen-Protokoll geschwärzt), auflisten, widerrufen; Protokoll „was hat es getan / was ist daran passiert“; Systemcheck-Gruppe „KI-Zugang“ (5 Prüfungen, mit Login)
- [x] **Agenten** (Plan „Agenten im Griff“, 18.10.2026): eigene Seite mit allen Agenten – Schlüssel-Ampel, Werkzeugkästen dazu/weg, weitere Rechte (fremde nur als Zahl), Werkzeug-Statistik 7/30/180 Tage mit Fehlern nach Art, „Wer benutzt was?“, neuer Schlüssel, Not-Aus (alle Schlüssel widerrufen); der Assistent „Agent anlegen“ ist hierher gezogen; 2 Prüfungen im Systemcheck
- [x] **OAuth-Verbindungen** (Plan „OAuth für MCP“, Etappe 4, LIVE seit 18.10.2026 – claude.ai verbindet sich mit einem Klick): auf jeder Agenten-Karte „Verbindungen“ (z.B. claude.ai, seit/bis/zuletzt, **Trennen**, beendete mit Grund), Ampel zählt Verbindungen mit, Not-Aus sperrt Schlüssel **und** Verbindungen, Hinweis „so verbindest du claude.ai“ (nur wenn OAuth eingeschaltet ist); 2 neue Prüfungen im Systemcheck (105)
- [x] **Zugriff & Login auf Websites** (Plan „Login auf Websites“, Etappe 5): Reiter **„Zugriff“** auf der Objekt-Seite – wer hat Rechte auf die ganze Website, wer **nur auf diesen Teil** (Zusatz-Schloss), vergeben/entziehen, Zusatz-Schloss entfernen (`core/access.js`); Reiter „Website“ erklärt das Login; `api.visitor.can` in der SSF-Referenz; Protokoll-Texte `website.anmelden`/`schloss.entfernen`; Systemcheck: private Website = 401 statt 404, neue Prüfungen `members-part` und `site-login-bauarbeiter` (107)
- [x] **Einladungs-Links** (Plan „Login auf Websites“, Etappe 6): Karte „Einladungen“ im Reiter „Zugriff“ – sehen/ändern, ganze Website oder nur dieser Teil, gültig 1 Stunde bis 30 Tage, für 1–100 Personen; der Link wird nur einmal angezeigt; Liste mit Status und Widerrufen; Seite „Kein Zugriff“ zeigt die eigene vindelis-ID; Systemcheck-Prüfung `invitations` (108)
- [x] **5 Systemcheck:** „Teste alles“ mit 73 Prüfungen in 12 Gruppen (inkl. Klonen & Zügeln, Sicherheit als Fremder und Löschen & Aufräumen am Schluss), Bericht zum Kopieren; Schnellstart auf der Übersicht; alte Oberfläche entfernt
- [x] **Klonen & Zügeln:** Reiter „Klonen & Zügeln“ auf der Objekt-Seite (Kopie als neue Domain mit Version und optional Daten; Zügeln in eine andere Familie mit Warnung und DNA-Eintrag), Herkunft in der Übersicht
- [x] **Löschen:** Reiter „Löschen“ auf der Objekt-Seite (nur ohne Kinder, Name abtippen + Rückfrage, bei Kindern auf Wunsch aus der DNA des Eltern-Objekts entfernen); der Systemcheck räumt am Schluss alles auf
- [x] **Gast-Hinweis:** Gäste sehen oben, dass ihre Objekte nur 24 Stunden bleiben (mit Link zum Einloggen im Live-Modus)
- [x] **Websites** (Plan „Bauarbeiter + Bauplan-Format“, Etappe 3+4): der Bauarbeiter (`site/`) liefert `*.vindelis.site` aus; Reiter „Website“ auf der Objekt-Seite (Adresse, online oder nicht, welche Teile fehlen, Bauplan mit Dateien und JSON, bei SSF-Fehlern mit Details); Systemcheck-Gruppe „Website“ (4 Prüfungen, zwei davon mit Login) – jetzt 82 Prüfungen in 14 Gruppen
- [x] **MCP Etappe 5a** (Backend): neue Prüfungen für Fehlerstelle (Zeile/Spalte) und ECMAScript 2022, Rechte über `/members`, Website-Vorschau für den Besitzer und „KI-Domain gehört auch dir“ (mit Login) – jetzt 90 Prüfungen
- [x] **MCP Etappe 5b** (Backend): Prüfung „Speicher als Kind der App“ (SSF schreibt per UUID ohne Extra-Rechte, Pfad geht nicht) – jetzt 91 Prüfungen
- [x] **MCP Etappe 5c** (Backend: Werkzeuge als Objekte): Code-Seite kennt die Art „Werkzeug“ (Beschreibung als JSON); Systemcheck-Gruppe „Werkzeuge“ (6 Prüfungen: ungültige Beschreibung, finden, beschreiben, benutzen, falsche Eingabe, löschen) – jetzt 97 Prüfungen
- [x] **MCP Etappe 5d – Freigabe-Anfragen:** Karte „Wartet auf dich“ auf der Übersicht (nur sichtbar, wenn eine KI um Veröffentlichung bittet): gross, was genau passiert, klein die Begründung der KI; Freigeben (mit Rückfrage) oder Ablehnen mit Notiz. Protokoll-Namen für Werkzeuge und Freigaben. Systemcheck-Gruppe „Freigabe-Anfragen“ (3 Prüfungen) – jetzt 100 Prüfungen
