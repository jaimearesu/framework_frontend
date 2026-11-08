// tests/objectEmailLogin.test.mjs
// ---------------------------------------------------------------------
// Karte "Anmeldung per E-Mail" (Plan "Besucher-Login per E-Mail-Code", E4):
// was auf der Karte steht. Die Rechte prüft das Backend (tests/siteVisitors.db.test.js).
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAddressList,
    visitorBadge,
    cannotEnableReason,
    inviteResultText
} from '../public/js/pages/objectEmailLogin.js';

describe('Anmeldung per E-Mail: was steht auf der Karte?', () => {
    test('Adressen trennen: Zeilen, Leerzeichen, Komma, Strichpunkt', () => {
        assert.deepEqual(parseAddressList('a@b.ch, c@d.ch;e@f.ch\ng@h.ch   i@j.ch\r\n'), [
            'a@b.ch',
            'c@d.ch',
            'e@f.ch',
            'g@h.ch',
            'i@j.ch'
        ]);
        assert.deepEqual(parseAddressList('   '), []);
        assert.deepEqual(parseAddressList(undefined), []);
    });

    test('Zustand eines Besuchers: gesperrt geht vor', () => {
        assert.equal(visitorBadge({ blockedAt: 'x', lastLoginAt: 'y' }).text, 'gesperrt');
        assert.equal(visitorBadge({ blockedAt: null, lastLoginAt: 'y' }).text, 'schon angemeldet');
        assert.equal(visitorBadge({ blockedAt: null, lastLoginAt: null }).text, 'noch nie angemeldet');
    });

    test('Warum geht Einschalten nicht?', () => {
        assert.match(cannotEnableReason({ ready: false, live: true }), /Mail-Versand/);
        assert.match(cannotEnableReason({ ready: true, live: false }), /angemeldet/);
        assert.equal(cannotEnableReason({ ready: true, live: true }), null);
    });

    test('Rückmeldung nach dem Einladen', () => {
        assert.equal(inviteResultText({ added: 1, already: 0, invalid: 0 }), '1 Adresse hinzugefügt');
        assert.equal(
            inviteResultText({ added: 3, already: 2, invalid: 1 }),
            '3 Adressen hinzugefügt, 2 schon auf der Liste, 1 ungültig'
        );
    });
});
