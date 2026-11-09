// tests/neuWebsites.test.mjs
// ---------------------------------------------------------------------
// Neues Cockpit (Plan U, U4b): aus den Antworten des Backends werden
// Kacheln, wartende Entscheidungen und der Papierkorb.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    zustandAus,
    kachelZeile,
    websitesAusApi,
    bitteAusApi,
    uploadAusApi,
    papierkorbAusApi
} from '../public/neu/js/websites-werte.js';

const jetzt = Date.parse('2026-11-09T12:00:00Z');
const keine = new Set();

describe('zustandAus', () => {
    test('öffentlich ist online, privat ist Entwurf, Mitglieder bekommen eine eigene Plakette', () => {
        assert.equal(zustandAus({ art: 'website', visibility: 'public' }, keine), 'online');
        assert.equal(zustandAus({ art: 'website', visibility: 'private' }, keine), 'entwurf');
        assert.equal(zustandAus({ art: 'website', visibility: 'members' }, keine), 'mitglieder');
    });

    test('eine offene Bitte zeigt «wartet», ein Problem geht vor', () => {
        const w = { art: 'website', name: 'brot', visibility: 'private', problems24h: 0 };
        assert.equal(zustandAus(w, new Set(['brot'])), 'wartet');
        assert.equal(zustandAus({ ...w, problems24h: 2 }, new Set(['brot'])), 'problem');
    });

    test('ohne das Recht, Probleme zu sehen (null), gibt es keine Problem-Plakette', () => {
        assert.equal(zustandAus({ art: 'website', visibility: 'public', problems24h: null }, keine), 'online');
    });

    test('eine leere Domain ist «leer», auch wenn sie öffentlich ist', () => {
        assert.equal(zustandAus({ art: 'speicher', visibility: 'public' }, keine), 'leer');
    });
});

describe('kachelZeile', () => {
    test('zeigt nur die Zeit', () => {
        assert.equal(kachelZeile({ lastChange: '2026-11-09T09:00:00Z', problems24h: 0 }, jetzt), 'geändert vor 3 Std.');
    });

    test('nennt Probleme zuerst', () => {
        assert.equal(
            kachelZeile({ lastChange: '2026-11-09T11:00:00Z', problems24h: 2 }, jetzt),
            '2 Probleme heute, geändert vor 1 Std.'
        );
    });

    test('ohne Änderung sagt sie das', () => {
        assert.equal(kachelZeile({ lastChange: null, problems24h: null }, jetzt), 'Noch nichts geändert');
    });
});

describe('websitesAusApi', () => {
    const roh = {
        uuid: 'u1',
        name: 'brot',
        art: 'website',
        visibility: 'public',
        address: 'https://brot.vindelis.site',
        customHost: null,
        note: 'Bäckerei',
        lastChange: '2026-11-09T11:00:00Z',
        createdAt: '2026-11-01T12:00:00Z',
        problems24h: 0,
        thumbAt: '2026-11-09T01:00:00Z'
    };

    test('macht aus dem Backend-Eintrag eine Kachel', () => {
        const [k] = websitesAusApi([roh], [], jetzt);
        assert.equal(k.id, 'u1');
        assert.equal(k.titel, 'brot');
        assert.equal(k.adresse, 'brot.vindelis.site');
        assert.equal(k.beschreibung, 'Bäckerei');
        assert.equal(k.zustand, 'online');
        assert.equal(k.geaendertVor, 60 * 60 * 1000);
        assert.equal(k.thumbAt, roh.thumbAt);
    });

    test('die eigene Domain geht vor', () => {
        const [k] = websitesAusApi([{ ...roh, customHost: 'www.brot.ch' }], [], jetzt);
        assert.equal(k.adresse, 'www.brot.ch');
    });

    test('Werkzeugkästen stehen nicht auf den Kacheln, leere Domains schon', () => {
        const kacheln = websitesAusApi(
            [
                { ...roh, uuid: 'a', art: 'werkzeugkasten' },
                { ...roh, uuid: 'b', art: 'speicher' }
            ],
            [],
            jetzt
        );
        assert.deepEqual(
            kacheln.map(k => [k.id, k.zustand]),
            [['b', 'leer']]
        );
    });

    test('eine Bitte auf einen Teil der Website zeigt die ganze Website als wartend', () => {
        const [k] = websitesAusApi([{ ...roh, visibility: 'private' }], [{ objectName: 'brot' }], jetzt);
        assert.equal(k.zustand, 'wartet');
    });

    test('ohne Datum steht die Website beim Sortieren hinten, und die Sortierung bleibt gültig', () => {
        const kacheln = websitesAusApi(
            [
                { ...roh, uuid: 'a', lastChange: null },
                { ...roh, uuid: 'b', lastChange: null },
                { ...roh, uuid: 'c' }
            ],
            [],
            jetzt
        );
        const sortiert = [...kacheln].sort((x, y) => x.geaendertVor - y.geaendertVor);
        assert.equal(sortiert[0].id, 'c');
        assert.equal(kacheln[0].geaendertVor - kacheln[1].geaendertVor, 0);
    });

    test('verträgt Unsinn', () => {
        assert.deepEqual(websitesAusApi(null, null, jetzt), []);
        assert.deepEqual(websitesAusApi([null, { uuid: 'x' }], [], jetzt), []);
    });
});

