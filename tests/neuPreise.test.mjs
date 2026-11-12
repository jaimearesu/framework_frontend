// tests/neuPreise.test.mjs
// ---------------------------------------------------------------------
// Preisliste (12.11.2026): Stufen-Karten mit grossem Preis und die Vergleichs-Tabelle,
// im Cockpit und auf der Startseite (Deutsch + Englisch). Geprüft: Zahlen kurz und lesbar,
// Preis als grosse Zahl, «Empfohlen» bei Mittel, Tabelle mit allen Grenzen, Antwort lesen.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    zahlKurz,
    groesse,
    preisTeile,
    stufenName,
    grenzeText,
    kartenZeilen,
    stufenKarte,
    matrix,
    stufenAusAntwort,
    EMPFOHLEN,
    TEXTE
} from '../public/neu/js/preise-werte.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;
// Wie GET /api/billing/stufen (Backend src/config/tiers.js, gekürzt auf drei Stufen)
const STUFEN = [
    {
        id: 'gratis',
        name: 'Gratis',
        price: 0,
        runs: 5000,
        dataRows: 5000,
        storageBytes: 500 * MB,
        customDomains: 0,
        siteBytes: 5 * MB,
        siteParts: 200,
        objects: 500,
        uploadLinks: 25,
        liveConnections: 200,
        openJobs: 50,
        vectorTokens: 2000000
    },
    {
        id: 'mittel',
        name: 'Mittel',
        price: 1900,
        runs: 500000,
        dataRows: 500000,
        storageBytes: 20 * GB,
        customDomains: 10,
        siteBytes: 30 * MB,
        siteParts: 1000,
        objects: 10000,
        uploadLinks: 200,
        liveConnections: 1000,
        openJobs: 250,
        vectorTokens: 50000000
    },
    {
        id: 'plattform',
        name: 'Plattform',
        price: 9900,
        runs: 10000000,
        dataRows: 10000000,
        storageBytes: 100 * GB,
        customDomains: null,
        siteBytes: 30 * MB,
        siteParts: 1500,
        objects: 200000,
        uploadLinks: 500,
        liveConnections: 5000,
        openJobs: 1000,
        vectorTokens: 500000000
    }
];

describe('Zahlen und Preise', () => {
    test('Zahlen: Schweizer Apostroph, Englisch mit Komma, ab 1 Mio. kurz', () => {
        assert.equal(zahlKurz(5000), "5'000");
        assert.equal(zahlKurz(5000, 'en'), '5,000');
        assert.equal(zahlKurz(2500000), '2.5 Mio.');
        assert.equal(zahlKurz(10000000, 'en'), '10M');
        assert.equal(zahlKurz(1234567), "1'234'567", 'krumme Zahl bleibt genau');
        assert.equal(zahlKurz(NaN), '–');
    });

    test('Grösse in MB/GB wie das Backend (1024)', () => {
        assert.equal(groesse(500 * MB), '500 MB');
        assert.equal(groesse(5 * GB), '5 GB');
        assert.equal(groesse(0), '0 MB');
    });

    test('Preis als grosse Zahl mit Einheit', () => {
        assert.deepEqual(preisTeile(1900), { betrag: '19.–', einheit: 'CHF / Monat' });
        assert.deepEqual(preisTeile(0), { betrag: '0.–', einheit: 'für immer gratis' });
        assert.deepEqual(preisTeile(950, 'en'), { betrag: '9.50', einheit: 'CHF / month' });
    });
});

