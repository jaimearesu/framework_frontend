// tests/siteLogin.test.mjs
// ---------------------------------------------------------------------
// LOGIN AUF WEBSITES, ETAPPE 3: der Bauarbeiter
// (Plan "Login auf Websites", 20.10.2026)
//
// Teil 1: die Bausteine in site/login.js (Cookies, Rücksprung, Zustand)
// Teil 2: der ganze Bauarbeiter als echter Server, das Backend nachgebaut.
//
// Geprüft wird vor allem, was ein Angreifer versuchen würde:
//   - offene Weiterleitung über ?zurueck=
//   - Rücksprung ohne/mit falschem Zustand (fremdes Login unterschieben)
//   - SSF-Aufruf von einer fremden Seite oder Nachbar-Website (Origin)
//   - persönliche Seiten im gemeinsamen Zwischenspeicher
//   - Ausweis an das JavaScript der Website (HttpOnly)
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const login = require('../site/login.js');
const { BauplanCache } = require('../site/cache.js');
const { createBauarbeiter } = require('../site/bauarbeiter.js');

// ---------------------------------------------------------------------
// TEIL 1: BAUSTEINE
// ---------------------------------------------------------------------
describe('Bausteine (site/login.js)', () => {
    test('Rücksprung: nur Pfade auf dieser Website', () => {
        assert.equal(login.safeReturnPath('/'), '/');
        assert.equal(login.safeReturnPath('/kunden/bereich?x=1'), '/kunden/bereich?x=1');
        for (const bad of [
            'https://evil.example',
            '//evil.example',
            '/\\evil.example',
            'evil',
            '/a\nb',
            '/_at0mic/logout',
            '/' + 'a'.repeat(600),
            '',
            null,
            ['/']
        ]) {
            assert.equal(login.safeReturnPath(bad), '/', String(bad));
        }
    });

    test('Cookies: __Host- und Secure nur auf dem Server, immer HttpOnly + SameSite=Lax', () => {
        assert.deepEqual(login.cookieNames(true), { ausweis: '__Host-at0mic_ausweis', login: '__Host-at0mic_login' });
        assert.deepEqual(login.cookieNames(false), { ausweis: 'at0mic_ausweis', login: 'at0mic_login' });
        const server = login.serializeCookie('__Host-x', 'v', { maxAge: 60, isProduction: true });
        assert.equal(server, '__Host-x=v; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure');
        const local = login.serializeCookie('x', '', { maxAge: 0, isProduction: false });
        assert.equal(local, 'x=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
        assert.deepEqual(login.parseCookies('a=1; b = 2;c=x=y; a=9'), { a: '1', b: '2', c: 'x=y' });
    });

    test('Login-Cookie: Zustand + Rücksprung, kaputt = null', () => {
        const state = login.newState();
        assert.match(state, /^[A-Za-z0-9_-]{43}$/);
        assert.deepEqual(login.decodeLogin(login.encodeLogin(state, '/seite')), { state, returnPath: '/seite' });
        assert.equal(login.decodeLogin(login.encodeLogin(state, '//evil')).returnPath, '/');
        for (const bad of ['', 'kurz.Lw', `${state}`, `${state}.a.b`, null]) assert.equal(login.decodeLogin(bad), null);
        assert.equal(login.sameState(state, state), true);
        assert.equal(login.sameState(state, login.newState()), false);
        assert.equal(login.sameState(state, undefined), false);
    });
});

// ---------------------------------------------------------------------
// TEIL 2: DER GANZE BAUARBEITER
// ---------------------------------------------------------------------
const KEY = 'k'.repeat(40);
const TOKEN = 'at0s_' + 'A'.repeat(43);
const OTHER_TOKEN = 'at0s_' + 'B'.repeat(43);
const COOKIE = `__Host-at0mic_ausweis=${TOKEN}`;

// Nachgebautes Backend
const backend = { calls: [], sites: {}, runs: {}, ausweis: null, besucher: null };

const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: h => headers[h.toLowerCase()] ?? null },
    json: async () => body
});

