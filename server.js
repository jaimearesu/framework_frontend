// at0mic.ch/server.js (Frontend Server)
// ---------------------------------------------------------------------
// Zwei Aufgaben, unterschieden nach der Adresse:
//
// 1. KUNDEN-WEBSITES (shop.at0mic.site, lokal shop.site.localhost:3001):
//    Der "Bauarbeiter" (Ordner site/) holt den Bauplan vom Backend und
//    liefert die Website aus. Plan "Bauarbeiter + Bauplan-Format".
//
// 2. DAS COCKPIT (at0mic.ch, lokal localhost:3001): alles im Ordner "public".
//    Das Cockpit ist eine einzige Seite (index.html), die Bereiche wechseln
//    über die Adresse nach dem "#" (z.B. /#/objekte) – ohne Neuladen.
//
// Der Bauarbeiter steht ZUERST: Alles unter der Website-Domain beantwortet
// nur er – das Cockpit (mit Login) läuft nie auf der Domain mit fremdem Code.
// ---------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const path = require('path');
const { createBauarbeiter } = require('./site/bauarbeiter');
const { createLive } = require('./site/live');
const { pickApiUrl } = require('./site/host');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Die echte IP des Besuchers steht in X-Forwarded-For. Der Bauarbeiter gibt sie
// ans Backend weiter, damit pro Besucher gebremst wird.
// TRUST_PROXY_HOPS = wie viele Zwischenhalte davor stehen (gleich wie im Backend):
//   1 = nur Traefik (Standard, lokal)
//   2 = Cloudflare + Traefik (Server) – nur, wenn Traefik den Cloudflare-Adressen
//       vertraut. Nie mehr eintragen, als es wirklich gibt (sonst fälschbar).
const hops = parseInt(process.env.TRUST_PROXY_HOPS, 10);
app.set('trust proxy', Number.isInteger(hops) && hops >= 1 ? hops : 1);
// Nicht verraten, dass hier Express läuft
app.disable('x-powered-by');

// Backend-Adresse(n): API_URL darf mehrere haben (Umbenennung 27.10.2026), die erste ist
// die Hauptadresse. Das Cockpit bekommt die passende (pickApiUrl), alles andere die erste.
const API_URLS = (process.env.API_URL || 'http://localhost:3000')
    .split(',')
    .map(u => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);

// 1. Kunden-Websites
//    SITE_DOMAIN      Domain(s) der Websites, Komma-getrennt. Die ERSTE ist die Hauptadresse,
//                     die weiteren laufen weiter (Umbenennung 27.10.2026).
//                     Server: vindelis.site,at0mic.site – lokal: site.localhost
//    SITE_API_URL     Backend für die Baupläne (Standard: API_URL)
//    BAUARBEITER_KEY  gleicher Wert wie in der .env des Backends
const SITE_DOMAINS = (process.env.SITE_DOMAIN || (isProduction ? 'vindelis.site,at0mic.site' : 'site.localhost'))
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
// Adresse einer Website fürs Cockpit (Reiter "Website"): auf dem Server https ohne Port,
// lokal http mit dem Port dieses Servers – immer mit der Hauptadresse
const SITE_URL = isProduction ? `https://{name}.${SITE_DOMAINS[0]}` : `http://{name}.${SITE_DOMAINS[0]}:${PORT}`;
if (!process.env.BAUARBEITER_KEY) {
    console.warn('[BAUARBEITER] Kein BAUARBEITER_KEY gesetzt – alle Besucher teilen sich eine Bremse im Backend.');
}
const bauarbeiter = createBauarbeiter({
    apiUrl: process.env.SITE_API_URL || API_URLS[0],
    key: process.env.BAUARBEITER_KEY || null,
    siteDomain: SITE_DOMAINS,
    isProduction,
    // Login auf Websites: Hierhin schickt der Bauarbeiter den BROWSER des Besuchers
    // zum Anmelden – darum die öffentliche Adresse (API_URL), nicht SITE_API_URL
    loginUrl: API_URLS[0],
    // Eigene Domains (Plan "SSF-Ausbau", D2): Unter diesen Namen läuft das COCKPIT.
    // Jeder andere fremde Name ist vielleicht die eigene Domain eines Kunden
    // (www.meinladen.ch) – der Bauarbeiter fragt das Backend. IP-Adressen und
    // localhost gehen immer ans Cockpit. In der .env änderbar (Komma-getrennt).
    cockpitHosts: (process.env.COCKPIT_HOSTS || 'vindelis.com,www.vindelis.com,at0mic.ch,www.at0mic.ch')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean)
});
app.use(bauarbeiter);

