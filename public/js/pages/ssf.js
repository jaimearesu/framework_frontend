// js/pages/ssf.js
// ---------------------------------------------------------------------
// SSF-STUDIO – Server-Funktionen schreiben, ausführen und lernen
//
//   oben:    Spielwiese (fertige Test-Umgebung) + Auswahl der SSF
//   links:   Code-Editor, darunter "Aufruf" (Body, Ziel, als wer)
//            und das Ergebnis (JSON, HTML-Vorschau, Fehler mit Tipp)
//   rechts:  Beispiele · Werkzeuge · Grenzen
//
// So läuft eine Ausführung:
//   1. Code wird im Objekt gespeichert (Code-Art "ssf") – der Server führt
//      immer den GESPEICHERTEN Code aus, nie den aus dem Browser.
//   2. POST /api/functions/<uuid>/executions  (mit Body)
//      oder GET /api/functions/<uuid>/target/<ziel>
//   3. Antwort: 200 { result } oder 422 { error, details }
//
// Adresse: /#/ssf/<uuid der SSF>
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { isTestMode } from '../core/config.js';
import { href } from '../core/routes.js';
import {
    h,
    mount,
    card,
    badge,
    spinner,
    callout,
    toast,
    tabs,
    field,
    busyButton,
    jsonView,
    resultLine,
    copyButton
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { createEditor } from '../core/editor.js';
import { formatMs, formatDate } from '../core/format.js';
import { buildPreviewDocument, createPreviewFrame, previewConsole } from '../core/preview.js';
import {
    loadObjects,
    loadObjectNames,
    buildObjectForest,
    objectLabel,
    loadCode,
    saveCode,
    invalidateObjects
} from '../core/objects.js';
import { EXAMPLES, fillExample } from '../ssf/examples.js';
import { TOOLS, TOOL_GROUPS, LIMITS } from '../ssf/reference.js';
import { explainError, explainStatus } from '../ssf/hints.js';
import { getPlayground, checkPlayground, createPlayground, forgetPlayground, CHILDREN } from '../ssf/playground.js';

const LEVEL_TONE = { Einstieg: 'ok', Fortgeschritten: 'accent', Profi: 'warn' };

// Verlauf der letzten Ausführungen (bleibt beim Seitenwechsel erhalten)
const history = [];

export default {
    async render(root, { params }) {
        let cleanupFns = [];
        const cleanup = () => cleanupFns.forEach(fn => fn());

        root.append(
            pageHeader({
                intro: 'Server-Funktionen (SSF) laufen abgeschottet in einer Sandbox – mit den Rechten des SSF-Objekts, nicht mit denen des Besuchers. Hier schreibst du sie, führst sie aus und lernst aus 9 Beispielen.'
            })
        );

        const res = await loadObjects();
        if (!res.ok) {
            root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
            return cleanup;
        }
        const objects = res.data;
        await loadObjectNames(objects);

        // ==========================================================
        // SPIELWIESE + AUSWAHL
        // ==========================================================
        let pg = getPlayground();
        if (pg && !checkPlayground(pg, objects)) {
            forgetPlayground(); // gibt es nicht mehr (z.B. Test-DB geleert)
            pg = null;
        }
        const selectedUuid = params[0] || pg?.uuids?.funktion || null;
        const selected = objects.find(o => o.uuid === selectedUuid) || null;

        const setupLog = h('div', { class: 'steps-log' });
        const playgroundCard = card(
            {
                title: 'Spielwiese',
                icon: 'flask',
                subtitle: pg
                    ? `„${pg.domain}“ – angelegt ${formatDate(pg.createdAt)}`
                    : 'Eine fertige Umgebung, in der alle Beispiele sofort laufen.'
            },
            pg
                ? h(
                      'div',
                      { class: 'stack-s' },
                      h(
                          'div',
                          { class: 'chip-list' },
                          h('a', { class: 'chip', href: href('objekte', pg.uuids.root) }, pg.domain),
                          CHILDREN.map(c => h('a', { class: 'chip', href: href('objekte', pg.uuids[c]) }, c))
                      ),
                      h(
                          'p',
                          { class: 'muted small' },
                          'Die SSF „funktion“ ist ein Kind der Domain und darf darum alle Geschwister lesen und beschreiben. In den Beispielen heisst die Domain ',
                          h('code', {}, pg.domain),
                          '.'
                      )
                  )
                : h(
                      'div',
                      { class: 'stack-s' },
                      h(
                          'p',
                          { class: 'small' },
                          'Legt an: eine Domain mit den Kindern ',
                          CHILDREN.map((c, i) => [i ? ', ' : '', h('code', {}, c)]),
                          ', 10 Produkte, 10 Lager-Einträge und eine Relation für Joins.'
                      ),
                      !isTestMode()
                          ? callout(
                                'warn',
                                'Du bist im Live-Modus.',
                                ' Die Spielwiese landet dann in deiner echten Datenbank. Empfohlen: oben rechts auf „Test“ schalten.'
                            )
                          : null,
                      h(
                          'div',
                          {},
                          busyButton(
                              'Spielwiese einrichten',
                              async () => {
                                  mount(setupLog);
                                  try {
                                      const made = await createPlayground({
                                          step: (text, r) =>
                                              setupLog.append(h('div', { class: 'muted small' }, text), resultLine(r))
                                      });
                                      toast(`Spielwiese „${made.domain}“ ist bereit.`, 'ok');
                                      location.hash = href('ssf', made.uuids.funktion);
                                  } catch (err) {
                                      setupLog.append(callout('error', 'Abgebrochen:', ' ', err.message));
                                  }
                              },
                              { className: 'btn primary', iconName: 'flask' }
                          )
                      ),
                      setupLog
                  )
        );

        // Auswahl der SSF (jedes Objekt kann SSF-Code tragen)
        const picker = h('select', { class: 'input', 'aria-label': 'SSF-Objekt wählen' });
        picker.append(h('option', { value: '' }, '— Objekt mit SSF wählen —'));
        const addOptions = (nodes, depth) =>
            nodes.forEach(n => {
                picker.append(
                    h(
                        'option',
                        { value: n.object.uuid, selected: n.object.uuid === selectedUuid },
                        `${'   '.repeat(depth)}${depth ? '└ ' : ''}${objectLabel(n.object)}`
                    )
                );
                addOptions(n.children, depth + 1);
            });
        addOptions(buildObjectForest(objects), 0);
        picker.addEventListener('change', () => {
            if (picker.value) location.hash = href('ssf', picker.value);
        });

        root.append(
            h(
                'div',
                { class: 'grid-2' },
                playgroundCard,
                card(
                    { title: 'Welche SSF?', icon: 'bolt', subtitle: 'Jedes Objekt kann eine Server-Funktion tragen.' },
                    picker,
                    selected
                        ? h(
                              'div',
                              { class: 'row gap-s wrap small' },
                              h('span', { class: 'muted' }, 'UUID'),
                              h('code', {}, selected.uuid),
                              copyButton(selected.uuid, 'UUID kopieren'),
                              h('a', { href: href('objekte', selected.uuid) }, 'Objekt ansehen')
                          )
                        : h(
                              'p',
                              { class: 'muted small' },
                              'Tipp: Richte die Spielwiese ein – dann ist „funktion“ automatisch gewählt.'
                          )
                )
            )
        );

        if (!selected) {
            if (selectedUuid) root.append(callout('warn', 'Objekt nicht gefunden', ' oder keine Leserechte.'));
            root.append(renderSidePanel({ onLoadExample: null, onInsert: null }));
            return cleanup;
        }

        // ==========================================================
        // EDITOR
        // ==========================================================
        const loaded = await loadCode(selected.uuid);
        let savedCode = loaded.code.ssf ?? '';
        let currentExample = null;

        const editorBox = h('div', { class: 'editor-box' });
        const dirtyBadge = h('span', { class: 'badge warn', hidden: true }, 'ungespeichert');
        const exampleBadge = h('span');
        const saveOut = h('div', { class: 'save-out' });
        const saveBtn = busyButton('Speichern', () => saveSsf(), { className: 'btn', iconName: 'check' });
        const runBtn = busyButton('Speichern & Ausführen', () => saveAndRun(), {
            className: 'btn primary',
            iconName: 'bolt'
        });

        // ---------- Aufruf ----------
        let mode = 'post';
        const bodyBox = h('div', { class: 'editor-box small-editor' });
        const presetBox = h('div', { class: 'chip-list' });
        const targetInput = h('input', { class: 'input mono', placeholder: 'UUID oder Text, z.B. produkte-123' });
        const anonymous = h('input', { type: 'checkbox' });
        const postFields = h(
            'div',
            { class: 'stack-s' },
            h('div', { class: 'row gap-s wrap' }, h('span', { class: 'field-label' }, 'Body (JSON)'), presetBox),
            bodyBox
        );
        const targetFields = h(
            'div',
            { class: 'stack-s', hidden: true },
            field(
                'Ziel (target)',
                targetInput,
                'Kommt in requestContext.target an. Aufruf: GET /api/functions/<uuid>/target/<ziel>'
            )
        );
        const modeTabs = tabs(
            [
                { id: 'post', label: 'POST mit Body' },
                { id: 'target', label: 'GET mit Ziel' }
            ],
            {
                active: 'post',
                onChange: id => {
                    mode = id;
                    postFields.hidden = id !== 'post';
                    targetFields.hidden = id !== 'target';
                    bodyEditor?.refresh();
                }
            }
        );

        // ---------- Ergebnis ----------
        const resultBox = h('div', { class: 'run-result' });
        const historyBox = h('div', { class: 'run-history' });

        const mainCard = h(
            'section',
            { class: 'card code-main' },
            h(
                'div',
                { class: 'editor-toolbar' },
                h('strong', {}, objectLabel(selected)),
                exampleBadge,
                dirtyBadge,
                h('span', { class: 'grow' }),
                h('span', { class: 'muted small hide-s' }, 'Strg+Enter führt aus'),
                saveBtn,
                runBtn
            ),
            editorBox,
            saveOut,
            h(
                'div',
                { class: 'run-panel' },
                h('h3', { class: 'sub-title' }, 'Aufruf'),
                modeTabs,
                postFields,
                targetFields,
                h(
                    'label',
                    { class: 'check' },
                    anonymous,
                    h('span', {}, 'Als Fremder ausführen (ohne Cookies – zeigt, was ein anonymer Besucher bekommt)')
                )
            ),
            h('div', { class: 'run-panel' }, h('h3', { class: 'sub-title' }, 'Ergebnis'), resultBox, historyBox)
        );

        const layout = h('div', { class: 'code-layout ssf-layout' }, mainCard, h('div'));
        root.append(layout);

        const editor = await createEditor(editorBox, { value: savedCode, type: 'ssf', minHeight: '380px' });
        const bodyEditor = await createEditor(bodyBox, {
            value: JSON.stringify({ name: 'Jaime' }, null, 2),
            type: 'data',
            minHeight: '110px'
        });

        const isDirty = () => editor.getValue() !== savedCode;
        const updateDirty = () => {
            dirtyBadge.hidden = !isDirty();
        };
        editor.onChange(updateDirty);

        // Seitenleiste (Beispiele / Werkzeuge / Grenzen)
        layout.lastChild.replaceWith(
            renderSidePanel({
                onLoadExample: ex => loadExample(ex),
                onInsert: snippet => editor.insertText(snippet)
            })
        );

        // ---------- Beispiel laden ----------
        const setBody = body => bodyEditor.setValue(JSON.stringify(body ?? {}, null, 2));
        const renderPresets = ex => {
            mount(
                presetBox,
                ex?.presets
                    ? Object.entries(ex.presets).map(([label, body]) =>
                          h('button', { class: 'chip', type: 'button', onclick: () => setBody(body) }, label)
                      )
                    : null
            );
        };
        const loadExample = ex => {
            if (isDirty() && !confirm('Der aktuelle Code ist nicht gespeichert. Trotzdem das Beispiel laden?')) return;
            const shop = pg?.domain || 'meine-domain';
            editor.setValue(fillExample(ex.code, { shop }));
            updateDirty();
            setBody(ex.body);
            renderPresets(ex);
            currentExample = ex;
            mount(exampleBadge, badge(`Beispiel: ${ex.title}`, 'accent'));
            modeTabs.select('post');
            if (!pg && ex.code.includes('{{SHOP}}'))
                toast('Tipp: Richte zuerst die Spielwiese ein – dieses Beispiel braucht ihre Daten.', 'info', 5000);
            else toast(`„${ex.title}“ geladen. Jetzt „Speichern & Ausführen“.`, 'ok');
            editorBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        // ---------- Speichern ----------
        const saveSsf = async () => {
            const code = editor.getValue();
            if (!code.trim()) {
                mount(saveOut, callout('warn', 'Leerer Code', ' kann nicht gespeichert werden.'));
                return false;
            }
            if (!isDirty()) return true;
            const r = await saveCode(selected.uuid, [{ type: 'ssf', code }]);
            if (!r.ok) {
                mount(
                    saveOut,
                    resultLine(r),
                    r.data?.details ? h('pre', { class: 'json' }, String(r.data.details)) : null,
                    explainError(`${r.error} ${r.data?.details || ''}`)
                        ? callout('info', 'Tipp:', ' ', explainError(`${r.error} ${r.data?.details || ''}`))
                        : null
                );
                return false;
            }
            savedCode = code;
            updateDirty();
            invalidateObjects();
            mount(
                saveOut,
                h('p', { class: 'muted small' }, `Gespeichert als Schritt ${r.data?.savedDetails?.step ?? '?'}.`)
            );
            return true;
        };

        // ---------- Ausführen ----------
        const run = async () => {
            let body;
            if (mode === 'post') {
                try {
                    body = JSON.parse(bodyEditor.getValue() || '{}');
                } catch (err) {
                    mount(resultBox, callout('error', 'Der Body ist kein gültiges JSON:', ' ', err.message));
                    return;
                }
            }
            const target = targetInput.value.trim();
            if (mode === 'target' && !target) {
                mount(resultBox, callout('warn', 'Bitte ein Ziel eingeben.', ''));
                return;
            }
            mount(resultBox, spinner('Die Sandbox rechnet …'));
            const opts = { anonymous: anonymous.checked };
            const r =
                mode === 'post'
                    ? await api.post(`/api/functions/${selected.uuid}/executions`, body, opts)
                    : await api.get(`/api/functions/${selected.uuid}/target/${encodeURIComponent(target)}`, opts);

            history.unshift({ at: new Date(), r, example: currentExample?.title, anonymous: opts.anonymous, mode });
            history.length = Math.min(history.length, 10);
            showResult(r);
            renderHistory();
        };

        const saveAndRun = async () => {
            if (await saveSsf()) await run();
        };

        let preview = null;
        const showResult = r => {
            preview?.destroy();
            preview = null;
            const result = r.data?.result;
            const details = r.data?.details;
            const message = r.ok ? null : `${r.error}${details ? ' – ' + details : ''}`;
            const tip = r.ok ? null : explainError(message) || explainStatus(r.status);

            // Liefert die SSF ein Feld "html"? -> als Seite anzeigen
            let htmlPart = null;
            if (r.ok && result && typeof result.html === 'string') {
                const pConsole = previewConsole();
                preview = createPreviewFrame({ onMessage: pConsole.add, height: '360px' });
                htmlPart = h(
                    'div',
                    { class: 'stack-s' },
                    h('div', { class: 'muted small' }, 'Feld „html“ als Seite:'),
                    preview.frame,
                    pConsole.el
                );
            }

            mount(
                resultBox,
                resultLine(r),
                !r.ok
                    ? h('div', { class: 'run-error' }, details ? h('pre', { class: 'json' }, String(details)) : null)
                    : null,
                tip ? callout('info', 'Tipp:', ' ', tip) : null,
                htmlPart,
                r.ok ? jsonView(result, { maxHeight: '420px' }) : null
            );
            if (preview) preview.show(buildPreviewDocument({ html: result.html }));
        };

        const renderHistory = () => {
            if (!history.length) return mount(historyBox);
            mount(
                historyBox,
                h('h4', { class: 'muted small' }, 'Letzte Ausführungen'),
                h(
                    'ul',
                    { class: 'history-list' },
                    history.map(e =>
                        h(
                            'li',
                            {},
                            h(
                                'button',
                                { type: 'button', class: 'history-item', onclick: () => showResult(e.r) },
                                h(
                                    'span',
                                    {
                                        class: `log-status ${e.r.ok ? 'ok' : e.r.status >= 500 || !e.r.status ? 'error' : 'warn'}`
                                    },
                                    e.r.status || '–'
                                ),
                                h('span', { class: 'grow' }, e.example || 'eigener Code'),
                                e.anonymous ? badge('als Fremder', 'neutral') : null,
                                h('span', { class: 'muted small' }, formatMs(e.r.ms)),
                                h('span', { class: 'muted small' }, e.at.toLocaleTimeString('de-CH'))
                            )
                        )
                    )
                )
            );
        };
        renderHistory();

        if (!savedCode.trim()) {
            mount(
                saveOut,
                callout(
                    'info',
                    'Noch kein SSF-Code in diesem Objekt',
                    ' (oder du hast kein red darauf – dann bleibt er unsichtbar). Lade rechts ein Beispiel.'
                )
            );
        }

        // Strg+Enter = speichern & ausführen, Strg+S = speichern
        const onKey = e => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                runBtn.click();
            } else if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveBtn.click();
            }
        };
        document.addEventListener('keydown', onKey);
        const onBeforeUnload = e => {
            if (isDirty()) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        cleanupFns = [
            () => document.removeEventListener('keydown', onKey),
            () => window.removeEventListener('beforeunload', onBeforeUnload),
            () => preview?.destroy()
        ];
        return cleanup;
    }
};