describe('Karten', () => {
    test('Namen auf Englisch, IDs bleiben', () => {
        assert.equal(stufenName(STUFEN[0], 'de'), 'Gratis');
        assert.equal(stufenName(STUFEN[0], 'en'), 'Free');
        assert.equal(stufenName(STUFEN[2], 'en'), 'Platform');
    });

    test('Mittel ist empfohlen, mit Satz und den wichtigsten Grenzen', () => {
        const k = stufenKarte(STUFEN[1]);
        assert.equal(EMPFOHLEN, 'mittel');
        assert.equal(k.empfohlen, true);
        assert.equal(k.preis.betrag, '19.–');
        assert.equal(k.kurz, TEXTE.de.kurz.mittel);
        assert.deepEqual(k.zeilen, [
            "500'000 Ausführungen / Monat",
            "500'000 Datensätze",
            '20 GB für Dateien',
            '10 eigene Domains',
            'Websites bis 30 MB',
            "10'000 Objekte"
        ]);
        assert.equal(stufenKarte(STUFEN[0]).empfohlen, false);
    });

    test('Domains: keine bei Gratis, unbegrenzt bei Plattform – auch Englisch', () => {
        assert.equal(kartenZeilen(STUFEN[0])[3], 'Keine eigene Domain');
        assert.equal(kartenZeilen(STUFEN[2])[3], 'Eigene Domains unbegrenzt');
        assert.equal(kartenZeilen(STUFEN[2], 'en')[3], 'Unlimited custom domains');
        assert.equal(kartenZeilen(STUFEN[2], 'en')[0], '10M runs / month');
    });

    test('fehlt eine Grenze in der Antwort, fehlt nur ihre Zeile', () => {
        const alt = { id: 'klein', name: 'Klein', price: 500, runs: 50000 };
        assert.deepEqual(kartenZeilen(alt), ["50'000 Ausführungen / Monat"]);
    });
});

describe('Vergleichs-Tabelle', () => {
    test('Kopf = Stufen, eine Zeile pro Grenze, Mittel hervorgehoben', () => {
        const m = matrix(STUFEN);
        assert.deepEqual(m.kopf, ['Grenze', 'Gratis', 'Mittel', 'Plattform']);
        assert.equal(m.empfohlen, 1);
        assert.equal(m.zeilen.length, 12);
        const zeile = name => m.zeilen.find(z => z[0] === name);
        assert.deepEqual(zeile('Preis pro Monat'), ['Preis pro Monat', '0.–', '19.– CHF', '99.– CHF']);
        assert.deepEqual(zeile('Eigene Domains'), ['Eigene Domains', '–', '10', 'unbegrenzt']);
        assert.deepEqual(zeile('Teile pro Website'), ['Teile pro Website', '200', "1'000", "1'500"]);
        assert.deepEqual(zeile('Objekte im Konto'), ['Objekte im Konto', '500', "10'000", "200'000"]);
        assert.deepEqual(zeile('Speicher für Dateien'), ['Speicher für Dateien', '500 MB', '20 GB', '100 GB']);
    });

    test('Englisch', () => {
        const m = matrix(STUFEN, 'en');
        assert.deepEqual(m.kopf, ['Limit', 'Free', 'Medium', 'Platform']);
        assert.ok(m.zeilen.some(z => z[0] === 'Open upload links' && z[1] === '25'));
    });

    test('Grenzen, die das Backend (noch) nicht schickt, fehlen in der Tabelle', () => {
        const m = matrix([{ id: 'gratis', name: 'Gratis', price: 0, runs: 5000 }]);
        assert.deepEqual(
            m.zeilen.map(z => z[0]),
            ['Preis pro Monat', 'Ausführungen pro Monat']
        );
        assert.equal(grenzeText('objects', undefined), '–');
    });
});

describe('Antwort von GET /api/billing/stufen', () => {
    test('Liste lesen, sonst null (Abschnitt bleibt versteckt)', () => {
        assert.deepEqual(stufenAusAntwort({ ok: true, data: { data: { tiers: STUFEN } } }), STUFEN);
        assert.equal(stufenAusAntwort({ ok: false, status: 500 }), null);
        assert.equal(stufenAusAntwort({ ok: true, data: { data: { tiers: [] } } }), null);
        assert.equal(stufenAusAntwort(null), null);
    });
});
