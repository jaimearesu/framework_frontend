// site/live.js
// ---------------------------------------------------------------------
// LIVE-VERBINDUNGEN DER WEBSITES (Plan "W – Live-Verbindungen", W2)
//
// Der Bauarbeiter hält hier die WebSockets der Besucher:
//
//   Browser  --wss://shop.at0mic.site/_at0mic/live-->  Bauarbeiter (hier)
//   Backend  --GET /api/sites/_live/strom (eine Leitung)-->  Bauarbeiter
//
// Jede Nachricht, die eine SSF mit api.live.send schickt, kommt über die
// EINE interne Leitung hierher und wird an alle Besucher verteilt, die auf
// diesem Objekt und Kanal zuhören.
//
// WAS DER BROWSER SCHICKEN DARF (JSON-Text, höchstens 1 KB):
//   { "typ": "abo",  "pfad": "api", "kanal": "chat" }   zuhören
//   { "typ": "ende", "pfad": "api", "kanal": "chat" }   nicht mehr zuhören
//   { "typ": "ping" }                                   -> { "typ": "pong" }
// Senden an andere Besucher geht hier NICHT (Entscheidung L1) – das macht
// nur eine SSF (/_at0mic/run/… -> api.live.send).
//
// WAS DER BROWSER BEKOMMT:
//   { "typ": "hallo" }                                   gleich nach dem Verbinden
//   { "typ": "abo-ok", "pfad", "kanal" }                 zuhören klappt
//   { "typ": "abo-fehler", "pfad", "kanal", "fehler" }   darfst du nicht / gibt es nicht
//   { "typ": "nachricht", "pfad", "kanal", "daten" }     eine Nachricht der SSF
//   { "typ": "wieder-da" }                               die interne Leitung war kurz weg –
//                                                        Verpasstes über die SSF nachholen
//   { "typ": "ping" }                                    alle 30 s (hält die Leitung offen)
//   { "typ": "fehler", "code", "fehler" }                vor dem Schliessen (z.B. VOLL)
//
// SICHERHEIT:
//   - Herkunft (L5): Der Browser schickt beim Verbinden "Origin" mit. Nur genau
//     diese Website (bzw. ihre eigene Domain) darf verbinden. Sonst könnte eine
//     fremde Seite im Namen eines angemeldeten Besuchers mithören.
//   - Zutritt (L2): Für jedes Abo fragt der Bauarbeiter das Backend
//     (POST /api/sites/:domain/live/zutritt) – mit dem Ausweis des Besuchers,
//     falls angemeldet. Dieselben Regeln wie bei /run.
//   - Alle 5 Minuten wird der Zutritt nochmals geprüft: Wird etwas privat oder
//     ein Recht entzogen, hört der Besucher nicht mehr lange mit.
//   - Grenzen (L4): Verbindungen pro IP, pro Konto (vom Backend), Abos pro
//     Verbindung, Nachrichten vom Browser pro Zeit, Stau beim Browser.
// ---------------------------------------------------------------------
const { WebSocketServer } = require('ws');
const login = require('./login');

const LIVE_PATH = '/_at0mic/live';
const PFAD = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
const KANAL = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alle Grenzen an einem Ort (in Tests einzeln überschreibbar)
const DEFAULT_LIMITS = Object.freeze({
    maxPerIp: 30, // gleichzeitige Verbindungen pro IP-Adresse (Restaurant-WLAN: viele Geräte)
    maxSubscriptions: 20, // Abos pro Verbindung
    maxIncomingBytes: 1024, // eine Nachricht vom Browser
    incomingPerWindow: 30, // so viele Nachrichten vom Browser …
    incomingWindowMs: 10000, // … pro 10 s, sonst wird getrennt
    maxBufferedBytes: 1024 * 1024, // staut sich beim Browser mehr als 1 MB: trennen (zu langsam)
    pingMs: 30000, // alle 30 s ein "bin noch da" (Cloudflare kappt stille Leitungen nach ~100 s)
    idleNoSubscriptionMs: 60000, // ohne ein einziges Abo nach 60 s trennen
    recheckMs: 5 * 60 * 1000, // Zutritt alle 5 Minuten neu prüfen
    accessTimeoutMs: 8000, // Antwort des Backends auf eine Zutritts-Frage
    // Interne Leitung zum Backend
    streamSilenceMs: 70000, // so lange ohne Lebenszeichen -> neu verbinden (Backend pingt alle 25 s)
    streamRetryMinMs: 1000,
    streamRetryMaxMs: 30000,
    reportMs: 30000 // so oft meldet der Bauarbeiter dem Backend die Zahlen pro Website (Cockpit)
});

