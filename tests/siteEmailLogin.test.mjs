// tests/siteEmailLogin.test.mjs
// ---------------------------------------------------------------------
// BESUCHER-LOGIN PER E-MAIL-CODE, ETAPPE E3: das Formular im Bauarbeiter
//
// Der ganze Bauarbeiter als echter Server, das Backend nachgebaut.
// Geprüft wird vor allem, was schiefgehen darf:
//   - Formular von einer fremden Seite abschicken
//   - Zustand aus dem Formular statt aus dem Cookie
//   - Adresse als HTML (XSS), Adresse in URLs oder Logs
//   - die Marke vindelis auf den Seiten für Besucher
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const login = require('../site/login.js');
const emailLogin = require('../site/emailLogin.js');
const { BauplanCache } = require('../site/cache.js');
const { createBauarbeiter } = require('../site/bauarbeiter.js');

const KEY = 'k'.repeat(40);
const TOKEN = 'at0s_' + 'A'.repeat(43);
const STATE = 'S'.repeat(43);
const HOST = 'shop.at0mic.site';
const ORIGIN = `https://${HOST}`;
const ADDRESS = 'gast@example.ch';
const LOGIN_COOKIE = '__Host-at0mic_login';
const AUSWEIS_COOKIE = '__Host-at0mic_ausweis';
const cookieHeader = (state = STATE, back = '/kunden') => `${LOGIN_COOKIE}=${login.encodeLogin(state, back)}`;

const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: h => headers[h.toLowerCase()] ?? null },
    json: async () => body
});

const backend = {};
const logged = [];

const fakeFetch = async (url, options = {}) => {
    if (backend.down) throw new Error('weg');
    const call = {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.parse(options.body) : null
    };
    backend.calls.push(call);
    const rest = decodeURIComponent(url.split('/api/sites/')[1]);
    if (rest === '_host/www.laden.ch') return reply(200, { data: { name: 'shop' } });
    if (rest.endsWith('/email-login')) return reply(200, { success: true, data: { aktiv: backend.active } });
    if (rest.endsWith('/anfordern')) return backend.request || reply(200, { success: true });
    if (rest.endsWith('/pruefen')) {
        return (
            backend.verify ||
            reply(200, {
                success: true,
                data: { token: TOKEN, expiresAt: new Date(Date.now() + 3600000).toISOString() }
            })
        );
    }
    return backend.site || reply(404, { error: 'Keine Website' });
};

const uses = suffix => backend.calls.filter(c => c.url.endsWith(suffix));

let server, port;

const request = (path, { method = 'GET', cookie, origin, body, host = HOST, lang } = {}) =>
    new Promise((resolve, reject) => {
        const headers = { host };
        if (cookie) headers.cookie = cookie;
        if (origin) headers.origin = origin;
        if (lang) headers['accept-language'] = lang;
        if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', c => (text += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
        });
        req.on('error', reject);
        req.end(body);
    });

const post = (path, fields, options = {}) =>
    request(path, {
        method: 'POST',
        origin: ORIGIN,
        cookie: cookieHeader(),
        body: new URLSearchParams(fields).toString(),
        ...options
    });

const setCookies = r => [].concat(r.headers['set-cookie'] || []);
const cookieLine = (r, name) => setCookies(r).find(c => c.startsWith(`${name}=`));
// Was der Besucher liest: ohne Kopf und ohne Tags
const visibleText = html => html.slice(html.indexOf('<body>')).replace(/<[^>]*>/g, ' ');

before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    const note = (...args) => logged.push(args.join(' '));
    app.use(
        createBauarbeiter({
            apiUrl: 'http://backend.intern',
            key: KEY,
            siteDomain: ['at0mic.site', 'vindelis.site'],
            isProduction: true,
            fetchImpl: fakeFetch,
            cache: new BauplanCache(),
            personalCache: new BauplanCache(),
            log: { warn: note, error: note },
            loginUrl: 'https://api.at0mic.ch',
            cockpitHosts: ['vindelis.com']
        })
    );
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
});

after(() => new Promise(r => server.close(r)));

beforeEach(() => {
    Object.assign(backend, { calls: [], active: true, down: false, request: null, verify: null, site: null });
    logged.length = 0;
});

describe('Bausteine', () => {
    test('Sprache: die erste, die wir können', () => {
        assert.equal(emailLogin.pickLang('de-CH,de;q=0.9'), 'de');
        assert.equal(emailLogin.pickLang('fr-CH, en;q=0.8, de;q=0.7'), 'en');
        assert.equal(emailLogin.pickLang('fr'), 'de');
        assert.equal(emailLogin.pickLang(undefined), 'de');
    });

    test('Formular lesen: Leerzeichen im Code weg, zu lange Adresse leer', () => {
        const parse = text => emailLogin.parseForm(Buffer.from(text));
        assert.deepEqual(parse('email=+a%40b.ch+&code=123+456'), { email: 'a@b.ch', code: '123456' });
        assert.equal(parse(`email=${'a'.repeat(400)}`).email, '');
        assert.deepEqual(parse(''), { email: '', code: '' });
    });

    test('Eine Adresse kann nie zu HTML werden', () => {
        const evil = '"><script>alert(1)</script>';
        const html = emailLogin.codePage({ lang: 'de', email: evil, restartHref: '/x' });
        assert.equal(html.includes('<script>'), false);
        assert.ok(html.includes('&lt;script&gt;'));
    });
});

