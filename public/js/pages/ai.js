// js/pages/ai.js
// ---------------------------------------------------------------------
// KI-ZUGÄNGE (Plan "MCP – KI arbeitet in at0mic", Etappe 3)
//
// Eine KI (z.B. Claude) arbeitet mit einem SCHLÜSSEL als eines deiner
// Objekte – mit dessen Rechten, nie mit deinen. Hier:
//   0. Hinweis auf die Seite "Agenten" (dort: Agent anlegen + verwalten)
//   1. Schlüssel erzeugen (Objekt, Name, Laufzeit 1 Stunde bis 1 Jahr)
//   2. Meine Schlüssel ansehen und widerrufen
//   3. Protokoll: was hat ein Objekt getan / was ist daran passiert?
//
// Sicherheit:
//   - Den Schlüssel zeigt das Backend genau EINMAL (beim Erzeugen). Hier
//     erscheint er in einem Kasten – im Anfragen-Protokoll nur als ***
//     (sensitive: true im API-Client).
//   - Schlüssel verwalten dürfen nur eingeloggte Menschen mit blue auf
//     dem Objekt (prüft das Backend).
//
// Routen:  GET    /api/tokens                        meine Schlüssel
//          POST   /api/tokens/object/<uuid>          { name, expiresInHours }
//          DELETE /api/tokens/<tokenUuid>            widerrufen
//          GET    /api/audit/actor/<uuid>            was hat es getan?
//          GET    /api/audit/object/<uuid>           was ist daran passiert?
//
// Adresse: /#/ki
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
    copyText,
    codeBlock
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatDate, timeAgo, shortUuid, isUuid } from '../core/format.js';
import { loadObjects, loadObjectNames, objectLabel, invalidateObjects } from '../core/objects.js';
import { objectPicker } from '../core/picker.js';
import { apiBase } from '../core/config.js';

// ---------------------------------------------------------------------
// REINE FUNKTIONEN (ohne Bildschirm – automatisch getestet)
// ---------------------------------------------------------------------

// Laufzeit: 1 Stunde bis 1 Jahr (wie im Backend, SYSTEM.tokens)
export const MIN_HOURS = 1;
export const MAX_HOURS = 365 * 24;

export const LIFETIME_PRESETS = [
    { id: '1h', label: '1 Stunde', hours: 1 },
    { id: '1d', label: '1 Tag', hours: 24 },
    { id: '7d', label: '1 Woche', hours: 7 * 24 },
    { id: '30d', label: '30 Tage', hours: 30 * 24 },
    { id: '90d', label: '90 Tage', hours: 90 * 24 },
    { id: '1y', label: '1 Jahr', hours: MAX_HOURS },
    { id: 'custom', label: 'Eigene Dauer …', hours: null }
];

/**
 * Eigene Dauer -> Stunden. amount = Zahl aus dem Feld, unit = 'hours' | 'days'
 * @returns {{ hours: number } | { error: string }}
 */
export const lifetimeHours = (amount, unit) => {
    const n = Number(String(amount).trim());
    if (!Number.isInteger(n) || n < 1) return { error: 'Bitte eine ganze Zahl ab 1 eingeben.' };
    const hours = unit === 'days' ? n * 24 : n;
    if (hours < MIN_HOURS || hours > MAX_HOURS) return { error: 'Erlaubt ist 1 Stunde bis 1 Jahr (365 Tage).' };
    return { hours };
};

// Status eines Schlüssels für die Anzeige
export const TOKEN_STATUS = {
    active: { label: 'gültig', tone: 'ok' },
    expired: { label: 'abgelaufen', tone: 'neutral' },
    revoked: { label: 'widerrufen', tone: 'error' }
};
export const tokenStatusInfo = status => TOKEN_STATUS[status] || { label: status || 'unbekannt', tone: 'neutral' };

// Wer hat gehandelt?
export const ACTOR_KINDS = {
    ai: { label: 'KI', emoji: '🤖' },
    human: { label: 'Mensch', emoji: '👤' },
    guest: { label: 'Gast', emoji: '👤' }
};
export const actorKindInfo = kind => ACTOR_KINDS[kind] || { label: kind || '?', emoji: '•' };

