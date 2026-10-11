// tests/site.test.mjs
// ---------------------------------------------------------------------
// DER BAUARBEITER (Plan "Bauarbeiter + Bauplan-Format", Etappe 3)
//
// Teil 1: die reinen Bausteine (Adresse -> Name, Adresse -> Datei,
//         Zwischenspeicher, Seiten).
// Teil 2: der ganze Bauarbeiter als echter Server – das Backend ist dabei
//         nachgebaut (fetchImpl), damit genau geprüft werden kann, was er
//         fragt und wie er auf jede Antwort reagiert.
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

import {
    isSiteName,
    siteUrl,
    siteStatus,
    hiddenNames,
    bauplanFiles,
    fileUrl,
    formatBytes
} from '../public/js/core/site.js';

const require = createRequire(import.meta.url);
const { siteNameFromHost } = require('../site/host.js');
const { resolveFile, contentTypeFor } = require('../site/files.js');
const { BauplanCache } = require('../site/cache.js');
const { neutralPage, markdownPage, markdownTitle } = require('../site/pages.js');
const { createBauarbeiter, visitorIpOf } = require('../site/bauarbeiter.js');

// ---------------------------------------------------------------------
// TEIL 1: BAUSTEINE
// ---------------------------------------------------------------------
describe('Adresse -> Name der Website', () => {
    const name = host => siteNameFromHost(host, 'at0mic.site');

    test('Subdomain = Name (Port, Grossschreibung und Punkt am Ende egal)', () => {
        assert.deepEqual(name('shop.at0mic.site'), { isSiteHost: true, name: 'shop' });
        assert.deepEqual(name('Mein-Shop.AT0MIC.site:443'), { isSiteHost: true, name: 'mein-shop' });
        assert.deepEqual(name('shop.at0mic.site.'), { isSiteHost: true, name: 'shop' });
        assert.deepEqual(siteNameFromHost('shop.site.localhost:3001', 'site.localhost'), {
            isSiteHost: true,
            name: 'shop'
        });
    });

    test('gehört zu den Websites, aber ohne gültigen Namen', () => {
        for (const host of ['at0mic.site', 'a.b.at0mic.site', '-x.at0mic.site', 'a_b.at0mic.site']) {
            assert.deepEqual(name(host), { isSiteHost: true, name: null }, host);
        }
    });

    test('alles andere geht ans Cockpit', () => {
        for (const host of [
            'at0mic.ch',
            'www.at0mic.ch',
            'localhost:3001',
            'evilat0mic.site',
            '[::1]:3001',
            '',
            null
        ]) {
            assert.equal(name(host).isSiteHost, false, String(host));
        }
    });
});

describe('Adresse -> Datei im Bauplan', () => {
    const files = {
        'index.html': '',
        'style.css': '',
        'about.md': '',
        'blog/index.md': '',
        'blog/erster-post.html': '',
        'docs/a b.txt': ''
    };

    test('findet Dateien mit und ohne Endung, Ordner -> index', () => {
        assert.equal(resolveFile('/', files), 'index.html');
        assert.equal(resolveFile('/index.html', files), 'index.html');
        assert.equal(resolveFile('/style.css', files), 'style.css');
        assert.equal(resolveFile('/about', files), 'about.md');
        assert.equal(resolveFile('/blog', files), 'blog/index.md');
        assert.equal(resolveFile('/blog/', files), 'blog/index.md');
        assert.equal(resolveFile('/blog/erster-post', files), 'blog/erster-post.html');
        assert.equal(resolveFile('/docs/a%20b.txt', files), 'docs/a b.txt');
    });

    test('gibt es nicht oder ist gefährlich: null', () => {
        for (const p of ['/fehlt', '/blog/../index.html', '/./index.html', '/%E0%A4%A', '/blog/zweiter-post']) {
            assert.equal(resolveFile(p, files), null, p);
        }
        assert.equal(resolveFile('/', { 'index.md': '' }), 'index.md');
        assert.equal(resolveFile('/', {}), null);
    });

    test('Inhaltstyp pro Endung, Markdown wird HTML', () => {
        assert.equal(contentTypeFor('a.html'), 'text/html; charset=utf-8');
        assert.equal(contentTypeFor('a.md'), 'text/html; charset=utf-8');
        assert.equal(contentTypeFor('a.js'), 'text/javascript; charset=utf-8');
        assert.equal(contentTypeFor('a.svg'), 'image/svg+xml; charset=utf-8');
        assert.equal(contentTypeFor('a.exe'), 'application/octet-stream');
    });
});

