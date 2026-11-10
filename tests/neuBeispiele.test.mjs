// «Gebaut mit vindelis» (10.11.2026): Beispiel-Karten auf der Startseite und Seite /beispiele/<name>
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
    BEISPIEL_TEXTE,
    BEISPIELE,
    ARTEN,
    beispielAusPfad,
    beispielFinden,
    beispielAdresse
} from '../public/neu/js/beispiele-werte.js';

const SPRACHEN = ['de', 'en'];
const lies = datei => readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
const gibtEs = adresse => existsSync(new URL('../public' + adresse, import.meta.url));

test('Der Name des Beispiels kommt aus der Adresse', () => {
    assert.equal(beispielAusPfad('/beispiele/handzeichen'), 'handzeichen');
    assert.equal(beispielAusPfad('/beispiele/handzeichen/'), 'handzeichen');
    assert.equal(beispielAusPfad('/beispiele/mein-shop-2'), 'mein-shop-2');
});

test('Fremde oder kaputte Adressen geben keinen Namen', () => {
    for (const pfad of [
        '/',
        '/beispiele',
        '/beispiele/',
        '/beispiele/Gross',
        '/beispiele/a/b',
        '/beispiele/../x',
        null,
        undefined
    ]) {
        assert.equal(beispielAusPfad(pfad), null, String(pfad));
    }
    assert.equal(beispielAusPfad('/beispiele/' + 'a'.repeat(61)), null);
});

test('Ein Beispiel wird über seinen Namen gefunden, ein unbekanntes nicht', () => {
    assert.equal(beispielFinden('handzeichen').id, 'handzeichen');
    assert.equal(beispielFinden('gibt-es-nicht'), null);
    assert.equal(beispielFinden(null), null);
    assert.equal(beispielAdresse('handzeichen'), '/beispiele/handzeichen');
});

test('Jedes Beispiel hat eine eindeutige Adresse, die zur Route passt', () => {
    const ids = BEISPIELE.map(b => b.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.equal(beispielAusPfad(beispielAdresse(id)), id);
});

test('Seitentexte gibt es in beiden Sprachen mit denselben Schlüsseln', () => {
    assert.deepEqual(Object.keys(BEISPIEL_TEXTE.en).sort(), Object.keys(BEISPIEL_TEXTE.de).sort());
    assert.deepEqual(Object.keys(ARTEN.en).sort(), Object.keys(ARTEN.de).sort());
});

test('Jedes Beispiel ist in beiden Sprachen gleich vollständig', () => {
    for (const b of BEISPIELE) {
        const [de, en] = SPRACHEN.map(s => b.texte[s]);
        assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort(), b.id);
        for (const liste of ['stichworte', 'weg', 'warum', 'zahlen']) {
            assert.equal(en[liste].length, de[liste].length, b.id + ' ' + liste);
        }
        for (const s of SPRACHEN) {
            const t = b.texte[s];
            assert.ok(t.prompt.length > 20, b.id + ' Prompt ' + s);
            // Jedes Bild und jeder Teil hat einen Text, jede Art eine Bezeichnung
            for (const bild of b.bilder) assert.ok(t.bildtexte[bild.text], b.id + ' Bildtext ' + bild.text + ' ' + s);
            for (const teil of b.teile) {
                assert.ok(t.teilTexte[teil.name], b.id + ' Teiltext ' + teil.name + ' ' + s);
                assert.ok(ARTEN[s][teil.art], b.id + ' Art ' + teil.art + ' ' + s);
            }
        }
    }
});

test('Die Wurzel steht zuerst, alle Bilder liegen wirklich im Ordner', () => {
    for (const b of BEISPIELE) {
        assert.equal(b.teile[0].art, 'wurzel', b.id);
        assert.ok(gibtEs(b.titelbild), b.titelbild);
        for (const bild of b.bilder) assert.ok(gibtEs(bild.src), bild.src);
    }
});

test('Links nach aussen gehen nur über https', () => {
    for (const b of BEISPIELE) {
        for (const adresse of [b.adresse, b.demo, ...b.maschinen.map(m => m.href)]) {
            assert.ok(adresse.startsWith('https://'), adresse);
        }
    }
});

test('Der Server liefert /beispiele/<name> als eigene Seite vor dem Cockpit aus', () => {
    const server = lies('server.js');
    const route = server.indexOf("path.join(__dirname, 'public', 'neu', 'beispiel.html')");
    const cockpit = server.indexOf("app.get('*'");
    assert.ok(route > 0 && cockpit > route, 'Beispiel-Route muss vor dem Cockpit stehen');
    assert.ok(lies('public/neu/beispiel.html').includes('/neu/js/beispiel.js'));
});

test('Die Startseite zeigt die Beispiele und «Bau dein eigenes» führt zur Anleitung', () => {
    assert.ok(lies('public/neu/js/landing-inhalt.js').includes('abschnittBeispiele(sprache)'));
    assert.ok(lies('public/neu/js/beispiel.js').includes("href: '/#verbinden'"));
    assert.ok(lies('public/neu/js/app.js').includes("location.hash === '#verbinden'"));
});
