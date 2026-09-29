// js/pages/objects.js
// ---------------------------------------------------------------------
// OBJEKTE
//
//   links:  alle Objekte, die du sehen darfst – als Baum (Wurzel > Kinder)
//   rechts: das gewählte Objekt mit sechs Reitern
//             Übersicht (mit Herkunft bei Kopien) · Vorschau · Baum (DNA aufgelöst)
//             · Rollen · Kind anhängen · Klonen & Zügeln
//   unten:  "Pfad auflösen" – so wie ein Besucher eine Adresse aufruft
//
// Adresse: /#/objekte            -> nur Liste
//          /#/objekte/<uuid>     -> Liste + Details dieses Objekts
// ---------------------------------------------------------------------
import { api, encodePath } from '../core/api.js';
import { href } from '../core/routes.js';
import {
    h,
    mount,
    card,
    badge,
    spinner,
    emptyState,
    callout,
    busyButton,
    copyButton,
    toast,
    tabs,
    field,
    infoList,
    resultLine,
    jsonView
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatDate, timeAgo, shortUuid, pathText, formatNumber, formatMs } from '../core/format.js';
import {
    loadObjects,
    loadObjectNames,
    invalidateObjects,
    buildObjectForest,
    countDescendants,
    objectLabel,
    objectFamily,
    isRoot,
    findParent,
    latestStep,
    childRefFor,
    loadCode,
    saveCode,
    originText,
    moveCheck,
    moveTargets
} from '../core/objects.js';
import { addChildToDna } from '../core/dna.js';
import { renderDnaTree } from '../core/tree.js';
import {
    buildPreviewDocument,
    createPreviewFrame,
    previewConsole,
    splitHtmlDocument,
    placeChildren
} from '../core/preview.js';

// Passendes Objekt zu einem DNA-Knoten finden (für anklickbare Bäume)
const finderFor = objects => (domain, source) =>
    objects.find(o => objectFamily(o) === domain && JSON.stringify(o.path) === JSON.stringify(source)) || null;

// ==================================================================
// NEUE DOMAIN ANLEGEN
// ==================================================================
const createDomainCard = ({ onCreated }) => {
    const input = h('input', {
        class: 'input',
        placeholder: 'z.B. mein-shop',
        maxlength: 100,
        autocomplete: 'off'
    });
    const out = h('div');
    const submit = async () => {
        const domain = input.value.trim();
        if (!domain) return toast('Bitte einen Namen eingeben.', 'error');
        const res = await api.post('/api/objects', { domain });
        mount(out, resultLine(res));
        if (!res.ok) return;
        toast(`Domain „${domain}“ angelegt.`, 'ok');
        input.value = '';
        invalidateObjects();
        onCreated(res.data?.data?.uuid);
    };
    input.addEventListener('keydown', e => e.key === 'Enter' && submit());

    return card(
        {
            title: 'Neue Domain (Wurzel-Objekt)',
            icon: 'box',
            subtitle: 'Eine Domain ist wie ein neues Projekt. Du bekommst automatisch alle drei Rollen darauf.'
        },
        h(
            'div',
            { class: 'form-row' },
            field('Name der Domain', input, 'Höchstens 100 Zeichen, kein „/“. Jeder Name existiert nur einmal.'),
            busyButton('Anlegen', submit, { className: 'btn primary', iconName: 'box' })
        ),
        out
    );
};

// ==================================================================
// LINKS: OBJEKT-BAUM
// ==================================================================
const renderForest = (box, objects, selectedUuid, filterText) => {
    const q = filterText.trim().toLowerCase();

    const item = (node, depth) => {
        const o = node.object;
        const kids = countDescendants(node);
        return h(
            'li',
            {},
            h(
                'a',
                {
                    class: `obj-item ${o.uuid === selectedUuid ? 'active' : ''}`,
                    href: href('objekte', o.uuid),
                    style: { paddingLeft: `${10 + depth * 16}px` }
                },
                h('span', { class: 'obj-icon' }, icon(isRoot(o) ? 'box' : 'link', { size: 15 })),
                h('span', { class: 'obj-item-label' }, objectLabel(o)),
                kids ? h('span', { class: 'obj-kids', title: `${kids} Nachfahren` }, String(kids)) : null
            ),
            node.children.length && !q
                ? h(
                      'ul',
                      {},
                      node.children.map(c => item(c, depth + 1))
                  )
                : null
        );
    };

    if (q) {
        // Beim Suchen: flache Trefferliste
        const hits = objects.filter(
            o =>
                objectLabel(o).toLowerCase().includes(q) ||
                o.uuid.includes(q) ||
                objectFamily(o).toLowerCase().includes(q)
        );
        if (!hits.length) return mount(box, h('p', { class: 'muted small pad' }, 'Keine Treffer.'));
        return mount(
            box,
            h(
                'ul',
                { class: 'obj-tree' },
                hits.map(o => item({ object: o, children: [] }, 0))
            )
        );
    }
    const forest = buildObjectForest(objects);
    mount(
        box,
        h(
            'ul',
            { class: 'obj-tree' },
            forest.map(n => item(n, 0))
        )
    );
};

