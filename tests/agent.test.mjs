// tests/agent.test.mjs
// ---------------------------------------------------------------------
// AGENT ANLEGEN IN EINEM SCHRITT (core/agent.js, Plan 18.10.2026)
//
// Geprüft werden die reinen Hilfsfunktionen (Name, Kästen, Vorschau,
// Verbindungstext) und der Ablauf mit einer API-Attrappe – vor allem,
// dass ein halb angelegter Agent bei einem Fehler wieder gelöscht wird
// (Entscheidung D) und der Schlüssel nie im Protokoll landet.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    AGENT_PREFIX,
    DEFAULT_PRESET,
    checkAgentName,
    groupToolboxes,
    previewAgent,
    mcpServerName,
    tokenEnvVar,
    connectText,
    createAgent
} from '../public/js/core/agent.js';
import { LIFETIME_PRESETS } from '../public/js/pages/ai.js';

describe('Name des Agenten', () => {
    test('gültige Namen', () => {
        assert.deepEqual(checkAgentName('agent-buchhaltung'), { name: 'agent-buchhaltung' });
        assert.deepEqual(checkAgentName('  agent-kassier2 '), { name: 'agent-kassier2' });
    });
    test('leer oder nur der Vorschlag "agent-"', () => {
        assert.ok(checkAgentName('').error);
        assert.ok(checkAgentName(AGENT_PREFIX).error);
    });
    test('ungültige Zeichen und Formen', () => {
        for (const bad of ['Agent-Gross', 'agent buch', 'agent/x', 'agent--x', '-agent', 'agent-', 'agent_x']) {
            assert.ok(checkAgentName(bad).error, bad);
        }
    });
    test('zu lang', () => {
        assert.ok(checkAgentName('a'.repeat(61)).error);
        assert.deepEqual(checkAgentName('a'.repeat(60)), { name: 'a'.repeat(60) });
    });
});

describe('Werkzeugkästen und Vorschau', () => {
    const tools = [
        { uuid: 't2', name: 'stand_abfragen', beschreibung: '…', werkzeugkasten: 'kasse', bereit: true },
        { uuid: 't1', name: 'spende_erfassen', beschreibung: '…', werkzeugkasten: 'kasse', bereit: true },
        { uuid: 't3', name: 'entwurf', beschreibung: '…', werkzeugkasten: 'kasse', bereit: false },
        { uuid: 't4', name: 'rechnung', beschreibung: '…', werkzeugkasten: 'buchhaltung', bereit: true },
        { uuid: 't5', name: 'fremd', beschreibung: '…', werkzeugkasten: 'unsichtbar', bereit: true }
    ];
    const objects = [
        { uuid: 'k-root', domain: 'kasse' },
        { uuid: 'b-root', domain: 'buchhaltung' },
        { uuid: 't1', domain: null, domain_ref: 'kasse' }
    ];

    test('gruppiert nach Kasten, sortiert, mit der UUID der Kasten-Domain', () => {
        const boxes = groupToolboxes(tools, objects);
        assert.deepEqual(
            boxes.map(b => [b.family, b.rootUuid, b.tools.map(t => t.name)]),
            [
                ['buchhaltung', 'b-root', ['rechnung']],
                ['kasse', 'k-root', ['entwurf', 'spende_erfassen', 'stand_abfragen']],
                ['unsichtbar', null, ['fremd']]
            ]
        );
    });
    test('kaputte Eingaben ergeben eine leere Liste', () => {
        assert.deepEqual(groupToolboxes(null, objects), []);
        assert.deepEqual(groupToolboxes([{ name: 'ohne kasten' }], objects), []);
    });
    test('Vorschau: genau die Werkzeuge der gewählten Kästen, ohne SSF markiert', () => {
        const [buch, kasse] = groupToolboxes(tools, objects);
        const p = previewAgent([kasse, buch]);
        assert.equal(p.count, 4);
        assert.deepEqual(p.notReady, ['entwurf']);
        assert.match(p.text, /genau 4 Werkzeuge: entwurf, spende_erfassen, stand_abfragen, rechnung\. Sonst nichts\./);
        assert.match(previewAgent([buch]).text, /genau 1 Werkzeug:/);
        assert.equal(previewAgent([]).count, 0);
        assert.match(previewAgent([]).text, /Ohne Werkzeugkasten/);
    });
    test('Laufzeit-Vorschlag ist 30 Tage (Entscheidung C)', () => {
        assert.equal(LIFETIME_PRESETS.find(p => p.id === DEFAULT_PRESET).hours, 30 * 24);
    });
});

