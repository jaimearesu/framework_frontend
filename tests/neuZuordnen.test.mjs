// KI-Helfer zuordnen und Anleitung «Eigene Domain» im neuen Cockpit (09.11.2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import { helferAusApi, mehrereZuordnen, rechteGeben, zuordnungsZiele } from '../public/neu/js/helfer-werte.js';
import { kaestenAusApi, websitesAusApi } from '../public/neu/js/websites-werte.js';
import { ANBIETER, anbieterVon, domainSchritte, ohneWww } from '../public/neu/js/domain-werte.js';

const attrappe = (scheitert = () => false) => {
    const aufrufe = [];
    return {
        aufrufe,
        put: async (pfad, body) => {
            aufrufe.push([pfad, body.roleType]);
            return scheitert(pfad) ? { ok: false, error: 'geht nicht' } : { ok: true };
        }
    };
};

test('Ein Helfer bekommt auf einer Website alle drei Rechte', async () => {
    const api = attrappe();
    assert.equal(await rechteGeben({ api, ziel: 'W', helfer: 'H' }), null);
    assert.deepEqual(api.aufrufe, [
        ['/api/objects/W/members/H', 'black'],
        ['/api/objects/W/members/H', 'red'],
        ['/api/objects/W/members/H', 'blue']
    ]);
});

test('Angeboten wird nur, wo ich Rechte vergeben darf, einen Kasten darf er nur benutzen', () => {
    const roh = [
        { uuid: 'b', name: 'beta', art: 'website', rights: { grant: true } },
        { uuid: 'a', name: 'alpha', art: 'speicher', rights: { grant: true } },
        { uuid: 'f', name: 'fremd', art: 'website', rights: { grant: false } },
        { uuid: 'k', name: 'kasten', art: 'werkzeugkasten', rights: { grant: true } },
        { uuid: 'x', name: 'fremder-kasten', art: 'werkzeugkasten', rights: { grant: false } }
    ];
    const ziele = zuordnungsZiele(websitesAusApi(roh, []), kaestenAusApi(roh));
    assert.deepEqual(
        ziele.map(z => [z.id, z.text, z.rollen.length]),
        [
            ['a', 'Speicher', 3],
            ['b', 'Website', 3],
            ['k', 'Werkzeugkasten, nur benutzen', 1]
        ]
    );
});

test('Scheitert ein Ziel, werden die anderen trotzdem zugeordnet und das Ziel genannt', async () => {
    const api = attrappe(pfad => pfad.includes('/B/'));
    const ziele = [
        { id: 'A', titel: 'a', rollen: ['black'] },
        { id: 'B', titel: 'b', rollen: ['black'] },
        { id: 'C', titel: 'c', rollen: ['black'] }
    ];
    const r = await mehrereZuordnen({ api, helfer: 'H', ziele });
    assert.deepEqual(r.fehler, [{ titel: 'b', problem: 'geht nicht' }]);
    assert.equal(api.aufrufe.length, 3);
});

test('Der Helfer kennt, worauf er schon Rechte hat', () => {
    const x = helferAusApi({
        uuid: 'a',
        domain: 'agent-x',
        tokens: { active: 0 },
        connections: [],
        rights: [{ domain: 'shop', rootUuid: 'r', roles: ['black'] }],
        hiddenRights: 0
    });
    assert.deepEqual(x.zugeordnet, ['r']);
});

test('Jeder Anbieter sagt, was man öffnet, wie die Felder heissen und wie man speichert', () => {
    for (const a of ANBIETER) {
        assert.ok(a.oeffnen.length >= 2, a.id);
        assert.ok(a.felder.typ && a.felder.name && a.felder.ziel, a.id);
        assert.ok(a.speichern, a.id);
    }
    assert.match(anbieterVon('cloudflare').hinweis, /DNS only/);
    assert.equal(anbieterVon('gibtsnicht').id, 'anderer');
});

test('Der Schritt «Ohne www» kommt nur bei Adressen mit www', () => {
    assert.equal(domainSchritte('www.laden.ch').at(-1)[0], 'ohne-www');
    assert.equal(domainSchritte('shop.laden.ch').at(-1)[0], 'pruefen');
    assert.equal(ohneWww('www.laden.ch'), 'laden.ch');
});