// ==================================================================
// RECHTS: DETAILS
// ==================================================================

// --- Reiter "Übersicht" ---
const renderInfoTab = async (box, o, objects) => {
    const parent = findParent(objects, o);
    const children = objects.filter(c => findParent(objects, c)?.uuid === o.uuid);
    const versions = Array.isArray(o.path_directory) ? [...o.path_directory].reverse() : [];
    const codeBox = h('div', {}, spinner('Lade Code-Arten …'));

    mount(
        box,
        infoList([
            ['UUID', h('span', { class: 'id-line' }, h('code', {}, o.uuid), copyButton(o.uuid, 'UUID kopieren'))],
            isRoot(o) ? ['Domain', h('strong', {}, o.domain)] : ['Gehört zu (domain_ref)', o.domain_ref],
            ['Pfad', h('code', {}, JSON.stringify(o.path || []))],
            [
                'Eltern-Objekt',
                parent
                    ? h('a', { href: href('objekte', parent.uuid) }, objectLabel(parent))
                    : isRoot(o)
                      ? '– (Wurzel)'
                      : 'nicht sichtbar'
            ],
            [
                'Kinder',
                children.length
                    ? h(
                          'span',
                          { class: 'chip-list' },
                          children.map(c => h('a', { class: 'chip', href: href('objekte', c.uuid) }, objectLabel(c)))
                      )
                    : 'keine'
            ],
            // Herkunft (nur bei Kopien): mit Link, falls du das Original sehen darfst
            originText(o)
                ? [
                      'Herkunft',
                      (() => {
                          const original = objects.find(x => x.uuid === o.origin.uuid);
                          return original
                              ? h('a', { href: href('objekte', original.uuid) }, originText(o))
                              : h(
                                    'span',
                                    {},
                                    originText(o),
                                    h('span', { class: 'muted small' }, ' (Original nicht sichtbar)')
                                );
                      })()
                  ]
                : null,
            ['Erstellt', `${formatDate(o.created_at)} (${timeAgo(o.created_at)})`],
            ['Zuletzt geändert', o.updated_at ? `${formatDate(o.updated_at)} (${timeAgo(o.updated_at)})` : '–'],
            ['Code-Arten', codeBox]
        ]),
        h(
            'div',
            {},
            h('h3', { class: 'sub-title' }, `Versionen (${versions.length})`),
            h(
                'p',
                { class: 'muted small' },
                'Jedes Speichern von Code legt einen neuen Schritt an. Kinder hängen immer an einem bestimmten Schritt.'
            ),
            versions.length
                ? h(
                      'ol',
                      { class: 'versions' },
                      versions
                          .slice(0, 12)
                          .map(v =>
                              h(
                                  'li',
                                  {},
                                  h('span', { class: 'badge accent' }, `Schritt ${v.step}`),
                                  h('span', { class: 'muted small' }, formatDate(v.timestamp))
                              )
                          )
                  )
                : h('p', { class: 'muted small' }, 'Noch keine Version.'),
            versions.length > 12 ? h('p', { class: 'muted small' }, `… und ${versions.length - 12} ältere`) : null
        )
    );

    const code = await loadCode(o.uuid);
    if (!code.ok) return mount(codeBox, h('span', { class: 'muted' }, code.error));
    const types = Object.keys(code.code);
    mount(
        codeBox,
        types.length
            ? h(
                  'span',
                  { class: 'chip-list' },
                  types.map(t => h('a', { class: 'chip', href: href('code', o.uuid) + `?typ=${t}` }, t))
              )
            : h('span', { class: 'muted' }, 'kein Code')
    );

    // Kleine Vorschau direkt in der Übersicht (mit Kindern)
    const previewBox = h('div');
    box.append(h('h3', { class: 'sub-title' }, 'Vorschau'), previewBox);
    renderComposedPreview(previewBox, o, objects, { height: '280px', compact: true });
};