// Aktionen aus dem Protokoll in Klartext (Namen wie im Backend, auditService RULES)
export const AUDIT_ACTIONS = {
    'objekt.anlegen': 'Objekt angelegt',
    'objekt.anhaengen': 'Unter-Objekt angehängt',
    'objekt.klonen': 'Objekt geklont',
    'objekt.zuegeln': 'Objekt gezügelt',
    'objekt.loeschen': 'Objekt gelöscht',
    'objekt.sichtbarkeit': 'Sichtbarkeit geändert',
    'code.speichern': 'Code gespeichert',
    'daten.schreiben': 'Daten geschrieben',
    'daten.loeschen': 'Datensatz gelöscht',
    'relation.anlegen': 'Relation angelegt',
    'ssf.ausfuehren': 'SSF ausgeführt',
    'triplet.anlegen': 'Triplet angelegt',
    'rolle.vergeben': 'Recht vergeben',
    'rolle.entziehen': 'Recht entzogen',
    'werkzeug.benutzen': 'Werkzeug benutzt', // MCP Etappe 5c
    'freigabe.anfragen': 'um Veröffentlichung gebeten', // MCP Etappe 5d
    'freigabe.erteilen': 'Veröffentlichung freigegeben',
    'freigabe.ablehnen': 'Veröffentlichung abgelehnt',
    'tresor.setzen': 'Tresor-Schlüssel gesetzt',
    'tresor.loeschen': 'Tresor-Schlüssel gelöscht',
    'schluessel.erzeugen': 'KI-Schlüssel erzeugt',
    'schluessel.widerrufen': 'KI-Schlüssel widerrufen',
    'verbindung.erlauben': 'Verbindung erlaubt (OAuth)', // Plan "OAuth für MCP"
    'verbindung.trennen': 'Verbindung getrennt (OAuth)',
    'website.anmelden': 'Auf einer Website angemeldet', // Plan "Login auf Websites"
    'schloss.entfernen': 'Zusatz-Schloss entfernt (Rollen pro Teil)',
    'einladung.erstellen': 'Einladungs-Link erstellt',
    'einladung.widerrufen': 'Einladungs-Link widerrufen',
    'einladung.annehmen': 'Einladung angenommen',
    'zeitplan.setzen': 'Zeitplan einer SSF gesetzt', // Plan "SSF-Ausbau", Teil C
    'zeitplan.entfernen': 'Zeitplan einer SSF entfernt',
    'auftrag.abbrechen': 'Hintergrund-Auftrag abgebrochen',
    'domain.verbinden': 'Eigene Domain verbunden', // Plan "SSF-Ausbau", Teil D
    'domain.trennen': 'Eigene Domain getrennt',
    'anfrage.sonstige': 'Sonstige Anfrage'
};
export const auditActionLabel = action => AUDIT_ACTIONS[action] || action || '?';

// Die Details eines Eintrags als kurzer Text: "roleType: black · triplet: 1a2b3c4d…"
// UUIDs werden gekürzt, damit die Zeile lesbar bleibt.
export const detailText = details => {
    if (!details || typeof details !== 'object') return '';
    return Object.entries(details)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => {
            const value = Array.isArray(v) ? v.join(', ') : isUuid(v) ? shortUuid(v) : String(v);
            return `${k}: ${value}`;
        })
        .join(' · ');
};

