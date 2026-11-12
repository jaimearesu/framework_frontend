// tests/neuEntdecken.test.mjs
// ---------------------------------------------------------------------
// Feed «Entdecken» und Meldungen (Plan "N", Stufe 4)
// Reine Funktionen aus public/neu/js/entdecken-werte.js und meldungen-werte.js
// ---------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    GRUENDE,
    feedAdresse,
    vonText,
    profilLink,
    adresseKurz,
    meldenAuftrag,
    anhaengen
} from '../public/neu/js/entdecken-werte.js';
import { gruendeText, meldungenTeilen, offeneZahl } from '../public/neu/js/meldungen-werte.js';

test('Gründe passen zum Backend (Migration 051)', () => {
    assert.deepEqual(
        GRUENDE.map(g => g[0]),
        ['spam', 'illegal', 'anstoessig', 'falsch', 'anderes']
    );
});

test('Adresse des Feeds mit limit und Merkpunkt', () => {
    assert.equal(feedAdresse('http://b'), 'http://b/api/netzwerk/entdecken');
    assert.equal(feedAdresse('http://b', { limit: 6 }), 'http://b/api/netzwerk/entdecken?limit=6');
    assert.equal(
        feedAdresse('http://b', { nach: 'a+b/c=' }),
        'http://b/api/netzwerk/entdecken?nach=a%2Bb%2Fc%3D',
        'Merkpunkt wird kodiert'
    );
});

test('Wer hat geteilt – Name, @name, Profil-Link nur wenn öffentlich', () => {
    const kirk = { handle: 'kirk', displayName: 'Captain James T. Kirk', profilePublic: true };
    assert.equal(vonText(kirk), 'Captain James T. Kirk · @kirk');
    assert.equal(vonText({ handle: 'spock' }), '@spock');
    assert.equal(vonText(null), '');
    assert.equal(profilLink(kirk), '/@kirk');
    assert.equal(profilLink({ handle: 'spock', profilePublic: false }), null);
    assert.equal(adresseKurz('https://enterprise.vindelis.site'), 'enterprise.vindelis.site');
});

test('Melden: leere Notiz fällt weg', () => {
    assert.deepEqual(meldenAuftrag('spam', '   '), { grund: 'spam' });
    assert.deepEqual(meldenAuftrag('anderes', ' Klingonen! '), { grund: 'anderes', notiz: 'Klingonen!' });
});

test('Mehr laden hängt ohne Doppelte an', () => {
    const a = [{ site: '1' }, { site: '2' }];
    assert.deepEqual(
        anhaengen(a, [{ site: '2' }, { site: '3' }]).map(i => i.site),
        ['1', '2', '3']
    );
});

test('Admin: Gründe zählen, offene und herausgenommene trennen', () => {
    assert.equal(gruendeText({ anderes: 1, spam: 3 }), '3× Spam oder Werbung, 1× Etwas anderes');
    assert.equal(gruendeText({}), '');
    const liste = [
        { site: 'a', open: 2, hidden: false },
        { site: 'b', open: 0, hidden: true },
        { site: 'c', open: 1, hidden: true },
        { site: 'd', open: 0, hidden: false }
    ];
    const { offen, heraus } = meldungenTeilen(liste);
    assert.deepEqual(
        offen.map(e => e.site),
        ['a', 'c']
    );
    assert.deepEqual(
        heraus.map(e => e.site),
        ['b']
    );
    assert.equal(offeneZahl(liste), 2);
    assert.deepEqual(meldungenTeilen(null), { offen: [], heraus: [] });
});