describe('bitteAusApi', () => {
    const roh = {
        uuid: 'r1',
        objectUuid: 'o1',
        objectName: 'brot',
        objectPath: ['brot'],
        visibility: 'public',
        currentVisibility: 'private',
        includeChildren: true,
        childCount: 3,
        except: [],
        exceptCount: 0,
        requestedByName: 'claude',
        reason: 'Fertig gebaut.',
        createdAt: '2026-11-09T11:00:00Z'
    };

    test('sagt genau, was beim Freigeben passiert, und wer gefragt hat', () => {
        const e = bitteAusApi(roh, {}, jetzt);
        assert.equal(e.id, 'r1');
        assert.equal(e.art, 'Veröffentlichen');
        assert.equal(e.website, 'brot');
        assert.equal(e.was, 'brot und 3 Unter-Objekte werden öffentlich (alle, auch anonym)');
        assert.equal(e.stand, 'Jetzt privat');
        assert.equal(e.von, 'claude');
        assert.equal(e.grund, 'Fertig gebaut.');
    });

    test('die Anfrage eines Menschen hat keinen Namen', () => {
        assert.equal(bitteAusApi({ ...roh, requestedByName: null }, {}, jetzt).von, 'einem Menschen');
    });

    test('Ausnahmen stehen mit Namen da, unbekannte gekürzt', () => {
        const uuid = 'abcdef12-0000-4000-8000-000000000000';
        const e = bitteAusApi({ ...roh, except: ['t1', uuid], exceptCount: 2 }, { t1: 'preise' }, jetzt);
        assert.deepEqual(e.ausnahmen, ['preise', 'abcdef12']);
        assert.match(e.was, /AUSSER 2 Teilen/);
    });
});

describe('uploadAusApi', () => {
    const roh = {
        uuid: 'f1',
        site: 'galerie',
        kind: 'png',
        bytes: 12000,
        name: 'foto.png',
        anonymous: true,
        collectionVisibility: 'private',
        createdAt: '2026-11-09T11:00:00Z'
    };

    test('beschreibt die Datei und warnt, wenn die Sammlung privat ist', () => {
        const e = uploadAusApi(roh, jetzt);
        assert.equal(e.typ, 'upload');
        assert.equal(e.website, 'galerie');
        assert.equal(e.bild, true);
        assert.equal(e.name, 'foto.png');
        assert.match(e.was, /von einem Besucher ohne Anmeldung/);
        assert.match(e.hinweis, /Sammlung ist privat/);
    });

    test('nur bekannte Bild-Arten werden als Bild gezeigt', () => {
        assert.equal(uploadAusApi({ ...roh, kind: 'pdf' }, jetzt).bild, false);
        assert.equal(uploadAusApi({ ...roh, kind: 'svg' }, jetzt).bild, false);
    });

    test('ist die Sammlung sichtbar, gibt es keinen Hinweis', () => {
        assert.equal(uploadAusApi({ ...roh, collectionVisibility: 'public' }, jetzt).hinweis, null);
    });
});

describe('papierkorbAusApi', () => {
    const sicherung = (uuid, domain, createdAt) => ({
        uuid,
        domain,
        createdAt,
        domainDeletedAt: '2026-11-08T12:00:00Z',
        objects: 5,
        dataRows: 2,
        files: 0,
        fileBytes: 0,
        withFiles: false
    });

    test('pro gelöschter Website nur die neuste Sicherung', () => {
        const liste = papierkorbAusApi(
            [
                sicherung('s2', 'brot', '2026-11-07T12:00:00Z'),
                sicherung('s1', 'brot', '2026-11-01T12:00:00Z'),
                sicherung('s3', 'zopf', '2026-11-02T12:00:00Z')
            ],
            jetzt
        );
        assert.deepEqual(
            liste.map(e => e.id),
            ['s2', 's3']
        );
    });

    test('schlägt einen neuen Namen vor und sagt, wann gelöscht wurde', () => {
        const [e] = papierkorbAusApi([sicherung('s2', 'brot', '2026-11-07T12:00:00Z')], jetzt);
        assert.equal(e.name, 'brot');
        assert.equal(e.vorschlag, 'brot-20261107');
        assert.equal(e.geloescht, 'vor 1 Tag');
        assert.match(e.inhalt, /5 Teile/);
    });

    test('verträgt eine leere Antwort', () => {
        assert.deepEqual(papierkorbAusApi(null, jetzt), []);
    });
});
