// js/core/agent.js
// ---------------------------------------------------------------------
// AGENT ANLEGEN IN EINEM SCHRITT (Plan "Agent anlegen", 18.10.2026)
//
// Ein Agent ist ein eigenes Objekt (z.B. "agent-buchhaltung") mit black
// auf einen oder mehrere Werkzeugkästen und einem KI-Schlüssel. Früher
// waren das 4 Handgriffe an 3 Orten – jetzt macht es der Assistent auf
// der Seite "KI-Zugänge" in einem Rutsch.
//
// Wichtig: Der Assistent benutzt NUR die bestehenden Wege der API
// (keine neue Tür im Backend). Rechte, Deckel und Protokoll prüft also
// alles wie immer das Backend:
//   1. POST /api/objects                         Agent-Objekt anlegen
//   2. PUT  /api/objects/<kasten>/members/<agent>  black auf jeden Kasten
//   3. POST /api/tokens/object/<agent>           Schlüssel (nur echter Login)
// Geht Schritt 2 oder 3 schief, wird der halb angelegte Agent wieder
// gelöscht (Entscheidung D) – sein Name ist danach gesperrt.
//
// Entscheidungen (alle von Jaime am 18.10. bestätigt):
//   A Assistent auf der Seite KI-Zugänge
//   B nur GANZE Kästen: black auf ein Werkzeug gilt sowieso für die ganze
//     Familie, einzelne Werkzeuge abwählen wäre eine Täuschung
//   C Laufzeit-Vorschlag 30 Tage
//   D Aufräumen bei einem Fehler (löschen)
//   E Verbindungstext für Claude Code (Claude-App/claude.ai braucht OAuth)
//
// Alles hier ist ohne Bildschirm und wird automatisch getestet
// (tests/agent.test.mjs). Die Seite selbst steht in pages/ai.js.
// ---------------------------------------------------------------------

export const AGENT_PREFIX = 'agent-';
export const DEFAULT_PRESET = '30d'; // Entscheidung C
export const MAX_AGENT_NAME = 60;

// Erlaubt: Kleinbuchstaben, Ziffern, Bindestrich – passt so auch als
// Server-Name in Claude und als Adresse (<name>.at0mic.site)
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Name des Agenten prüfen.
 * @returns {{ name: string } | { error: string }}
 */
export const checkAgentName = raw => {
    const name = String(raw ?? '').trim();
    if (!name || name === AGENT_PREFIX)
        return { error: 'Bitte gib dem Agenten einen Namen, z.B. „agent-buchhaltung“.' };
    if (name.length > MAX_AGENT_NAME) return { error: `Der Name darf höchstens ${MAX_AGENT_NAME} Zeichen lang sein.` };
    if (!NAME_RE.test(name)) {
        return { error: 'Nur Kleinbuchstaben, Ziffern und einzelne Bindestriche (z.B. „agent-buchhaltung“).' };
    }
    return { name };
};

/**
 * Werkzeuge (aus GET /api/tools) nach Werkzeugkasten gruppieren.
 *   tools   = [{ uuid, name, beschreibung, werkzeugkasten, bereit }]
 *   objects = deine Objekte (aus GET /api/objects) – daraus kommt die UUID
 *             der Kasten-Domain, auf die der Agent black bekommt
 * Rückgabe (nach Name sortiert):
 *   [{ family, rootUuid, tools: [{ uuid, name, beschreibung, bereit }] }]
 * Kästen, deren Domain du nicht siehst, haben rootUuid null (nicht wählbar).
 */
export const groupToolboxes = (tools, objects) => {
    const byFamily = new Map();
    for (const t of Array.isArray(tools) ? tools : []) {
        const family = t?.werkzeugkasten;
        if (!family) continue;
        if (!byFamily.has(family)) {
            const root = (objects || []).find(o => o.domain === family);
            byFamily.set(family, { family, rootUuid: root ? root.uuid : null, tools: [] });
        }
        byFamily.get(family).tools.push({
            uuid: t.uuid,
            name: t.name,
            beschreibung: t.beschreibung,
            bereit: t.bereit === true
        });
    }
    const boxes = [...byFamily.values()];
    for (const b of boxes) b.tools.sort((x, y) => String(x.name).localeCompare(String(y.name)));
    return boxes.sort((x, y) => x.family.localeCompare(y.family));
};

