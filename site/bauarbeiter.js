// site/bauarbeiter.js
// ---------------------------------------------------------------------
// DER BAUARBEITER (Plan "Bauarbeiter + Bauplan-Format", Etappe 3)
//
// Er beantwortet alle Anfragen an Kunden-Websites (shop.at0mic.site):
//
//   1. Adresse -> Name der Website              (host.js)
//   2. Bauplan holen – aus dem Zwischenspeicher  (cache.js)
//      oder vom Backend: GET /api/sites/<name>
//   3. Adresse -> Datei im Bauplan              (files.js)
//   4. Datei ausliefern (Markdown als HTML-Seite, pages.js)
//
// Was er NIE tut:
//   - Cookies setzen oder lesen, Login-Daten weitergeben
//   - Fehlermeldungen aus dem Code einer Website an Besucher zeigen (nur ins Log)
//   - etwas anderes als GET/HEAD annehmen (eine Website wird nur angesehen)
//
// Das Backend fragt er mit dem Bauarbeiter-Schlüssel und der IP des
// Besuchers – so bremst das Backend pro Besucher (Etappe 2). Rechte gibt
// der Schlüssel keine: Online ist nur, was öffentlich ist.
// ---------------------------------------------------------------------
const { siteNameFromHost } = require('./host');
const { resolveFile, contentTypeFor, extensionOf } = require('./files');
const { BauplanCache } = require('./cache');
const { MESSAGES, neutralPage, markdownPage, markdownTitle } = require('./pages');

const FETCH_TIMEOUT_MS = 8000;

// marked (Markdown -> HTML) gibt es nur als ES-Modul -> beim ersten Gebrauch laden
let markedPromise = null;
const defaultRenderMarkdown = async markdown => {
    if (!markedPromise) markedPromise = import('marked').then(m => m.marked);
    const marked = await markedPromise;
    return marked.parse(markdown, { gfm: true });
};

// Schutz-Header für JEDE Antwort des Bauarbeiters (Entscheidung G)
const setSecurityHeaders = (res, isProduction) => {
    res.set('X-Content-Type-Options', 'nosniff'); // Browser rät keine Inhaltstypen
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Nicht auf fremden Seiten einbetten (Klick-Fallen). Der Builder kommt später dazu.
    res.set('Content-Security-Policy', "frame-ancestors 'self'");
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction) res.set('Strict-Transport-Security', 'max-age=31536000');
};

