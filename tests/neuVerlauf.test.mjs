// Verlauf im neuen Cockpit (09.11.2026): aus Protokoll-Einträgen werden Sätze
import test from 'node:test';
import assert from 'node:assert/strict';
import { nachTagen, verlaufSatz, verlaufTag, verlaufUhrzeit, verlaufWer } from '../public/neu/js/verlauf-werte.js';

const WURZEL = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEIL = 'aaaaaaaa-0000-4000-8000-000000000002';
const basis = { websiteUuid: WURZEL, targetUuid: TEIL, teil: 'stil', details: {} };

test('Code ändern nennt Teil und Art, verständlich statt technisch', () => {
    assert.equal(
        verlaufSatz({ ...basis, action: 'code.speichern', details: { types: ['css', 'ssf'] } }),
        '«stil» geändert (CSS, Server-Funktion)'
    );
});

test('Die Website selbst und ein Teil ohne Namen sind nicht dasselbe', () => {
    assert.equal(
        verlaufSatz({ ...basis, teil: null, targetUuid: WURZEL, action: 'code.speichern' }),
        'die Website geändert'
    );
    assert.equal(verlaufSatz({ ...basis, teil: null, action: 'code.speichern' }), 'einen Teil geändert');
});

test('Rechte: Helfer mit Name, Menschen nur mit dem Anfang ihrer ID', () => {
    const d = { roleType: 'red', member: 'bbbbbbbb-1111-4000-8000-000000000003' };
    assert.equal(
        verlaufSatz({ ...basis, action: 'rolle.vergeben', details: d, memberName: 'agent-lea' }),
        'agent-lea darf jetzt «Ändern»'
    );
    assert.equal(
        verlaufSatz({ ...basis, action: 'rolle.entziehen', details: d, memberName: null }),
        'Person bbbbbbbb… darf nicht mehr «Ändern»'
    );
});

test('Gelöschter Teil behält seinen Namen, auch mit Unterteilen', () => {
    const e = { ...basis, teil: null, targetUuid: WURZEL, action: 'objekt.loeschen' };
    assert.equal(verlaufSatz({ ...e, details: { teil: 'bilder' } }), 'Teil «bilder» gelöscht');
    assert.equal(
        verlaufSatz({ ...e, details: { teil: 'bilder', teile: 4 } }),
        'Teil «bilder» mit allen Unterteilen gelöscht'
    );
});

test('Einzahl und Mehrzahl stimmen', () => {
    const e = { ...basis, action: 'daten.schreiben' };
    assert.equal(verlaufSatz({ ...e, details: { count: 1 } }), '1 Datensatz in «stil» gespeichert');
    assert.equal(verlaufSatz({ ...e, details: { count: 3 } }), '3 Datensätze in «stil» gespeichert');
});

test('Eine unbekannte Aktion verschwindet nicht', () => {
    assert.equal(verlaufSatz({ ...basis, action: 'neu.etwas' }), '«stil» geändert');
});

test('Wer: ich, ein Helfer, ein Gast, eine andere Person', () => {
    const id = 'cccccccc-2222-4000-8000-000000000004';
    assert.equal(verlaufWer({ actorUuid: id, actorKind: 'human' }, id), 'Du');
    assert.equal(verlaufWer({ actorUuid: WURZEL, actorKind: 'ai', actorName: 'agent-lea' }, id), 'agent-lea');
    assert.equal(verlaufWer({ actorUuid: WURZEL, actorKind: 'ai', actorName: null }, id), 'KI-Helfer');
    assert.equal(verlaufWer({ actorUuid: WURZEL, actorKind: 'guest' }, id), 'Gast');
    assert.equal(verlaufWer({ actorUuid: WURZEL, actorKind: 'human' }, id), 'Person aaaaaaaa…');
});

test('Tage: Heute, Gestern, sonst das Datum, Reihenfolge bleibt', () => {
    const jetzt = new Date(2026, 10, 9, 12, 0);
    const heute = new Date(2026, 10, 9, 8, 5).toISOString();
    const gestern = new Date(2026, 10, 8, 23, 59).toISOString();
    const frueher = new Date(2026, 9, 3, 7, 0).toISOString();
    assert.equal(verlaufTag(heute, jetzt), 'Heute');
    assert.equal(verlaufTag(gestern, jetzt), 'Gestern');
    assert.equal(verlaufTag(frueher, jetzt), '03.10.2026');
    assert.equal(verlaufUhrzeit(heute), '08:05');
    assert.deepEqual(
        nachTagen([{ at: heute }, { at: heute }, { at: gestern }, { at: frueher }], jetzt).map(t => [
            t.titel,
            t.eintraege.length
        ]),
        [
            ['Heute', 2],
            ['Gestern', 1],
            ['03.10.2026', 1]
        ]
    );
});
