// tests/neuAuslastung.test.mjs
// ---------------------------------------------------------------------
// Reiter «Auslastung» (Plan "T", T4): aus dem Verbrauch vom Backend wird, was auf
// dem Bildschirm steht. Geprüft: Zahlen und Bytes lesbar, Balken bis 150 % mit Marke
// bei der Grenze, «noch Platz», der grosse Satz oben, Anteile pro Website, welche
// Stufe welchen Knopf bekommt, Kostendach nur mit laufendem Abo.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    zahl,
    bytes,
    bereichAnsicht,
    gesamtSatz,
    kopfAnsicht,
    preisText,
    stufenAnsicht,
    kostendachWahl,
    websitesAnsicht
} from '../public/neu/js/auslastung-werte.js';

// Die Stufen wie im Backend (src/config/tiers.js)
const MB = 1024 * 1024;
const GB = 1024 * MB;
const TIERS = [
    { id: 'gratis', name: 'Gratis', price: 0, runs: 5000, dataRows: 5000, storageBytes: 500 * MB, customDomains: 0 },
    {
        id: 'klein',
        name: 'Klein',
        price: 500,
        runs: 50000,
        dataRows: 50000,
        storageBytes: 5 * GB,
        customDomains: 3,
        siteBytes: 15 * MB
    },
    {
        id: 'mittel',
        name: 'Mittel',
        price: 1900,
        runs: 500000,
        dataRows: 500000,
        storageBytes: 20 * GB,
        customDomains: 10
    },
    {
        id: 'gross',
        name: 'Gross',
        price: 4900,
        runs: 2500000,
        dataRows: 2500000,
        storageBytes: 50 * GB,
        customDomains: 25
    },
    {
        id: 'plattform',
        name: 'Plattform',
        price: 9900,
        runs: 10000000,
        dataRows: 10000000,
        storageBytes: 100 * GB,
        customDomains: null
    }
];
const verbrauch = mehr => ({
    tier: { booked: 'gratis', current: 'gratis', next: 'klein' },
    freeLive: false,
    needed: 'gratis',
    state: 'ok',
    enforced: true,
    autoUpgradeMax: null,
    month: { start: '2026-11-01T00:00:00+01:00', resetsAt: '2026-12-01T00:00:00+01:00' },
    metrics: [],
    backupBytes: 0,
    sites: [],
    sitesCapped: false,
    tiers: TIERS,
    ...mehr
});
const stand = mehr => ({
    status: 'none',
    tier: 'gratis',
    tierWanted: null,
    autoUpgradeMax: null,
    currency: null,
    freeLive: false,
    stripeEnabled: true,
    ...mehr
});

describe('Zahlen', () => {
    test('Schweizer Tausender und Bytes', () => {
        assert.equal(zahl(5000), "5'000");
        assert.equal(zahl(2500000), "2'500'000");
        assert.equal(zahl(12), '12');
        assert.equal(bytes(0), '0 B');
        assert.equal(bytes(500 * MB), '500 MB');
        assert.equal(bytes(4.23 * GB), '4.2 GB');
        assert.equal(preisText(0), 'Kostet nichts');
        assert.equal(preisText(1900, 'eur'), '19.– EUR / Monat');
    });
});

