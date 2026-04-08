require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Statische Dateien aus dem "public" Ordner ausliefern
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurations-Endpunkt für das Frontend
app.get('/config.json', (req, res) => {
    res.json({
        domain: process.env.AUTH0_DOMAIN,
        clientId: process.env.AUTH0_CLIENT_ID,
        audience: process.env.AUTH0_AUDIENCE,
        apiUrl: process.env.API_URL
    });
});

// Fallback für Single Page Applications (leitet alles andere auf index.html um)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend Express Server läuft auf Port ${PORT}`);
});