const fakeFetch = async (url, options = {}) => {
    const call = {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.parse(options.body) : null
    };
    backend.calls.push(call);
    const rest = decodeURIComponent(url.split('/api/sites/')[1]);
    const token = call.headers['x-besucher-ausweis'];
    if (rest.endsWith('/ausweis')) return backend.ausweis || reply(400, { error: 'ungültig', code: 'LOGIN_INVALID' });
    // Screenshot mit Live-Daten (Plan "Screenshots", S2b)
    if (rest.endsWith('/vorschau-ausweis')) {
        return backend.vorschau || reply(400, { error: 'ungültig', code: 'LOGIN_INVALID' });
    }
    if (rest.endsWith('/abmelden')) return reply(200, { success: true });
    if (rest.endsWith('/besucher')) {
        if (token === TOKEN) return reply(200, { success: true, data: { angemeldet: true, uuid: 'kunde-uuid' } });
        return reply(
            200,
            { success: true, data: { angemeldet: false } },
            token ? { 'x-besucher-ausweis-status': 'ungueltig' } : {}
        );
    }
    if (rest.includes('/run/')) {
        return reply(200, { success: true, result: { mitAusweis: !!token } });
    }
    // Bauplan: pro Website eine Funktion (token) -> Antwort
    const fn = backend.sites[rest];
    return fn ? fn(token) : reply(404, { error: 'Keine Website' });
};

const plan = (files, personal = false) =>
    reply(200, { success: true, data: { bauplan: 1, files, cache: 60 }, meta: personal ? { personal: true } : {} });

let server, port, cache, personalCache;
let now = Date.now(); // Uhr des privaten Speichers (im Test steuerbar)

const request = (host, path = '/', { method = 'GET', cookie, origin, body, contentType } = {}) =>
    new Promise((resolve, reject) => {
        const headers = { host };
        if (cookie) headers.cookie = cookie;
        if (origin) headers.origin = origin;
        if (contentType) headers['content-type'] = contentType;
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', c => (text += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
        });
        req.on('error', reject);
        req.end(body);
    });

const setCookies = r => [].concat(r.headers['set-cookie'] || []);
const cookieValue = (r, name) => {
    const line = setCookies(r).find(c => c.startsWith(`${name}=`));
    return line === undefined ? undefined : line.split(';')[0].slice(name.length + 1);
};

before(async () => {
    cache = new BauplanCache();
    personalCache = new BauplanCache({ now: () => now });
    const app = express();
    app.set('trust proxy', 1);
    app.use(
        createBauarbeiter({
            apiUrl: 'http://backend.intern',
            key: KEY,
            siteDomain: 'at0mic.site',
            isProduction: true,
            fetchImpl: fakeFetch,
            cache,
            personalCache,
            log: { warn: () => {}, error: () => {} },
            loginUrl: 'https://api.at0mic.ch'
        })
    );
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
});

after(() => new Promise(r => server.close(r)));

beforeEach(() => {
    backend.calls = [];
    backend.sites = {};
    backend.ausweis = null;
    backend.vorschau = null;
    cache.clear();
    personalCache.clear();
    now = Date.now();
});

