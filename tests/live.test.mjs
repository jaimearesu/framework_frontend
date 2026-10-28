// tests/live.test.mjs
// ---------------------------------------------------------------------
// LIVE-VERBINDUNGEN IM BAUARBEITER (Plan "W – Live-Verbindungen", W2 + W3)
//
// Teil 1: die WebSocket-Tür (site/live.js) als echter Server mit echten
//         WebSockets. Das Backend ist nachgebaut: Zutritt (fetchImpl) und die
//         interne Leitung (ein Strom, in den der Test Zeilen schreibt).
// Teil 2: das Skript für Websites (site/liveClient.js) in einem nachgebauten
//         Browser mit einem falschen WebSocket.
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const { createLive, visitorIpFromRaw, CLOSE } = require('../site/live.js');
const { LIVE_SCRIPT } = require('../site/liveClient.js');

const KEY = 'k'.repeat(40);
const API = 'http://backend.test';
const API_UUID = '11111111-1111-4111-8111-111111111111';
const PRIV_UUID = '22222222-2222-4222-8222-222222222222';
const silent = { info() {}, warn() {}, error() {} };
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------
// Das nachgebaute Backend
// ---------------------------------------------------------------------
const backend = {
    calls: [], // Zutritts-Fragen: { site, pfade, headers }
    erlaubt: { api: API_UUID }, // was der Zutritt erlaubt
    maxVerbindungen: 100,
    tokenInvalid: false,
    regeln: {}, // F-3b: Live-Regeln pro Pfad (wie aus der DNA)
    angemeldet: false,
    streams: [], // offene interne Leitungen (Controller zum Hineinschreiben)
    reports: [] // 30-s-Berichte an das Backend
};
const resetBackend = () => {
    backend.calls = [];
    backend.erlaubt = { api: API_UUID };
    backend.maxVerbindungen = 100;
    backend.tokenInvalid = false;
    backend.regeln = {};
    backend.angemeldet = false;
};
const pushLine = obj => {
    const line = new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
    for (const s of backend.streams) {
        try {
            s.enqueue(line);
        } catch {
            // geschlossen
        }
    }
};
const fakeFetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/api/sites/_live/strom') {
        assert.equal(init.headers['x-bauarbeiter-key'], KEY);
        let controller;
        const body = new ReadableStream({
            start(c) {
                controller = c;
                backend.streams.push(c);
                c.enqueue(new TextEncoder().encode('{"t":"hallo"}\n'));
            },
            cancel() {
                backend.streams = backend.streams.filter(s => s !== controller);
            }
        });
        init.signal?.addEventListener('abort', () => {
            backend.streams = backend.streams.filter(s => s !== controller);
            try {
                controller.error(new Error('abgebrochen'));
            } catch {
                // schon zu
            }
        });
        return new Response(body, { status: 200 });
    }
    // 30-s-Bericht (W4b) – seit der Härtungs-Runde mit "probleme" (Abweisungen)
    if (u.pathname === '/api/sites/_live/zahlen') {
        backend.reports.push(JSON.parse(init.body));
        return new Response('{"success":true}', { status: 200 });
    }
    const m = /^\/api\/sites\/([^/]+)\/live\/zutritt$/.exec(u.pathname);
    if (m) {
        const { pfade } = JSON.parse(init.body);
        backend.calls.push({ site: m[1], pfade, headers: init.headers });
        const erlaubt = Object.fromEntries(pfade.map(p => [p, backend.erlaubt[p] || null]));
        const headers = backend.tokenInvalid ? { 'x-besucher-ausweis-status': 'ungueltig' } : {};
        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    erlaubt,
                    regeln: Object.fromEntries(pfade.map(p => [p, backend.regeln[p] || null])),
                    angemeldet: backend.angemeldet,
                    konto: `konto-${m[1] === 'zwei' ? 'b' : 'a'}`,
                    maxVerbindungen: backend.maxVerbindungen
                }
            }),
            { status: 200, headers }
        );
    }
    return new Response('{}', { status: 404 });
};

// Adresse -> Website (wie der Bauarbeiter): *.site.localhost, sonst keine
const resolveHost = async host => {
    const m = /^([a-z0-9-]+)\.site\.localhost(:\d+)?$/.exec(String(host || ''));
    return m ? { name: m[1], custom: null } : null;
};

// ---------------------------------------------------------------------
// Ein echter Server mit der WebSocket-Tür
// ---------------------------------------------------------------------
let server, port, live;
const startLive = async (limits = {}, extra = {}) => {
    live = createLive({ apiUrl: API, key: KEY, resolveHost, fetchImpl: fakeFetch, log: silent, limits, ...extra });
    server = http.createServer((req, res) => res.end('kein upgrade'));
    server.on('upgrade', (req, socket, head) => live.handleUpgrade(req, socket, head));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    live.start();
    for (let i = 0; i < 50 && backend.streams.length === 0; i++) await wait(10);
};
const stopLive = async () => {
    live.stop();
    server.closeAllConnections();
    await new Promise(r => server.close(r));
};

