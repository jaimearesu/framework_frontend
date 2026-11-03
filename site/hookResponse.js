// site/hookResponse.js
// ---------------------------------------------------------------------
// EIGENE ANTWORT EINES WEBHOOKS NOCHMALS PRÜFEN (Plan K, K4 – CRM-Test 03.11.2026)
//
// Eine SSF kann mit api.webhook.respond({ status, headers, body }) selbst bestimmen,
// was der fremde Server zurückbekommt (z.B. 404 für "Kontakt nicht gefunden"). Das
// Backend prüft das schon – der Bauarbeiter prüft es hier NOCHMALS, bevor er es
// ausliefert (zwei Schlösser: ein Fehler an einer Stelle reicht nicht für eine Lücke).
//
// Regeln (gleich wie im Backend, src/services/ssfApi/webhook.js):
//   - status 200–299 oder 400–599 (keine Umleitungen)
//   - content-type nur JSON oder Text (Entscheid E7: kein HTML)
//   - nur erlaubte Header, nie Set-Cookie und nie unsere Sicherheits-Header
//   - Werte eine Zeile, body höchstens 256 KB
// Stimmt etwas nicht, gibt cleanHookResponse null zurück – dann antwortet der
// Bauarbeiter mit 500 (wie bei einem Fehler in der SSF).
// ---------------------------------------------------------------------

const MAX_HEADERS = 20;
const MAX_HEADER_VALUE = 1000;
const MAX_BODY_BYTES = 256 * 1024;
const TYPES = ['application/json', 'application/problem+json', 'text/plain', 'text/csv'];
const ALLOWED = ['content-type', 'etag', 'last-modified', 'retry-after', 'link', 'content-language'];
const CUSTOM = /^x-[a-z0-9-]{1,40}$/;
const BLOCKED = [
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection',
    'x-powered-by',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
    'x-bauarbeiter-key',
    'x-besucher-ip'
];

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// Steuerzeichen (auch Zeilenumbrüche) könnten weitere Header einschmuggeln
const hasControlChars = text => [...text].some(c => c < ' ' || c === String.fromCharCode(127));

/**
 * @param {object} response  { status, headers, body } vom Backend
 * @returns {{ status: number, headers: object, body: string } | null}
 */
const cleanHookResponse = response => {
    if (!isPlainObject(response)) return null;
    const { status, headers, body } = response;
    const statusOk = Number.isInteger(status) && ((status >= 200 && status <= 299) || (status >= 400 && status <= 599));
    if (!statusOk || !isPlainObject(headers) || typeof body !== 'string') return null;
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return null;
    if ((status === 204 || status === 205) && body !== '') return null;

    const entries = Object.entries(headers);
    if (entries.length > MAX_HEADERS) return null;
    const out = {};
    for (const [name, value] of entries) {
        if (name !== name.toLowerCase() || BLOCKED.includes(name)) return null;
        if (!ALLOWED.includes(name) && !CUSTOM.test(name)) return null;
        if (typeof value !== 'string' || value.length > MAX_HEADER_VALUE || hasControlChars(value)) return null;
        out[name] = value;
    }
    const type = String(out['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    if (!TYPES.includes(type)) return null;
    return { status, headers: out, body };
};

module.exports = { cleanHookResponse };