// ------------------------------------------------------------------
// VORSCHAU MIT KINDERN
// Setzt das Objekt so zusammen, wie die DNA es beschreibt: eigenes HTML,
// darin (oder danach) das HTML der Kinder, dazu alles CSS und JS.
// Regel für die Plätze der Kinder: siehe core/preview.js
// ------------------------------------------------------------------
let currentPreview = null; // nur eine Vorschau gleichzeitig (Zuhörer aufräumen)
const MAX_PREVIEW_OBJECTS = 40;

const composeObject = async (rootObject, objects) => {
    const find = finderFor(objects);
    const codeCache = new Map();
    const used = [];
    const missing = [];
    const getCode = async uuid => {
        if (!codeCache.has(uuid)) codeCache.set(uuid, loadCode(uuid));
        return (await codeCache.get(uuid)).code;
    };

    // Aufgelöster Baum (falls es keinen gibt: nur das Objekt selbst)
    const treeRes = await api.get(`/api/ast/${rootObject.uuid}/tree`);
    const tree = treeRes.ok ? treeRes.data?.tree : null;

    const visit = async (node, obj) => {
        if (used.length >= MAX_PREVIEW_OBJECTS) return { html: '', css: [], js: [] };
        used.push(obj);
        const code = await getCode(obj.uuid);
        const own = splitHtmlDocument(code.html || '');
        const parts = [];
        const css = [code.css || ''];
        const js = [code.javascript || ''];
        for (const child of Array.isArray(node?.children) ? node.children : []) {
            const childObj = find(child.domain, child.source);
            if (!childObj) {
                missing.push(child.identifier || JSON.stringify(child.source));
                continue;
            }
            const sub = await visit(child, childObj);
            parts.push({ identifier: child.identifier, html: sub.html });
            css.push(...sub.css);
            js.push(...sub.js);
        }
        return { html: placeChildren(own.body, parts), head: own.head, css, js };
    };

    const result = await visit(tree, rootObject);
    return { ...result, used, missing };
};

const renderComposedPreview = async (box, o, objects, { height = '520px', compact = false } = {}) => {
    currentPreview?.destroy();
    mount(box, spinner('Setze das Objekt zusammen …'));
    const composed = await composeObject(o, objects);
    const pConsole = previewConsole();
    currentPreview = createPreviewFrame({ onMessage: pConsole.add, height });

    mount(
        box,
        compact
            ? null
            : h(
                  'p',
                  { class: 'muted small' },
                  'So sieht das Objekt aus, wenn man es mit allen Kindern aus der DNA zusammensetzt. Jedes Kind kommt an seinen Platz ',
                  h('code', {}, '<div data-slot="name"></div>'),
                  ' im HTML des Eltern-Objekts – oder, falls es keinen gibt, der Reihe nach darunter. (Das ist die Vorschau-Regel des Cockpits; die Engine selbst liefert noch kein fertiges HTML aus.)'
              ),
        h(
            'div',
            { class: 'row gap-s wrap small muted' },
            `${composed.used.length} Objekt${composed.used.length === 1 ? '' : 'e'} zusammengesetzt: `,
            h(
                'span',
                { class: 'chip-list' },
                composed.used.map(u => h('a', { class: 'chip', href: href('code', u.uuid) }, objectLabel(u)))
            )
        ),
        composed.missing.length
            ? callout('warn', 'Nicht sichtbar:', ` ${composed.missing.join(', ')} (keine Rechte oder nicht gefunden).`)
            : null,
        currentPreview.frame,
        pConsole.el
    );
    currentPreview.show(buildPreviewDocument({ html: composed.html, css: composed.css, js: composed.js }));
};

// --- Reiter "Vorschau" ---
const renderPreviewTab = (box, o, objects) => renderComposedPreview(box, o, objects, { height: '560px' });

