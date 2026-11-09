// U5: Was beim Fertigmachen des neuen Cockpits aufgefallen ist, darf nicht wiederkommen
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/neu/css/cockpit.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/neu/js/ui.js', import.meta.url), 'utf8');

test('Im dunklen Modus sind auch Auswahl-Listen und Rollbalken dunkel', () => {
    assert.match(css, /data-modus='dunkel'\]\s*\{\s*color-scheme: dark;/);
});

test('Lange Namen brechen um', () => {
    assert.match(css, /\.website-titel,[\s\S]*?overflow-wrap: anywhere;/);
});

test('Das Handy zeigt die Suche als Symbol statt sie zu verstecken', () => {
    const handy = css.slice(css.indexOf('@media (max-width: 760px)'));
    assert.doesNotMatch(handy.slice(0, handy.indexOf('.kopf-titel')), /\.such-knopf \{\s*display: none;/);
});

test('Eine Fehler-Meldung sieht anders aus als eine Erfolgs-Meldung', () => {
    assert.match(ui, /symbol === 'kreuz' \? 'bp-toast-ik fehler'/);
    assert.match(css, /\.bp-toast-ik\.fehler/);
});

test('Geladen wird überall mit denselben Platzhaltern, nicht mit Text', () => {
    for (const datei of [
        'einst-hilfe',
        'website',
        'website-code',
        'website-daten',
        'website-personen',
        'website-uebersicht'
    ]) {
        const code = readFileSync(new URL('../public/neu/js/' + datei + '.js', import.meta.url), 'utf8');
        assert.doesNotMatch(code, /'Wird geladen…'/, datei);
    }
});
