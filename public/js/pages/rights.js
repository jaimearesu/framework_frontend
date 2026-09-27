// js/pages/rights.js
// ---------------------------------------------------------------------
// RECHTE – Triplets und Rollen
//
// Grundbegriffe:
//   Triplet  = eine "Schlüsselgruppe" mit drei Rollen:
//              black (lesen/ausführen) · red (ändern) · blue (Rollen vergeben)
//   Ein Triplet SCHÜTZT alle Objekte seiner Domain (Wurzel + Kinder).
//   Wer im Triplet eine Rolle hat, hat diese Rechte auf ALLE diese Objekte.
//
// Routen:
//   GET    /api/roles/triplets/me                       -> Triplets, in denen ich blue habe
//   POST   /api/roles/triplets                          -> neues Triplet für meine Basis-Domain
//   GET    /api/objects/<uuid>/roles                    -> Rollen, die ein Objekt BESITZT
//   PUT    /api/roles/<empfänger>/triplets/<triplet>    { roleType }  (blue im Triplet nötig)
//   DELETE /api/roles/<objekt>/triplets/<triplet>/<rolle>              (blue im Triplet nötig)
//
// Schutz-Regeln des Backends (hier nur erklärt, geprüft wird im Server):
//   Umlauf-Schutz  – die letzte Rolle einer Farbe im Triplet bleibt
//   Aussperr-Schutz – ein Objekt behält immer mindestens ein black
//
// Adresse: /#/rechte/<uuid>
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
    copyButton
} from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { shortUuid, isUuid } from '../core/format.js';
import { loadObjects, loadObjectNames, objectLabel, objectFamily, invalidateObjects } from '../core/objects.js';
import { objectPicker } from '../core/picker.js';

const ROLE_TEXT = {
    black: 'lesen / ausführen',
    red: 'ändern',
    blue: 'Rollen vergeben'
};

// Rollen-Liste des Backends ({ domain: [{ role_uuid, type, domain, triplet_uuid }] })
// in Triplets umbauen (reine Funktion, getestet):
//   [{ triplet, domain, roles: ['black','red'], protecting: true }]
export const groupRolesByTriplet = (rolesByDomain, family) => {
    const map = new Map();
    for (const [domain, roles] of Object.entries(rolesByDomain || {})) {
        for (const r of roles || []) {
            if (!map.has(r.triplet_uuid))
                map.set(r.triplet_uuid, { triplet: r.triplet_uuid, domain, roles: [], protecting: domain === family });
            map.get(r.triplet_uuid).roles.push(r.type);
        }
    }
    const order = ['black', 'red', 'blue'];
    return [...map.values()]
        .map(t => ({ ...t, roles: order.filter(x => t.roles.includes(x)) }))
        .sort((a, b) => Number(b.protecting) - Number(a.protecting) || a.domain.localeCompare(b.domain));
};