// IP des Besuchers (hinter Traefik: aus X-Forwarded-For, dafür "trust proxy").
// "::ffff:1.2.3.4" ist dieselbe IPv4-Adresse – einheitlich schreiben.
const visitorIpOf = req => String(req.ip || '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '') || null;

/**
 * @param {object} options
 * @param {string} options.apiUrl       Adresse des Backends, z.B. "https://api.at0mic.ch"
 * @param {string} [options.key]        BAUARBEITER_KEY (ohne: alle Besucher teilen sich eine Bremse)
 * @param {string} options.siteDomain   z.B. "at0mic.site" (lokal "site.localhost")
 * @param {boolean} [options.isProduction]
 * @param {function} [options.fetchImpl]       nur für Tests
 * @param {BauplanCache} [options.cache]       nur für Tests
 * @param {function} [options.renderMarkdown]  nur für Tests
 * @param {object} [options.log]               console-ähnlich
 * @returns Express-Middleware: beantwortet Website-Anfragen, alles andere -> next()
 */
const createBauarbeiter = ({
    apiUrl,
    key = null,
    siteDomain,
    isProduction = false,
    fetchImpl = fetch,
    cache = new BauplanCache(),
    renderMarkdown = defaultRenderMarkdown,
    log = console
}) => {
    // Laufende Anfragen pro Website: Kommen 10 Besucher gleichzeitig, fragt
    // der Bauarbeiter das Backend trotzdem nur EINMAL.
    const inFlight = new Map();

    // Beim Backend fragen -> { kind: 'site', bauplan } | { kind: 'missing' } | { kind: 'error', page }
    const fetchFromBackend = async (name, visitorIp) => {
        const headers = { accept: 'application/json' };
        if (key) headers['x-bauarbeiter-key'] = key;
        if (key && visitorIp) headers['x-besucher-ip'] = visitorIp;

        let res;
        let body = null;
        try {
            res = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}`, {
                headers,
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            body = await res.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (${name}): ${error.message}`);
            return { kind: 'error', page: 'unavailable' };
        }

        if (res.ok && body && body.data && typeof body.data.files === 'object') {
            return { kind: 'site', bauplan: body.data };
        }
        if (res.status === 404) return { kind: 'missing' };
        if (res.status === 429) return { kind: 'error', page: 'tooMany', retryAfter: res.headers.get('retry-after') };
        if (res.status === 401)
            log.error('[BAUARBEITER] Der Bauarbeiter-Schlüssel ist falsch (BAUARBEITER_KEY prüfen).');
        if (res.status === 422) {
            // Fehler im Code der Website: nur ins Log, nie an den Besucher
            log.warn(`[BAUARBEITER] Website "${name}" lässt sich nicht bauen: ${body?.error} ${body?.details || ''}`);
            return { kind: 'error', page: 'siteError' };
        }
        return { kind: 'error', page: 'unavailable' };
    };

    // Bauplan holen: frisch aus dem Speicher, sonst vom Backend (mit Ersatz "alter Stand")
    const getBauplan = async (name, visitorIp) => {
        const entry = cache.get(name);
        if (cache.isFresh(entry)) return entry.kind === 'site' ? { kind: 'site', bauplan: entry.bauplan } : entry;

        if (!inFlight.has(name)) {
            inFlight.set(
                name,
                fetchFromBackend(name, visitorIp).finally(() => inFlight.delete(name))
            );
        }
        const result = await inFlight.get(name);

        if (result.kind === 'site') cache.setSite(name, result.bauplan);
        else if (result.kind === 'missing') cache.setMissing(name);
        else if (entry && entry.kind === 'site') {
            // Backend gerade weg oder Fehler: lieber der letzte gute Stand als eine Fehlerseite
            return { kind: 'site', bauplan: entry.bauplan, stale: true };
        }
        return result;
    };

    const sendPage = (res, kind, extra = {}) => {
        res.set('Cache-Control', 'no-store');
        if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
        if (kind === 'methodNotAllowed') res.set('Allow', 'GET, HEAD');
        res.status(MESSAGES[kind].status).type('html').send(neutralPage(kind));
    };

    // Eine Datei aus dem Bauplan ausliefern
    const sendFile = async (res, bauplan, path, status, siteName) => {
        let content = bauplan.files[path];
        if (extensionOf(path) === 'md') {
            const html = await renderMarkdown(content);
            content = markdownPage(html, {
                title: markdownTitle(content, siteName),
                hasStyle: Object.prototype.hasOwnProperty.call(bauplan.files, 'style.css')
            });
        }
        // Der Browser fragt jedes Mal kurz nach (ETag macht Express selbst):
        // Änderungen sind so sichtbar, sobald der Bauplan neu ist.
        res.set('Cache-Control', 'no-cache');
        res.status(status).type(contentTypeFor(path)).send(content);
    };

    return async (req, res, next) => {
        const host = siteNameFromHost(req.headers.host, siteDomain);
        if (!host.isSiteHost) return next(); // keine Website -> Cockpit

        try {
            setSecurityHeaders(res, isProduction);
            if (req.method !== 'GET' && req.method !== 'HEAD') return sendPage(res, 'methodNotAllowed');
            if (!host.name) return sendPage(res, 'noSite');

            const result = await getBauplan(host.name, visitorIpOf(req));
            if (result.kind === 'missing') return sendPage(res, 'noSite');
            if (result.kind === 'error') return sendPage(res, result.page, result);

            const { bauplan } = result;
            const path = resolveFile(req.path, bauplan.files);
            if (path) return await sendFile(res, bauplan, path, 200, host.name);

            // Nicht gefunden: die eigene 404-Seite der Website, sonst die neutrale
            if (Object.prototype.hasOwnProperty.call(bauplan.files, '404.html')) {
                return await sendFile(res, bauplan, '404.html', 404, host.name);
            }
            return sendPage(res, 'notFound');
        } catch (error) {
            log.error(`[BAUARBEITER] Unerwarteter Fehler (${host.name}): ${error.stack || error.message}`);
            if (!res.headersSent) sendPage(res, 'unavailable');
        }
    };
};

module.exports = { createBauarbeiter, setSecurityHeaders, visitorIpOf };
