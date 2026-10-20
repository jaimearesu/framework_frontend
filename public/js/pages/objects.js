// js/pages/objects.js
// ---------------------------------------------------------------------
// OBJEKTE
//
//   links:  alle Objekte, die du sehen darfst – als Baum (Wurzel > Kinder)
//   rechts: das gewählte Objekt mit neun Reitern
//             Übersicht (mit Herkunft bei Kopien) · Vorschau · Baum (DNA aufgelöst)
//             · Rollen · Kind anhängen · Klonen & Zügeln · Sichtbarkeit · Website · Löschen
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
    moveTargets,
    deleteCheck,
    visibilityInfo,
    VISIBILITY_ORDER,
    descendantsOf
} from '../core/objects.js';
import { getSession } from '../core/session.js';
import { isTestMode, siteUrlTemplate } from '../core/config.js';
import {
    siteStatus,
    siteUrl,
    hiddenNames,
    bauplanFiles,
    fileUrl,
    formatBytes,
    RESERVED_SITE_NAMES
} from '../core/site.js';
import { addChildToDna, removeChildFromDna } from '../core/dna.js';
import {
    SCOPES,
    rolesForScope,
    canUsePartScope,
    accessOverview,
    memberLabel,
    revokePath,
    INVITE_VALIDITY,
    DEFAULT_INVITE_HOURS,
    invitationStatus,
    invitationRolesText,
    checkInviteForm
} from '../core/access.js';
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
                o.visibility && o.visibility !== 'private'
                    ? h(
                          'span',
                          { class: 'obj-vis', title: visibilityInfo(o.visibility).label },
                          visibilityInfo(o.visibility).emoji
                      )
                    : null,
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
            'Rechte vergeben und entziehen – für die ganze Website oder nur für einen Teil – im Reiter „Zugriff“. ',
            'Triplets direkt verwalten: Seite ',
            h('a', { href: href('rechte') }, 'Rechte'),
            '.'
        )
    );
};

