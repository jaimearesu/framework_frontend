// Reiter «Personen» im neuen Cockpit (public/neu/js/personen-werte.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adressenAus,
    anmeldungGrund,
    besucherZustand,
    darfAus,
    darfText,
    einladenText,
    eingabeFehler,
    einladungKoerper,
    einladungenAus,
    empfaengerName,
    nochText,
    personenAus,
    rechteFuer,
    rollenAenderung,
    teilPersonenAus,
    teileZumFragen,
    uebergabeKandidaten,
    wegeFuer,
    zielAus
} from '../public/neu/js/personen-werte.js';

const ICH = 'aaaaaaaa-0000-4000-8000-000000000000';
const ANDERER = 'bbbbbbbb-0000-4000-8000-000000000000';

test('Übergeben geht nur an andere Menschen, die die ganze Website verwalten', () => {
    const personen = personenAus(
        [
            { uuid: ICH, kind: 'mensch', name: null, roles: ['black', 'blue', 'red'] },
            { uuid: ANDERER, kind: 'mensch', name: null, roles: ['black', 'blue', 'red'] },
            { uuid: 'nur-sehen', kind: 'mensch', name: null, roles: ['black'] },
            { uuid: 'helfer', kind: 'objekt', name: 'agent-mira', roles: ['black', 'blue', 'red'] }
        ],
        ICH
    );
    assert.deepEqual(
        uebergabeKandidaten(personen).map(p => p.id),
        [ANDERER]
    );
    assert.equal(empfaengerName(personen, ANDERER), 'Mensch bbbbbbbb…');
    assert.equal(empfaengerName(personen, 'cccccccc-1111'), 'Mensch cccccccc…');
});

test('Menschen zeigen nie einen Namen: «Du» oder «Mensch» mit gekürzter ID', () => {
    const liste = personenAus(
        [
            { uuid: 'x', kind: 'objekt', name: 'agent-mira', roles: ['black', 'red'] },
            { uuid: ANDERER, kind: 'mensch', name: null, roles: ['black'] },
            { uuid: ICH, kind: 'mensch', name: null, roles: ['black', 'blue', 'red'] }
        ],
        ICH
    );
    assert.deepEqual(
        liste.map(p => [p.name, p.art, p.darf]),
        [
            ['Du', 'Mensch', 'verwalten'],
            ['Mensch bbbbbbbb…', 'Mensch', 'ansehen'],
            ['agent-mira', 'KI-Helfer', 'aendern']
        ]
    );
    assert.equal(liste[0].ich, true);
});

test('Die Schutz-Einträge der Teile sind keine Personen', () => {
    const liste = personenAus([{ uuid: 'x', kind: 'objekt', name: 'shop', roles: ['blue'], family: true }], ICH);
    assert.deepEqual(liste, []);
});

test('Stufe aus den Rollen: red ohne black zählt trotzdem als ändern', () => {
    assert.equal(darfAus(['red']), 'aendern');
    assert.equal(darfAus(['black']), 'ansehen');
    assert.equal(darfAus(['black', 'blue', 'red']), 'verwalten');
});

test('Nur das eigene Schloss eines Teils zählt, nicht geerbte', () => {
    const teil = { uuid: 't', name: 'Menü' };
    const locks = [
        { own: false, members: [{ uuid: 'geerbt', kind: 'mensch', roles: ['black'] }] },
        {
            own: true,
            members: [
                { uuid: ANDERER, kind: 'mensch', roles: ['black', 'red'] },
                { uuid: 'schutz', kind: 'objekt', name: 'shop', roles: ['blue'], family: true }
            ]
        }
    ];
    const liste = teilPersonenAus(locks, teil, ICH);
    assert.equal(liste.length, 1);
    assert.equal(darfText(liste[0]), 'Ansehen und ändern, nur «Menü»');
});

test('Rechte ändern: geben, was fehlt, nehmen, was zu viel ist', () => {
    assert.deepEqual(rollenAenderung(['black'], 'aendern'), { geben: ['red'], nehmen: [] });
    assert.deepEqual(rollenAenderung(['black', 'blue', 'red'], 'ansehen'), { geben: [], nehmen: ['blue', 'red'] });
    assert.deepEqual(rollenAenderung(['black', 'red'], 'aendern'), { geben: [], nehmen: [] });
});

test('Wie lange etwas noch gilt', () => {
    const jetzt = Date.parse('2026-11-09T12:00:00Z');
    assert.equal(nochText('2026-11-09T12:30:00Z', jetzt), 'noch unter 1 Stunde');
    assert.equal(nochText('2026-11-09T14:00:00Z', jetzt), 'noch 2 Stunden');
    assert.equal(nochText('2026-11-10T13:00:00Z', jetzt), 'noch 1 Tag');
    assert.equal(nochText('2026-11-16T12:00:00Z', jetzt), 'noch 7 Tage');
});

