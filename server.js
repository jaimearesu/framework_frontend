// at0mic.ch/server.js (Frontend Server)
// ---------------------------------------------------------------------
// Liefert das at0mic-Cockpit aus (alles im Ordner "public").
// Das Cockpit ist eine einzige Seite (index.html), die Bereiche wechseln
// über die Adresse nach dem "#" (z.B. /#/objekte) – ohne Neuladen.
// ---------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

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

// Die alte Oberfläche bleibt während des Umbaus unter /legacy/ erreichbar
app.get('/bigdata', (req, res) => {
    res.redirect('/legacy/bigdata.html');
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[FRONTEND] Server läuft auf Port ${PORT}`);
});