describe('Formular zeigen', () => {
    test('Ist der Login an: Formular statt Weiterleitung, Zustand im Cookie', async () => {
        const r = await request('/_vindelis/login?zurueck=%2Fkunden');
        assert.equal(r.status, 200);
        assert.equal(r.headers.location, undefined);
        assert.ok(r.body.includes('Bei shop anmelden'));
        assert.equal(r.headers['cache-control'], 'no-store');
        assert.match(r.headers['content-security-policy'], /default-src 'none'/);
        assert.match(r.headers['content-security-policy'], /form-action 'self'/);
        const line = cookieLine(r, LOGIN_COOKIE);
        assert.match(line, /HttpOnly/);
        assert.equal(login.decodeLogin(line.split(';')[0].slice(LOGIN_COOKIE.length + 1)).returnPath, '/kunden');
    });

    test('Kein Wort von vindelis und kein Skript auf den Seiten', async () => {
        const first = await request('/_vindelis/login');
        const second = await post('/_vindelis/login-email', { email: ADDRESS });
        for (const r of [first, second]) {
            assert.equal(/vindelis|at0mic/i.test(visibleText(r.body)), false);
            assert.equal(r.body.includes('<script'), false);
        }
    });

    test('Englisch, wenn der Browser es will', async () => {
        const r = await request('/_vindelis/login', { lang: 'en-GB,en;q=0.9' });
        assert.ok(r.body.includes('Sign in to shop'));
        assert.match(r.body, /<html lang="en">/);
    });

    test('Ist der Login aus: weiter zum vindelis-Login wie bisher', async () => {
        backend.active = false;
        const r = await request('/_vindelis/login');
        assert.equal(r.status, 302);
        assert.equal(new URL(r.headers.location).pathname, '/site-login');
    });

    test('Backend weg: kein Absturz, normaler Weg', async () => {
        backend.down = true;
        assert.equal((await request('/_vindelis/login')).status, 302);
    });

    test('?mit=vindelis führt die Besitzerin am Formular vorbei', async () => {
        const r = await request('/_vindelis/login?mit=vindelis');
        assert.equal(r.status, 302);
        assert.equal(uses('/email-login').length, 0);
    });

    test('Eigene Domain: Formular nennt sie, Absenden geht von dort', async () => {
        const host = 'www.laden.ch';
        const r = await request('/_vindelis/login', { host });
        assert.ok(r.body.includes('Bei www.laden.ch anmelden'));
        const sent = await post('/_vindelis/login-email', { email: ADDRESS }, { host, origin: `https://${host}` });
        assert.equal(sent.status, 200);
        assert.equal(uses('/shop/email-login/anfordern').length, 1);
    });
});

describe('Website "angemeldet" ohne Anmeldung', () => {
    const closed = () => reply(401, { code: 'SITE_LOGIN_REQUIRED' });

    test('Mit E-Mail-Login direkt zum Formular, die Seite bleibt gemerkt', async () => {
        backend.site = closed();
        const r = await request('/kunden?x=1');
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, '/_vindelis/login?zurueck=%2Fkunden%3Fx%3D1');
    });

    test('Ohne E-Mail-Login die Seite wie bisher', async () => {
        backend.site = closed();
        backend.active = false;
        const r = await request('/');
        assert.equal(r.status, 401);
        assert.ok(r.body.includes('vindelis-Konto'));
    });
});

