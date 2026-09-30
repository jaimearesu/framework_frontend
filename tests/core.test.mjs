// tests/core.test.mjs
// ---------------------------------------------------------------------
// Automatische Tests für die Hilfsfunktionen des Cockpits.
// Starten mit:  npm test
//
// Getestet werden nur "reine" Funktionen (ohne Bildschirm und ohne
// Backend): Adressen bauen, Fehlermeldungen, Zahlen formatieren usw.
// Die Oberfläche selbst prüfen wir durch Anklicken im Browser.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildUrl, encodePath, errorMessage } from '../public/js/core/api.js';
import { pickMode, trimSlash } from '../public/js/core/config.js';
import { parseHash, href, findRoute, ROUTES, GROUPS } from '../public/js/core/routes.js';
import { formatNumber, formatMs, shortUuid, formatDate, timeAgo, pathText, isUuid } from '../public/js/core/format.js';
import { describeIdentity, guestHint } from '../public/js/core/session.js';
import { jsonTokens } from '../public/js/core/ui.js';

describe('api: buildUrl', () => {
    test('Basis + Pfad', () => {
        assert.equal(buildUrl('http://localhost:3000', '/api/objects'), 'http://localhost:3000/api/objects');
    });
    test('doppelte Schrägstriche werden vermieden', () => {
        assert.equal(buildUrl('http://x/', '/api'), 'http://x/api');
        assert.equal(buildUrl('http://x', 'api'), 'http://x/api');
    });
    test('Parameter werden angehängt, leere weggelassen', () => {
        assert.equal(buildUrl('http://x', '/a', { limit: 5, cursor: '', after: null }), 'http://x/a?limit=5');
    });
    test('Objekte als Parameter werden zu JSON', () => {
        const url = buildUrl('http://x', '/a', { filter: { name: 'Äpfel & Birnen' } });
        const back = JSON.parse(new URL(url).searchParams.get('filter'));
        assert.deepEqual(back, { name: 'Äpfel & Birnen' });
    });
});

describe('api: encodePath', () => {
    test('Pfad-Stücke werden einzeln kodiert, Schrägstriche bleiben', () => {
        assert.equal(encodePath('shop/base/kunden'), 'shop/base/kunden');
        assert.equal(encodePath('mein shop/ä'), 'mein%20shop/%C3%A4');
    });
    test('leere Stücke und Schrägstriche am Rand fallen weg', () => {
        assert.equal(encodePath('/shop//base/'), 'shop/base');
    });
    test('gefährliche Zeichen können die Adresse nicht verbiegen', () => {
        assert.equal(encodePath('a?b#c'), 'a%3Fb%23c');
    });
});

describe('api: errorMessage', () => {
    test('nimmt die Meldung des Backends (.error)', () => {
        assert.equal(
            errorMessage({ error: 'Kein Zugriff oder nicht gefunden' }, 403),
            'Kein Zugriff oder nicht gefunden'
        );
    });
    test('versteht auch { error: { message } }', () => {
        assert.equal(errorMessage({ error: { message: 'Kaputt' } }, 422), 'Kaputt');
    });
    test('hängt die Fehler-ID an', () => {
        assert.equal(
            errorMessage({ error: 'Interner Server Fehler', errorId: 'ab12cd34' }, 500),
            'Interner Server Fehler (Fehler-ID ab12cd34)'
        );
    });
    test('ohne Meldung: verständlicher Text je Status', () => {
        assert.equal(errorMessage(null, 0), 'Backend nicht erreichbar. Läuft der Server?');
        assert.equal(errorMessage(null, 404), 'Nicht gefunden.');
        assert.match(errorMessage(null, 418), /Status 418/);
    });
    test('kurzer Text als Antwort wird übernommen, lange HTML-Seiten nicht', () => {
        assert.equal(errorMessage('Bad Gateway', 502), 'Bad Gateway');
        assert.equal(errorMessage('<html>' + 'x'.repeat(400), 502), 'Unerwartete Antwort (Status 502).');
    });
});

describe('config: Live/Test', () => {
    test('Test nur, wenn gespeichert UND ein Test-Backend existiert', () => {
        assert.equal(pickMode('test', true), 'test');
        assert.equal(pickMode('test', false), 'live'); // z.B. auf dem Server
        assert.equal(pickMode('live', true), 'live');
        assert.equal(pickMode(null, true), 'live');
        assert.equal(pickMode('quatsch', true), 'live');
    });
    test('trimSlash', () => {
        assert.equal(trimSlash('http://x///'), 'http://x');
        assert.equal(trimSlash(null), '');
    });
});

describe('routes', () => {
    test('parseHash zerlegt Seite, Parameter und Query', () => {
        assert.deepEqual(parseHash('#/objekte/abc?x=1&y=zwei'), {
            id: 'objekte',
            params: ['abc'],
            query: { x: '1', y: 'zwei' }
        });
    });
    test('parseHash: leer = Übersicht', () => {
        assert.equal(parseHash('').id, '');
        assert.equal(parseHash('#/').id, '');
        assert.equal(parseHash('#').id, '');
    });
    test('parseHash dekodiert, stolpert aber nicht über kaputte Kodierung', () => {
        assert.deepEqual(parseHash('#/objekte/mein%20shop').params, ['mein shop']);
        assert.deepEqual(parseHash('#/objekte/%E0%A4%A').params, ['%E0%A4%A']);
    });
    test('href baut Adressen, die parseHash wieder versteht', () => {
        const link = href('objekte', 'shop/base', 'ä b');
        assert.deepEqual(parseHash(link).params, ['shop/base', 'ä b']);
        assert.equal(href('daten', undefined, ''), '#/daten');
    });
    test('jede Seite hat Titel, Symbol, Gruppe, Einleitung und Loader', () => {
        const ids = new Set();
        for (const r of ROUTES) {
            assert.ok(!ids.has(r.id), `doppelte Seite: ${r.id}`);
            ids.add(r.id);
            assert.ok(r.title && r.icon && r.intro, r.id);
            assert.ok(GROUPS.includes(r.group), `unbekannte Gruppe bei ${r.id}`);
            assert.equal(typeof r.load, 'function');
        }
        assert.equal(findRoute('gibtsnicht'), null);
        assert.equal(findRoute('').title, 'Übersicht');
    });
});