export default {
    async render(root, { params }) {
        root.append(
            pageHeader({
                intro: 'Wer darf was? Rechte hängen an Triplets mit drei Rollen. Ein Triplet schützt alle Objekte seiner Domain – wer darin eine Rolle hat, hat diese Rechte auf die ganze Familie.'
            })
        );

        const res = await loadObjects();
        if (!res.ok) return root.append(callout('error', 'Konnte Objekte nicht laden:', ' ', res.error));
        const objects = res.data;
        await loadObjectNames(objects);

        const uuid = params[0] || null;
        const obj = objects.find(o => o.uuid === uuid) || null;

        // ==========================================================
        // 1. MEINE TRIPLETS
        // ==========================================================
        const myBox = h('div', {}, spinner());
        let myTriplets = [];
        const loadMine = async () => {
            const r = await api.get('/api/roles/triplets/me');
            if (!r.ok) return mount(myBox, resultLine(r));
            myTriplets = Array.isArray(r.data) ? r.data : [];
            if (!myTriplets.length)
                return mount(
                    myBox,
                    emptyState({
                        icon: 'shield',
                        title: 'Noch keine',
                        text: 'Sobald du eine Domain anlegst, bekommst du ihr Triplet mit allen drei Rollen.'
                    })
                );
            mount(
                myBox,
                h(
                    'ul',
                    { class: 'triplet-list' },
                    myTriplets.map(t => {
                        const domainObject = objects.find(o => o.domain === t.domain);
                        return h(
                            'li',
                            {},
                            icon('shield', { size: 16 }),
                            domainObject
                                ? h('a', { href: href('rechte', domainObject.uuid) }, t.domain)
                                : h('span', {}, t.domain),
                            h('code', { class: 'small muted', title: t.triplet_uuid }, shortUuid(t.triplet_uuid)),
                            copyButton(t.triplet_uuid, 'Triplet-UUID kopieren')
                        );
                    })
                )
            );
        };

        const tripletOut = h('div');
        root.append(
            h(
                'div',
                { class: 'grid-2' },
                card(
                    {
                        title: 'Meine Triplets',
                        icon: 'shield',
                        subtitle: 'Alle Triplets, in denen du blue hast (also Rollen vergeben darfst).'
                    },
                    myBox,
                    h(
                        'details',
                        { class: 'raw' },
                        h('summary', {}, 'Neues Triplet anlegen …'),
                        h(
                            'p',
                            { class: 'small muted' },
                            'Legt ein zusätzliches Triplet für deine persönliche Basis-Domain an (du bekommst alle drei Rollen). Für Projekte brauchst du das selten – jede neue Domain bringt ihr eigenes Triplet mit.'
                        ),
                        busyButton(
                            'Triplet anlegen',
                            async () => {
                                const r = await api.post('/api/roles/triplets', {});
                                mount(tripletOut, resultLine(r));
                                if (r.ok) loadMine();
                            },
                            { className: 'btn small' }
                        ),
                        tripletOut
                    )
                ),
                card(
                    { title: 'Die Regeln', icon: 'info' },
                    h(
                        'ul',
                        { class: 'learn' },
                        h(
                            'li',
                            {},
                            h('span', { class: 'role black' }, 'black'),
                            ' lesen und ausführen (z.B. eine SSF aufrufen)'
                        ),
                        h('li', {}, h('span', { class: 'role red' }, 'red'), ' ändern: Code, Daten, Kinder, Tresor'),
                        h(
                            'li',
                            {},
                            h('span', { class: 'role blue' }, 'blue'),
                            ' Rollen im Triplet vergeben und entziehen'
                        ),
                        h(
                            'li',
                            {},
                            h('strong', {}, 'Schutz-Regel: '),
                            'Ein Triplet schützt nur Objekte seiner eigenen Domain. Rechte IN einem fremden Triplet zu haben, heisst nicht, dass es dich schützt.'
                        ),
                        h(
                            'li',
                            {},
                            h('strong', {}, 'Umlauf-Schutz: '),
                            'Die letzte Rolle einer Farbe im Triplet kann nicht entzogen werden.'
                        ),
                        h('li', {}, h('strong', {}, 'Aussperr-Schutz: '), 'Jedes Objekt behält mindestens ein black.'),
                        h(
                            'li',
                            {},
                            h('strong', {}, 'SSFs: '),
                            'Eine SSF handelt mit den Rollen ihres EIGENEN Objekts. Gib ihr hier Rechte auf eine andere Domain, dann darf ihr Code dort lesen oder schreiben.'
                        )
                    )
                )
            )
        );
        loadMine();

        // ==========================================================
        // 2. EIN OBJEKT
        // ==========================================================
        root.append(
            h(
                'div',
                { class: 'code-picker card' },
                h('span', { class: 'card-icon' }, icon('box')),
                h(
                    'div',
                    { class: 'grow' },
                    objectPicker({
                        objects,
                        selected: uuid,
                        onSelect: id => id && (location.hash = href('rechte', id))
                    })
                )
            )
        );
        if (!obj) {
            root.append(
                card(
                    {},
                    emptyState({
                        icon: 'shield',
                        title: 'Wähle oben ein Objekt',
                        text: 'Dann siehst du seine Rollen, kannst Rechte vergeben und prüfen, was ein Fremder sieht.'
                    })
                )
            );
            return;
        }
        const family = objectFamily(obj);

        // --- Rollen des Objekts (mit Entziehen) ---
        const rolesBox = h('div', {}, spinner());
        let groups = [];
        const loadRoles = async () => {
            mount(rolesBox, spinner());
            const r = await api.get(`/api/objects/${obj.uuid}/roles`);
            if (!r.ok) return mount(rolesBox, resultLine(r));
            groups = groupRolesByTriplet(r.data, family);
            renderGrantTriplets();
            if (!groups.length) return mount(rolesBox, emptyState({ icon: 'shield', title: 'Keine Rollen' }));
            mount(
                rolesBox,
                groups.map(g =>
                    h(
                        'div',
                        { class: `role-group ${g.protecting ? 'protecting' : ''}` },
                        h(
                            'div',
                            { class: 'role-group-head' },
                            h('strong', {}, g.domain),
                            g.protecting
                                ? badge('schützt dieses Objekt', 'ok')
                                : badge('Objekt hat hier Rechte', 'accent'),
                            h('code', { class: 'small muted', title: g.triplet }, shortUuid(g.triplet))
                        ),
                        h(
                            'div',
                            { class: 'role-chips' },
                            g.roles.map(t =>
                                h(
                                    'span',
                                    { class: `role ${t} role-removable` },
                                    t,
                                    h(
                                        'button',
                                        {
                                            type: 'button',
                                            class: 'role-x',
                                            title: `${t} entziehen`,
                                            'aria-label': `${t} entziehen`,
                                            onclick: () => revoke(g.triplet, t)
                                        },
                                        '×'
                                    )
                                )
                            )
                        )
                    )
                ),
                h(
                    'p',
                    { class: 'muted small' },
                    'Entziehen (×) geht nur, wenn du blue in diesem Triplet hast. Die Schutz-Regeln verhindern, dass sich jemand aussperrt.'
                )
            );
        };
        const revokeOut = h('div');
        const revoke = async (triplet, type) => {
            if (!confirm(`Die Rolle ${type} von „${objectLabel(obj)}“ im Triplet ${shortUuid(triplet)} entziehen?`))
                return;
            const r = await api.del(`/api/roles/${obj.uuid}/triplets/${triplet}/${type}`);
            mount(revokeOut, resultLine(r));
            if (r.ok) {
                toast(`${type} entzogen.`, 'ok');
                invalidateObjects();
                loadRoles();
            }
        };

        // --- Rechte vergeben ---
        const tripletSelect = h('select', { class: 'input' });
        const renderGrantTriplets = () => {
            const protectingTriplets = groups.filter(g => g.protecting);
            mount(
                tripletSelect,
                protectingTriplets.length
                    ? protectingTriplets.map(g =>
                          h(
                              'option',
                              { value: g.triplet },
                              `${g.domain} (${shortUuid(g.triplet)}) – schützt dieses Objekt`
                          )
                      )
                    : h('option', { value: '' }, 'kein schützendes Triplet sichtbar')
            );
        };
        let recipientUuid = null;
        const recipientPicker = objectPicker({
            objects,
            placeholder: '— Empfänger aus deinen Objekten —',
            onSelect: id => (recipientUuid = id)
        });
        const recipientInput = h('input', { class: 'input mono', placeholder: '… oder UUID einfügen' });
        const roleSelect = h(
            'select',
            { class: 'input' },
            ['black', 'red', 'blue'].map(t => h('option', { value: t }, `${t} – ${ROLE_TEXT[t]}`))
        );
        const grantOut = h('div');

        // --- Was sieht ein Fremder? ---
        const strangerOut = h('div');
        const strangerCheck = async () => {
            const checks = [
                [
                    'Objekt-Liste',
                    () => api.get('/api/objects', { anonymous: true }),
                    r => r.ok && Array.isArray(r.data) && r.data.length === 0,
                    'leer'
                ],
                [
                    'Code lesen',
                    () => api.get(`/api/ast/${obj.uuid}`, { anonymous: true }),
                    r => r.status === 403 || r.status === 404,
                    '403/404'
                ],
                [
                    'Rollen ansehen',
                    () => api.get(`/api/objects/${obj.uuid}/roles`, { anonymous: true }),
                    r => r.status === 403 || r.status === 404,
                    '403/404'
                ],
                [
                    'Daten suchen',
                    () => api.post(`/api/core-data/search/${obj.uuid}`, {}, { anonymous: true }),
                    r => r.status === 403 || r.status === 404,
                    '403/404'
                ],
                [
                    'SSF ausführen',
                    () => api.post(`/api/functions/${obj.uuid}/executions`, {}, { anonymous: true }),
                    r => r.status === 403 || r.status === 404,
                    '403/404'
                ],
                [
                    'Tresor-Namen',
                    () => api.get(`/api/secrets/${obj.uuid}`, { anonymous: true }),
                    r => r.status === 403 || r.status === 404,
                    '403/404'
                ]
            ];
            mount(strangerOut, spinner('Frage als Fremder (ohne Cookies) …'));
            const rows = [];
            for (const [label, run, ok, expected] of checks) {
                const r = await run();
                rows.push({ label, r, pass: ok(r), expected });
            }
            mount(
                strangerOut,
                h(
                    'ul',
                    { class: 'check-list' },
                    rows.map(x =>
                        h(
                            'li',
                            { class: x.pass ? 'pass' : 'fail' },
                            icon(x.pass ? 'check' : 'alert', { size: 16 }),
                            h('span', { class: 'grow' }, x.label),
                            h('code', {}, String(x.r.status)),
                            h('span', { class: 'muted small' }, `erwartet: ${x.expected}`)
                        )
                    )
                ),
                rows.every(x => x.pass)
                    ? callout('ok', 'Dicht.', ' Ein Fremder sieht nichts von diesem Objekt.')
                    : callout('warn', 'Achtung:', ' Mindestens eine Prüfung verhält sich anders als erwartet.')
            );
        };

        root.append(
            h(
                'div',
                { class: 'grid-2' },
                card(
                    {
                        title: `Rollen von „${objectLabel(obj)}“`,
                        icon: 'shield',
                        subtitle: 'Was dieses Objekt selbst besitzt – je Triplet.'
                    },
                    rolesBox,
                    revokeOut
                ),
                card(
                    {
                        title: 'Rechte auf dieses Objekt vergeben',
                        icon: 'user',
                        subtitle: `Der Empfänger bekommt die Rolle im Triplet von „${family}“ – und damit auf ALLE Objekte dieser Domain.`
                    },
                    field('Triplet', tripletSelect),
                    field(
                        'Empfänger',
                        recipientPicker,
                        'Z.B. eine SSF aus einer anderen Domain – dann darf ihr Code hier arbeiten.'
                    ),
                    recipientInput,
                    field('Rolle', roleSelect),
                    h(
                        'div',
                        {},
                        busyButton(
                            'Vergeben',
                            async () => {
                                const recipient = recipientInput.value.trim() || recipientUuid;
                                if (!recipient || !isUuid(recipient))
                                    return toast(
                                        'Bitte einen Empfänger wählen oder eine gültige UUID einfügen.',
                                        'error'
                                    );
                                if (!tripletSelect.value) return toast('Kein Triplet gewählt.', 'error');
                                const r = await api.put(`/api/roles/${recipient}/triplets/${tripletSelect.value}`, {
                                    roleType: roleSelect.value
                                });
                                mount(grantOut, resultLine(r));
                                if (r.ok) {
                                    toast('Rolle vergeben.', 'ok');
                                    invalidateObjects();
                                    if (recipient === obj.uuid) loadRoles();
                                }
                            },
                            { className: 'btn primary', iconName: 'check' }
                        )
                    ),
                    grantOut,
                    callout(
                        'info',
                        'Wer hat Rechte auf dieses Objekt?',
                        ' Diese Liste gibt es über HTTP noch nicht – nur eine SSF kann sie mit api.roles.list abfragen.'
                    )
                )
            ),
            card(
                {
                    title: 'Was sieht ein Fremder?',
                    icon: 'user',
                    subtitle: 'Schickt Anfragen ohne Cookies – so, wie ein unbekannter Besucher.'
                },
                h('div', {}, busyButton('Prüfen', strangerCheck, { className: 'btn', iconName: 'shield' })),
                strangerOut
            )
        );
        loadRoles();
    }
};
