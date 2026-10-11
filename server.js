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

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Hinter Traefik: die echte IP des Besuchers steht in X-Forwarded-For (ein Proxy davor).
// Der Bauarbeiter gibt sie ans Backend weiter, damit pro Besucher gebremst wird.
app.set('trust proxy', 1);
// Nicht verraten, dass hier Express läuft
app.disable('x-powered-by');

// 1. Kunden-Websites
//    SITE_DOMAIN      Domain der Websites (Server: at0mic.site, lokal: site.localhost)
//    SITE_API_URL     Backend für die Baupläne (Standard: API_URL)
//    BAUARBEITER_KEY  gleicher Wert wie in der .env des Backends
if (!process.env.BAUARBEITER_KEY) {
    console.warn('[BAUARBEITER] Kein BAUARBEITER_KEY gesetzt – alle Besucher teilen sich eine Bremse im Backend.');
}
app.use(
    createBauarbeiter({
        apiUrl: process.env.SITE_API_URL || process.env.API_URL || 'http://localhost:3000',
        key: process.env.BAUARBEITER_KEY || null,
        siteDomain: process.env.SITE_DOMAIN || (isProduction ? 'at0mic.site' : 'site.localhost'),
        isProduction
    })
);

// 2. Das Cockpit
app.use(express.static(path.join(__dirname, 'public')));

// Das Frontend braucht nur die Adressen vom Backend.
//   apiUrl      = das normale Backend (echte Datenbank)
//   testApiUrl  = das Test-Backend (npm run dev:test im Backend-Ordner,
//                 Test-Datenbank). Auf dem Server gibt es das nicht,
//                 darum ist es dort leer -> der Umschalter wird versteckt.
app.get('/config.json', (req, res) => {
    res.json({
        apiUrl: process.env.API_URL || 'http://localhost:3000',
        testApiUrl: process.env.TEST_API_URL || (isProduction ? null : 'http://localhost:3100')
    });
});

// Frühere Adresse der Daten-Seite -> neue Seite im Cockpit
app.get('/bigdata', (req, res) => {
    res.redirect('/#/daten');
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[FRONTEND] Server läuft auf Port ${PORT}`);
});
