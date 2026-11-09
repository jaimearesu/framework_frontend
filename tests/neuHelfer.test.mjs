// KI-Helfer und «Neue Website» im neuen Cockpit (public/neu/js/helfer-werte.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { helferAusApi, helferNameAus, websiteAnlegen } from '../public/neu/js/helfer-werte.js';

const adresseAus = text => text.trim().toLowerCase().replace(/\s+/g, '-');

test('Helfer: verbunden, mit Websites und Verbindung zum Trennen', () => {
    const jetzt = Date.parse('2026-11-09T12:00:00Z');
    const x = helferAusApi(
        {
            uuid: 'a',
            domain: 'agent-claude',
            tokens: { active: 0 },
            connections: [{ uuid: 'v1', status: 'active', clientHost: 'claude.ai' }],
            rights: [{ domain: 'shop', rootUuid: 'r', roles: ['black', 'red', 'blue'] }],
            hiddenRights: 0,
            lastActivityAt: '2026-11-09T11:00:00Z'
        },
        jetzt
    );
    assert.equal(x.zustand, 'aktiv');
    assert.equal(x.status, 'Verbunden mit Claude');
    assert.deepEqual(x.websites, ['shop']);
    assert.equal(x.arbeit[0].role, 'verwaltet');
    assert.deepEqual(x.verbindungen, [{ id: 'v1', name: 'Claude' }]);
    assert.match(x.aktiv, /^vor /);
});

test('Helfer: frisch angelegt wartet er, nach einer beendeten Verbindung ist er getrennt', () => {
    const basis = { uuid: 'a', domain: 'agent-x', tokens: { active: 0 }, rights: [], hiddenRights: 0 };
    assert.equal(helferAusApi({ ...basis, connections: [] }).zustand, 'neu');
    assert.equal(helferAusApi({ ...basis, connections: [] }).aktiv, 'noch nie');
    assert.equal(helferAusApi({ ...basis, connections: [{ uuid: 'v', status: 'revoked' }] }).zustand, 'getrennt');
});

test('Helfer-Name: bekommt «agent-» genau einmal, leer und unsinnig wird abgelehnt', () => {
    assert.deepEqual(helferNameAus('Mira', adresseAus), { name: 'agent-mira' });
    assert.deepEqual(helferNameAus('agent-mira', adresseAus), { name: 'agent-mira' });
    assert.ok(helferNameAus('   ', adresseAus).fehler);
    assert.ok(helferNameAus('x'.repeat(70), adresseAus).fehler);
});

// Nachgebautes Backend: merkt sich jeden Aufruf, einzelne können scheitern
const attrappe = (scheitert = () => false) => {
    const aufrufe = [];
    const antwort = (art, pfad, body) => {
        aufrufe.push([art, pfad, body]);
        if (scheitert(art, pfad, body)) return { ok: false, error: 'geht nicht' };
        if (art === 'POST' && pfad === '/api/objects')
            return { ok: true, data: { data: { uuid: 'U-' + body.domain } } };
        if (art === 'POST' && pfad.startsWith('/api/tokens/object/')) {
            return { ok: true, data: { data: { uuid: 'T1', token: 'at0_geheim' } } };
        }
        return { ok: true, data: {} };
    };
    return {
        aufrufe,
        post: async (p, b) => antwort('POST', p, b),
        put: async (p, b) => antwort('PUT', p, b),
        del: async p => antwort('DELETE', p)
    };
};

test('Gast: nur die Website und die Beschreibung', async () => {
    const api = attrappe();
    const r = await websiteAnlegen({ api, adresse: 'shop', beschreibung: 'Ein Laden', helfer: null, fortschritt: {} });
    assert.deepEqual(r, { ok: true, uuid: 'U-shop', warnung: null });
    assert.deepEqual(
        api.aufrufe.map(a => a.slice(0, 2)),
        [
            ['POST', '/api/objects'],
            ['PUT', '/api/objects/U-shop/note']
        ]
    );
});

test('Bestehender Helfer bekommt black, red und blue auf dieser Website und nichts anderes', async () => {
    const api = attrappe();
    const r = await websiteAnlegen({ api, adresse: 'shop', beschreibung: '', helfer: { uuid: 'H' }, fortschritt: {} });
    assert.equal(r.ok, true);
    const rechte = api.aufrufe.filter(a => a[1].includes('/members/'));
    assert.deepEqual(
        rechte.map(a => a[1]),
        new Array(3).fill('/api/objects/U-shop/members/H')
    );
    assert.deepEqual(
        rechte.map(a => a[2].roleType),
        ['black', 'red', 'blue']
    );
});

test('Neuer Helfer: wird Agent, sein erster Schlüssel ist sofort widerrufen', async () => {
    const api = attrappe();
    const r = await websiteAnlegen({
        api,
        adresse: 'shop',
        beschreibung: '',
        helfer: { neu: 'agent-mira' },
        fortschritt: {}
    });
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(r).includes('at0_geheim'), false);
    const wege = api.aufrufe.map(a => a[0] + ' ' + a[1]);
    assert.deepEqual(wege.slice(0, 4), [
        'POST /api/objects',
        'POST /api/objects',
        'POST /api/tokens/object/U-agent-mira',
        'DELETE /api/tokens/T1'
    ]);
    assert.equal(api.aufrufe[2][2].expiresInHours, 1);
    assert.ok(wege.includes('PUT /api/objects/U-shop/members/U-agent-mira'));
});

test('Name vergeben: Schritt «website», kein Helfer entsteht', async () => {
    const api = attrappe((art, pfad, body) => art === 'POST' && body?.domain === 'shop');
    const r = await websiteAnlegen({
        api,
        adresse: 'shop',
        beschreibung: 'x',
        helfer: { neu: 'agent-mira' },
        fortschritt: {}
    });
    assert.deepEqual(r, { ok: false, schritt: 'website', error: 'geht nicht' });
    assert.equal(api.aufrufe.length, 1);
});

test('Nochmals versuchen legt die Website nicht doppelt an', async () => {
    let einmal = true;
    const api = attrappe((art, pfad) => {
        if (art === 'PUT' && pfad.includes('/members/') && einmal) {
            einmal = false;
            return true;
        }
        return false;
    });
    const fortschritt = {};
    const argumente = { api, adresse: 'shop', beschreibung: 'x', helfer: { neu: 'agent-mira' }, fortschritt };
    const erst = await websiteAnlegen(argumente);
    assert.deepEqual(erst, { ok: false, schritt: 'rechte', error: 'geht nicht' });
    const zweit = await websiteAnlegen(argumente);
    assert.equal(zweit.ok, true);
    assert.equal(api.aufrufe.filter(a => a[1] === '/api/objects').length, 2); // Website + Agent, je einmal
    assert.equal(api.aufrufe.filter(a => a[1].endsWith('/note')).length, 1);
});

test('Eine fehlende Beschreibung bricht nicht ab, sagt es aber', async () => {
    const api = attrappe((art, pfad) => pfad.endsWith('/note'));
    const r = await websiteAnlegen({ api, adresse: 'shop', beschreibung: 'x', helfer: null, fortschritt: {} });
    assert.equal(r.ok, true);
    assert.match(r.warnung, /Beschreibung/);
});