describe('Anmelden: /_at0mic/login und /_at0mic/callback', () => {
    test('Start: Zustand ins Cookie, weiter zu at0mic (öffentliche Adresse)', async () => {
        const r = await request('shop.at0mic.site', '/_at0mic/login?zurueck=%2Fkunden');
        assert.equal(r.status, 302);
        const to = new URL(r.headers.location);
        assert.equal(to.origin, 'https://api.at0mic.ch');
        assert.equal(to.pathname, '/site-login');
        assert.equal(to.searchParams.get('site'), 'shop');
        const state = to.searchParams.get('state');
        const started = login.decodeLogin(cookieValue(r, '__Host-at0mic_login'));
        assert.equal(started.state, state);
        assert.equal(started.returnPath, '/kunden');
        const line = setCookies(r)[0];
        assert.match(line, /HttpOnly/);
        assert.match(line, /Secure/);
        assert.match(line, /Max-Age=600/);
        assert.equal(backend.calls.length, 0, 'fragt das Backend dabei nicht');
    });

    test('Start mit fremdem Rücksprung: zurück nur auf die Startseite', async () => {
        const r = await request('shop.at0mic.site', '/_at0mic/login?zurueck=https%3A%2F%2Fevil.example');
        assert.equal(login.decodeLogin(cookieValue(r, '__Host-at0mic_login')).returnPath, '/');
    });

    test('Rücksprung mit richtigem Zustand: Ausweis tauschen, Cookie setzen, zurück', async () => {
        const state = login.newState();
        const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        backend.ausweis = reply(200, { success: true, data: { token: TOKEN, expiresAt: expires } });

        const r = await request('shop.at0mic.site', `/_at0mic/callback?code=${'c'.repeat(43)}&state=${state}`, {
            cookie: `__Host-at0mic_login=${login.encodeLogin(state, '/kunden')}`
        });
        assert.equal(r.status, 303);
        assert.equal(r.headers.location, '/kunden');
        assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), TOKEN);
        assert.equal(cookieValue(r, '__Host-at0mic_login'), '', 'Login-Cookie wird gelöscht');
        const ausweisLine = setCookies(r).find(c => c.startsWith('__Host-at0mic_ausweis='));
        assert.match(ausweisLine, /HttpOnly; SameSite=Lax; Secure/);
        assert.match(ausweisLine, /Max-Age=60[0-9]{4}/); // ~7 Tage

        const call = backend.calls[0];
        assert.equal(call.url, 'http://backend.intern/api/sites/shop/ausweis');
        assert.equal(call.method, 'POST');
        assert.equal(call.headers['x-bauarbeiter-key'], KEY);
        assert.deepEqual(call.body, { code: 'c'.repeat(43), state });
    });

    test('Rücksprung OHNE oder mit FALSCHEM Zustand: abgelehnt, Backend wird nicht gefragt', async () => {
        const state = login.newState();
        for (const cookie of [undefined, `__Host-at0mic_login=${login.encodeLogin(login.newState(), '/')}`]) {
            const r = await request('shop.at0mic.site', `/_at0mic/callback?code=${'c'.repeat(43)}&state=${state}`, {
                cookie
            });
            assert.equal(r.status, 400);
            assert.match(r.body, /Anmeldung hat nicht geklappt/);
            assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), undefined);
        }
        assert.equal(backend.calls.length, 0);
    });

    test('Backend lehnt den Code ab: Fehlerseite, kein Ausweis', async () => {
        const state = login.newState();
        const r = await request('shop.at0mic.site', `/_at0mic/callback?code=${'c'.repeat(43)}&state=${state}`, {
            cookie: `__Host-at0mic_login=${login.encodeLogin(state, '/')}`
        });
        assert.equal(r.status, 400);
        assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), undefined);
    });

    test('abgebrochen: zurück, ohne Backend', async () => {
        const state = login.newState();
        const r = await request('shop.at0mic.site', `/_at0mic/callback?error=abgebrochen&state=${state}`, {
            cookie: `__Host-at0mic_login=${login.encodeLogin(state, '/seite')}`
        });
        assert.equal(r.status, 303);
        assert.equal(r.headers.location, '/seite');
        assert.equal(backend.calls.length, 0);
    });

    test('falsche Methode: 405', async () => {
        assert.equal((await request('shop.at0mic.site', '/_at0mic/login', { method: 'POST' })).status, 405);
        assert.equal((await request('shop.at0mic.site', '/_at0mic/me', { method: 'POST' })).status, 405);
    });
});

