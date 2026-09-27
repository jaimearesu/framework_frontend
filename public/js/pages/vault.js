// js/pages/vault.js
// ---------------------------------------------------------------------
// TRESOR – geheime Schlüssel für SSFs
//
// Ein Schlüssel (z.B. ein API-Key) gehört zu einem Objekt – meist der SSF,
// die ihn braucht. Die SSF liest ihn mit api.secrets.get('NAME').
//
// Sicherheit (vom Backend garantiert):
//   - Werte sind verschlüsselt gespeichert (AES-256-GCM)
//   - KEIN Weg liefert den Wert zurück – auch dir nicht. Hier siehst du
//     nur Namen und Zeitpunkte. Ändern = neu setzen.
//   - Setzen, Auflisten und Löschen brauchen red auf dem Objekt
//   - In Antworten der SSF wird ein gelesener Wert zu *** geschwärzt
//
// Routen:  GET    /api/secrets/<uuid>            -> [{ name, createdAt, updatedAt }]
//          PUT    /api/secrets/<uuid>/<NAME>     { value }
//          DELETE /api/secrets/<uuid>/<NAME>
//
// Adresse: /#/tresor/<uuid>
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import { h, mount, card, callout, toast, busyButton, resultLine, spinner, field, emptyState } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatDate, timeAgo } from '../core/format.js';
import { loadObjects, loadObjectNames, objectLabel } from '../core/objects.js';
import { objectPicker } from '../core/picker.js';
import { getPlayground } from '../ssf/playground.js';

