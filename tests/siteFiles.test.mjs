// tests/siteFiles.test.mjs
// ---------------------------------------------------------------------
// Bauarbeiter: Dateien der Website unter /_at0mic/datei/<pfad>
// (Plan "Dateien mit R2", D3) – mit nachgebautem Backend.
// ---------------------------------------------------------------------
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

const require = createRequire(import.meta.url);
const { BauplanCache } = require('../site/cache.js');
const { createBauarbeiter } = require('../site/bauarbeiter.js');

const KEY = 'k'.repeat(40);
const TOKEN = 'at0s_' + 'A'.repeat(43);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('BILD')]);

let calls = [];
let answer = null; // was das nachgebaute Backend auf /datei/ antwortet

const reply = (status, body = Buffer.alloc(0), headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: h => headers[h.toLowerCase()] ?? null },
    json: async () => JSON.parse(body.toString() || 'null'),
    arrayBuffer: async () => new Uint8Array(body).buffer
});

const fakeFetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', headers: options.headers || {} });
    if (url.includes('/datei/')) return answer();
    return reply(404, Buffer.from('{"error":"x"}'));
};

let server, port;
const request = (host, path, { method = 'GET', cookie, headers: extra = {} } = {}) =>
    new Promise((resolve, reject) => {
        const headers = { host, ...extra };
        if (cookie) headers.cookie = cookie;
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
    });

before(async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(
        createBauarbeiter({
            apiUrl: 'http://backend.intern',
            key: KEY,
            siteDomain: 'at0mic.site',
            isProduction: true,
            fetchImpl: fakeFetch,
            cache: new BauplanCache(),
            personalCache: new BauplanCache(),
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
    calls = [];
    answer = () =>
        reply(200, PNG, {
            'content-type': 'image/png',
            'content-length': String(PNG.length),
            'cache-control': 'public, max-age=300',
            etag: '"abc"',
            'x-geheim': 'nie weitergeben'
        });
});

describe('/_at0mic/datei/<pfad>', () => {
    test('holt beim Backend (mit Schlüssel und IP) und gibt Bytes + erlaubte Header weiter', async () => {
        const r = await request('shop.at0mic.site', '/_at0mic/datei/bilder/logo.png');
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, PNG);
        assert.equal(r.headers['content-type'], 'image/png');
        assert.equal(r.headers['cache-control'], 'public, max-age=300');
        assert.equal(r.headers.etag, '"abc"');
        assert.equal(r.headers['x-content-type-options'], 'nosniff');
        assert.equal(r.headers['x-geheim'], undefined, 'nur die erlaubten Header');
        assert.equal(calls[0].url, 'http://backend.intern/api/sites/shop/datei/bilder/logo.png');
        assert.equal(calls[0].headers['x-bauarbeiter-key'], KEY);
        assert.equal(calls[0].headers['x-besucher-ausweis'], undefined, 'ohne Cookie: anonym');
    });

    test('angemeldet: der Ausweis geht mit (dann gelten die Rechte des Besuchers)', async () => {
        await request('shop.at0mic.site', '/_at0mic/datei/logo', { cookie: `__Host-at0mic_ausweis=${TOKEN}` });
        assert.equal(calls[0].headers['x-besucher-ausweis'], TOKEN);
    });

    test('?v=N geht mit, alles andere in der Adresse nicht', async () => {
        await request('shop.at0mic.site', '/_at0mic/datei/logo.png?v=3&x=1');
        assert.equal(calls[0].url, 'http://backend.intern/api/sites/shop/datei/logo.png?v=3');
        await request('shop.at0mic.site', '/_at0mic/datei/logo.png?v=abc');
        assert.equal(calls[1].url, 'http://backend.intern/api/sites/shop/datei/logo.png');
    });

    test('If-None-Match geht mit, 304 kommt zurück', async () => {
        answer = () => reply(304, Buffer.alloc(0), { 'cache-control': 'public, max-age=300', etag: '"abc"' });
        const r = await request('shop.at0mic.site', '/_at0mic/datei/logo.png', {
            headers: { 'if-none-match': '"abc"' }
        });
        assert.equal(r.status, 304);
        assert.equal(calls[0].headers['if-none-match'], '"abc"');
    });

    test('nicht gefunden: 404, nie zwischenspeichern', async () => {
        answer = () => reply(404, Buffer.from('{"error":"x"}'));
        const r = await request('shop.at0mic.site', '/_at0mic/datei/gibts-nicht.png');
        assert.equal(r.status, 404);
        assert.equal(r.headers['cache-control'], 'no-store');
    });

    test('Backend nicht erreichbar: 503 ohne Zwischenspeichern', async () => {
        answer = () => {
            throw new Error('ECONNREFUSED');
        };
        const r = await request('shop.at0mic.site', '/_at0mic/datei/logo.png');
        assert.equal(r.status, 503);
        assert.equal(r.headers['cache-control'], 'no-store');
    });

    test('nur GET/HEAD; ungültige Pfade gehen nie ans Backend', async () => {
        const post = await request('shop.at0mic.site', '/_at0mic/datei/logo.png', { method: 'POST' });
        assert.equal(post.status, 405);
        for (const path of [
            '/_at0mic/datei/../geheim',
            '/_at0mic/datei/a%20b.png',
            '/_at0mic/datei/',
            '/_at0mic/datei/x.toolong1'
        ]) {
            await request('shop.at0mic.site', path);
        }
        assert.equal(calls.filter(c => c.url.includes('/datei/')).length, 0);
    });

    test('HEAD: Header ohne Inhalt', async () => {
        const r = await request('shop.at0mic.site', '/_at0mic/datei/logo.png', { method: 'HEAD' });
        assert.equal(r.status, 200);
        assert.equal(r.body.length, 0);
        assert.equal(r.headers['content-type'], 'image/png');
    });
});
