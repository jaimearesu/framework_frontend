// Preisliste (12.11.2026, Wunsch von Jaime: «grösser, attraktiver, mit Matrix, auch auf der Hauptseite»):
// Stufen-Karten mit grossem Preis und die Vergleichs-Tabelle aller Grenzen.
// Gebraucht im Cockpit (auslastung.js) und auf der Startseite (landing-inhalt.js).
// Texte immer als Text (h()), nie als HTML.
import { h } from './ui.js';
import { api } from '../../js/core/api.js';
import { matrix, stufenAusAntwort, TEXTE } from './preise-werte.js';

// Eine Karte. k = stufenKarte() aus preise-werte.js
// extra = { abzeichen, knopf, notiz, jetzt, id } – was das Cockpit dazugibt (Knopf, «Deine Stufe» …)
export const preisKarte = (k, sprache = 'de', extra = {}) =>
    h(
        'div',
        {
            class: 'preis-karte' + (k.empfohlen ? ' empfohlen' : '') + (extra.jetzt ? ' jetzt' : ''),
            id: extra.id || 'preis-' + k.id
        },
        h(
            'div',
            { class: 'preis-kopf' },
            h('h3', {}, k.name),
            extra.abzeichen || (k.empfohlen ? h('span', { class: 'preis-abzeichen' }, TEXTE[sprache].empfohlen) : null)
        ),
        h('p', { class: 'preis-kurz' }, k.kurz),
        h('p', { class: 'preis-betrag' }, h('b', {}, k.preis.betrag), h('span', {}, k.preis.einheit)),
        extra.knopf || null,
        h(
            'ul',
            { class: 'preis-liste' },
            k.zeilen.map(z => h('li', {}, z))
        ),
        extra.notiz ? h('span', { class: 'leise' }, extra.notiz) : null
    );

// Die Vergleichs-Tabelle, aufklappbar. stufen = Stufen aus dem Backend
export const preisVergleich = (stufen, sprache = 'de', offen = false) => {
    const m = matrix(stufen, sprache);
    const spalte = i => (i === m.empfohlen + 1 ? 'empfohlen' : null);
    return h(
        'details',
        { class: 'preis-vergleich', id: 'preis-vergleich', open: offen || null },
        h('summary', {}, TEXTE[sprache].vergleichen),
        h(
            'div',
            { class: 'bp-tab-wrap' },
            h(
                'table',
                { class: 'bp-tab preis-tabelle' },
                h(
                    'thead',
                    {},
                    h(
                        'tr',
                        {},
                        m.kopf.map((text, i) => h('th', { class: spalte(i), scope: 'col' }, text))
                    )
                ),
                h(
                    'tbody',
                    {},
                    m.zeilen.map(([name, ...werte]) =>
                        h(
                            'tr',
                            {},
                            h('th', { scope: 'row' }, name),
                            werte.map((w, i) => h('td', { class: spalte(i + 1) }, w))
                        )
                    )
                )
            )
        )
    );
};

// Für die Startseite: die Stufen einmal pro Seitenaufruf holen (ohne Anmeldung)
let holen = null;
export const stufenHolen = () => {
    holen ??= api.get('/api/billing/stufen', { anonymous: true }).then(stufenAusAntwort, () => null);
    return holen;
};