// --- Reiter "Zugriff" ---
// Plan "Login auf Websites", Etappe 5: Wer darf dieses Objekt sehen und ändern?
// Rechte auf die GANZE Website (Familien-Schloss) oder NUR AUF DIESEN TEIL
// (Zusatz-Schloss, "Rollen pro Teil"). Braucht blue auf die Website.
//   GET    /api/objects/<uuid>/members
//   PUT    /api/objects/<uuid>/members/<wer>          { roleType, scope }
//   DELETE /api/objects/<uuid>/members/<wer>/<rolle>[?scope=teil]
//   DELETE /api/objects/<uuid>/lock                   Zusatz-Schloss ganz entfernen
// Texte vom Backend immer über h() (textContent) – nie als HTML.
const renderAccessTab = async (box, o, objects) => {
    const rerender = () => renderAccessTab(box, o, objects);
    mount(box, spinner('Lade Zugriff …'));
    const res = await api.get(`/api/objects/${o.uuid}/members`);
    if (!res.ok) {
        return mount(
            box,
            callout(
                'info',
                'Nur für Verwalter:',
                ' Wer welche Rechte hat, sehen und ändern nur Menschen mit blue auf diese Website.'
            ),
            resultLine(res)
        );
    }
    const view = accessOverview(res.data?.data);
    const isPart = canUsePartScope(o);
    const family = objectFamily(o);
    const nameOf = uuid => {
        const obj = objects.find(x => x.uuid === uuid);
        return obj ? objectLabel(obj) : shortUuid(uuid);
    };

    // Eine Zeile: wer · Rollen · je Rolle "entziehen"
    const memberRow = (m, scope) =>
        h(
            'tr',
            {},
            h('td', {}, memberLabel(m, shortUuid), ' ', copyButton(m.uuid, 'UUID kopieren')),
            h(
                'td',
                {},
                h(
                    'span',
                    { class: 'role-chips' },
                    m.roles.map(r => h('span', { class: `role ${r}` }, r))
                )
            ),
            h(
                'td',
                { class: 'row gap-s wrap' },
                m.roles.map(r =>
                    busyButton(
                        `${r} entziehen`,
                        async () => {
                            if (
                                !confirm(
                                    `${memberLabel(m, shortUuid)}: Recht „${r}“ (${SCOPES[scope].label}) entziehen?`
                                )
                            )
                                return;
                            const del = await api.del(revokePath(o.uuid, m.uuid, r, scope));
                            if (!del.ok) return toast(del.error || 'Hat nicht geklappt.', 'error');
                            toast('Recht entzogen.', 'ok');
                            rerender();
                        },
                        { className: 'btn small' }
                    )
                )
            )
        );

    const memberTable = (list, scope, emptyText) =>
        list.length
            ? h(
                  'div',
                  { class: 'table-wrap' },
                  h(
                      'table',
                      { class: 'data-table' },
                      h('thead', {}, h('tr', {}, h('th', {}, 'Wer'), h('th', {}, 'Rollen'), h('th', {}, ''))),
                      h(
                          'tbody',
                          {},
                          list.map(m => memberRow(m, scope))
                      )
                  )
              )
            : h('p', { class: 'muted small' }, emptyText);

    // --- Formular: Recht vergeben ---
    const who = h('input', {
        class: 'input mono',
        placeholder: 'UUID eines Menschen oder Objekts',
        autocomplete: 'off'
    });
    let scope = 'familie';
    const role = h('select', { class: 'input' });
    const fillRoles = () =>
        mount(
            role,
            rolesForScope(scope).map(r =>
                h('option', { value: r }, `${r} – ${{ black: 'sehen', red: 'ändern', blue: 'verwalten' }[r]}`)
            )
        );
    fillRoles();
    const scopeChoice = isPart
        ? h(
              'div',
              { class: 'vis-options' },
              ['familie', 'teil'].map(value =>
                  h(
                      'label',
                      { class: 'vis-option' },
                      h('input', {
                          type: 'radio',
                          name: 'scope',
                          value,
                          checked: value === scope,
                          onchange: () => {
                              scope = value;
                              fillRoles();
                          }
                      }),
                      h(
                          'span',
                          {},
                          h('strong', {}, SCOPES[value].label),
                          h('span', { class: 'muted small block' }, SCOPES[value].text)
                      )
                  )
              )
          )
        : null;
    const out = h('div');
    const grant = async () => {
        const member = who.value.trim();
        if (!member) return toast('Bitte die UUID eingeben, wer das Recht bekommen soll.', 'error');
        const r = await api.put(`/api/objects/${o.uuid}/members/${encodeURIComponent(member)}`, {
            roleType: role.value,
            scope
        });
        mount(out, resultLine(r));
        if (r.ok) {
            toast(r.data?.data?.changed ? 'Recht vergeben.' : 'Hatte dieses Recht schon.', 'ok');
            rerender();
        }
    };

    // --- Zusatz-Schloss ganz entfernen ---
    const removeLock = async () => {
        const n = view.own ? view.own.members.length : 0;
        if (
            !confirm(
                `Zusatz-Schloss von „${objectLabel(o)}“ entfernen?\n\n${n} Mitglied(er) verlieren ihr Recht auf diesen Teil.`
            )
        )
            return;
        const r = await api.del(`/api/objects/${o.uuid}/lock`);
        if (!r.ok) return toast(r.error || 'Hat nicht geklappt.', 'error');
        toast(r.data?.message || 'Zusatz-Schloss entfernt.', 'ok');
        rerender();
    };

    mount(
        box,
        card(
            {
                title: `Ganze Website „${family}“`,
                icon: 'shield',
                subtitle: 'Wer hier ein Recht hat, hat es auf ALLE Teile der Website.'
            },
            memberTable(view.website, 'familie', 'Noch niemand ausser den Teilen der Website selbst.'),
            view.parts
                ? h(
                      'p',
                      { class: 'muted small' },
                      `Dazu ${view.parts} Teil(e) der Website mit ihrem eigenen Schutz-Eintrag (kein vergebenes Recht).`
                  )
                : null
        ),
        isPart
            ? card(
                  {
                      title: 'Nur dieser Teil',
                      icon: 'lock',
                      subtitle:
                          'Rechte nur auf diesen Teil und seine Unter-Teile – z.B. ein Kunde sieht nur seinen Bereich.'
                  },
                  view.own
                      ? memberTable(view.own.members, 'teil', 'Das Zusatz-Schloss hat gerade keine Mitglieder.')
                      : h('p', { class: 'muted small' }, 'Noch niemand hat ein Recht nur auf diesen Teil.'),
                  view.inherited.map(l =>
                      callout(
                          'info',
                          'Geerbt:',
                          ` ${l.members.length} Mitglied(er) sehen diesen Teil über das Zusatz-Schloss von `,
                          h('a', { href: href('objekte', l.object) }, nameOf(l.object)),
                          '.'
                      )
                  ),
                  view.own
                      ? h(
                            'div',
                            {},
                            busyButton('Zusatz-Schloss entfernen', removeLock, {
                                className: 'btn danger',
                                iconName: 'trash'
                            })
                        )
                      : null
              )
            : null,
        card(
            { title: 'Recht vergeben', icon: 'key' },
            field(
                'Wer?',
                who,
                'Objekt-UUID oder die UUID eines Menschen. Ein angemeldeter Besucher sieht seine ID auf deiner Website unter /_at0mic/me.'
            ),
            scopeChoice,
            field('Rolle', role),
            h('div', {}, busyButton('Vergeben', grant, { className: 'btn primary', iconName: 'check' })),
            out,
            h(
                'ul',
                { class: 'small muted' },
                h('li', {}, 'black = sehen (und SSF ausführen), red = ändern, blue = Rechte vergeben und löschen.'),
                h('li', {}, 'red schliesst black NICHT ein – wer sehen und ändern soll, braucht beide.'),
                h(
                    'li',
                    {},
                    'Ein Weg ist nur so offen wie seine engste Tür: Wer nur ein Recht auf einen Teil hat, muss auch die Website sehen dürfen (z.B. „nur eingeloggte“).'
                )
            )
        ),
        invitationsCard(o, isPart)
    );
};

