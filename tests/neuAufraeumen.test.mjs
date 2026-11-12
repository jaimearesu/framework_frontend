// tests/neuAufraeumen.test.mjs
// ---------------------------------------------------------------------
// Aufräumen im Cockpit (12.11.2026, Wünsche von Jaime):
// - Startseite: Stand-Zeile statt ID, Filter in einem Knopf
// - Auslastung: feste Filter (Aufsteiger, Absteiger, Ruhig) und Bewegung zur Vorwoche
// - Konto als Kacheln mit eigener Ansicht pro Bereich
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { auslastungKurz, standTeile, filterAnzahl } from '../public/neu/js/start-werte.js';
import { websitesAnsicht, websitesFiltern, trendText, WEBSITE_FILTER } from '../public/neu/js/auslastung-werte.js';
import {
    kontoBereiche,
    bereichAusAdresse,
    idKurz,
    benachrichtigungKurz,
    KONTO_BEREICHE
} from '../public/neu/js/konto-werte.js';
import { abrechnungKurz } from '../public/neu/js/abrechnung-werte.js';

describe('Startseite: Stand-Zeile', () => {
    const w = (sichtbarkeit, mehr = {}) => ({ sichtbarkeit, probleme: 0, art: 'website', ...mehr });

    test('nichts zu tun: «Alles ruhig», dann online und Auslastung', () => {
        const teile = standTeile({
            wartet: 0,
            websites: [w('public'), w('public'), w('private')],
            auslastung: { text: 'Auslastung 12 % (Klein)', warnung: false }
        });
        assert.deepEqual(
            teile.map(t => t.text),
            ['Alles ruhig', '2 Websites online', 'Auslastung 12 % (Klein)']
        );
        assert.equal(teile[0].href, null);
        assert.equal(teile[0].art, 'ruhig');
        assert.equal(teile[2].href, '#/auslastung');
    });

    test('etwas wartet oder hat Probleme: steht vorne, statt «Alles ruhig»', () => {
        const teile = standTeile({ wartet: 2, websites: [w('public', { probleme: 3 })] });
        assert.deepEqual(
            teile.map(t => [t.text, t.href, t.art]),
            [
                ['2 Sachen warten auf dich', '#/wartet', 'achtung'],
                ['1 Website mit Problemen', '#/websites', 'achtung'],
                ['1 Website online', '#/websites', 'normal']
            ]
        );
    });

    test('ohne Websites kein «0 online», Werkzeugkästen zählen nicht', () => {
        assert.deepEqual(
            standTeile({ wartet: 1, websites: [] }).map(t => t.text),
            ['1 Sache wartet auf dich']
        );
        const kasten = { sichtbarkeit: 'public', art: 'kasten', probleme: 0 };
        assert.deepEqual(
            standTeile({ websites: [kasten] }).map(t => t.text),
            ['Alles ruhig']
        );
    });

    test('Auslastung: höchster Bereich ohne Domains, Stufe dazu, Warnung wenn nicht ok', () => {
        const u = {
            tier: { current: 'klein' },
            state: 'bald',
            tiers: [{ id: 'klein', name: 'Klein' }],
            metrics: [
                { key: 'runs', percent: 12.4 },
                { key: 'dataRows', percent: 81.6 },
                { key: 'customDomains', percent: 100 }
            ]
        };
        assert.deepEqual(auslastungKurz(u), { text: 'Auslastung 82 % (Klein)', warnung: true });
        assert.deepEqual(auslastungKurz({ ...u, tier: { current: null } }), {
            text: 'Auslastung ohne Grenzen',
            warnung: false
        });
        assert.equal(auslastungKurz(null), null);
    });

    test('Filter-Knopf zählt nur die Sichtbarkeit (Reihenfolge ist kein Filter)', () => {
        assert.equal(filterAnzahl({ sichtbarkeit: 'alle', sortierung: 'neu' }), 0);
        assert.equal(filterAnzahl({ sichtbarkeit: 'public', sortierung: 'geaendert' }), 1);
    });
});

