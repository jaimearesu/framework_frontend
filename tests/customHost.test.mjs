// tests/customHost.test.mjs
// ---------------------------------------------------------------------
// EIGENE DOMAINS IM BAUARBEITER (Plan "SSF-Ausbau", Etappe D2)
//
// Wie in site.test.mjs läuft der Bauarbeiter als echter Server, das Backend
// ist nachgebaut. Hier MIT cockpitHosts – so wie auf dem Server:
//   www.meinladen.ch       -> Backend fragen: gehört zu Website "meinladen"
//   www.unbekannt.ch       -> keine Website (404), nie das Cockpit
//   at0mic.ch              -> Cockpit
//   meinladen.at0mic.site  -> Umleitung auf www.meinladen.ch (Bauplan sagt es)
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const { classifyHost, pickApiUrl } = require('../site/host.js');
const { createBauarbeiter } = require('../site/bauarbeiter.js');

const KEY = 'k'.repeat(40);
const COCKPIT = ['at0mic.ch', 'www.at0mic.ch'];

describe('Adresse einordnen (classifyHost)', () => {
    const kind = host => classifyHost(host, 'at0mic.site', COCKPIT);
    test('Website, Website-Domain ohne Namen, Cockpit, eigene Domain', () => {
        assert.deepEqual(kind('shop.at0mic.site'), { kind: 'site', name: 'shop', domain: 'at0mic.site' });
        assert.deepEqual(kind('at0mic.site'), { kind: 'siteNoName' });
        assert.deepEqual(kind('a.b.at0mic.site'), { kind: 'siteNoName' });
        assert.deepEqual(kind('at0mic.ch'), { kind: 'cockpit' });
        assert.deepEqual(kind('WWW.at0mic.ch:443'), { kind: 'cockpit' });
        assert.deepEqual(kind('www.meinladen.ch'), { kind: 'custom', hostname: 'www.meinladen.ch' });
        assert.deepEqual(kind('WWW.MeinLaden.ch.'), { kind: 'custom', hostname: 'www.meinladen.ch' });
    });

    test('IP-Adressen, localhost und Leeres gehen ans Cockpit; kaputte Namen nie', () => {
        for (const host of ['91.99.9.201', '127.0.0.1:3001', 'localhost:3001', '[::1]:3001', '']) {
            assert.deepEqual(kind(host), { kind: 'cockpit' }, host);
        }
        for (const host of ['www.mein_laden.ch', 'www..ch', '-x.ch']) {
            assert.deepEqual(kind(host), { kind: 'siteNoName' }, host);
        }
    });
});

describe('Backend fürs Cockpit (pickApiUrl, Umbenennung zu vindelis)', () => {
    const both = ['https://api.vindelis.com', 'https://api.at0mic.ch'];
    test('gleicher Name -> gleiches Backend, sonst das erste', () => {
        assert.equal(pickApiUrl(both, 'vindelis.com'), 'https://api.vindelis.com');
        assert.equal(pickApiUrl(both, 'www.vindelis.com'), 'https://api.vindelis.com');
        assert.equal(pickApiUrl(both, 'at0mic.ch'), 'https://api.at0mic.ch');
        assert.equal(pickApiUrl(both, 'WWW.at0mic.ch:443'), 'https://api.at0mic.ch');
        assert.equal(pickApiUrl(both, 'localhost:3001'), 'https://api.vindelis.com');
        assert.equal(pickApiUrl(['http://localhost:3000'], 'localhost:3001'), 'http://localhost:3000');
    });
});

// ---------------------------------------------------------------------
// Der ganze Bauarbeiter
// ---------------------------------------------------------------------
const backend = { hosts: {}, sites: {}, calls: [], down: false };
const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body
});
const fakeFetch = async (url, options = {}) => {
    backend.calls.push({ url, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
    if (backend.down) throw new Error('connect ECONNREFUSED');
    const rest = decodeURIComponent(url.split('/api/sites/')[1]);
    if (rest.startsWith('_host/')) {
        const name = backend.hosts[rest.slice('_host/'.length)];
        return name
            ? reply(200, { success: true, data: { name } })
            : reply(404, { error: 'Keine aktive eigene Domain.' });
    }
    // Screenshot mit Live-Daten (Plan "Screenshots", S2b): Code gegen 2-Minuten-Ausweis
    // Die alte Screenshot-Tür (abgebaut): würde der Bauarbeiter sie noch fragen, gäbe es hier
    // einen Ausweis – der Test "Screenshot-Link … (abgebaut)" würde den Aufruf dann sehen
    if (rest.endsWith('/vorschau-ausweis')) {
        return reply(200, { success: true, data: { token: 'at0s_' + 'V'.repeat(43), seconds: 120 } });
    }
    const site = backend.sites[rest];
    return site ? reply(200, site) : reply(404, { error: 'Keine Website' });
};
const site = (html, meta = {}) => ({
    success: true,
    data: { bauplan: 1, files: { 'index.html': html }, cache: 60 },
    meta: { source: 'static', ...meta }
});

let server, port;
const request = (host, path = '/', { method = 'GET' } = {}) =>
    new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host } }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', c => (text += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
        });
        req.on('error', reject);
        req.end();
    });