describe('Angemeldet unterwegs', () => {
    test('Ausweis geht ans Backend; persönliche Seite nie in den Speicher, nie im Browser gespeichert', async () => {
        let asked = 0;
        backend.sites.shop = token => {
            asked++;
            return token === TOKEN ? plan({ 'index.html': 'Hallo Kunde' }, true) : plan({ 'index.html': 'Öffentlich' });
        };
        const mine = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(mine.body, 'Hallo Kunde');
        assert.equal(mine.headers['cache-control'], 'private, no-store');
        assert.equal(backend.calls[0].headers['x-besucher-ausweis'], TOKEN);

        // Ein anonymer Besucher danach sieht NIE die persönliche Seite
        const anon = await request('shop.at0mic.site', '/');
        assert.equal(anon.body, 'Öffentlich');
        assert.equal(anon.headers['cache-control'], 'no-cache');
        assert.equal(asked, 2);

        // Angemeldet kommt die Seite jetzt aus dem PRIVATEN Speicher (nur für diesen Ausweis)
        const again = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(again.body, 'Hallo Kunde');
        assert.equal(again.headers['cache-control'], 'private, no-store', 'auch aus dem Speicher nie öffentlich');
        assert.equal(asked, 2, 'nicht nochmals gebaut');
        // … der gemeinsame Speicher kennt die persönliche Seite nicht
        assert.equal(cache.get('shop').bauplan.files['index.html'], 'Öffentlich');
    });

    test('fremde Cookies werden nie weitergereicht, Unsinn im Cookie = anonym', async () => {
        backend.sites.shop = () => plan({ 'index.html': 'x' });
        await request('shop.at0mic.site', '/', { cookie: `andere=1; __Host-at0mic_ausweis=unsinn` });
        const call = backend.calls[0];
        assert.equal(call.headers['x-besucher-ausweis'], undefined);
        assert.equal(call.headers.cookie, undefined);
    });

    test('privat: Seite "Anmelden" mit Rücksprung auf dieselbe Seite', async () => {
        backend.sites.shop = () => reply(401, { error: 'privat', code: 'SITE_LOGIN_REQUIRED' });
        const r = await request('shop.at0mic.site', '/kunden?x=1');
        assert.equal(r.status, 401);
        assert.match(r.body, /Diese Website ist privat/);
        assert.match(r.body, /href="\/_at0mic\/login\?zurueck=%2Fkunden%3Fx%3D1"/);
    });

    test('angemeldet ohne Recht: Seite "Kein Zugriff" mit Abmelden', async () => {
        backend.sites.shop = () => reply(403, { error: 'nein', code: 'SITE_NO_ACCESS' });
        const r = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(r.status, 403);
        assert.match(r.body, /Kein Zugriff/);
        assert.match(r.body, /href="\/_at0mic\/logout\?zurueck=%2F"/);
    });

    test('Website wird privat: alter öffentlicher Stand wird sofort vergessen', async () => {
        backend.sites.shop = () => plan({ 'index.html': 'öffentlich' });
        cache.setSite('shop', { files: { 'index.html': 'alt' }, cache: 0 });
        backend.sites.shop = () => reply(401, { error: 'privat', code: 'SITE_LOGIN_REQUIRED' });
        assert.equal((await request('shop.at0mic.site', '/')).status, 401);
        assert.equal(cache.get('shop'), undefined);
    });

    test('Backend sagt "Ausweis ungültig": Cookie wird gelöscht', async () => {
        backend.sites.shop = () =>
            reply(
                200,
                { success: true, data: { bauplan: 1, files: { 'index.html': 'x' } }, meta: {} },
                {
                    'x-besucher-ausweis-status': 'ungueltig'
                }
            );
        const r = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(r.status, 200);
        assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), '');
    });
});

