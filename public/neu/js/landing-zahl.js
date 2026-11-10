// Kleine Zeile unter den Knöpfen der Startseite: «Schon 2’307 Objekte gebaut.» mit grünem Punkt.
// Die Zahl holt sie einmal pro Seitenaufruf von GET /api/stats (siehe landing-werte.js).
// Kommt keine Zahl (unter 1000, Server weg), bleibt die Zeile einfach leer.
import { h } from './ui.js';
import { api } from '../../js/core/api.js';
import { zahlAusAntwort, zahlSchreiben, zwischenWert } from './landing-werte.js';

const DAUER_MS = 1200; // so lange zählt die Zahl beim ersten Mal hoch

let holen = null; // die Anfrage läuft nur einmal, auch wenn die Sprache wechselt
let schonGezeigt = false; // nach dem ersten Hochzählen steht die Zahl sofort da

const zahlHolen = () => {
    holen ??= api.get('/api/stats', { anonymous: true }).then(zahlAusAntwort, () => null);
    return holen;
};

const ruhigGewuenscht = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const objektZahl = (sprache, t) => {
    const text = h('span', {});
    const zeile = h(
        'p',
        { class: 'landing-zahl', id: 'objekt-zahl', hidden: true },
        h('i', { class: 'landing-zahl-punkt', 'aria-hidden': 'true' }),
        text
    );
    zahlHolen().then(zahl => {
        if (zahl === null || !zeile.isConnected) return;
        const zeigen = wert => {
            text.textContent = t.zahl(zahlSchreiben(wert, sprache));
        };
        zeile.hidden = false;
        if (schonGezeigt || ruhigGewuenscht()) {
            zeigen(zahl);
            schonGezeigt = true;
            return;
        }
        schonGezeigt = true;
        // Vorlesen: gleich die richtige Zahl, nicht jeden Zwischenschritt
        zeile.setAttribute('aria-label', t.zahl(zahlSchreiben(zahl, sprache)));
        const start = performance.now();
        const schritt = jetzt => {
            if (!zeile.isConnected) return;
            const anteil = (jetzt - start) / DAUER_MS;
            zeigen(zwischenWert(zahl, anteil));
            if (anteil < 1) requestAnimationFrame(schritt);
        };
        requestAnimationFrame(schritt);
    });
    return zeile;
};