// Einen Browser-WebSocket öffnen und alles mitschreiben
const connect = (site = 'shop', { origin, cookie, forwardedFor } = {}) =>
    new Promise(resolve => {
        const host = `${site}.site.localhost:${port}`;
        const headers = { host, origin: origin === undefined ? `http://${host}` : origin };
        if (origin === null) delete headers.origin;
        if (cookie) headers.cookie = cookie;
        if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
        const ws = new WebSocket(`ws://127.0.0.1:${port}/_at0mic/live`, { headers });
        const client = { ws, messages: [], status: null, closed: null };
        ws.on('message', data => client.messages.push(JSON.parse(data.toString())));
        ws.on('unexpected-response', (req, res) => {
            client.status = res.statusCode;
            resolve(client);
        });
        ws.on('open', () => resolve(client));
        ws.on('close', (code, reason) => {
            client.closed = { code, reason: reason.toString() };
        });
        ws.on('error', () => resolve(client));
    });
const until = async (fn, ms = 1000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (fn()) return true;
        await wait(10);
    }
    return false;
};
const lastOf = (client, typ) => [...client.messages].reverse().find(m => m.typ === typ);
const abo = async (client, pfad = 'api', kanal = 'chat') => {
    client.ws.send(JSON.stringify({ typ: 'abo', pfad, kanal }));
    await until(() => client.messages.some(m => (m.typ === 'abo-ok' || m.typ === 'abo-fehler') && m.pfad === pfad));
    return client.messages.find(m => (m.typ === 'abo-ok' || m.typ === 'abo-fehler') && m.pfad === pfad);
};