// Name wie im Backend: A–Z, 0–9, _ ; 1–64 Zeichen (reine Funktion, getestet)
export const normalizeSecretName = text =>
    String(text || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .slice(0, 64);
export const isValidSecretName = name => /^[A-Z0-9_]{1,64}$/.test(name);

export default {
    async render(root, { params }) {
        root.append(
            pageHeader({
                intro: 'Geheime Schlüssel (z.B. API-Keys) für deine SSFs. Einmal gesetzt, kann sie niemand mehr lesen – nur die SSF selbst, während sie läuft.'
            })
        );

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);

        const pg = getPlayground();
        const uuid = params[0] || (pg && objects.some(o => o.uuid === pg.uuids?.funktion) ? pg.uuids.funktion : null);
        const obj = objects.find(o => o.uuid === uuid) || null;

        root.append(
            h(
                'div',
                { class: 'code-picker card' },
                h('span', { class: 'card-icon' }, icon('lock')),
                h(
                    'div',
                    { class: 'grow' },
                    objectPicker({
                        objects,
                        selected: uuid,
                        placeholder: '— Objekt (meist die SSF) wählen —',
                        onSelect: id => id && (location.hash = href('tresor', id))
                    })
                ),
                obj
                    ? h(
                          'a',
                          { class: 'btn ghost', href: href('ssf', obj.uuid) },
                          icon('bolt', { size: 16 }),
                          'Im SSF-Studio'
                      )
                    : null
            )
        );

        if (!obj) {
            root.append(
                card(
                    {},
                    emptyState({
                        icon: 'lock',
                        title: 'Wähle oben ein Objekt',
                        text: 'Schlüssel gehören immer zu dem Objekt, dessen SSF sie braucht.'
                    })
                )
            );
            return;
        }

        const listBox = h('div', {}, spinner());
        const load = async () => {
            mount(listBox, spinner());
            const r = await api.get(`/api/secrets/${obj.uuid}`);
            if (!r.ok) {
                return mount(
                    listBox,
                    resultLine(r),
                    r.status === 403
                        ? callout('info', 'Du brauchst red auf diesem Objekt,', ' um seinen Tresor zu verwalten.')
                        : null,
                    r.status === 503
                        ? callout('warn', 'Tresor nicht eingerichtet:', ' Im Backend fehlt SECRETS_KEY in der .env.')
                        : null
                );
            }
            const list = Array.isArray(r.data?.data) ? r.data.data : [];
            if (!list.length)
                return mount(
                    listBox,
                    emptyState({ icon: 'lock', title: 'Noch keine Schlüssel', text: 'Lege rechts den ersten an.' })
                );
            mount(
                listBox,
                h(
                    'ul',
                    { class: 'secret-list' },
                    list.map(s =>
                        h(
                            'li',
                            {},
                            h('span', { class: 'secret-icon' }, icon('lock', { size: 16 })),
                            h(
                                'div',
                                { class: 'grow' },
                                h('code', {}, s.name),
                                h(
                                    'div',
                                    { class: 'muted small' },
                                    `gesetzt ${formatDate(s.createdAt)} · geändert ${timeAgo(s.updatedAt)}`
                                )
                            ),
                            h('span', { class: 'secret-mask', title: 'Der Wert ist nie sichtbar' }, '••••••••'),
                            h(
                                'button',
                                {
                                    class: 'btn small danger',
                                    type: 'button',
                                    onclick: async () => {
                                        if (
                                            !confirm(
                                                `Schlüssel ${s.name} wirklich löschen? SSFs, die ihn brauchen, schlagen danach fehl.`
                                            )
                                        )
                                            return;
                                        const d = await api.del(
                                            `/api/secrets/${obj.uuid}/${encodeURIComponent(s.name)}`
                                        );
                                        if (!d.ok) return toast(d.error, 'error');
                                        toast(`${s.name} gelöscht.`, 'ok');
                                        load();
                                    }
                                },
                                'Löschen'
                            )
                        )
                    )
                )
            );
        };

        // ---------- setzen ----------
        const nameInput = h('input', {
            class: 'input mono',
            placeholder: 'z.B. WETTER_KEY',
            maxlength: 64,
            autocomplete: 'off'
        });
        nameInput.addEventListener('input', () => {
            const pos = nameInput.selectionStart;
            nameInput.value = normalizeSecretName(nameInput.value);
            nameInput.setSelectionRange(pos, pos);
        });
        // type=password: der Wert erscheint nicht auf dem Bildschirm; autocomplete aus, damit
        // der Browser ihn nicht als Passwort speichern will
        const valueInput = h('input', {
            class: 'input mono',
            type: 'password',
            placeholder: 'geheimer Wert',
            autocomplete: 'new-password',
            maxlength: 4096
        });
        const out = h('div');

        root.append(
            h(
                'div',
                { class: 'grid-2' },
                card(
                    {
                        title: `Tresor von „${objectLabel(obj)}“`,
                        icon: 'lock',
                        subtitle: 'Nur Namen – Werte sind nie sichtbar.'
                    },
                    listBox
                ),
                card(
                    {
                        title: 'Schlüssel setzen',
                        icon: 'check',
                        subtitle: 'Gibt es den Namen schon, wird der Wert ersetzt.'
                    },
                    field(
                        'Name',
                        nameInput,
                        "Grossbuchstaben, Ziffern und _ (max. 64). Die SSF liest ihn mit api.secrets.get('NAME')."
                    ),
                    field('Wert', valueInput, 'Max. 4 KB. Wird verschlüsselt gespeichert und nie mehr angezeigt.'),
                    h(
                        'div',
                        {},
                        busyButton(
                            'Speichern',
                            async () => {
                                const name = normalizeSecretName(nameInput.value);
                                if (!isValidSecretName(name)) return toast('Bitte einen Namen eingeben.', 'error');
                                if (!valueInput.value) return toast('Bitte einen Wert eingeben.', 'error');
                                const r = await api.put(
                                    `/api/secrets/${obj.uuid}/${encodeURIComponent(name)}`,
                                    { value: valueInput.value },
                                    { sensitive: true }
                                );
                                valueInput.value = ''; // Wert sofort aus dem Feld entfernen
                                mount(out, resultLine(r));
                                if (r.ok) {
                                    toast(`${name} gespeichert.`, 'ok');
                                    load();
                                }
                            },
                            { className: 'btn primary', iconName: 'lock' }
                        )
                    ),
                    out,
                    callout(
                        'info',
                        'Ausprobieren:',
                        ' Lege WETTER_KEY an und führe im SSF-Studio das Beispiel „Wetter-API mit Tresor“ aus – der Wert erscheint dort als ***.'
                    )
                )
            ),
            card(
                { title: 'Wie der Tresor dich schützt', icon: 'shield' },
                h(
                    'ul',
                    { class: 'learn' },
                    [
                        'Verschlüsselt mit AES-256-GCM und an Objekt + Namen gebunden – ein kopierter Eintrag taugt woanders nichts.',
                        'Der Hauptschlüssel liegt nur in der .env des Servers, nie in der Datenbank.',
                        'Keine Route gibt einen Wert zurück – auch nicht an Besitzer (red/blue).',
                        'Eine SSF liest nur ihre EIGENEN Schlüssel.',
                        'Taucht ein gelesener Wert in der Antwort oder in einer Fehlermeldung auf, wird er zu *** geschwärzt.',
                        'Auch im Anfragen-Protokoll des Cockpits erscheint der gesendete Wert nur als ***.'
                    ].map(t => h('li', {}, t))
                )
            )
        );
        load();
    }
};
