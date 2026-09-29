// js/pages/code.js
// ---------------------------------------------------------------------
// CODE & DNA – den Inhalt eines Objekts bearbeiten
//
// Ein Objekt kann sechs Code-Arten tragen:
//   HTML · CSS · JavaScript  -> laufen im Browser des Besuchers
//   SSF                      -> Server-Funktion, läuft in der Sandbox
//   DNA (syntax)             -> woraus das Objekt besteht (Kinder)
//   Daten (data)             -> frei wählbares JSON (z.B. Einstellungen)
//
// Das Backend speichert Code nicht als Text, sondern als AST (Baum-
// Darstellung) – dabei wird die Syntax automatisch geprüft. Fehler
// kommen als Meldung zurück (Status 422).
//
// Jedes Speichern legt EINEN neuen Schritt (Version) an. Darum speichern
// wir nur die Reiter, die du wirklich geändert hast – alle zusammen.
//
// Adresse: /#/code/<uuid>?typ=html
// ---------------------------------------------------------------------
import { href } from '../core/routes.js';
import {
    h,
    mount,
    card,
    spinner,
    emptyState,
    callout,
    toast,
    tabs,
    resultLine,
    busyButton,
    badge
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { createEditor } from '../core/editor.js';
import { analyzeDna, addChildToDna } from '../core/dna.js';
import { renderDnaTree } from '../core/tree.js';
import { buildPreviewDocument, createPreviewFrame, previewConsole } from '../core/preview.js';
import {
    loadObjects,
    loadObjectNames,
    invalidateObjects,
    buildObjectForest,
    objectLabel,
    objectFamily,
    childRefFor,
    loadCode,
    saveCode
} from '../core/objects.js';

const TYPES = [
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
    { id: 'javascript', label: 'JavaScript' },
    { id: 'ssf', label: 'SSF' },
    { id: 'syntax', label: 'DNA' },
    { id: 'data', label: 'Daten' }
];
const JSON_TYPES = ['syntax', 'data'];
const PREVIEW_TYPES = ['html', 'css', 'javascript'];

// Vorlagen für leere Reiter – zum schnellen Ausprobieren
const templates = o => ({
    html:
        '<main class="hallo">\n    <h1>Hallo at0mic</h1>\n    <p>Dieses HTML gehört zum Objekt „' +
        objectLabel(o) +
        '“.</p>\n    <button id="knopf">Klick mich</button>\n</main>\n',
    css: '.hallo {\n    font-family: system-ui, sans-serif;\n    max-width: 480px;\n    margin: 40px auto;\n}\n\n.hallo h1 {\n    color: #6d5dfc;\n}\n',
    javascript:
        "// Läuft im Browser des Besuchers\ndocument.getElementById('knopf')?.addEventListener('click', () => {\n    alert('Hallo aus dem JavaScript von at0mic!');\n});\n",
    ssf: "// Server-Funktion: läuft abgeschottet in der Sandbox – mit den Rechten DIESES Objekts.\n// requestContext enthält u.a.: body, query, target, userUuid\nconst { body, target } = requestContext;\n\nreturn {\n    hallo: 'Welt',\n    empfangen: body,\n    ziel: target,\n    zeit: new Date().toISOString()\n};\n",
    syntax: JSON.stringify(
        { type: 'instance', identifier: objectFamily(o), domain: objectFamily(o), source: o.path || ['0'] },
        null,
        2
    ),
    data: JSON.stringify({ titel: 'Mein Objekt', sprache: 'de', einstellungen: { farbe: '#6d5dfc' } }, null, 2)
});

export default {
    async render(root, { params, query }) {
        const uuid = params[0] || null;
        let activeType = TYPES.some(t => t.id === query.typ) ? query.typ : 'html';

        // ---------- Objekt-Auswahl ----------
        const picker = h('select', { class: 'input', 'aria-label': 'Objekt wählen' });
        const head = h(
            'div',
            { class: 'code-picker card' },
            h('span', { class: 'card-icon' }, icon('box')),
            h('div', { class: 'grow' }, picker),
            uuid
                ? h(
                      'a',
                      { class: 'btn ghost', href: href('objekte', uuid) },
                      icon('arrowRight', { size: 16 }),
                      'Objekt ansehen'
                  )
                : null
        );
        root.append(
            pageHeader({
                intro: 'Der Inhalt eines Objekts. Das Backend prüft beim Speichern die Syntax jeder Code-Art und legt eine neue Version an.'
            }),
            head
        );

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);

        // Auswahlliste mit Einrückung nach Baum
        picker.append(h('option', { value: '' }, objects.length ? '— Objekt wählen —' : '— keine Objekte —'));
        const addOptions = (nodes, depth) =>
            nodes.forEach(n => {
                picker.append(
                    h(
                        'option',
                        { value: n.object.uuid, selected: n.object.uuid === uuid },
                        `${'   '.repeat(depth)}${depth ? '└ ' : ''}${objectLabel(n.object)}`
                    )
                );
                addOptions(n.children, depth + 1);
            });
        addOptions(buildObjectForest(objects), 0);

        const obj = objects.find(o => o.uuid === uuid);
        if (!obj) {
            root.append(
                card(
                    {},
                    uuid
                        ? callout(
                              'warn',
                              'Objekt nicht gefunden.',
                              ' Es existiert nicht, oder du hast darauf keine Leserechte.'
                          )
                        : emptyState({
                              icon: 'code',
                              title: 'Wähle oben ein Objekt',
                              text: 'Dann kannst du seinen HTML-, CSS-, JS-, SSF-, DNA- und Daten-Code bearbeiten.'
                          })
                )
            );
            picker.addEventListener('change', () => picker.value && (location.hash = href('code', picker.value)));
            return;
        }

        // ---------- Code laden ----------
        const loadingBox = h('div', {}, spinner('Lade Code …'));
        root.append(loadingBox);
        const code = await loadCode(uuid);
        loadingBox.remove();
        if (!code.ok) return root.append(callout('error', 'Konnte Code nicht laden:', ' ', code.error));

        // Puffer je Code-Art: original (vom Server) und aktuell (im Editor)
        const buffers = {};
        for (const t of TYPES) buffers[t.id] = { original: code.code[t.id] ?? '', current: code.code[t.id] ?? '' };
        const dirtyTypes = () => TYPES.filter(t => buffers[t.id].current !== buffers[t.id].original).map(t => t.id);
        const current = () => Object.fromEntries(TYPES.map(t => [t.id, buffers[t.id].current]));

        // ---------- Gerüst ----------
        const tabBar = tabs(
            TYPES.map(t => ({ id: t.id, label: t.label })),
            { active: activeType, onChange: id => switchType(id) }
        );
        const editorBox = h('div', { class: 'editor-box' });
        const toolbar = h('div', { class: 'editor-toolbar' });
        const side = h('div', { class: 'code-side' });
        const saveOut = h('div', { class: 'save-out' });

        root.append(
            h(
                'div',
                { class: 'code-layout' },
                h('section', { class: 'card code-main' }, tabBar, toolbar, editorBox, saveOut),
                h('aside', { class: 'card code-side-card' }, side)
            )
        );

        const editor = await createEditor(editorBox, {
            value: buffers[activeType].current,
            type: activeType,
            minHeight: '420px'
        });
        if (editor.isFallback)
            toolbar.before(
                callout(
                    'warn',
                    'Einfacher Editor:',
                    ' Der Farb-Editor (CodeMirror) konnte nicht geladen werden – bist du offline?'
                )
            );

        // ---------- Reiter-Punkte (● = Inhalt, * = geändert) ----------
        const updateTabMarks = () => {
            for (const b of tabBar.children) {
                const t = b.dataset.tab;
                b.classList.toggle('has-content', Boolean(buffers[t].current.trim()));
                b.classList.toggle('dirty', buffers[t].current !== buffers[t].original);
            }
            const n = dirtyTypes().length;
            saveBtn.disabled = n === 0;
            saveBtn.querySelector('span').textContent = n ? `Speichern (${n})` : 'Gespeichert';
        };

        // ---------- Werkzeugleiste ----------
        const saveBtn = busyButton('Speichern', () => save(), { className: 'btn primary', iconName: 'check' });
        const toolbarExtras = h('div', { class: 'row gap-s wrap' });
        mount(
            toolbar,
            toolbarExtras,
            h('span', { class: 'grow' }),
            h('span', { class: 'muted small hide-s' }, 'Strg+S speichert'),
            saveBtn
        );

        const renderToolbarExtras = () => {
            const b = buffers[activeType];
            mount(
                toolbarExtras,
                !b.current.trim()
                    ? h(
                          'button',
                          {
                              class: 'btn small',
                              type: 'button',
                              onclick: () => {
                                  editor.setValue(templates(obj)[activeType]);
                                  b.current = editor.getValue();
                                  changed();
                              }
                          },
                          icon('layers', { size: 15 }),
                          'Vorlage einfügen'
                      )
                    : null,
                JSON_TYPES.includes(activeType)
                    ? h(
                          'button',
                          {
                              class: 'btn small',
                              type: 'button',
                              onclick: () => {
                                  try {
                                      editor.setValue(JSON.stringify(JSON.parse(editor.getValue()), null, 2));
                                      b.current = editor.getValue();
                                      changed();
                                  } catch {
                                      toast('Kein gültiges JSON – kann nicht formatieren.', 'error');
                                  }
                              }
                          },
                          '{ } Formatieren'
                      )
                    : null,
                b.current !== b.original
                    ? h(
                          'button',
                          {
                              class: 'btn small ghost',
                              type: 'button',
                              onclick: () => {
                                  editor.setValue(b.original);
                                  b.current = b.original;
                                  changed();
                              }
                          },
                          icon('history', { size: 15 }),
                          'Änderung verwerfen'
                      )
                    : null
            );
        };

        // ---------- Seitenleiste (je nach Code-Art) ----------
        let previewTimer = null;
        // Vorschau (siehe core/preview.js): abgeschotteter Rahmen + Fehleranzeige darunter
        const pConsole = previewConsole();
        const preview = createPreviewFrame({ onMessage: pConsole.add });
        const previewFrame = preview.frame;
        const updatePreview = () => {
            pConsole.clear();
            const b = current();
            preview.show(buildPreviewDocument({ html: b.html, css: b.css, js: b.javascript }));
        };

        const renderSide = () => {
            if (PREVIEW_TYPES.includes(activeType)) {
                mount(
                    side,
                    h('div', { class: 'side-head' }, h('h3', {}, 'Live-Vorschau'), badge('HTML + CSS + JS', 'accent')),
                    h(
                        'p',
                        { class: 'muted small' },
                        'Nur dieses Objekt, aktualisiert beim Tippen. Läuft abgeschottet – Anfragen ans Backend sind hier blockiert. Mit allen Kindern: beim Objekt unter „Vorschau“.'
                    ),
                    previewFrame,
                    pConsole.el
                );
                updatePreview();
                return;
            }
            if (activeType === 'ssf') {
                mount(
                    side,
                    h('div', { class: 'side-head' }, h('h3', {}, 'Server-Funktion'), badge('Sandbox', 'accent')),
                    h(
                        'ul',
                        { class: 'checklist' },
                        [
                            'Läuft auf dem Server in einer Sandbox: 64 MB, 1 s Rechenzeit, 5 s total.',
                            'Handelt mit den Rechten DIESES Objekts – nicht mit denen des Besuchers.',
                            'requestContext enthält body, query, target und userUuid.',
                            'Werkzeuge: api.data, api.objects, api.relations, api.roles, api.http, api.secrets.',
                            'Den Code sieht nur, wer red auf dem Objekt hat. Ausführen darf, wer black hat.'
                        ].map(t => h('li', {}, icon('arrowRight', { size: 16 }), h('span', {}, t)))
                    ),
                    callout(
                        'info',
                        'Ausführen & Beispiele:',
                        ' Im ',
                        h('a', { href: href('ssf', uuid) }, 'SSF-Studio'),
                        ' – mit 10 Beispielen und allen Werkzeugen.'
                    )
                );
                return;
            }
            if (activeType === 'syntax') {
                renderDnaSide();
                return;
            }
            // data
            const check = (() => {
                if (!buffers.data.current.trim()) return null;
                try {
                    JSON.parse(buffers.data.current);
                    return callout('ok', 'Gültiges JSON.', '');
                } catch (err) {
                    return callout('error', 'Kein gültiges JSON:', ' ', err.message);
                }
            })();
            mount(
                side,
                h('div', { class: 'side-head' }, h('h3', {}, 'Daten (JSON)')),
                h(
                    'p',
                    { class: 'muted small' },
                    'Frei wählbare Angaben zum Objekt, z.B. Einstellungen oder ein Schema. Das Backend prüft nur, ob es gültiges JSON ist. Datensätze (viele Einträge) gehören dagegen auf die Seite „Daten & Suche“.'
                ),
                check
            );
        };

        // DNA: Prüfung + Baum-Vorschau + "Kind einfügen"
        const knownDomains = [...new Set(objects.map(objectFamily))];
        const findObject = (domain, source) =>
            objects.find(o => objectFamily(o) === domain && JSON.stringify(o.path) === JSON.stringify(source)) || null;

        const renderDnaSide = () => {
            const a = analyzeDna(buffers.syntax.current, { knownDomains });
            const list = (items, tone) =>
                items.length
                    ? h(
                          'ul',
                          { class: `issues ${tone}` },
                          items.map(t => h('li', {}, t))
                      )
                    : null;

            // Kinder aus derselben Familie, die noch NICHT in der DNA stehen
            const referenced = new Set();
            const collect = n => {
                if (!n || typeof n !== 'object') return;
                referenced.add(`${n.domain}|${JSON.stringify(n.source)}`);
                (Array.isArray(n.children) ? n.children : []).forEach(collect);
            };
            if (a.value) collect(a.value);
            const candidates = objects.filter(
                c =>
                    c.uuid !== obj.uuid &&
                    objectFamily(c) === objectFamily(obj) &&
                    JSON.stringify((c.path || []).slice(0, -1)) === JSON.stringify(obj.path) &&
                    !referenced.has(`${objectFamily(c)}|${JSON.stringify(c.path)}`)
            );
            const candSelect = h(
                'select',
                { class: 'input small' },
                candidates.map(c => h('option', { value: c.uuid }, objectLabel(c)))
            );
            const candName = h('input', { class: 'input small', placeholder: 'identifier (Name)' });

            mount(
                side,
                h(
                    'div',
                    { class: 'side-head' },
                    h('h3', {}, 'DNA-Prüfung'),
                    a.ok ? badge('in Ordnung', 'ok') : badge(`${a.errors.length} Fehler`, 'error')
                ),
                a.errors.length
                    ? h(
                          'div',
                          {},
                          list(a.errors, 'error'),
                          a.line
                              ? h(
                                    'button',
                                    {
                                        class: 'btn small ghost',
                                        type: 'button',
                                        onclick: () => editor.goToLine(a.line)
                                    },
                                    `Zu Zeile ${a.line}`
                                )
                              : null
                      )
                    : null,
                list(a.warnings, 'warn'),
                list(a.notes, 'note'),
                a.value
                    ? h(
                          'div',
                          {},
                          h('h3', { class: 'sub-title' }, `Vorschau (${a.stats.nodes} Knoten, Tiefe ${a.stats.depth})`),
                          h(
                              'p',
                              { class: 'muted small' },
                              'So steht es in der DNA. Aufgelöst (mit dem Inhalt der Kinder) siehst du es beim Objekt unter „Baum“.'
                          ),
                          renderDnaTree(a.value, { findObject })
                      )
                    : null,
                h('h3', { class: 'sub-title' }, 'Kind einfügen'),
                !a.value
                    ? h('p', { class: 'muted small' }, 'Erst die DNA reparieren, dann kannst du Kinder einfügen.')
                    : candidates.length
                      ? h(
                            'div',
                            { class: 'stack-s' },
                            h(
                                'p',
                                { class: 'muted small' },
                                'Diese Kinder hängen an diesem Objekt, stehen aber noch nicht in der DNA:'
                            ),
                            candSelect,
                            candName,
                            h(
                                'button',
                                {
                                    class: 'btn small',
                                    type: 'button',
                                    onclick: () => {
                                        const child = objects.find(c => c.uuid === candSelect.value);
                                        const name = candName.value.trim();
                                        if (!name) return toast('Bitte einen identifier eingeben.', 'error');
                                        if (!a.value) return toast('Erst die DNA reparieren.', 'error');
                                        const updated = addChildToDna(a.value, childRefFor(child, name));
                                        editor.setValue(JSON.stringify(updated, null, 2));
                                        buffers.syntax.current = editor.getValue();
                                        changed();
                                    }
                                },
                                icon('link', { size: 15 }),
                                'In DNA einfügen'
                            )
                        )
                      : h(
                            'p',
                            { class: 'muted small' },
                            'Keine offenen Kinder. Neue Kinder hängst du beim ',
                            h('a', { href: href('objekte', obj.uuid) + '?tab=kind' }, 'Objekt unter „Kind anhängen“'),
                            ' an.'
                        )
            );
        };

        // ---------- Umschalten, Ändern, Speichern ----------
        let sideTimer = null;
        const changed = () => {
            buffers[activeType].current = editor.getValue();
            updateTabMarks();
            renderToolbarExtras();
            // Vorschau/Prüfung nicht bei jedem Buchstaben, sondern kurz nach dem Tippen
            clearTimeout(sideTimer);
            sideTimer = setTimeout(() => {
                if (PREVIEW_TYPES.includes(activeType)) {
                    clearTimeout(previewTimer);
                    previewTimer = setTimeout(updatePreview, 150);
                } else renderSide();
            }, 250);
        };
        editor.onChange(changed);

        const switchType = id => {
            activeType = id;
            editor.setMode(id);
            editor.setValue(buffers[id].current);
            editor.refresh();
            renderToolbarExtras();
            renderSide();
            // Adresse mitführen, ohne die Seite neu aufzubauen
            history.replaceState(null, '', href('code', uuid) + `?typ=${id}`);
        };

        const save = async () => {
            const types = dirtyTypes();
            if (!types.length) return;
            // Leere Reiter kann man nicht "löschen" – das Backend überspringt leeren Code
            const snippets = types
                .filter(t => buffers[t].current.trim())
                .map(t => ({ type: t, code: buffers[t].current }));
            const skipped = types.filter(t => !buffers[t].current.trim());
            if (!snippets.length) {
                mount(
                    saveOut,
                    callout(
                        'warn',
                        'Nichts zu speichern:',
                        ' Leeren Code kann man nicht speichern (Löschen gibt es noch nicht).'
                    )
                );
                return;
            }
            if (types.includes('syntax')) {
                const a = analyzeDna(buffers.syntax.current, { knownDomains });
                if (!a.ok) {
                    switchTo('syntax');
                    mount(saveOut, callout('error', 'Die DNA hat Fehler.', ' Bitte zuerst beheben (siehe rechts).'));
                    return;
                }
            }

            const res = await saveCode(uuid, snippets);
            const details = res.data?.details;
            mount(
                saveOut,
                resultLine(res),
                res.ok
                    ? h(
                          'p',
                          { class: 'muted small' },
                          `Gespeichert als Schritt ${res.data?.savedDetails?.step ?? '?'}: ${snippets.map(s => s.type).join(', ')}.`,
                          skipped.length ? ` (${skipped.join(', ')} ist leer und wurde übersprungen.)` : ''
                      )
                    : details
                      ? h('pre', { class: 'json' }, Array.isArray(details) ? details.join('\n') : String(details))
                      : null
            );
            if (!res.ok) return;
            for (const s of snippets) buffers[s.type].original = buffers[s.type].current;
            invalidateObjects(); // neue Version -> Objektliste veraltet
            updateTabMarks();
            renderToolbarExtras();
            toast('Gespeichert.', 'ok');
        };

        const switchTo = id => tabBar.select(id);

        // Strg+S / Cmd+S = speichern
        const onKey = e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (dirtyTypes().length) saveBtn.click();
            }
        };
        document.addEventListener('keydown', onKey);

        // Warnen, bevor ungespeicherte Änderungen verloren gehen
        const onBeforeUnload = e => {
            if (dirtyTypes().length) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);

        picker.addEventListener('change', () => {
            if (!picker.value) return;
            if (dirtyTypes().length && !confirm('Du hast ungespeicherte Änderungen. Trotzdem wechseln?')) {
                picker.value = uuid;
                return;
            }
            location.hash = href('code', picker.value);
        });

        updateTabMarks();
        renderToolbarExtras();
        renderSide();

        // Aufräumen beim Verlassen der Seite
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('beforeunload', onBeforeUnload);
            clearTimeout(sideTimer);
            clearTimeout(previewTimer);
            preview.destroy();
        };
    }
};