describe('Teil 1: die WebSocket-Tür', () => {
    before(() => startLive());
    after(() => stopLive());
    beforeEach(resetBackend);

    test('Verbinden: "hallo"; falsche Adresse 404, fremde Herkunft 403, ohne Herkunft 403', async () => {
        const ok = await connect();
        assert.equal(ok.status, null);
        await until(() => ok.messages.length > 0);
        // F-3b: mit eigener Verbindungs-ID (zufällig, 12 Zeichen)
        assert.equal(ok.messages[0].typ, 'hallo');
        assert.match(ok.messages[0].id, /^[A-Za-z0-9_-]{12}$/);
        ok.ws.close();

        const foreign = await connect('shop', { origin: 'http://andere.site.localhost:1' });
        assert.equal(foreign.status, 403, 'L5: eine Nachbar-Website darf nicht verbinden');
        const noOrigin = await connect('shop', { origin: null });
        assert.equal(noOrigin.status, 403);

        const wrongPath = await new Promise(resolve => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}/_at0mic/anders`, {
                headers: { host: `shop.site.localhost:${port}`, origin: `http://shop.site.localhost:${port}` }
            });
            ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
            ws.on('error', () => resolve('error'));
        });
        assert.equal(wrongPath, 404);
    });

    test('Abo erlaubt -> Nachrichten kommen an; nicht erlaubt -> abo-fehler (gleiche Meldung)', async () => {
        backend.erlaubt = { api: API_UUID };
        const c = await connect();
        assert.deepEqual(await abo(c, 'api', 'chat'), { typ: 'abo-ok', pfad: 'api', kanal: 'chat' });
        const denied = await abo(c, 'privat', 'chat');
        assert.deepEqual(denied, {
            typ: 'abo-fehler',
            code: 'KEIN_ZUGRIFF', // F-3e: Code für die Website
            pfad: 'privat',
            kanal: 'chat',
            fehler: 'Kein Zugriff oder nicht gefunden.'
        });
        assert.equal(backend.calls[0].site, 'shop');
        assert.equal(backend.calls[0].headers['x-bauarbeiter-key'], KEY);

        pushLine({ t: 'n', o: API_UUID, k: 'chat', d: { text: 'Hallo' } });
        pushLine({ t: 'n', o: API_UUID, k: 'anderer-kanal', d: 'nicht für mich' });
        pushLine({ t: 'n', o: PRIV_UUID, k: 'chat', d: 'auch nicht' });
        assert.ok(await until(() => lastOf(c, 'nachricht')));
        await wait(50);
        const got = c.messages.filter(m => m.typ === 'nachricht');
        assert.deepEqual(got, [{ typ: 'nachricht', pfad: 'api', kanal: 'chat', daten: { text: 'Hallo' } }]);

        // "ende": danach kommt nichts mehr
        c.ws.send(JSON.stringify({ typ: 'ende', pfad: 'api', kanal: 'chat' }));
        await wait(50);
        pushLine({ t: 'n', o: API_UUID, k: 'chat', d: 'zu spät' });
        await wait(50);
        assert.equal(c.messages.filter(m => m.typ === 'nachricht').length, 1);
        c.ws.close();
    });

    test('der Ausweis geht nur mit, wenn er im Cookie steht; ungültig -> trennen (4401)', async () => {
        const token = `at0s_${'a'.repeat(43)}`;
        const c = await connect('shop', { cookie: `at0mic_ausweis=${token}` });
        await abo(c);
        assert.equal(backend.calls.at(-1).headers['x-besucher-ausweis'], token);

        backend.tokenInvalid = true;
        const c2 = await connect('shop', { cookie: `at0mic_ausweis=${token}` });
        c2.ws.send(JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'chat' }));
        assert.ok(await until(() => c2.closed));
        assert.equal(c2.closed.code, CLOSE.ABGEMELDET);
        c.ws.close();
    });

    test('Konto-Grenze (L4): mehr als maxVerbindungen -> VOLL (4429)', async () => {
        backend.maxVerbindungen = 1;
        const a = await connect();
        assert.equal((await abo(a)).typ, 'abo-ok');
        const b = await connect();
        b.ws.send(JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'chat' }));
        assert.ok(await until(() => b.closed));
        assert.equal(b.closed.code, CLOSE.VOLL);
        assert.equal(lastOf(b, 'fehler').code, 'VOLL');
        // Härtungs-Runde Punkt 3: die Abweisung geht mit dem nächsten Bericht ans Backend
        backend.reports = [];
        await live.reportCounts();
        assert.equal(backend.reports[0].probleme.shop.VOLL, 1);
        await live.reportCounts();
        assert.deepEqual(backend.reports[1].probleme, {}, 'danach wird von vorne gezählt');
        // Eine andere Website eines anderen Kontos ist nicht betroffen
        const z = await connect('zwei');
        assert.equal((await abo(z)).typ, 'abo-ok');
        // Wird a geschlossen, ist wieder Platz
        a.ws.close();
        await wait(50);
        const c = await connect();
        assert.equal((await abo(c)).typ, 'abo-ok');
        z.ws.close();
        c.ws.close();
    });

    test('Prüfungen: ungültige Nachrichten, ungültiger Pfad, kein Senden an andere', async () => {
        const c = await connect();
        c.ws.send('kein json');
        c.ws.send(JSON.stringify({ typ: 'senden', an: 'alle', text: 'Spam' }));
        c.ws.send(JSON.stringify({ typ: 'abo', pfad: '../x', kanal: 'chat' }));
        c.ws.send(JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'mit leerzeichen' }));
        c.ws.send(JSON.stringify({ typ: 'ping' }));
        await until(() => c.messages.some(m => m.typ === 'pong'));
        assert.equal(c.messages.filter(m => m.typ === 'fehler').length, 2);
        assert.equal(c.messages.filter(m => m.typ === 'abo-fehler').length, 2);
        assert.equal(backend.calls.length, 0, 'Ungültiges geht nie ans Backend');
        c.ws.close();
    });

    test('Bremse: zu viele Nachrichten vom Browser -> trennen (4408)', async () => {
        const c = await connect();
        for (let i = 0; i < 40; i++) c.ws.send(JSON.stringify({ typ: 'ping' }));
        assert.ok(await until(() => c.closed));
        assert.equal(c.closed.code, CLOSE.ZU_VIEL);
    });

    test('Neu prüfen: wird etwas privat, hört der Besucher nicht mehr mit', async () => {
        const c = await connect();
        await abo(c);
        backend.erlaubt = {}; // jetzt nicht mehr sichtbar
        await live.recheckAll();
        assert.ok(await until(() => lastOf(c, 'abo-fehler')));
        pushLine({ t: 'n', o: API_UUID, k: 'chat', d: 'geheim' });
        await wait(50);
        assert.equal(c.messages.filter(m => m.typ === 'nachricht').length, 0);
        c.ws.close();
    });

    test('interne Leitung bricht ab -> neu verbinden und "wieder-da" an alle', async () => {
        const c = await connect();
        await abo(c);
        // Leitung vom Backend her schliessen
        for (const s of backend.streams) s.close();
        backend.streams = [];
        assert.ok(await until(() => lastOf(c, 'wieder-da'), 3000), 'wieder-da kommt nach dem Neuverbinden');
        assert.equal(live.getStats().streamReconnects, 1);
        pushLine({ t: 'n', o: API_UUID, k: 'chat', d: 'nach dem Abbruch' });
        assert.ok(await until(() => lastOf(c, 'nachricht')));
        c.ws.close();
    });
});