// --- Reiter "Baum" ---
const renderTreeTab = async (box, o, objects) => {
    mount(box, spinner('Löse den Baum auf …'));
    const res = await api.get(`/api/ast/${o.uuid}/tree`);
    if (!res.ok) return mount(box, callout('warn', 'Kein Baum:', ' ', res.error));
    const tree = res.data?.tree;
    mount(
        box,
        h(
            'p',
            { class: 'muted small' },
            'So sieht das Objekt aus, wenn der Server alle Kinder aus der DNA einsetzt (aufgelöst in ',
            formatMs(Number(res.data?.executionTimeMs)),
            '). Kinder, auf die du keine Rechte hast, fehlen.'
        ),
        tree ? renderDnaTree(tree, { findObject: finderFor(objects) }) : h('p', { class: 'muted' }, 'Leer.'),
        h('details', { class: 'raw' }, h('summary', {}, 'Rohdaten (JSON)'), jsonView(tree, { maxHeight: '360px' })),
        h(
            'a',
            { class: 'btn ghost small', href: href('code', o.uuid) + '?typ=syntax' },
            icon('code', { size: 16 }),
            'DNA bearbeiten'
        )
    );
};

// --- Reiter "Rollen" ---
const renderRolesTab = async (box, o) => {
    mount(box, spinner('Lade Rollen …'));
    const res = await api.get(`/api/objects/${o.uuid}/roles`);
    if (!res.ok) return mount(box, callout('error', 'Fehler:', ' ', res.error));
    const groups = res.data && typeof res.data === 'object' ? Object.entries(res.data) : [];
    const family = objectFamily(o);

    if (!groups.length)
        return mount(
            box,
            emptyState({ icon: 'shield', title: 'Keine Rollen', text: 'Dieses Objekt hängt an keinem Triplet.' })
        );

    mount(
        box,
        h(
            'p',
            { class: 'muted small' },
            'Ein Objekt hängt an Triplets. Ein Triplet mit derselben Domain SCHÜTZT das Objekt (wer dort Rollen hat, darf darauf zugreifen). ',
            'Triplets mit anderer Domain bedeuten: Dieses Objekt BESITZT dort selbst Rechte (z.B. ein User oder eine SSF).'
        ),
        groups.map(([domain, roles]) => {
            const protecting = domain === family;
            const byTriplet = new Map();
            for (const r of roles) {
                if (!byTriplet.has(r.triplet_uuid)) byTriplet.set(r.triplet_uuid, []);
                byTriplet.get(r.triplet_uuid).push(r.type);
            }
            return h(
                'div',
                { class: `role-group ${protecting ? 'protecting' : ''}` },
                h(
                    'div',
                    { class: 'role-group-head' },
                    h('strong', {}, domain),
                    protecting ? badge('schützt dieses Objekt', 'ok') : badge('Objekt hat hier Rechte', 'accent')
                ),
                [...byTriplet.entries()].map(([triplet, types]) =>
                    h(
                        'div',
                        { class: 'role-line' },
                        h('span', { class: 'muted small' }, 'Triplet'),
                        h('code', { title: triplet }, shortUuid(triplet)),
                        copyButton(triplet, 'Triplet-UUID kopieren'),
                        h(
                            'span',
                            { class: 'role-chips' },
                            ['black', 'red', 'blue']
                                .filter(t => types.includes(t))
                                .map(t => h('span', { class: `role ${t}` }, t))
                        )
                    )
                )
            );
        }),
        h(
            'p',
            { class: 'muted small' },
            'Rollen vergeben und entziehen kannst du bald auf der Seite ',
            h('a', { href: href('rechte') }, 'Rechte'),
            '.'
        )
    );
};

