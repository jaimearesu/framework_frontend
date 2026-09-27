// js/core/config.js
// ---------------------------------------------------------------------
// WOHIN GEHEN DIE ANFRAGEN?  (Live oder Test)
//
// Der Frontend-Server sagt uns in /config.json zwei Adressen:
//   apiUrl      -> das normale Backend mit der ECHTEN Datenbank
//   testApiUrl  -> das Test-Backend mit der TEST-Datenbank
//                  (nur lokal, gestartet mit "npm run dev:test")
//
// Oben rechts im Cockpit schaltest du um. Die Wahl wird gemerkt.
// Login/Logout laufen IMMER über das Live-Backend (nur dort ist Auth0
// eingerichtet). Die Anmeldung gilt danach auch im Test-Modus.
// ---------------------------------------------------------------------
import { emit } from './events.js';
import { load, save } from './storage.js';

const config = { apiUrl: 'http://localhost:3000', testApiUrl: null };
let mode = 'live';

// Welcher Modus gilt beim Start? (reine Funktion -> automatisch getestet)
//   - "test" nur, wenn er gespeichert war UND es ein Test-Backend gibt
export const pickMode = (saved, hasTest) => (saved === 'test' && hasTest ? 'test' : 'live');

// Schrägstrich am Ende entfernen, damit "…/api" nie zu "…//api" wird
export const trimSlash = url => String(url || '').replace(/\/+$/, '');

export const loadConfig = async () => {
    try {
        const res = await fetch('/config.json');
        const data = await res.json();
        if (data.apiUrl) config.apiUrl = trimSlash(data.apiUrl);
        config.testApiUrl = data.testApiUrl ? trimSlash(data.testApiUrl) : null;
    } catch {
        // Ohne config.json: Standard (lokales Backend) benutzen
    }
    mode = pickMode(load('mode'), Boolean(config.testApiUrl));
    return { ...config, mode };
};

export const getMode = () => mode;
export const hasTestMode = () => Boolean(config.testApiUrl);
export const isTestMode = () => mode === 'test';

// Adresse des Backends, mit dem wir gerade arbeiten
export const apiBase = () => (mode === 'test' ? config.testApiUrl : config.apiUrl);

// Adresse des Live-Backends (für Login/Logout)
export const liveBase = () => config.apiUrl;
export const testBase = () => config.testApiUrl;

export const setMode = next => {
    const wanted = pickMode(next, hasTestMode());
    if (wanted === mode) return;
    mode = wanted;
    save('mode', mode);
    emit('mode', mode);
};
