// Startseite und Übergang ins Cockpit (Plan U, nach U6)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anmeldungHolen, anmeldungMerken } from '../public/neu/js/landing-werte.js';

const lies = datei => readFileSync(new URL('../public/neu/' + datei, import.meta.url), 'utf8');

const speicherAttrappe = () => {
    const werte = new Map();
    const speicher = {
        getItem: k => werte.get(k) ?? null,
        setItem: (k, v) => werte.set(k, v),
        removeItem: k => werte.delete(k)
    };
    return () => speicher;
};

test('Ohne Klick auf Anmelden gibt es keinen Übergang', () => {
    assert.equal(anmeldungHolen(speicherAttrappe()), false);
});

test('Der Übergang läuft nach dem Klick genau einmal', () => {
    const speicher = speicherAttrappe();
    anmeldungMerken(speicher);
    assert.equal(anmeldungHolen(speicher), true);
    assert.equal(anmeldungHolen(speicher), false);
});

test('Ohne Speicher geht nichts kaputt', () => {
    const kaputt = () => {
        throw new Error('gesperrt');
    };
    assert.doesNotThrow(() => anmeldungMerken(kaputt));
    assert.equal(anmeldungHolen(kaputt), false);
});

test('Beide Anmelde-Links der Startseite merken sich den Klick', () => {
    const code = lies('js/anmelden.js');
    assert.equal(code.match(/onclick: \(\) => anmeldungMerken\(\)/g).length, 2);
    assert.match(code, /id: 'als-gast'/);
});

test('Der Beispiel-Baum überschreibt nie den gemerkten eigenen Baum', () => {
    assert.match(lies('js/hintergrund.js'), /MUSTER\.kennung, true, MUSTER\.tage/);
});

test('Wer keine Bewegung will, bekommt keine', () => {
    assert.match(lies('js/verwandlung.js'), /prefers-reduced-motion/);
    const css = lies('css/cockpit.css');
    const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const klasse of ['.hintergrund', '.landing', '#app.cockpit-kommt']) assert.ok(block.includes(klasse), klasse);
});
