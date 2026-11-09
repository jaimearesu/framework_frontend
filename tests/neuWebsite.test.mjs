// Reine Funktionen der Website-Seite im neuen Cockpit (public/neu/js/website-werte.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    artenAusVersionen,
    codeAlsText,
    codeTeile,
    darfVeroeffentlichen,
    datenAnderswo,
    datenSpalten,
    hatWeiter,
    teileGekappt,
    veroeffentlichenAuftrag,
    veroeffentlichenWahl,
    versionenMitArt,
    websiteLink,
    zeilenVergleich,
    zelleText,
    zustandZeilen
} from '../public/neu/js/website-werte.js';

const arten = zeilen => zeilen.map(z => z.art[0] + ':' + z.text);

test('Vergleich: unveränderte Zeilen bleiben, Neues und Altes ist markiert, in Datei-Reihenfolge', () => {
    assert.deepEqual(arten(zeilenVergleich('a\nb\nc', 'a\nx\nc')), ['g:a', 'w:b', 'd:x', 'g:c']);
});

test('Vergleich: gleiche Fassungen haben keine Unterschiede', () => {
    assert.deepEqual(arten(zeilenVergleich('a\nb', 'a\nb')), ['g:a', 'g:b']);
});

test('Vergleich: eine doppelte Zeile wird nicht verschluckt', () => {
    // Die alte Fassung im Anprobe-Stil (includes) hätte die zweite «a» nicht als neu erkannt
    assert.deepEqual(arten(zeilenVergleich('a', 'a\na')), ['g:a', 'd:a']);
});

test('Vergleich: mittendrin eingefügt, davor und danach gleich', () => {
    assert.deepEqual(arten(zeilenVergleich('1\n2\n3\n4', '1\n2\nneu\n3\n4')), ['g:1', 'g:2', 'd:neu', 'g:3', 'g:4']);
});

test('Vergleich: riesige Fassungen werden grob verglichen statt den Browser anzuhalten', () => {
    const alt = Array.from({ length: 3000 }, (_, i) => 'a' + i).join('\n');
    const neu = Array.from({ length: 3000 }, (_, i) => 'b' + i).join('\n');
    const zeilen = zeilenVergleich(alt, neu);
    assert.equal(zeilen.length, 6000);
    assert.equal(zeilen[0].art, 'weg');
    assert.equal(zeilen[5999].art, 'dazu');
});

test('Code-Arten stehen in fester Reihenfolge, Versionen nach Art gefiltert', () => {
    const versionen = [
        { step: 3, types: ['css'] },
        { step: 2, types: ['syntax', 'html'] }
    ];
    assert.deepEqual(artenAusVersionen(versionen), ['html', 'css', 'syntax']);
    assert.deepEqual(
        versionenMitArt(versionen, 'html').map(v => v.step),
        [2]
    );
});

test('Code als Text: JSON wird lesbar, Text bleibt genau gleich', () => {
    assert.equal(codeAlsText('<p>  x</p>'), '<p>  x</p>');
    assert.equal(codeAlsText({ a: 1 }), '{\n  "a": 1\n}');
    assert.equal(codeAlsText(undefined), '');
});

const site = {
    uuid: 'w',
    name: 'shop',
    parts: [
        { uuid: 'p1', name: 'kopf', types: ['html'], dataRows: 0 },
        { uuid: 'p2', name: 'daten', types: [], dataRows: 3 },
        { uuid: 'p3', name: 'bild', types: [], hasFile: true, dataRows: 0 }
    ]
};

test('Teile im Code: alle Ebenen der Reihe nach, reine Daten- und Datei-Teile fehlen', () => {
    const objekte = [
        { uuid: 'w', domain: 'shop', path: ['0'] },
        { uuid: 'p9', domain_ref: 'shop', path: ['0', '10'] },
        { uuid: 'p1', domain_ref: 'shop', path: ['0', '2'] },
        { uuid: 'p2', domain_ref: 'shop', path: ['0', '3'] },
        { uuid: 'p3', domain_ref: 'shop', path: ['0', '4'] },
        { uuid: 'p1a', domain_ref: 'shop', path: ['0', '2', '1'] },
        { uuid: 'x', domain_ref: 'fremd', path: ['0', '1'] }
    ];
    const teile = codeTeile(site, objekte, o => 'n-' + o.uuid);
    assert.deepEqual(
        teile.map(t => [t.uuid, t.name, t.tiefe]),
        [
            ['w', 'Wurzel', 0],
            ['p1', 'kopf', 1],
            ['p1a', 'n-p1a', 2],
            ['p9', 'n-p9', 1]
        ]
    );
});

test('Teile im Code: ohne Objekt-Liste bleiben die direkten Teile', () => {
    assert.deepEqual(
        codeTeile(site, [], () => '').map(t => t.uuid),
        ['w', 'p1']
    );
});