describe('Zwischenspeicher', () => {
    test('frisch, solange "cache" sagt; danach als alter Stand noch da', () => {
        let now = 1000;
        const cache = new BauplanCache({ now: () => now });
        cache.setSite('shop', { files: {}, cache: 30 });
        assert.equal(cache.isFresh(cache.get('shop')), true);
        now += 30 * 1000;
        assert.equal(cache.isFresh(cache.get('shop')), false);
        assert.equal(cache.get('shop').kind, 'site');
    });

    test('"gibt es nicht" wird kurz gemerkt', () => {
        let now = 0;
        const cache = new BauplanCache({ now: () => now, missingSeconds: 10 });
        cache.setMissing('x');
        assert.equal(cache.isFresh(cache.get('x')), true);
        now += 10 * 1000;
        assert.equal(cache.isFresh(cache.get('x')), false);
    });

    test('voll: die am längsten nicht benutzte Website fliegt raus', () => {
        const cache = new BauplanCache({ maxEntries: 2 });
        cache.setSite('a', { files: {} });
        cache.setSite('b', { files: {} });
        cache.get('a'); // a wurde gerade benutzt
        cache.setSite('c', { files: {} });
        assert.equal(cache.size, 2);
        assert.equal(cache.get('b'), undefined);
        assert.ok(cache.get('a') && cache.get('c'));
    });
});

describe('Seiten', () => {
    test('neutrale Seite: deutsch, ohne Details, maskiert', () => {
        const html = neutralPage('noSite');
        assert.match(html, /<title>Diese Website gibt es nicht<\/title>/);
        assert.match(html, /noindex/);
    });

    test('Markdown-Rahmen: Titel maskiert, style.css nur wenn vorhanden', () => {
        assert.match(markdownPage('<h1>x</h1>', { title: '<b>', hasStyle: true }), /<title>&lt;b&gt;<\/title>/);
        assert.match(markdownPage('', { title: 't', hasStyle: true }), /href="\/style.css"/);
        assert.doesNotMatch(markdownPage('', { title: 't', hasStyle: false }), /style.css/);
        assert.equal(markdownTitle('Text\n## Zweite Überschrift ##\n# Erste', 'shop'), 'Zweite Überschrift');
        assert.equal(markdownTitle('nur Text', 'shop'), 'shop');
    });

    test('Besucher-IP: IPv4 in IPv6-Schreibweise wird vereinheitlicht', () => {
        assert.equal(visitorIpOf({ ip: '::ffff:203.0.113.7' }), '203.0.113.7');
        assert.equal(visitorIpOf({ ip: '2001:db8::1' }), '2001:db8::1');
        assert.equal(visitorIpOf({}), null);
    });
});