before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(
        createBauarbeiter({
            apiUrl: 'http://backend.test',
            key: KEY,
            siteDomain: 'at0mic.site',
            isProduction: true,
            fetchImpl: fakeFetch,
            log: { warn: () => {}, error: () => {} },
            loginUrl: 'https://api.at0mic.test',
            cockpitHosts: COCKPIT
        })
    );
    app.use((req, res) => res.send('COCKPIT'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
});

after(() => new Promise(r => server.close(r)));

beforeEach(() => {
    backend.calls = [];
    backend.down = false;
});

describe('Eigene Domain im Bauarbeiter', () => {
    test('www.meinladen.ch zeigt die Website "meinladen" – Backend mit Schlüssel gefragt', async () => {
        backend.hosts['www.meinladen.ch'] = 'meinladen';
        backend.sites.meinladen = site('<h1>Mein Laden</h1>', { customDomain: 'www.meinladen.ch' });
        const r = await request('www.meinladen.ch', '/');
        assert.equal(r.status, 200);
        assert.match(r.body, /Mein Laden/);
        assert.equal(backend.calls[0].url, 'http://backend.test/api/sites/_host/www.meinladen.ch');
        assert.equal(backend.calls[0].headers['x-bauarbeiter-key'], KEY);
        assert.equal(backend.calls[1].url, 'http://backend.test/api/sites/meinladen');
    });

    test('die Zuordnung wird kurz gemerkt (nicht jede Datei fragt nochmals)', async () => {
        await request('www.meinladen.ch', '/');
        assert.equal(backend.calls.filter(c => c.url.includes('/_host/')).length, 0);
    });

    test('unbekannte fremde Domain: neutrale 404 – nie das Cockpit', async () => {
        const r = await request('www.unbekannt.ch', '/');
        assert.equal(r.status, 404);
        assert.doesNotMatch(r.body, /COCKPIT/);
    });

    test('Cockpit-Adressen bleiben das Cockpit, ohne das Backend zu fragen', async () => {
        const r = await request('at0mic.ch', '/');
        assert.equal(r.body, 'COCKPIT');
        assert.equal(backend.calls.length, 0);
    });

    test('Backend nicht erreichbar: "gerade nicht erreichbar" – und nicht gemerkt', async () => {
        backend.down = true;
        const r = await request('www.neu.ch', '/');
        assert.equal(r.status, 503);
        backend.down = false;
        backend.hosts['www.neu.ch'] = 'neuladen';
        backend.sites.neuladen = site('<h1>Neu</h1>');
        assert.equal((await request('www.neu.ch', '/')).status, 200, 'beim nächsten Mal wird wieder gefragt');
    });

    test('Anmelden auf der eigenen Domain: das Backend bekommt die Domain mit (host)', async () => {
        const r = await request('www.meinladen.ch', '/_at0mic/login?zurueck=/konto');
        assert.equal(r.status, 302);
        const target = new URL(r.headers.location);
        assert.equal(target.origin, 'https://api.at0mic.test');
        assert.equal(target.searchParams.get('site'), 'meinladen');
        assert.equal(target.searchParams.get('host'), 'www.meinladen.ch');
    });
});

describe('Umleitung name.at0mic.site -> eigene Domain', () => {
    test('Seiten: 302 auf die eigene Domain, mit Pfad und Abfrage', async () => {
        const r = await request('meinladen.at0mic.site', '/blog/eintrag?seite=2');
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, 'https://www.meinladen.ch/blog/eintrag?seite=2');
        assert.equal(r.headers['cache-control'], 'no-store');
    });

    test('Anmelden startet auf der eigenen Domain (wenn der Bauplan schon bekannt ist)', async () => {
        const r = await request('meinladen.at0mic.site', '/_at0mic/login');
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, 'https://www.meinladen.ch/_at0mic/login');
    });

    test('nie umgeleitet: Rücksprung des Logins und "wer bin ich?"', async () => {
        const callback = await request('meinladen.at0mic.site', '/_at0mic/callback?state=x&code=y');
        assert.notEqual(callback.headers.location, 'https://www.meinladen.ch/_at0mic/callback?state=x&code=y');
        const me = await request('meinladen.at0mic.site', '/_at0mic/me');
        assert.equal(me.status, 200);
    });

    test('Website ohne eigene Domain: wie bisher, keine Umleitung', async () => {
        backend.sites.ohne = site('<h1>Ohne</h1>');
        const r = await request('ohne.at0mic.site', '/');
        assert.equal(r.status, 200);
        assert.match(r.body, /Ohne/);
    });

    test('auf der eigenen Domain selbst: keine Umleitung im Kreis', async () => {
        const r = await request('www.meinladen.ch', '/');
        assert.equal(r.status, 200);
    });
});

// Härtungs-Runde Punkt 6: der alte Screenshot-Link per Einmal-Code ist abgebaut –
// auch auf der eigenen Domain fragt der Bauarbeiter nie mehr nach einem Ausweis
describe('Screenshot-Link auf der eigenen Domain (abgebaut)', () => {
    test('kein Tausch beim Backend', async () => {
        backend.hosts['www.meinladen.ch'] = 'meinladen';
        await request('www.meinladen.ch', `/_at0mic/vorschau?code=${'s'.repeat(43)}`);
        assert.equal(
            backend.calls.some(c => c.url.endsWith('/vorschau-ausweis')),
            false
        );
    });
});
