// js/pages/relations.js
// ---------------------------------------------------------------------
// RELATIONEN – Verbindungen zwischen Objekten
//
// Eine Relation ist ein Pfeil mit einem Namen (Typ):
//     produkte ──"lager"──▶ lager
// Wozu? Die Suche kann über diesen Typ verknüpfte Daten dazuholen (Joins):
//     { joins: [{ relationType: 'lager', sourceKey: 'sku', targetKey: 'sku' }] }
//
// Routen:  GET  /api/relations/<uuid>   (black)   -> alle Pfeile von UND zu diesem Objekt
//          POST /api/relations/<quelle> (red auf Quelle UND Ziel)  { targetUuid, relationType }
// Löschen gibt es im Backend (noch) nicht.
//
// Adresse: /#/relationen/<uuid>
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import {
    h,
    mount,
    card,
    callout,
    toast,
    busyButton,
    resultLine,
    badge,
    spinner,
    field,
    emptyState,
    codeBlock
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatDate, shortUuid } from '../core/format.js';
import { loadObjects, loadObjectNames, objectLabel } from '../core/objects.js';
import { objectPicker } from '../core/picker.js';

export default {
    async render(root, { params }) {
        root.append(
            pageHeader({
                intro: 'Relationen verbinden Objekte mit einem benannten Pfeil, z.B. produkte ──„lager“──▶ lager. Die Suche nutzt sie für Joins: verknüpfte Daten in einer Abfrage.'
            })
        );

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);
        const byUuid = new Map(objects.map(o => [o.uuid, o]));
        const nameOf = uuid => (byUuid.has(uuid) ? objectLabel(byUuid.get(uuid)) : shortUuid(uuid));
        const linkTo = uuid =>
            byUuid.has(uuid)
                ? h('a', { class: 'chip', href: href('relationen', uuid) }, nameOf(uuid))
                : h('span', { class: 'chip muted', title: `${uuid} – für dich nicht sichtbar` }, nameOf(uuid));

        const uuid = params[0] || null;
        const obj = byUuid.get(uuid) || null;

        root.append(
            h(
                'div',
                { class: 'code-picker card' },
                h('span', { class: 'card-icon' }, icon('link')),
                h(
                    'div',
                    { class: 'grow' },
                    objectPicker({
                        objects,
                        selected: uuid,
                        onSelect: id => id && (location.hash = href('relationen', id))
                    })
                )
            )
        );

        if (!obj) {
            root.append(
                card(
                    {},
                    emptyState({
                        icon: 'link',
                        title: 'Wähle oben ein Objekt',
                        text: 'Dann siehst du seine Verbindungen und kannst neue anlegen.'
                    })
                )
            );
            return;
        }

        // ---------- Liste ----------
        const listBox = h('div', {}, spinner());
        const load = async () => {
            mount(listBox, spinner());
            const r = await api.get(`/api/relations/${obj.uuid}`);
            if (!r.ok) return mount(listBox, resultLine(r));
            const rels = Array.isArray(r.data?.data) ? r.data.data : [];
            if (!rels.length)
                return mount(
                    listBox,
                    emptyState({ icon: 'link', title: 'Keine Relationen', text: 'Lege unten die erste an.' })
                );
            const outgoing = rels.filter(x => x.source === obj.uuid);
            const incoming = rels.filter(x => x.source !== obj.uuid);
            const row = rel =>
                h(
                    'li',
                    { class: 'relation' },
                    linkTo(rel.source),
                    h('span', { class: 'rel-arrow' }, '──', h('code', {}, rel.relation_type), '──▶'),
                    linkTo(rel.target),
                    h('span', { class: 'grow' }),
                    h('span', { class: 'muted small' }, formatDate(rel.created_at))
                );
            mount(
                listBox,
                outgoing.length
                    ? [
                          h('h3', { class: 'sub-title' }, `Ausgehend (${outgoing.length})`),
                          h('ul', { class: 'relations' }, outgoing.map(row))
                      ]
                    : null,
                incoming.length
                    ? [
                          h('h3', { class: 'sub-title' }, `Eingehend (${incoming.length})`),
                          h('ul', { class: 'relations' }, incoming.map(row))
                      ]
                    : null
            );
        };

        // ---------- Neu ----------
        const typeInput = h('input', { class: 'input', placeholder: 'z.B. lager, autor, gehoert_zu', maxlength: 100 });
        let targetUuid = null;
        const targetPicker = objectPicker({
            objects: objects.filter(o => o.uuid !== obj.uuid),
            placeholder: '— Ziel wählen —',
            onSelect: id => (targetUuid = id)
        });
        const out = h('div');

        root.append(
            h(
                'div',
                { class: 'grid-2' },
                card({ title: `Verbindungen von „${objectLabel(obj)}“`, icon: 'link' }, listBox),
                card(
                    {
                        title: 'Neue Relation',
                        icon: 'arrowRight',
                        subtitle: 'Du brauchst red auf der Quelle UND auf dem Ziel.'
                    },
                    h(
                        'div',
                        { class: 'relation preview-rel' },
                        badge(objectLabel(obj), 'accent'),
                        h('span', { class: 'rel-arrow' }, '── Typ ──▶'),
                        badge('Ziel', 'neutral')
                    ),
                    field('Ziel-Objekt', targetPicker),
                    field(
                        'Typ (Name des Pfeils)',
                        typeInput,
                        'Über diesen Namen findet die Suche die Verbindung (relationType).'
                    ),
                    h(
                        'div',
                        {},
                        busyButton(
                            'Verbinden',
                            async () => {
                                const relationType = typeInput.value.trim();
                                if (!targetUuid || !relationType) return toast('Bitte Ziel und Typ angeben.', 'error');
                                const r = await api.post(`/api/relations/${obj.uuid}`, { targetUuid, relationType });
                                mount(out, resultLine(r));
                                if (r.ok) {
                                    toast('Relation angelegt.', 'ok');
                                    typeInput.value = '';
                                    load();
                                }
                            },
                            { className: 'btn primary', iconName: 'link' }
                        )
                    ),
                    out
                )
            ),
            card(
                { title: 'So nutzt du sie in der Suche (Join)', icon: 'search' },
                h(
                    'p',
                    { class: 'small' },
                    'Sucht man in der Quelle, holt ein Join die passenden Datensätze aus dem Ziel dazu. Beispiel mit der Spielwiese:'
                ),
                codeBlock(
                    JSON.stringify(
                        {
                            joins: [
                                { relationType: 'lager', as: 'lager', sourceKey: 'sku', targetKey: 'sku', single: true }
                            ]
                        },
                        null,
                        2
                    ),
                    { label: 'Abfrage in „produkte“' }
                ),
                h(
                    'ul',
                    { class: 'learn' },
                    [
                        'relationType – welcher Pfeil (von der Quelle aus)',
                        'as – unter welchem Namen die Daten angehängt werden',
                        'sourceKey / targetKey – welche Felder zusammengehören',
                        'single – ein Datensatz statt einer Liste',
                        'Joins prüfen die Rechte: du (bzw. die SSF) brauchst black auf dem Ziel. Bis zu 3 Ebenen tief.'
                    ].map(t => h('li', {}, t))
                ),
                h('a', { class: 'btn ghost small', href: href('daten') }, icon('search', { size: 15 }), 'Zur Suche')
            )
        );
        load();
    }
};
