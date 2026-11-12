// tests/neuNetzwerk.test.mjs
// ---------------------------------------------------------------------
// Websites im Netzwerk teilen (Plan "N", Stufe 3)
// Reine Funktionen aus public/neu/js/netzwerk-werte.js
// ---------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netzwerkZustand, teilenAuftrag, zeichenRest } from '../public/neu/js/netzwerk-werte.js';
import { bitteAusApi } from '../public/neu/js/websites-werte.js';

const share = (mehr = {}) => ({
    title: 'USS Enterprise',
    blurb: null,
    visible: true,
    byMe: true,
    handle: 'kirk',
    ...mehr
});

test('Zustand der Karte: lädt, aus, geteilt, pausiert, gesperrt', () => {
    assert.equal(netzwerkZustand(null).zustand, 'laedt');

    const aus = netzwerkZustand({ share: null, canShare: true, reason: null });
    assert.equal(aus.zustand, 'aus');
    assert.equal(aus.knopf, 'Teilen…');

    const geteilt = netzwerkZustand({ share: share(), canShare: true });
    assert.equal(geteilt.zustand, 'geteilt');
    assert.equal(geteilt.text, 'Geteilt als «USS Enterprise».');
    assert.equal(geteilt.knopf, 'Ändern');

    const vonSpock = netzwerkZustand({ share: share({ byMe: false, handle: 'spock' }), canShare: true });
    assert.match(vonSpock.text, /Geteilt von @spock\./);

    const pausiert = netzwerkZustand({
        share: share({ visible: false }),
        canShare: false,
        reason: 'SITE_NOT_PUBLIC',
        reasonText: 'Nur öffentliche Websites lassen sich teilen.'
    });
    assert.equal(pausiert.zustand, 'pausiert');
    assert.match(pausiert.text, /Nur öffentliche/);
    assert.equal(pausiert.knopf, 'Ändern', 'auch pausiert kann man es entfernen');

    const ohneName = netzwerkZustand({
        share: null,
        canShare: false,
        reason: 'NEEDS_HANDLE',
        reasonText: 'Wähl zuerst einen @namen.'
    });
    assert.equal(ohneName.zustand, 'gesperrt');
    assert.equal(ohneName.knopf, null);
    assert.equal(ohneName.profilLink, true);
    assert.equal(geteilt.feedLink, true, 'geteilt: Link zum Feed');
    assert.equal(pausiert.feedLink, false);
});

test('Stufe 4: vom Team herausgenommen – kein Knopf, Grund sichtbar', () => {
    const z = netzwerkZustand({
        share: share({ visible: false, hidden: true, hiddenReason: 'Werbung' }),
        canShare: true
    });
    assert.equal(z.zustand, 'herausgenommen');
    assert.equal(z.knopf, null);
    assert.equal(z.feedLink, false);
    assert.match(z.text, /aus dem Feed genommen: Werbung/);
    const ohneGrund = netzwerkZustand({ share: share({ hidden: true, hiddenReason: null }), canShare: true });
    assert.match(ohneGrund.text, /genommen\. Die Website/);
});

test('Auftrag und Zähler', () => {
    assert.deepEqual(teilenAuftrag('  Enterprise ', '  '), { title: 'Enterprise', blurb: null });
    assert.deepEqual(teilenAuftrag('A', ' Mutig. '), { title: 'A', blurb: 'Mutig.' });
    assert.deepEqual(teilenAuftrag(undefined, undefined), { title: '', blurb: null });
    assert.equal(zeichenRest('Kirk', 80), 76);
    assert.equal(zeichenRest('🖖🖖', 80), 78, 'Zeichen, nicht Bytes');
});

test('Bitte ums Veröffentlichen merkt sich die neue Sichtbarkeit', () => {
    const e = bitteAusApi({ uuid: 'r1', objectName: 'enterprise', objectUuid: 'u1', visibility: 'public' });
    assert.equal(e.neueSichtbarkeit, 'public');
    assert.equal(e.ziel, 'u1');
});