describe('SSF-Aufrufe mit Ausweis: nur von der eigenen Website', () => {
    const run = (origin, cookie = COOKIE) =>
        request('shop.at0mic.site', '/_at0mic/run/api', {
            method: 'POST',
            contentType: 'application/json',
            body: '{}',
            cookie,
            origin
        });

    test('von der eigenen Website: mit Ausweis', async () => {
        const r = await run('https://shop.at0mic.site');
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.body), { result: { mitAusweis: true } });
    });

    test('von einer Nachbar-Website oder fremden Seite: 403, Backend wird nicht gefragt', async () => {
        for (const origin of ['https://evil.at0mic.site', 'https://evil.example', 'http://shop.at0mic.site', 'null']) {
            const r = await run(origin);
            assert.equal(r.status, 403, origin);
        }
        assert.equal(backend.calls.length, 0);
    });

    test('ohne Herkunft (kein Browser): läuft, aber OHNE Ausweis', async () => {
        const r = await run(undefined);
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.body), { result: { mitAusweis: false } });
    });
});

describe('Abmelden und "wer bin ich?"', () => {
    test('/_at0mic/me: angemeldet nur die UUID, sonst angemeldet: false (nie der Ausweis)', async () => {
        const mine = await request('shop.at0mic.site', '/_at0mic/me', { cookie: COOKIE });
        assert.deepEqual(JSON.parse(mine.body), { angemeldet: true, uuid: 'kunde-uuid' });
        assert.doesNotMatch(mine.body, /at0s_/);
        assert.equal(mine.headers['cache-control'], 'no-store');

        const anon = await request('shop.at0mic.site', '/_at0mic/me');
        assert.deepEqual(JSON.parse(anon.body), { angemeldet: false });

        const old = await request('shop.at0mic.site', '/_at0mic/me', {
            cookie: `__Host-at0mic_ausweis=${OTHER_TOKEN}`
        });
        assert.deepEqual(JSON.parse(old.body), { angemeldet: false });
        assert.equal(cookieValue(old, '__Host-at0mic_ausweis'), '', 'ungültiger Ausweis wird gelöscht');
    });

    test('Abmelden per Link: im Backend gesperrt, Cookie gelöscht, sicherer Rücksprung', async () => {
        const r = await request('shop.at0mic.site', '/_at0mic/logout?zurueck=%2F%2Fevil.example', { cookie: COOKIE });
        assert.equal(r.status, 303);
        assert.equal(r.headers.location, '/');
        assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), '');
        const call = backend.calls.find(c => c.url.endsWith('/abmelden'));
        assert.deepEqual(call.body, { token: TOKEN });
        assert.equal(call.headers['x-bauarbeiter-key'], KEY);
    });

    test('Abmelden per POST: nur von der eigenen Website', async () => {
        const evil = await request('shop.at0mic.site', '/_at0mic/logout', {
            method: 'POST',
            cookie: COOKIE,
            origin: 'https://evil.at0mic.site'
        });
        assert.equal(evil.status, 403);
        const ok = await request('shop.at0mic.site', '/_at0mic/logout', {
            method: 'POST',
            cookie: COOKIE,
            origin: 'https://shop.at0mic.site'
        });
        assert.equal(ok.status, 200);
        assert.deepEqual(JSON.parse(ok.body), { ok: true });
    });
});

describe('Kein Zugriff: eigene at0mic-ID (Etappe 6, Entscheidung H)', () => {
    test('zeigt die eigene ID – nur wenn sie wie eine UUID aussieht, maskiert', async () => {
        const id = '12345678-1234-1234-1234-123456789abc';
        backend.sites.shop = () => reply(403, { error: 'nein', code: 'SITE_NO_ACCESS', besucher: id });
        const r = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(r.status, 403);
        assert.match(r.body, new RegExp(`Deine at0mic-ID: ${id}`));

        backend.sites.shop = () =>
            reply(403, { error: 'nein', code: 'SITE_NO_ACCESS', besucher: '<script>x</script>' });
        const bad = await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.doesNotMatch(bad.body, /at0mic-ID|<script>x/);
    });
});