describe('Cockpit-Reiter "Website" (core/site.js)', () => {
    const root = (domain, visibility = 'public') => ({
        uuid: domain,
        domain,
        domain_ref: null,
        path: ['0'],
        visibility
    });
    const kid = (family, step, visibility) => ({
        uuid: `${family}-${step}`,
        domain: null,
        domain_ref: family,
        path: ['0', `0,${step}`],
        visibility
    });

    test('gleiche Namensregel wie Backend und Bauarbeiter', () => {
        assert.equal(isSiteName('mein-shop'), true);
        for (const bad of ['Shop', 'a_b', 'www', 'api', '-x', 'a'.repeat(64)])
            assert.equal(isSiteName(bad), false, bad);
    });

    test('Adresse aus der Vorlage', () => {
        assert.equal(siteUrl('https://{name}.at0mic.site', 'shop'), 'https://shop.at0mic.site');
        assert.equal(siteUrl('http://{name}.site.localhost:3001', 'shop'), 'http://shop.site.localhost:3001');
        assert.equal(siteUrl(null, 'shop'), null);
    });

    test('Status: Kind, ungültiger Name, privat, online mit fehlenden Teilen', () => {
        const shop = root('shop');
        const objects = [
            shop,
            kid('shop', 1, 'public'),
            kid('shop', 2, 'private'),
            kid('shop', 3, 'members'),
            root('anders')
        ];
        assert.deepEqual(siteStatus(objects[1], objects), { kind: 'child', family: 'shop' });
        assert.deepEqual(siteStatus(root('Gross'), []), { kind: 'badName', name: 'Gross' });
        assert.equal(siteStatus(root('shop', 'private'), objects).online, false);
        assert.equal(siteStatus(root('shop', 'members'), objects).online, false, 'nur Eingeloggte = nicht online');

        const s = siteStatus(shop, objects);
        assert.equal(s.kind, 'site');
        assert.equal(s.online, true);
        assert.deepEqual(
            s.hidden.map(o => o.uuid),
            ['shop-2', 'shop-3']
        );
    });

    test('versteckte Teile kurz aufzählen', () => {
        const many = Array.from({ length: 7 }, (_, i) => root(`teil${i}`));
        assert.equal(hiddenNames(many.slice(0, 2)), 'teil0, teil1');
        assert.equal(hiddenNames(many), 'teil0, teil1, teil2, teil3, teil4 und 2 weitere');
    });

    test('Dateien des Bauplans: index.html zuerst, Grösse in Bytes (UTF-8)', () => {
        const rows = bauplanFiles({ files: { 'style.css': 'ab', 'index.html': 'ä', 'about.md': '' } });
        assert.deepEqual(rows, [
            { path: 'index.html', bytes: 2 },
            { path: 'about.md', bytes: 0 },
            { path: 'style.css', bytes: 2 }
        ]);
        assert.deepEqual(bauplanFiles(null), []);
    });

    test('Adresse einer Datei auf der Website', () => {
        const base = 'https://shop.at0mic.site';
        assert.equal(fileUrl(base, 'index.html'), 'https://shop.at0mic.site/');
        assert.equal(fileUrl(base, 'blog/index.md'), 'https://shop.at0mic.site/blog/');
        assert.equal(fileUrl(base, 'blog/post.md'), 'https://shop.at0mic.site/blog/post');
        assert.equal(fileUrl(base, 'style.css'), 'https://shop.at0mic.site/style.css');
    });

    test('Grössen lesbar', () => {
        assert.equal(formatBytes(512), '512 B');
        assert.equal(formatBytes(2048), '2.0 KB');
        assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
    });
});

// ---------------------------------------------------------------------
// TEIL 2: DER GANZE BAUARBEITER
// ---------------------------------------------------------------------
const KEY = 'k'.repeat(40);

// Das nachgebaute Backend: antwortet pro Website-Name mit dem, was der Test festlegt
const backend = {
    sites: {}, // name -> { status, body, headers }
    calls: [], // { url, headers }
    down: false
};

const fakeFetch = async (url, options) => {
    backend.calls.push({ url, headers: options.headers });
    if (backend.down) throw new Error('connect ECONNREFUSED');
    const name = decodeURIComponent(url.split('/api/sites/')[1]);
    const answer = backend.sites[name] || { status: 404, body: { error: 'Keine Website' } };
    return {
        ok: answer.status >= 200 && answer.status < 300,
        status: answer.status,
        headers: { get: h => (answer.headers || {})[h.toLowerCase()] ?? null },
        json: async () => answer.body
    };
};

const site = (files, cache = 60) => ({
    status: 200,
    body: { success: true, data: { bauplan: 1, files, cache }, meta: { source: 'static' } }
});

let server, port, cache;
const logs = [];

