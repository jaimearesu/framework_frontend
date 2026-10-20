// tests/access.test.mjs
// ---------------------------------------------------------------------
// REITER "ZUGRIFF" – reine Hilfsfunktionen (public/js/core/access.js)
// Plan "Login auf Websites", Etappe 5 (Rollen pro Teil im Cockpit)
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rolesForScope, canUsePartScope, accessOverview, memberLabel, revokePath } from '../public/js/core/access.js';

describe('Zugriff: Hilfsfunktionen', () => {
    test('Rollen pro Bereich: blue nur für die ganze Website', () => {
        assert.deepEqual(rolesForScope('familie'), ['black', 'red', 'blue']);
        assert.deepEqual(rolesForScope('teil'), ['black', 'red']);
    });

    test('"Nur dieser Teil" nur bei Kindern', () => {
        assert.equal(canUsePartScope({ domain: null, domain_ref: 'shop' }), true);
        assert.equal(canUsePartScope({ domain: 'shop', domain_ref: null }), false);
        assert.equal(canUsePartScope(null), false);
    });

    test('Übersicht: Schutz-Einträge der Teile zählen nicht als Mitglieder, Schlösser getrennt', () => {
        const data = {
            triplet: 't-fam',
            members: [
                { uuid: 'teil-1', roles: ['red', 'black', 'blue'], kind: 'objekt', family: true },
                { uuid: 'anna', roles: ['red', 'black'], kind: 'mensch', family: false }
            ],
            locks: [
                {
                    object: 'eltern',
                    own: false,
                    triplet: 't-eltern',
                    members: [{ uuid: 'beat', roles: ['black'], kind: 'mensch', family: false }]
                },
                {
                    object: 'ich',
                    own: true,
                    triplet: 't-ich',
                    members: [
                        { uuid: 'ich', roles: ['blue', 'black', 'red'], kind: 'objekt', family: true },
                        { uuid: 'carla', roles: ['red', 'black'], kind: 'mensch', family: false }
                    ]
                }
            ]
        };
        const v = accessOverview(data);
        assert.deepEqual(
            v.website.map(m => [m.uuid, m.roles]),
            [['anna', ['black', 'red']]]
        );
        assert.equal(v.parts, 1);
        assert.equal(v.own.triplet, 't-ich');
        assert.deepEqual(
            v.own.members.map(m => m.uuid),
            ['carla']
        );
        assert.deepEqual(
            v.inherited.map(l => [l.object, l.members.length]),
            [['eltern', 1]]
        );
    });

    test('Übersicht ohne Schlösser (älteres Backend) und ohne Daten', () => {
        assert.deepEqual(accessOverview({ members: [] }), { website: [], parts: 0, own: null, inherited: [] });
        assert.deepEqual(accessOverview(null), { website: [], parts: 0, own: null, inherited: [] });
    });

    test('Namen: Menschen nur mit kurzer ID, Kinder mit Familie/identifier', () => {
        assert.equal(memberLabel({ kind: 'mensch', uuid: 'abcdef1234567' }), 'Mensch abcdef12');
        assert.equal(memberLabel({ kind: 'objekt', name: 'shop', identifier: 'api', uuid: 'x' }), 'shop/api');
        assert.equal(memberLabel({ kind: 'objekt', name: 'speicher', uuid: 'x' }), 'speicher');
    });

    test('Adresse zum Entziehen: mit ?scope=teil nur beim Teil', () => {
        assert.equal(revokePath('o', 'm', 'black'), '/api/objects/o/members/m/black');
        assert.equal(revokePath('o', 'm', 'red', 'teil'), '/api/objects/o/members/m/red?scope=teil');
    });
});

describe('Einladungen: Hilfsfunktionen', () => {
    test('Zustand: widerrufen vor angenommen vor abgelaufen vor offen', async () => {
        const { invitationStatus } = await import('../public/js/core/access.js');
        const now = Date.parse('2026-10-20T12:00:00Z');
        const base = { revokedAt: null, usedCount: 0, maxUses: 1, expiresAt: '2026-10-27T12:00:00Z' };
        assert.equal(invitationStatus(base, now).key, 'offen');
        assert.equal(invitationStatus({ ...base, usedCount: 1 }, now).key, 'angenommen');
        assert.equal(invitationStatus({ ...base, expiresAt: '2026-10-19T12:00:00Z' }, now).key, 'abgelaufen');
        assert.equal(invitationStatus({ ...base, usedCount: 1, revokedAt: '2026-10-20' }, now).key, 'widerrufen');
    });

    test('Rollen als Text und Formular-Prüfung', async () => {
        const { invitationRolesText, checkInviteForm } = await import('../public/js/core/access.js');
        assert.equal(invitationRolesText(['black', 'red']), 'sehen + ändern');
        assert.equal(checkInviteForm({ roles: [], maxUses: 1 }) !== null, true);
        assert.equal(checkInviteForm({ roles: ['black'], maxUses: 101 }) !== null, true);
        assert.equal(checkInviteForm({ roles: ['black'], maxUses: 1 }), null);
    });
});