describe('Verbindungstext für Claude Code', () => {
    const c = connectText({ agentName: 'agent-buchhaltung', mcpUrl: 'https://api.at0mic.ch/mcp', token: 'at0_GEHEIM' });
    test('Server- und Variablen-Name', () => {
        assert.equal(mcpServerName('agent-buchhaltung'), 'vindelis-agent-buchhaltung');
        assert.equal(tokenEnvVar('agent-buchhaltung'), 'VINDELIS_AGENT_BUCHHALTUNG_TOKEN');
    });
    test('.mcp.json enthält den Schlüssel NICHT, nur die Variable', () => {
        assert.ok(!c.mcpJson.includes('at0_GEHEIM'));
        const json = JSON.parse(c.mcpJson);
        const server = json.mcpServers['vindelis-agent-buchhaltung'];
        assert.equal(server.url, 'https://api.at0mic.ch/mcp');
        assert.equal(server.headers.Authorization, 'Bearer ${VINDELIS_AGENT_BUCHHALTUNG_TOKEN}');
    });
    test('PowerShell-Befehl und Kommandozeile', () => {
        assert.equal(
            c.envCommand,
            '[Environment]::SetEnvironmentVariable("VINDELIS_AGENT_BUCHHALTUNG_TOKEN", "at0_GEHEIM", "User")'
        );
        assert.match(
            c.cliCommand,
            /^claude mcp add --transport http vindelis-agent-buchhaltung https:\/\/api\.at0mic\.ch\/mcp /
        );
        assert.match(c.cliCommand, /"Authorization: Bearer at0_GEHEIM"$/);
    });
});

// ---------------------------------------------------------------------
// Der Ablauf mit einer API-Attrappe: merkt sich jeden Aufruf und
// antwortet nach Plan. fails = { 'PUT …': 'Fehlertext' }
// ---------------------------------------------------------------------
const fakeApi = ({ fails = {}, deleteFails = false } = {}) => {
    const calls = [];
    const answer = (method, path, body, opts) => {
        calls.push({ method, path, body, opts });
        const key = `${method} ${path}`;
        const failure = Object.entries(fails).find(([k]) => key.startsWith(k));
        if (failure) return { ok: false, status: 403, error: failure[1] };
        if (method === 'POST' && path === '/api/objects')
            return { ok: true, status: 201, data: { data: { uuid: 'agent-uuid' } } };
        if (method === 'POST' && path.startsWith('/api/tokens/')) {
            return { ok: true, status: 201, data: { data: { token: 'at0_NEU', expiresAt: '2026-11-17T00:00:00Z' } } };
        }
        if (method === 'DELETE') return deleteFails ? { ok: false, status: 409, error: 'geht nicht' } : { ok: true };
        return { ok: true, status: 200, data: { data: { changed: true } } };
    };
    return {
        calls,
        post: async (p, b, o) => answer('POST', p, b, o),
        put: async (p, b, o) => answer('PUT', p, b, o),
        del: async (p, o) => answer('DELETE', p, undefined, o)
    };
};
const boxes = [
    { family: 'kasse', rootUuid: 'k-root', tools: [] },
    { family: 'buchhaltung', rootUuid: 'b-root', tools: [] }
];

