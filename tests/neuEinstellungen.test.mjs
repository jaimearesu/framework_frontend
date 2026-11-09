// Reiter «Einstellungen» im neuen Cockpit (public/neu/js/einstellungen-werte.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    bereichErlaubt,
    einstellungenFuer,
    felderAus,
    hinweiseFuerMenschen,
    loeschUmfang,
    sicherungText,
    stufeText,
    teilGewaehlt,
    teileFuer,
    vektorZustand,
    wiederherstellenName
} from '../public/neu/js/einstellungen-werte.js';

const ids = rights => einstellungenFuer(rights).flatMap(([, z]) => z.map(x => x.id));

test('Verwalter sehen alle neun Bereiche', () => {
    assert.deepEqual(ids({ write: true, grant: true }), [
        'domain',
        'sichtbarkeit',
        'schluessel',
        'sicherungen',
        'auftraege',
        'webhooks',
        'vektoren',
        'klonen',
        'loeschen'
    ]);
});

test('Nur ändern: nichts zu Domain, Sicherungen, Löschen', () => {
    assert.deepEqual(ids({ write: true, grant: false }), ['schluessel', 'auftraege', 'webhooks', 'vektoren', 'klonen']);
    assert.equal(bereichErlaubt({ write: true }, 'loeschen'), false);
    assert.equal(bereichErlaubt({ write: true }, 'klonen'), true);
});

test('Nur ansehen: keine Einstellungen, auch nicht per Adresse', () => {
    assert.deepEqual(einstellungenFuer({ write: false, grant: false }), []);
    assert.equal(bereichErlaubt({ write: false, grant: false }, 'domain'), false);
    assert.equal(bereichErlaubt({ write: true, grant: true }, 'gibtsnicht'), false);
});

test('Löschen ist als gefährlich markiert', () => {
    const zeilen = einstellungenFuer({ write: true, grant: true }).flatMap(([, z]) => z);
    assert.deepEqual(
        zeilen.filter(z => z.gefahr).map(z => z.id),
        ['loeschen']
    );
});

const site = {
    uuid: 'w',
    parts: [
        { uuid: 'a', name: 'api', types: ['ssf'] },
        { uuid: 'b', name: null, types: ['html'] }
    ]
};

test('Teile zur Auswahl: nur SSF, oder mit der Wurzel', () => {
    assert.deepEqual(
        teileFuer(site, { nurSsf: true }).map(t => t.uuid),
        ['a']
    );
    const alle = teileFuer(site, { mitWurzel: true });
    assert.deepEqual(
        alle.map(t => t.uuid),
        ['w', 'a', 'b']
    );
    assert.equal(alle[2].name, 'Teil');
});

test('Die gemerkte Wahl gilt nur, solange es den Teil gibt', () => {
    const teile = [{ uuid: 'a' }, { uuid: 'b' }];
    assert.equal(teilGewaehlt(teile, 'b').uuid, 'b');
    assert.equal(teilGewaehlt(teile, 'weg').uuid, 'a');
    assert.equal(teilGewaehlt([], 'a'), null);
});

test('Sicherung in Worten und Vorschlag für den Namen', () => {
    const text = sicherungText({ objects: 1, dataRows: 2, withFiles: false, bytes: 2048 });
    assert.match(text, /^1 Teil, 2 Datensätze, ohne Dateien, gepackt/);
    assert.equal(wiederherstellenName({ domain: 'brot', createdAt: '2026-10-24T12:00:00Z' }), 'brot-20261024');
    const lang = wiederherstellenName({ domain: 'x'.repeat(120), createdAt: '2026-10-24T12:00:00Z' });
    assert.equal(lang.length, 100);
});

test('Stufe als Wort, auch bei Unbekanntem', () => {
    assert.equal(stufeText('members'), 'Nur Angemeldete');
    assert.equal(stufeText('neu'), 'neu');
});

test('Felder trennen, leere fallen weg', () => {
    assert.deepEqual(felderAus(' titel, adresse.ort ,,'), ['titel', 'adresse.ort']);
});

test('Zustand der Vektoren', () => {
    assert.match(vektorZustand({ sources: [] }), /Keine Regel/);
    const text = vektorZustand({
        rule: { felder: ['titel'] },
        sources: [{ name: 'datensaetze', records: 3 }],
        pending: 2
    });
    assert.equal(text, 'Regel: titel, 3 Datensätze, 2 Stücke warten auf ihren Vektor');
});

test('Löschen sagt, wie viel wegkommt', () => {
    assert.equal(loeschUmfang({ parts: [{}] }), 'Die Website wird gelöscht.');
    assert.equal(loeschUmfang({ parts: [{}, {}] }), 'Die Website und ihr Teil werden gelöscht.');
    assert.equal(loeschUmfang({ parts: [{}, {}, {}] }), 'Die Website und ihre 2 Teile werden gelöscht.');
});

test('Hinweise für KI-Helfer sieht ein Mensch nicht', () => {
    assert.deepEqual(hinweiseFuerMenschen(['Aufräumen: delete_object { deep: true }', 'Zeitpläne sind pausiert.']), [
        'Zeitpläne sind pausiert.'
    ]);
    assert.deepEqual(hinweiseFuerMenschen(undefined), []);
});