// ---------------------------------------------------------------------
// Plan "F", F-3b: flüchtig senden, Presence, Räume mit Ticket, ausser
// ---------------------------------------------------------------------
const crypto = require('crypto');
const { verifyTicket } = require('../site/liveTicket.js');
// Ein Ticket so ausstellen, wie es das Backend tut (framework/src/services/liveTicket.js)
const makeTicket = (objectUuid, kanal, seconds = 600) => {
    const key = crypto.createHash('sha256').update(`at0mic-live-ticket\n${KEY}`).digest();
    const payload = Buffer.from(
        JSON.stringify({ o: objectUuid, k: kanal, e: Math.floor(Date.now() / 1000) + seconds })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', key).update(`lt1.${payload}`).digest('base64url');
    return `lt1.${payload}.${sig}`;
};
const rule = (extra = {}) => ({
    browser: false,
    proSekunde: 10,
    maxBytes: 512,
    wer: 'alle',
    presence: false,
    ticket: false,
    ...extra
});
const msgs = (client, typ) => client.messages.filter(m => m.typ === typ);
const idOf = client => client.messages.find(m => m.typ === 'hallo').id;
const sendJson = (client, obj) => client.ws.send(JSON.stringify(obj));
const hallo = async client => {
    await until(() => client.messages.some(m => m.typ === 'hallo'));
    return client;
};

describe('Teil 5: flüchtig, Presence, Räume (Plan "F", F-3b)', () => {
    before(() => startLive());
    after(() => stopLive());
    beforeEach(resetBackend);

    test('Ticket-Regel wie im Backend: festes Ticket aus dem Backend wird erkannt', () => {
        // erzeugt mit framework/src/services/liveTicket.js signTicket (Schlüssel 'k' x 40, 1.1.2026 + 1 h)
        const ticket =
            'lt1.eyJvIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwiayI6ImJvYXJkLTEiLCJlIjoxNzY3MjI5MjAwfQ.0PxMU9VjS0bVjjEc-MUDs-zD4kjg0tYYQBhjKIemKOs';
        const now = Date.UTC(2026, 0, 1);
        const args = { ticket, objectUuid: API_UUID, kanal: 'board-1', baseKey: KEY };
        assert.equal(verifyTicket({ ...args, now }), true);
        assert.equal(verifyTicket({ ...args, now: now + 3601 * 1000 }), false, 'abgelaufen');
        assert.equal(verifyTicket({ ...args, kanal: 'board-2', now }), false);
    });

    test('ohne Regel: Browser darf nicht senden (E1); nicht abonniert: auch nicht (E2)', async () => {
        const a = await hallo(await connect());
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'chat', daten: { x: 1 } });
        await until(() => msgs(a, 'fehler').length > 0);
        assert.equal(msgs(a, 'fehler')[0].code, 'NICHT_ABONNIERT');
        await abo(a);
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'chat', daten: { x: 1 } });
        await until(() => msgs(a, 'fehler').length > 1);
        assert.equal(msgs(a, 'fehler')[1].code, 'NICHT_ERLAUBT');
        a.ws.close();
    });

    test('mit Regel: an alle anderen, mit "von" vom Bauarbeiter, ohne Echo; Felder und Grösse geprüft', async () => {
        backend.regeln = { api: { kanaele: { cursor: rule({ browser: true, felder: ['x', 'y'], maxBytes: 64 }) } } };
        const a = await hallo(await connect());
        const b = await hallo(await connect());
        await abo(a, 'api', 'cursor');
        await abo(b, 'api', 'cursor');
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { x: 10, y: 20 }, von: 'gefaelscht' });
        assert.ok(await until(() => msgs(b, 'nachricht').length === 1));
        assert.deepEqual(msgs(b, 'nachricht')[0], {
            typ: 'nachricht',
            pfad: 'api',
            kanal: 'cursor',
            daten: { x: 10, y: 20 },
            von: idOf(a),
            fluechtig: true
        });
        await wait(50);
        assert.equal(msgs(a, 'nachricht').length, 0, 'kein Echo');

        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { x: 1, farbe: 'rot' } });
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { x: 'x'.repeat(100) } });
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: [1, 2] });
        await until(() => msgs(a, 'fehler').length >= 3);
        assert.deepEqual(
            msgs(a, 'fehler').map(m => m.code),
            ['FELDER', 'ZU_GROSS', 'FORMAT']
        );
        assert.equal(msgs(b, 'nachricht').length, 1, 'nichts davon kam an');
        a.ws.close();
        b.ws.close();
    });

    test('Takt pro Kanal: zu viel wird verworfen (ein Hinweis); wer: angemeldet', async () => {
        backend.regeln = {
            api: {
                kanaele: {
                    cursor: rule({ browser: true, proSekunde: 3 }),
                    intern: rule({ browser: true, wer: 'angemeldet' })
                }
            }
        };
        const a = await hallo(await connect());
        const b = await hallo(await connect());
        await abo(a, 'api', 'cursor');
        await abo(b, 'api', 'cursor');
        for (let i = 0; i < 10; i++) sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { i } });
        await until(() => msgs(b, 'nachricht').length >= 3);
        await wait(80);
        assert.equal(msgs(b, 'nachricht').length, 3);
        assert.equal(msgs(a, 'fehler').filter(m => m.code === 'TAKT').length, 1);

        sendJson(a, { typ: 'abo', pfad: 'api', kanal: 'intern' });
        await until(() => a.messages.some(m => m.typ === 'abo-ok' && m.kanal === 'intern'));
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'intern', daten: { x: 1 } });
        await until(() => msgs(a, 'fehler').some(m => m.code === 'NICHT_ERLAUBT'));
        assert.match(msgs(a, 'fehler').find(m => m.code === 'NICHT_ERLAUBT').fehler, /angemeldet/);
        a.ws.close();
        b.ws.close();
    });

    test('mehr als 60 flüchtige Nachrichten pro Sekunde -> trennen (4408)', async () => {
        backend.regeln = { api: { kanaele: { cursor: rule({ browser: true, proSekunde: 30 }) } } };
        const a = await hallo(await connect());
        await abo(a, 'api', 'cursor');
        for (let i = 0; i < 70; i++) sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { i } });
        assert.ok(await until(() => a.closed));
        assert.equal(a.closed.code, CLOSE.ZU_VIEL);
    });

    test('Presence: Liste für Neue, join/update für andere, leave beim Schliessen', async () => {
        backend.regeln = { api: { kanaele: { 'raum-*': rule({ presence: true }) } } };
        const a = await hallo(await connect());
        const b = await hallo(await connect());
        await abo(a, 'api', 'raum-1');
        sendJson(a, { typ: 'da', pfad: 'api', kanal: 'raum-1', zustand: { name: 'Anna' } });
        assert.ok(await until(() => msgs(a, 'anwesend').length === 1));
        assert.deepEqual(msgs(a, 'anwesend')[0].liste, []);

        await abo(b, 'api', 'raum-1');
        sendJson(b, { typ: 'da', pfad: 'api', kanal: 'raum-1', zustand: { name: 'Beat' } });
        assert.ok(await until(() => msgs(b, 'anwesend').length === 1));
        assert.deepEqual(msgs(b, 'anwesend')[0].liste, [{ von: idOf(a), zustand: { name: 'Anna' } }]);
        assert.ok(await until(() => msgs(a, 'join').length === 1));
        assert.equal(msgs(a, 'join')[0].von, idOf(b));

        sendJson(a, { typ: 'da', pfad: 'api', kanal: 'raum-1', zustand: { name: 'Anna', tippt: true } });
        assert.ok(await until(() => msgs(b, 'update').length === 1));
        assert.deepEqual(msgs(b, 'update')[0].zustand, { name: 'Anna', tippt: true });

        sendJson(a, { typ: 'da', pfad: 'api', kanal: 'raum-1', zustand: { x: 'x'.repeat(600) } });
        await until(() => msgs(a, 'fehler').some(m => m.code === 'ZU_GROSS'));

        b.ws.close();
        assert.ok(await until(() => msgs(a, 'leave').length === 1), 'Leitung weg -> leave');
        assert.equal(msgs(a, 'leave')[0].von, idOf(b));
        a.ws.close();
    });

    test('Presence ohne Regel: abgelehnt', async () => {
        const a = await hallo(await connect());
        await abo(a, 'api', 'chat');
        sendJson(a, { typ: 'da', pfad: 'api', kanal: 'chat', zustand: {} });
        await until(() => msgs(a, 'fehler').length > 0);
        assert.equal(msgs(a, 'fehler')[0].code, 'NICHT_ERLAUBT');
        a.ws.close();
    });

    test('Raum mit Ticket: ohne/mit falschem Ticket abo-fehler, mit gültigem abo-ok', async () => {
        backend.regeln = { api: { kanaele: { 'board-*': rule({ ticket: true }) } } };
        const a = await hallo(await connect());
        const ohne = await abo(a, 'api', 'board-1');
        assert.equal(ohne.typ, 'abo-fehler');
        assert.equal(ohne.code, 'TICKET');
        const b = await hallo(await connect());
        b.ws.send(
            JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'board-1', ticket: makeTicket(API_UUID, 'board-2') })
        );
        await until(() => b.messages.some(m => m.typ === 'abo-fehler' || m.typ === 'abo-ok'));
        assert.ok(msgs(b, 'abo-fehler').length === 1, 'Ticket für einen anderen Raum');
        const c = await hallo(await connect());
        c.ws.send(
            JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'board-1', ticket: makeTicket(API_UUID, 'board-1') })
        );
        assert.ok(await until(() => msgs(c, 'abo-ok').length === 1));
        a.ws.close();
        b.ws.close();
        c.ws.close();
    });

    test('ausser: die Nachricht der SSF geht an alle ausser an diese Verbindung', async () => {
        const a = await hallo(await connect());
        const b = await hallo(await connect());
        await abo(a);
        await abo(b);
        pushLine({ t: 'n', o: API_UUID, k: 'chat', d: { text: 'hi' }, a: idOf(a) });
        assert.ok(await until(() => msgs(b, 'nachricht').length === 1));
        await wait(50);
        assert.equal(msgs(a, 'nachricht').length, 0);
        a.ws.close();
        b.ws.close();
    });

    test('Neu prüfen: Regel entfernt -> Senden nicht mehr erlaubt', async () => {
        backend.regeln = { api: { kanaele: { cursor: rule({ browser: true }) } } };
        const a = await hallo(await connect());
        await abo(a, 'api', 'cursor');
        backend.regeln = {};
        await live.recheckAll();
        sendJson(a, { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { x: 1 } });
        await until(() => msgs(a, 'fehler').length > 0);
        assert.equal(msgs(a, 'fehler')[0].code, 'NICHT_ERLAUBT');
        a.ws.close();
    });
});

