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
// Dazu: POST /_at0mic/run/<pfad> – damit ruft das JavaScript einer Website
// ihre eigene SSF auf (echte Logik: Formulare, Speicher, mehrere Benutzer).
//
// WEBHOOKS (Plan "SSF-Ausbau", Teil B): POST|PUT /_at0mic/hook/<pfad> – damit
// ruft ein fremder SERVER (Stripe, GitHub, ein ERP …) eine SSF der Website auf.
// Der Bauarbeiter reicht den ROHTEXT (für Unterschriften) und die Header des
// Anbieters weiter – nie Cookies, nie einen Ausweis.
//
// LOGIN AUF WEBSITES (Plan "Login auf Websites", Etappe 3):
//   GET  /_at0mic/login?zurueck=/pfad   Anmeldung starten (-> at0mic, "Bei … anmelden?")
//   GET  /_at0mic/callback?code&state   zurück von at0mic: Code gegen Ausweis tauschen
//   GET|POST /_at0mic/logout            abmelden
//   GET  /_at0mic/me                    { angemeldet, uuid? } – für das JavaScript der Website
//   GET  /_at0mic/datei/<pfad>[.endung] eine Datei der Website (Bild, PDF, Schrift …) aus
//                                       Cloudflare R2 (Plan "Dateien mit R2", D3), z.B.
//                                       <img src="/_at0mic/datei/bilder/logo.png">
//   GET  /_at0mic/vorschau?code         Screenshot mit Live-Daten (Plan "Screenshots", S2b):
//                                       Einmal-Code gegen einen 2-Minuten-Ausweis tauschen
// Ist jemand angemeldet, schickt der Bauarbeiter seinen Ausweis ans Backend
// mit – dann sieht er, was ER sehen darf. Solche Antworten landen NIE im
// gemeinsamen Zwischenspeicher. Einzelheiten zu den Cookies: login.js.
//
// Was er NIE tut:
//   - andere Cookies setzen oder lesen als seine zwei eigenen (Ausweis, Login)
//   - den Ausweis an das JavaScript der Website geben (HttpOnly)
//   - einen Ausweis bei SSF-Aufrufen von einer fremden Seite mitschicken (Herkunft)
//   - Fehlermeldungen aus dem Code einer Website an Besucher zeigen (nur ins Log)
//   - etwas anderes als GET/HEAD annehmen – ausser POST auf /_at0mic/run/… und /logout
//     sowie POST/PUT auf /_at0mic/hook/… und POST auf /_at0mic/upload/… (Plan "R2")
//
// Das Backend fragt er mit dem Bauarbeiter-Schlüssel und der IP des
// Besuchers – so bremst das Backend pro Besucher (Etappe 2). Rechte gibt
// der Schlüssel keine: Ohne Ausweis ist nur online, was öffentlich ist.
// ---------------------------------------------------------------------
const { classifyHost } = require('./host');
const { resolveFile, contentTypeFor, extensionOf } = require('./files');
const { BauplanCache } = require('./cache');
const { MESSAGES, neutralPage, markdownPage, markdownTitle } = require('./pages');
const login = require('./login');
const crypto = require('crypto');

const FETCH_TIMEOUT_MS = 8000;
// SSF-Aufrufe der Website (/_at0mic/run/…) dürfen länger dauern: Eine SSF kann auf
// eine lange Anfrage warten, z.B. an ein LLM (Plan "SSF-Ausbau", Teil A). Das Backend
// beendet jede SSF nach spätestens 90 s – wir warten etwas länger, damit seine
// Meldung noch ankommt. Mehr geht nicht: Cloudflare schneidet nach 100 s ab.
const RUN_TIMEOUT_MS = 95000;
// So lange behält der Bauarbeiter den Bauplan eines ANGEMELDETEN Besuchers (nur für ihn).
// Kurz, weil sich seine Rechte ändern können: Wird ihm ein Recht entzogen, sieht er
// den alten Stand höchstens noch so lange (Abmelden löscht ihn sofort).
const PERSONAL_SECONDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SSF der Website: /_at0mic/run/<pfad> – Pfad wie die identifier in der DNA
const RUN_ROUTE = /^\/_at0mic\/run\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)$/;
const MAX_RUN_BODY_BYTES = 64 * 1024; // Eingabe für die SSF: höchstens 64 KB
// Upload eines Besuchers (Plan "R2"): /_at0mic/upload/<pfad> – rohe Bytes, Pfad wie bei /run.
// Höchstens 10 MB (wie UPLOAD_MAX_BYTES im Backend; das Backend prüft nochmals genau).
const UPLOAD_ROUTE = /^\/_at0mic\/upload\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)$/;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_QUERY = 2048; // ?gericht=12… – mehr geht nicht an die SSF
const MAX_FILE_NAME_HEADER = 600; // X-File-Name (URI-kodiert) – Namen werden im Backend gekürzt

// Datei der Website: /_at0mic/datei/<pfad>[.endung] (Plan "Dateien mit R2", D3) –
// Pfad wie bei run, dazu freiwillig eine Endung (das Backend prüft, ob sie zur Datei passt)
// Plan "R2", R2b: auch ~<uuid> für Dateien in Sammlungen (Uploads von Besuchern, nicht in der DNA)
const FILE_ROUTE =
    /^\/_at0mic\/datei\/((?:~[0-9a-fA-F-]{36}|[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)(?:\.[A-Za-z0-9]{2,5})?)$/;
const FILE_TIMEOUT_MS = 20000; // bis 10 MB aus R2 über das Backend
// Diese Header des Backends gehen an den Browser (sonst nichts)
const FILE_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'content-security-policy'];

// Webhook: /_at0mic/hook/<pfad> (gleiche Pfad-Regeln wie bei run)
const HOOK_ROUTE = /^\/_at0mic\/hook\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)$/;
const HOOK_METHODS = ['POST', 'PUT'];
const MAX_HOOK_BODY_BYTES = 512 * 1024; // Rohtext: höchstens 512 KB (wie SYSTEM.webhooks im Backend)
// Diese Header gibt der Bauarbeiter NIE weiter (das Backend filtert zusätzlich)
const HOOK_DROP_HEADERS = ['cookie', 'host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'];

