// Bausteine für die Bereiche der Einstellungen: Laden, Formular-Dialog, Teil-Auswahl.
// Eingaben stehen immer in einem Dialog. So gehen sie nicht verloren, wenn die Seite neu zeichnet.
import { h, ikon, leer, dialog, huelle, laedtKarte } from './ui.js';
import { hinweiseFuerMenschen } from './einstellungen-werte.js';

const FRISCH_MS = 30000;
const speicher = new Map();

const starten = async eintrag => {
    eintrag.laeuft = true;
    eintrag.zeit = Date.now();
    const antwort = await eintrag.holen();
    eintrag.laeuft = false;
    const vorher = JSON.stringify([eintrag.daten, eintrag.fehler, eintrag.da]);
    eintrag.da = true;
    eintrag.status = antwort.status;
    eintrag.daten = antwort.ok ? (antwort.data?.data ?? null) : null;
    eintrag.fehler = antwort.ok ? null : antwort.error || 'Das hat gerade nicht geklappt.';
    // Nur neu zeichnen, wenn sich etwas geändert hat
    if (vorher !== JSON.stringify([eintrag.daten, eintrag.fehler, eintrag.da])) huelle.neu();
};

// Holt Daten einmal und hält sie kurz fest. schluessel sagt, wozu sie gehören
export const geladen = (schluessel, holen) => {
    let eintrag = speicher.get(schluessel);
    if (!eintrag) {
        eintrag = { daten: null, fehler: null, status: 0, zeit: 0, laeuft: false, da: false };
        speicher.set(schluessel, eintrag);
    }
    eintrag.holen = holen;
    if (!eintrag.laeuft && Date.now() - eintrag.zeit > FRISCH_MS) starten(eintrag);
    return eintrag;
};

// Nach einer Änderung sofort den neuen Stand holen
export const nochmals = async schluessel => {
    const eintrag = speicher.get(schluessel);
    if (eintrag) await starten(eintrag);
};

// Zeigt Laden und Fehler. Sind die Daten da, zeichnet zeichne() sie
export const mitDaten = (eintrag, zeichne, { symbol = 'werkstatt' } = {}) => {
    if (!eintrag.da) return laedtKarte();
    if (eintrag.fehler) {
        const rechte = eintrag.status === 403 || eintrag.status === 404;
        return h(
            'div',
            { class: 'bp-karte', id: 'bereich-fehler' },
            leer(symbol, rechte ? 'Keine Berechtigung' : 'Konnte das nicht laden', eintrag.fehler)
        );
    }
    return zeichne(eintrag.daten);
};

// Kopf eines Bereichs mit dem Weg zurück zur Übersicht
export const bereichKopf = (w, titel, text, knopf) =>
    h(
        'div',
        { class: 'stapel' },
        h('a', { class: 'zurueck', href: '#/website/' + w.id + '/einstellungen' }, ikon('zurueck'), 'Einstellungen'),
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('div', { class: 'zeile-text' }, h('h3', {}, titel), h('span', { class: 'leise' }, text)),
            knopf || null
        )
    );

const feldBauen = f => {
    if (f.art === 'checkbox') {
        const box = h('input', { type: 'checkbox', class: 'bp-cb', id: 'fm-' + f.name, checked: Boolean(f.wert) });
        return {
            eingabe: box,
            teil: h('label', { class: 'wahl-zeile' }, box, h('span', {}, f.label)),
            wert: () => box.checked
        };
    }
    const id = 'fm-' + f.name;
    const grund = {
        id,
        class: 'bp-in' + (f.mono ? ' mono' : ''),
        autocomplete: f.art === 'password' ? 'new-password' : 'off',
        placeholder: f.platzhalter || null,
        'data-fokus': f.fokus ? true : null
    };
    let eingabe;
    if (f.art === 'select') {
        eingabe = h(
            'select',
            grund,
            f.optionen.map(o => h('option', { value: o.wert, selected: o.wert === f.wert }, o.text))
        );
    } else if (f.art === 'textarea') {
        eingabe = h('textarea', { ...grund, rows: f.zeilen || 3 });
        eingabe.value = f.wert || '';
    } else {
        eingabe = h('input', { ...grund, type: f.art === 'password' ? 'password' : 'text' });
        eingabe.value = f.wert || '';
    }
    return {
        eingabe,
        teil: h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: id }, f.label),
            eingabe,
            f.hilfe ? h('small', {}, f.hilfe) : null
        ),
        wert: () => eingabe.value
    };
};