// ==================================================================
// SEITENLEISTE: Beispiele · Werkzeuge · Grenzen
// ==================================================================
const renderSidePanel = ({ onLoadExample, onInsert }) => {
    const body = h('div', { class: 'tab-body' });

    const showExamples = () =>
        mount(
            body,
            !onLoadExample
                ? callout(
                      'info',
                      'Erst oben eine SSF wählen',
                      ' (oder die Spielwiese einrichten), dann kannst du Beispiele laden.'
                  )
                : null,
            EXAMPLES.map((ex, i) =>
                h(
                    'article',
                    { class: 'example' },
                    h(
                        'div',
                        { class: 'example-head' },
                        h('span', { class: 'example-n' }, String(i + 1)),
                        h(
                            'div',
                            { class: 'grow' },
                            h('strong', {}, ex.title),
                            h('p', { class: 'muted small' }, ex.summary)
                        ),
                        badge(ex.level, LEVEL_TONE[ex.level])
                    ),
                    h(
                        'details',
                        {},
                        h('summary', { class: 'small' }, 'Was du lernst'),
                        h(
                            'ul',
                            { class: 'learn' },
                            ex.learn.map(t => h('li', {}, t))
                        )
                    ),
                    h(
                        'div',
                        { class: 'row gap-s wrap' },
                        ex.tools.map(t => h('code', { class: 'tool-chip' }, t.startsWith('alles') ? t : `api.${t}`)),
                        h('span', { class: 'grow' }),
                        onLoadExample
                            ? h(
                                  'button',
                                  { class: 'btn small', type: 'button', onclick: () => onLoadExample(ex) },
                                  icon('arrowRight', { size: 15 }),
                                  'Laden'
                              )
                            : null
                    )
                )
            )
        );

    const showTools = () =>
        mount(
            body,
            h(
                'p',
                { class: 'muted small' },
                'Alle Werkzeuge rufst du mit await auf. „ziel“ ist eine UUID oder ein Pfad. Die Rolle ist die, die die SSF auf dem Ziel braucht.'
            ),
            TOOL_GROUPS.map(g =>
                h(
                    'div',
                    { class: 'tool-group' },
                    h('h3', { class: 'sub-title' }, g.title, h('span', { class: 'muted small' }, ` – ${g.text}`)),
                    TOOLS.filter(t => t.group === g.id).map(t =>
                        h(
                            'details',
                            { class: 'tool' },
                            h(
                                'summary',
                                {},
                                h('code', { class: 'tool-name' }, `api.${t.name}`),
                                h('span', { class: 'muted small tool-sig' }, `(${t.signature})`)
                            ),
                            h(
                                'div',
                                { class: 'tool-body' },
                                h('p', { class: 'small' }, t.text),
                                h(
                                    'div',
                                    { class: 'row gap-s wrap small' },
                                    h('span', { class: 'muted' }, 'Rolle:'),
                                    ['black', 'red', 'blue'].includes(t.role.split(' ')[0])
                                        ? h('span', { class: `role ${t.role.split(' ')[0]}` }, t.role)
                                        : h('span', {}, t.role),
                                    t.budget
                                        ? [h('span', { class: 'muted' }, 'Kontingent:'), h('span', {}, t.budget)]
                                        : null
                                ),
                                h(
                                    'div',
                                    { class: 'small' },
                                    h('span', { class: 'muted' }, 'Rückgabe: '),
                                    h('code', {}, t.returns)
                                ),
                                h('pre', { class: 'json' }, t.snippet),
                                onInsert
                                    ? h(
                                          'button',
                                          { class: 'btn small', type: 'button', onclick: () => onInsert(t.snippet) },
                                          icon('code', { size: 15 }),
                                          'In den Editor einfügen'
                                      )
                                    : null
                            )
                        )
                    )
                )
            )
        );

    const showLimits = () =>
        mount(
            body,
            h(
                'p',
                { class: 'muted small' },
                'Jede Ausführung hat feste Grenzen. Wird eine überschritten, stoppt der Server die SSF sofort – der Rest des Systems läuft weiter.'
            ),
            h(
                'dl',
                { class: 'info-list' },
                LIMITS.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])
            ),
            h('h3', { class: 'sub-title' }, 'Sicherheit in einem Satz'),
            h(
                'ul',
                { class: 'learn' },
                [
                    'Die SSF handelt mit IHREN Rechten – der Besucher braucht nur black auf die SSF.',
                    'Ihre Identität setzt der Server; Code kann sie weder sehen noch fälschen.',
                    'In der Sandbox gibt es kein process, require, Dateisystem oder Netzwerk – nur api.',
                    'Den SSF-Code sieht nur, wer red auf dem Objekt hat.',
                    'Fehler im Server zeigen nur eine Fehler-ID, nie interne Details.'
                ].map(t => h('li', {}, t))
            )
        );

    const panelTabs = tabs(
        [
            { id: 'beispiele', label: 'Beispiele', badge: EXAMPLES.length },
            { id: 'werkzeuge', label: 'Werkzeuge', badge: TOOLS.length },
            { id: 'grenzen', label: 'Grenzen' }
        ],
        {
            active: 'beispiele',
            onChange: id => (id === 'beispiele' ? showExamples() : id === 'werkzeuge' ? showTools() : showLimits())
        }
    );
    showExamples();
    return h('aside', { class: 'card code-side-card ssf-side' }, h('div', { class: 'code-side' }, panelTabs, body));
};
