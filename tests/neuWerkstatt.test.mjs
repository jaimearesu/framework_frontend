// Werkstatt im neuen Cockpit (public/neu/js/werkstatt-werte.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WERKZEUGE, werkzeugGruppen } from '../public/neu/js/werkstatt-werte.js';

const routen = readFileSync(new URL('../public/js/core/routes.js', import.meta.url), 'utf8');

test('Jedes Werkzeug zeigt auf eine Seite des alten Cockpits', () => {
    for (const w of WERKZEUGE) assert.ok(routen.includes("id: '" + w.id + "'"), w.id);
});

test('Jeder Link öffnet die Technik in den neuen Farben', () => {
    for (const w of WERKZEUGE) assert.equal(w.adresse, '/?werkstatt=1#/' + w.id);
});

test('Die Gruppen enthalten jedes Werkzeug genau einmal', () => {
    const ids = werkzeugGruppen().flatMap(([, liste]) => liste.map(w => w.id));
    assert.equal(ids.length, WERKZEUGE.length);
    assert.equal(new Set(ids).size, WERKZEUGE.length);
});

test('Der Systemcheck ist erreichbar', () => {
    assert.ok(WERKZEUGE.some(w => w.id === 'systemcheck'));
});

test('Das alte Cockpit färbt sich nur, wenn man über die Werkstatt kommt', () => {
    const seite = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    assert.match(seite, /css\/werkstatt\.css/);
    assert.match(seite, /dataset\.werkstatt/);
    const farben = readFileSync(new URL('../public/css/werkstatt.css', import.meta.url), 'utf8');
    const regeln = farben.replace(/\/\*[\s\S]*?\*\//g, '').match(/^\s*:root[^{]*\{/gm);
    assert.ok(regeln.length >= 3);
    for (const r of regeln) assert.match(r, /data-werkstatt/);
});