// ---------------------------------------------------------------------
// DIE SEITE
// ---------------------------------------------------------------------
export default {
    async render(root) {
        root.append(
            pageHeader({
                intro: 'Eine KI arbeitet mit einem Schlüssel als eines deiner Objekte – mit dessen Rechten, nie mit deinen. Was sie darf, bestimmst du über black / red / blue.'
            })
        );

        const identity = getSession().identity;
        const isUser = identity?.kind === 'user';

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);
        const nameOf = uuid => {
            const o = objects.find(x => x.uuid === uuid);
            return o ? objectLabel(o) : shortUuid(uuid);
        };

        if (!isUser) {
            root.append(
                callout(
                    'info',
                    'Nur mit Login.',
                    ' KI-Schlüssel erzeugen und verwalten können nur eingeloggte Benutzer – keine Gäste. Logge dich oben rechts ein.'
                )
            );
        }

        // ============================================================ MEINE SCHLÜSSEL
        // (loadTokens steht weiter unten – der Agent-Assistent ruft es nach dem Anlegen auf)
        const listBox = h('div', {}, spinner());
        const loadTokens = async () => {
            if (!isUser) {
                return mount(
                    listBox,
                    emptyState({
                        icon: 'key',
                        title: 'Keine Schlüssel',
                        text: 'Nach dem Login siehst du hier deine Schlüssel.'
                    })
                );
            }
            mount(listBox, spinner());
            const r = await api.get('/api/tokens');
            if (!r.ok) return mount(listBox, resultLine(r));
            const list = Array.isArray(r.data?.data) ? r.data.data : [];
            if (!list.length) {
                return mount(
                    listBox,
                    emptyState({ icon: 'key', title: 'Noch keine Schlüssel', text: 'Erzeuge rechts den ersten.' })
                );
            }
            mount(
                listBox,
                h(
                    'ul',
                    { class: 'secret-list' },
                    list.map(t => {
                        const status = tokenStatusInfo(t.status);
                        return h(
                            'li',
                            {},
                            h('span', { class: 'secret-icon' }, icon('key', { size: 16 })),
                            h(
                                'div',
                                { class: 'grow' },
                                h('strong', {}, t.name),
                                ' ',
                                badge(status.label, status.tone),
                                h(
                                    'div',
                                    { class: 'muted small' },
                                    `als „${t.objectDomain || nameOf(t.objectUuid)}“ · `,
                                    h('code', {}, `${t.hint}…`),
                                    t.status === 'active'
                                        ? ` · gültig bis ${formatDate(t.expiresAt)}`
                                        : t.status === 'revoked'
                                          ? ` · widerrufen ${timeAgo(t.revokedAt)}`
                                          : ` · abgelaufen ${formatDate(t.expiresAt)}`,
                                    ` · ${t.lastUsedAt ? `zuletzt benutzt ${timeAgo(t.lastUsedAt)}` : 'noch nie benutzt'}`
                                )
                            ),
                            t.status === 'active'
                                ? h(
                                      'button',
                                      {
                                          class: 'btn small danger',
                                          type: 'button',
                                          onclick: async () => {
                                              if (
                                                  !confirm(
                                                      `Schlüssel „${t.name}“ wirklich widerrufen? Die KI kann ihn ab sofort nicht mehr benutzen.`
                                                  )
                                              )
                                                  return;
                                              const d = await api.del(`/api/tokens/${t.uuid}`);
                                              if (!d.ok) return toast(d.error, 'error');
                                              toast(`„${t.name}“ widerrufen.`, 'ok');
                                              loadTokens();
                                          }
                                      },
                                      'Widerrufen'
                                  )
                                : null
                        );
                    })
                )
            );
        };

        // ============================================================ ERZEUGEN
        let createUuid = null;
        const picker = objectPicker({
            objects: objects.filter(o => !o.user), // User-Objekte bekommen nie einen Schlüssel
            placeholder: '— Objekt wählen (z.B. „claude“) —',
            onSelect: id => (createUuid = id)
        });
        const nameInput = h('input', {
            class: 'input',
            placeholder: 'z.B. Claude Laptop',
            maxlength: 100,
            autocomplete: 'off'
        });
        const presetSelect = h(
            'select',
            { class: 'input' },
            LIFETIME_PRESETS.map(p => h('option', { value: p.id, selected: p.id === '7d' }, p.label))
        );
        const customAmount = h('input', { class: 'input', type: 'number', min: 1, step: 1, value: 12 });
        const customUnit = h(
            'select',
            { class: 'input' },
            h('option', { value: 'hours' }, 'Stunden'),
            h('option', { value: 'days' }, 'Tage')
        );
        const customRow = h('div', { class: 'row gap-s', hidden: true }, customAmount, customUnit);
        presetSelect.addEventListener('change', () => (customRow.hidden = presetSelect.value !== 'custom'));

        const revealBox = h('div');
        const out = h('div');

        // Der Schlüssel wird genau EINMAL gezeigt – hier, in diesem Kasten
        const showToken = data =>
            mount(
                revealBox,
                h(
                    'div',
                    { class: 'token-reveal' },
                    h('strong', {}, '🔑 Dein neuer Schlüssel – nur jetzt sichtbar!'),
                    h('code', { class: 'token-value' }, data.token),
                    h(
                        'div',
                        { class: 'row gap-s' },
                        h(
                            'button',
                            { class: 'btn primary', type: 'button', onclick: () => copyText(data.token) },
                            icon('copy', { size: 16 }),
                            'Kopieren'
                        ),
                        h(
                            'button',
                            { class: 'btn ghost', type: 'button', onclick: () => mount(revealBox) },
                            'Ich habe ihn gesichert – ausblenden'
                        )
                    ),
                    h(
                        'p',
                        { class: 'muted small' },
                        `Die KI handelt damit als „${data.objectDomain}“ bis ${formatDate(data.expiresAt)}. `,
                        'Bewahre ihn wie ein Passwort auf. Verloren? Einfach widerrufen und einen neuen erzeugen.'
                    )
                )
            );

        const createCard = card(
            { title: 'Neuen Schlüssel erzeugen', icon: 'key', subtitle: 'Du brauchst blue auf dem Objekt.' },
            field('Als welches Objekt handelt die KI?', picker, 'Am besten ein eigenes Objekt nur für die KI.'),
            field('Name', nameInput, 'Damit du ihn später wiedererkennst.'),
            field('Laufzeit', presetSelect, '1 Stunde bis 1 Jahr. Danach ist der Schlüssel automatisch ungültig.'),
            customRow,
            h(
                'div',
                {},
                busyButton(
                    'Schlüssel erzeugen',
                    async () => {
                        if (!isUser) return toast('Bitte zuerst einloggen.', 'error');
                        if (!createUuid) return toast('Bitte ein Objekt wählen.', 'error');
                        if (!nameInput.value.trim()) return toast('Bitte einen Namen eingeben.', 'error');
                        let hours = LIFETIME_PRESETS.find(p => p.id === presetSelect.value)?.hours;
                        if (presetSelect.value === 'custom') {
                            const l = lifetimeHours(customAmount.value, customUnit.value);
                            if (l.error) return toast(l.error, 'error');
                            hours = l.hours;
                        }
                        const r = await api.post(
                            `/api/tokens/object/${createUuid}`,
                            { name: nameInput.value.trim(), expiresInHours: hours },
                            { sensitive: true } // Schlüssel im Anfragen-Protokoll nur als ***
                        );
                        mount(out, resultLine(r));
                        if (r.ok && r.data?.data?.token) {
                            showToken(r.data.data);
                            nameInput.value = '';
                            loadTokens();
                        }
                    },
                    { className: 'btn primary', iconName: 'key' }
                )
            ),
            revealBox,
            out
        );

        // ============================================================ AGENTEN
        // Agent anlegen und verwalten steht seit "Agenten im Griff" (18.10.2026,
        // Entscheidung A) auf der eigenen Seite "Agenten" (pages/agents.js).
        root.append(
            callout(
                'info',
                'Agenten anlegen und im Griff behalten: ',
                'Das geht jetzt auf der Seite ',
                h('a', { href: '#/agenten' }, 'Agenten'),
                ' – mit Werkzeugkästen, Schlüsseln und Werkzeug-Statistik.'
            )
        );

        root.append(
            h(
                'div',
                { class: 'grid-2' },
                card(
                    { title: 'Meine Schlüssel', icon: 'key', subtitle: 'Alle Schlüssel, die du erzeugt hast.' },
                    listBox
                ),
                createCard
            )
        );

        // ============================================================ PROTOKOLL
        let logUuid = null;
        let logMode = 'actor'; // 'actor' = was hat es getan? | 'object' = was ist daran passiert?
        let nextBefore = null;
        const logBox = h('div');
        const moreBox = h('div');

        const renderRows = rows =>
            rows.map(e => {
                const actor = actorKindInfo(e.actorKind);
                return h(
                    'tr',
                    {},
                    h('td', { title: formatDate(e.at) }, timeAgo(e.at)),
                    h('td', {}, `${actor.emoji} ${actor.label} `, h('span', { class: 'muted' }, nameOf(e.actorUuid))),
                    h('td', {}, auditActionLabel(e.action)),
                    h('td', { class: 'obj' }, e.targetUuid ? nameOf(e.targetUuid) : '–'),
                    h('td', {}, e.success ? badge('ok', 'ok') : badge(`abgelehnt (${e.status})`, 'error')),
                    h('td', { class: 'muted small' }, detailText(e.details))
                );
            });

        const loadLog = async ({ append = false } = {}) => {
            if (!logUuid) {
                mount(moreBox);
                return mount(
                    logBox,
                    emptyState({
                        icon: 'history',
                        title: 'Wähle ein Objekt',
                        text: 'Zum Beispiel deine KI – dann siehst du alles, was sie getan hat.'
                    })
                );
            }
            if (!append) mount(logBox, spinner());
            const r = await api.get(`/api/audit/${logMode}/${logUuid}`, {
                query: { limit: 50, before: append ? nextBefore : undefined }
            });
            if (!r.ok) {
                mount(moreBox);
                return mount(
                    logBox,
                    resultLine(r),
                    r.status === 403
                        ? callout('info', 'Du brauchst blue auf diesem Objekt,', ' um sein Protokoll zu sehen.')
                        : null
                );
            }
            const rows = Array.isArray(r.data?.data) ? r.data.data : [];
            nextBefore = r.data?.meta?.next_before || null;

            if (!append) {
                if (!rows.length) {
                    mount(moreBox);
                    return mount(logBox, emptyState({ icon: 'history', title: 'Noch keine Einträge', text: '' }));
                }
                mount(
                    logBox,
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
                                    ['Wann', 'Wer', 'Aktion', 'Ziel', 'Ergebnis', 'Details'].map(t => h('th', {}, t))
                                )
                            ),
                            h('tbody', {}, renderRows(rows))
                        )
                    )
                );
            } else {
                logBox.querySelector('tbody')?.append(...renderRows(rows));
            }
            mount(
                moreBox,
                nextBefore
                    ? busyButton('Ältere laden', () => loadLog({ append: true }), { className: 'btn ghost' })
                    : null
            );
        };

        const modeSelect = h(
            'select',
            { class: 'input' },
            h('option', { value: 'actor' }, 'Was hat es getan?'),
            h('option', { value: 'object' }, 'Was ist daran passiert?')
        );
        modeSelect.addEventListener('change', () => {
            logMode = modeSelect.value;
            loadLog();
        });

        root.append(
            card(
                {
                    title: 'Protokoll',
                    icon: 'history',
                    subtitle:
                        'Alles, was eine KI ändert (auch abgelehnte Versuche), und die wichtigen Aktionen von Menschen.'
                },
                h(
                    'div',
                    { class: 'row gap-s wrap' },
                    h(
                        'div',
                        { class: 'grow' },
                        objectPicker({
                            objects,
                            placeholder: '— Objekt wählen —',
                            onSelect: id => {
                                logUuid = id;
                                loadLog();
                            }
                        })
                    ),
                    modeSelect
                ),
                logBox,
                moreBox
            ),
            card(
                { title: 'Wie dich der KI-Zugang schützt', icon: 'shield' },
                h(
                    'ul',
                    { class: 'learn' },
                    [
                        'Die KI handelt als ein Objekt – mit dessen Rechten, nie mit deinen. Mehr darf sie erst, wenn du ihr über „Rechte“ black, red oder blue gibst.',
                        'Gespeichert wird nur ein Fingerabdruck des Schlüssels. Den Schlüssel selbst siehst du genau einmal.',
                        'Jeder Schlüssel läuft ab (1 Stunde bis 1 Jahr) und lässt sich sofort widerrufen.',
                        'Eine KI veröffentlicht nie etwas, setzt keine Tresor-Werte und verwaltet keine Schlüssel.',
                        'Sie entzieht niemandem mit blue ein Recht – dich kann sie also nie aussperren.',
                        'Alles, was sie ändert, steht im Protokoll – auch, was ihr verweigert wurde. Nie mit Geheimnissen oder Daten-Inhalten.'
                    ].map(t => h('li', {}, t))
                )
            )
        );

        loadTokens();
        loadLog();
    }
};
