// tests/jobs.test.mjs
// ---------------------------------------------------------------------
// Tests für die Helfer des Reiters "Aufträge" (public/js/core/jobs.js,
// Plan "SSF-Ausbau", Etappe C3).
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    jobStatusText,
    canCancel,
    SCHEDULE_PRESETS,
    describeCron,
    parseJsonInput,
    jobSummary
} from '../public/js/core/jobs.js';

describe('Aufträge: Status', () => {
    test('alle fünf Status haben einen deutschen Text und eine Farbe', () => {
        assert.deepEqual(jobStatusText('queued'), { tone: 'neutral', text: 'wartet' });
        assert.deepEqual(jobStatusText('running'), { tone: 'accent', text: 'läuft' });
        assert.deepEqual(jobStatusText('done'), { tone: 'ok', text: 'fertig' });
        assert.deepEqual(jobStatusText('failed'), { tone: 'error', text: 'gescheitert' });
        assert.deepEqual(jobStatusText('cancelled'), { tone: 'warn', text: 'abgebrochen' });
        assert.equal(jobStatusText('neu').text, 'neu');
    });

    test('abbrechen nur, solange er offen ist', () => {
        assert.equal(canCancel('queued'), true);
        assert.equal(canCancel('running'), true);
        for (const s of ['done', 'failed', 'cancelled']) assert.equal(canCancel(s), false);
    });

    test('Zusammenfassung', () => {
        const jobs = ['queued', 'running', 'done', 'done', 'failed', 'cancelled'].map(status => ({ status }));
        assert.deepEqual(jobSummary(jobs), { offen: 2, fertig: 2, gescheitert: 1 });
        assert.deepEqual(jobSummary(null), { offen: 0, fertig: 0, gescheitert: 0 });
    });
});

describe('Aufträge: Zeitplan und Eingabe', () => {
    test('Vorlagen: gültige Cron-Ausdrücke mit 5 Teilen, Text wird erkannt', () => {
        for (const p of SCHEDULE_PRESETS) assert.equal(p.cron.split(' ').length, 5, p.label);
        assert.equal(describeCron('0 3 * * *'), 'Jede Nacht um 3 Uhr');
        assert.equal(describeCron(' */15 * * * * '), 'Alle 15 Minuten');
        assert.equal(describeCron('5 4 * * *'), null);
    });

    test('Eingabe als JSON: leer = {}, nur Objekte, Fehler verständlich', () => {
        assert.deepEqual(parseJsonInput(''), { ok: true, value: {} });
        assert.deepEqual(parseJsonInput(' { "seite": 2 } '), { ok: true, value: { seite: 2 } });
        assert.match(parseJsonInput('[1,2]').error, /JSON-Objekt/);
        assert.match(parseJsonInput('{kaputt').error, /kein gültiges JSON/);
        assert.match(parseJsonInput('42').error, /JSON-Objekt/);
    });
});

describe('Aufträge: wann kommt der nächste Durchlauf?', () => {
    test('Zukunft als "in …", fällig als "jetzt"', async () => {
        const { untilText } = await import('../public/js/core/jobs.js');
        const now = Date.parse('2026-10-21T12:00:00Z');
        const at = sec => new Date(now + sec * 1000).toISOString();
        assert.equal(untilText(at(-30), now), 'jetzt');
        assert.equal(untilText(at(3), now), 'jetzt');
        assert.equal(untilText(at(45), now), 'in 45 Sek.');
        assert.equal(untilText(at(60), now), 'in 1 Min.');
        assert.equal(untilText(at(2 * 3600), now), 'in 2 Std.');
        assert.equal(untilText(at(3 * 86400), now), 'in 3 Tagen');
        assert.equal(untilText('kaputt', now), '–');
    });
});
