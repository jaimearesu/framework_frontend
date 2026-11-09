// Änderungsliste von Jaime zum neuen Cockpit (09.11.2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alleTrennen, helferAusApi, verbindungsNamen } from '../public/neu/js/helfer-werte.js';
import { hatBeideHerkuenfte, nachHerkunft, websitesAusApi } from '../public/neu/js/websites-werte.js';

const lies = datei => readFileSync(new URL('../public/neu/' + datei, import.meta.url), 'utf8');

const helfer = helferAusApi({
    uuid: 'a',
    domain: 'agent-claude',
    tokens: { active: 0 },
    connections: [
        { uuid: 'v1', status: 'active', clientHost: 'claude.ai' },
        { uuid: 'v2', status: 'active', clientHost: 'claude.ai' },
        { uuid: 'v3', status: 'active', clientHost: 'claude.ai' }
    ],
    rights: [],
    hiddenRights: 0
});

test('Mehrere Verbindungen zum selben Dienst heissen nur einmal so', () => {
    assert.equal(verbindungsNamen(helfer.verbindungen), 'Claude');
});

test('«Trennen» trennt alle Verbindungen des Helfers', async () => {
    const getrennt = [];
    const api = {
        del: async pfad => {
            getrennt.push(pfad.split('/').pop());
            return { ok: true };
        }
    };
    assert.equal(await alleTrennen({ api, verbindungen: helfer.verbindungen }), null);
    assert.deepEqual(getrennt.sort(), ['v1', 'v2', 'v3']);
});

test('Scheitert eine Verbindung, kommt der Fehler zurück', async () => {
    const api = { del: async pfad => (pfad.endsWith('v2') ? { ok: false, error: 'geht nicht' } : { ok: true }) };
    assert.equal(await alleTrennen({ api, verbindungen: helfer.verbindungen }), 'geht nicht');
});

test('Die Karte zeigt nur einen Knopf zum Trennen und einen zum Löschen', () => {
    const code = lies('js/helfer.js');
    assert.doesNotMatch(code, /x\.verbindungen\.map/);
    assert.match(code, /'Verbindung trennen'/);
    assert.match(code, /loeschenOeffnen\(x\)/);
    assert.match(code, /delete-preview/);
});

const site = (name, mine) => ({ uuid: name, name, art: 'website', mine });

test('Websites: von mir, mit mir geteilt, alle', () => {
    const liste = websitesAusApi([site('a', true), site('b', false)], []);
    assert.deepEqual(
        nachHerkunft(liste, 'mein').map(w => w.id),
        ['a']
    );
    assert.deepEqual(
        nachHerkunft(liste, 'geteilt').map(w => w.id),
        ['b']
    );
    assert.equal(nachHerkunft(liste, 'alle').length, 2);
});

test('Gibt es nur eine Herkunft, verschwindet der Filter und nichts bleibt leer', () => {
    const liste = websitesAusApi([site('a', true)], []);
    assert.equal(hatBeideHerkuenfte(liste), false);
    assert.equal(nachHerkunft(liste, 'geteilt').length, 1);
});

test('Ein älteres Backend ohne Angabe zeigt alles als eigene Websites', () => {
    assert.equal(websitesAusApi([{ uuid: 'a', name: 'a', art: 'website' }], [])[0].mein, true);
});

test('Baum: «Live» spult nicht zurück und neue Stücke leuchten', () => {
    const code = lies('js/baum-buehne.js');
    assert.match(code, /\[LIVE, 'Live'\]/);
    assert.match(code, /minuten === LIVE \? 'jetzt' : 'zurueck'/);
    assert.match(code, /BUEHNE_WAHL\.minuten === LIVE \? 'jetzt' : 'zurueck'/);
    assert.match(code, /jetzt - stueck\.seit < LEUCHTEN/);
});
