// tests/neuProfilSeite.test.mjs
// ---------------------------------------------------------------------
// Öffentliche Profilseite vindelis.com/@name (Plan "N", Stufe 2)
// Reine Funktionen aus public/neu/js/profil-seite-werte.js
// ---------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    handleAusPfad,
    seitenAdresse,
    seitenTitel,
    adresseKurz,
    auswahlListe,
    gewaehlteUuids
} from '../public/neu/js/profil-seite-werte.js';

test('@name aus der Adresse', () => {
    assert.equal(handleAusPfad('/@kirk'), 'kirk');
    assert.equal(handleAusPfad('/@Kirk/'), 'kirk');
    assert.equal(handleAusPfad('/@james-t-kirk'), 'james-t-kirk');
    assert.equal(handleAusPfad('/@ab'), null, 'zu kurz');
    assert.equal(handleAusPfad('/@kirk/websites'), null);
    assert.equal(handleAusPfad('/kirk'), null);
    assert.equal(handleAusPfad('/@%E0%A4%A'), null, 'kaputte Kodierung');
});

test('Adresse, Titel, kurze Adresse', () => {
    assert.equal(seitenAdresse('https://vindelis.com/', 'kirk'), 'https://vindelis.com/@kirk');
    assert.equal(seitenAdresse('https://vindelis.com', null), null);
    assert.equal(
        seitenTitel({ handle: 'kirk', displayName: 'Captain James T. Kirk' }),
        'Captain James T. Kirk (@kirk) · vindelis'
    );
    assert.equal(seitenTitel({ handle: 'kirk' }), '@kirk · vindelis');
    assert.equal(seitenTitel(null), 'Profil nicht gefunden · vindelis');
    assert.equal(adresseKurz('https://enterprise.vindelis.site'), 'enterprise.vindelis.site');
});

test('Auswahl: nur Websites, die ich verwalte; nicht öffentliche gesperrt; gewählte zuerst', () => {
    const w = (uuid, name, visibility, mehr = {}) => ({
        uuid,
        name,
        visibility,
        art: 'website',
        rights: { grant: true },
        ...mehr
    });
    const liste = auswahlListe(
        [
            w('a', 'alpha', 'public'),
            w('b', 'bravo', 'private'),
            w('c', 'charlie', 'public'),
            w('d', 'delta', 'public', { rights: { grant: false } }),
            w('e', 'echo', 'public', { art: 'werkzeugkasten' })
        ],
        ['c']
    );
    assert.deepEqual(
        liste.map(x => [x.name, x.gewaehlt, x.waehlbar, x.grund]),
        [
            ['charlie', true, true, null],
            ['alpha', false, true, null],
            ['bravo', false, false, 'nicht öffentlich']
        ]
    );
    liste[1].gewaehlt = true;
    liste[2].gewaehlt = true; // gesperrt: zählt nicht
    assert.deepEqual(gewaehlteUuids(liste), ['c', 'a']);
    assert.deepEqual(auswahlListe(null), []);
});