// --- Reiter "Kind anhängen" ---
const renderLinkTab = (box, o, { onCreated }) => {
    const family = objectFamily(o);
    const versions = Array.isArray(o.path_directory) ? [...o.path_directory].reverse() : [];
    const identifier = h('input', {
        class: 'input',
        placeholder: 'z.B. produkte',
        autocomplete: 'off',
        maxlength: 100
    });
    const step = h(
        'select',
        { class: 'input' },
        versions.length
            ? versions.map((v, i) =>
                  h(
                      'option',
                      { value: String(v.step) },
                      `Schritt ${v.step}${i === 0 ? ' (neuster)' : ''} – ${formatDate(v.timestamp)}`
                  )
              )
            : h('option', { value: 'base' }, 'Basis (noch keine Version)')
    );
    const addToDna = h('input', { type: 'checkbox', checked: true });
    const log = h('div', { class: 'steps-log' });

    const submit = async () => {
        const id = identifier.value.trim();
        if (!id) return toast('Bitte einen Namen (identifier) eingeben.', 'error');
        if (id.includes('/')) return toast('Der Name darf kein „/“ enthalten (er wird Teil der Adresse).', 'error');
        mount(log);

        // Schritt 1: Kind-Objekt anlegen
        const res = await api.post(`/api/objects/${o.uuid}/links`, {
            domainRef: family,
            pathStep: step.value,
            identifier: id
        });
        log.append(h('div', { class: 'muted small' }, '1. Kind-Objekt anlegen'), resultLine(res));
        if (!res.ok) return;
        const child = res.data?.data;
        invalidateObjects();

        // Schritt 2 (optional): in die DNA des Eltern-Objekts eintragen
        if (addToDna.checked && child) {
            const code = await loadCode(o.uuid);
            let dna;
            try {
                dna = code.code.syntax
                    ? JSON.parse(code.code.syntax)
                    : { type: 'instance', identifier: family, domain: family, source: o.path };
            } catch {
                log.append(
                    callout(
                        'error',
                        'Die DNA des Eltern-Objekts ist kein gültiges JSON.',
                        ' Bitte im Code-Editor reparieren.'
                    )
                );
                return;
            }
            const updated = addChildToDna(dna, childRefFor(child, id));
            const save = await saveCode(o.uuid, [{ type: 'syntax', code: JSON.stringify(updated, null, 2) }]);
            log.append(
                h('div', { class: 'muted small' }, '2. In die DNA des Eltern-Objekts eintragen'),
                resultLine(save)
            );
            if (!save.ok) return;
        }

        toast(`Kind „${id}“ angehängt.`, 'ok');
        identifier.value = '';
        onCreated(child?.uuid);
    };
    identifier.addEventListener('keydown', e => e.key === 'Enter' && submit());

    mount(
        box,
        h(
            'p',
            { class: 'muted small' },
            'Ein Kind ist ein eigenes Objekt in derselben Familie („',
            family,
            '“). Es bekommt dieselben Rollen wie das Eltern-Objekt. Damit es im Baum und unter einer Adresse erscheint, muss es in der DNA des Eltern-Objekts stehen – das erledigt der Haken unten automatisch.'
        ),
        h(
            'div',
            { class: 'form-grid' },
            field('Name (identifier)', identifier, 'Wird Teil der Adresse, z.B. ' + family + '/produkte'),
            field('An welcher Version?', step, 'Normalerweise die neuste.')
        ),
        h(
            'label',
            { class: 'check' },
            addToDna,
            h('span', {}, 'Auch gleich in die DNA des Eltern-Objekts eintragen (empfohlen)')
        ),
        h('div', {}, busyButton('Kind anhängen', submit, { className: 'btn primary', iconName: 'link' })),
        log
    );
};

