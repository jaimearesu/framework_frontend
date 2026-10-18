// tests/agentsOverview.test.mjs
// ---------------------------------------------------------------------
// AGENTEN IM GRIFF (core/agent.js, Plan 18.10.2026)
//
// Geprüft werden die Hilfsfunktionen der Seite "Agenten": Fehler-Texte,
// Werkzeug-Namen (fremde ohne Name), Schlüssel-Ampel, welche Kästen man
// dazugeben kann, "Wer benutzt was?" und die Knöpfe (Not-Aus, Kasten
// dazu/weg) mit einer API-Attrappe.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    STAT_PERIODS,
    DEFAULT_PERIOD,
    errorKindLabel,
    errorText,
    toolLabel,
    tokenHealth,
    addableBoxes,
    usageByTool,
    revokeAllTokens,
    removeBox,
    addBox,
    accessHealth,
    activeConnections,
    connectionStatusInfo,
    revokedReasonLabel,
    disconnect,
    stopAgent
} from '../public/js/core/agent.js';

const DAY = 24 * 3600 * 1000;

// API-Attrappe: merkt sich jede Anfrage, antwortet nach Regel
const fakeApi = (answer = () => ({ ok: true })) => {
    const calls = [];
    const record = method => async (path, body) => {
        calls.push({ method, path, body });
        return answer(method, path, body);
    };
    return { calls, get: record('GET'), post: record('POST'), put: record('PUT'), del: record('DELETE') };
};

describe('Zeitraum und Fehler-Arten (Entscheidungen D + E)', () => {
    test('Zeitraum 7/30/180, Standard 30', () => {
        assert.deepEqual(
            STAT_PERIODS.map(p => p.days),
            [7, 30, 180]
        );
        assert.equal(DEFAULT_PERIOD, 30);
    });
    test('bekannte und unbekannte Status', () => {
        assert.equal(errorKindLabel(400), 'falsche Eingabe');
        assert.equal(errorKindLabel(500), 'Werkzeug abgestürzt');
        assert.equal(errorKindLabel(418), 'Fehler 418');
    });
    test('errorText: häufigste zuerst, leer ohne Fehler', () => {
        assert.equal(errorText({ 500: 1, 400: 2 }), '2× falsche Eingabe · 1× Werkzeug abgestürzt');
        assert.equal(errorText({}), '');
        assert.equal(errorText(null), '');
    });
});

describe('Werkzeug-Namen (Entscheidung C)', () => {
    test('eigenes, fremdes, gelöschtes Werkzeug', () => {
        assert.equal(toolLabel({ visible: true, name: 'zaehlen' }), 'zaehlen');
        assert.equal(toolLabel({ visible: true, name: null }), 'Werkzeug ohne Namen');
        assert.match(toolLabel({ visible: false, exists: true }), /fremde/);
        assert.match(toolLabel({ visible: false, exists: false }), /gelöschte/);
    });
});

describe('Schlüssel-Ampel', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    test('kein gültiger Schlüssel = rot', () => {
        assert.equal(tokenHealth({ active: 0 }, now).tone, 'error');
    });
    test('läuft bald ab = gelb', () => {
        const h = tokenHealth({ active: 1, nextExpiry: new Date(now + 3 * DAY).toISOString() }, now);
        assert.equal(h.tone, 'warn');
        assert.match(h.text, /in 3 Tagen/);
        assert.match(
            tokenHealth({ active: 1, nextExpiry: new Date(now + 2 * 3600 * 1000).toISOString() }, now).text,
            /weniger als einem Tag/
        );
    });
    test('noch lange gültig = grün', () => {
        const h = tokenHealth({ active: 2, nextExpiry: new Date(now + 30 * DAY).toISOString() }, now);
        assert.deepEqual(h, { tone: 'ok', text: '2 gültige Schlüssel' });
    });
});

describe('Kasten dazu: welche Kästen sind wählbar?', () => {
    test('nur mit blue und noch nicht vorhanden', () => {
        const boxes = [
            { family: 'kasse', rootUuid: 'k', canGrant: true, tools: [] },
            { family: 'buch', rootUuid: 'b', canGrant: true, tools: [] },
            { family: 'fremd', rootUuid: 'f', canGrant: false, tools: [] },
            { family: 'unsichtbar', rootUuid: null, canGrant: true, tools: [] }
        ];
        const agent = { rights: [{ domain: 'kasse', roles: ['black'] }] };
        assert.deepEqual(
            addableBoxes(boxes, agent).map(b => b.family),
            ['buch']
        );
        assert.deepEqual(addableBoxes(null, agent), []);
    });
});

describe('Wer benutzt was?', () => {
    test('pro Werkzeug über alle Agenten, fremde Werkzeuge fehlen', () => {
        const agents = [
            {
                uuid: 'a1',
                domain: 'agent-a',
                stats: {
                    tools: [
                        {
                            toolUuid: 't1',
                            name: 'zaehlen',
                            visible: true,
                            uses: 3,
                            errors: 1,
                            lastAt: '2026-10-17T00:00:00.000Z'
                        },
                        {
                            toolUuid: null,
                            name: null,
                            visible: false,
                            exists: true,
                            uses: 9,
                            errors: 0,
                            lastAt: '2026-10-18T00:00:00.000Z'
                        }
                    ]
                }
            },
            {
                uuid: 'a2',
                domain: 'agent-b',
                stats: {
                    tools: [
                        {
                            toolUuid: 't1',
                            name: 'zaehlen',
                            visible: true,
                            uses: 5,
                            errors: 0,
                            lastAt: '2026-10-18T00:00:00.000Z'
                        }
                    ]
                }
            }
        ];
        const rows = usageByTool(agents);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].uses, 8);
        assert.equal(rows[0].errors, 1);
        assert.equal(rows[0].lastAt, '2026-10-18T00:00:00.000Z');
        assert.deepEqual(
            rows[0].agents.map(a => `${a.domain}:${a.uses}`),
            ['agent-b:5', 'agent-a:3']
        );
        assert.deepEqual(usageByTool(null), []);
    });
});