/**
 * Vorschau: Was wird der Agent sehen? (nur aus den gewählten Kästen)
 * Rückgabe: { count, names, notReady, text }
 *   notReady = Werkzeuge ohne SSF (sieht er, kann sie aber noch nicht benutzen)
 */
export const previewAgent = selectedBoxes => {
    const tools = (selectedBoxes || []).flatMap(b => b.tools);
    const names = tools.map(t => t.name);
    const notReady = tools.filter(t => !t.bereit).map(t => t.name);
    let text;
    // Ohne Kasten geht auch (24.10.2026): Der Agent baut dann eigene Websites, benutzt aber
    // keine fremden Werkzeuge. Einen Kasten kann man später mit "Kasten dazu" geben.
    if (!tools.length)
        text =
            'Ohne Werkzeugkasten: Dieser Agent kann eigene Websites und Apps bauen, aber keine Werkzeuge benutzen. Einen Kasten kannst du später dazugeben.';
    else {
        text = `Dieser Agent sieht genau ${tools.length} ${tools.length === 1 ? 'Werkzeug' : 'Werkzeuge'}: ${names.join(', ')}. Sonst nichts.`;
    }
    return { count: tools.length, names, notReady, text };
};

// Name des Servers in Claude Code und der Windows-Variable mit dem Schlüssel
//   agent-buchhaltung -> "at0mic-agent-buchhaltung" / "AT0MIC_AGENT_BUCHHALTUNG_TOKEN"
export const mcpServerName = agentName => `at0mic-${agentName}`;
export const tokenEnvVar = agentName => `AT0MIC_${String(agentName).toUpperCase().replace(/-/g, '_')}_TOKEN`;

/**
 * Verbindungstext für Claude Code (Entscheidung E).
 *   mcpUrl = Adresse des MCP-Servers (Backend + "/mcp")
 * Rückgabe: { envCommand, mcpJson, cliCommand }
 *   envCommand  PowerShell: Schlüssel als Windows-Variable speichern (enthält den Schlüssel!)
 *   mcpJson     Eintrag für .mcp.json – OHNE Schlüssel, er kommt aus der Variable
 *   cliCommand  Alternative mit der claude-Kommandozeile (enthält den Schlüssel!)
 */
