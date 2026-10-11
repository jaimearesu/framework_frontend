// tests/ai.test.mjs
// ---------------------------------------------------------------------
// KI-ZUGÄNGE (Plan "MCP", Etappe 3): die reinen Hilfsfunktionen der
// Seite "KI-Zugänge", das Schwärzen des Schlüssels im Anfragen-Protokoll
// und die neuen Systemcheck-Prüfungen.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    lifetimeHours,
    LIFETIME_PRESETS,
    MAX_HOURS,
    tokenStatusInfo,
    actorKindInfo,
    auditActionLabel,
    detailText
} from '../public/js/pages/ai.js';
import { maskResponse } from '../public/js/core/api.js';
import { findRoute } from '../public/js/core/routes.js';
import { CHECKS } from '../public/js/check/checks.js';

describe('Laufzeit eines Schlüssels', () => {
    test('Vorgaben liegen alle zwischen 1 Stunde und 1 Jahr', () => {
        for (const p of LIFETIME_PRESETS.filter(p => p.hours !== null)) {
            assert.ok(p.hours >= 1 && p.hours <= MAX_HOURS, p.label);
        }
        assert.equal(MAX_HOURS, 8760);
    });
    test('eigene Dauer in Stunden oder Tagen', () => {
        assert.deepEqual(lifetimeHours('12', 'hours'), { hours: 12 });
        assert.deepEqual(lifetimeHours(3, 'days'), { hours: 72 });
        assert.deepEqual(lifetimeHours('365', 'days'), { hours: 8760 });
    });
    test('ungültig: 0, negativ, Kommazahl, Text, mehr als 1 Jahr', () => {
        for (const [amount, unit] of [
            ['0', 'hours'],
            ['-2', 'days'],
            ['1.5', 'hours'],
            ['abc', 'hours'],
            ['', 'hours'],
            ['366', 'days'],
            ['8761', 'hours']
        ]) {
            assert.ok(lifetimeHours(amount, unit).error, `${amount} ${unit}`);
        }
    });
});

describe('Anzeige', () => {
    test('Status eines Schlüssels', () => {
        assert.deepEqual(tokenStatusInfo('active'), { label: 'gültig', tone: 'ok' });
        assert.equal(tokenStatusInfo('revoked').tone, 'error');
        assert.equal(tokenStatusInfo('komisch').label, 'komisch');
    });
    test('wer hat gehandelt', () => {
        assert.equal(actorKindInfo('ai').label, 'KI');
        assert.equal(actorKindInfo('guest').label, 'Gast');
    });
    test('Aktionen in Klartext, unbekannte bleiben stehen', () => {
        assert.equal(auditActionLabel('rolle.vergeben'), 'Recht vergeben');
        assert.equal(auditActionLabel('objekt.sichtbarkeit'), 'Sichtbarkeit geändert');
        assert.equal(auditActionLabel('neu.etwas'), 'neu.etwas');
    });
    test('Details: kurz, UUIDs gekürzt, Listen verbunden', () => {
        assert.equal(
            detailText({ roleType: 'black', triplet: '3f5c3cde-6697-4efb-8461-cd03469027ca' }),
            'roleType: black · triplet: 3f5c3cde…'
        );
        assert.equal(detailText({ types: ['html', 'css'], leer: null }), 'types: html, css');
        assert.equal(detailText(null), '');
    });
});

describe('Schlüssel im Anfragen-Protokoll', () => {
    test('maskResponse schwärzt data.token (und token), sonst nichts', () => {
        const original = { message: 'ok', data: { token: 'at0_geheim', name: 'Claude', uuid: 'u1' } };
        const masked = maskResponse(original);
        assert.equal(masked.data.token, '***');
        assert.equal(masked.data.name, 'Claude');
        assert.equal(original.data.token, 'at0_geheim', 'das Original bleibt unverändert (für den Kasten)');
        assert.equal(maskResponse({ token: 'x' }).token, '***');
        assert.deepEqual(maskResponse([1, 2]), [1, 2]);
        assert.equal(maskResponse(null), null);
    });
});

describe('Seite und Systemcheck', () => {
    test('die Seite "KI-Zugänge" ist im Menü unter Sicherheit', () => {
        const route = findRoute('ki');
        assert.ok(route);
        assert.equal(route.group, 'Sicherheit');
    });
    test('Gruppe "KI-Zugang" mit 5 Prüfungen – vor "Löschen & Aufräumen"', () => {
        const ai = CHECKS.filter(c => c.group === 'KI-Zugang');
        assert.equal(ai.length, 5);
        const lastAi = CHECKS.lastIndexOf(ai[ai.length - 1]);
        const firstDelete = CHECKS.findIndex(c => c.group === 'Löschen & Aufräumen');
        assert.ok(lastAi < firstDelete);
    });
});