describe('Knöpfe (mit API-Attrappe)', () => {
    test('Not-Aus: nur gültige Schlüssel, läuft bei einem Fehler weiter', async () => {
        const api = fakeApi((m, path) => (path.endsWith('/t2') ? { ok: false, error: 'kaputt' } : { ok: true }));
        const r = await revokeAllTokens({
            api,
            tokens: [
                { uuid: 't1', name: 'A', status: 'active' },
                { uuid: 't2', name: 'B', status: 'active' },
                { uuid: 't3', name: 'C', status: 'revoked' },
                { uuid: 't4', name: 'D', status: 'active' }
            ]
        });
        assert.deepEqual(
            api.calls.map(c => `${c.method} ${c.path}`),
            ['DELETE /api/tokens/t1', 'DELETE /api/tokens/t2', 'DELETE /api/tokens/t4']
        );
        assert.equal(r.revoked, 2);
        assert.deepEqual(r.failed, [{ name: 'B', error: 'kaputt' }]);
    });

    test('Kasten wegnehmen: alle Farben, stoppt beim ersten Fehler', async () => {
        const api = fakeApi((m, path) =>
            path.endsWith('/red') ? { ok: false, error: 'Umlauf-Schutz' } : { ok: true }
        );
        const r = await removeBox({ api, agentUuid: 'ag', right: { rootUuid: 'k', roles: ['black', 'red', 'blue'] } });
        assert.equal(r.ok, false);
        assert.deepEqual(r.removed, ['black']);
        assert.equal(r.error, 'Umlauf-Schutz');
        assert.deepEqual(
            api.calls.map(c => c.path),
            ['/api/objects/k/members/ag/black', '/api/objects/k/members/ag/red']
        );
    });

    test('Kasten dazu: black auf die Domain des Kastens', async () => {
        const api = fakeApi();
        assert.deepEqual(await addBox({ api, agentUuid: 'ag', box: { rootUuid: 'k' } }), { ok: true });
        assert.deepEqual(api.calls, [
            { method: 'PUT', path: '/api/objects/k/members/ag', body: { roleType: 'black' } }
        ]);
    });
});

// ---------------------------------------------------------------------
// OAUTH-VERBINDUNGEN (Plan "OAuth für MCP", Etappe 4)
// ---------------------------------------------------------------------

describe('OAuth-Verbindungen', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const conn = (status, host = 'claude.ai', uuid = 'g1') => ({ uuid, status, clientHost: host });

    test('Ampel: nur Verbindung = grün, nichts = rot, beides = Schlüssel-Text + Verbindung', () => {
        assert.deepEqual(accessHealth({ tokens: { active: 0 }, connections: [conn('active')] }, now), {
            tone: 'ok',
            text: 'Verbunden über claude.ai'
        });
        assert.equal(accessHealth({ tokens: { active: 0 }, connections: [conn('revoked')] }, now).tone, 'error');
        assert.equal(accessHealth({ tokens: { active: 0 } }, now).tone, 'error');
        const both = accessHealth(
            {
                tokens: { active: 1, nextExpiry: new Date(now + 30 * DAY).toISOString() },
                connections: [conn('active'), conn('active', 'claude.ai', 'g2')]
            },
            now
        );
        assert.deepEqual(both, { tone: 'ok', text: '1 gültiger Schlüssel · verbunden über claude.ai' });
    });

    test('Texte für Status und Gründe', () => {
        assert.equal(connectionStatusInfo('active').label, 'verbunden');
        assert.equal(connectionStatusInfo('revoked').tone, 'error');
        assert.match(revokedReasonLabel('refresh_doppelt'), /zweimal/);
        assert.equal(revokedReasonLabel('neu'), 'neu');
        assert.equal(revokedReasonLabel(null), '');
        assert.deepEqual(
            activeConnections({ connections: [conn('active'), conn('expired')] }).map(c => c.status),
            ['active']
        );
    });

    test('Trennen: DELETE auf die Verbindung', async () => {
        const api = fakeApi();
        assert.deepEqual(await disconnect({ api, uuid: 'g1' }), { ok: true });
        assert.deepEqual(
            api.calls.map(c => `${c.method} ${c.path}`),
            ['DELETE /api/agents/connections/g1']
        );
    });

    test('Not-Aus: alle Schlüssel UND alle laufenden Verbindungen, läuft bei Fehlern weiter', async () => {
        const api = fakeApi((m, path) => (path.endsWith('/g2') ? { ok: false, error: 'weg' } : { ok: true }));
        const r = await stopAgent({
            api,
            agent: {
                tokens: {
                    list: [
                        { uuid: 't1', name: 'A', status: 'active' },
                        { uuid: 't2', name: 'B', status: 'revoked' }
                    ]
                },
                connections: [
                    conn('active', 'claude.ai', 'g1'),
                    conn('active', 'claude.com', 'g2'),
                    conn('revoked', 'x', 'g3')
                ]
            }
        });
        assert.deepEqual(
            api.calls.map(c => `${c.method} ${c.path}`),
            ['DELETE /api/tokens/t1', 'DELETE /api/agents/connections/g1', 'DELETE /api/agents/connections/g2']
        );
        assert.equal(r.revoked, 1);
        assert.equal(r.disconnected, 1);
        assert.deepEqual(r.failed, [{ name: 'Verbindung claude.com', error: 'weg' }]);
    });
});