// Anfrage mit eigenem Host-Header (fetch erlaubt das nicht, darum node:http)
const request = (host, path = '/', { method = 'GET', ip } = {}) =>
    new Promise((resolve, reject) => {
        const headers = { host };
        if (ip) headers['x-forwarded-for'] = ip;
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => (body += c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });

before(async () => {
    cache = new BauplanCache();
    const app = express();
    app.set('trust proxy', 1);
    app.use(
        createBauarbeiter({
            apiUrl: 'http://backend.test',
            key: KEY,
            siteDomain: 'at0mic.site',
            isProduction: true,
            fetchImpl: fakeFetch,
            cache,
            log: { warn: m => logs.push(m), error: m => logs.push(m) }
        })
    );
    app.use((req, res) => res.send('COCKPIT'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
});

after(() => new Promise(r => server.close(r)));

beforeEach(() => {
    backend.sites = {};
    backend.calls = [];
    backend.down = false;
    cache.clear();
    logs.length = 0;
});

describe('Bauarbeiter: Websites ausliefern', () => {
    test('liefert die Dateien des Bauplans mit dem richtigen Typ', async () => {
        backend.sites.shop = site({
            'index.html': '<h1>Shop</h1>',
            'style.css': 'h1{color:teal}',
            'js/1.js': 'console.log(1)',
            'blog/post.md': '# Mein Post\n\nHallo **Welt**'
        });

        const index = await request('shop.at0mic.site', '/');
        assert.equal(index.status, 200);
        assert.equal(index.body, '<h1>Shop</h1>');
        assert.match(index.headers['content-type'], /^text\/html/);

        assert.match((await request('shop.at0mic.site', '/style.css')).headers['content-type'], /^text\/css/);
        assert.match((await request('shop.at0mic.site', '/js/1.js')).headers['content-type'], /^text\/javascript/);

        const post = await request('shop.at0mic.site', '/blog/post');
        assert.equal(post.status, 200);
        assert.match(post.body, /<title>Mein Post<\/title>/);
        assert.match(post.body, /<strong>Welt<\/strong>/);
        assert.match(post.body, /href="\/style.css"/);
    });

    test('Schutz-Header, keine Cookies, Browser fragt jedes Mal nach', async () => {
        backend.sites.shop = site({ 'index.html': 'x' });
        const r = await request('shop.at0mic.site', '/');
        assert.equal(r.headers['x-content-type-options'], 'nosniff');
        assert.equal(r.headers['content-security-policy'], "frame-ancestors 'self'");
        assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
        assert.equal(r.headers['strict-transport-security'], 'max-age=31536000');
        assert.equal(r.headers['cache-control'], 'no-cache');
        assert.equal(r.headers['set-cookie'], undefined);
        assert.ok(r.headers.etag, 'ETag für schnelles Nachfragen');
    });

    test('fragt das Backend mit Schlüssel und echter Besucher-IP (hinter Traefik)', async () => {
        backend.sites.shop = site({ 'index.html': 'x' });
        await request('shop.at0mic.site', '/', { ip: '203.0.113.7' });
        assert.equal(backend.calls.length, 1);
        assert.equal(backend.calls[0].url, 'http://backend.test/api/sites/shop');
        assert.equal(backend.calls[0].headers['x-bauarbeiter-key'], KEY);
        assert.equal(backend.calls[0].headers['x-besucher-ip'], '203.0.113.7');
        assert.equal(backend.calls[0].headers.cookie, undefined);
    });

    test('Zwischenspeicher: ein Seitenaufruf mit vielen Dateien = eine Anfrage ans Backend', async () => {
        backend.sites.shop = site({ 'index.html': 'x', 'style.css': 'y' });
        await Promise.all([
            request('shop.at0mic.site', '/'),
            request('shop.at0mic.site', '/style.css'),
            request('shop.at0mic.site', '/')
        ]);
        await request('shop.at0mic.site', '/style.css');
        assert.equal(backend.calls.length, 1);
    });

    test('HEAD geht, alles andere als GET/HEAD: 405', async () => {
        backend.sites.shop = site({ 'index.html': 'x' });
        assert.equal((await request('shop.at0mic.site', '/', { method: 'HEAD' })).status, 200);
        const post = await request('shop.at0mic.site', '/', { method: 'POST' });
        assert.equal(post.status, 405);
        assert.equal(post.headers.allow, 'GET, HEAD');
    });
});

describe('Bauarbeiter: wenn etwas fehlt oder schiefgeht', () => {
    test('Seite nicht im Bauplan: eigene 404.html der Website, sonst neutrale Seite', async () => {
        backend.sites.mit = site({ 'index.html': 'x', '404.html': '<p>Eigene 404</p>' });
        backend.sites.ohne = site({ 'index.html': 'x' });
        const mit = await request('mit.at0mic.site', '/fehlt');
        assert.equal(mit.status, 404);
        assert.equal(mit.body, '<p>Eigene 404</p>');
        const ohne = await request('ohne.at0mic.site', '/fehlt');
        assert.equal(ohne.status, 404);
        assert.match(ohne.body, /Seite nicht gefunden/);
    });

    test('Website gibt es nicht (oder privat): neutrale 404, kurz gemerkt', async () => {
        const r = await request('gibtsnicht.at0mic.site', '/');
        assert.equal(r.status, 404);
        assert.match(r.body, /Diese Website gibt es nicht/);
        await request('gibtsnicht.at0mic.site', '/');
        assert.equal(backend.calls.length, 1, 'zweiter Aufruf aus dem Speicher');
    });

    test('ohne gültigen Namen: 404, ohne das Backend zu fragen – nie das Cockpit', async () => {
        for (const host of ['at0mic.site', 'a.b.at0mic.site']) {
            const r = await request(host, '/');
            assert.equal(r.status, 404, host);
            assert.doesNotMatch(r.body, /COCKPIT/);
        }
        assert.equal(backend.calls.length, 0);
    });

    test('Fehler im Code der Website: 502, die Details nur im Log', async () => {
        backend.sites.kaputt = {
            status: 422,
            body: { error: 'Fehler bei der Code-Ausführung', details: 'Error: geheimes Detail' }
        };
        const r = await request('kaputt.at0mic.site', '/');
        assert.equal(r.status, 502);
        assert.doesNotMatch(r.body, /geheimes Detail/);
        assert.ok(logs.some(l => /geheimes Detail/.test(l)));
    });

    test('Backend bremst: 429 mit Retry-After', async () => {
        backend.sites.voll = { status: 429, body: {}, headers: { 'retry-after': '12' } };
        const r = await request('voll.at0mic.site', '/');
        assert.equal(r.status, 429);
        assert.equal(r.headers['retry-after'], '12');
    });

    test('Backend weg: ohne alten Stand 503, mit altem Stand wird der weiter ausgeliefert', async () => {
        backend.down = true;
        assert.equal((await request('shop.at0mic.site', '/')).status, 503);

        backend.down = false;
        backend.sites.shop = site({ 'index.html': 'alter Stand' }, 0); // cache 0: sofort abgelaufen
        assert.equal((await request('shop.at0mic.site', '/')).body, 'alter Stand');
        backend.down = true;
        const r = await request('shop.at0mic.site', '/');
        assert.equal(r.status, 200);
        assert.equal(r.body, 'alter Stand');
    });

    test('Website wird privat: der alte Stand verschwindet sofort', async () => {
        backend.sites.shop = site({ 'index.html': 'online' }, 0);
        assert.equal((await request('shop.at0mic.site', '/')).status, 200);
        delete backend.sites.shop; // Backend sagt jetzt 404
        assert.equal((await request('shop.at0mic.site', '/')).status, 404);
    });

    test('alles ausserhalb der Website-Domain geht unverändert ans Cockpit', async () => {
        const r = await request('at0mic.ch', '/');
        assert.equal(r.body, 'COCKPIT');
        assert.equal(r.headers['content-security-policy'], undefined);
        assert.equal(backend.calls.length, 0);
    });
});
