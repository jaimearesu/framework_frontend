// tests/publishRequests.test.mjs
// ---------------------------------------------------------------------
// "WARTET AUF DICH" (Backend: Plan "MCP Etappe 5d")
// Der wichtigste Satz der Karte: WAS genau passiert, wenn man freigibt.
// Er muss stimmen – die Begründung der KI steht nur klein darunter.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { describeRequest } from '../public/js/pages/publishRequests.js';
import { auditActionLabel } from '../public/js/pages/ai.js';
import { CHECKS } from '../public/js/check/checks.js';

const base = { objectName: 'freigabe', objectPath: ['0'], visibility: 'public', includeChildren: false, childCount: 0 };

describe('Was passiert beim Freigeben?', () => {
    test('nur das Objekt', () => {
        assert.equal(describeRequest(base), 'freigabe wird öffentlich (alle, auch anonym)');
    });

    test('mit Kindern: Anzahl wird genannt (Einzahl / Mehrzahl)', () => {
        assert.equal(
            describeRequest({ ...base, includeChildren: true, childCount: 3 }),
            'freigabe und 3 Unter-Objekte werden öffentlich (alle, auch anonym)'
        );
        assert.equal(
            describeRequest({ ...base, includeChildren: true, childCount: 1 }),
            'freigabe und 1 Unter-Objekt werden öffentlich (alle, auch anonym)'
        );
    });

    test('"mit Kindern", aber es gibt keine: kein irreführendes "und 0"', () => {
        assert.equal(
            describeRequest({ ...base, includeChildren: true }),
            'freigabe wird öffentlich (alle, auch anonym)'
        );
    });

    test('nur Mitglieder, und ein Unter-Objekt mit Pfad', () => {
        assert.equal(
            describeRequest({ ...base, visibility: 'members', objectPath: ['0', '0,1'] }),
            'freigabe/0,1 wird sichtbar für eingeloggte Mitglieder'
        );
    });
});

describe('Protokoll und Systemcheck', () => {
    test('die neuen Aktionen haben lesbare Namen', () => {
        assert.equal(auditActionLabel('freigabe.anfragen'), 'um Veröffentlichung gebeten');
        assert.equal(auditActionLabel('freigabe.erteilen'), 'Veröffentlichung freigegeben');
        assert.equal(auditActionLabel('werkzeug.benutzen'), 'Werkzeug benutzt');
    });

    test('Systemcheck-Gruppe "Freigabe-Anfragen" vor "Löschen & Aufräumen"', () => {
        const group = CHECKS.filter(c => c.group === 'Freigabe-Anfragen');
        assert.equal(group.length, 3);
        const firstDelete = CHECKS.findIndex(c => c.group === 'Löschen & Aufräumen');
        assert.ok(CHECKS.lastIndexOf(group[group.length - 1]) < firstDelete);
    });
});