describe('Teil 1b: Grenzen pro IP und ohne Abo', () => {
    before(() => startLive({ maxPerIp: 2, idleNoSubscriptionMs: 100 }, { trustProxyHops: 1 }));
    after(() => stopLive());
    beforeEach(resetBackend);

    test('höchstens maxPerIp Verbindungen pro Besucher-IP (aus X-Forwarded-For)', async () => {
        const a = await connect('shop', { forwardedFor: '198.51.100.1' });
        const b = await connect('shop', { forwardedFor: '198.51.100.1' });
        const c = await connect('shop', { forwardedFor: '198.51.100.1' });
        assert.equal(c.status, 429);
        const other = await connect('shop', { forwardedFor: '198.51.100.2' });
        assert.equal(other.status, null);
        for (const x of [a, b, other]) x.ws.close();
    });

    test('ohne ein einziges Abo wird nach kurzer Zeit getrennt', async () => {
        const c = await connect();
        assert.ok(await until(() => c.closed, 2000));
        assert.equal(c.closed.code, CLOSE.UNGENUTZT);
    });
});

describe('Besucher-IP aus der rohen Anfrage', () => {
    const req = (xff, remote) => ({
        headers: xff ? { 'x-forwarded-for': xff } : {},
        socket: { remoteAddress: remote }
    });
    test('wie "trust proxy" mit einer Zahl', () => {
        assert.equal(visitorIpFromRaw(req('203.0.113.5', '10.0.0.2'), 1), '203.0.113.5');
        // Cloudflare + Traefik: der vorderste von zwei Zwischenhalten
        assert.equal(visitorIpFromRaw(req('203.0.113.5, 172.68.1.1', '10.0.0.2'), 2), '203.0.113.5');
        // gefälschter Eintrag ganz vorne zählt nicht
        assert.equal(visitorIpFromRaw(req('6.6.6.6, 203.0.113.5', '10.0.0.2'), 1), '203.0.113.5');
        assert.equal(visitorIpFromRaw(req(null, '::ffff:127.0.0.1'), 1), '127.0.0.1');
    });
});