describe('format', () => {
    test('formatNumber mit Schweizer Apostroph', () => {
        assert.equal(formatNumber(0), '0');
        assert.equal(formatNumber(999), '999');
        assert.equal(formatNumber(10000), "10'000");
        assert.equal(formatNumber(1234567.5), "1'234'567.5");
        assert.equal(formatNumber(-2500), "-2'500");
        assert.equal(formatNumber(NaN), '–');
        assert.equal(formatNumber('5'), '–');
    });
    test('formatMs', () => {
        assert.equal(formatMs(42.4), '42 ms');
        assert.equal(formatMs(1000), '1 s');
        assert.equal(formatMs(1530), '1.53 s');
        assert.equal(formatMs(12345), '12.3 s');
        assert.equal(formatMs(undefined), '–');
    });
    test('shortUuid', () => {
        assert.equal(shortUuid('3e833995-3d48-81c1-a000-000000000000'), '3e833995…');
        assert.equal(shortUuid('kurz'), 'kurz');
        assert.equal(shortUuid(null), '');
    });
    test('formatDate', () => {
        assert.equal(formatDate(new Date(2026, 8, 27, 9, 5)), '27.09.2026, 09:05');
        assert.equal(formatDate('kein datum'), '–');
    });
    test('timeAgo', () => {
        const now = new Date(2026, 8, 27, 12, 0, 0).getTime();
        assert.equal(timeAgo(new Date(now - 3000), now), 'gerade eben');
        assert.equal(timeAgo(new Date(now - 30000), now), 'vor 30 Sek.');
        assert.equal(timeAgo(new Date(now - 5 * 60000), now), 'vor 5 Min.');
        assert.equal(timeAgo(new Date(now - 3 * 3600000), now), 'vor 3 Std.');
        assert.equal(timeAgo(new Date(now - 24 * 3600000), now), 'vor 1 Tag');
        assert.equal(timeAgo(new Date(now - 72 * 3600000), now), 'vor 3 Tagen');
    });
    test('pathText und isUuid', () => {
        assert.equal(pathText(['shop', 'base', 'kunden']), 'shop/base/kunden');
        assert.equal(pathText('shop/x'), 'shop/x');
        assert.equal(pathText(null), '');
        assert.ok(isUuid('3E833995-3d48-41c1-a000-000000000000'));
        assert.ok(!isUuid('shop/base'));
    });
});

describe('session: describeIdentity', () => {
    test('eingeloggt', () => {
        const id = describeIdentity({ isAuthenticated: true, user: { name: 'Jaime', sub: 'auth0|1' } });
        assert.deepEqual([id.kind, id.label, id.id], ['user', 'Jaime', 'auth0|1']);
    });
    test('Gast', () => {
        const id = describeIdentity({ isAuthenticated: false, isGuest: true, user: { sub: 'guest_x' } });
        assert.deepEqual([id.kind, id.id], ['guest', 'guest_x']);
    });
    test('anonym und offline', () => {
        assert.equal(describeIdentity({ isAuthenticated: false, isGuest: false }).kind, 'anon');
        assert.equal(describeIdentity(null).kind, 'offline');
    });
});

describe('ui: jsonTokens (farbiges JSON)', () => {
    test('erkennt Schlüssel, Texte, Zahlen, true/false und null', () => {
        const tokens = jsonTokens({ name: 'Anna', alter: 42, aktiv: true, notiz: null });
        const typed = tokens.filter(t => t.t !== 'punct').map(t => [t.t, t.v]);
        assert.deepEqual(typed, [
            ['key', '"name"'],
            ['string', '"Anna"'],
            ['key', '"alter"'],
            ['number', '42'],
            ['key', '"aktiv"'],
            ['bool', 'true'],
            ['key', '"notiz"'],
            ['null', 'null']
        ]);
    });
    test('zusammengesetzt ergibt es wieder genau das JSON', () => {
        const value = { a: [1, -2.5e3, 'x "y" z'], b: { c: false } };
        const text = jsonTokens(value)
            .map(t => t.v)
            .join('');
        assert.equal(text, JSON.stringify(value, null, 2));
    });
    test('Zahlen und "true" innerhalb von Texten bleiben Text', () => {
        const typed = jsonTokens({ t: 'true 123' }).filter(t => t.t !== 'punct');
        assert.deepEqual(
            typed.map(t => t.t),
            ['key', 'string']
        );
    });
    test('verträgt Kreise und undefined', () => {
        const a = {};
        a.self = a;
        assert.ok(jsonTokens(a).length > 0);
        assert.deepEqual(jsonTokens(undefined), [{ t: 'punct', v: 'undefined' }]);
    });
});

describe('session: guestHint (Gäste laufen nach 24 h ab)', () => {
    test('nur Gäste bekommen den Hinweis', () => {
        assert.match(guestHint({ kind: 'guest' }).text, /24 Stunden/);
        assert.match(guestHint({ kind: 'guest' }).text, /Logge dich ein/);
        for (const kind of ['user', 'anon', 'offline']) assert.equal(guestHint({ kind }), null, kind);
        assert.equal(guestHint(undefined), null);
    });
});