// Schliess-Codes (4000–4999 sind für Anwendungen frei)
const CLOSE = Object.freeze({
    VOLL: 4429, // zu viele Verbindungen (Konto)
    ZU_VIEL: 4408, // zu viele Nachrichten vom Browser
    ABGEMELDET: 4401, // Ausweis gilt nicht mehr -> neu verbinden (dann anonym)
    UNGENUTZT: 4410 // nie etwas abonniert
});

/**
 * IP des Besuchers aus einer rohen Anfrage (beim Verbinden gibt es kein Express-req.ip).
 * Gleiche Regel wie "trust proxy" mit einer Zahl: so viele Zwischenhalte von rechts
 * werden übersprungen – 1 = nur Traefik, 2 = Cloudflare + Traefik.
 */
const visitorIpFromRaw = (req, hops = 1) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const chain = [...forwarded, req.socket && req.socket.remoteAddress].filter(Boolean);
    const index = Math.max(0, chain.length - 1 - hops);
    const ip = chain[index] || null;
    return ip ? ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '') : null;
};

// Eine Antwort ohne WebSocket (vor dem Verbinden abgelehnt)
const rejectUpgrade = (socket, status, text) => {
    try {
        socket.write(
            `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n` +
                `Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`
        );
    } catch {
        // Verbindung schon weg – egal
    }
    socket.destroy();
};

/**
 * @param {object} options
 * @param {string} options.apiUrl        Backend, z.B. "http://localhost:3000"
 * @param {string|null} options.key      BAUARBEITER_KEY (ohne: Live ist aus)
 * @param {function} options.resolveHost (hostHeader) -> Promise<{ name, custom } | null>
 *                                       (vom Bauarbeiter: Website-Name bzw. eigene Domain)
 * @param {boolean} [options.isProduction]
 * @param {number} [options.trustProxyHops]
 * @param {function} [options.fetchImpl]  nur für Tests
 * @param {object} [options.limits]       nur für Tests
 * @param {object} [options.log]
 */
