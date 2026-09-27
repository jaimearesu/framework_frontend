// js/pages/comingSoon.js
// ---------------------------------------------------------------------
// Platzhalter für Seiten, die im Umbau noch kommen. Zeigt, was die Seite
// können wird, und verweist solange auf die alte Oberfläche.
// ---------------------------------------------------------------------
import { h, card, callout } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';

// Was jede Seite können wird (aus dem Plan)
const PLANNED = {
    objekte: [
        'Objekte anlegen und Kind-Objekte anhängen',
        'Baum-Ansicht per UUID oder Pfad',
        'Details eines Objekts: Pfad, Domain, Rollen, Code'
    ],
    code: [
        'Code bearbeiten (HTML, CSS, JS, SSF, Syntax, Data) mit Farben und Zeilennummern',
        'Syntax-DNA als JSON mit Baum-Vorschau'
    ],
    ssf: [
        'SSF schreiben und ausführen – mit Ziel, Body und als welcher Besucher',
        'Ergebnis, Fehler und Dauer sehen',
        'Beispiel-Bibliothek (9 lauffähige Beispiele) und Referenz aller api-Werkzeuge'
    ],
    daten: [
        'Datensätze ansehen, anlegen und löschen',
        'Such-Spielplatz für die Query-DSL mit Beispielen',
        'Blättern vor und zurück, „mehr als 10’000“'
    ],
    relationen: ['Verbindungen ansehen und anlegen', 'Joins verstehen'],
    rechte: ['Wer hat welche Rolle (black/red/blue)?', 'Rollen vergeben und entziehen', 'Deine Triplets'],
    tresor: ['Schlüssel-Namen sehen', 'Schlüssel setzen und löschen (Werte nie sichtbar)'],
    systemcheck: ['„Teste alles“ mit einem Klick', 'rund 35 Prüfungen inkl. Sicherheit', 'Dauer und Details je Prüfung']
};

export default {
    render(root, { route }) {
        const items = PLANNED[route.id] || [];
        root.append(
            pageHeader({ intro: route.intro }),
            card(
                {
                    title: `Kommt in Etappe ${route.stage}`,
                    icon: 'layers',
                    subtitle: 'Diese Seite wird gerade neu gebaut.'
                },
                h(
                    'ul',
                    { class: 'checklist' },
                    items.map(t => h('li', {}, icon('arrowRight', { size: 16 }), h('span', {}, t)))
                ),
                callout(
                    'info',
                    'Bis dahin:',
                    ' Die alte Oberfläche ist weiterhin erreichbar – ',
                    h('a', { href: '/legacy/', target: '_blank', rel: 'noopener' }, 'Alte Oberfläche öffnen'),
                    '.'
                )
            )
        );
    }
};
