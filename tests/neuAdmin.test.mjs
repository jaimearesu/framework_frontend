// tests/neuAdmin.test.mjs
// ---------------------------------------------------------------------
// Admin-Bereich, Stufe 1 (12.11.2026): die reinen Funktionen aus
// public/neu/js/admin-werte.js – Reiter aus der Adresse, Grund-Prüfung wie das
// Backend, Tage fürs Geschenk, Zahlen und Abo-Zeile in Worten.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    reiterAusAdresse,
    stufenName,
    grundProblem,
    tageAusText,
    zahlText,
    umsatzText,
    kennzahlen,
    aboText,
    verbrauchText
} from '../public/neu/js/admin-werte.js';

describe('Admin-Bereich – reine Funktionen', () => {
    test('Reiter aus der Adresse, unbekannt = Übersicht', () => {
        assert.equal(reiterAusAdresse('#/admin'), 'uebersicht');
        assert.equal(reiterAusAdresse('#/admin/konten'), 'konten');
        assert.equal(reiterAusAdresse('#/admin/meldungen'), 'meldungen');
        assert.equal(reiterAusAdresse('#/admin/quatsch'), 'uebersicht');
        assert.equal(reiterAusAdresse(''), 'uebersicht');
    });

    test('Stufen-Namen', () => {
        assert.equal(stufenName('gross'), 'Gross');
        assert.equal(stufenName('gratis'), 'Gratis');
        assert.equal(stufenName(null), 'Gratis live (ohne Grenzen)');
    });

    test('Grund: 3–200 Zeichen wie im Backend', () => {
        assert.match(grundProblem(''), /mindestens 3/);
        assert.match(grundProblem('  ab '), /mindestens 3/);
        assert.equal(grundProblem('Support-Fall'), '');
        assert.match(grundProblem('x'.repeat(201)), /höchstens 200/);
        assert.equal(grundProblem('x'.repeat(200)), '');
    });

    test('Tage fürs Geschenk: leer = ohne Ende, ungültig = undefined', () => {
        assert.equal(tageAusText(''), null);
        assert.equal(tageAusText(' 30 '), 30);
        assert.equal(tageAusText('0'), undefined);
        assert.equal(tageAusText('3651'), undefined);
        assert.equal(tageAusText('1.5'), undefined);
        assert.equal(tageAusText('abc'), undefined);
    });

    test('Zahlen und Umsatz in Schweizer Schreibweise', () => {
        assert.equal(zahlText(1234567), "1'234'567");
        assert.equal(zahlText(12), '12');
        assert.equal(zahlText(null), '–');
        assert.equal(umsatzText({ chf: 1024, eur: 0 }), "1'024 CHF");
        assert.equal(umsatzText({}), '0');
    });

    test('Kennzahlen: zehn Kacheln, nur Zahlen', () => {
        const k = kennzahlen({
            accounts: 10,
            new7: 1,
            new30: 3,
            active30: 4,
            sites: 7,
            publicSites: 2,
            shared: 1,
            hidden: 0,
            openReports: 0,
            agents: 2,
            revenuePerMonth: { chf: 19 },
            storageBytes: 0,
            freeLive: 1,
            gifts: 0,
            guests: 5
        });
        assert.equal(k.length, 10);
        assert.deepEqual(k[0].slice(0, 2), ['Konten', '10']);
        assert.equal(k.find(x => x[0] === 'Umsatz pro Monat')[1], '19 CHF');
    });

    test('Abo-Zeile', () => {
        assert.match(aboText({ freeLive: true }), /Gratis live/);
        const t = aboText({
            currentTier: 'mittel',
            status: 'active',
            tier: 'klein',
            giftActive: true,
            giftTier: 'mittel',
            giftUntil: null
        });
        assert.match(t, /Gilt: Mittel/);
        assert.match(t, /Abo Klein \(active\)/);
        assert.match(t, /geschenkt: Mittel ohne Ende/);
        assert.equal(aboText(null), '');
    });

    test('Verbrauch mit und ohne Grenze', () => {
        assert.equal(verbrauchText('runs', 1200, 5000), "1'200 von 5'000");
        assert.equal(verbrauchText('dataRows', 3, null), '3 (ohne Grenze)');
        assert.match(verbrauchText('storageBytes', 0, 1024), / von /);
    });
});