// --- Reiter "Klonen & Zügeln" ---
// Klonen:  POST /api/objects/:uuid/clone  -> Kopie als NEUE Domain (gehört dir)
// Zügeln:  POST /api/objects/:uuid/move   -> das Objekt zieht in eine andere Familie
const renderCopyTab = (box, o, objects, { onDone }) => {
    const family = objectFamily(o);
    const versions = Array.isArray(o.path_directory) ? [...o.path_directory].reverse() : [];

    // ---------- KLONEN ----------
    const cloneName = h('input', {
        class: 'input',
        placeholder: `z.B. ${family}-kopie`,
        autocomplete: 'off',
        maxlength: 100
    });
    const cloneVersion = h(
        'select',
        { class: 'input' },
        versions.map((v, i) =>
            h(
                'option',
                { value: String(v.step) },
                `Version ${v.step}${i === 0 ? ' (neuste)' : ''} – ${formatDate(v.timestamp)}`
            )
        )
    );
    const withData = h('input', { type: 'checkbox' });
    const cloneOut = h('div');

    const doClone = async () => {
        const domain = cloneName.value.trim();
        if (!domain) return toast('Bitte einen Namen für die Kopie eingeben.', 'error');
        const res = await api.post(`/api/objects/${o.uuid}/clone`, {
            domain,
            version: Number(cloneVersion.value),
            withData: withData.checked
        });
        mount(cloneOut, resultLine(res));
        if (!res.ok) return;
        toast(`Kopie „${domain}“ erstellt.`, 'ok');
        onDone(res.data?.data?.uuid);
    };
    cloneName.addEventListener('keydown', e => e.key === 'Enter' && doClone());

    const cloneCard = card(
        {
            title: 'Klonen',
            icon: 'layers',
            subtitle: 'Eine Kopie als NEUE Domain. Sie gehört dir, das Original bleibt unverändert.'
        },
        h(
            'ul',
            { class: 'small muted' },
            h('li', {}, '✅ Code genau der gewählten Version (auch SSF-Code)'),
            h('li', {}, '✅ Daten nur, wenn du den Haken setzt (höchstens 10’000 Datensätze)'),
            h('li', {}, '❌ Nie Tresor-Schlüssel, Rechte oder Relationen'),
            h(
                'li',
                {},
                'Kinder in der DNA bleiben Verweise auf das Original. Wer sie auch besitzen will, klont sie einzeln.'
            )
        ),
        h(
            'div',
            { class: 'form-grid' },
            field('Name der Kopie', cloneName, 'Wird eine neue Domain – jeder Name existiert nur einmal.'),
            field('Welche Version?', cloneVersion)
        ),
        h('label', { class: 'check' }, withData, h('span', {}, 'Daten (Datensätze) mitkopieren')),
        h('div', {}, busyButton('Klonen', doClone, { className: 'btn primary', iconName: 'layers' })),
        cloneOut
    );

    // ---------- ZÜGELN ----------
    const check = moveCheck(o, objects);
    const targets = moveTargets(objects, o);
    let moveBody;

    if (!check.ok) {
        moveBody = callout('info', 'Zügeln nicht möglich:', ' ', check.reason);
    } else if (!targets.length) {
        moveBody = callout('info', 'Kein Ziel:', ' Du siehst kein anderes Objekt, in das dieses zügeln könnte.');
    } else {
        const target = h(
            'select',
            { class: 'input' },
            targets.map(t => h('option', { value: t.uuid }, `${objectLabel(t)} (Familie ${objectFamily(t)})`))
        );
        const addToDna = h('input', { type: 'checkbox', checked: true });
        const moveLog = h('div', { class: 'steps-log' });

        const doMove = async () => {
            const parent = targets.find(t => t.uuid === target.value);
            if (
                !confirm(
                    `„${o.domain}“ nach „${objectLabel(parent)}“ zügeln?\n\n` +
                        `• Der Name „${o.domain}“ wird für immer gesperrt.\n` +
                        `• Wer nur auf dieses Objekt Rechte hatte, verliert sie.\n` +
                        `• Danach gelten die Rechte der Familie „${objectFamily(parent)}“.`
                )
            )
                return;
            mount(moveLog);

            // Schritt 1: zügeln (an der neusten Version des neuen Eltern-Objekts)
            const step = latestStep(parent);
            const res = await api.post(`/api/objects/${o.uuid}/move`, {
                targetParent: parent.uuid,
                pathStep: step === null ? 'base' : step
            });
            log(moveLog, '1. Zügeln', res);
            if (!res.ok) return;
            const moved = res.data?.data;
            const lost = res.data?.removedMembers || 0;
            if (lost)
                moveLog.append(
                    callout('warn', `${lost} Mitglied${lost === 1 ? '' : 'er'}`, ' hat/haben dabei Rechte verloren.')
                );

            // Schritt 2 (optional): in die DNA des neuen Eltern-Objekts eintragen
            if (addToDna.checked && moved) {
                const code = await loadCode(parent.uuid);
                let dna;
                try {
                    dna = code.code.syntax
                        ? JSON.parse(code.code.syntax)
                        : {
                              type: 'instance',
                              identifier: objectFamily(parent),
                              domain: objectFamily(parent),
                              source: parent.path
                          };
                } catch {
                    moveLog.append(
                        callout(
                            'error',
                            'Die DNA des neuen Eltern-Objekts ist kein gültiges JSON.',
                            ' Bitte im Code-Editor reparieren.'
                        )
                    );
                    return;
                }
                const updated = addChildToDna(dna, childRefFor(moved, o.domain));
                const save = await saveCode(parent.uuid, [{ type: 'syntax', code: JSON.stringify(updated, null, 2) }]);
                log(moveLog, '2. In die DNA des neuen Eltern-Objekts eintragen', save);
                if (!save.ok) return;
            }

            toast(`„${o.domain}“ gezügelt.`, 'ok');
            onDone(o.uuid);
        };

        moveBody = h(
            'div',
            {},
            field('Neues Eltern-Objekt', target, 'Du brauchst dort die red-Rolle. Das Objekt wird dort ein Kind.'),
            h(
                'label',
                { class: 'check' },
                addToDna,
                h('span', {}, 'Auch gleich in die DNA des neuen Eltern-Objekts eintragen (empfohlen)')
            ),
            callout(
                'warn',
                'Achtung:',
                ` Der Name „${o.domain}“ wird danach für immer gesperrt, und wer nur auf dieses Objekt Rechte hatte, verliert sie. Code, Daten, Tresor und Herkunft bleiben.`
            ),
            h('div', {}, busyButton('Zügeln', doMove, { className: 'btn primary', iconName: 'arrowRight' })),
            moveLog
        );
    }

    const moveCard = card(
        {
            title: 'Zügeln',
            icon: 'arrowRight',
            subtitle: 'Dieses Objekt zieht in eine andere Familie um – z.B. eine gekaufte Kopie in deine eigene Domain.'
        },
        h(
            'p',
            { class: 'muted small' },
            'Dafür brauchst du blue auf dieses Objekt (es gehört dir) und red auf den neuen Platz.'
        ),
        moveBody
    );

    mount(box, cloneCard, moveCard);
};