const createLive = ({
    apiUrl,
    key = null,
    resolveHost,
    isProduction = false,
    trustProxyHops = 1,
    fetchImpl = fetch,
    limits: customLimits = {},
    log = console
}) => {
    const limits = { ...DEFAULT_LIMITS, ...customLimits };
    const cookies = login.cookieNames(isProduction);
    // noServer: Den Handschlag (Upgrade) nehmen wir selbst an, nach unseren Prüfungen
    const wss = new WebSocketServer({ noServer: true, maxPayload: limits.maxIncomingBytes });

    const connections = new Set(); // alle offenen Verbindungen
    const perIp = new Map(); // ip -> Anzahl
    const perKonto = new Map(); // Konto-Schlüssel -> Anzahl (erst nach dem ersten Abo bekannt)
    // Wer hört wo zu? "<objekt-uuid>|<kanal>" -> Set von { conn, pfad }
    const listeners = new Map();
    const stats = { delivered: 0, streamConnected: false, streamReconnects: 0 };

    const count = (map, k, delta) => {
        const n = (map.get(k) || 0) + delta;
        if (n <= 0) map.delete(k);
        else map.set(k, n);
    };

    const send = (conn, message) => {
        if (conn.ws.readyState !== conn.ws.OPEN) return;
        // Liest der Browser nicht mehr mit (staut sich), trennen statt Speicher fressen
        if (conn.ws.bufferedAmount > limits.maxBufferedBytes) {
            conn.ws.terminate();
            return;
        }
        conn.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    };

    // ---------------------------------------------------------------------
    // ZUTRITT beim Backend fragen: { erlaubt: { pfad: uuid|null }, konto, maxVerbindungen }
    // Rückgabe null = Backend nicht erreichbar / Fehler. tokenInvalid = Ausweis gilt nicht mehr.
    // ---------------------------------------------------------------------
    const askAccess = async (conn, pfade) => {
        const headers = { accept: 'application/json', 'content-type': 'application/json' };
        if (key) headers['x-bauarbeiter-key'] = key;
        if (key && conn.ip) headers['x-besucher-ip'] = conn.ip;
        if (key && conn.token) headers['x-besucher-ausweis'] = conn.token;
        try {
            const res = await fetchImpl(`${apiUrl}/api/sites/${encodeURIComponent(conn.site)}/live/zutritt`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ pfade }),
                signal: AbortSignal.timeout(limits.accessTimeoutMs)
            });
            const tokenInvalid = res.headers.get('x-besucher-ausweis-status') === 'ungueltig';
            const body = await res.json().catch(() => null);
            if (!res.ok || !body || !body.data || typeof body.data.erlaubt !== 'object') {
                if (res.status !== 429) log.warn(`[LIVE] Zutritt ${conn.site}: Backend antwortet ${res.status}`);
                return { data: null, tokenInvalid, status: res.status };
            }
            return { data: body.data, tokenInvalid, status: res.status };
        } catch (error) {
            log.warn(`[LIVE] Zutritt ${conn.site}: Backend nicht erreichbar (${error.message})`);
            return { data: null, tokenInvalid: false, status: 0 };
        }
    };

    const addListener = (conn, uuid, pfad, kanal) => {
        const k = `${uuid}|${kanal}`;
        if (!listeners.has(k)) listeners.set(k, new Set());
        const entry = { conn, pfad };
        listeners.get(k).add(entry);
        conn.subs.set(`${pfad}|${kanal}`, { uuid, pfad, kanal, entry, listenKey: k });
    };

    const removeListener = (conn, subKey) => {
        const sub = conn.subs.get(subKey);
        if (!sub) return;
        const set = listeners.get(sub.listenKey);
        if (set) {
            set.delete(sub.entry);
            if (set.size === 0) listeners.delete(sub.listenKey);
        }
        conn.subs.delete(subKey);
    };

    // Ein Abo: prüfen, beim Backend fragen, eintragen
    const subscribe = async (conn, pfad, kanal) => {
        const subKey = `${pfad}|${kanal}`;
        if (conn.subs.has(subKey) || conn.pending.has(subKey)) return send(conn, { typ: 'abo-ok', pfad, kanal });
        if (conn.subs.size + conn.pending.size >= limits.maxSubscriptions) {
            return send(conn, {
                typ: 'abo-fehler',
                pfad,
                kanal,
                fehler: `Höchstens ${limits.maxSubscriptions} Kanäle pro Verbindung.`
            });
        }
        conn.pending.add(subKey);
        const answer = await askAccess(conn, [pfad]);
        conn.pending.delete(subKey);
        if (conn.closed) return undefined;
        if (answer.tokenInvalid) return conn.ws.close(CLOSE.ABGEMELDET, 'Abgemeldet');
        if (!answer.data) {
            const fehler =
                answer.status === 429 ? 'Gerade zu viele Anfragen – bitte gleich nochmal.' : 'Gerade nicht erreichbar.';
            return send(conn, { typ: 'abo-fehler', pfad, kanal, fehler });
        }

        // Konto-Grenze (L4): beim ersten Abo zählt die Verbindung zum Konto der Website
        if (!conn.konto) {
            const { konto, maxVerbindungen } = answer.data;
            const used = konto ? perKonto.get(konto) || 0 : 0;
            if (!konto || !Number.isInteger(maxVerbindungen) || used + 1 > maxVerbindungen) {
                send(conn, {
                    typ: 'fehler',
                    code: 'VOLL',
                    fehler: 'Diese Website hat gerade zu viele Live-Verbindungen.'
                });
                return conn.ws.close(CLOSE.VOLL, 'Voll');
            }
            conn.konto = konto;
            count(perKonto, konto, 1);
        }

        const uuid = answer.data.erlaubt[pfad];
        if (typeof uuid !== 'string' || !UUID.test(uuid)) {
            // "gibt es nicht" und "darfst du nicht" sehen gleich aus
            return send(conn, { typ: 'abo-fehler', pfad, kanal, fehler: 'Kein Zugriff oder nicht gefunden.' });
        }
        addListener(conn, uuid, pfad, kanal);
        return send(conn, { typ: 'abo-ok', pfad, kanal });
    };

    // Eine Nachricht vom Browser
    const onMessage = (conn, raw, isBinary) => {
        // Bremse: zu viele Nachrichten -> trennen
        const now = Date.now();
        if (now - conn.windowStart > limits.incomingWindowMs) {
            conn.windowStart = now;
            conn.incoming = 0;
        }
        conn.incoming++;
        if (conn.incoming > limits.incomingPerWindow) return conn.ws.close(CLOSE.ZU_VIEL, 'Zu viele Nachrichten');
        if (isBinary) return send(conn, { typ: 'fehler', code: 'FORMAT', fehler: 'Nur JSON-Text.' });

        let msg;
        try {
            msg = JSON.parse(raw.toString('utf8'));
        } catch {
            return send(conn, { typ: 'fehler', code: 'FORMAT', fehler: 'Ungültiges JSON.' });
        }
        if (!msg || typeof msg !== 'object') return send(conn, { typ: 'fehler', code: 'FORMAT', fehler: 'Ungültig.' });
        if (msg.typ === 'ping') return send(conn, { typ: 'pong' });
        if (msg.typ !== 'abo' && msg.typ !== 'ende') {
            return send(conn, { typ: 'fehler', code: 'FORMAT', fehler: 'Unbekannter typ (abo, ende, ping).' });
        }
        const { pfad, kanal } = msg;
        if (
            typeof pfad !== 'string' ||
            pfad.length > 300 ||
            !PFAD.test(pfad) ||
            typeof kanal !== 'string' ||
            !KANAL.test(kanal)
        ) {
            return send(conn, { typ: 'abo-fehler', pfad: null, kanal: null, fehler: 'pfad oder kanal ungültig.' });
        }
        if (msg.typ === 'ende') {
            removeListener(conn, `${pfad}|${kanal}`);
            return undefined;
        }
        subscribe(conn, pfad, kanal).catch(error => log.warn(`[LIVE] Abo fehlgeschlagen: ${error.message}`));
        return undefined;
    };

    const cleanup = conn => {
        if (conn.closed) return;
        conn.closed = true;
        for (const subKey of [...conn.subs.keys()]) removeListener(conn, subKey);
        connections.delete(conn);
        count(perIp, conn.ip, -1);
        if (conn.konto) count(perKonto, conn.konto, -1);
        clearTimeout(conn.idleTimer);
    };

    // ---------------------------------------------------------------------
    // VERBINDEN (HTTP-Upgrade) – vom Node-Server: server.on('upgrade', live.handleUpgrade)
    // ---------------------------------------------------------------------
    const handleUpgrade = async (req, socket, head) => {
        let pathname;
        try {
            pathname = new URL(req.url, 'http://x').pathname;
        } catch {
            return rejectUpgrade(socket, 400, 'Bad Request');
        }
        if (pathname !== LIVE_PATH) return rejectUpgrade(socket, 404, 'Not Found');
        if (!key) return rejectUpgrade(socket, 503, 'Service Unavailable');

        let host;
        try {
            host = await resolveHost(req.headers.host);
        } catch {
            host = undefined;
        }
        if (host === undefined) return rejectUpgrade(socket, 503, 'Service Unavailable');
        if (!host || !host.name) return rejectUpgrade(socket, 404, 'Not Found');

        // Herkunft (L5): nur genau diese Website
        const own = `${isProduction ? 'https' : 'http'}://${String(req.headers.host || '').toLowerCase()}`;
        if (req.headers.origin !== own) return rejectUpgrade(socket, 403, 'Forbidden');

        const ip = visitorIpFromRaw(req, trustProxyHops);
        if ((perIp.get(ip) || 0) >= limits.maxPerIp) return rejectUpgrade(socket, 429, 'Too Many Requests');

        const cookieToken = login.parseCookies(req.headers.cookie)[cookies.ausweis];
        const token = login.isTokenShape(cookieToken) ? cookieToken : null;

        // Zählen, BEVOR der Handschlag fertig ist (gleichzeitige Versuche zählen mit)
        count(perIp, ip, 1);
        wss.handleUpgrade(req, socket, head, ws => {
            const conn = {
                ws,
                site: host.name,
                token,
                ip,
                konto: null,
                subs: new Map(),
                pending: new Set(),
                closed: false,
                alive: true,
                incoming: 0,
                windowStart: Date.now(),
                idleTimer: null
            };
            connections.add(conn);
            // Wer nach einer Minute noch nichts abonniert hat, braucht die Leitung nicht
            conn.idleTimer = setTimeout(() => {
                if (conn.subs.size === 0) conn.ws.close(CLOSE.UNGENUTZT, 'Ungenutzt');
            }, limits.idleNoSubscriptionMs);
            if (conn.idleTimer.unref) conn.idleTimer.unref();

            ws.on('message', (raw, isBinary) => onMessage(conn, raw, isBinary));
            ws.on('pong', () => {
                conn.alive = true;
            });
            ws.on('close', () => cleanup(conn));
            ws.on('error', () => cleanup(conn));
            send(conn, { typ: 'hallo' });
        });
        return undefined;
    };

    // ---------------------------------------------------------------------
    // VERTEILEN: eine Nachricht der internen Leitung an alle Zuhörer
    // ---------------------------------------------------------------------
    const deliver = (objectUuid, kanal, daten) => {
        const set = listeners.get(`${objectUuid}|${kanal}`);
        if (!set) return 0;
        // Pro Pfad nur einmal in Text umwandeln (meist hören alle über denselben Pfad zu)
        const texts = new Map();
        let n = 0;
        for (const { conn, pfad } of set) {
            if (!texts.has(pfad)) texts.set(pfad, JSON.stringify({ typ: 'nachricht', pfad, kanal, daten }));
            send(conn, texts.get(pfad));
            n++;
        }
        stats.delivered += n;
        return n;
    };

    const broadcast = message => {
        const text = JSON.stringify(message);
        for (const conn of connections) send(conn, text);
    };

    // ---------------------------------------------------------------------
    // DIE INTERNE LEITUNG ZUM BACKEND (GET /api/sites/_live/strom)
    // Bricht sie ab, verbindet der Bauarbeiter neu (mit wachsender Pause bis 30 s).
    // Nach einem Abbruch bekommen alle Besucher { typ: 'wieder-da' } – in der
    // Zwischenzeit können Nachrichten verloren gegangen sein.
    // ---------------------------------------------------------------------
    let running = false;
    let streamAbort = null;
    let everConnected = false;
    const sleep = ms =>
        new Promise(resolve => {
            const t = setTimeout(resolve, ms);
            if (t.unref) t.unref();
        });

    const readStream = async () => {
        streamAbort = new AbortController();
        let silenceTimer = null;
        const resetSilence = () => {
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => streamAbort.abort(), limits.streamSilenceMs);
            if (silenceTimer.unref) silenceTimer.unref();
        };
        try {
            resetSilence();
            const res = await fetchImpl(`${apiUrl}/api/sites/_live/strom`, {
                headers: { 'x-bauarbeiter-key': key, accept: 'application/x-ndjson' },
                signal: streamAbort.signal
            });
            if (!res.ok || !res.body) {
                log.warn(`[LIVE] Interne Leitung: Backend antwortet ${res.status}`);
                return false;
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let gotHello = false;
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                resetSilence();
                buffer += decoder.decode(value, { stream: true });
                let index;
                while ((index = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, index);
                    buffer = buffer.slice(index + 1);
                    if (!line.trim()) continue;
                    let event;
                    try {
                        event = JSON.parse(line);
                    } catch {
                        continue;
                    }
                    if (event.t === 'hallo' && !gotHello) {
                        gotHello = true;
                        stats.streamConnected = true;
                        log.info('[LIVE] Interne Leitung zum Backend steht.');
                        if (everConnected) {
                            stats.streamReconnects++;
                            broadcast({ typ: 'wieder-da' });
                        }
                        everConnected = true;
                    } else if (event.t === 'n' && typeof event.o === 'string' && typeof event.k === 'string') {
                        deliver(event.o, event.k, event.d);
                    }
                }
            }
            return gotHello;
        } catch (error) {
            if (running) log.warn(`[LIVE] Interne Leitung unterbrochen: ${error.message}`);
            return false;
        } finally {
            clearTimeout(silenceTimer);
            stats.streamConnected = false;
        }
    };

    const runStream = async () => {
        let wait = limits.streamRetryMinMs;
        while (running) {
            const wasConnected = await readStream();
            if (!running) break;
            wait = wasConnected ? limits.streamRetryMinMs : Math.min(wait * 2, limits.streamRetryMaxMs);
            await sleep(wait);
        }
    };

    // ---------------------------------------------------------------------
    // REGELMÄSSIG: Ping an alle (und Tote erkennen), Zutritt neu prüfen
    // ---------------------------------------------------------------------
    let pingTimer = null;
    let recheckTimer = null;

    const pingAll = () => {
        for (const conn of connections) {
            if (!conn.alive) {
                conn.ws.terminate(); // hat auf den letzten Ping nicht geantwortet
                continue;
            }
            conn.alive = false;
            try {
                conn.ws.ping();
            } catch {
                // egal – beim nächsten Mal wird getrennt
            }
            send(conn, { typ: 'ping' });
        }
    };

    const recheckAll = async () => {
        for (const conn of [...connections]) {
            if (conn.closed || conn.subs.size === 0) continue;
            const pfade = [...new Set([...conn.subs.values()].map(s => s.pfad))];
            const answer = await askAccess(conn, pfade);
            if (conn.closed) continue;
            if (answer.tokenInvalid) {
                conn.ws.close(CLOSE.ABGEMELDET, 'Abgemeldet');
                continue;
            }
            if (!answer.data) continue; // Backend gerade weg: beim nächsten Mal
            for (const [subKey, sub] of [...conn.subs]) {
                if (answer.data.erlaubt[sub.pfad] !== sub.uuid) {
                    removeListener(conn, subKey);
                    send(conn, {
                        typ: 'abo-fehler',
                        pfad: sub.pfad,
                        kanal: sub.kanal,
                        fehler: 'Kein Zugriff oder nicht gefunden.'
                    });
                }
            }
        }
    };

    // ---------------------------------------------------------------------
    // ZAHLEN FÜRS COCKPIT (W4b): alle 30 s pro Website, wie viele Verbindungen und
    // Kanäle es gerade gibt -> POST /api/sites/_live/zahlen. Nur Zahlen, nie wer.
    // Gezählt werden Verbindungen mit mindestens einem Abo (die anderen wissen noch
    // nicht, wohin sie gehören, und werden nach einer Minute ohnehin getrennt).
    // ---------------------------------------------------------------------
    const countsPerSite = () => {
        const sites = {};
        for (const conn of connections) {
            if (conn.closed || conn.subs.size === 0) continue;
            const entry = sites[conn.site] || (sites[conn.site] = { verbindungen: 0, kanaele: new Set() });
            entry.verbindungen++;
            for (const sub of conn.subs.values()) entry.kanaele.add(sub.listenKey);
        }
        const out = {};
        for (const [name, e] of Object.entries(sites))
            out[name] = { verbindungen: e.verbindungen, kanaele: e.kanaele.size };
        return out;
    };
    const reportCounts = async () => {
        try {
            const res = await fetchImpl(`${apiUrl}/api/sites/_live/zahlen`, {
                method: 'POST',
                headers: { 'x-bauarbeiter-key': key, 'content-type': 'application/json' },
                body: JSON.stringify({ websites: countsPerSite() }),
                signal: AbortSignal.timeout(limits.accessTimeoutMs)
            });
            if (!res.ok) log.warn(`[LIVE] Zahlen melden: Backend antwortet ${res.status}`);
        } catch (error) {
            log.warn(`[LIVE] Zahlen melden: Backend nicht erreichbar (${error.message})`);
        }
    };
    let reportTimer = null;

    const start = () => {
        if (running || !key) return;
        running = true;
        runStream();
        pingTimer = setInterval(pingAll, limits.pingMs);
        recheckTimer = setInterval(() => {
            recheckAll().catch(error => log.warn(`[LIVE] Neu prüfen fehlgeschlagen: ${error.message}`));
        }, limits.recheckMs);
        reportTimer = setInterval(reportCounts, limits.reportMs);
        if (reportTimer.unref) reportTimer.unref();
        if (pingTimer.unref) pingTimer.unref();
        if (recheckTimer.unref) recheckTimer.unref();
    };

    const stop = () => {
        running = false;
        clearInterval(pingTimer);
        clearInterval(recheckTimer);
        clearInterval(reportTimer);
        if (streamAbort) streamAbort.abort();
        for (const conn of [...connections]) conn.ws.terminate();
        wss.close();
    };

    const getStats = () => ({
        connections: connections.size,
        channels: listeners.size,
        delivered: stats.delivered,
        streamConnected: stats.streamConnected,
        streamReconnects: stats.streamReconnects
    });

    return { handleUpgrade, start, stop, getStats, deliver, recheckAll, pingAll, countsPerSite, reportCounts };
};

module.exports = { createLive, visitorIpFromRaw, LIVE_PATH, CLOSE, DEFAULT_LIMITS };
