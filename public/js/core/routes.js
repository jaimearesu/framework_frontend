// js/core/routes.js
// ---------------------------------------------------------------------
// DIE SEITEN DES COCKPITS – an einem Ort beschrieben.
//
// Jede Seite hat:
//   id           -> steht in der Adresse: /#/objekte
//   title        -> Überschrift und Menü-Text
//   icon         -> Symbol im Menü (siehe icons.js)
//   group        -> Menü-Gruppe
//   intro        -> ein Satz, worum es geht (wird oben auf der Seite gezeigt)
//   load         -> lädt den Code der Seite erst, wenn man sie öffnet
//   stage        -> in welcher Etappe des Umbaus die Seite dazukommt
//                   (solange sie fehlt, zeigt das Cockpit "kommt bald")
// ---------------------------------------------------------------------
const comingSoon = () => import('../pages/comingSoon.js');

export const GROUPS = ['Start', 'Bauen', 'Daten', 'Sicherheit', 'Prüfen'];

export const ROUTES = [
    {
        id: '',
        title: 'Übersicht',
        icon: 'home',
        group: 'Start',
        intro: 'Wie geht es dem System, wer bist du, und was gibt es hier?',
        load: () => import('../pages/overview.js')
    },
    {
        id: 'objekte',
        title: 'Objekte',
        icon: 'box',
        group: 'Bauen',
        intro: 'Alles in at0mic ist ein Objekt. Hier legst du sie an, hängst Kinder an und siehst den Baum.',
        stage: 2,
        load: comingSoon
    },
    {
        id: 'code',
        title: 'Code & DNA',
        icon: 'code',
        group: 'Bauen',
        intro: 'Der Inhalt eines Objekts: HTML, CSS, JS, SSF, Syntax (DNA) und Daten-Schemas.',
        stage: 2,
        load: comingSoon
    },
    {
        id: 'ssf',
        title: 'SSF-Studio',
        icon: 'bolt',
        group: 'Bauen',
        intro: 'Server-Funktionen schreiben, ausführen und aus der Beispiel-Bibliothek lernen.',
        stage: 3,
        load: comingSoon
    },
    {
        id: 'daten',
        title: 'Daten & Suche',
        icon: 'search',
        group: 'Daten',
        intro: 'Datensätze ansehen und mit der Such-Sprache (DSL) filtern, sortieren und blättern.',
        stage: 4,
        load: comingSoon
    },
    {
        id: 'relationen',
        title: 'Relationen',
        icon: 'link',
        group: 'Daten',
        intro: 'Verbindungen zwischen Objekten – die Grundlage für Joins in der Suche.',
        stage: 4,
        load: comingSoon
    },
    {
        id: 'rechte',
        title: 'Rechte',
        icon: 'shield',
        group: 'Sicherheit',
        intro: 'Wer darf was? Triplets mit den Rollen black (lesen), red (ändern) und blue (Rechte vergeben).',
        stage: 4,
        load: comingSoon
    },
    {
        id: 'tresor',
        title: 'Tresor',
        icon: 'lock',
        group: 'Sicherheit',
        intro: 'Geheime Schlüssel (z.B. API-Keys) für deine SSFs. Einmal gesetzt, nie wieder lesbar.',
        stage: 4,
        load: comingSoon
    },
    {
        id: 'systemcheck',
        title: 'Systemcheck',
        icon: 'check',
        group: 'Prüfen',
        intro: 'Ein Klick – und das Cockpit prüft das ganze Backend Schritt für Schritt.',
        stage: 5,
        load: comingSoon
    }
];

// "/#/objekte/abc?x=1" -> { id: 'objekte', params: ['abc'], query: { x: '1' } }
// (reine Funktion -> automatisch getestet)
export const parseHash = hash => {
    const raw = String(hash || '').replace(/^#\/?/, '');
    const [pathPart, queryPart = ''] = raw.split('?');
    const parts = pathPart
        .split('/')
        .filter(Boolean)
        .map(p => {
            try {
                return decodeURIComponent(p);
            } catch {
                return p;
            }
        });
    return {
        id: parts[0] || '',
        params: parts.slice(1),
        query: Object.fromEntries(new URLSearchParams(queryPart))
    };
};

// Adresse für eine Seite bauen: href('objekte', uuid) -> "#/objekte/<uuid>"
export const href = (id, ...params) =>
    '#/' + [id, ...params.filter(p => p !== undefined && p !== null && p !== '')].map(encodeURIComponent).join('/');

export const findRoute = id => ROUTES.find(r => r.id === id) || null;