// 1b. Live-Verbindungen der Websites (Plan "W"): WebSockets auf /_at0mic/live.
//     Sie laufen nicht durch Express, sondern über das "upgrade"-Ereignis des
//     Servers (unten). Die interne Leitung zum Backend startet sofort.
const live = createLive({
    apiUrl: process.env.SITE_API_URL || API_URLS[0],
    key: process.env.BAUARBEITER_KEY || null,
    resolveHost: bauarbeiter.resolveHost,
    isProduction,
    trustProxyHops: Number.isInteger(hops) && hops >= 1 ? hops : 1
});

// 2. Das Cockpit. Unter "/" steht seit dem Umstellen (Plan U, U6) das neue. Das alte bleibt
//    für die Werkstatt unter /alt. index: false, damit "/" nicht automatisch public/index.html
//    (das alte Cockpit) ausliefert.
const COCKPIT_NEU = path.join(__dirname, 'public', 'neu', 'index.html');
const COCKPIT_ALT = path.join(__dirname, 'public', 'index.html');
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Das Frontend braucht nur die Adressen vom Backend.
//   apiUrl      = das normale Backend (echte Datenbank)
//   testApiUrl  = das Test-Backend (npm run dev:test im Backend-Ordner,
//                 Test-Datenbank). Auf dem Server gibt es das nicht,
//                 darum ist es dort leer -> der Umschalter wird versteckt.
//   siteUrl     = Vorlage für die Adresse einer Website ("{name}" wird ersetzt)
app.get('/config.json', (req, res) => {
    res.json({
        // passend zur Adresse, unter der das Cockpit geöffnet wurde
        apiUrl: pickApiUrl(API_URLS, req.headers.host),
        testApiUrl: process.env.TEST_API_URL || (isProduction ? null : 'http://localhost:3100'),
        siteUrl: SITE_URL
    });
});

// Frühere Adresse der Daten-Seite -> neue Seite im Cockpit
app.get('/bigdata', (req, res) => {
    res.redirect('/alt/#/daten');
});

app.get('/alt', (req, res) => {
    res.sendFile(COCKPIT_ALT);
});

// «Gebaut mit vindelis» (10.11.2026): /beispiele/<name> ist eine eigene, offene Seite – ohne Cockpit.
// Unbekannte Namen zeigt die Seite selbst als «gibt es nicht» (Liste in public/neu/js/beispiele-werte.js).
const BEISPIEL_SEITE = path.join(__dirname, 'public', 'neu', 'beispiel.html');
app.get(/^\/beispiele\/[a-z0-9-]{1,60}\/?$/, (req, res) => {
    res.sendFile(BEISPIEL_SEITE);
});

// Öffentliche Profilseite (Plan "N", Stufe 2): vindelis.com/@name – offen für alle, ohne Cockpit.
// Ob es das Profil gibt und ob es eingeschaltet ist, fragt die Seite selbst beim Backend.
const PROFIL_SEITE = path.join(__dirname, 'public', 'neu', 'profil.html');
app.get(/^\/@[A-Za-z0-9-]{1,40}\/?$/, (req, res) => {
    res.sendFile(PROFIL_SEITE);
});

app.get('*', (req, res) => {
    res.sendFile(COCKPIT_NEU);
});

const server = app.listen(PORT, () => {
    console.log(`[FRONTEND] Server läuft auf Port ${PORT}`);
    live.start();
});
// Ein Browser will eine WebSocket-Verbindung: nur /_at0mic/live (oder /_vindelis/live) auf einer Website
server.on('upgrade', (req, socket, head) => {
    live.handleUpgrade(req, socket, head).catch(error => {
        console.error(`[LIVE] Fehler beim Verbinden: ${error.message}`);
        socket.destroy();
    });
});
