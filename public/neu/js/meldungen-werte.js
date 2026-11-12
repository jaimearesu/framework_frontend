// Meldungen im Feed – Admin-Seite (Plan "N", Stufe 4, 12.11.2026):
// reine Funktionen ohne Browser, geprüft in tests/neuEntdecken.test.mjs.
import { GRUENDE } from './entdecken-werte.js';

const GRUND_TEXT = Object.fromEntries(GRUENDE);

// { spam: 3, anderes: 1 } -> "3× Spam oder Werbung, 1× Etwas anderes" (häufigste zuerst)
export const gruendeText = gruende =>
    Object.entries(gruende || {})
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([g, n]) => n + '× ' + (GRUND_TEXT[g] || g))
        .join(', ');

// Offene Meldungen oben, herausgenommene darunter
export const meldungenTeilen = liste => ({
    offen: (liste || []).filter(e => e.open > 0),
    heraus: (liste || []).filter(e => e.open === 0 && e.hidden)
});

// Zahl im Menü: wie viele Websites warten auf eine Entscheidung?
export const offeneZahl = liste => meldungenTeilen(liste).offen.length;
