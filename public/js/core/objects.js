// js/core/objects.js
// ---------------------------------------------------------------------
// OBJEKTE VERSTEHEN – Hilfen rund um die Objekt-Liste
//
// So speichert das Backend Objekte (Tabelle "objects"):
//   Wurzel (eigene Domain):  domain = 'shop',  domain_ref = null,  path = ['0']
//   Hook (angehängtes Kind): domain = null,    domain_ref = 'shop', path = ['0', '2,1']
//
// Der Pfad eines Kindes ist der Pfad des Eltern-Objekts plus ein Stück
// "Schritt,Zweig":
//   Schritt = welche VERSION (Speicherstand) des Eltern-Objekts gemeint ist
//   Zweig   = das wievielte Kind an dieser Stelle (1, 2, 3 …)
// Alle Objekte mit derselben Domain (bzw. domain_ref) bilden eine "Familie".
//
// Die reinen Funktionen hier (ohne Backend) sind automatisch getestet.
// ---------------------------------------------------------------------
import { api } from './api.js';
import { apiBase } from './config.js';

// Zu welcher Familie (Domain) gehört das Objekt?
export const objectFamily = o => o?.domain || o?.domain_ref || '';

export const isRoot = o => Boolean(o?.domain);

const pathKey = (family, path) => `${family}|${JSON.stringify(path || [])}`;

// ------------------------------------------------------------------
// NAMEN DER KINDER
// Die Tabelle "objects" kennt keinen Namen für Kinder – der Name
// (identifier) steht in der DNA des Eltern-Objekts. Darum lesen wir die
// aufgelösten Bäume der Wurzeln und merken uns: (Familie, Pfad) -> Name.
// ------------------------------------------------------------------
const knownNames = new Map();

// Alle Knoten eines DNA-Baums in die Namens-Liste eintragen (reine Funktion, getestet)
export const collectNames = (tree, into = new Map()) => {
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.domain && Array.isArray(node.source) && node.identifier)
            into.set(pathKey(node.domain, node.source), String(node.identifier));
        (Array.isArray(node.children) ? node.children : []).forEach(walk);
    };
    walk(tree);
    return into;
};

// Anzeigename: Wurzel = Domain, Kind = Name aus der DNA
// (falls unbekannt: Familie + letztes Pfad-Stück, z.B. "shop › 0,1")
export const objectLabel = o => {
    if (!o) return '–';
    if (isRoot(o)) return o.domain;
    const name = knownNames.get(pathKey(o.domain_ref, o.path));
    if (name) return name;
    const path = o.path || [];
    return `${o.domain_ref} › ${path[path.length - 1] ?? '?'}`;
};

// Namen der Kinder laden (ein Baum pro Wurzel, höchstens 40 Wurzeln).
// Wird zusammen mit der Objekt-Liste zwischengespeichert.
let namesLoadedFor = null;
export const loadObjectNames = async objects => {
    if (namesLoadedFor === cache) return knownNames;
    const roots = objects.filter(o => isRoot(o) && objects.some(c => !isRoot(c) && c.domain_ref === o.domain));
    const results = await Promise.all(roots.slice(0, 40).map(r => api.get(`/api/ast/${r.uuid}/tree`)));
    knownNames.clear();
    for (const res of results) if (res.ok && res.data?.tree) collectNames(res.data.tree, knownNames);
    namesLoadedFor = cache;
    return knownNames;
};

// Neuster Speicherstand (Schritt) eines Objekts, oder null wenn noch keiner
export const latestStep = o => {
    const dir = Array.isArray(o?.path_directory) ? o.path_directory : [];
    return dir.length ? dir[dir.length - 1].step : null;
};

// Flache Liste -> Baum (Wurzeln mit ihren Kindern darunter).
// Ergebnis: [{ object, children: [{ object, children: […] }] }]
// Objekte, deren Eltern man nicht sehen darf, erscheinen oben als eigene Einträge.
export const buildObjectForest = objects => {
    const list = Array.isArray(objects) ? objects : [];
    const nodes = new Map(); // pathKey -> node
    for (const o of list) nodes.set(pathKey(objectFamily(o), o.path), { object: o, children: [] });

    const top = [];
    for (const node of nodes.values()) {
        const o = node.object;
        const path = o.path || [];
        const parent = path.length > 1 ? nodes.get(pathKey(objectFamily(o), path.slice(0, -1))) : null;
        if (parent && parent !== node) parent.children.push(node);
        else top.push(node);
    }

    // Sortieren: Wurzeln alphabetisch, Kinder nach Pfad
    const byPath = (a, b) =>
        JSON.stringify(a.object.path).localeCompare(JSON.stringify(b.object.path), 'de', { numeric: true });
    const sortDeep = arr => {
        arr.sort(byPath);
        arr.forEach(n => sortDeep(n.children));
        return arr;
    };
    top.sort((a, b) => objectLabel(a.object).localeCompare(objectLabel(b.object), 'de'));
    top.forEach(n => sortDeep(n.children));
    return top;
};

// Alle Knoten eines Baums zählen (für "3 Kinder")
export const countDescendants = node => node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);

// Das Eltern-Objekt in der Liste finden (oder null)
export const findParent = (objects, o) => {
    const path = o?.path || [];
    if (path.length < 2) return null;
    const want = pathKey(objectFamily(o), path.slice(0, -1));
    return (objects || []).find(p => pathKey(objectFamily(p), p.path) === want) || null;
};

// Den Eintrag bauen, mit dem ein Kind in der DNA des Eltern-Objekts steht.
// Der Baum wird später über genau diese Angaben (domain + source) aufgelöst.
export const childRefFor = (child, identifier) => ({
    type: 'instance',
    identifier,
    domain: objectFamily(child),
    source: child.path
});

// ------------------------------------------------------------------
// Laden (mit kurzem Zwischenspeicher, damit nicht jede Seite neu fragt)
// ------------------------------------------------------------------
let cache = null; // { at, base, result }  (base = welches Backend: Live oder Test)
const MAX_AGE_MS = 15000;

export const loadObjects = async ({ fresh = false } = {}) => {
    if (!fresh && cache && cache.base === apiBase() && Date.now() - cache.at < MAX_AGE_MS) return cache.result;
    const result = await api.get('/api/objects');
    if (result.ok && !Array.isArray(result.data)) result.data = [];
    if (result.ok) cache = { at: Date.now(), base: apiBase(), result };
    return result;
};

// Nach dem Anlegen/Ändern: nächstes Laden holt frische Daten
export const invalidateObjects = () => {
    cache = null;
};

// Code eines Objekts laden: { html: '…', css: '…', syntax: '{…}', … }
export const loadCode = async uuid => {
    const res = await api.get(`/api/ast/${encodeURIComponent(uuid)}`);
    return { ...res, code: res.ok && res.data?.data && typeof res.data.data === 'object' ? res.data.data : {} };
};

// Code speichern: snippets = [{ type: 'html', code: '…' }, …]
// Jedes Speichern erzeugt einen neuen Schritt (Version) im Objekt.
export const saveCode = (uuid, snippets) => api.post(`/api/ast/${encodeURIComponent(uuid)}`, { snippets });