// --- Karte "Einladungen" im Reiter "Zugriff" ---
// Plan "Login auf Websites", Etappe 6: Statt einer UUID einen Link schicken.
// Erstellen nur ein eingeloggter Mensch (keine Gäste, keine KI). Der Link
// steht NUR in der Antwort beim Erstellen – danach kennt ihn niemand mehr.
const invitationsCard = (o, isPart) => {
    const loggedIn = getSession().identity?.kind === 'user';
    const listBox = h('div');
    const created = h('div');

    const loadList = async () => {
        mount(listBox, spinner('Lade Einladungen …'));
        const res = await api.get(`/api/objects/${o.uuid}/invitations`);
        if (!res.ok) return mount(listBox, resultLine(res));
        const items = res.data?.data || [];
        if (!items.length) return mount(listBox, h('p', { class: 'muted small' }, 'Noch keine Einladungen.'));
        mount(
            listBox,
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
                            h('th', {}, 'Rechte'),
                            h('th', {}, 'Bereich'),
                            h('th', {}, 'Angenommen'),
                            h('th', {}, 'Gültig bis'),
                            h('th', {}, 'Status'),
                            h('th', {}, '')
                        )
                    ),
                    h(
                        'tbody',
                        {},
                        items.map(inv => {
                            const status = invitationStatus(inv);
                            return h(
                                'tr',
                                {},
                                h('td', {}, invitationRolesText(inv.roles)),
                                h('td', {}, SCOPES[inv.scope]?.label || inv.scope),
                                h(
                                    'td',
                                    { title: (inv.uses || []).map(u => u.uuid).join('\n') },
                                    `${inv.usedCount} / ${inv.maxUses}`
                                ),
                                h('td', {}, formatDate(inv.expiresAt)),
                                h('td', {}, badge(status.label, status.tone)),
                                h(
                                    'td',
                                    {},
                                    status.key === 'offen'
                                        ? busyButton(
                                              'Widerrufen',
                                              async () => {
                                                  if (
                                                      !confirm(
                                                          'Diese Einladung widerrufen? Der Link gilt danach nicht mehr.'
                                                      )
                                                  )
                                                      return;
                                                  const del = await api.del(
                                                      `/api/objects/${o.uuid}/invitations/${inv.uuid}`
                                                  );
                                                  if (!del.ok)
                                                      return toast(del.error || 'Hat nicht geklappt.', 'error');
                                                  toast('Einladung widerrufen.', 'ok');
                                                  loadList();
                                              },
                                              { className: 'btn small' }
                                          )
                                        : null
                                )
                            );
                        })
                    )
                )
            ),
            h(
                'p',
                { class: 'muted small' },
                'Schon vergebene Rechte bleiben beim Widerrufen bestehen – die nimmst du oben weg.'
            )
        );
    };

    // --- Formular ---
    const roleBox = value => h('input', { type: 'checkbox', value, checked: value === 'black', disabled: !loggedIn });
    const black = roleBox('black');
    const red = roleBox('red');
    let scope = 'familie';
    const validity = h(
        'select',
        { class: 'input', disabled: !loggedIn },
        INVITE_VALIDITY.map(v =>
            h('option', { value: String(v.hours), selected: v.hours === DEFAULT_INVITE_HOURS }, v.label)
        )
    );
    const uses = h('input', {
        class: 'input',
        type: 'number',
        min: '1',
        max: '100',
        value: '1',
        disabled: !loggedIn
    });
    const scopeChoice = isPart
        ? h(
              'div',
              { class: 'row gap-s wrap' },
              ['familie', 'teil'].map(value =>
                  h(
                      'label',
                      { class: 'check' },
                      h('input', {
                          type: 'radio',
                          name: 'invite-scope',
                          value,
                          checked: value === scope,
                          disabled: !loggedIn,
                          onchange: () => (scope = value)
                      }),
                      h('span', {}, SCOPES[value].label)
                  )
              )
          )
        : null;

    const create = async () => {
        const roles = [black, red].filter(x => x.checked).map(x => x.value);
        const maxUses = Number(uses.value);
        const problem = checkInviteForm({ roles, maxUses });
        if (problem) return toast(problem, 'error');
        const res = await api.post(`/api/objects/${o.uuid}/invitations`, {
            roles,
            scope,
            hours: Number(validity.value),
            maxUses
        });
        if (!res.ok) return mount(created, resultLine(res));
        const link = res.data?.data?.link || '';
        mount(
            created,
            callout(
                'ok',
                'Einladung erstellt. ',
                'Kopiere den Link jetzt und schick ihn der Person – er wird nur dieses eine Mal angezeigt.'
            ),
            h(
                'div',
                { class: 'row gap-s' },
                h('code', { class: 'mono small', style: 'word-break: break-all' }, link),
                copyButton(link, 'Link kopieren')
            )
        );
        loadList();
    };

    loadList();
    return card(
        {
            title: 'Einladungen',
            icon: 'link',
            subtitle: 'Statt einer UUID einen Link schicken: Wer ihn annimmt (mit at0mic-Konto), bekommt das Recht.'
        },
        loggedIn
            ? null
            : callout(
                  'info',
                  'Nur mit Login:',
                  ' Einladungen erstellt nur ein eingeloggter Mensch (keine Gäste, keine KI). Logge dich oben rechts ein.'
              ),
        h(
            'div',
            { class: 'row gap-s wrap' },
            h('label', { class: 'check' }, black, h('span', {}, 'sehen (black)')),
            h('label', { class: 'check' }, red, h('span', {}, 'ändern (red)'))
        ),
        scopeChoice,
        h('div', { class: 'row gap-s wrap' }, field('Gültig', validity), field('Wie viele Personen?', uses)),
        loggedIn
            ? h('div', {}, busyButton('Link erstellen', create, { className: 'btn primary', iconName: 'link' }))
            : null,
        created,
        h(
            'ul',
            { class: 'small muted' },
            h('li', {}, 'Annehmen geht nur per Klick – eine Vorschau in WhatsApp & Co. verbraucht den Link nicht.'),
            h('li', {}, 'Nie blue per Link. Hast du selbst kein blue mehr, gilt deine Einladung nicht mehr.')
        ),
        h('h4', {}, 'Bisherige Einladungen'),
        listBox
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

// --- Reiter "Sichtbarkeit" ---
// PUT /api/objects/:uuid/visibility { visibility, includeChildren }
// Braucht blue auf das Objekt UND einen echten Login (Gäste dürfen nichts
// veröffentlichen). Die Sichtbarkeit gilt pro Objekt – eine Website kann
// einzelne Teile öffentlich, andere nur für Eingeloggte oder privat haben.
const renderVisibilityTab = (box, o, objects, { onDone }) => {
    const current = visibilityInfo(o.visibility);
    const identity = getSession().identity;
    const loggedIn = identity?.kind === 'user';
    const kids = descendantsOf(o, objects).length;
    let chosen = current.value;

    const options = VISIBILITY_ORDER.map(value => {
        const info = visibilityInfo(value);
        const radio = h('input', {
            type: 'radio',
            name: 'visibility',
            value,
            checked: value === current.value,
            disabled: !loggedIn,
            onchange: () => (chosen = value)
        });
        return h(
            'label',
            { class: `vis-option ${value === current.value ? 'current' : ''}` },
            radio,
            h(
                'span',
                {},
                h('strong', {}, `${info.emoji} ${info.label}`),
                value === current.value ? h('span', { class: 'muted small' }, ' (jetzt)') : null,
                h('span', { class: 'muted small block' }, info.text)
            )
        );
    });

    const withChildren = h('input', { type: 'checkbox', disabled: !loggedIn || kids === 0 });
    const out = h('div');

    const save = async () => {
        if (chosen === 'public' || chosen === 'members') {
            const info = visibilityInfo(chosen);
            const who = withChildren.checked
                ? `„${objectLabel(o)}“ und ${kids} Unter-Objekt(e)`
                : `„${objectLabel(o)}“`;
            if (!confirm(`${who} auf „${info.label}“ stellen?\n\n${info.text}`)) return;
        }
        const res = await api.put(`/api/objects/${o.uuid}/visibility`, {
            visibility: chosen,
            includeChildren: withChildren.checked
        });
        mount(out, resultLine(res));
        if (res.ok) {
            toast(`Sichtbarkeit: ${visibilityInfo(chosen).label} (${res.data?.data?.changed ?? 1} Objekt(e))`, 'ok');
            onDone(o.uuid);
        }
    };

    mount(
        box,
        card(
            {
                title: 'Sichtbarkeit',
                icon: 'shield',
                subtitle: 'Wer darf dieses Objekt ansehen und seine SSF ausführen – auch ohne Rolle?'
            },
            loggedIn
                ? null
                : callout(
                      'info',
                      'Nur mit Login:',
                      ' Gäste können nichts veröffentlichen (Schutz vor anonymen Betrugs-Seiten). Logge dich oben rechts ein.'
                  ),
            h('div', { class: 'vis-options' }, options),
            h(
                'label',
                { class: 'check' },
                withChildren,
                h(
                    'span',
                    {},
                    kids
                        ? `Auch für alle ${kids} Unter-Objekte darunter übernehmen`
                        : 'Auch für Unter-Objekte übernehmen (dieses Objekt hat keine)'
                )
            ),
            h(
                'ul',
                { class: 'small muted' },
                h('li', {}, 'Daten, Ändern, Löschen und Rechte bleiben immer bei den Rollen (Triplets).'),
                h('li', {}, 'SSF-Code sieht nur, wer red hat – auch bei öffentlichen Objekten.'),
                h(
                    'li',
                    {},
                    'Ein Weg ist nur so offen wie seine engste Tür: Liegt ein öffentliches Objekt unter einem privaten, findet ein Fremder es über den Pfad nicht.'
                ),
                h('li', {}, 'Neue Objekte, Kopien und gezügelte Objekte sind immer zuerst privat.')
            ),
            h(
                'div',
                {},
                loggedIn ? busyButton('Speichern', save, { className: 'btn primary', iconName: 'check' }) : null
            ),
            out
        )
    );
};

// --- Reiter "Website" ---
// Plan "Bauarbeiter + Bauplan-Format": Jede Domain kann eine Website sein
// (<name>.at0mic.site). Ohne Anmeldung ist nur online, was ÖFFENTLICH ist.
// Seit "Login auf Websites" sehen angemeldete Besucher zusätzlich, was sie
// dürfen (Reiter "Zugriff"). Hier siehst du, ob die Website öffentlich ist,
// welche Teile ohne Anmeldung fehlen, und den Bauplan (GET /api/sites/<name>).
const renderSiteTab = (box, o, objects, { onTab }) => {
    const status = siteStatus(o, objects);

    if (status.kind === 'child') {
        const parent = objects.find(x => x.domain === status.family);
        return mount(
            box,
            card(
                { title: 'Website', icon: 'external' },
                callout(
                    'info',
                    'Teil einer Website: ',
                    `Websites gibt es pro Domain. Dieses Unter-Objekt erscheint auf der Website von „${status.family}“ – für alle, wenn es öffentlich ist, sonst für angemeldete Besucher, die es sehen dürfen (Reiter „Zugriff“).`
                ),
                parent ? h('a', { class: 'btn', href: href('objekte', parent.uuid) }, `Zu „${status.family}“`) : null
            )
        );
    }

    if (status.kind === 'badName') {
        return mount(
            box,
            card(
                { title: 'Website', icon: 'external' },
                callout(
                    'warn',
                    'Dieser Name kann keine Website werden. ',
                    'Adressen wie name.at0mic.site erlauben nur Kleinbuchstaben, Ziffern und „-“ (nicht am Anfang oder Ende, max. 63 Zeichen). ',
                    `Gesperrt sind ausserdem: ${RESERVED_SITE_NAMES.join(', ')}.`
                )
            )
        );
    }

    const url = siteUrl(siteUrlTemplate(), status.name);
    const planBox = h('div');

    const loadPlan = async () => {
        mount(planBox, spinner('Hole den Bauplan …'));
        const res = await api.get(`/api/sites/${encodeURIComponent(status.name)}`);
        if (!res.ok) {
            return mount(
                planBox,
                resultLine(res),
                // Fehler im SSF-Code: hier (für dich) mit Details – Besucher sehen sie nie
                res.data?.details ? h('pre', { class: 'json' }, String(res.data.details)) : null,
                res.status === 404
                    ? h(
                          'p',
                          { class: 'small muted' },
                          'Das Backend kennt keine öffentliche Website unter diesem Namen.'
                      )
                    : null
            );
        }
        const plan = res.data.data;
        const source = res.data.meta?.source === 'ssf' ? 'von der SSF der Domain' : 'statisch aus den Objekten (DNA)';
        const rows = bauplanFiles(plan);
        mount(
            planBox,
            resultLine(res),
            infoList([
                ['Quelle', source],
                ['Dateien', `${rows.length} · ${formatBytes(rows.reduce((sum, r) => sum + r.bytes, 0))}`],
                ['Zwischenspeicher', `${plan.cache} s (so lange bleibt eine Änderung unsichtbar)`]
            ]),
            h(
                'div',
                { class: 'table-wrap' },
                h(
                    'table',
                    { class: 'data-table' },
                    h('thead', {}, h('tr', {}, h('th', {}, 'Datei'), h('th', {}, 'Grösse'))),
                    h(
                        'tbody',
                        {},
                        rows.map(r =>
                            h(
                                'tr',
                                {},
                                h(
                                    'td',
                                    { class: 'mono' },
                                    url && status.online
                                        ? h(
                                              'a',
                                              {
                                                  href: fileUrl(url, r.path),
                                                  target: '_blank',
                                                  rel: 'noopener noreferrer'
                                              },
                                              r.path
                                          )
                                        : r.path
                                ),
                                h('td', { class: 'num' }, formatBytes(r.bytes))
                            )
                        )
                    )
                )
            ),
            h(
                'details',
                {},
                h('summary', { class: 'small' }, 'Ganzer Bauplan (JSON)'),
                jsonView(plan, { maxHeight: '420px' })
            )
        );
    };

    mount(
        box,
        card(
            {
                title: 'Website',
                icon: 'external',
                subtitle:
                    'Jede Domain kann eine Website sein. Ohne Anmeldung sieht man nur Öffentliches, angemeldete Besucher dazu, was sie dürfen.'
            },
            infoList([
                ['Adresse', url ? h('code', {}, url) : 'unbekannt (Frontend ohne /config.json)'],
                [
                    'Status',
                    status.online
                        ? badge('🌍 online', 'ok')
                        : badge(`${visibilityInfo(o.visibility).emoji} nicht online`, 'neutral')
                ]
            ]),
            status.online
                ? null
                : callout(
                      'warn',
                      'Nicht öffentlich: ',
                      `„${status.name}“ ist ${visibilityInfo(o.visibility).label.toLowerCase()}. Ohne Anmeldung sieht man nur „Diese Website ist privat – Anmelden“. Wer sich auf der Website mit seinem at0mic-Konto anmeldet, sieht, was er darf (${o.visibility === 'members' ? 'jeder Angemeldete' : 'nur wer eine Rolle hat'} – siehe Reiter „Zugriff“). Für alle öffentlich: Reiter „Sichtbarkeit“ (nur ein eingeloggter Mensch, nie eine KI).`
                  ),
            status.online && status.hidden.length
                ? callout(
                      'info',
                      `${status.hidden.length} Teil(e) fehlen für Besucher ohne Anmeldung: `,
                      `${hiddenNames(status.hidden)} – sie sind nicht öffentlich. Angemeldete Besucher sehen sie, wenn sie dürfen (Reiter „Zugriff“ bzw. „Sichtbarkeit“ des Teils).`
                  )
                : null,
            isTestMode()
                ? callout(
                      'test',
                      'Test-Modus: ',
                      'Der Bauplan unten kommt aus der Test-Datenbank. Die Adresse oben zeigt, was der Bauarbeiter dieses Frontends ausliefert (normalerweise Live).'
                  )
                : null,
            h(
                'div',
                { class: 'row gap-s wrap' },
                url
                    ? h(
                          'a',
                          { class: 'btn primary', href: url, target: '_blank', rel: 'noopener noreferrer' },
                          icon('external', { size: 16 }),
                          status.online ? 'Website öffnen' : 'Website öffnen (mit Anmeldung)'
                      )
                    : null,
                busyButton('Bauplan ansehen', loadPlan, { className: 'btn', iconName: 'layers' }),
                status.online
                    ? null
                    : h(
                          'button',
                          { class: 'btn', type: 'button', onclick: () => onTab('sichtbar') },
                          'Zur Sichtbarkeit'
                      )
            ),
            planBox,
            h(
                'ul',
                { class: 'small muted' },
                h(
                    'li',
                    {},
                    'Ohne SSF baut at0mic die Website aus der DNA: dein HTML, die Kinder in ihren Plätzen (<div data-slot="name">) oder darunter, alles CSS in style.css, das JS jedes Objekts als eigene Datei – wie die Vorschau.'
                ),
                h(
                    'li',
                    {},
                    'Mit einer SSF auf der Domain liefert sie den Bauplan selbst: return { bauplan: 1, files: { "index.html": "…", "blog/post.md": "# …" }, cache: 60 }. Sie erkennt die Anfrage an requestContext.site.'
                ),
                h(
                    'li',
                    {},
                    'Adressen ohne Endung finden .html und .md (Markdown wird zur Seite), eine eigene 404.html ist möglich.'
                )
            )
        )
    );
};

// --- Reiter "Löschen" ---
// DELETE /api/objects/:uuid  -> endgültig weg (Plan "Objekte löschen" in Notion)
// Deutliche Rückfrage: Man muss den Namen abtippen UND nochmals bestätigen.
const renderDeleteTab = (box, o, objects, { onDeleted }) => {
    const label = objectLabel(o);
    const check = deleteCheck(o, objects);
    const parent = isRoot(o) ? null : findParent(objects, o);

    const rules = h(
        'ul',
        { class: 'small muted' },
        h(
            'li',
            {},
            '🗑️ Endgültig: Code (alle Versionen), Daten, Tresor-Schlüssel, Relationen und Rechte sind danach weg.'
        ),
        isRoot(o)
            ? h('li', {}, `🔒 Der Name „${o.domain}“ wird für immer gesperrt – niemand bekommt ihn wieder.`)
            : h('li', {}, `👪 Die Familie „${o.domain_ref}“ und ihre Rechte bleiben unverändert.`),
        h(
            'li',
            {},
            '🧬 Kopien (Klone) anderer bleiben erhalten. Wer das Objekt live eingehängt hat, sieht es nicht mehr.'
        ),
        h('li', {}, 'Dafür brauchst du blue auf dieses Objekt.')
    );

    if (!check.ok) {
        mount(
            box,
            card(
                { title: 'Löschen', icon: 'trash', subtitle: 'Ein Objekt endgültig entfernen.' },
                rules,
                callout('info', 'Löschen nicht möglich:', ' ', check.reason)
            )
        );
        return;
    }

    // Name abtippen: erst dann wird der Knopf aktiv
    const confirmInput = h('input', { class: 'input', placeholder: label, autocomplete: 'off' });
    const fromDna = h('input', { type: 'checkbox', checked: true });
    const stepsLog = h('div', { class: 'steps-log' });

    const doDelete = async () => {
        if (confirmInput.value.trim() !== label) {
            return toast(`Bitte zuerst „${label}“ ins Feld tippen.`, 'error');
        }
        if (!confirm(`„${label}“ wirklich endgültig löschen?\n\nDas kann nicht rückgängig gemacht werden.`)) return;
        mount(stepsLog);

        // Schritt 1: löschen
        const res = await api.del(`/api/objects/${o.uuid}`);
        log(stepsLog, '1. Löschen', res);
        if (!res.ok) {
            // "Nie herrenlos": das Backend nennt die betroffenen Objekte
            const orphans = res.data?.orphans;
            if (Array.isArray(orphans) && orphans.length) {
                stepsLog.append(
                    callout(
                        'warn',
                        'Tipp:',
                        ` Gib zuerst auf ${orphans.join(', ')} jemand anderem blue (Seite Rechte), dann geht das Löschen.`
                    )
                );
            }
            return;
        }
        const lost = res.data?.removedMembers || 0;
        if (lost)
            stepsLog.append(
                callout('warn', `${lost} Mitglied${lost === 1 ? '' : 'er'}`, ' hat/haben dabei Rechte verloren.')
            );

        // Schritt 2 (optional, nur bei Kindern): Eintrag aus der DNA des Eltern-Objekts entfernen,
        // sonst zeigt die DNA weiter auf ein Objekt, das es nicht mehr gibt
        if (parent && fromDna.checked) {
            const code = await loadCode(parent.uuid);
            let dna = null;
            try {
                dna = code.code.syntax ? JSON.parse(code.code.syntax) : null;
            } catch {
                stepsLog.append(
                    callout(
                        'error',
                        'Die DNA des Eltern-Objekts ist kein gültiges JSON.',
                        ' Bitte im Code-Editor reparieren.'
                    )
                );
            }
            if (dna) {
                const { dna: updated, removed } = removeChildFromDna(dna, childRefFor(o, label));
                if (removed) {
                    const save = await saveCode(parent.uuid, [
                        { type: 'syntax', code: JSON.stringify(updated, null, 2) }
                    ]);
                    log(stepsLog, '2. Aus der DNA des Eltern-Objekts entfernen', save);
                } else {
                    stepsLog.append(
                        h('div', { class: 'muted small' }, '2. Stand nicht in der DNA des Eltern-Objekts.')
                    );
                }
            }
        }

        toast(`„${label}“ gelöscht.`, 'ok');
        onDeleted(parent?.uuid || null);
    };

    mount(
        box,
        card(
            { title: 'Löschen', icon: 'trash', subtitle: 'Ein Objekt endgültig entfernen. Es gibt keinen Papierkorb.' },
            rules,
            parent
                ? h(
                      'label',
                      { class: 'check' },
                      fromDna,
                      h('span', {}, `Auch aus der DNA von „${objectLabel(parent)}“ entfernen (empfohlen)`)
                  )
                : null,
            field('Zur Sicherheit: Namen abtippen', confirmInput, `Tippe „${label}“, um das Löschen freizugeben.`),
            h('div', {}, busyButton('Endgültig löschen', doDelete, { className: 'btn danger', iconName: 'trash' })),
            stepsLog
        )
    );
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
        { id: 'zugriff', label: 'Zugriff' },
        { id: 'kind', label: 'Kind anhängen' },
        { id: 'kopie', label: 'Klonen & Zügeln' },
        { id: 'sichtbar', label: 'Sichtbarkeit' },
        { id: 'website', label: 'Website' },
        { id: 'loeschen', label: 'Löschen' }
    ];
    let bar = null;
    const show = id => {
        onTab(id);
        currentPreview?.destroy(); // alte Vorschau abmelden
        currentPreview = null;
        if (id === 'info') renderInfoTab(body, o, objects);
        else if (id === 'vorschau') renderPreviewTab(body, o, objects);
        else if (id === 'baum') renderTreeTab(body, o, objects);
        else if (id === 'rollen') renderRolesTab(body, o);
        else if (id === 'zugriff') renderAccessTab(body, o, objects);
        else if (id === 'kopie') renderCopyTab(body, o, objects, { onDone: uuid => reload(uuid) });
        else if (id === 'sichtbar') renderVisibilityTab(body, o, objects, { onDone: uuid => reload(uuid) });
        else if (id === 'website') renderSiteTab(body, o, objects, { onTab: next => bar.select(next) });
        else if (id === 'loeschen')
            renderDeleteTab(body, o, objects, {
                // Nach dem Löschen: zum Eltern-Objekt (bei einem Kind) oder zur Liste
                onDeleted: parentUuid => {
                    onTab('info');
                    if (parentUuid) return reload(parentUuid);
                    invalidateObjects();
                    location.hash = href('objekte');
                }
            });
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
                    badge(
                        `${visibilityInfo(o.visibility).emoji} ${visibilityInfo(o.visibility).label}`,
                        visibilityInfo(o.visibility).tone
                    ),
                    h('code', { class: 'small', title: o.uuid }, shortUuid(o.uuid))
                )
            ),
            h(
                'div',
                { class: 'row gap-s' },
                h('a', { class: 'btn', href: href('code', o.uuid) }, icon('code', { size: 16 }), 'Code bearbeiten')
            )
        ),
        (bar = tabs(TABS, { active, onChange: show })),
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