describe('Ein Bereich', () => {
    const m = mehr => ({
        key: 'runs',
        used: 3700,
        limit: 5000,
        percent: 74,
        hardLimit: 7500,
        nextLimit: 50000,
        state: 'ok',
        ...mehr
    });

    test('unter der Grenze: Balken gegen 150 %, Marke bei 100 %, noch Platz, nächste Stufe', () => {
        const b = bereichAnsicht(m(), 'Klein');
        assert.equal(b.name, 'Ausführungen');
        assert.equal(b.text, "3'700 von 5'000");
        assert.equal(b.prozent, 74);
        assert.equal(b.breite, 49.3, '3700 / 7500');
        assert.equal(b.marke, 66.7, 'Grenze bei zwei Dritteln');
        assert.equal(b.farbe, 'ok');
        assert.equal(b.wort, null);
        assert.equal(b.platz, "Noch 1'300 frei");
        assert.equal(b.naechste, "Klein: 50'000");
    });

    test('über der Grenze: läuft noch; über 150 %: gebremst, Balken voll', () => {
        const voll = bereichAnsicht(m({ used: 6000, percent: 120, state: 'voll' }), 'Klein');
        assert.equal(voll.farbe, 'voll');
        assert.match(voll.platz, /läuft noch bis 7'500/);
        const weg = bereichAnsicht(m({ used: 9000, percent: 180, state: 'gesperrt' }), 'Klein');
        assert.equal(weg.farbe, 'stop');
        assert.equal(weg.wort, 'Gebremst');
        assert.equal(weg.breite, 100);
    });

    test('Speicher in Bytes, Domains ohne Kulanz, unbegrenzt ohne Balken', () => {
        const sp = bereichAnsicht(
            m({ key: 'storageBytes', used: 250 * MB, limit: 500 * MB, hardLimit: 750 * MB, nextLimit: 5 * GB, percent: 50 }),
            'Klein'
        );
        assert.equal(sp.text, '250 MB von 500 MB');
        const d0 = bereichAnsicht(
            m({ key: 'customDomains', used: 0, limit: 0, hardLimit: 0, nextLimit: 3, state: 'voll' })
        );
        assert.equal(d0.platz, 'Ab der Stufe Klein');
        assert.equal(d0.marke, null);
        const d3 = bereichAnsicht(m({ key: 'customDomains', used: 3, limit: 3, hardLimit: 3, state: 'voll' }));
        assert.equal(d3.platz, 'Keine weitere möglich');
        assert.equal(d3.breite, 100);
        const frei = bereichAnsicht(m({ limit: null, hardLimit: null, nextLimit: null, percent: 0.1 }));
        assert.equal(frei.platz, 'Keine Grenze');
        assert.equal(frei.breite, 0);
        assert.equal(frei.naechste, null);
    });
});

describe('Der grosse Satz oben', () => {
    test('ok / bald / voll / gebremst / ohne Grenzen', () => {
        assert.equal(gesamtSatz(verbrauch())[1], 'Du hast noch Platz');
        assert.equal(gesamtSatz(verbrauch({ state: 'bald' }))[0], 'warn');
        assert.match(gesamtSatz(verbrauch({ state: 'voll' }))[2], /150 %/);
        assert.match(gesamtSatz(verbrauch({ state: 'voll' }))[2], /Klein/, 'nennt die nächste Stufe');
        const g = gesamtSatz(verbrauch({ state: 'gesperrt' }));
        assert.equal(g[0], 'gefahr');
        assert.match(g[2], /bleiben online/);
        assert.equal(gesamtSatz(verbrauch({ tier: { current: null, next: null } }))[1], 'Gratis ohne Grenzen');
    });

    test('Kopf: Stufe, Monat, nur Anzeige ohne Schalter, braucht höhere Stufe', () => {
        const k = kopfAnsicht(verbrauch({ enforced: false, needed: 'mittel' }));
        assert.equal(k.stufe, 'Gratis');
        assert.match(k.neuAb, /wieder von null/);
        assert.equal(k.nurAnzeige, true);
        assert.match(k.braucht, /Mittel/);
        assert.equal(kopfAnsicht(verbrauch()).braucht, null);
        assert.match(kopfAnsicht(verbrauch({ needed: null })).braucht, /grösser als die Stufe Plattform/);
    });
});

describe('Stufen und Knöpfe', () => {
    const knopf = (liste, id) => (liste.find(s => s.id === id).knopf || {}).art || null;

    test('ohne Abo: jede bezahlte Stufe kann man buchen, Gratis ist «jetzt»', () => {
        const l = stufenAnsicht(verbrauch(), stand());
        assert.equal(l.find(s => s.jetzt).id, 'gratis');
        assert.equal(knopf(l, 'gratis'), null);
        for (const id of ['klein', 'mittel', 'gross', 'plattform']) assert.equal(knopf(l, id), 'kaufen', id);
        assert.equal(l.find(s => s.id === 'plattform').zeilen[3], 'Eigene Domains unbegrenzt');
        assert.equal(l.find(s => s.id === 'gratis').zeilen[3], 'Keine eigene Domain');
        assert.ok(l.find(s => s.id === 'klein').zeilen.includes('Websites bis 15 MB'));
    });

    test('mit Abo Mittel: höher wechseln, tiefer ab nächstem Monat (wenn es passt), Gratis = kündigen', () => {
        const u = verbrauch({ tier: { current: 'mittel', next: 'gross' }, needed: 'klein' });
        const l = stufenAnsicht(u, stand({ status: 'active', tier: 'mittel', currency: 'chf' }));
        assert.equal(knopf(l, 'gross'), 'wechseln');
        assert.equal(knopf(l, 'klein'), 'wechseln');
        assert.match(l.find(s => s.id === 'klein').knopf.text, /nächstem Monat/);
        assert.equal(knopf(l, 'gratis'), 'portal');
        assert.equal(l.find(s => s.id === 'klein').passt, true);
        // Verbrauch passt nicht in Klein
        const zuViel = stufenAnsicht(
            verbrauch({ needed: 'mittel' }),
            stand({ status: 'active', tier: 'mittel', currency: 'chf' })
        );
        assert.equal(knopf(zuViel, 'klein'), null);
        assert.match(zuViel.find(s => s.id === 'klein').notiz, /passt nicht/);
    });

    test('vorgemerkt: Hinweis + zurücknehmen; gratis live und Stripe aus: keine Knöpfe', () => {
        const l = stufenAnsicht(
            verbrauch({ needed: 'gratis' }),
            stand({ status: 'active', tier: 'gross', tierWanted: 'klein', currency: 'chf' })
        );
        assert.equal(knopf(l, 'gross'), 'zuruecknehmen');
        assert.match(l.find(s => s.id === 'klein').notiz, /Vorgemerkt/);
        assert.ok(stufenAnsicht(verbrauch(), stand({ freeLive: true })).every(s => !s.knopf && !s.jetzt));
        assert.ok(stufenAnsicht(verbrauch(), stand({ stripeEnabled: false })).every(s => !s.knopf));
    });

    test('Kostendach: nur mit laufendem Abo, nur höhere Stufen, «aus» zuerst', () => {
        assert.equal(kostendachWahl(verbrauch(), stand()), null);
        const w = kostendachWahl(verbrauch(), stand({ status: 'active', tier: 'mittel', autoUpgradeMax: 'gross' }));
        assert.equal(w.wert, 'gross');
        assert.deepEqual(
            w.optionen.map(o => o[0]),
            ['', 'gross', 'plattform']
        );
    });
});

describe('Pro Website', () => {
    test('wer am meisten verbraucht zuerst, mit Anteilen', () => {
        const l = websitesAnsicht(
            verbrauch({
                sites: [
                    {
                        uuid: 'a',
                        domain: 'klein-site',
                        runs: 10,
                        dataRows: 5,
                        fileBytes: 0,
                        customDomains: 0,
                        share: { runs: 10, dataRows: 50, storageBytes: 0 }
                    },
                    {
                        uuid: 'b',
                        domain: 'gross-site',
                        runs: 90,
                        dataRows: 5,
                        fileBytes: 2 * MB,
                        customDomains: 1,
                        share: { runs: 90, dataRows: 50, storageBytes: 100 }
                    }
                ]
            })
        );
        assert.deepEqual(
            l.map(w => w.name),
            ['gross-site', 'klein-site']
        );
        assert.equal(l[0].anteil, 90);
        assert.deepEqual(l[0].zeilen[2], ['Dateien', '2 MB', 100]);
        assert.equal(l[0].domains, 1);
        assert.deepEqual(websitesAnsicht(verbrauch({ sites: undefined })), []);
    });
});
