// js/pages/data.js
// ---------------------------------------------------------------------
// DATEN & SUCHE
//
// Jedes Objekt kann beliebig viele Datensätze (JSON) speichern.
//   Reiter "Suche":       Such-Spielplatz für die Query-DSL mit Beispielen,
//                         Tabelle oder JSON, Blättern vor/zurück, Löschen
//   Reiter "Neu anlegen": Datensätze als JSON speichern, Testdaten erzeugen
//
// Routen im Backend:
//   POST   /api/core-data/search/<uuid>?limit=&cursorValue=&cursorId=&direction=   Body: Abfrage
//   POST   /api/core-data/<uuid>                  Body: { data: {…} | [{…}, …] }
//   DELETE /api/core-data/<uuid>/record/<id>
//
// Adresse: /#/daten/<uuid>
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import {
    h,
    mount,
    card,
    callout,
    toast,
    tabs,
    busyButton,
    jsonView,
    resultLine,
    badge,
    spinner,
    field
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { createEditor } from '../core/editor.js';
import { formatNumber, formatMs } from '../core/format.js';
import { loadObjects, loadObjectNames } from '../core/objects.js';
import { objectPicker } from '../core/picker.js';
import { recordsTable } from '../core/table.js';
import { DSL_EXAMPLES, DSL_GROUPS, DSL_OPERATORS, makeTestProducts } from '../data/dslExamples.js';
import { getPlayground } from '../ssf/playground.js';

// Anzeige "123 Treffer" bzw. "mehr als 10'000"
const countText = meta =>
    meta?.total_count_capped ? `mehr als ${formatNumber(meta.total_count)}` : formatNumber(meta?.total_count ?? 0);

export default {
    async render(root, { params }) {
        root.append(
            pageHeader({
                intro: 'Jedes Objekt kann Datensätze speichern – freie JSON-Objekte wie { name, preis }. Hier suchst du mit der Such-Sprache (DSL), blätterst und legst neue an.'
            })
        );

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);

        // Standard: die Produkte der Spielwiese (dort passen alle Beispiele)
        const pg = getPlayground();
        const uuid = params[0] || (pg && objects.some(o => o.uuid === pg.uuids?.produkte) ? pg.uuids.produkte : null);
        const obj = objects.find(o => o.uuid === uuid) || null;

        root.append(
            h(
                'div',
                { class: 'code-picker card' },
                h('span', { class: 'card-icon' }, icon('database')),
                h(
                    'div',
                    { class: 'grow' },
                    objectPicker({ objects, selected: uuid, onSelect: id => id && (location.hash = href('daten', id)) })
                ),
                obj
                    ? h(
                          'a',
                          { class: 'btn ghost', href: href('objekte', obj.uuid) },
                          icon('arrowRight', { size: 16 }),
                          'Objekt ansehen'
                      )
                    : null
            )
        );

        if (!obj) {
            root.append(
                card(
                    {},
                    callout(
                        'info',
                        'Wähle oben ein Objekt.',
                        ' Tipp: Die Spielwiese im ',
                        h('a', { href: href('ssf') }, 'SSF-Studio'),
                        ' legt „produkte“ mit 10 Datensätzen an – dazu passen alle Such-Beispiele.'
                    )
                )
            );
            return;
        }

        const body = h('div', { class: 'tab-body' });
        const mainTabs = tabs(
            [
                { id: 'suche', label: 'Suche' },
                { id: 'neu', label: 'Neu anlegen' }
            ],
            { active: 'suche', onChange: id => (id === 'suche' ? renderSearch() : renderInsert()) }
        );
        root.append(h('section', { class: 'card pad-card' }, mainTabs, body));

        // ==========================================================
        // SUCHE
        // ==========================================================
        let queryEditor = null;
        const renderSearch = async () => {
            const editorBox = h('div', { class: 'editor-box small-editor' });
            const limitInput = h('input', {
                class: 'input small',
                type: 'number',
                min: 1,
                max: 500,
                value: 5,
                style: { width: '90px' }
            });
            const anonymous = h('input', { type: 'checkbox' });
            const viewTabs = h('div');
            const out = h('div', { class: 'stack-s' });
            let view = 'tabelle';
            let last = null; // letzte Antwort
            let page = 1;

            // Beispiele nach Gruppen
            const exampleList = h(
                'div',
                { class: 'dsl-examples' },
                DSL_GROUPS.map(g =>
                    h(
                        'div',
                        { class: 'dsl-group' },
                        h('div', { class: 'nav-group-title' }, g),
                        DSL_EXAMPLES.filter(e => e.group === g).map(e =>
                            h(
                                'button',
                                {
                                    class: 'dsl-example',
                                    type: 'button',
                                    title: e.text,
                                    onclick: () => {
                                        queryEditor.setValue(JSON.stringify(e.query, null, 2));
                                        mount(explain, callout('info', e.title + ':', ' ', e.text));
                                        search('first');
                                    }
                                },
                                e.title
                            )
                        )
                    )
                )
            );
            const explain = h('div');

            mount(
                body,
                h(
                    'div',
                    { class: 'data-layout' },
                    h(
                        'div',
                        { class: 'stack-s' },
                        h('div', { class: 'field-label' }, 'Abfrage (JSON)'),
                        editorBox,
                        explain,
                        h(
                            'div',
                            { class: 'row gap-s wrap' },
                            field('Pro Seite', limitInput),
                            h(
                                'label',
                                { class: 'check', style: { marginTop: '20px' } },
                                anonymous,
                                h('span', {}, 'als Fremder')
                            ),
                            h('span', { class: 'grow' }),
                            busyButton('Suchen', () => search('first'), {
                                className: 'btn primary',
                                iconName: 'search'
                            })
                        )
                    ),
                    h(
                        'div',
                        { class: 'stack-s' },
                        h('div', { class: 'field-label' }, 'Beispiele (Klick = laden und suchen)'),
                        exampleList,
                        h(
                            'details',
                            { class: 'raw' },
                            h('summary', {}, 'Alle Operatoren'),
                            h(
                                'dl',
                                { class: 'info-list' },
                                DSL_OPERATORS.map(([k, v]) => [h('dt', {}, h('code', {}, k)), h('dd', {}, v)])
                            )
                        )
                    )
                ),
                h('div', { class: 'results-head' }, viewTabs),
                out
            );

            queryEditor = await createEditor(editorBox, { value: '{}', type: 'data', minHeight: '200px' });

            // --- Suchen / Blättern ---
            const search = async mode => {
                let query;
                try {
                    query = JSON.parse(queryEditor.getValue() || '{}');
                } catch (err) {
                    mount(out, callout('error', 'Die Abfrage ist kein gültiges JSON:', ' ', err.message));
                    return;
                }
                const qs = { limit: Number(limitInput.value) || 5 };
                if (mode === 'next' && last?.data?.meta?.cursors?.last) {
                    qs.cursorValue = last.data.meta.cursors.last.value;
                    qs.cursorId = last.data.meta.cursors.last.id;
                    qs.direction = 'next';
                } else if (mode === 'prev' && last?.data?.meta?.cursors?.first) {
                    qs.cursorValue = last.data.meta.cursors.first.value;
                    qs.cursorId = last.data.meta.cursors.first.id;
                    qs.direction = 'prev';
                }
                mount(out, spinner('Suche …'));
                const r = await api.post(`/api/core-data/search/${obj.uuid}`, query, {
                    query: qs,
                    anonymous: anonymous.checked
                });
                if (mode === 'first') page = 1;
                else if (r.ok && mode === 'next') page++;
                else if (r.ok && mode === 'prev') page = Math.max(1, page - 1);
                last = r;
                showResult();
            };

            const deleteRecord = async record => {
                if (!confirm(`Datensatz ${record._sys_id} wirklich löschen?`)) return;
                const r = await api.del(`/api/core-data/${obj.uuid}/record/${record._sys_id}`);
                if (!r.ok) return toast(r.error, 'error');
                toast('Gelöscht.', 'ok');
                search('first');
            };

            const showResult = () => {
                const r = last;
                if (!r.ok) {
                    mount(
                        out,
                        resultLine(r),
                        r.status === 403 && anonymous.checked
                            ? callout('info', 'Richtig so:', ' Ein Fremder hat keine Rechte auf diese Daten.')
                            : null
                    );
                    mount(viewTabs);
                    return;
                }
                const { data, meta } = r.data;
                const limit = meta.limit;
                mount(
                    viewTabs,
                    tabs(
                        [
                            { id: 'tabelle', label: 'Tabelle' },
                            { id: 'json', label: 'JSON' },
                            { id: 'meta', label: 'meta' }
                        ],
                        {
                            active: view,
                            onChange: id => {
                                view = id;
                                showResult();
                            }
                        }
                    )
                );
                const pager = h(
                    'div',
                    { class: 'pager' },
                    h(
                        'button',
                        { class: 'btn small', type: 'button', disabled: page <= 1, onclick: () => search('prev') },
                        '← zurück'
                    ),
                    h('span', { class: 'small' }, `Seite ${page}`),
                    h(
                        'button',
                        {
                            class: 'btn small',
                            type: 'button',
                            // weiter geht es nur, wenn die Seite voll war
                            disabled: meta.returned_count < limit,
                            onclick: () => search('next')
                        },
                        'weiter →'
                    )
                );
                mount(
                    out,
                    h(
                        'div',
                        { class: 'row gap-s wrap' },
                        badge(`${countText(meta)} Treffer`, 'accent'),
                        badge(`${meta.returned_count} auf dieser Seite`, 'neutral'),
                        h('span', { class: 'muted small' }, formatMs(r.ms)),
                        h('span', { class: 'grow' }),
                        pager
                    ),
                    meta.total_count_capped
                        ? callout(
                              'info',
                              'Gezählt wird höchstens bis 10’000',
                              ' – das hält die Suche auch bei Millionen Einträgen schnell.'
                          )
                        : null,
                    !data.length
                        ? h('p', { class: 'muted pad' }, 'Keine Treffer.')
                        : view === 'tabelle'
                          ? recordsTable(data, { onDelete: deleteRecord })
                          : view === 'json'
                            ? jsonView(data, { maxHeight: '520px' })
                            : h(
                                  'div',
                                  { class: 'stack-s' },
                                  h(
                                      'p',
                                      { class: 'muted small' },
                                      'meta beschreibt die Antwort. cursors.first/last sind Lesezeichen fürs Blättern – unverändert als cursorValue/cursorId zurückschicken.'
                                  ),
                                  jsonView(meta)
                              )
                );
            };

            // Strg+Enter im Abfrage-Editor = suchen
            editorBox.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    search('first');
                }
            });
            search('first');
        };

        // ==========================================================
        // NEU ANLEGEN
        // ==========================================================
        const renderInsert = async () => {
            const editorBox = h('div', { class: 'editor-box small-editor' });
            const out = h('div', { class: 'stack-s' });
            const countInput = h('input', {
                class: 'input small',
                type: 'number',
                min: 1,
                max: 500,
                value: 50,
                style: { width: '90px' }
            });
            mount(
                body,
                h(
                    'p',
                    { class: 'muted small' },
                    'Ein Datensatz ist ein JSON-Objekt. Eine Liste [ … ] speichert mehrere auf einmal (alles oder nichts). Felder mit _sys_ sind reserviert.'
                ),
                editorBox,
                h(
                    'div',
                    { class: 'row gap-s wrap' },
                    busyButton(
                        'Speichern',
                        async () => {
                            let data;
                            try {
                                data = JSON.parse(editor.getValue());
                            } catch (err) {
                                mount(out, callout('error', 'Kein gültiges JSON:', ' ', err.message));
                                return;
                            }
                            const r = await api.post(`/api/core-data/${obj.uuid}`, { data });
                            mount(out, resultLine(r), r.ok ? jsonView(r.data, { maxHeight: '220px' }) : null);
                            if (r.ok) toast('Gespeichert.', 'ok');
                        },
                        { className: 'btn primary', iconName: 'check' }
                    ),
                    h('span', { class: 'grow' }),
                    h('span', { class: 'muted small' }, 'Testdaten:'),
                    countInput,
                    h(
                        'button',
                        {
                            class: 'btn',
                            type: 'button',
                            onclick: () => {
                                const n = Math.min(Math.max(Number(countInput.value) || 50, 1), 500);
                                editor.setValue(JSON.stringify(makeTestProducts(n), null, 2));
                            }
                        },
                        icon('layers', { size: 15 }),
                        'Zufällige Produkte erzeugen'
                    )
                ),
                out
            );
            const editor = await createEditor(editorBox, {
                value: JSON.stringify(
                    { sku: 'NEU-01', name: 'Neues Produkt', kategorie: 'Kleider', preis: 42 },
                    null,
                    2
                ),
                type: 'data',
                minHeight: '220px'
            });
        };

        renderSearch();
    }
};
