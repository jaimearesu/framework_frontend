// Umstellen aufs neue Cockpit (Plan U, U6): "/" ist neu, das alte läuft unter /alt weiter,
// und alte Adressen führen ans richtige Ziel
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTES } from '../public/js/core/routes.js';
import { ALTES_COCKPIT, NUR_ALT, alteAdresse } from '../public/neu/js/adressen-werte.js';

const lies = datei => readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
const UUID = 'aaaaaaaa-0000-4000-8000-000000000001';

test('Einladungen und Lesezeichen auf ein Objekt werden geprüft', () => {
    assert.deepEqual(alteAdresse('#/objekte/' + UUID), { objekt: UUID });
});

test('Die Objekt-Liste wird zu den Websites, Agenten zu den KI-Helfern', () => {
    assert.deepEqual(alteAdresse('#/objekte'), { hash: '#/websites' });
    assert.deepEqual(alteAdresse('#/agenten'), { hash: '#/helfer' });
});

test('Technik-Seiten führen ins alte Cockpit und behalten die ganze Adresse', () => {
    assert.deepEqual(alteAdresse('#/ssf'), { weg: '/alt/#/ssf' });
    assert.deepEqual(alteAdresse('#/code/' + UUID + '?x=1'), { weg: '/alt/#/code/' + UUID + '?x=1' });
});

test('Adressen des neuen Cockpits bleiben, wie sie sind', () => {
    for (const hash of ['', '#', '#/', '#/websites', '#/wartet', '#/helfer', '#/verlauf', '#/konto', '#/werkstatt']) {
        assert.equal(alteAdresse(hash), null, hash);
    }
    assert.equal(alteAdresse('#/website/' + UUID + '/code'), null);
});

test('Keine Seite des alten Cockpits geht vergessen', () => {
    const inBeiden = ['', 'website', 'wartet'];
    const uebersetzt = ['objekte', 'agenten'];
    for (const { id } of ROUTES) {
        assert.ok([...inBeiden, ...uebersetzt, ...NUR_ALT].includes(id), 'fehlt: ' + id);
    }
});

test('Das neue Cockpit läuft unter / und /neu/: nur feste Pfade', () => {
    const seite = lies('public/neu/index.html');
    const pfade = [...seite.matchAll(/(?:href|src)="([^"]+)"/g)].map(t => t[1]);
    assert.equal(pfade.length, 4);
    for (const p of pfade) assert.ok(p.startsWith('/neu/'), p);
    assert.match(lies('public/neu/js/ui.js'), /hell: '\/neu\/marke/);
});

test('Der Server liefert / neu und /alt alt', () => {
    const server = lies('server.js');
    assert.match(server, /index: false/);
    assert.match(server, /app\.get\('\/alt', [^]*?COCKPIT_ALT/);
    assert.match(server, /app\.get\('\*', [^]*?COCKPIT_NEU/);
    assert.equal(ALTES_COCKPIT, '/alt/');
});

test('Das alte Cockpit läuft unter jeder Adresse: nur feste Pfade', () => {
    const seite = lies('public/index.html').replace(/href="data:[^"]*"/g, '');
    for (const [, p] of seite.matchAll(/(?:href|src)="([^"#]+)"/g)) assert.ok(p.startsWith('/'), p);
});