describe('Code anfordern', () => {
    test('Adresse und Zustand aus dem Cookie gehen ans Backend, Seite 2 kommt', async () => {
        const r = await post('/_vindelis/login-email', { email: ADDRESS, state: 'B'.repeat(43) });
        assert.equal(r.status, 200);
        const [call] = uses('/email-login/anfordern');
        assert.deepEqual(call.body, { email: ADDRESS, state: STATE });
        assert.equal(call.headers['x-bauarbeiter-key'], KEY);
        assert.ok(r.body.includes('Falls <!--email_off-->gast<wbr>@example.ch<!--email_on-->'));
        // Cloudflare darf die Adresse im Text nicht finden, sonst steht dort "[email protected]".
        // Im versteckten Feld fasst Cloudflare sie nicht an (das Einlösen klappte live).
        assert.equal(r.body.replace(`value="${ADDRESS}"`, '').includes(ADDRESS), false);
        assert.match(r.body, /autocomplete="one-time-code"/);
        // Das Cookie lebt jetzt wieder volle 10 Minuten
        assert.match(cookieLine(r, LOGIN_COOKIE), /Max-Age=600/);
    });

    test('Fremde Seite oder gar keine Herkunft: nichts passiert', async () => {
        for (const origin of ['https://andere.at0mic.site', 'https://evil.example', undefined]) {
            const r = await post('/_vindelis/login-email', { email: ADDRESS }, { origin });
            assert.equal(r.status, 403, String(origin));
        }
        assert.equal(backend.calls.length, 0);
    });

    test('Ohne Login-Cookie: Formular neu, kein Versand', async () => {
        const r = await post('/_vindelis/login-email', { email: ADDRESS }, { cookie: undefined });
        assert.equal(r.status, 200);
        assert.ok(r.body.includes('zu lange gedauert'));
        assert.equal(uses('/email-login/anfordern').length, 0);
        assert.ok(cookieLine(r, LOGIN_COOKIE));
    });

    test('Auch geteilt wird die Adresse nie zu HTML', () => {
        const html = emailLogin.codePage({ lang: 'de', email: '<img src=x>@<b>.ch', restartHref: '/x' });
        assert.equal(html.includes('<img'), false);
        assert.equal(html.includes('<b>'), false);
    });

    test('Ungültige Adresse: zurück zum Formular', async () => {
        backend.request = reply(400, { code: 'EMAIL_INVALID' });
        const r = await post('/_vindelis/login-email', { email: 'nix' });
        assert.equal(r.status, 400);
        assert.ok(r.body.includes('gültige E-Mail-Adresse'));
    });

    test('Bremse: 429 mit Wartezeit', async () => {
        backend.request = reply(429, { code: 'TOO_MANY' }, { 'retry-after': '120' });
        const r = await post('/_vindelis/login-email', { email: ADDRESS });
        assert.equal(r.status, 429);
        assert.equal(r.headers['retry-after'], '120');
    });

    test('Login inzwischen aus oder Backend weg: neutrale Seite', async () => {
        backend.request = reply(404, {});
        assert.equal((await post('/_vindelis/login-email', { email: ADDRESS })).status, 503);
        backend.request = null;
        backend.down = true;
        assert.equal((await post('/_vindelis/login-email', { email: ADDRESS })).status, 503);
    });

    test('Zu grosses Formular', async () => {
        const r = await post('/_vindelis/login-email', { email: 'a'.repeat(5000) });
        assert.equal(r.status, 400);
        assert.equal(backend.calls.length, 0);
    });

    test('GET geht nicht', async () => {
        const r = await request('/_vindelis/login-email');
        assert.equal(r.status, 405);
        assert.equal(r.headers.allow, 'POST');
    });

    test('Adressen stehen nie im Log', async () => {
        backend.down = true;
        await post('/_vindelis/login-email', { email: ADDRESS });
        await post('/_vindelis/login-code', { email: ADDRESS, code: '123456' });
        assert.ok(logged.length > 0);
        assert.equal(logged.join(' ').includes(ADDRESS), false);
    });
});

describe('Code prüfen', () => {
    test('Richtig: Ausweis als Cookie, Login-Cookie weg, zurück zur Seite', async () => {
        const r = await post('/_vindelis/login-code', { email: ADDRESS, code: '123 456' });
        assert.equal(r.status, 303);
        assert.equal(r.headers.location, '/kunden');
        assert.deepEqual(uses('/email-login/pruefen')[0].body, { email: ADDRESS, code: '123456', state: STATE });
        const line = cookieLine(r, AUSWEIS_COOKIE);
        assert.ok(line.startsWith(`${AUSWEIS_COOKIE}=${TOKEN}`));
        assert.match(line, /HttpOnly/);
        assert.match(line, /Secure/);
        assert.match(cookieLine(r, LOGIN_COOKIE), /Max-Age=0/);
    });

    test('Falsch: nochmals versuchen möglich, kein Ausweis', async () => {
        backend.verify = reply(400, { code: 'LOGIN_INVALID' });
        const r = await post('/_vindelis/login-code', { email: ADDRESS, code: '000000' });
        assert.equal(r.status, 400);
        assert.ok(r.body.includes('Der Code stimmt nicht'));
        assert.ok(r.body.includes(`value="${ADDRESS}"`));
        assert.equal(cookieLine(r, AUSWEIS_COOKIE), undefined);
        assert.equal(cookieLine(r, LOGIN_COOKIE), undefined);
    });

    test('Eine seltsame Antwort des Backends wird nie zum Cookie', async () => {
        backend.verify = reply(200, { data: { token: 'kaputt; Domain=evil.example', expiresAt: 'x' } });
        const r = await post('/_vindelis/login-code', { email: ADDRESS, code: '123456' });
        assert.equal(r.status, 400);
        assert.equal(cookieLine(r, AUSWEIS_COOKIE), undefined);
    });

    test('Fremde Seite: nichts passiert', async () => {
        const r = await post(
            '/_vindelis/login-code',
            { email: ADDRESS, code: '123456' },
            { origin: 'https://evil.example' }
        );
        assert.equal(r.status, 403);
        assert.equal(backend.calls.length, 0);
    });

    test('Der alte Name /_at0mic/ geht auch', async () => {
        assert.equal((await post('/_at0mic/login-code', { email: ADDRESS, code: '123456' })).status, 303);
    });
});