// ---------------------------------------------------------------------
// TEIL 2: das Skript für Websites in einem nachgebauten Browser
// ---------------------------------------------------------------------
describe('Teil 2: at0mic.live im Browser', () => {
    const makeBrowser = () => {
        const sockets = [];
        class FakeWebSocket {
            constructor(url) {
                this.url = url;
                this.readyState = 0;
                this.sent = [];
                sockets.push(this);
            }
            send(text) {
                this.sent.push(JSON.parse(text));
            }
            close(code = 1000) {
                this.readyState = 3;
                this.onclose?.({ code });
            }
            // Helfer für den Test
            open() {
                this.readyState = 1;
                this.onopen?.();
            }
            receive(obj) {
                this.onmessage?.({ data: JSON.stringify(obj) });
            }
        }
        const timers = [];
        const window = {
            location: { protocol: 'https:', host: 'shop.at0mic.site' },
            WebSocket: FakeWebSocket,
            console: { error() {} },
            setTimeout: (fn, ms) => {
                timers.push({ fn, ms });
                return timers.length;
            },
            clearTimeout: () => {},
            Math,
            JSON,
            Object
        };
        window.window = window;
        vm.runInNewContext(LIVE_SCRIPT, window);
        return { window, sockets, timers };
    };

    test('listen öffnet EINE Verbindung, abonniert und liefert Nachrichten', () => {
        const { window, sockets } = makeBrowser();
        const got = [];
        const fehler = [];
        window.at0mic.live.listen('api', 'chat', n => got.push(n), { fehler: t => fehler.push(t) });
        window.at0mic.live.listen('api', 'tisch', () => {});
        assert.equal(sockets.length, 1);
        assert.equal(sockets[0].url, 'wss://shop.at0mic.site/_at0mic/live');
        sockets[0].open();
        assert.deepEqual(sockets[0].sent, [
            { typ: 'abo', pfad: 'api', kanal: 'chat' },
            { typ: 'abo', pfad: 'api', kanal: 'tisch' }
        ]);
        assert.equal(window.at0mic.live.status, 'verbunden');
        sockets[0].receive({ typ: 'nachricht', pfad: 'api', kanal: 'chat', daten: { text: 'Hallo' } });
        sockets[0].receive({ typ: 'abo-fehler', pfad: 'api', kanal: 'chat', fehler: 'Kein Zugriff' });
        assert.deepEqual(got, [{ text: 'Hallo' }]);
        assert.deepEqual(fehler, ['Kein Zugriff']);
    });

    test('nach einer Unterbrechung: neu verbinden, neu abonnieren, wiederDa aufrufen', () => {
        const { window, sockets, timers } = makeBrowser();
        let wiederDa = 0;
        window.at0mic.live.listen('api', 'chat', () => {}, { wiederDa: () => wiederDa++ });
        sockets[0].open();
        assert.equal(wiederDa, 0, 'beim ersten Verbinden nicht');
        sockets[0].close(1006);
        assert.equal(window.at0mic.live.status, 'getrennt');
        assert.equal(timers.length, 1);
        assert.ok(timers[0].ms >= 1000 && timers[0].ms < 2000, 'erste Pause etwa 1 s');
        timers[0].fn(); // Pause vorbei
        assert.equal(sockets.length, 2);
        sockets[1].open();
        assert.deepEqual(sockets[1].sent, [{ typ: 'abo', pfad: 'api', kanal: 'chat' }]);
        assert.equal(wiederDa, 1);
        // "wieder-da" vom Bauarbeiter (seine interne Leitung war weg)
        sockets[1].receive({ typ: 'wieder-da' });
        assert.equal(wiederDa, 2);
    });

    test('stopp: letztes listen beendet -> "ende" und Verbindung zu', () => {
        const { window, sockets } = makeBrowser();
        const stopp = window.at0mic.live.listen('api', 'chat', () => {});
        sockets[0].open();
        stopp();
        assert.deepEqual(sockets[0].sent.at(-1), { typ: 'ende', pfad: 'api', kanal: 'chat' });
        assert.equal(sockets[0].readyState, 3);
        assert.throws(() => window.at0mic.live.listen('api'), /listen\(pfad, kanal, funktion\)/);
    });

    // Plan "F", F-3c
    test('id aus "hallo"; publish nur nach listen und erst, wenn das Abo steht; Ticket geht mit', () => {
        const { window, sockets } = makeBrowser();
        const live = window.at0mic.live;
        assert.throws(() => live.publish('api', 'cursor', { x: 1 }), /zuerst vindelis\.live\.listen/);
        const got = [];
        live.listen('api', 'cursor', (daten, info) => got.push({ daten, info }), { ticket: 'lt1.a.b' });
        sockets[0].open();
        assert.deepEqual(sockets[0].sent, [{ typ: 'abo', pfad: 'api', kanal: 'cursor', ticket: 'lt1.a.b' }]);
        sockets[0].receive({ typ: 'hallo', id: 'abcdefghijkl' });
        assert.equal(live.id, 'abcdefghijkl');
        assert.equal(live.publish('api', 'cursor', { x: 1 }), false, 'Abo steht noch nicht');
        sockets[0].receive({ typ: 'abo-ok', pfad: 'api', kanal: 'cursor' });
        assert.equal(live.publish('api', 'cursor', { x: 1 }), true);
        assert.deepEqual(sockets[0].sent.at(-1), { typ: 'senden', pfad: 'api', kanal: 'cursor', daten: { x: 1 } });

        sockets[0].receive({
            typ: 'nachricht',
            pfad: 'api',
            kanal: 'cursor',
            daten: { x: 5 },
            von: 'zzz',
            fluechtig: true
        });
        sockets[0].receive({ typ: 'nachricht', pfad: 'api', kanal: 'cursor', daten: { ssf: true } });
        assert.deepEqual(JSON.parse(JSON.stringify(got)), [
            { daten: { x: 5 }, info: { von: 'zzz', fluechtig: true } },
            { daten: { ssf: true }, info: {} }
        ]);
    });

    test('presence: "da" nach dem Abo, Liste wird geführt, update, stopp -> weg + ende', () => {
        const { window, sockets } = makeBrowser();
        const listen = [];
        const joins = [];
        const ich = window.at0mic.live.presence(
            'api',
            'raum-1',
            { name: 'Anna' },
            {
                liste: alle => listen.push(JSON.parse(JSON.stringify(alle))),
                join: e => joins.push(e.von)
            }
        );
        sockets[0].open();
        assert.deepEqual(sockets[0].sent, [{ typ: 'abo', pfad: 'api', kanal: 'raum-1' }]);
        sockets[0].receive({ typ: 'abo-ok', pfad: 'api', kanal: 'raum-1' });
        assert.deepEqual(sockets[0].sent.at(-1), {
            typ: 'da',
            pfad: 'api',
            kanal: 'raum-1',
            zustand: { name: 'Anna' }
        });

        sockets[0].receive({
            typ: 'anwesend',
            pfad: 'api',
            kanal: 'raum-1',
            liste: [{ von: 'b', zustand: { name: 'Beat' } }]
        });
        sockets[0].receive({ typ: 'join', pfad: 'api', kanal: 'raum-1', von: 'c', zustand: { name: 'Cleo' } });
        sockets[0].receive({ typ: 'leave', pfad: 'api', kanal: 'raum-1', von: 'b' });
        assert.deepEqual(listen, [
            [{ von: 'b', zustand: { name: 'Beat' } }],
            [
                { von: 'b', zustand: { name: 'Beat' } },
                { von: 'c', zustand: { name: 'Cleo' } }
            ],
            [{ von: 'c', zustand: { name: 'Cleo' } }]
        ]);
        assert.deepEqual(joins, ['c']);

        ich.update({ name: 'Anna', tippt: true });
        assert.deepEqual(sockets[0].sent.at(-1).zustand, { name: 'Anna', tippt: true });
        ich.stopp();
        assert.deepEqual(sockets[0].sent.slice(-2), [
            { typ: 'weg', pfad: 'api', kanal: 'raum-1' },
            { typ: 'ende', pfad: 'api', kanal: 'raum-1' }
        ]);
        assert.equal(sockets[0].readyState, 3, 'niemand hört mehr zu -> Verbindung zu');
    });

    // Plan "F", F-3e (Feedback live-board): Fehler mit Code, Laufzeit messen
    test('fehler(text, code): der Code kommt mit (Takt von Fehler unterscheiden)', () => {
        const { window, sockets } = makeBrowser();
        const got = [];
        window.at0mic.live.listen('api', 'cursor', () => {}, { fehler: (text, code) => got.push([text, code]) });
        sockets[0].open();
        sockets[0].receive({ typ: 'fehler', code: 'TAKT', fehler: 'Zu schnell', pfad: 'api', kanal: 'cursor' });
        sockets[0].receive({ typ: 'abo-fehler', code: 'TICKET', fehler: 'Ticket fehlt', pfad: 'api', kanal: 'cursor' });
        assert.deepEqual(got, [
            ['Zu schnell', 'TAKT'],
            ['Ticket fehlt', 'TICKET']
        ]);
    });

    test('ping(): Laufzeit in ms nach dem pong; nicht verbunden: null; zwei gleichzeitig: ein ping', async () => {
        const { window, sockets } = makeBrowser();
        window.Promise = Promise;
        window.Date = Date;
        const live = window.at0mic.live;
        live.listen('api', 'chat', () => {});
        assert.equal(await live.ping(), null, 'noch nicht verbunden');
        sockets[0].open();
        const a = live.ping();
        const b = live.ping();
        assert.equal(sockets[0].sent.filter(m => m.typ === 'ping').length, 1);
        sockets[0].receive({ typ: 'pong' });
        const [msA, msB] = await Promise.all([a, b]);
        assert.ok(Number.isInteger(msA) && msA >= 0 && msA === msB);
    });

    test('presence nach einer Unterbrechung: Liste geleert, nach dem neuen Abo wieder "da"', () => {
        const { window, sockets, timers } = makeBrowser();
        const listen = [];
        window.at0mic.live.presence('api', 'raum-1', { name: 'Anna' }, { liste: alle => listen.push(alle.length) });
        sockets[0].open();
        sockets[0].receive({ typ: 'abo-ok', pfad: 'api', kanal: 'raum-1' });
        sockets[0].receive({ typ: 'anwesend', pfad: 'api', kanal: 'raum-1', liste: [{ von: 'b', zustand: {} }] });
        sockets[0].close(1006);
        assert.deepEqual(listen, [1, 0], 'nach dem Abbruch: leer');
        timers[0].fn();
        sockets[1].open();
        assert.deepEqual(sockets[1].sent, [{ typ: 'abo', pfad: 'api', kanal: 'raum-1' }]);
        sockets[1].receive({ typ: 'abo-ok', pfad: 'api', kanal: 'raum-1' });
        assert.deepEqual(sockets[1].sent.at(-1), {
            typ: 'da',
            pfad: 'api',
            kanal: 'raum-1',
            zustand: { name: 'Anna' }
        });
    });
});