describe('Privater Zwischenspeicher für Angemeldete (gefunden 20.10.: 7× bauen pro Seite)', () => {
    const personalPlan = () =>
        plan({ 'index.html': 'Hallo Kunde', 'style.css': 'x', 'js/1.js': '1', 'js/2.js': '2' }, true);

    test('alle Dateien einer Seite GLEICHZEITIG: nur EINE Anfrage ans Backend', async () => {
        let asked = 0;
        backend.sites.shop = () => {
            asked++;
            return personalPlan();
        };
        const files = ['/', '/style.css', '/js/1.js', '/js/2.js', '/', '/style.css', '/js/1.js'];
        const results = await Promise.all(files.map(f => request('shop.at0mic.site', f, { cookie: COOKIE })));
        assert.ok(results.every(r => r.status === 200));
        assert.equal(asked, 1);
    });

    test('nach 30 Sekunden wird neu gebaut (Rechte können sich ändern)', async () => {
        let asked = 0;
        backend.sites.shop = () => {
            asked++;
            return personalPlan();
        };
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        now += 29 * 1000;
        await request('shop.at0mic.site', '/style.css', { cookie: COOKIE });
        assert.equal(asked, 1);
        now += 2 * 1000;
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(asked, 2);
    });

    test('nie länger, als der Bauplan selbst will (cache 5 s)', async () => {
        let asked = 0;
        backend.sites.shop = () => {
            asked++;
            return reply(200, {
                success: true,
                data: { bauplan: 1, files: { 'index.html': 'x' }, cache: 5 },
                meta: { personal: true }
            });
        };
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        now += 6 * 1000;
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(asked, 2);
    });

    test('jeder Ausweis hat seinen EIGENEN Speicher', async () => {
        backend.sites.shop = token =>
            token === TOKEN ? plan({ 'index.html': 'Seite A' }, true) : plan({ 'index.html': 'Seite B' }, true);
        assert.equal((await request('shop.at0mic.site', '/', { cookie: COOKIE })).body, 'Seite A');
        const b = await request('shop.at0mic.site', '/', { cookie: `__Host-at0mic_ausweis=${OTHER_TOKEN}` });
        assert.equal(b.body, 'Seite B');
        assert.equal(
            (await request('shop.at0mic.site', '/')).body,
            'Seite B',
            'anonym: nur über das Backend, nie aus einem privaten Speicher'
        );
    });

    test('Abmelden löscht den privaten Speicher sofort', async () => {
        let asked = 0;
        backend.sites.shop = () => {
            asked++;
            return personalPlan();
        };
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        await request('shop.at0mic.site', '/_at0mic/logout', { cookie: COOKIE });
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        assert.equal(asked, 2);
    });

    test('Ausweis wird ungültig: privater Speicher weg', async () => {
        let valid = true;
        backend.sites.shop = () =>
            valid
                ? personalPlan()
                : reply(
                      401,
                      { error: 'privat', code: 'SITE_LOGIN_REQUIRED' },
                      { 'x-besucher-ausweis-status': 'ungueltig' }
                  );
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        valid = false;
        now += 31 * 1000; // abgelaufen -> fragt neu -> "ungueltig"
        assert.equal((await request('shop.at0mic.site', '/', { cookie: COOKIE })).status, 401);
        valid = true;
        assert.equal(personalCache.size, 0);
    });

    test('der Ausweis steht nie im Klartext im Speicher-Index', async () => {
        backend.sites.shop = () => personalPlan();
        await request('shop.at0mic.site', '/', { cookie: COOKIE });
        const keys = [...personalCache.entries.keys()];
        assert.equal(keys.length, 1);
        assert.equal(keys[0].includes(TOKEN), false);
        assert.match(keys[0], /^shop\|[0-9a-f]{64}$/);
    });
});