export const connectText = ({ agentName, mcpUrl, token }) => {
    const server = mcpServerName(agentName);
    const env = tokenEnvVar(agentName);
    const mcpJson = JSON.stringify(
        {
            mcpServers: {
                [server]: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer \${${env}}` } }
            }
        },
        null,
        2
    );
    return {
        envCommand: `[Environment]::SetEnvironmentVariable("${env}", "${token}", "User")`,
        mcpJson,
        cliCommand: `claude mcp add --transport http ${server} ${mcpUrl} --header "Authorization: Bearer ${token}"`
    };
};

/**
 * DER ABLAUF: Agent anlegen, black auf die Kästen, Schlüssel erzeugen.
 *   api     = der API-Client (core/api.js) – in Tests eine Attrappe
 *   name    = geprüfter Name (checkAgentName)
 *   boxes   = gewählte Kästen aus groupToolboxes (mit rootUuid) – darf leer sein (Agent ohne Kasten)
 *   hours   = Laufzeit des Schlüssels
 *   onStep  = optional, meldet den Fortschritt als Text
 * Rückgabe:
 *   { ok: true, agentUuid, token: { token, expiresAt, … } }
 *   { ok: false, step, error, cleanedUp }   cleanedUp = halb angelegter Agent wieder gelöscht?
 */
export const createAgent = async ({ api, name, boxes, hours, onStep = () => {} }) => {
    boxes = boxes || []; // keine Kästen = ein Agent ohne Werkzeuge (seit 24.10.2026 erlaubt)
    if (boxes.some(b => !b.rootUuid)) {
        return { ok: false, step: 'pruefen', error: 'Ein gewählter Kasten ist nicht erreichbar.', cleanedUp: false };
    }

    // 1. Agent-Objekt anlegen – scheitert das, gibt es nichts aufzuräumen
    onStep(`Lege „${name}“ an …`);
    const created = await api.post('/api/objects', { domain: name });
    const agentUuid = created.ok ? created.data?.data?.uuid : null;
    if (!agentUuid) {
        return { ok: false, step: 'anlegen', error: created.error || 'Agent nicht angelegt.', cleanedUp: false };
    }

    // Ab hier gilt: Fehler -> den halb angelegten Agenten wieder löschen (Entscheidung D)
    const fail = async (step, error) => {
        onStep('Räume den halb angelegten Agenten wieder weg …');
        const removed = await api.del(`/api/objects/${encodeURIComponent(agentUuid)}`);
        return { ok: false, step, error: error || 'Unbekannter Fehler.', cleanedUp: removed.ok === true, agentUuid };
    };

    // 2. black auf jeden gewählten Kasten (ganze Familie, Entscheidung B)
    for (const box of boxes) {
        onStep(`Gebe black auf „${box.family}“ …`);
        const g = await api.put(
            `/api/objects/${encodeURIComponent(box.rootUuid)}/members/${encodeURIComponent(agentUuid)}`,
            { roleType: 'black' }
        );
        if (!g.ok) return fail('rechte', `Kasten „${box.family}“: ${g.error}`);
    }

    // 3. Schlüssel erzeugen (nur echter Login – prüft das Backend)
    onStep('Erzeuge den Schlüssel …');
    const t = await api.post(
        `/api/tokens/object/${encodeURIComponent(agentUuid)}`,
        { name: `Agent ${name}`, expiresInHours: hours },
        { sensitive: true } // Schlüssel im Anfragen-Protokoll nur als ***
    );
    if (!t.ok || !t.data?.data?.token) return fail('schluessel', t.error || 'Kein Schlüssel erhalten.');

    return { ok: true, agentUuid, token: t.data.data };
};

// =====================================================================
// AGENTEN IM GRIFF (Plan "Agenten im Griff", 18.10.2026)
// Hilfsfunktionen für die Seite "Agenten" (pages/agents.js). Die Daten
// kommen aus GET /api/agents (nur lesen); geändert wird über die
// bestehenden Routen (Rechte vergeben/entziehen, Schlüssel).
// =====================================================================

// Zeitraum der Statistik (Entscheidung D, Vorschlag 30 Tage)
export const STAT_PERIODS = [
    { days: 7, label: '7 Tage' },
    { days: 30, label: '30 Tage' },
    { days: 180, label: '180 Tage' }
];
export const DEFAULT_PERIOD = 30;

// So bald vor dem Ablauf warnt die Seite ("bald neuer Schlüssel nötig")
export const EXPIRY_WARN_DAYS = 7;

// Fehler nach Art (Entscheidung E): HTTP-Status -> Klartext
export const ERROR_KINDS = {
    400: 'falsche Eingabe',
    401: 'Schlüssel ungültig',
    403: 'kein Recht',
    404: 'nicht gefunden',
    409: 'Werkzeug nicht bereit',
    429: 'zu viele Anfragen',
    500: 'Werkzeug abgestürzt'
};
export const errorKindLabel = status => ERROR_KINDS[status] || `Fehler ${status}`;

/**
 * Fehler eines Werkzeugs als kurzer Text, häufigste zuerst:
 *   { '400': 2, '500': 1 } -> "2× falsche Eingabe · 1× Werkzeug abgestürzt"
 */
export const errorText = byStatus => {
    const entries = Object.entries(byStatus || {}).filter(([, n]) => n > 0);
    if (!entries.length) return '';
    return entries
        .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
        .map(([status, n]) => `${n}× ${errorKindLabel(Number(status))}`)
        .join(' · ');
};

/**
 * Name eines Werkzeugs in der Statistik. Fremde und gelöschte Werkzeuge
 * schickt das Backend ohne Name (Entscheidung C) – hier ein Ersatztext.
 */
export const toolLabel = tool => {
    if (!tool) return '?';
    if (tool.visible) return tool.name || 'Werkzeug ohne Namen';
    return tool.exists ? 'fremde Werkzeuge (kein Zugriff für dich)' : 'gelöschte Werkzeuge';
};

/**
 * Wie steht es um die Schlüssel? (für die Ampel auf der Karte)
 *   tokens = agent.tokens aus GET /api/agents
 * Rückgabe: { tone: 'ok' | 'warn' | 'error', text }
 *   error = kein gültiger Schlüssel (der Agent kann nicht arbeiten)
 *   warn  = der nächste läuft in weniger als EXPIRY_WARN_DAYS Tagen ab
 */
export const tokenHealth = (tokens, now = Date.now()) => {
    const active = tokens?.active || 0;
    if (!active) return { tone: 'error', text: 'Kein gültiger Schlüssel – der Agent kann nicht arbeiten.' };
    const left = new Date(tokens.nextExpiry).getTime() - now;
    // Aufrunden: 2 Tage und 23 Stunden = "in 3 Tagen" (so liest man es auf der Uhr)
    const days = Math.ceil(left / (24 * 3600 * 1000));
    const label = `${active} ${active === 1 ? 'gültiger Schlüssel' : 'gültige Schlüssel'}`;
    if (left < EXPIRY_WARN_DAYS * 24 * 3600 * 1000) {
        const when = days <= 1 ? 'in weniger als einem Tag' : `in ${days} Tagen`;
        return { tone: 'warn', text: `${label} – der nächste läuft ${when} ab.` };
    }
    return { tone: 'ok', text: label };
};

/**
 * Welche Kästen kann ich diesem Agenten noch dazugeben?
 *   boxes = Kästen aus groupToolboxes, ergänzt um canGrant (blue)
 *   agent = Eintrag aus GET /api/agents (rights = Familien, auf die er schon Rechte hat)
 * Nur Kästen mit blue, die er noch nicht hat.
 */
export const addableBoxes = (boxes, agent) => {
    const has = new Set((agent?.rights || []).map(r => r.domain));
    return (boxes || []).filter(b => b.canGrant && b.rootUuid && !has.has(b.family));
};

/**
 * "Wer benutzt was?" – die Statistik aller Agenten pro Werkzeug umdrehen.
 * Nur Werkzeuge, die du selbst siehst (fremde/gelöschte haben keine UUID).
 * Rückgabe (am meisten benutzt zuerst):
 *   [{ toolUuid, name, uses, errors, lastAt, agents: [{ uuid, domain, uses, errors }] }]
 */
export const usageByTool = agents => {
    const byTool = new Map();
    for (const agent of agents || []) {
        for (const t of agent?.stats?.tools || []) {
            if (!t.visible || !t.toolUuid) continue;
            if (!byTool.has(t.toolUuid)) {
                byTool.set(t.toolUuid, {
                    toolUuid: t.toolUuid,
                    name: toolLabel(t),
                    uses: 0,
                    errors: 0,
                    lastAt: null,
                    agents: []
                });
            }
            const entry = byTool.get(t.toolUuid);
            entry.uses += t.uses;
            entry.errors += t.errors;
            if (!entry.lastAt || t.lastAt > entry.lastAt) entry.lastAt = t.lastAt;
            entry.agents.push({ uuid: agent.uuid, domain: agent.domain, uses: t.uses, errors: t.errors });
        }
    }
    const list = [...byTool.values()];
    for (const e of list) e.agents.sort((a, b) => b.uses - a.uses);
    return list.sort((a, b) => b.uses - a.uses);
};

/**
 * NOT-AUS: alle GÜLTIGEN Schlüssel eines Agenten widerrufen (Entscheidung F).
 *   api    = API-Client (in Tests eine Attrappe)
 *   tokens = agent.tokens.list aus GET /api/agents
 * Läuft weiter, auch wenn einer scheitert – und meldet genau, was geklappt hat.
 * Rückgabe: { revoked: n, failed: [{ name, error }] }
 */
export const revokeAllTokens = async ({ api, tokens }) => {
    const active = (tokens || []).filter(t => t.status === 'active');
    const failed = [];
    let revoked = 0;
    for (const t of active) {
        const r = await api.del(`/api/tokens/${encodeURIComponent(t.uuid)}`);
        if (r.ok) revoked += 1;
        else failed.push({ name: t.name, error: r.error || 'Unbekannter Fehler.' });
    }
    return { revoked, failed };
};

/**
 * Einen Kasten wegnehmen: ALLE Farben, die der Agent dort hat, entziehen
 * (meist nur black). Rückgabe: { ok, removed: ['black'], error? }
 */
export const removeBox = async ({ api, agentUuid, right }) => {
    const removed = [];
    for (const role of right.roles || []) {
        const r = await api.del(
            `/api/objects/${encodeURIComponent(right.rootUuid)}/members/${encodeURIComponent(agentUuid)}/${role}`
        );
        if (!r.ok) return { ok: false, removed, error: r.error || 'Unbekannter Fehler.' };
        removed.push(role);
    }
    return { ok: true, removed };
};

/** Einen Kasten dazugeben: black auf die Domain des Kastens (ganze Familie, Entscheidung B) */
export const addBox = async ({ api, agentUuid, box }) => {
    const r = await api.put(
        `/api/objects/${encodeURIComponent(box.rootUuid)}/members/${encodeURIComponent(agentUuid)}`,
        { roleType: 'black' }
    );
    return r.ok ? { ok: true } : { ok: false, error: r.error || 'Unbekannter Fehler.' };
};

// =====================================================================
// OAUTH-VERBINDUNGEN (Plan "OAuth für MCP", Etappe 4)
// Ein Agent kann statt (oder zusätzlich zu) einem Schlüssel über OAuth
// verbunden sein – z.B. "claude.ai darf als agent-kassier arbeiten".
// Die Daten kommen aus GET /api/agents (agent.connections).
// =====================================================================

// Status einer Verbindung für die Anzeige
export const CONNECTION_STATUS = {
    active: { label: 'verbunden', tone: 'ok' },
    expired: { label: 'abgelaufen', tone: 'neutral' },
    revoked: { label: 'getrennt', tone: 'error' }
};
export const connectionStatusInfo = status =>
    CONNECTION_STATUS[status] || { label: status || 'unbekannt', tone: 'neutral' };

// Warum wurde eine Verbindung beendet? (revoked_reason aus dem Backend)
export const REVOKED_REASONS = {
    getrennt: 'von Hand getrennt',
    widerrufen: 'von der Anwendung selbst abgemeldet',
    code_doppelt: 'zum Schutz getrennt: ein Anmelde-Code wurde zweimal benutzt',
    refresh_doppelt: 'zum Schutz getrennt: ein Refresh-Token wurde zweimal benutzt – vielleicht kopiert'
};
export const revokedReasonLabel = reason => REVOKED_REASONS[reason] || reason || '';

/** Nur die laufenden Verbindungen */
export const activeConnections = agent => (agent?.connections || []).filter(c => c.status === 'active');

/**
 * Ampel für den GANZEN Zugang eines Agenten: Schlüssel UND Verbindungen.
 *   rot  = weder gültiger Schlüssel noch laufende Verbindung
 *   sonst wie tokenHealth (gelb, wenn ein Schlüssel bald abläuft) – plus
 *   "verbunden über claude.ai"
 * Rückgabe: { tone, text }
 */
export const accessHealth = (agent, now = Date.now()) => {
    const hosts = [...new Set(activeConnections(agent).map(c => c.clientHost))];
    const via = hosts.length ? `verbunden über ${hosts.join(', ')}` : '';
    if (!agent?.tokens?.active) {
        if (!hosts.length) {
            return {
                tone: 'error',
                text: 'Kein gültiger Zugang – weder Schlüssel noch Verbindung. Der Agent kann nicht arbeiten.'
            };
        }
        return { tone: 'ok', text: via.charAt(0).toUpperCase() + via.slice(1) };
    }
    const keys = tokenHealth(agent.tokens, now);
    return via ? { tone: keys.tone, text: `${keys.text} · ${via}` } : keys;
};

/** Eine Verbindung trennen (DELETE /api/agents/connections/<uuid>) */
export const disconnect = async ({ api, uuid }) => {
    const r = await api.del(`/api/agents/connections/${encodeURIComponent(uuid)}`);
    return r.ok ? { ok: true } : { ok: false, error: r.error || 'Unbekannter Fehler.' };
};

/**
 * NOT-AUS für einen Agenten: alle gültigen Schlüssel widerrufen UND alle
 * laufenden Verbindungen trennen. Läuft weiter, auch wenn einzelnes scheitert.
 * Seine Rechte bleiben – mit einem neuen Schlüssel oder "Erlauben" geht es weiter.
 * Rückgabe: { revoked, disconnected, failed: [{ name, error }] }
 */
export const stopAgent = async ({ api, agent }) => {
    const keys = await revokeAllTokens({ api, tokens: agent?.tokens?.list });
    let disconnected = 0;
    const failed = [...keys.failed];
    for (const c of activeConnections(agent)) {
        const r = await disconnect({ api, uuid: c.uuid });
        if (r.ok) disconnected += 1;
        else failed.push({ name: `Verbindung ${c.clientHost}`, error: r.error });
    }
    return { revoked: keys.revoked, disconnected, failed };
};