// ---------------------------------------------------------------------
// TEIL 3: die normalen Adressen im Bauarbeiter
// ---------------------------------------------------------------------
describe('Teil 3: /_at0mic/live und /_at0mic/live.js im Bauarbeiter', () => {
    test('ohne WebSocket: 426; das Skript wird als JavaScript ausgeliefert; resolveHost', async () => {
        const express = (await import('express')).default;
        const { createBauarbeiter } = require('../site/bauarbeiter.js');
        const bauarbeiter = createBauarbeiter({
            apiUrl: API,
            key: KEY,
            siteDomain: 'site.localhost',
            fetchImpl: async () => new Response('{}', { status: 404 }),
            log: silent
        });
        const app = express();
        app.use(bauarbeiter);
        const srv = http.createServer(app);
        await new Promise(r => srv.listen(0, '127.0.0.1', r));
        const base = `http://127.0.0.1:${srv.address().port}`;
        const get = path =>
            new Promise((resolve, reject) => {
                http.get(`${base}${path}`, { headers: { host: 'shop.site.localhost' } }, res => {
                    let body = '';
                    res.on('data', c => (body += c));
                    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
                }).on('error', reject);
            });
        const plain = await get('/_at0mic/live');
        assert.equal(plain.status, 426);
        const script = await get('/_at0mic/live.js');
        assert.equal(script.status, 200);
        assert.match(script.headers['content-type'], /text\/javascript/);
        assert.equal(script.body, LIVE_SCRIPT);
        assert.deepEqual(await bauarbeiter.resolveHost('shop.site.localhost:3001'), { name: 'shop', custom: null });
        assert.equal(await bauarbeiter.resolveHost('localhost:3001'), null);
        srv.closeAllConnections();
        await new Promise(r => srv.close(r));
    });
});