// Eine Zeile im Schritt-Protokoll: Überschrift + Ergebnis
const log = (box, title, res) => box.append(h('div', { class: 'muted small' }, title), resultLine(res));

const renderDetail = (box, o, objects, { tab, onTab, reload }) => {
    const body = h('div', { class: 'tab-body' });
    const TABS = [
        { id: 'info', label: 'Übersicht' },
        { id: 'vorschau', label: 'Vorschau' },
        { id: 'baum', label: 'Baum' },
        { id: 'rollen', label: 'Rollen' },
        { id: 'kind', label: 'Kind anhängen' },
        { id: 'kopie', label: 'Klonen & Zügeln' }
    ];
    const show = id => {
        onTab(id);
        currentPreview?.destroy(); // alte Vorschau abmelden
        currentPreview = null;
        if (id === 'info') renderInfoTab(body, o, objects);
        else if (id === 'vorschau') renderPreviewTab(body, o, objects);
        else if (id === 'baum') renderTreeTab(body, o, objects);
        else if (id === 'rollen') renderRolesTab(body, o);
        else if (id === 'kopie') renderCopyTab(body, o, objects, { onDone: uuid => reload(uuid) });
        else renderLinkTab(body, o, { onCreated: uuid => reload(uuid) });
    };
    const active = TABS.some(t => t.id === tab) ? tab : 'info';

    mount(
        box,
        h(
            'div',
            { class: 'detail-head' },
            h('span', { class: 'detail-icon' }, icon(isRoot(o) ? 'box' : 'link', { size: 22 })),
            h(
                'div',
                { class: 'detail-title' },
                h('h2', {}, objectLabel(o)),
                h(
                    'div',
                    { class: 'row gap-s wrap' },
                    isRoot(o) ? badge('Wurzel', 'accent') : badge('Kind', 'neutral'),
                    badge(`Familie: ${objectFamily(o)}`, 'neutral'),
                    h('code', { class: 'small', title: o.uuid }, shortUuid(o.uuid))
                )
            ),
            h(
                'div',
                { class: 'row gap-s' },
                h('a', { class: 'btn', href: href('code', o.uuid) }, icon('code', { size: 16 }), 'Code bearbeiten')
            )
        ),
        tabs(TABS, { active, onChange: show }),
        body
    );
    show(active);
};

// ==================================================================
// PFAD AUFLÖSEN
// ==================================================================
const pathResolverCard = objects => {
    const input = h('input', { class: 'input mono', placeholder: 'z.B. mein-shop/produkte', autocomplete: 'off' });
    const out = h('div');
    const run = async () => {
        const path = encodePath(input.value);
        if (!path) return toast('Bitte einen Pfad eingeben.', 'error');
        const res = await api.get(`/api/ast/tree/path/${path}`);
        if (!res.ok) return mount(out, resultLine(res));
        const target = objects.find(o => o.uuid === res.data?.targetUuid);
        mount(
            out,
            resultLine(res),
            h(
                'p',
                { class: 'small' },
                'Ziel-Objekt: ',
                target
                    ? h('a', { href: href('objekte', target.uuid) }, objectLabel(target))
                    : h('code', {}, res.data?.targetUuid || '–')
            ),
            res.data?.tree ? renderDnaTree(res.data.tree, { findObject: finderFor(objects) }) : null
        );
    };
    input.addEventListener('keydown', e => e.key === 'Enter' && run());
    return card(
        {
            title: 'Pfad auflösen',
            icon: 'search',
            subtitle:
                'So findet at0mic ein Objekt über eine Adresse: Domain, dann Schritt für Schritt die identifier aus der DNA.'
        },
        h(
            'div',
            { class: 'form-row' },
            field('Pfad', input),
            busyButton('Auflösen', run, { className: 'btn', iconName: 'arrowRight' })
        ),
        out
    );
};

