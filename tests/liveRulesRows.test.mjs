// tests/liveRulesRows.test.mjs
// ---------------------------------------------------------------------
// LIVE-REGELN LESBAR im Cockpit (Härtungs-Runde, 28.10.2026)
// liveRulesRows macht aus "live.kanaele" der DNA eine Zeile pro Kanal.
// ---------------------------------------------------------------------
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveRulesRows } from '../public/js/core/site.js';

test('ohne Regeln oder kaputte DNA: keine Zeilen', () => {
    assert.deepEqual(liveRulesRows(undefined), []);
    assert.deepEqual(liveRulesRows('{ kaputt'), []);
    assert.deepEqual(liveRulesRows({ identifier: 'x' }), []);
});

test('Regeln aus der DNA (Text): Standardwerte wie im Backend', () => {
    const dna = JSON.stringify({
        live: {
            kanaele: {
                cursor: { browser: true, felder: ['x', 'y'], proSekunde: 20 },
                'board-*': { browser: true, presence: true, ticket: true, wer: 'angemeldet' },
                news: {}
            }
        }
    });
    assert.deepEqual(liveRulesRows(dna), [
        {
            kanal: 'cursor',
            browser: 'ja, direkt (flüchtig)',
            wer: 'alle',
            takt: '20/s, max. 512 Bytes',
            felder: 'x, y',
            extras: '–'
        },
        {
            kanal: 'board-* (alle, die so beginnen)',
            browser: 'ja, direkt (flüchtig)',
            wer: 'nur Angemeldete',
            takt: '10/s, max. 512 Bytes',
            felder: 'alle',
            extras: 'Anwesenheit, nur mit Ticket'
        },
        {
            kanal: 'news',
            browser: 'nein, nur über die SSF',
            wer: 'alle',
            takt: '–',
            felder: 'alle',
            extras: '–'
        }
    ]);
});
