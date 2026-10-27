// site/login.js
// ---------------------------------------------------------------------
// BAUSTEINE FÜR DAS LOGIN AUF WEBSITES (Plan "Login auf Websites", Etappe 3)
//
// Der Bauarbeiter merkt sich in zwei Cookies, wer angemeldet ist:
//
//   Ausweis   der Website-Ausweis vom Backend (at0s_…), 7 Tage.
//             Gilt nur für GENAU diese Website-Adresse.
//   Login     nur während der Anmeldung (10 Minuten): ein zufälliger
//             "Zustand" + wohin es danach zurückgeht. Der Zustand beweist
//             beim Zurückkommen, dass DIESER Browser die Anmeldung
//             gestartet hat (sonst könnte jemand dir sein eigenes Login
//             unterschieben).
//
// Beide Cookies sind:
//   HttpOnly   das JavaScript der Website kann sie NICHT lesen (kein Diebstahl
//              über fremden oder fehlerhaften Code auf der Website)
//   SameSite=Lax  werden von fremden Seiten nur bei normalen Links mitgeschickt,
//              nie bei Formularen oder fetch – SSF-Aufrufe prüfen zusätzlich die
//              Herkunft (siehe bauarbeiter.js)
//   __Host-    (nur auf dem Server, https): Der Browser erlaubt dieses Cookie
//              nur für genau diese Adresse – eine Nachbar-Website
//              (andere.at0mic.site) kann es weder setzen noch überschreiben.
//              Lokal (http) geht das nicht, dort heissen sie ohne Vorsilbe.
//
// Alles hier sind reine Funktionen (gut testbar).
// ---------------------------------------------------------------------
const crypto = require('crypto');

const LOGIN_SECONDS = 10 * 60; // so lange darf die Anmeldung bei vindelis dauern
const MAX_RETURN_PATH = 500;

// Namen der Cookies – mit __Host- nur, wo es https gibt
const cookieNames = isProduction => ({
    ausweis: isProduction ? '__Host-at0mic_ausweis' : 'at0mic_ausweis',
    login: isProduction ? '__Host-at0mic_login' : 'at0mic_login'
});

// Cookie-Header lesen: "a=1; b=2" -> { a: '1', b: '2' } (nur einfache Werte)
const parseCookies = header => {
    const out = {};
    for (const part of String(header || '').split(';')) {
        const index = part.indexOf('=');
        if (index < 1) continue;
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (name && !(name in out)) out[name] = value;
    }
    return out;
};

/**
 * Ein Cookie schreiben (Set-Cookie). maxAge in Sekunden; 0 = löschen.
 * Werte sind bei uns immer base64url (keine Sonderzeichen nötig).
 */
const serializeCookie = (name, value, { maxAge, isProduction }) =>
    [
        `${name}=${value}`,
        'Path=/',
        `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
        'HttpOnly',
        'SameSite=Lax',
        isProduction ? 'Secure' : null
    ]
        .filter(Boolean)
        .join('; ');

/**
 * Wohin nach dem Anmelden/Abmelden? Nur ein Pfad auf DIESER Website:
 * beginnt mit "/", nicht mit "//" (das wäre eine fremde Adresse), kein
 * Backslash, keine Steuerzeichen. Alles andere -> "/".
 * Verhindert, dass /_at0mic/login?zurueck=https://böse.example zur
 * "offenen Weiterleitung" wird.
 */
const safeReturnPath = value => {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_RETURN_PATH) return '/';
    if (
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.startsWith('/_at0mic/') ||
        value.startsWith('/_vindelis/')
    )
        return '/';
    if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
    return value;
};

// Zufälliger Zustand (32 Bytes, base64url – das Backend verlangt 32–128 Zeichen)
const newState = () => crypto.randomBytes(32).toString('base64url');

// Login-Cookie: "<zustand>.<rücksprung als base64url>"
const encodeLogin = (state, returnPath) => `${state}.${Buffer.from(returnPath, 'utf8').toString('base64url')}`;
const decodeLogin = value => {
    const [state, encoded, extra] = String(value || '').split('.');
    if (!state || encoded === undefined || extra !== undefined || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
    let returnPath;
    try {
        returnPath = Buffer.from(encoded, 'base64url').toString('utf8');
    } catch {
        return null;
    }
    return { state, returnPath: safeReturnPath(returnPath) };
};

// Zwei Zustände zeit-sicher vergleichen (dauert immer gleich lang)
const sameState = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const x = crypto.createHash('sha256').update(a).digest();
    const y = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(x, y) && a === b;
};

// Ein Ausweis sieht so aus: "at0s_" + 43 Zeichen (alles andere ignorieren wir)
const isTokenShape = value => typeof value === 'string' && /^at0s_[A-Za-z0-9_-]{43}$/.test(value);

/**
 * Die eigene Adresse der Website, z.B. "https://shop.at0mic.site".
 * Auf dem Server immer https (Cloudflare/Traefik davor), lokal wie angefragt.
 */
const ownOrigin = (req, isProduction) => {
    const host = String(req.headers.host || '').toLowerCase();
    return `${isProduction ? 'https' : req.protocol}://${host}`;
};

module.exports = {
    LOGIN_SECONDS,
    cookieNames,
    parseCookies,
    serializeCookie,
    safeReturnPath,
    newState,
    encodeLogin,
    decodeLogin,
    sameState,
    isTokenShape,
    ownOrigin
};