// Plan "Screenshots in der Vorschau", S2b: Cloudflare öffnet /_at0mic/vorschau?code=…
describe('Screenshot mit Live-Daten: /_at0mic/vorschau', () => {
    const CODE = 's'.repeat(43);

    test('Code gültig: Ausweis höchstens 2 Minuten, weiter zur Startseite, Code geht nirgends weiter', async () => {
        backend.vorschau = reply(200, { success: true, data: { token: TOKEN, expiresAt: 'egal', seconds: 120 } });
        const r = await request('shop.at0mic.site', `/_at0mic/vorschau?code=${CODE}`);
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, '/');
        assert.equal(r.headers['referrer-policy'], 'no-referrer');
        assert.equal(r.headers['cache-control'], 'no-store');
        assert.equal(cookieValue(r, '__Host-at0mic_ausweis'), TOKEN);
        assert.match(
            setCookies(r).find(c => c.startsWith('__Host-at0mic_ausweis=')),
            /Max-Age=120; HttpOnly; SameSite=Lax; Secure/
        );
        const call = backend.calls[0];
        assert.equal(call.url, 'http://backend.intern/api/sites/shop/vorschau-ausweis');
        assert.equal(call.headers['x-bauarbeiter-key'], KEY);
        assert.deepEqual(call.body, { code: CODE, host: '' });
    });

    test('mehr als 2 Minuten vom Backend? Das Cookie gilt trotzdem höchstens 120 s', async () => {
        backend.vorschau = reply(200, { success: true, data: { token: TOKEN, seconds: 999999 } });
        const r = await request('shop.at0mic.site', `/_at0mic/vorschau?code=${CODE}`);
        assert.match(
            setCookies(r).find(c => c.startsWith('__Host-at0mic_ausweis=')),
            /Max-Age=120;/
        );
    });

    test('Backend lehnt ab oder kein Code: Fehlerseite, kein Ausweis', async () => {
        const bad = await request('shop.at0mic.site', `/_at0mic/vorschau?code=${CODE}`);
        assert.equal(bad.status, 400);
        assert.equal(cookieValue(bad, '__Host-at0mic_ausweis'), undefined);
        const none = await request('shop.at0mic.site', '/_at0mic/vorschau');
        assert.equal(none.status, 400);
        assert.equal(backend.calls.length, 1, 'ohne Code wird das Backend nicht gefragt');
    });

    test('nur GET', async () => {
        const r = await request('shop.at0mic.site', `/_at0mic/vorschau?code=${CODE}`, { method: 'POST' });
        assert.equal(r.status, 405);
    });

    // Plan "Geo-Monitor", G4: Unterseite fotografieren (preview_site mit path)
    test('ziel: weiter zur Unterseite – mit "?" und "#"', async () => {
        backend.vorschau = reply(200, { success: true, data: { token: TOKEN, seconds: 120 } });
        const r = await request(
            'shop.at0mic.site',
            `/_at0mic/vorschau?code=${CODE}&ziel=${encodeURIComponent('/?tab=karte#/detail/3')}`
        );
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, '/?tab=karte#/detail/3');
        // Der Code geht nur ans Backend – das Ziel nicht
        assert.deepEqual(backend.calls[0].body, { code: CODE, host: '' });
    });

    test('SICHERHEIT: ziel auf eine fremde Adresse -> Startseite (keine offene Weiterleitung)', async () => {
        for (const ziel of [
            'https://böse.example/',
            '//böse.example',
            '/\\böse.example',
            '/_at0mic/logout',
            'kein-pfad'
        ]) {
            backend.vorschau = reply(200, { success: true, data: { token: TOKEN, seconds: 120 } });
            const r = await request(
                'shop.at0mic.site',
                `/_at0mic/vorschau?code=${CODE}&ziel=${encodeURIComponent(ziel)}`
            );
            assert.equal(r.status, 302, ziel);
            assert.equal(r.headers.location, '/', ziel);
        }
    });
});
