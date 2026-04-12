// at0mic.ch/server.js (Frontend Server)
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));

// Das Frontend braucht nur noch die URL vom Backend!
app.get('/config.json', (req, res) => {
    res.json({
        apiUrl: process.env.API_URL || 'http://localhost:3000'
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[FRONTEND] Server läuft auf Port ${PORT}`);
});