// js/core/view.js
// ---------------------------------------------------------------------
// ZWEI ANSICHTEN (Punkt 5, D2, 28.10.2026)
//
//   besitzer  -> der Normalfall: Übersicht, Wartet auf mich, KI-Helfer und
//                die eigenen Websites als Baum. Keine Fachwörter.
//   technik   -> die bisherigen Seiten (Objekte, Code & DNA, SSF-Studio,
//                Daten, Rechte, Tresor, Systemcheck …) mit allen Details.
//
// Die Technik darunter ist dieselbe – es ändert sich nur, was man sieht.
// Der Browser merkt sich die Wahl (Entscheidung N1: Standard = besitzer).
// Die reinen Funktionen hier werden in tests/view.test.mjs geprüft.
// ---------------------------------------------------------------------
import { emit } from './events.js';
import { load, save } from './storage.js';

export const VIEWS = ['besitzer', 'technik'];
const DEFAULT_VIEW = 'besitzer';

// Gültige Ansicht aus einem gespeicherten Wert (Unsinn -> Standard)
export const normalizeView = v => (VIEWS.includes(v) ? v : DEFAULT_VIEW);

export const getView = () => normalizeView(load('view'));
export const isTechView = () => getView() === 'technik';

export const setView = v => {
    const next = normalizeView(v);
    save('view', next);
    document.body.dataset.view = next;
    emit('view', next);
};

// ------------------------------------------------------------------
// Menü der Besitzer-Ansicht (die Websites kommen separat als Baum dazu)
// ------------------------------------------------------------------
export const OWNER_NAV = [
    { id: '', title: 'Übersicht', icon: 'home' },
    { id: 'wartet', title: 'Wartet auf mich', icon: 'bell', badge: 'waiting' },
    { id: 'agenten', title: 'KI-Helfer', icon: 'robot' }
];

// Seiten, die in der Besitzer-Ansicht einen anderen Namen tragen
const OWNER_TITLES = { agenten: 'KI-Helfer' };
export const titleFor = (route, view) => (view === 'besitzer' && OWNER_TITLES[route.id]) || route.title;

// ------------------------------------------------------------------
// WEBSITES-BAUM aus der Objekt-Liste (GET /api/objects)
//
//   Wurzel (eigene Domain):  domain = 'shop', path = ['0']
//   direktes Kind:           domain_ref = 'shop', path = ['0', '3']  (zwei Stufen)
//
// Weggelassen werden (Entscheidung N2): das eigene Benutzer-Objekt und die
// Agenten (die stehen unter "KI-Helfer"). Reine Speicher und Werkzeugkästen
// erscheinen vorerst mit – erst die Route aus D3 erkennt sie sauber.
// Rückgabe: [{ uuid, name, visibility, children: [{ uuid, name }] }], nach Namen sortiert.
// ------------------------------------------------------------------
const byName = (a, b) => a.name.localeCompare(b.name, 'de');

export const websiteTree = (objects, { excludeUuids = [] } = {}) => {
    const list = Array.isArray(objects) ? objects : [];
    const skip = new Set(excludeUuids.filter(Boolean));
    const roots = list.filter(o => o && o.domain && !skip.has(o.uuid));
    return roots
        .map(root => ({
            uuid: root.uuid,
            name: String(root.domain),
            visibility: root.visibility || 'private',
            children: list
                .filter(c => c && !c.domain && c.domain_ref === root.domain && (c.path || []).length === 2)
                .map(c => ({
                    uuid: c.uuid,
                    // Name des Kindes steht in der DNA der Wurzel (Backend liefert ihn als identifier)
                    name: c.identifier ? String(c.identifier) : `Teil ${(c.path || [])[1] ?? '?'}`
                }))
                .sort(byName)
        }))
        .sort(byName);
};

// ------------------------------------------------------------------
// Fehler-Leiste: in der Besitzer-Ansicht in Alltagssprache (keine Befehle)
// kind: 'offline' | 'database'
// ------------------------------------------------------------------
export const ownerProblemText = kind =>
    kind === 'database'
        ? 'vindelis kann gerade nicht auf die Daten zugreifen. Versuch es in einer Minute nochmals.'
        : 'vindelis ist gerade nicht erreichbar. Versuch es in einer Minute nochmals.';

// Begrüssung nach Tageszeit (Stunde 0–23)
export const greetingFor = hour =>
    hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';

// Adresse einer Website zum Anzeigen: Vorlage "https://{name}.vindelis.site" -> "name.vindelis.site"
export const siteAddress = (template, name) => {
    if (!template || !name) return '';
    return String(template)
        .replace('{name}', name)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
};