describe('Teil 4: Zahlen fürs Cockpit', () => {
    test('Bauarbeiter zählt pro Website Verbindungen mit Abo und verschiedene Kanäle', async () => {
        resetBackend();
        await startLive();
        const a = await connect('shop');
        const b = await connect('shop');
        const c = await connect('zwei');
        const idle = await connect('shop'); // ohne Abo: zählt nicht
        await abo(a, 'api', 'chat');
        await abo(a, 'api', 'tisch');
        await abo(b, 'api', 'chat');
        await abo(c, 'api', 'chat');
        assert.deepEqual(live.countsPerSite(), {
            shop: { verbindungen: 2, kanaele: 2 },
            zwei: { verbindungen: 1, kanaele: 1 }
        });
        for (const x of [a, b, c, idle]) x.ws.close();
        await stopLive();
    });

    test('Text im Cockpit', async () => {
        const { liveCountText } = await import('../public/js/core/site.js');
        assert.equal(liveCountText({ verbindungen: null }), 'unbekannt (der Bauarbeiter meldet sich alle 30 s)');
        assert.equal(liveCountText({ verbindungen: 0, kanaele: 0 }), 'niemand verbunden');
        assert.equal(liveCountText({ verbindungen: 1, kanaele: 1 }), '1 Verbindung · 1 Kanal');
        assert.equal(liveCountText({ verbindungen: 12, kanaele: 3 }), '12 Verbindungen · 3 Kanäle');
    });
});
