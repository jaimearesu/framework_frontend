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
//   ownerLoad    -> (freiwillig) andere Seite in der Besitzer-Ansicht (Punkt 5, D2)
//   group null   -> steht nur im Menü der Besitzer-Ansicht
//
// Welches Menü gezeigt wird, entscheidet js/core/view.js (Besitzer / Technik).
// Alle Seiten bleiben in beiden Ansichten über ihre Adresse erreichbar.
// ---------------------------------------------------------------------

export const GROUPS = ['Start', 'Bauen', 'Daten', 'Sicherheit', 'Prüfen'];

export const ROUTES = [
    {
        id: '',
        title: 'Übersicht',
        icon: 'home',
        group: 'Start',
        intro: 'Wie geht es dem System, wer bist du, und was gibt es hier?',
        load: () => import('../pages/overview.js'),
        // Besitzer-Ansicht: schlanke Startseite ohne Technik (D2; D3 bringt die Kacheln)
        ownerLoad: () => import('../pages/home.js')
    },
    {
        id: 'wartet',
        title: 'Wartet auf mich',
        icon: 'bell',
        group: null, // nur im Menü der Besitzer-Ansicht
        intro: 'Was du entscheiden musst: Freigaben für deine KI-Helfer und neue Uploads von Besuchern.',
        load: () => import('../pages/waiting.js')
    },
    {
        id: 'objekte',
        title: 'Objekte',
        icon: 'box',
        group: 'Bauen',
        intro: 'Alles in vindelis ist ein Objekt. Hier legst du sie an, hängst Kinder an und siehst den Baum.',
        load: () => import('../pages/objects.js')
    },
    {
        id: 'code',
        title: 'Code & DNA',
        icon: 'code',
        group: 'Bauen',
        intro: 'Der Inhalt eines Objekts: HTML, CSS, JS, SSF, Syntax (DNA) und Daten-Schemas.',
        load: () => import('../pages/code.js')
    },
    {
        id: 'ssf',
        title: 'SSF-Studio',
        icon: 'bolt',
        group: 'Bauen',
        intro: 'Server-Funktionen schreiben, ausführen und aus der Beispiel-Bibliothek lernen.',
        load: () => import('../pages/ssf.js')
    },
    {
        id: 'daten',
        title: 'Daten & Suche',
        icon: 'search',
        group: 'Daten',
        intro: 'Datensätze ansehen und mit der Such-Sprache (DSL) filtern, sortieren und blättern.',
        load: () => import('../pages/data.js')
    },
    {
        id: 'relationen',
        title: 'Relationen',
        icon: 'link',
        group: 'Daten',
        intro: 'Verbindungen zwischen Objekten – die Grundlage für Joins in der Suche.',
        load: () => import('../pages/relations.js')
    },
    {
        id: 'rechte',
        title: 'Rechte',
        icon: 'shield',
        group: 'Sicherheit',
        intro: 'Wer darf was? Triplets mit den Rollen black (lesen), red (ändern) und blue (Rechte vergeben).',
        load: () => import('../pages/rights.js')
    },
    {
        id: 'tresor',
        title: 'Tresor',
        icon: 'lock',
        group: 'Sicherheit',
        intro: 'Geheime Schlüssel (z.B. API-Keys) für deine SSFs. Einmal gesetzt, nie wieder lesbar.',
        load: () => import('../pages/vault.js')
    },
    {
        id: 'agenten',
        title: 'Agenten',
        icon: 'robot',
        group: 'Sicherheit',
        intro: 'Deine Agenten im Griff: was sie dürfen, wann sie gearbeitet haben und welche Werkzeuge sie wie oft benutzen.',
        load: () => import('../pages/agents.js') // Plan "Agenten im Griff" (18.10.2026)
    },
    {
        id: 'ki',
        title: 'KI-Zugänge',
        icon: 'robot',
        group: 'Sicherheit',
        intro: 'Schlüssel, mit denen eine KI (z.B. Claude) als eines deiner Objekte arbeitet – und das Protokoll, was sie getan hat.',
        load: () => import('../pages/ai.js')
    },
    {
        id: 'systemcheck',
        title: 'Systemcheck',
        icon: 'check',
        group: 'Prüfen',
        intro: 'Ein Klick – und das Cockpit prüft das ganze Backend Schritt für Schritt.',
        load: () => import('../pages/systemcheck.js')
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
