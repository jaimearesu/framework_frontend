// tests/neuAbrechnung.test.mjs
// ---------------------------------------------------------------------
// Karte «Abrechnung» auf der Seite Konto (Plan "P", P2; seit Plan "T" mit Stufen): aus dem Stand vom Backend
// wird, was auf dem Bildschirm steht. Geprüft: Stand auf Deutsch, welche Knöpfe es
// gibt, Währung nur beim ersten Mal, Hinweise nach der Rückkehr von Stripe und dass
// nur zu Stripe weitergeleitet wird.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { abrechnungAnsicht, rueckkehrAus, stripeAdresseOk } from '../public/neu/js/abrechnung-werte.js';

const stand = mehr => ({
    status: 'none',
    currency: null,
    tier: 'gratis',
    currentTier: 'gratis',
    tierWanted: null,
    freeLive: false,
    liveSites: 0,
    hasCustomer: false,
    stripeEnabled: true,
    stripeMode: 'test',
    ...mehr
});
const wert = (ansicht, name) => (ansicht.zeilen.find(z => z[0] === name) || [])[1];

describe('abrechnungAnsicht', () => {
    test('ohne Abo: Stufe wählen, kein Portal, Testmodus sichtbar', () => {
        const a = abrechnungAnsicht(stand({ liveSites: 1 }));
        assert.equal(wert(a, 'Stand'), 'Kein Abo');
        assert.equal(wert(a, 'Stufe'), 'Gratis');
        assert.equal(wert(a, 'Live-Websites'), undefined, 'veröffentlichen kostet nichts mehr');
        assert.equal(a.kaufen, true);
        assert.equal(a.portal, false);
        assert.equal(a.testmodus, true);
    });

    test('aktives Abo: kein Kaufen, Portal, Stufe und Vormerkung sichtbar', () => {
        const a = abrechnungAnsicht(
            stand({
                status: 'active',
                currency: 'eur',
                hasCustomer: true,
                liveSites: 3,
                tier: 'gross',
                currentTier: 'gross',
                tierWanted: 'klein',
                currentPeriodEnd: '2026-12-11T00:00:00Z'
            })
        );
        assert.equal(wert(a, 'Stand'), 'Aktiv');
        assert.equal(wert(a, 'Währung'), 'EUR');
        assert.equal(wert(a, 'Stufe'), 'Gross');
        assert.equal(wert(a, 'Ab nächstem Monat'), 'Klein');
        assert.ok(wert(a, 'Bezahlt bis'));
        assert.equal(a.kaufen, false);
        assert.equal(a.portal, true);
    });

    test('gekündigt: wieder eine Stufe wählen', () => {
        const a = abrechnungAnsicht(stand({ status: 'canceled', currency: 'chf', hasCustomer: true }));
        assert.equal(a.kaufen, true);
        assert.equal(a.portal, true);
    });

    test('Zahlung offen und pausiert: Warnung, Frist sichtbar, nie «Websites pausiert»', () => {
        const offen = abrechnungAnsicht(
            stand({ status: 'past_due', hasCustomer: true, graceUntil: '2026-11-25T00:00:00Z' })
        );
        assert.equal(offen.hinweis[0], 'warn');
        assert.ok(wert(offen, 'Frist bis'));
        assert.match(offen.hinweis[1], /Gratis/);
        const pausiert = abrechnungAnsicht(stand({ status: 'paused', hasCustomer: true }));
        assert.equal(pausiert.hinweis[0], 'warn');
        assert.match(pausiert.hinweis[1], /bleiben online/);
    });

    test('gekündigt auf Ende der Periode: läuft noch, Zeile und Hinweis, kein Kaufen', () => {
        const a = abrechnungAnsicht({
            status: 'active',
            stripeEnabled: true,
            hasCustomer: true,
            currency: 'chf',
            currentPeriodEnd: '2026-12-11T00:00:00Z',
            cancelAt: '2026-12-11T00:00:00Z'
        });
        const zeilen = Object.fromEntries(a.zeilen);
        assert.equal(zeilen.Stand, 'Aktiv');
        assert.ok(zeilen['Gekündigt auf'], 'Zeile «Gekündigt auf»');
        assert.equal(a.hinweis[0], 'info');
        assert.match(a.hinweis[1], /gekündigt/);
        assert.equal(a.kaufen, false);
        assert.equal(a.portal, true);
        // Ohne Kündigung keine Zeile
        const ohne = abrechnungAnsicht({ status: 'active', stripeEnabled: true, cancelAt: null });
        assert.equal(Object.fromEntries(ohne.zeilen)['Gekündigt auf'], undefined);
    });

    test('gratis live: kein Kaufen, Stand «Gratis live»', () => {
        const a = abrechnungAnsicht(stand({ freeLive: true, currentTier: null }));
        assert.equal(wert(a, 'Stand'), 'Gratis live');
        assert.equal(wert(a, 'Stufe'), 'Ohne Grenzen');
        assert.equal(a.kaufen, false);
    });

    test('Stripe aus: nicht eingerichtet, keine Knöpfe', () => {
        const a = abrechnungAnsicht(stand({ stripeEnabled: false, stripeMode: null, hasCustomer: true }));
        assert.equal(a.eingerichtet, false);
        assert.equal(a.kaufen, false);
        assert.equal(a.portal, false);
        assert.equal(a.testmodus, false);
    });

    test('nach der Rückkehr: danke (noch unbestätigt / aktiv), abgebrochen', () => {
        assert.equal(abrechnungAnsicht(stand(), 'danke').hinweis[0], 'info');
        assert.equal(abrechnungAnsicht(stand({ status: 'active' }), 'danke').hinweis[0], 'ok');
        assert.match(abrechnungAnsicht(stand(), 'abgebrochen').hinweis[1], /nichts bezahlt/);
    });
});

describe('rueckkehrAus', () => {
    test('nur die zwei bekannten Werte', () => {
        assert.equal(rueckkehrAus('?abrechnung=danke'), 'danke');
        assert.equal(rueckkehrAus('?abrechnung=abgebrochen'), 'abgebrochen');
        assert.equal(rueckkehrAus('?abrechnung=<script>'), null);
        assert.equal(rueckkehrAus(''), null);
    });
});

describe('stripeAdresseOk', () => {
    test('nur https zu checkout/billing.stripe.com', () => {
        assert.equal(stripeAdresseOk('https://checkout.stripe.com/c/pay/cs_test_1'), true);
        assert.equal(stripeAdresseOk('https://billing.stripe.com/p/session/x'), true);
        assert.equal(stripeAdresseOk('http://checkout.stripe.com/x'), false);
        assert.equal(stripeAdresseOk('https://checkout.stripe.com.evil.example/x'), false);
        assert.equal(stripeAdresseOk('https://evil.example/?checkout.stripe.com'), false);
        assert.equal(stripeAdresseOk('javascript:alert(1)'), false);
        assert.equal(stripeAdresseOk(null), false);
    });
});
