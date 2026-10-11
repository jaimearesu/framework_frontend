// js/core/api.js
// ---------------------------------------------------------------------
// DER API-CLIENT – der einzige Weg, wie das Cockpit mit dem Backend redet.
//
// Jede Anfrage liefert IMMER ein Ergebnis-Objekt zurück (wirft nie):
//   {
//     ok:     true/false      – hat es geklappt? (Status 200–299)
//     status: 200, 403, …     – HTTP-Status (0 = Backend nicht erreichbar)
//     data:   { … }           – die Antwort des Backends (JSON)
//     error:  "…"             – verständliche Fehlermeldung (oder null)
//     ms:     42              – wie lange die Anfrage gedauert hat
//   }
// So muss keine Seite try/catch schreiben, und Fehler sehen überall gleich aus.
//
// Zusätzlich landet jede Anfrage im "Anfragen-Protokoll" (Symbol oben rechts).
//
// Besonderheit "anonymous: true": Die Anfrage geht OHNE Cookies raus –
// so, als wärst du ein fremder Besucher. Der Systemcheck prüft damit,
// dass Fremde wirklich nichts sehen.
//
// Besonderheit "bearer: 'at0_…'" (Plan "MCP"): Die Anfrage geht als KI raus –
// mit "Authorization: Bearer …" und OHNE Cookies. Der Systemcheck prüft
// damit, was eine KI darf und was nicht.
// ---------------------------------------------------------------------
import { apiBase, getMode } from './config.js';
import { emit } from './events.js';

// Verständliche Texte, falls das Backend keine eigene Meldung schickt
const STATUS_TEXT = {
    0: 'Backend nicht erreichbar. Läuft der Server?',
    400: 'Ungültige Eingabe.',
    401: 'Bitte zuerst einloggen.',
    403: 'Kein Zugriff.',
    404: 'Nicht gefunden.',
    409: 'Gibt es schon.',
    413: 'Anfrage ist zu gross.',
    422: 'Die Funktion ist mit einem Fehler abgebrochen.',
    429: 'Zu viele Anfragen – bitte kurz warten.',
    500: 'Interner Serverfehler.',
    503: 'Server ist gerade ausgelastet – bitte gleich nochmals versuchen.'
};

// Adresse zusammenbauen: Basis + Pfad + ?parameter (reine Funktion, getestet)
export const buildUrl = (base, path, query) => {
    let url = String(base || '').replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
    if (query) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        const qs = params.toString();
        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    return url;
};

// Einen Objekt-Pfad wie "shop/base/kunden" sicher in die Adresse einbauen:
// jedes Stück einzeln kodieren, die Schrägstriche bleiben (reine Funktion, getestet)
export const encodePath = path =>
    String(path || '')
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');

// Die beste Fehlermeldung aus einer Antwort holen (reine Funktion, getestet)
export const errorMessage = (data, status) => {
    let text = null;
    if (data && typeof data === 'object') {
        text = typeof data.error === 'string' ? data.error : data.error?.message || null;
        if (!text && typeof data.message === 'string' && status >= 400) text = data.message;
    } else if (typeof data === 'string' && data.trim() && data.length < 300) {
        text = data.trim();
    }
    text = text || STATUS_TEXT[status] || `Unerwartete Antwort (Status ${status}).`;
    // Bei 500ern schickt das Backend eine Fehler-ID – die hilft beim Suchen im Server-Log
    if (data?.errorId && !text.includes(data.errorId)) text += ` (Fehler-ID ${data.errorId})`;
    return text;
};

let counter = 0;

// Geheime Felder für das Protokoll schwärzen (reine Funktion, getestet).
// Beispiel: { value: 'abc' } -> { value: '***' }
export const maskSecrets = (body, fields = ['value', 'password', 'secret', 'token']) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const copy = { ...body };
    for (const f of fields) if (f in copy) copy[f] = '***';
    return copy;
};

// KI-Schlüssel in einer ANTWORT schwärzen (reine Funktion, getestet).
// Beim Erzeugen schickt das Backend den Schlüssel genau einmal mit:
//   { message, data: { token: 'at0_…', … } }  ->  { message, data: { token: '***', … } }
// So steht er nie im Anfragen-Protokoll – nur im Kasten auf der Seite.
export const maskResponse = data => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const copy = maskSecrets(data, ['token']);
    if (copy.data && typeof copy.data === 'object' && !Array.isArray(copy.data)) {
        copy.data = maskSecrets(copy.data, ['token']);
    }
    return copy;
};

// sensitive: true -> gesendeter Inhalt UND Schlüssel in der Antwort erscheinen im Protokoll nur geschwärzt
// bearer: 'at0_…' -> als KI anfragen (ohne Cookies)
export const request = async (
    method,
    path,
    { body, query, anonymous = false, base, sensitive = false, bearer = null } = {}
) => {
    const url = buildUrl(base ?? apiBase(), path, query);
    const hasBody = body !== undefined;
    const started = performance.now();
    const entry = {
        id: ++counter,
        at: new Date(),
        mode: getMode(),
        method,
        path: path + (url.includes('?') ? url.slice(url.indexOf('?')) : ''),
        url,
        anonymous: anonymous || Boolean(bearer),
        asAi: Boolean(bearer),
        requestBody: hasBody ? (sensitive ? maskSecrets(body) : body) : undefined
    };

    let result;
    try {
        const headers = hasBody ? { 'Content-Type': 'application/json' } : {};
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        const res = await fetch(url, {
            method,
            // 'include' = Cookies mitschicken (Login/Gast). 'omit' = als Fremder oder als KI.
            credentials: anonymous || bearer ? 'omit' : 'include',
            headers,
            body: hasBody ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = text; // keine JSON-Antwort (z.B. HTML) -> als Text behalten
            }
        }
        result = {
            ok: res.ok,
            status: res.status,
            data,
            error: res.ok ? null : errorMessage(data, res.status),
            retryAfter: res.headers.get('Retry-After'),
            ms: Math.round(performance.now() - started)
        };
    } catch {
        // fetch wirft nur, wenn gar keine Antwort kam (Server aus, CORS, Netzwerk)
        result = {
            ok: false,
            status: 0,
            data: null,
            error: STATUS_TEXT[0],
            ms: Math.round(performance.now() - started)
        };
    }

    // Ins Anfragen-Protokoll: bei "sensitive" mit geschwärzter Antwort
    emit('request', { ...entry, ...result, data: sensitive ? maskResponse(result.data) : result.data });
    return result;
};

// Kurzformen: api.get('/api/objects'), api.post('/api/objects', { domain: 'shop' }) …
export const api = {
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
    del: (path, options) => request('DELETE', path, options)
};
