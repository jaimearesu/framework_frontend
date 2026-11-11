// tests/neuBenachrichtigung.test.mjs
// Karte «Benachrichtigungen» (Warn-Mails, 11.11.2026): Zustände, Haken, Code-Eingabe.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ARTEN,
    zustandVon,
    artenAnsicht,
    stummNach,
    codeAus,
    ohneAdresseHinweis
} from '../public/neu/js/benachrichtigung-werte.js';

describe('Benachrichtigungen', () => {
    test('Zustand der Karte', () => {
        assert.equal(zustandVon(null), 'aus');
        assert.equal(zustandVon({ mailEnabled: false, email: 'a@b.ch' }), 'aus');
        assert.equal(zustandVon({ mailEnabled: true }), 'adresse');
        assert.equal(zustandVon({ mailEnabled: true, email: 'a@b.ch', pendingEmail: 'neu@b.ch' }), 'code');
        assert.equal(zustandVon({ mailEnabled: true, email: 'a@b.ch' }), 'aktiv');
    });

    test('Haken: an = nicht abbestellt, Reihenfolge fest, ohne Doppelte', () => {
        const a = artenAnsicht({ muted: ['80'] });
        assert.deepEqual(
            a.map(x => [x.id, x.an]),
            [
                ['80', false],
                ['100', true],
                ['150', true],
                ['stufe', true]
            ]
        );
        assert.deepEqual(stummNach(['80'], 'stufe', false), ['80', 'stufe']);
        assert.deepEqual(stummNach(['80', 'stufe'], '80', true), ['stufe']);
        assert.deepEqual(stummNach(null, '150', false), ['150']);
        assert.equal(ARTEN.length, 4);
    });

    test('Code: genau 6 Ziffern, Leerzeichen erlaubt', () => {
        assert.equal(codeAus('123 456'), '123456');
        assert.equal(codeAus('12345'), null);
        assert.equal(codeAus('1234567'), null);
        assert.equal(codeAus(null), null);
    });

    test('Hinweis in der Auslastung nur ohne Adresse und mit Mail-Versand', () => {
        assert.equal(ohneAdresseHinweis({ mailEnabled: true, email: null }), true);
        assert.equal(ohneAdresseHinweis({ mailEnabled: true, email: 'a@b.ch' }), false);
        assert.equal(ohneAdresseHinweis({ mailEnabled: false }), false);
        assert.equal(ohneAdresseHinweis(null), false);
    });
});
