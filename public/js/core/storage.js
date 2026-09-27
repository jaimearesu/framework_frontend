// js/core/storage.js
// ---------------------------------------------------------------------
// Kleine Merkhilfe im Browser (localStorage) – nur für Bequemlichkeiten
// wie "Hell/Dunkel" oder "zuletzt Live/Test". Nie für wichtige Daten.
//
// Der Speicher kann fehlen (privates Fenster, blockierte Cookies).
// Dann tun wir einfach so, als wäre nichts gespeichert.
// ---------------------------------------------------------------------
const PREFIX = 'at0mic.';

export const load = (key, fallback = null) => {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
};

export const save = (key, value) => {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        /* ohne Speicher geht es auch */
    }
};