// ==================================================================
// SEITE
// ==================================================================
let lastTab = 'info';

const renderPage = async (root, { params, query }) => {
    const selectedUuid = params[0] || null;
    const createBox = h('div');
    const listBox = h('div', { class: 'obj-tree-box' }, spinner());
    const detailBox = h('div', { class: 'card detail' });
    const bottom = h('div');
    let filter = '';

    // Neu laden – mit uuid: danach dieses (neue) Objekt anzeigen
    const reload = uuid => {
        invalidateObjects();
        if (uuid && uuid !== selectedUuid) {
            lastTab = 'info'; // neues Objekt: mit der Übersicht beginnen
            location.hash = href('objekte', uuid);
        } else window.dispatchEvent(new HashChangeEvent('hashchange'));
    };

    const filterInput = h('input', {
        class: 'input small',
        type: 'search',
        placeholder: 'Suchen …',
        'aria-label': 'Objekte filtern'
    });

    root.append(
        pageHeader({
            intro: 'Alles in at0mic ist ein Objekt. Wurzeln sind eigene Domains, darunter hängen Kinder. Klick ein Objekt an, um Details, Baum und Rollen zu sehen.',
            actions: [
                h(
                    'button',
                    {
                        class: 'btn primary',
                        type: 'button',
                        onclick: () => createBox.classList.toggle('hidden-box')
                    },
                    icon('box'),
                    'Neue Domain'
                ),
                busyButton('Aktualisieren', async () => reload(), { className: 'btn ghost', iconName: 'refresh' })
            ]
        }),
        createBox,
        h(
            'div',
            { class: 'split' },
            h('section', { class: 'card list-panel' }, h('div', { class: 'list-panel-head' }, filterInput), listBox),
            detailBox
        ),
        bottom
    );

    const res = await loadObjects({ fresh: query.fresh === '1' });
    if (!res.ok) {
        mount(listBox, callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        mount(detailBox, emptyState({ icon: 'server', title: 'Keine Daten' }));
        return;
    }
    const objects = res.data;
    await loadObjectNames(objects); // Namen der Kinder aus den DNA-Bäumen

    mount(createBox, createDomainCard({ onCreated: uuid => reload(uuid) }));
    if (objects.length) createBox.classList.add('hidden-box');

    renderForest(listBox, objects, selectedUuid, filter);
    filterInput.addEventListener('input', () => {
        filter = filterInput.value;
        renderForest(listBox, objects, selectedUuid, filter);
    });
    mount(bottom, pathResolverCard(objects));

    // Kopfzeile der Liste: Anzahl
    listBox.before(h('div', { class: 'muted small list-count' }, `${formatNumber(objects.length)} Objekte sichtbar`));

    if (!objects.length) {
        mount(
            detailBox,
            emptyState({
                icon: 'box',
                title: 'Noch keine Objekte',
                text: 'Leg oben deine erste Domain an. Als anonymer Besucher wirst du dabei automatisch Gast.'
            })
        );
        return;
    }

    const selected = objects.find(o => o.uuid === selectedUuid);
    if (!selected) {
        mount(
            detailBox,
            selectedUuid
                ? callout(
                      'warn',
                      'Objekt nicht gefunden.',
                      ' Es existiert nicht, oder du hast darauf keine Leserechte (black).'
                  )
                : emptyState({
                      icon: 'arrowRight',
                      title: 'Wähle links ein Objekt',
                      text: 'Dann siehst du hier Details, Baum, Rollen und kannst Kinder anhängen.'
                  })
        );
        return;
    }
    renderDetail(detailBox, selected, objects, {
        tab: query.tab || lastTab,
        onTab: id => {
            lastTab = id;
        },
        reload
    });
};

export default {
    async render(root, ctx) {
        await renderPage(root, ctx);
        // Beim Verlassen der Seite: Vorschau-Zuhörer abmelden
        return () => {
            currentPreview?.destroy();
            currentPreview = null;
        };
    }
};