describe('Auslastung: feste Filter pro Website', () => {
    const u = {
        sites: [
            { uuid: 'a', domain: 'gross', runs: 900, runsWeek: 100, runsPrevWeek: 400 },
            { uuid: 'b', domain: 'waechst', runs: 300, runsWeek: 250, runsPrevWeek: 50 },
            { uuid: 'c', domain: 'neu', runs: 20, runsWeek: 20, runsPrevWeek: 0 },
            { uuid: 'd', domain: 'still', runs: 0, runsWeek: 0, runsPrevWeek: 0 }
        ]
    };
    const namen = liste => liste.map(w => w.name);

    test('vier Filter, «Am meisten» zuerst', () => {
        assert.deepEqual(
            WEBSITE_FILTER.map(f => f[0]),
            ['meiste', 'auf', 'ab', 'ruhig']
        );
    });

    test('Aufsteiger, Absteiger, Ruhig', () => {
        const alle = websitesAnsicht(u);
        assert.deepEqual(namen(websitesFiltern(alle, 'meiste')), ['gross', 'waechst', 'neu', 'still']);
        assert.deepEqual(namen(websitesFiltern(alle, 'auf')), ['waechst', 'neu']);
        assert.deepEqual(namen(websitesFiltern(alle, 'ab')), ['gross']);
        assert.deepEqual(namen(websitesFiltern(alle, 'ruhig')), ['still']);
    });

    test('ohne Wochenzahlen (älteres Backend): niemand steigt oder fällt', () => {
        const alt = websitesAnsicht({ sites: [{ uuid: 'x', domain: 'x', runs: 5 }] });
        assert.deepEqual(websitesFiltern(alt, 'auf'), []);
        assert.deepEqual(websitesFiltern(alt, 'ab'), []);
    });

    test('Bewegung zur Vorwoche in Worten', () => {
        assert.equal(trendText(250, 50), '+400 % zur Vorwoche');
        assert.equal(trendText(100, 400), '−75 % zur Vorwoche');
        assert.equal(trendText(20, 0), 'neu diese Woche');
        assert.equal(trendText(0, 0), null);
        assert.equal(trendText(100, 100), null);
    });
});

describe('Konto als Kacheln', () => {
    test('Gäste sehen nur ID und Grenzen, Angemeldete alle sechs', () => {
        assert.deepEqual(
            kontoBereiche({ angemeldet: false, mitId: true, mitGrenzen: true }).map(b => b.id),
            ['ausweis', 'grenzen']
        );
        assert.equal(kontoBereiche({ angemeldet: true, mitId: true, mitGrenzen: true }).length, KONTO_BEREICHE.length);
        assert.deepEqual(
            kontoBereiche({ angemeldet: true, mitId: false, mitGrenzen: false }).map(b => b.id),
            ['profil', 'abrechnung', 'benachrichtigungen', 'anmeldung']
        );
    });

    test('offener Bereich aus der Adresse, Unbekanntes = Übersicht', () => {
        assert.equal(bereichAusAdresse('#/konto'), null);
        assert.equal(bereichAusAdresse('#/konto/abrechnung'), 'abrechnung');
        assert.equal(bereichAusAdresse('#/konto/gibtsnicht'), null);
        const gast = kontoBereiche({ angemeldet: false, mitId: true, mitGrenzen: true });
        assert.equal(bereichAusAdresse('#/konto/abrechnung', gast), null, 'Gast hat keine Abrechnung');
    });

    test('Stand-Zeilen der Kacheln', () => {
        assert.equal(idKurz('4a103a33-186a-49f6-8af7-270d793b4ed8'), '4a103a33…');
        assert.equal(benachrichtigungKurz({ mailEnabled: true, email: 'a@b.ch' }), 'An a@b.ch');
        assert.equal(benachrichtigungKurz({ mailEnabled: true }), 'Noch keine Adresse');
        assert.equal(benachrichtigungKurz({ mailEnabled: false }), 'Auf diesem Server aus');
        assert.equal(abrechnungKurz({ status: 'active', currentTier: 'klein' }), 'Klein · Aktiv');
        assert.equal(abrechnungKurz({ status: 'none', currentTier: 'gratis' }), 'Gratis · Kein Abo');
    });
});