test('Nur offene Einladungen stehen in der Liste', () => {
    const jetzt = Date.parse('2026-11-09T12:00:00Z');
    const offen = {
        uuid: 'e',
        open: true,
        roles: ['black', 'red'],
        expiresAt: '2026-11-16T12:00:00Z',
        usedCount: 1,
        maxUses: 3
    };
    const liste = einladungenAus([offen, { ...offen, uuid: 'zu', open: false }], 'ziel', { name: 'Menü' }, jetzt);
    assert.deepEqual(liste, [
        {
            id: 'e',
            ziel: 'ziel',
            worauf: 'Menü',
            darf: 'Ansehen und ändern',
            gueltig: 'noch 7 Tage',
            benutzt: '1 von 3'
        }
    ]);
});

test('Nachgefragt wird nur bei Teilen, wo es etwas zu finden gibt', () => {
    const site = {
        parts: [
            { uuid: 'a', name: 'Menü', hasLock: true, openInvitations: 0 },
            { uuid: 'b', name: null, hasLock: false, openInvitations: 2 },
            { uuid: 'c', name: 'Leer', hasLock: false, openInvitations: 0 }
        ]
    };
    assert.deepEqual(
        teileZumFragen(site).map(t => [t.uuid, t.name]),
        [
            ['a', 'Menü'],
            ['b', 'Teil']
        ]
    );
});

test('Adressen trennen, Rückmeldung nach dem Einladen', () => {
    assert.deepEqual(adressenAus('a@b.ch, c@d.ch;e@f.ch  g@h.ch'), ['a@b.ch', 'c@d.ch', 'e@f.ch', 'g@h.ch']);
    assert.equal(einladenText({ added: 1, already: 0, invalid: 0 }), '1 Adresse hinzugefügt');
    assert.equal(
        einladenText({ added: 2, already: 1, invalid: 1 }),
        '2 Adressen hinzugefügt, 1 schon auf der Liste, 1 ungültig'
    );
});

test('Zustand der Besucher und warum Einschalten nicht geht', () => {
    assert.equal(besucherZustand({ blockedAt: 'x', lastLoginAt: 'y' }).art, 'stop');
    assert.equal(besucherZustand({ lastLoginAt: 'y' }).art, 'ok');
    assert.equal(besucherZustand({}).art, 'leer');
    assert.match(anmeldungGrund({ ready: false, live: true }), /Mail-Versand/);
    assert.match(anmeldungGrund({ ready: true, live: false }), /online/);
    assert.equal(anmeldungGrund({ ready: true, live: true }), null);
});

test('Gäste haben nur den Weg über die ID', () => {
    assert.deepEqual(wegeFuer(true), ['id']);
    assert.deepEqual(wegeFuer(false), ['link', 'email', 'id']);
});

test('«Verwalten» gibt es nie per Link und nie nur auf einem Teil', () => {
    assert.equal(rechteFuer('link', 'alles').includes('verwalten'), false);
    assert.equal(rechteFuer('id', 'teil').includes('verwalten'), false);
    assert.equal(rechteFuer('id', 'alles').includes('verwalten'), true);
});

test('Eingaben im Dialog', () => {
    const basis = { worauf: 'alles', teil: '', anzahl: 1, id: '', email: '' };
    assert.ok(eingabeFehler({ ...basis, weg: 'email', email: 'kein' }));
    assert.ok(eingabeFehler({ ...basis, weg: 'email', email: 'a@b.ch c@d.ch' }));
    assert.equal(eingabeFehler({ ...basis, weg: 'email', email: 'a@b.ch' }), '');
    assert.ok(eingabeFehler({ ...basis, weg: 'link', worauf: 'teil' }));
    assert.ok(eingabeFehler({ ...basis, weg: 'link', anzahl: 0 }));
    assert.ok(eingabeFehler({ ...basis, weg: 'link', anzahl: 101 }));
    assert.equal(eingabeFehler({ ...basis, weg: 'link' }), '');
    assert.ok(eingabeFehler({ ...basis, weg: 'id', id: '../boese' }));
    assert.equal(eingabeFehler({ ...basis, weg: 'id', id: ` ${ANDERER} ` }), '');
});

test('Einladung: ändern bringt black mit, ein Teil heisst scope «teil»', () => {
    assert.deepEqual(einladungKoerper({ darf: 'aendern', worauf: 'teil', gueltig: '1 Tag', anzahl: '3' }), {
        roles: ['black', 'red'],
        scope: 'teil',
        hours: 24,
        maxUses: 3
    });
    assert.deepEqual(zielAus({ worauf: 'teil', teil: 't' }, 'w'), { uuid: 't', scope: 'teil' });
    assert.deepEqual(zielAus({ worauf: 'alles', teil: 't' }, 'w'), { uuid: 'w', scope: 'familie' });
});
