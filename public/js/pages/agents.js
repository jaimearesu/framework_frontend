// js/pages/agents.js
// ---------------------------------------------------------------------
// AGENTEN IM GRIFF (Plan "Agenten im Griff", 18.10.2026)
//
// Eine Seite für alle Agenten auf einen Blick:
//   1. Pro Agent eine Karte: Schlüssel (mit Ampel), was er darf
//      (Werkzeugkästen + weitere Rechte), wann er zuletzt aktiv war und die
//      Werkzeug-Statistik (wie oft, welche Fehler).
//      Knöpfe: Kasten dazu/weg, neuer Schlüssel, alle Schlüssel widerrufen.
//   2. "Wer benutzt was?" – dieselbe Statistik pro Werkzeug.
//   3. Agent anlegen (der Assistent ist von "KI-Zugänge" hierher gezogen).
//
// Lesen: GET /api/agents?days=… (nur eingeloggte Menschen, nur deine Agenten).
// Ändern: nur über die BESTEHENDEN Routen – das Backend prüft alles wie immer:
//   PUT/DELETE /api/objects/<kasten>/members/<agent>…  Kasten dazu/weg (blue auf den Kasten)
//   POST       /api/tokens/object/<agent>              neuer Schlüssel (blue, echter Login)
//   DELETE     /api/tokens/<schlüssel>                 widerrufen
//
// Entscheidungen (alle von Jaime am 18.10. bestätigt): A eigene Seite,
// B Agent = Objekt mit einem Schlüssel von dir, C fremde Rechte nur als Zahl,
// D Zeitraum 7/30/180 Tage, E Fehler nach Art, F kein Löschen hier.
// Die Hilfsfunktionen stehen in core/agent.js (automatisch getestet).
//
// Adresse: /#/agenten
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { getSession } from '../core/session.js';
import {
    h,
    mount,
    card,
    callout,
    toast,
    busyButton,
    resultLine,
    spinner,
    field,
    emptyState,
    badge,
    codeBlock
} from '../core/ui.js';
import { pageHeader } from '../core/page.js';
import { formatDate, timeAgo } from '../core/format.js';
import { loadObjects, invalidateObjects } from '../core/objects.js';
import { apiBase } from '../core/config.js';
import {
    AGENT_PREFIX,
    DEFAULT_PRESET,
    MAX_AGENT_NAME,
    checkAgentName,
    groupToolboxes,
    previewAgent,
    connectText,
    createAgent,
    STAT_PERIODS,
    DEFAULT_PERIOD,
    errorText,
    toolLabel,
    addableBoxes,
    usageByTool,
    removeBox,
    addBox,
    // OAuth-Verbindungen (Plan "OAuth für MCP", Etappe 4)
    accessHealth,
    activeConnections,
    connectionStatusInfo,
    revokedReasonLabel,
    disconnect,
    stopAgent
} from '../core/agent.js';
import { LIFETIME_PRESETS } from './ai.js';

// Farben als kleine Abzeichen (black / red / blue)
const roleBadges = roles =>
    (roles || []).map(r => badge(r, r === 'blue' ? 'accent' : r === 'red' ? 'error' : 'neutral'));

// Kasten mit Schlüssel + Verbindungstext (nach "Agent anlegen" und "Neuer Schlüssel").
// Der Schlüssel wird genau EINMAL gezeigt – hier.
const tokenReveal = ({ title, agentName, tokenData, onClose }) => {
    const c = connectText({ agentName, mcpUrl: `${apiBase()}/mcp`, token: tokenData.token });
    return h(
        'div',
        { class: 'token-reveal' },
        h('strong', {}, title),
        h('code', { class: 'token-value' }, tokenData.token),
        h(
            'p',
            { class: 'muted small' },
            `Gültig bis ${formatDate(tokenData.expiresAt)}. So verbindest du ihn mit Claude Code:`
        ),
        codeBlock(c.envCommand, { label: '1. PowerShell: Schlüssel als Windows-Variable speichern' }),
        codeBlock(c.mcpJson, { label: '2. In die Datei .mcp.json deines Projekts (ohne Schlüssel)' }),
        h(
            'p',
            { class: 'muted small' },
            '3. Claude neu starten und eine neue Session öffnen. Mit der claude-Kommandozeile geht es auch in einem Schritt:'
        ),
        codeBlock(c.cliCommand, { label: 'Alternative: claude-Kommandozeile' }),
        h('button', { class: 'btn ghost', type: 'button', onclick: onClose }, 'Ich habe alles gesichert – ausblenden')
    );
};