describe('Ablauf: Agent anlegen', () => {
    test('alles klappt: anlegen → black auf jeden Kasten → Schlüssel', async () => {
        const api = fakeApi();
        const steps = [];
        const r = await createAgent({ api, name: 'agent-x', boxes, hours: 720, onStep: s => steps.push(s) });
        assert.equal(r.ok, true);
        assert.equal(r.token.token, 'at0_NEU');
        assert.deepEqual(
            api.calls.map(c => `${c.method} ${c.path}`),
            [
                'POST /api/objects',
                'PUT /api/objects/k-root/members/agent-uuid',
                'PUT /api/objects/b-root/members/agent-uuid',
                'POST /api/tokens/object/agent-uuid'
            ]
        );
        assert.deepEqual(api.calls[0].body, { domain: 'agent-x' });
        assert.deepEqual(api.calls[1].body, { roleType: 'black' }, 'nur black – nie mehr');
        assert.deepEqual(api.calls[3].body, { name: 'Agent agent-x', expiresInHours: 720 });
        assert.equal(api.calls[3].opts?.sensitive, true, 'Schlüssel nie im Anfragen-Protokoll');
        assert.ok(steps.length >= 4);
    });

    test('Anlegen scheitert (z.B. Name vergeben): nichts aufzuräumen', async () => {
        const api = fakeApi({ fails: { 'POST /api/objects': 'Domain existiert schon' } });
        const r = await createAgent({ api, name: 'agent-x', boxes, hours: 1 });
        assert.equal(r.ok, false);
        assert.equal(r.step, 'anlegen');
        assert.equal(r.cleanedUp, false);
        assert.equal(api.calls.length, 1, 'kein weiterer Aufruf');
    });

    test('Recht auf den 2. Kasten scheitert: Agent wird wieder gelöscht, kein Schlüssel', async () => {
        const api = fakeApi({ fails: { 'PUT /api/objects/b-root': 'kein blue' } });
        const r = await createAgent({ api, name: 'agent-x', boxes, hours: 1 });
        assert.equal(r.ok, false);
        assert.equal(r.step, 'rechte');
        assert.match(r.error, /buchhaltung.*kein blue/);
        assert.equal(r.cleanedUp, true);
        const last = api.calls.at(-1);
        assert.equal(`${last.method} ${last.path}`, 'DELETE /api/objects/agent-uuid');
        assert.ok(!api.calls.some(c => c.path.startsWith('/api/tokens/')), 'kein Schlüssel erzeugt');
    });

    test('Schlüssel scheitert (z.B. kein echter Login): Agent wird wieder gelöscht', async () => {
        const api = fakeApi({ fails: { 'POST /api/tokens/': 'Nur eingeloggte Benutzer' } });
        const r = await createAgent({ api, name: 'agent-x', boxes, hours: 1 });
        assert.equal(r.ok, false);
        assert.equal(r.step, 'schluessel');
        assert.equal(r.cleanedUp, true);
    });

    test('Löschen beim Aufräumen scheitert: ehrlich melden (cleanedUp false, mit UUID)', async () => {
        const api = fakeApi({ fails: { 'POST /api/tokens/': 'x' }, deleteFails: true });
        const r = await createAgent({ api, name: 'agent-x', boxes, hours: 1 });
        assert.equal(r.cleanedUp, false);
        assert.equal(r.agentUuid, 'agent-uuid');
    });

    // 24.10.2026: Werkzeugkästen sind freiwillig – neue Leute wissen oft noch nicht, wie man einen baut
    test('ohne Kasten: Agent + Schlüssel, keine Rechte-Schritte', async () => {
        const api = fakeApi();
        const r = await createAgent({ api, name: 'agent-x', boxes: [], hours: 1 });
        assert.equal(r.ok, true);
        assert.deepEqual(
            api.calls.map(c => `${c.method} ${c.path}`),
            ['POST /api/objects', 'POST /api/tokens/object/agent-uuid']
        );
    });

    test('mit unerreichbarem Kasten: gar nichts passiert', async () => {
        const api = fakeApi();
        const r = await createAgent({
            api,
            name: 'agent-x',
            boxes: [{ family: 'x', rootUuid: null, tools: [] }],
            hours: 1
        });
        assert.equal(r.step, 'pruefen');
        assert.equal(api.calls.length, 0);
    });
});