// Rohtext aus der Anfrage lesen – genau die Bytes, ohne etwas zu verändern (Fehler mit .status)
const readRawBody = (req, maxBytes) =>
    new Promise((resolve, reject) => {
        const fail = (status, message) => reject(Object.assign(new Error(message), { status }));
        let size = 0;
        let chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes)
                chunks = []; // zu gross: den Rest still wegwerfen
            else chunks.push(chunk);
        });
        req.on('end', () => {
            if (size > maxBytes) return fail(413, `Zu gross (max. ${Math.round(maxBytes / 1024)} KB).`);
            resolve(Buffer.concat(chunks));
        });
        req.on('error', () => fail(400, 'Anfrage abgebrochen.'));
    });

// JSON aus der Anfrage lesen – mit Grössen-Grenze (Fehler mit .status)
const readJsonBody = (req, maxBytes) =>
    new Promise((resolve, reject) => {
        const fail = (status, message) => reject(Object.assign(new Error(message), { status }));
        let size = 0;
        let chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            // Zu gross: den Rest still wegwerfen (nicht speichern), am Ende sauber 413 antworten
            if (size > maxBytes) chunks = [];
            else chunks.push(chunk);
        });
        req.on('end', () => {
            if (size > maxBytes) return fail(413, `Zu gross (max. ${Math.round(maxBytes / 1024)} KB).`);
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text.trim()) return resolve({});
            try {
                const value = JSON.parse(text);
                if (!value || typeof value !== 'object' || Array.isArray(value)) {
                    return fail(400, 'Die Eingabe muss ein JSON-Objekt sein.');
                }
                resolve(value);
            } catch {
                fail(400, 'Ungültiges JSON.');
            }
        });
        req.on('error', () => fail(400, 'Anfrage abgebrochen.'));
    });

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
 * @param {string} [options.loginUrl]   ÖFFENTLICHE Adresse des Backends für die Anmeldung
 *                                      (der Browser des Besuchers geht dorthin), z.B.
 *                                      "https://api.at0mic.ch". Ohne: Anmelden geht nicht.
 * @param {string[]|null} [options.cockpitHosts]  EIGENE DOMAINS (Plan "SSF-Ausbau", D2):
 *                                      Namen, unter denen das Cockpit läuft (z.B. at0mic.ch).
 *                                      Alle anderen fremden Namen sind mögliche eigene Domains
 *                                      von Kunden. null = aus (fremde Namen -> Cockpit, wie bisher).
 * @returns Express-Middleware: beantwortet Website-Anfragen, alles andere -> next()
 */
