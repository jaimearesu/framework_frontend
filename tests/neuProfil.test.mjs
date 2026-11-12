// tests/neuProfil.test.mjs
// ---------------------------------------------------------------------
// Namen und Profilbilder im Cockpit (Plan "N", Stufe 1, 12.11.2026)
// Reine Funktionen aus public/neu/js/profil-werte.js und die Personen-Liste mit @namen.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    nameNormal,
    nameFormFehler,
    initialen,
    profilTitel,
    profilKurz,
    wechselText,
    sollNameFragen,
    empfaengerAus,
    menschName
} from '../public/neu/js/profil-werte.js';
import { personenAus, eingabeFehler } from '../public/neu/js/personen-werte.js';
import { kontoBereiche } from '../public/neu/js/konto-werte.js';

const UUID = 'bbbbbbbb-1111-4222-8333-444455556666';

describe('@namen', () => {
    test('Eingabe wird wie im Backend normalisiert', () => {
        assert.equal(nameNormal('  @Anna-B '), 'anna-b');
        assert.equal(nameNormal(null), '');
    });

    test('Form wird beim Tippen geprüft, leer ist (noch) kein Fehler', () => {
        assert.equal(nameFormFehler(''), '');
        assert.equal(nameFormFehler('anna'), '');
        assert.match(nameFormFehler('ab'), /3 Zeichen/);
        assert.match(nameFormFehler('a'.repeat(31)), /30 Zeichen/);
        assert.match(nameFormFehler('jürg'), /Umlaute/);
        assert.match(nameFormFehler('-anna'), /Bindestrich/);
    });

    test('Empfänger: @name oder vindelis-ID', () => {
        assert.deepEqual(empfaengerAus('@Anna'), { art: 'name', wert: 'anna' });
        assert.deepEqual(empfaengerAus('anna-b'), { art: 'name', wert: 'anna-b' });
        assert.deepEqual(empfaengerAus(' ' + UUID.toUpperCase() + ' '), { art: 'id', wert: UUID });
        assert.equal(empfaengerAus(''), null);
        assert.equal(empfaengerAus('@a'), null);
        assert.equal(empfaengerAus('hallo welt'), null);
    });
});

describe('Profil-Kopf', () => {
    test('Initialen: zwei Buchstaben aus dem Anzeigenamen, sonst Vorname oder @name', () => {
        assert.equal(initialen({ displayName: 'Anna Muster' }), 'AM');
        assert.equal(initialen({ displayName: 'Anna Maria Muster' }), 'AM');
        assert.equal(initialen({ vorname: 'jaime' }), 'J');
        assert.equal(initialen({ handle: 'mein-laden' }), 'ML');
        assert.equal(initialen({}), '?');
    });

    test('Titel und Stand der Kachel', () => {
        assert.equal(profilTitel({ displayName: 'Anna M.', handle: 'anna' }, 'Anna'), 'Anna M.');
        assert.equal(profilTitel({ handle: 'anna' }, 'Anna'), 'Anna');
        assert.equal(profilTitel({ handle: 'anna' }, null), '@anna');
        assert.equal(profilTitel(null, null), 'Dein Profil');
        assert.equal(profilKurz({ handle: 'anna' }), '@anna');
        assert.equal(profilKurz({ handle: null }), 'Noch kein Name');
    });

    test('Namen wechseln: Hinweis nur, solange gesperrt', () => {
        const jetzt = Date.parse('2026-11-12T10:00:00Z');
        assert.equal(wechselText({ handleChangeableAt: null }, jetzt), '');
        assert.equal(wechselText({ handleChangeableAt: '2026-11-01T10:00:00Z' }, jetzt), '');
        assert.equal(
            wechselText({ handleChangeableAt: '2026-11-19T10:00:00Z' }, jetzt),
            'Den Namen kannst du wieder ab 19.11.2026 wechseln.'
        );
    });

    test('Nach dem Namen fragen: nur angemeldet, ohne Namen, einmal', () => {
        const ohne = { handle: null };
        assert.equal(sollNameFragen({ art: 'user', profil: ohne, gefragt: false }), true);
        assert.equal(sollNameFragen({ art: 'user', profil: ohne, gefragt: true }), false);
        assert.equal(sollNameFragen({ art: 'user', profil: { handle: 'anna' }, gefragt: false }), false);
        assert.equal(sollNameFragen({ art: 'guest', profil: ohne, gefragt: false }), false);
        assert.equal(sollNameFragen({ art: 'user', profil: null, gefragt: false }), false, 'Profil nicht geladen');
    });

    test('Konto: Kachel «Profil» zuerst, nur mit Konto', () => {
        assert.equal(kontoBereiche({ angemeldet: true, mitId: true, mitGrenzen: true })[0].id, 'profil');
        const gast = kontoBereiche({ angemeldet: false, mitId: true, mitGrenzen: true });
        assert.equal(
            gast.some(b => b.id === 'profil'),
            false
        );
    });
});

describe('Personen mit @namen', () => {
    const mensch = mehr => ({ uuid: UUID, kind: 'mensch', roles: ['black'], family: false, ...mehr });

    test('Anzeigename, sonst @name, sonst gekürzte ID', () => {
        assert.equal(menschName(mensch({ displayName: 'Beat', handle: 'beat' })), 'Beat');
        assert.equal(menschName(mensch({ handle: 'beat' })), '@beat');
        assert.equal(menschName(mensch({})), null);
        assert.equal(menschName({ kind: 'objekt', handle: 'x' }), null);
        const [p] = personenAus([mensch({ handle: 'beat', hasAvatar: true })], 'ich');
        assert.deepEqual([p.name, p.handle, p.hatBild, p.mensch], ['@beat', 'beat', true, true]);
        const [ohne] = personenAus([mensch({})], 'ich');
        assert.equal(ohne.name, 'Mensch bbbbbbbb…');
        assert.equal(ohne.hatBild, false);
    });

    test('Zugriff geben: @name geht wie eine ID', () => {
        const basis = { weg: 'id', worauf: 'alles', teil: null, darf: 'ansehen', anzahl: 1, email: '' };
        assert.equal(eingabeFehler({ ...basis, id: '@anna' }), '');
        assert.equal(eingabeFehler({ ...basis, id: UUID }), '');
        assert.match(eingabeFehler({ ...basis, id: 'a b' }), /@name/);
    });
});