// Ein Dialog mit Feldern. tun(werte) gibt nichts oder einen Fehlertext zurück
export const formular = ({ titel, text, inhalt, felder = [], knopf, gefahr = false, abbrechen = 'Abbrechen', tun }) =>
    dialog(({ zu }) => {
        const gebaut = felder.map(f => ({ name: f.name, ...feldBauen(f) }));
        const fehler = h('div', {});
        const ja = h(
            'button',
            {
                class: 'bp-btn ' + (gefahr ? 'bp-btn-gefahr' : 'bp-btn-p'),
                id: 'fm-ja',
                type: 'button',
                onclick: async () => {
                    ja.disabled = true;
                    fehler.replaceChildren();
                    const problem = await tun(Object.fromEntries(gebaut.map(g => [g.name, g.wert()])));
                    if (problem) {
                        ja.disabled = false;
                        fehler.replaceChildren(h('div', { class: 'bp-hinweis bp-h-gefahr' }, problem));
                        return;
                    }
                    zu();
                }
            },
            knopf
        );
        return [
            h('h3', {}, titel),
            text ? h('p', {}, text) : null,
            inhalt || null,
            gebaut.map(g => g.teil),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, abbrechen),
                ja
            )
        ];
    });

// Nach Klonen oder Wiederherstellen: ehrlich sagen, was noch zu tun ist
export const hinweiseZeigen = (titel, alleHinweise, adresse) => {
    const hinweise = hinweiseFuerMenschen(alleHinweise);
    return dialog(({ zu }) => [
        h(
            'div',
            { class: 'erfolg', id: 'fm-erfolg' },
            h('span', { class: 'erfolg-kreis', 'aria-hidden': 'true' }, ikon('haken')),
            h('h3', {}, titel)
        ),
        hinweise.length
            ? h(
                  'ul',
                  { class: 'stapel', id: 'fm-hinweise' },
                  hinweise.map(t => h('li', { class: 'leise' }, t))
              )
            : null,
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    id: 'fm-weiter',
                    type: 'button',
                    onclick: () => {
                        zu();
                        location.hash = adresse;
                    }
                },
                'Website öffnen'
            )
        )
    ]);
};

// Auswahl, zu welchem Teil die Seite gerade gehört
export const teilAuswahl = (teile, aktuell, wenn) => {
    const auswahl = h(
        'select',
        {
            id: 'bereich-teil',
            class: 'bp-in',
            onchange: () => wenn(auswahl.value)
        },
        teile.map(t => h('option', { value: t.uuid, selected: t.uuid === aktuell?.uuid }, t.name))
    );
    return h('div', { class: 'bp-feld' }, h('label', { for: 'bereich-teil' }, 'Welcher Teil?'), auswahl);
};

// Eine einfache Tabelle. zeilen = Listen von Zellen (Text oder Element)
export const tabelle = (kopf, zeilen, id) =>
    h(
        'div',
        { class: 'bp-tab-wrap' },
        h(
            'table',
            { class: 'bp-tab', id: id || null },
            h(
                'thead',
                {},
                h(
                    'tr',
                    {},
                    kopf.map(t => h('th', {}, t))
                )
            ),
            h(
                'tbody',
                {},
                zeilen.map(z =>
                    h(
                        'tr',
                        {},
                        z.map(zelle => h('td', {}, zelle))
                    )
                )
            )
        )
    );
