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
    if (!tools.length) text = 'Wähle mindestens einen Werkzeugkasten.';
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
 *   boxes   = gewählte Kästen aus groupToolboxes (mit rootUuid)
 *   hours   = Laufzeit des Schlüssels
 *   onStep  = optional, meldet den Fortschritt als Text
 * Rückgabe:
 *   { ok: true, agentUuid, token: { token, expiresAt, … } }
 *   { ok: false, step, error, cleanedUp }   cleanedUp = halb angelegter Agent wieder gelöscht?
 */
export const createAgent = async ({ api, name, boxes, hours, onStep = () => {} }) => {
    if (!boxes || !boxes.length)
        return { ok: false, step: 'pruefen', error: 'Kein Werkzeugkasten gewählt.', cleanedUp: false };
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