/**
 * Deine Werkzeugkästen laden: alle Werkzeuge, die DU siehst, nach Kasten
 * gruppiert. canGrant = du hast blue auf den Kasten (nur dann darfst du einem
 * Agenten dort ein Recht geben). Das fragen wir die Rechte-Liste: GET …/members
 * antwortet nur mit blue mit 200.
 * Rückgabe: { ok: true, boxes } | { ok: false, result }
 */
const loadGrantableBoxes = async objects => {
    const r = await api.get('/api/tools');
    if (!r.ok) return { ok: false, result: r };
    const grouped = groupToolboxes(Array.isArray(r.data?.data) ? r.data.data : [], objects);
    const boxes = await Promise.all(
        grouped.map(async b => {
            if (!b.rootUuid) return { ...b, canGrant: false };
            const m = await api.get(`/api/objects/${b.rootUuid}/members`);
            return { ...b, canGrant: m.ok };
        })
    );
    return { ok: true, boxes };
};

export default {
    async render(root) {
        root.append(
            pageHeader({
                intro: 'Alle deine Agenten auf einen Blick: was sie dürfen, wann sie gearbeitet haben und welche Werkzeuge sie wie oft benutzen.'
            })
        );

        const isUser = getSession().identity?.kind === 'user';
        if (!isUser) {
            root.append(
                callout(
                    'info',
                    'Nur mit Login.',
                    ' Agenten verwalten können nur eingeloggte Benutzer – keine Gäste. Logge dich oben rechts ein.'
                )
            );
            return;
        }

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;

        let days = DEFAULT_PERIOD;
        let boxes = []; // deine Werkzeugkästen (für "Kasten dazu" und "Agent anlegen")
        const listBox = h('div', {}, spinner('Lade deine Agenten …'));
        const usageBox = h('div');

        // ============================================================ ZEITRAUM
        const periodSelect = h(
            'select',
            { class: 'input' },
            STAT_PERIODS.map(p => h('option', { value: p.days, selected: p.days === days }, p.label))
        );
        periodSelect.addEventListener('change', () => {
            days = Number(periodSelect.value);
            loadAgents();
        });

        // ============================================================ EINE AGENTEN-KARTE
        const agentCard = agent => {
            const out = h('div');
            // Ampel über den ganzen Zugang: Schlüssel UND OAuth-Verbindungen
            const health = accessHealth(agent);
            const liveConnections = activeConnections(agent);
            // Alte Schlüssel nur erwähnen, wenn es welche gibt: "1 abgelaufen, 2 widerrufen"
            const oldKeys = [
                agent.tokens.expired ? `${agent.tokens.expired} abgelaufen` : '',
                agent.tokens.revoked ? `${agent.tokens.revoked} widerrufen` : ''
            ]
                .filter(Boolean)
                .join(', ');
            const toolboxes = agent.rights.filter(r => r.toolbox);
            const otherRights = agent.rights.filter(r => !r.toolbox);

            // --- Was darf er? Werkzeugkästen (mit "wegnehmen")
            const boxRows = toolboxes.length
                ? h(
                      'ul',
                      { class: 'agent-rights' },
                      toolboxes.map(r =>
                          h(
                              'li',
                              {},
                              h('strong', {}, r.domain),
                              ` – ${r.toolCount} ${r.toolCount === 1 ? 'Werkzeug' : 'Werkzeuge'} `,
                              ...roleBadges(r.roles),
                              busyButton(
                                  'Wegnehmen',
                                  async () => {
                                      if (
                                          !confirm(
                                              `„${agent.domain}“ den Kasten „${r.domain}“ wegnehmen? Er kann diese Werkzeuge danach sofort nicht mehr benutzen.`
                                          )
                                      )
                                          return;
                                      const x = await removeBox({ api, agentUuid: agent.uuid, right: r });
                                      if (!x.ok) return toast(x.error, 'error');
                                      toast(`Kasten „${r.domain}“ weggenommen.`, 'ok');
                                      loadAgents();
                                  },
                                  { className: 'btn small ghost' }
                              )
                          )
                      )
                  )
                : h('p', { class: 'muted small' }, 'Noch kein Werkzeugkasten.');

            // --- Kasten dazu: nur Kästen mit deinem blue, die er noch nicht hat
            const canAdd = addableBoxes(boxes, agent);
            const addSelect = h(
                'select',
                { class: 'input' },
                h('option', { value: '' }, '— Kasten wählen —'),
                canAdd.map(b => h('option', { value: b.family }, `${b.family} (${b.tools.length})`))
            );
            const addRow = canAdd.length
                ? h(
                      'div',
                      { class: 'row gap-s' },
                      addSelect,
                      busyButton(
                          'Kasten dazu',
                          async () => {
                              const box = canAdd.find(b => b.family === addSelect.value);
                              if (!box) return toast('Bitte einen Kasten wählen.', 'error');
                              const p = previewAgent([box]);
                              if (
                                  !confirm(
                                      `„${agent.domain}“ den Kasten „${box.family}“ geben?\n\n${p.text.replace('Dieser Agent sieht', 'Dazu kommen')}`
                                  )
                              )
                                  return;
                              const x = await addBox({ api, agentUuid: agent.uuid, box });
                              if (!x.ok) return toast(x.error, 'error');
                              toast(`Kasten „${box.family}“ dazugegeben.`, 'ok');
                              loadAgents();
                          },
                          { className: 'btn small' }
                      )
                  )
                : null;

            // --- Weitere Rechte (keine Werkzeugkästen) – nur zum Ansehen
            const others =
                otherRights.length || agent.hiddenRights
                    ? h(
                          'div',
                          {},
                          h('div', { class: 'muted small' }, 'Weitere Rechte (ändern unter „Rechte“):'),
                          h(
                              'ul',
                              { class: 'agent-rights' },
                              otherRights.map(r => h('li', {}, h('strong', {}, r.domain), ' ', ...roleBadges(r.roles))),
                              agent.hiddenRights
                                  ? h(
                                        'li',
                                        { class: 'muted' },
                                        `+ ${agent.hiddenRights} ${agent.hiddenRights === 1 ? 'weiteres Objekt' : 'weitere Objekte'} (kein Zugriff für dich – vergeben von jemand anderem)`
                                    )
                                  : null
                          )
                      )
                    : h('p', { class: 'muted small' }, 'Weitere Rechte: keine.');

            // --- Werkzeug-Statistik
            const s = agent.stats;
            const statTable = s.tools.length
                ? h(
                      'div',
                      { class: 'table-wrap' },
                      h(
                          'table',
                          { class: 'data-table' },
                          h(
                              'thead',
                              {},
                              h(
                                  'tr',
                                  {},
                                  ['Werkzeug', 'Benutzt', 'Fehler', 'Zuletzt'].map(t => h('th', {}, t))
                              )
                          ),
                          h(
                              'tbody',
                              {},
                              s.tools.map(t =>
                                  h(
                                      'tr',
                                      {},
                                      h('td', { class: t.visible ? '' : 'muted' }, toolLabel(t)),
                                      h('td', { class: 'num' }, `${t.uses}×`),
                                      h('td', {}, t.errors ? errorText(t.byStatus) : badge('keine', 'ok')),
                                      h('td', { title: formatDate(t.lastAt) }, timeAgo(t.lastAt))
                                  )
                              )
                          )
                      )
                  )
                : h('p', { class: 'muted small' }, `Keine Werkzeuge benutzt in den letzten ${days} Tagen.`);

            // --- Neuer Schlüssel (der alte läuft bald ab oder ist weg)
            const keyPreset = h(
                'select',
                { class: 'input' },
                LIFETIME_PRESETS.filter(p => p.hours !== null).map(p =>
                    h('option', { value: p.id, selected: p.id === DEFAULT_PRESET }, p.label)
                )
            );
            const newKey = busyButton(
                'Neuer Schlüssel',
                async () => {
                    const preset = LIFETIME_PRESETS.find(p => p.id === keyPreset.value);
                    const t = await api.post(
                        `/api/tokens/object/${encodeURIComponent(agent.uuid)}`,
                        { name: `Agent ${agent.domain}`, expiresInHours: preset.hours },
                        { sensitive: true } // Schlüssel im Anfragen-Protokoll nur als ***
                    );
                    if (!t.ok || !t.data?.data?.token) return mount(out, resultLine(t));
                    mount(
                        out,
                        tokenReveal({
                            title: `🔑 Neuer Schlüssel für „${agent.domain}“ – nur jetzt sichtbar!`,
                            agentName: agent.domain,
                            tokenData: t.data.data,
                            onClose: () => loadAgents()
                        })
                    );
                },
                { className: 'btn small', iconName: 'key' }
            );

            // --- Verbindungen (OAuth): laufende mit "Trennen", beendete klein darunter
            const ended = (agent.connections || []).filter(c => c.status !== 'active');
            const connectionRows =
                agent.connections && agent.connections.length
                    ? h(
                          'ul',
                          { class: 'agent-rights' },
                          liveConnections.map(c =>
                              h(
                                  'li',
                                  {},
                                  h('strong', {}, c.clientHost),
                                  badge(connectionStatusInfo(c.status).label, connectionStatusInfo(c.status).tone),
                                  h(
                                      'span',
                                      { class: 'muted small' },
                                      `seit ${formatDate(c.createdAt)} · bis ${formatDate(c.expiresAt)} · ${
                                          c.lastUsedAt ? `zuletzt ${timeAgo(c.lastUsedAt)}` : 'noch nie benutzt'
                                      }${c.byMe ? '' : ' · von jemand anderem erlaubt'}`
                                  ),
                                  busyButton(
                                      'Trennen',
                                      async () => {
                                          if (
                                              !confirm(
                                                  `Verbindung „${c.clientHost}“ von „${agent.domain}“ trennen? Die KI dort kommt ab sofort nicht mehr herein. Neu verbinden geht jederzeit mit „Erlauben“.`
                                              )
                                          )
                                              return;
                                          const x = await disconnect({ api, uuid: c.uuid });
                                          if (!x.ok) return toast(x.error, 'error');
                                          toast(`Verbindung „${c.clientHost}“ getrennt.`, 'ok');
                                          loadAgents();
                                      },
                                      { className: 'btn small ghost' }
                                  )
                              )
                          ),
                          ended.map(c =>
                              h(
                                  'li',
                                  { class: 'muted small' },
                                  `${c.clientHost} – ${connectionStatusInfo(c.status).label} ${timeAgo(c.revokedAt || c.expiresAt)}`,
                                  c.revokedReason ? ` (${revokedReasonLabel(c.revokedReason)})` : ''
                              )
                          )
                      )
                    : h('p', { class: 'muted small' }, 'Keine Verbindungen.');

            // --- Not-Aus: alle gültigen Schlüssel widerrufen UND alle Verbindungen trennen
            const stop =
                agent.tokens.active || liveConnections.length
                    ? busyButton(
                          'Not-Aus: alle Zugänge sperren',
                          async () => {
                              if (
                                  !confirm(
                                      `Alle Zugänge von „${agent.domain}“ sperren (${agent.tokens.active} Schlüssel, ${liveConnections.length} Verbindungen)? Der Agent kommt ab sofort nicht mehr herein. Seine Rechte bleiben – mit einem neuen Schlüssel oder „Erlauben“ kann er weiterarbeiten.`
                                  )
                              )
                                  return;
                              const x = await stopAgent({ api, agent });
                              if (x.failed.length) {
                                  toast(
                                      `${x.revoked} Schlüssel und ${x.disconnected} Verbindungen gesperrt, ${x.failed.length} nicht: ${x.failed[0].error}`,
                                      'error'
                                  );
                              } else {
                                  toast(
                                      `„${agent.domain}“ ist gestoppt (${x.revoked} Schlüssel, ${x.disconnected} Verbindungen).`,
                                      'ok'
                                  );
                              }
                              loadAgents();
                          },
                          { className: 'btn small danger' }
                      )
                    : null;

            return card(
                {
                    title: `🤖 ${agent.domain}`,
                    subtitle: agent.lastActivityAt
                        ? `zuletzt aktiv ${timeAgo(agent.lastActivityAt)} · ${s.actions} Aktionen in ${days} Tagen`
                        : 'noch nie aktiv'
                },
                callout(health.tone, health.text, oldKeys ? ` (alte Schlüssel: ${oldKeys})` : ''),
                h('h4', {}, 'Verbindungen'),
                connectionRows,
                h('h4', {}, 'Werkzeugkästen'),
                boxRows,
                addRow,
                others,
                h('h4', {}, `Werkzeug-Statistik (${days} Tage): ${s.toolUses}× benutzt, ${s.toolErrors} Fehler`),
                statTable,
                h('div', { class: 'row gap-s wrap' }, keyPreset, newKey, stop),
                out
            );
        };

        // ============================================================ WER BENUTZT WAS?
        const renderUsage = agents => {
            const rows = usageByTool(agents);
            if (!rows.length) return mount(usageBox);
            mount(
                usageBox,
                card(
                    {
                        title: 'Wer benutzt was?',
                        icon: 'activity',
                        subtitle: `Deine Werkzeuge in den letzten ${days} Tagen – nach Agent.`
                    },
                    h(
                        'div',
                        { class: 'table-wrap' },
                        h(
                            'table',
                            { class: 'data-table' },
                            h(
                                'thead',
                                {},
                                h(
                                    'tr',
                                    {},
                                    ['Werkzeug', 'Benutzt', 'Fehler', 'Von wem', 'Zuletzt'].map(t => h('th', {}, t))
                                )
                            ),
                            h(
                                'tbody',
                                {},
                                rows.map(t =>
                                    h(
                                        'tr',
                                        {},
                                        h('td', {}, h('strong', {}, t.name)),
                                        h('td', { class: 'num' }, `${t.uses}×`),
                                        h('td', { class: 'num' }, t.errors ? String(t.errors) : '–'),
                                        h(
                                            'td',
                                            { class: 'small' },
                                            t.agents.map(a => `${a.domain} ${a.uses}×`).join(' · ')
                                        ),
                                        h('td', { title: formatDate(t.lastAt) }, timeAgo(t.lastAt))
                                    )
                                )
                            )
                        )
                    )
                )
            );
        };

        // ============================================================ LADEN
        const loadAgents = async () => {
            mount(listBox, spinner('Lade deine Agenten …'));
            const r = await api.get('/api/agents', { query: { days } });
            if (!r.ok) return mount(listBox, resultLine(r));
            const agents = Array.isArray(r.data?.data) ? r.data.data : [];
            renderUsage(agents);

            // OAuth eingeschaltet? Dann zeigen, wie man claude.ai & Co. ohne Schlüssel verbindet
            const oauth = r.data?.meta?.oauth;
            const oauthHint =
                oauth && oauth.enabled
                    ? callout(
                          'info',
                          'Claude-App, claude.ai oder Handy verbinden – ohne Schlüssel: ',
                          'In Claude unter Einstellungen → Connectors → „Eigenen Connector hinzufügen“ diese Adresse eintragen. Claude öffnet dann eine vindelis-Seite, auf der du den Agenten wählst und „Erlauben“ klickst.',
                          codeBlock(oauth.mcpUrl, { label: 'Adresse des Connectors' })
                      )
                    : null;

            if (!agents.length) {
                return mount(
                    listBox,
                    oauthHint,
                    emptyState({
                        icon: 'robot',
                        title: 'Noch keine Agenten',
                        text: 'Ein Agent ist ein Objekt mit einem Schlüssel oder einer Verbindung von dir. Leg unten den ersten an.'
                    })
                );
            }
            mount(
                listBox,
                oauthHint,
                ...agents.map(agentCard),
                r.data?.meta?.capped ? callout('warn', 'Nur die ersten 100 Agenten', ' werden gezeigt.') : null,
                h('p', { class: 'muted small' }, r.data?.meta?.hinweis || '')
            );
        };

        // ============================================================ AGENT ANLEGEN
        // Ein Agent in einem Schritt: Objekt + black auf Werkzeugkästen + Schlüssel.
        // Die Logik (Prüfen, Vorschau, Ablauf mit Aufräumen) steht in core/agent.js.
        const agentName = h('input', {
            class: 'input',
            value: AGENT_PREFIX,
            maxlength: MAX_AGENT_NAME,
            autocomplete: 'off',
            spellcheck: 'false' // als Text: h() überspringt false
        });
        const agentPreset = h(
            'select',
            { class: 'input' },
            LIFETIME_PRESETS.filter(p => p.hours !== null).map(p =>
                h('option', { value: p.id, selected: p.id === DEFAULT_PRESET }, p.label)
            )
        );
        const boxesBox = h('div', {}, spinner('Suche deine Werkzeugkästen …'));
        const previewBox = h('div');
        const createOut = h('div');
        const inputs = new Map(); // Kasten -> Häkchen

        const chosenBoxes = () => boxes.filter(b => inputs.get(b.family)?.checked);
        const updatePreview = () => {
            const p = previewAgent(chosenBoxes());
            mount(
                previewBox,
                callout('info', 'Vorschau: ', p.text),
                p.notReady.length
                    ? h(
                          'p',
                          { class: 'muted small' },
                          `Noch ohne SSF (sieht er, kann sie aber noch nicht benutzen): ${p.notReady.join(', ')}`
                      )
                    : null
            );
        };

        const renderBoxChoice = () => {
            inputs.clear();
            if (!boxes.length) {
                return mount(
                    boxesBox,
                    emptyState({
                        icon: 'box',
                        title: 'Noch keine Werkzeugkästen',
                        text: 'Kein Problem – der Agent geht auch ohne. Ein Werkzeugkasten ist eine Domain mit Werkzeug-Kindern; Claude kann dir später einen bauen (guide topic „werkzeuge“).'
                    })
                );
            }
            mount(
                boxesBox,
                ...boxes.map(b => {
                    const input = h('input', { type: 'checkbox', disabled: !b.canGrant });
                    input.addEventListener('change', updatePreview);
                    inputs.set(b.family, input);
                    return h(
                        'div',
                        { class: 'agent-box' },
                        h(
                            'label',
                            { class: 'check' },
                            input,
                            h('strong', {}, b.family),
                            ` – ${b.tools.length} ${b.tools.length === 1 ? 'Werkzeug' : 'Werkzeuge'}`,
                            b.canGrant ? null : h('span', { class: 'muted small' }, ' (kein blue – nicht wählbar)')
                        ),
                        h('div', { class: 'muted small' }, b.tools.map(t => t.name).join(', '))
                    );
                }),
                h(
                    'p',
                    { class: 'muted small' },
                    'Es gibt nur ganze Kästen: black auf ein Werkzeug gilt immer für den ganzen Kasten. Soll ein Agent nur einen Teil bekommen, mach dafür einen eigenen Kasten.'
                )
            );
            updatePreview();
        };

        const createCard = card(
            {
                title: 'Agent anlegen',
                icon: 'key',
                subtitle: 'In einem Schritt: eigenes Objekt + Schlüssel – Werkzeugkästen sind freiwillig.'
            },
            field('Name des Agenten', agentName, 'Kleinbuchstaben, Ziffern, Bindestriche – z.B. „agent-buchhaltung“.'),
            field('Welche Werkzeugkästen darf er benutzen? (freiwillig)', boxesBox),
            previewBox,
            field('Laufzeit des Schlüssels', agentPreset, 'Danach ist er automatisch ungültig.'),
            h(
                'div',
                {},
                busyButton(
                    'Agent anlegen',
                    async () => {
                        const checked = checkAgentName(agentName.value);
                        if (checked.error) return toast(checked.error, 'error');
                        // Werkzeugkästen sind freiwillig (24.10.2026) – ohne Kasten baut der Agent eigene Websites
                        const chosen = chosenBoxes();
                        const preset = LIFETIME_PRESETS.find(p => p.id === agentPreset.value);
                        const p = previewAgent(chosen);
                        if (
                            !confirm(
                                `Agent „${checked.name}“ anlegen?\n\n${p.text}\n\nSchlüssel gültig: ${preset.label}.`
                            )
                        )
                            return;

                        const stepLine = h('p', { class: 'muted small' });
                        mount(createOut, stepLine);
                        const result = await createAgent({
                            api,
                            name: checked.name,
                            boxes: chosen,
                            hours: preset.hours,
                            onStep: text => (stepLine.textContent = text)
                        });
                        invalidateObjects(); // die Objekt-Liste hat sich geändert
                        if (!result.ok) {
                            return mount(
                                createOut,
                                callout(
                                    'error',
                                    'Agent nicht angelegt: ',
                                    result.error,
                                    result.cleanedUp
                                        ? ` Der halb angelegte Agent wurde wieder gelöscht – der Name „${checked.name}“ ist jetzt gesperrt, nimm bitte einen anderen.`
                                        : result.agentUuid
                                          ? ' Achtung: Der halb angelegte Agent konnte nicht gelöscht werden – bitte unter „Objekte“ von Hand löschen.'
                                          : ''
                                )
                            );
                        }
                        mount(
                            createOut,
                            tokenReveal({
                                title: `🤖 Agent „${checked.name}“ ist bereit – der Schlüssel ist nur jetzt sichtbar!`,
                                agentName: checked.name,
                                tokenData: result.token,
                                onClose: () => mount(createOut)
                            })
                        );
                        agentName.value = AGENT_PREFIX;
                        for (const input of inputs.values()) input.checked = false;
                        updatePreview();
                        loadAgents();
                    },
                    { className: 'btn primary', iconName: 'key' }
                )
            ),
            createOut
        );

        root.append(
            h('div', { class: 'row gap-s' }, field('Zeitraum der Statistik', periodSelect)),
            listBox,
            usageBox,
            createCard
        );

        // Zuerst die Kästen (die Karten brauchen sie für "Kasten dazu"), dann die Agenten
        const loaded = await loadGrantableBoxes(objects);
        if (loaded.ok) boxes = loaded.boxes;
        else mount(boxesBox, resultLine(loaded.result));
        if (loaded.ok) renderBoxChoice();
        loadAgents();
    }
};