const createBauarbeiter = ({
    apiUrl,
    key = null,
    siteDomain,
    isProduction = false,
    fetchImpl = fetch,
    cache = new BauplanCache(),
    // Privater Speicher für angemeldete Besucher (eigener Speicher, nie mit "cache" gemischt)
    personalCache = new BauplanCache({ maxEntries: 1000 }),
    renderMarkdown = defaultRenderMarkdown,
    log = console,
    loginUrl = null,
    cockpitHosts = null
}) => {
    // Laufende Anfragen pro Website: Kommen 10 Besucher gleichzeitig, fragt
    // der Bauarbeiter das Backend trotzdem nur EINMAL. (Nur für Anonyme –
    // ein angemeldeter Besucher bekommt immer seine eigene Anfrage.)
    const inFlight = new Map();
    // Dasselbe für angemeldete Besucher – getrennt pro Website UND Ausweis
    const personalInFlight = new Map();
    // Schlüssel des privaten Speichers: Website + Fingerabdruck des Ausweises
    // (der Ausweis selbst liegt so nie als Klartext im Arbeitsspeicher-Index)
    const personalKey = (name, token) => `${name}|${crypto.createHash('sha256').update(token).digest('hex')}`;
    const cookies = login.cookieNames(isProduction);

    // ---------------------------------------------------------------------
    // EIGENE DOMAINS (Plan "SSF-Ausbau", D2): Zu welcher Website gehört
    // www.meinladen.ch? Das Backend weiss es (nur AKTIVE Domains). Die Antwort
    // merken wir uns kurz – gefunden 60 s, nicht gefunden 30 s –, damit nicht
    // jede Datei einer Seite nochmals fragt.
    // Rückgabe: Name der Website, null (keine) oder undefined (Backend weg)
    // ---------------------------------------------------------------------
    const HOST_FOUND_MS = 60 * 1000;
    const HOST_MISSING_MS = 30 * 1000;
    const HOST_CACHE_MAX = 5000;
    const SITE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    const hostCache = new Map(); // hostname -> { name | null, until }
    const lookupCustomHost = async hostname => {
        const hit = hostCache.get(hostname);
        if (hit && hit.until > Date.now()) return hit.name;
        let name = null;
        try {
            const res = await fetchImpl(`${apiUrl}/api/sites/_host/${encodeURIComponent(hostname)}`, {
                headers: backendHeaders(null, null),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            if (res.ok) {
                const body = await res.json().catch(() => null);
                const candidate = body && body.data && body.data.name;
                name = typeof candidate === 'string' && SITE_NAME.test(candidate) ? candidate : null;
            } else if (res.status !== 404) {
                // Backend weg oder Schlüssel falsch: nicht merken, beim nächsten Mal nochmals fragen
                log.warn(`[BAUARBEITER] Eigene Domain ${hostname}: Backend antwortet ${res.status}`);
                return undefined;
            }
        } catch (error) {
            log.warn(`[BAUARBEITER] Eigene Domain ${hostname}: Backend nicht erreichbar (${error.message})`);
            return undefined;
        }
        if (hostCache.size >= HOST_CACHE_MAX) hostCache.clear(); // einfach und sicher: ganz leeren
        hostCache.set(hostname, { name, until: Date.now() + (name ? HOST_FOUND_MS : HOST_MISSING_MS) });
        return name;
    };

    // Kopfzeilen für jede Anfrage ans Backend: Schlüssel, Besucher-IP und –
    // falls angemeldet – der Ausweis (zählt im Backend nur mit gültigem Schlüssel)
    const backendHeaders = (visitorIp, token, extra = {}) => {
        const headers = { accept: 'application/json', ...extra };
        if (key) headers['x-bauarbeiter-key'] = key;
        if (key && visitorIp) headers['x-besucher-ip'] = visitorIp;
        if (key && token) headers['x-besucher-ausweis'] = token;
        return headers;
    };

    // Sagt das Backend "dieser Ausweis gilt nicht (mehr)"?
    const tokenRejected = res => res && res.headers && res.headers.get('x-besucher-ausweis-status') === 'ungueltig';

    // Beim Backend fragen -> { kind: 'site', bauplan, personal } | { kind: 'missing' }
    //                      | { kind: 'error', page } – jeweils mit tokenInvalid (true/false)
    const fetchFromBackend = async (name, visitorIp, token = null) => {
        let res;
        let body = null;
        try {
            res = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}`, {
                headers: backendHeaders(visitorIp, token),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            body = await res.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (${name}): ${error.message}`);
            return { kind: 'error', page: 'unavailable' };
        }
        const tokenInvalid = tokenRejected(res);

        if (res.ok && body && body.data && typeof body.data.files === 'object') {
            // customDomain (Plan "SSF-Ausbau", D2): aktive eigene Domain -> Umleitung, siehe unten
            const customDomain =
                body.meta && typeof body.meta.customDomain === 'string' ? body.meta.customDomain : null;
            return {
                kind: 'site',
                bauplan: { ...body.data, customDomain },
                personal: !!(body.meta && body.meta.personal),
                tokenInvalid
            };
        }
        if (res.status === 404) return { kind: 'missing', tokenInvalid };
        // Login auf Websites: privat (bitte anmelden) bzw. angemeldet ohne Recht
        if (res.status === 401 && body && body.code === 'SITE_LOGIN_REQUIRED') {
            return { kind: 'error', page: 'loginRequired', closed: true, tokenInvalid };
        }
        if (res.status === 403 && body && body.code === 'SITE_NO_ACCESS') {
            // Seine EIGENE at0mic-ID (nur wenn sie wie eine UUID aussieht) – zum Weiterschicken
            const visitorId = typeof body.besucher === 'string' && UUID.test(body.besucher) ? body.besucher : null;
            return { kind: 'error', page: 'noAccess', closed: true, tokenInvalid, visitorId };
        }
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
    // token = Ausweis eines angemeldeten Besuchers -> immer direkt vom Backend,
    // NIE aus dem oder in den gemeinsamen Speicher (sonst sähen andere seine Seite)
    const getBauplan = async (name, visitorIp, token = null) => {
        if (token) {
            // PRIVATER Zwischenspeicher (gefunden am 20.10.: vorher wurde für JEDE Datei
            // einer Seite – index.html, style.css, js/1.js … – die ganze Website neu
            // gebaut, also z.B. 7× pro Seitenaufruf). Jetzt: höchstens alle
            // PERSONAL_SECONDS einmal pro Website UND Ausweis. Der Schlüssel enthält nur
            // einen Fingerabdruck des Ausweises – nie den Ausweis selbst.
            const pKey = personalKey(name, token);
            const entry = personalCache.get(pKey);
            if (personalCache.isFresh(entry)) return { kind: 'site', bauplan: entry.bauplan, personal: true };

            // Der Browser lädt die Dateien einer Seite GLEICHZEITIG: Auch diese
            // Anfragen teilen sich eine einzige Anfrage ans Backend.
            if (!personalInFlight.has(pKey)) {
                personalInFlight.set(
                    pKey,
                    fetchFromBackend(name, visitorIp, token).finally(() => personalInFlight.delete(pKey))
                );
            }
            const result = await personalInFlight.get(pKey);
            if (result.kind === 'site' && result.personal) {
                // Höchstens PERSONAL_SECONDS – und nie länger, als der Bauplan selbst will
                const seconds = Math.min(
                    PERSONAL_SECONDS,
                    Number.isInteger(result.bauplan.cache) ? result.bauplan.cache : PERSONAL_SECONDS
                );
                personalCache.setSite(pKey, { ...result.bauplan, cache: seconds });
            } else if (result.kind === 'site') {
                // Der Ausweis galt nicht: Die Antwort ist die eines Anonymen. Ist sie
                // wirklich öffentlich (nicht persönlich), darf sie in den gemeinsamen Speicher.
                cache.setSite(name, result.bauplan);
            }
            return result;
        }

        const entry = cache.get(name);
        if (cache.isFresh(entry)) return entry.kind === 'site' ? { kind: 'site', bauplan: entry.bauplan } : entry;

        if (!inFlight.has(name)) {
            inFlight.set(
                name,
                fetchFromBackend(name, visitorIp).finally(() => inFlight.delete(name))
            );
        }
        const result = await inFlight.get(name);

        if (result.kind === 'site' && !result.personal) cache.setSite(name, result.bauplan);
        else if (result.kind === 'missing') cache.setMissing(name);
        else if (result.closed) {
            // Website ist (jetzt) privat: den alten öffentlichen Stand sofort vergessen
            cache.delete(name);
        } else if (entry && entry.kind === 'site') {
            // Backend gerade weg oder Fehler: lieber der letzte gute Stand als eine Fehlerseite
            return { kind: 'site', bauplan: entry.bauplan, stale: true };
        }
        return result;
    };

    // Knöpfe auf den Seiten "privat" und "kein Zugriff" (zurück = dieselbe Seite)
    const loginActions = (kind, returnPath) => {
        const back = encodeURIComponent(login.safeReturnPath(returnPath));
        if (kind === 'loginRequired') {
            return [{ href: `/_at0mic/login?zurueck=${back}`, label: 'Anmelden', primary: true }];
        }
        if (kind === 'noAccess') {
            // Abmelden – z.B. um sich mit einem anderen Konto anzumelden
            return [{ href: `/_at0mic/logout?zurueck=${back}`, label: 'Abmelden' }];
        }
        return [];
    };

    const sendPage = (res, kind, extra = {}) => {
        res.set('Cache-Control', 'no-store');
        if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
        if (kind === 'methodNotAllowed') res.set('Allow', 'GET, HEAD');
        // "Kein Zugriff": die eigene at0mic-ID zeigen (Etappe 6, Entscheidung H)
        const note = kind === 'noAccess' && extra.visitorId ? `Deine at0mic-ID: ${extra.visitorId}` : null;
        res.status(MESSAGES[kind].status)
            .type('html')
            .send(neutralPage(kind, { actions: loginActions(kind, extra.returnPath), note }));
    };

    // Ausweis-Cookie setzen bzw. löschen
    const setTokenCookie = (res, token, maxAge) =>
        res.append('Set-Cookie', login.serializeCookie(cookies.ausweis, token, { maxAge, isProduction }));
    const clearTokenCookie = res => setTokenCookie(res, '', 0);

    // Eine Datei aus dem Bauplan ausliefern
    // personal = für einen angemeldeten Besucher gebaut -> nirgends speichern
    const sendFile = async (res, bauplan, path, status, siteName, personal = false) => {
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
        // Persönliche Seiten: weder Browser noch Cloudflare dürfen sie speichern.
        res.set('Cache-Control', personal ? 'private, no-store' : 'no-cache');
        res.status(status).type(contentTypeFor(path)).send(content);
    };

    // ---------------------------------------------------------------------
    // LOGIN AUF WEBSITES (Plan "Login auf Websites", Etappe 3)
    // ---------------------------------------------------------------------

    // GET /_at0mic/login?zurueck=/pfad – Anmeldung starten
    const startLogin = (req, res, name, customHost = null) => {
        if (!loginUrl || !key) return sendPage(res, 'loginUnavailable');
        const state = login.newState();
        const returnPath = login.safeReturnPath(req.query.zurueck);
        res.append(
            'Set-Cookie',
            login.serializeCookie(cookies.login, login.encodeLogin(state, returnPath), {
                maxAge: login.LOGIN_SECONDS,
                isProduction
            })
        );
        res.set('Cache-Control', 'no-store');
        const target = new URL('/site-login', loginUrl);
        target.searchParams.set('site', name);
        target.searchParams.set('state', state);
        // Auf einer eigenen Domain: dorthin zurück (das Backend prüft, ob sie zur Website gehört)
        if (customHost) target.searchParams.set('host', customHost);
        return res.redirect(302, target.href);
    };

    // GET /_at0mic/callback?code=…&state=… (oder ?error=abgebrochen&state=…)
    const finishLogin = async (req, res, name) => {
        res.set('Cache-Control', 'no-store');
        // Das Login-Cookie gilt nur für EINEN Versuch – immer gleich löschen
        const started = login.decodeLogin(login.parseCookies(req.headers.cookie)[cookies.login]);
        res.append('Set-Cookie', login.serializeCookie(cookies.login, '', { maxAge: 0, isProduction }));

        // Der Zustand muss genau der sein, den DIESER Browser beim Start bekam
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        if (!started || !login.sameState(started.state, state)) return sendPage(res, 'loginFailed');

        // Abgebrochen: einfach zurück, wo man war
        if (req.query.error) return res.redirect(303, started.returnPath);

        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code || !key) return sendPage(res, 'loginFailed');

        let answer;
        let data = null;
        try {
            answer = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/ausweis`, {
                method: 'POST',
                headers: backendHeaders(visitorIpOf(req), null, { 'content-type': 'application/json' }),
                body: JSON.stringify({ code, state }),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            data = await answer.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (Anmeldung ${name}): ${error.message}`);
            return sendPage(res, 'unavailable');
        }
        const token = data && data.data && data.data.token;
        if (!answer.ok || !login.isTokenShape(token)) return sendPage(res, 'loginFailed');

        // So lange wie der Ausweis gilt (höchstens 7 Tage)
        const seconds = Math.min((new Date(data.data.expiresAt).getTime() - Date.now()) / 1000, 7 * 24 * 3600);
        setTokenCookie(res, token, Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
        return res.redirect(303, started.returnPath);
    };

    // GET /_at0mic/vorschau?code=… (Plan "Screenshots in der Vorschau", S2b)
    // Cloudflare öffnet diese Adresse für einen Screenshot MIT Live-Daten. Der Bauarbeiter
    // tauscht den Einmal-Code (60 s, nur einmal) beim Backend gegen einen Ausweis mit Zweck
    // "screenshot" (2 Minuten) und setzt das Cookie SELBST – wie beim normalen Anmelden.
    // Dann weiter zur Startseite, die Cloudflare fotografiert. Das Backend sperrt den Ausweis
    // gleich nach dem Bild. Kein Zustand (state) nötig: Der Code ist an Website, Mensch/Agent
    // und Adresse gebunden und gilt nur einmal.
    const startScreenshot = async (req, res, name, customHost = null) => {
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer'); // den Code nirgends weitergeben
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code || !key) return sendPage(res, 'loginFailed');

        let answer;
        let data = null;
        try {
            answer = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/vorschau-ausweis`, {
                method: 'POST',
                headers: backendHeaders(visitorIpOf(req), null, { 'content-type': 'application/json' }),
                body: JSON.stringify({ code, host: customHost || '' }),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            data = await answer.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (Screenshot ${name}): ${error.message}`);
            return sendPage(res, 'unavailable');
        }
        const token = data && data.data && data.data.token;
        if (!answer.ok || !login.isTokenShape(token)) return sendPage(res, 'loginFailed');

        // So lange wie der Ausweis gilt (höchstens 2 Minuten)
        const seconds = Math.min(Number(data.data.seconds) || 0, 120);
        setTokenCookie(res, token, seconds > 0 ? seconds : 0);
        // ziel (Plan "Geo-Monitor", G4): eine Unterseite wie "/#/detail/3" statt der Startseite.
        // Nur ein Pfad auf DIESER Website (safeReturnPath) – sonst "/", nie eine fremde Adresse.
        return res.redirect(302, login.safeReturnPath(req.query.ziel));
    };

    // GET|POST /_at0mic/logout – im Backend sperren, Cookie löschen
    const logout = async (req, res, name, token) => {
        res.set('Cache-Control', 'no-store');
        // Privaten Zwischenspeicher sofort vergessen
        if (token) personalCache.delete(personalKey(name, token));
        if (token && key) {
            try {
                await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/abmelden`, {
                    method: 'POST',
                    headers: backendHeaders(visitorIpOf(req), null, { 'content-type': 'application/json' }),
                    body: JSON.stringify({ token }),
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
                });
            } catch (error) {
                // Cookie trotzdem löschen – im Browser ist man damit abgemeldet
                log.warn(`[BAUARBEITER] Abmelden im Backend nicht möglich (${name}): ${error.message}`);
            }
        }
        clearTokenCookie(res);
        if (req.method === 'POST') return res.status(200).json({ ok: true });
        return res.redirect(303, login.safeReturnPath(req.query.zurueck));
    };

    // GET /_at0mic/me – "wer ist angemeldet?" für das JavaScript der Website
    // Antwort: { angemeldet: false } oder { angemeldet: true, uuid } (nur die UUID)
    const whoAmI = async (req, res, name, token) => {
        res.set('Cache-Control', 'no-store');
        if (!token || !key) return res.status(200).json({ angemeldet: false });
        try {
            const answer = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/besucher`, {
                headers: backendHeaders(visitorIpOf(req), token),
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            if (tokenRejected(answer)) clearTokenCookie(res);
            const data = await answer.json().catch(() => null);
            if (!answer.ok || !data || !data.data) {
                return res.status(503).json({ error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
            }
            return res
                .status(200)
                .json(data.data.angemeldet ? { angemeldet: true, uuid: data.data.uuid } : { angemeldet: false });
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (me ${name}): ${error.message}`);
            return res.status(503).json({ error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
        }
    };

    // Die Anmelde-Adressen: /_at0mic/<aktion> -> true, wenn beantwortet
    const handleLoginRoute = async (req, res, name, token, customHost = null) => {
        const action = req.path.slice('/_at0mic/'.length);
        const methods = { login: ['GET'], callback: ['GET'], logout: ['GET', 'POST'], me: ['GET'], vorschau: ['GET'] };
        if (!Object.prototype.hasOwnProperty.call(methods, action)) return false;
        if (!methods[action].includes(req.method)) {
            res.set('Allow', methods[action].join(', '));
            res.status(405).json({ error: 'Nicht erlaubt.' });
            return true;
        }
        // Abmelden per POST: nur von der eigenen Website (nicht von einer Nachbar-Website aus)
        if (action === 'logout' && req.method === 'POST' && !sameOriginRequest(req)) {
            res.status(403).json({ error: 'Nur von dieser Website aus.' });
            return true;
        }
        if (action === 'login') startLogin(req, res, name, customHost);
        else if (action === 'callback') await finishLogin(req, res, name);
        else if (action === 'logout') await logout(req, res, name, token);
        else if (action === 'vorschau') await startScreenshot(req, res, name, customHost);
        else await whoAmI(req, res, name, token);
        return true;
    };

    // Kommt die Anfrage von genau dieser Website? (Browser schicken "Origin" bei POST mit)
    // Wichtig, weil alle *.at0mic.site für den Browser "Nachbarn" sind: Ohne diese
    // Prüfung könnte andere.at0mic.site per fetch in deinem Namen eine SSF aufrufen.
    const sameOriginRequest = req => req.get('origin') === login.ownOrigin(req, isProduction);

    // ---------------------------------------------------------------------
    // SSF DER WEBSITE AUFRUFEN:  POST /_at0mic/run/<pfad>   (JSON rein, JSON raus)
    // Das JavaScript der Website ruft so ihre eigene SSF auf – auf derselben
    // Adresse, darum braucht es kein CORS. Der Bauarbeiter reicht weiter an
    // POST /api/sites/<name>/run/<pfad>, mit Schlüssel und Besucher-IP, ohne
    // Cookies. Fehlermeldungen aus dem SSF-Code bekommt der Besucher nie.
    //
    // Angemeldet? Dann geht der Ausweis mit – aber NUR, wenn der Aufruf von
    // dieser Website selbst kommt (Origin). Eine fremde Seite, die hier eine
    // SSF aufruft, wird abgewiesen.
    // ---------------------------------------------------------------------
    const runFunction = async (req, res, name, runPath, token) => {
        const reply = (status, body, extra = {}) => {
            res.set('Cache-Control', 'no-store');
            if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
            return res.status(status).json(body);
        };
        // Von einer FREMDEN Seite (auch einer Nachbar-Website): nie
        if (req.get('origin') && !sameOriginRequest(req)) {
            return reply(403, { error: 'Nur von dieser Website aus.' });
        }
        // Ohne Herkunfts-Angabe (z.B. ein Programm statt eines Browsers): als Anonymer
        const forwardToken = token && sameOriginRequest(req) ? token : null;
        if (!req.is('application/json')) {
            return reply(415, { error: 'Bitte als JSON schicken (Content-Type: application/json).' });
        }
        let body;
        try {
            body = await readJsonBody(req, MAX_RUN_BODY_BYTES);
        } catch (error) {
            return reply(error.status || 400, { error: error.message });
        }

        const headers = backendHeaders(visitorIpOf(req), forwardToken, { 'content-type': 'application/json' });

        let res2;
        let data = null;
        try {
            res2 = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/run/${runPath}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(RUN_TIMEOUT_MS)
            });
            data = await res2.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (${name}/${runPath}): ${error.message}`);
            return reply(503, { error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
        }
        if (tokenRejected(res2)) clearTokenCookie(res); // Ausweis gilt nicht mehr -> Cookie weg
        return translateAnswer(reply, res2, data, `${name}/${runPath}`);
    };

    // Antwort des Backends für den Besucher übersetzen (für /run und /upload gleich):
    // Fehlerdetails aus dem SSF-Code gehen nur ins Log, nie an den Besucher.
    const translateAnswer = (reply, res2, data, label) => {
        if (res2.ok) return reply(200, { result: data?.result ?? null });
        if (res2.status === 404) return reply(404, { error: 'Diese Funktion gibt es nicht.' });
        if (res2.status === 400) return reply(400, { error: data?.error || 'Ungültige Eingabe.' });
        if (res2.status === 413) return reply(413, { error: data?.error || 'Zu gross.' });
        if (res2.status === 429) {
            const retryAfter = data?.retryAfter || res2.headers.get('retry-after') || 30;
            return reply(
                429,
                { error: data?.error || 'Zu viele Anfragen – bitte kurz warten.', retryAfter: Number(retryAfter) },
                { retryAfter }
            );
        }
        if (res2.status === 422) {
            // Fehler im Code der SSF: nur ins Log, nie an den Besucher
            log.warn(`[BAUARBEITER] SSF "${label}" mit Fehler: ${data?.details || data?.error}`);
            return reply(502, { error: 'Die Funktion hatte einen Fehler.' });
        }
        if (res2.status === 401)
            log.error('[BAUARBEITER] Der Bauarbeiter-Schlüssel ist falsch (BAUARBEITER_KEY prüfen).');
        return reply(503, { error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
    };

    // ---------------------------------------------------------------------
    // UPLOAD EINES BESUCHERS:  POST /_at0mic/upload/<pfad>   (Plan "R2", Etappe R2a)
    // Das JavaScript der Website schickt EINE Datei als rohe Bytes:
    //   fetch('/_at0mic/upload/api?gericht=12', { method: 'POST', body: datei,
    //         headers: { 'X-File-Name': encodeURIComponent(datei.name) } })
    // Der Bauarbeiter reicht sie an POST /api/sites/<name>/upload/<pfad> weiter – mit
    // Schlüssel, Besucher-IP und (nur von dieser Website aus) dem Ausweis, ohne Cookies.
    // Ob die Datei gespeichert wird, entscheidet die SSF (api.files.accept).
    // ---------------------------------------------------------------------
    const uploadFile = async (req, res, name, uploadPath, token) => {
        const reply = (status, body, extra = {}) => {
            res.set('Cache-Control', 'no-store');
            if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
            return res.status(status).json(body);
        };
        // Von einer FREMDEN Seite (auch einer Nachbar-Website): nie
        if (req.get('origin') && !sameOriginRequest(req)) {
            return reply(403, { error: 'Nur von dieser Website aus.' });
        }
        const forwardToken = token && sameOriginRequest(req) ? token : null;
        // Sagt der Browser schon vorher, dass es zu gross ist? Dann gar nicht erst lesen
        const announced = Number(req.get('content-length'));
        if (Number.isFinite(announced) && announced > MAX_UPLOAD_BYTES) {
            return reply(413, { error: `Die Datei ist zu gross (max. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` });
        }
        let body;
        try {
            body = await readRawBody(req, MAX_UPLOAD_BYTES);
        } catch (error) {
            const status = error.status || 400;
            return reply(status, {
                error:
                    status === 413
                        ? `Die Datei ist zu gross (max. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`
                        : error.message
            });
        }
        if (body.length === 0) return reply(400, { error: 'Es kam keine Datei an.' });

        const extra = { 'content-type': 'application/octet-stream' };
        const fileName = req.get('x-file-name');
        if (typeof fileName === 'string' && fileName.length <= MAX_FILE_NAME_HEADER) extra['x-file-name'] = fileName;
        const at = req.originalUrl.indexOf('?');
        const query = at === -1 ? '' : req.originalUrl.slice(at);
        if (query.length > MAX_UPLOAD_QUERY) return reply(400, { error: 'Die Angaben in der Adresse sind zu lang.' });

        let res2;
        let data = null;
        try {
            res2 = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/upload/${uploadPath}${query}`, {
                method: 'POST',
                headers: backendHeaders(visitorIpOf(req), forwardToken, extra),
                body,
                signal: AbortSignal.timeout(RUN_TIMEOUT_MS)
            });
            data = await res2.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (Upload ${name}/${uploadPath}): ${error.message}`);
            return reply(503, { error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
        }
        if (tokenRejected(res2)) clearTokenCookie(res); // Ausweis gilt nicht mehr -> Cookie weg
        return translateAnswer(reply, res2, data, `${name}/${uploadPath} (Upload)`);
    };

    // ---------------------------------------------------------------------
    // DATEI DER WEBSITE:  GET /_at0mic/datei/<pfad>   (Plan "Dateien mit R2", D3)
    // Holt die Datei beim Backend (GET /api/sites/<name>/datei/<pfad>) – mit der IP des
    // Besuchers und, wenn er angemeldet ist, seinem Ausweis (dann gelten SEINE Rechte).
    // Ein Bild auf einer FREMDEN Seite bekommt das Cookie nicht (SameSite=Lax) – dort
    // gilt also nur, was öffentlich ist.
    //
    // ZWISCHENSPEICHER: Das Backend sagt, ob die Datei öffentlich zwischengespeichert
    // werden darf (Cache-Control). Cloudflare hält sich daran – öffentliche Bilder kommen
    // dann aus Cloudflare, ohne unseren Server. Fehler nie zwischenspeichern.
    // ETag/If-None-Match: Hat der Browser die Datei schon, antwortet das Backend 304.
    // ---------------------------------------------------------------------
    const serveFile = async (req, res, name, filePath, token) => {
        const fail = (status, text) => {
            res.set('Cache-Control', 'no-store');
            return res.status(status).type('text/plain; charset=utf-8').send(text);
        };
        const query = typeof req.query.v === 'string' && /^\d{1,9}$/.test(req.query.v) ? `?v=${req.query.v}` : '';
        const headers = backendHeaders(visitorIpOf(req), token);
        const etag = req.get('if-none-match');
        if (etag && etag.length < 200) headers['if-none-match'] = etag;

        let answer;
        try {
            answer = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/datei/${filePath}${query}`, {
                headers,
                signal: AbortSignal.timeout(FILE_TIMEOUT_MS)
            });
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (Datei ${name}/${filePath}): ${error.message}`);
            return fail(503, 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.');
        }
        if (tokenRejected(answer)) clearTokenCookie(res); // Ausweis gilt nicht mehr -> Cookie weg

        if (answer.status === 200 || answer.status === 304) {
            for (const header of FILE_HEADERS) {
                const value = answer.headers.get(header);
                if (value) res.set(header, value);
            }
            res.set('X-Content-Type-Options', 'nosniff');
            if (answer.status === 304) return res.status(304).end();
            const body = Buffer.from(await answer.arrayBuffer());
            return res.status(200).end(req.method === 'HEAD' ? undefined : body);
        }
        await answer.arrayBuffer().catch(() => null);
        if (answer.status === 404) return fail(404, 'Diese Datei gibt es nicht.');
        if (answer.status === 429) return fail(429, 'Zu viele Anfragen – bitte kurz warten.');
        if (answer.status === 401)
            log.error('[BAUARBEITER] Der Bauarbeiter-Schlüssel ist falsch (BAUARBEITER_KEY prüfen).');
        return fail(503, 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.');
    };

    // ---------------------------------------------------------------------
    // WEBHOOK:  POST|PUT /_at0mic/hook/<pfad>   (Plan "SSF-Ausbau", Teil B)
    // Ein fremder Server ruft eine SSF der Website auf. Anders als bei run:
    //   - keine Herkunfts-Prüfung (Server schicken kein Origin) – dafür prüft die
    //     SSF die Unterschrift des Anbieters (api.webhook.verify)
    //   - NIE ein Ausweis: ein Webhook ist kein angemeldeter Besucher
    //   - der Rohtext geht unverändert (als Base64) ans Backend, dazu die Header
    //     und die Abfrage (?a=1) – nie Cookies
    // Antwort an den Anbieter: 200 bei Erfolg. Bei einem Fehler in der SSF 500 –
    // dann versuchen es Stripe & Co. später nochmals. Details nie nach aussen.
    // ---------------------------------------------------------------------
    const runWebhook = async (req, res, name, hookPath) => {
        const reply = (status, body, extra = {}) => {
            res.set('Cache-Control', 'no-store');
            if (extra.retryAfter) res.set('Retry-After', String(extra.retryAfter));
            return res.status(status).json(body);
        };
        let raw;
        try {
            raw = await readRawBody(req, MAX_HOOK_BODY_BYTES);
        } catch (error) {
            return reply(error.status || 400, { error: error.message });
        }

        const forwarded = {};
        for (const [headerName, value] of Object.entries(req.headers)) {
            if (HOOK_DROP_HEADERS.includes(headerName) || typeof value !== 'string') continue;
            forwarded[headerName] = value;
        }
        const query = {};
        for (const [queryName, value] of Object.entries(req.query || {})) {
            if (typeof value === 'string') query[queryName] = value;
        }

        let res2;
        let data = null;
        try {
            res2 = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(name)}/hook/${hookPath}`, {
                method: 'POST',
                headers: backendHeaders(null, null, { 'content-type': 'application/json' }),
                body: JSON.stringify({
                    method: req.method,
                    headers: forwarded,
                    query,
                    rawBodyBase64: raw.toString('base64')
                }),
                signal: AbortSignal.timeout(RUN_TIMEOUT_MS)
            });
            data = await res2.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (Webhook ${name}/${hookPath}): ${error.message}`);
            return reply(503, { error: 'Gerade nicht erreichbar.' });
        }

        if (res2.ok) return reply(200, { ok: true, result: data?.result ?? null });
        if (res2.status === 404) return reply(404, { error: 'Diesen Webhook gibt es nicht.' });
        if (res2.status === 400) return reply(400, { error: data?.error || 'Ungültiger Webhook-Aufruf.' });
        if (res2.status === 429) {
            const retryAfter = data?.retryAfter || res2.headers.get('retry-after') || 30;
            return reply(429, { error: 'Zu viele Aufrufe – bitte später nochmals.' }, { retryAfter });
        }
        if (res2.status === 422) {
            // Fehler im Code der SSF (z.B. Unterschrift ungültig): nur ins Log
            log.warn(`[BAUARBEITER] Webhook "${name}/${hookPath}" mit Fehler: ${data?.details || data?.error}`);
            return reply(500, { error: 'Der Webhook hatte einen Fehler.' });
        }
        if (res2.status === 401 || res2.status === 403)
            log.error('[BAUARBEITER] Der Bauarbeiter-Schlüssel ist falsch (BAUARBEITER_KEY prüfen).');
        return reply(503, { error: 'Gerade nicht erreichbar.' });
    };

    // ---------------------------------------------------------------------
    // UMLEITUNG name.at0mic.site -> eigene Domain (Plan "SSF-Ausbau", D2)
    // Hat eine Website eine aktive eigene Domain, sagt es der Bauplan
    // (customDomain). Seiten leiten wir dann dorthin um – mit 302 statt 301:
    // Entfernt der Kunde die Domain, soll sich kein Browser die Umleitung merken.
    // Nie umgeleitet: SSF-Aufrufe und Webhooks (POST), der Rücksprung des Logins
    // und "wer bin ich?" – die gehören zur Adresse, auf der das Cookie liegt.
    // ---------------------------------------------------------------------
    const redirectToCustom = (req, res, target) => {
        res.set('Cache-Control', 'no-store');
        return res.redirect(302, `https://${target}${req.originalUrl}`);
    };
    // Für /_at0mic/login: nur, wenn wir den Bauplan schon im Zwischenspeicher haben
    // (keine zusätzliche Anfrage ans Backend nur fürs Anmelden)
    const cachedCustomDomain = name => {
        const entry = cache.get(name);
        return cache.isFresh(entry) && entry.kind === 'site' ? entry.bauplan.customDomain || null : null;
    };

    return async (req, res, next) => {
        const kind = classifyHost(req.headers.host, siteDomain, cockpitHosts || []);
        // Ohne cockpitHosts (aus) gehen fremde Namen wie bisher ans Cockpit
        if (kind.kind === 'cockpit' || (kind.kind === 'custom' && !cockpitHosts)) return next();
        // host = { name, custom }: name = Website, custom = eigene Domain (oder null)
        const host = { name: kind.kind === 'site' ? kind.name : null, custom: null };

        try {
            setSecurityHeaders(res, isProduction);

            // Eigene Domain? Dann beim Backend nachfragen, zu welcher Website sie gehört
            if (kind.kind === 'custom') {
                const name = await lookupCustomHost(kind.hostname);
                if (name === undefined) return sendPage(res, 'unavailable');
                if (!name) return sendPage(res, 'noSite');
                host.name = name;
                host.custom = kind.hostname;
            }

            // Angemeldet? (nur unser eigenes Cookie, und nur, wenn es wie ein Ausweis aussieht)
            const cookieToken = login.parseCookies(req.headers.cookie)[cookies.ausweis];
            const token = login.isTokenShape(cookieToken) ? cookieToken : null;

            // Webhook (nur POST/PUT, nur unter /_at0mic/hook/) – ohne Ausweis
            const hook = HOOK_ROUTE.exec(req.path);
            if (hook && host.name) {
                if (!HOOK_METHODS.includes(req.method)) {
                    res.set('Allow', HOOK_METHODS.join(', '));
                    return res.status(405).json({ error: 'Nur POST oder PUT.' });
                }
                return await runWebhook(req, res, host.name, hook[1]);
            }

            // Datei der Website (nur GET/HEAD, nur unter /_at0mic/datei/) – Plan "Dateien mit R2", D3
            const file = FILE_ROUTE.exec(req.path);
            if (file && host.name) {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    res.set('Allow', 'GET, HEAD');
                    return res.status(405).json({ error: 'Nur GET.' });
                }
                return await serveFile(req, res, host.name, file[1], token);
            }

            // Upload eines Besuchers (nur POST, nur unter /_at0mic/upload/) – Plan "R2"
            const up = UPLOAD_ROUTE.exec(req.path);
            if (up && host.name) {
                if (req.method !== 'POST') {
                    res.set('Allow', 'POST');
                    return res.status(405).json({ error: 'Nur POST.' });
                }
                return await uploadFile(req, res, host.name, up[1], token);
            }

            // SSF der Website (nur POST, nur unter /_at0mic/run/)
            const run = RUN_ROUTE.exec(req.path);
            if (run && host.name) {
                if (req.method !== 'POST') {
                    res.set('Allow', 'POST');
                    return res.status(405).json({ error: 'Nur POST.' });
                }
                return await runFunction(req, res, host.name, run[1], token);
            }

            // Anmelden auf name.at0mic.site, obwohl die Website eine eigene Domain hat:
            // dort anmelden (sonst läge das Cookie auf der falschen Adresse)
            if (!host.custom && host.name && req.path === '/_at0mic/login' && req.method === 'GET') {
                const target = cachedCustomDomain(host.name);
                if (target) return redirectToCustom(req, res, target);
            }

            // Anmelden, Rücksprung, Abmelden, "wer bin ich?"
            if (
                host.name &&
                req.path.startsWith('/_at0mic/') &&
                (await handleLoginRoute(req, res, host.name, token, host.custom))
            ) {
                return undefined;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') return sendPage(res, 'methodNotAllowed');
            if (!host.name) return sendPage(res, 'noSite');

            const result = await getBauplan(host.name, visitorIpOf(req), token);
            if (result.tokenInvalid) {
                clearTokenCookie(res); // abgelaufen/abgemeldet -> Cookie weg
                personalCache.delete(personalKey(host.name, token)); // und sein privater Speicher
            }
            if (result.kind === 'missing') return sendPage(res, 'noSite');
            if (result.kind === 'error') return sendPage(res, result.page, { ...result, returnPath: req.originalUrl });

            const { bauplan } = result;
            // Seite auf name.at0mic.site, aber die Website hat eine aktive eigene Domain -> dorthin
            if (!host.custom && bauplan.customDomain) return redirectToCustom(req, res, bauplan.customDomain);
            const personal = !!result.personal;
            const path = resolveFile(req.path, bauplan.files);
            if (path) return await sendFile(res, bauplan, path, 200, host.name, personal);

            // Nicht gefunden: die eigene 404-Seite der Website, sonst die neutrale
            if (Object.prototype.hasOwnProperty.call(bauplan.files, '404.html')) {
                return await sendFile(res, bauplan, '404.html', 404, host.name, personal);
            }
            return sendPage(res, 'notFound');
        } catch (error) {
            log.error(`[BAUARBEITER] Unerwarteter Fehler (${host.name}): ${error.stack || error.message}`);
            if (!res.headersSent) sendPage(res, 'unavailable');
        }
    };
};

module.exports = { createBauarbeiter, setSecurityHeaders, visitorIpOf };
