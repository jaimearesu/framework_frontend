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
// LOGIN AUF WEBSITES (Plan "Login auf Websites", Etappe 3):
//   GET  /_at0mic/login?zurueck=/pfad   Anmeldung starten (-> at0mic, "Bei … anmelden?")
//   GET  /_at0mic/callback?code&state   zurück von at0mic: Code gegen Ausweis tauschen
//   GET|POST /_at0mic/logout            abmelden
//   GET  /_at0mic/me                    { angemeldet, uuid? } – für das JavaScript der Website
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
//
// Das Backend fragt er mit dem Bauarbeiter-Schlüssel und der IP des
// Besuchers – so bremst das Backend pro Besucher (Etappe 2). Rechte gibt
// der Schlüssel keine: Ohne Ausweis ist nur online, was öffentlich ist.
// ---------------------------------------------------------------------
const { siteNameFromHost } = require('./host');
const { resolveFile, contentTypeFor, extensionOf } = require('./files');
const { BauplanCache } = require('./cache');
const { MESSAGES, neutralPage, markdownPage, markdownTitle } = require('./pages');
const login = require('./login');

const FETCH_TIMEOUT_MS = 8000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SSF der Website: /_at0mic/run/<pfad> – Pfad wie die identifier in der DNA
const RUN_ROUTE = /^\/_at0mic\/run\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)$/;
const MAX_RUN_BODY_BYTES = 64 * 1024; // Eingabe für die SSF: höchstens 64 KB

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
    log = console,
    loginUrl = null
}) => {
    // Laufende Anfragen pro Website: Kommen 10 Besucher gleichzeitig, fragt
    // der Bauarbeiter das Backend trotzdem nur EINMAL. (Nur für Anonyme –
    // ein angemeldeter Besucher bekommt immer seine eigene Anfrage.)
    const inFlight = new Map();
    const cookies = login.cookieNames(isProduction);

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
            return { kind: 'site', bauplan: body.data, personal: !!(body.meta && body.meta.personal), tokenInvalid };
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
            const result = await fetchFromBackend(name, visitorIp, token);
            // Der Ausweis galt nicht: Die Antwort ist die eines Anonymen. Ist sie
            // wirklich öffentlich (nicht persönlich), darf sie in den Speicher.
            if (result.kind === 'site' && !result.personal) cache.setSite(name, result.bauplan);
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
    const startLogin = (req, res, name) => {
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

    // GET|POST /_at0mic/logout – im Backend sperren, Cookie löschen
    const logout = async (req, res, name, token) => {
        res.set('Cache-Control', 'no-store');
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
    const handleLoginRoute = async (req, res, name, token) => {
        const action = req.path.slice('/_at0mic/'.length);
        const methods = { login: ['GET'], callback: ['GET'], logout: ['GET', 'POST'], me: ['GET'] };
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
        if (action === 'login') startLogin(req, res, name);
        else if (action === 'callback') await finishLogin(req, res, name);
        else if (action === 'logout') await logout(req, res, name, token);
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
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            data = await res2.json().catch(() => null);
        } catch (error) {
            log.warn(`[BAUARBEITER] Backend nicht erreichbar (${name}/${runPath}): ${error.message}`);
            return reply(503, { error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
        }
        if (tokenRejected(res2)) clearTokenCookie(res); // Ausweis gilt nicht mehr -> Cookie weg

        if (res2.ok) return reply(200, { result: data?.result ?? null });
        if (res2.status === 404) return reply(404, { error: 'Diese Funktion gibt es nicht.' });
        if (res2.status === 400) return reply(400, { error: data?.error || 'Ungültige Eingabe.' });
        if (res2.status === 429) {
            const retryAfter = data?.retryAfter || res2.headers.get('retry-after') || 30;
            return reply(
                429,
                { error: 'Zu viele Anfragen – bitte kurz warten.', retryAfter: Number(retryAfter) },
                { retryAfter }
            );
        }
        if (res2.status === 422) {
            // Fehler im Code der SSF: nur ins Log, nie an den Besucher
            log.warn(`[BAUARBEITER] SSF "${name}/${runPath}" mit Fehler: ${data?.details || data?.error}`);
            return reply(502, { error: 'Die Funktion hatte einen Fehler.' });
        }
        if (res2.status === 401)
            log.error('[BAUARBEITER] Der Bauarbeiter-Schlüssel ist falsch (BAUARBEITER_KEY prüfen).');
        return reply(503, { error: 'Gerade nicht erreichbar. Bitte gleich nochmal versuchen.' });
    };

    return async (req, res, next) => {
        const host = siteNameFromHost(req.headers.host, siteDomain);
        if (!host.isSiteHost) return next(); // keine Website -> Cockpit

        try {
            setSecurityHeaders(res, isProduction);

            // Angemeldet? (nur unser eigenes Cookie, und nur, wenn es wie ein Ausweis aussieht)
            const cookieToken = login.parseCookies(req.headers.cookie)[cookies.ausweis];
            const token = login.isTokenShape(cookieToken) ? cookieToken : null;

            // SSF der Website (nur POST, nur unter /_at0mic/run/)
            const run = RUN_ROUTE.exec(req.path);
            if (run && host.name) {
                if (req.method !== 'POST') {
                    res.set('Allow', 'POST');
                    return res.status(405).json({ error: 'Nur POST.' });
                }
                return await runFunction(req, res, host.name, run[1], token);
            }

            // Anmelden, Rücksprung, Abmelden, "wer bin ich?"
            if (host.name && req.path.startsWith('/_at0mic/') && (await handleLoginRoute(req, res, host.name, token))) {
                return undefined;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') return sendPage(res, 'methodNotAllowed');
            if (!host.name) return sendPage(res, 'noSite');

            const result = await getBauplan(host.name, visitorIpOf(req), token);
            if (result.tokenInvalid) clearTokenCookie(res); // abgelaufen/abgemeldet -> Cookie weg
            if (result.kind === 'missing') return sendPage(res, 'noSite');
            if (result.kind === 'error') return sendPage(res, result.page, { ...result, returnPath: req.originalUrl });

            const { bauplan } = result;
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