test('Datenspalten lassen interne Felder weg, Werte werden Text und gekürzt', () => {
    assert.deepEqual(datenSpalten([{ _sys_id: 1, a: 1 }, { b: 2 }]), ['a', 'b']);
    assert.equal(zelleText({ x: 1 }), '{"x":1}');
    assert.equal(zelleText(null), '');
    assert.equal(zelleText('y'.repeat(300)).length, 201);
});

test('Einträge ausserhalb der direkten Teile werden gezählt', () => {
    assert.equal(datenAnderswo({ ...site, storage: { dataRows: 10 } }), 7);
    assert.equal(datenAnderswo({ ...site, storage: { dataRows: 3 } }), 0);
});

test('Blättern: gedeckelte Zahl entscheidet über volle Seite', () => {
    assert.equal(hatWeiter({ total_count: 120, total_count_capped: false }, 2, 50), true);
    assert.equal(hatWeiter({ total_count: 100, total_count_capped: false }, 2, 50), false);
    assert.equal(hatWeiter({ total_count: 10000, total_count_capped: true, returned_count: 50 }, 900, 50), true);
    assert.equal(hatWeiter({ total_count: 10000, total_count_capped: true, returned_count: 12 }, 900, 50), false);
    assert.equal(hatWeiter(undefined, 1, 50), false);
});

test('Veröffentlichen: Mitglieder-Bereiche und Datenspeicher sind nicht vorgewählt', () => {
    const wahl = veroeffentlichenWahl({
        parts: [
            { uuid: 'a', name: 'seite', visibility: 'private', types: ['html'], dataRows: 0 },
            { uuid: 'b', name: 'intern', visibility: 'members', types: ['html'], dataRows: 0 },
            { uuid: 'c', name: 'daten', visibility: 'private', types: [], dataRows: 4 }
        ]
    });
    assert.deepEqual(
        wahl.map(t => t.an),
        [true, false, false]
    );
    assert.deepEqual(veroeffentlichenAuftrag(wahl), {
        visibility: 'public',
        includeChildren: true,
        except: ['b', 'c']
    });
});

test('Veröffentlichen: warnt ab der Grenze des Backends', () => {
    assert.equal(teileGekappt({ parts: new Array(99).fill({}) }), false);
    assert.equal(teileGekappt({ parts: new Array(100).fill({}) }), true);
});

test('Veröffentlichen dürfen nur angemeldete Menschen mit blue', () => {
    const offen = { rights: { grant: true }, visibility: 'private' };
    assert.equal(darfVeroeffentlichen(offen, 'user', false), true);
    assert.equal(darfVeroeffentlichen(offen, 'guest', false), false);
    assert.equal(darfVeroeffentlichen(offen, 'user', true), false);
    assert.equal(darfVeroeffentlichen({ ...offen, visibility: 'public' }, 'user', false), false);
    assert.equal(darfVeroeffentlichen({ ...offen, rights: { grant: false } }, 'user', false), false);
});

test('Website öffnen: eigene Domain zuerst, nie etwas anderes als http(s)', () => {
    assert.equal(
        websiteLink({ customHost: 'www.laden.ch', address: 'https://a.vindelis.site' }),
        'https://www.laden.ch'
    );
    assert.equal(websiteLink({ address: 'https://a.vindelis.site' }), 'https://a.vindelis.site');
    assert.equal(websiteLink({ address: 'javascript:alert(1)' }), null);
    assert.equal(websiteLink({}), null);
});

test('Zustand: was man nicht sehen darf, fällt weg', () => {
    const titel = zeilen => zeilen.map(z => z[0]);
    const ohne = zustandZeilen({ visibility: 'private', problems24h: null, liveNow: null, backups: null, storage: {} });
    assert.deepEqual(titel(ohne), ['Sichtbar für', 'Zuletzt geändert', 'Dateien', 'Datensätze']);
    const jetzt = Date.parse('2026-11-09T12:00:00Z');
    const mit = zustandZeilen(
        {
            visibility: 'public',
            problems24h: 2,
            liveNow: 1,
            lastChange: '2026-11-09T11:00:00Z',
            backups: { latestAt: '2026-11-09T02:40:00Z', latestKind: 'nightly' },
            storage: { files: 2, fileBytes: 2048, dataRows: 1200 }
        },
        jetzt
    );
    assert.deepEqual(titel(mit), [
        'Sichtbar für',
        'Zuletzt geändert',
        'Live gerade',
        'Dateien',
        'Datensätze',
        'Probleme',
        'Letzte Sicherung'
    ]);
    assert.equal(mit[2][1], '1 Verbindung');
    assert.equal(mit[4][1], "1'200");
    assert.equal(mit[5][1], '2 Probleme heute');
    assert.match(mit[6][1], /, nachts$/);
});
