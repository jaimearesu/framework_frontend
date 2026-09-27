// tests/check.test.mjs
// ---------------------------------------------------------------------
// Tests für den Systemcheck: der Prüf-Motor (runner.js) mit erfundenen
// Prüfungen, und die Liste der echten Prüfungen (checks.js).
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, summarize, reportText, expect, expectStatus, CheckError } from '../public/js/check/runner.js';
import { CHECKS, CHECK_GROUPS } from '../public/js/check/checks.js';

describe('Prüf-Motor', () => {
    test('bestanden, fehlgeschlagen, übersprungen – der Reihe nach', async () => {
        const order = [];
        const checks = [
            {
                id: 'a',
                group: 'G',
                title: 'A',
                run: async ctx => {
                    order.push('a');
                    ctx.wert = 1;
                    return 'ok a';
                }
            },
            {
                id: 'b',
                group: 'G',
                title: 'B',
                run: async () => {
                    order.push('b');
                    throw new Error('kaputt');
                }
            },
            { id: 'c', group: 'G', title: 'C', needs: ['fehlt'], run: async () => order.push('c') },
            {
                id: 'd',
                group: 'G',
                title: 'D',
                needs: ['wert'],
                run: async ctx => {
                    order.push('d');
                    return `wert=${ctx.wert}`;
                }
            }
        ];
        const results = await runChecks(checks);
        assert.deepEqual(order, ['a', 'b', 'd']); // c wurde nie ausgeführt
        assert.deepEqual(
            results.map(r => [r.id, r.status]),
            [
                ['a', 'pass'],
                ['b', 'fail'],
                ['c', 'skip'],
                ['d', 'pass']
            ]
        );
        assert.equal(results[1].detail, 'kaputt');
        assert.match(results[2].detail, /es fehlt: fehlt/);
        assert.equal(results[3].detail, 'wert=1');
    });

    test('meldet "running" und danach das Ergebnis', async () => {
        const updates = [];
        await runChecks([{ id: 'x', run: async () => 'ok' }], { onUpdate: r => updates.push(r.status) });
        assert.deepEqual(updates, ['running', 'pass']);
    });

    test('Stopp: der Rest wird als abgebrochen übersprungen', async () => {
        let stop = false;
        const checks = [
            {
                id: '1',
                run: async () => {
                    stop = true;
                }
            },
            { id: '2', run: async () => 'nie' }
        ];
        const results = await runChecks(checks, { shouldStop: () => stop });
        assert.deepEqual(
            results.map(r => r.status),
            ['pass', 'skip']
        );
        assert.equal(results[1].detail, 'abgebrochen');
    });

    test('Dauer wird gemessen', async () => {
        let t = 1000;
        const [r] = await runChecks(
            [
                {
                    id: 'x',
                    run: async () => {
                        t += 250;
                    }
                }
            ],
            { now: () => t }
        );
        assert.equal(r.ms, 250);
    });

    test('CheckError trägt die Antwort des Backends mit', async () => {
        const antwort = { status: 403, data: { error: 'nein' } };
        const [r] = await runChecks([{ id: 'x', run: async () => expectStatus(antwort, 200, 'Laden') }]);
        assert.equal(r.status, 'fail');
        assert.equal(r.response, antwort);
        assert.match(r.detail, /erwartet Status 200, bekommen 403/);
    });

    test('expect wirft nur, wenn die Bedingung falsch ist', () => {
        assert.doesNotThrow(() => expect(true, 'x'));
        assert.throws(() => expect(false, 'Meldung'), CheckError);
    });

    test('Zusammenfassung und Bericht', () => {
        const checks = [
            { id: 'a', group: 'Eins', title: 'A' },
            { id: 'b', group: 'Zwei', title: 'B' }
        ];
        const results = [
            { id: 'a', status: 'pass', detail: 'gut' },
            { id: 'b', status: 'fail', detail: 'schlecht' }
        ];
        assert.deepEqual(summarize(results), { total: 2, pass: 1, fail: 1, skip: 0 });
        const text = reportText(checks, results, { mode: 'test', at: new Date(2026, 8, 27, 12, 0) });
        assert.match(text, /Test-Modus/);
        assert.match(text, /1\/2 bestanden, 1 fehlgeschlagen/);
        assert.match(text, /## Eins\n✅ A – gut/);
        assert.match(text, /## Zwei\n❌ B – schlecht/);
    });
});

describe('Die echten Prüfungen', () => {
    test('mindestens 45 Prüfungen, jede mit eindeutiger id', () => {
        assert.ok(CHECKS.length >= 45, `nur ${CHECKS.length}`);
        assert.equal(new Set(CHECKS.map(c => c.id)).size, CHECKS.length);
    });
    test('jede Prüfung hat Gruppe, Titel und run', () => {
        for (const c of CHECKS) {
            assert.ok(c.group && c.title, c.id);
            assert.equal(typeof c.run, 'function', c.id);
        }
    });
    test('alle Bereiche sind abgedeckt', () => {
        for (const g of [
            'Verbindung',
            'Objekte',
            'Code',
            'Daten & Suche',
            'Relationen & Joins',
            'Rechte',
            'SSF',
            'Tresor',
            'Sicherheit (als Fremder)'
        ])
            assert.ok(CHECK_GROUPS.includes(g), g);
    });
    test('jede Gruppe steht zusammen (keine verstreuten Prüfungen)', () => {
        const seen = [];
        for (const c of CHECKS) if (seen[seen.length - 1] !== c.group) seen.push(c.group);
        assert.equal(seen.length, new Set(seen).size);
    });
    test('"needs" verweist nur auf Werte, die eine FRÜHERE Prüfung setzen kann', () => {
        // Namen, die in ctx landen (aus den run-Funktionen gelesen)
        const provided = new Set();
        for (const c of CHECKS) {
            for (const need of c.needs || [])
                assert.ok(provided.has(need), `${c.id} braucht "${need}", das vorher niemand setzt`);
            for (const m of c.run.toString().matchAll(/ctx\.(\w+)\s*=(?!=)/g)) provided.add(m[1]);
            // Kinder werden in einer Schleife gesetzt: ctx[name] = …
            if (/ctx\[name\]\s*=/.test(c.run.toString())) ['funktion', 'daten', 'lager'].forEach(n => provided.add(n));
        }
    });
});
