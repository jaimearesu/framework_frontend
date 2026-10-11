// tests/rateLimitWait.test.mjs
// ---------------------------------------------------------------------
// BREMSE ABWARTEN (core/api.js) – für den Systemcheck
//
// Mit Login erlaubt das Backend 60 Änderungen pro Minute. Der Systemcheck
// braucht mehr. Ist das Warten eingeschaltet, wartet request() bei 429 so
// lange, wie das Backend sagt, und schickt die Anfrage nochmals.
// Geprüft mit einem nachgebauten fetch (kein Backend nötig).
// ---------------------------------------------------------------------
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request, rateLimitDelaySec, setRateLimitWaiting } from '../public/js/core/api.js';

// fetch nachbauen: gibt der Reihe nach die vorgegebenen Antworten zurück
const realFetch = globalThis.fetch;
const fakeFetch = answers => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        const { status, body } = answers[Math.min(calls.length - 1, answers.length - 1)];
        return {
            ok: status >= 200 && status < 300,
            status,
            headers: { get: () => null }, // Retry-After ist im Browser bei CORS nicht lesbar
            text: async () => JSON.stringify(body)
        };
    };
    return calls;
};
const RATE_LIMITED = { status: 429, body: { error: 'Zu viele Änderungen', code: 'RATE_LIMITED', retryAfter: 1 } };
const OK = { status: 201, body: { data: { uuid: 'x' } } };

afterEach(() => {
    globalThis.fetch = realFetch;
    setRateLimitWaiting(null);
});

describe('rateLimitDelaySec', () => {
    test('liest die Wartezeit aus der Antwort (retryAfter im Body)', () => {
        assert.equal(rateLimitDelaySec({ status: 429, data: { retryAfter: 45 } }), 45);
        assert.equal(rateLimitDelaySec({ status: 429, data: { retryAfter: 2.2 } }), 3);
        assert.equal(rateLimitDelaySec({ status: 429, data: {}, retryAfter: '7' }), 7, 'Header als Ersatz');
        assert.equal(rateLimitDelaySec({ status: 429, data: null }), 5, 'ohne Angabe: 5 s');
    });

    test('kein 429 oder zu lange: nicht warten', () => {
        assert.equal(rateLimitDelaySec({ status: 200, data: {} }), null);
        assert.equal(rateLimitDelaySec({ status: 503, data: { retryAfter: 1 } }), null);
        assert.equal(rateLimitDelaySec({ status: 429, data: { retryAfter: 300 } }, 65), null);
        assert.equal(rateLimitDelaySec(null), null);
    });
});

describe('request mit Warten', () => {
    test('ausgeschaltet (Standard): 429 kommt sofort zurück', async () => {
        const calls = fakeFetch([RATE_LIMITED, OK]);
        const r = await request('POST', '/api/objects', { body: { domain: 'x' }, base: 'http://b' });
        assert.equal(r.status, 429);
        assert.equal(calls.length, 1);
    });

    test('eingeschaltet: wartet, meldet die Wartezeit und schickt dieselbe Anfrage nochmals', async () => {
        const calls = fakeFetch([RATE_LIMITED, OK]);
        const waits = [];
        setRateLimitWaiting({ maxWaitSec: 65, maxRetries: 3, onWait: sec => waits.push(sec) });

        const started = Date.now();
        const r = await request('POST', '/api/objects', { body: { domain: 'x' }, base: 'http://b' });
        assert.equal(r.status, 201);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].options.body, calls[0].options.body, 'gleicher Inhalt');
        assert.deepEqual(waits, [1, 0], '1 s warten, danach Anzeige zurücksetzen');
        assert.ok(Date.now() - started >= 1000, 'hat wirklich gewartet');
    });

    test('gibt nach maxRetries auf und zeigt dann das 429', async () => {
        const calls = fakeFetch([RATE_LIMITED]);
        setRateLimitWaiting({ maxWaitSec: 65, maxRetries: 1 });
        const r = await request('GET', '/api/objects', { base: 'http://b' });
        assert.equal(r.status, 429);
        assert.equal(calls.length, 2);
    });
});
