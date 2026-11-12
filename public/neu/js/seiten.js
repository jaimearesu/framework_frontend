// Die Seiten des Hauptmenüs: Start, Websites, Konto, Werkstatt
import { h, ikon, zustandPlakette, leer, huelle } from './ui.js';
import { loadThumbnail } from '../../js/core/objects.js';
import { DATEN } from './daten.js';
import { neueWebsiteOeffnen } from './neue-website.js';
import { neuLaden } from './websites.js';
import { papierkorbAbschnitt } from './papierkorb.js';
import { werkzeugGruppen } from './werkstatt-werte.js';
import { hatBeideHerkuenfte, hatMehrereSichtbarkeiten, nachHerkunft, nachSichtbarkeit } from './websites-werte.js';
import { auslastungKurz, standTeile, filterAnzahl, FILTER_STANDARD } from './start-werte.js';
import { api } from '../../js/core/api.js';

// Vorschaubild einer Website. Solange es noch kein Foto gibt, steht dort die Skizze
export const vorschauBild = (gross, website) => {
    const flaeche = h(
        'div',
        { class: 'vorschau' + (gross ? ' gross' : ''), 'aria-hidden': 'true' },
        h('i'),
        h('i'),
        h('i'),
        h('i')
    );
    if (website?.thumbAt) {
        loadThumbnail(website).then(adresse => {
            if (!adresse) return;
            flaeche.classList.add('mit-bild');
            flaeche.replaceChildren(h('img', { src: adresse, alt: '' }));
        });
    }
    return flaeche;
};

const websiteKachel = w =>
    h(
        'a',
        { class: 'bp-karte kachel', href: '#/website/' + w.id },
        vorschauBild(false, w),
        h(
            'div',
            { class: 'kachel-text' },
            h('div', { class: 'kachel-titel' }, h('span', {}, w.titel), zustandPlakette(w.zustand)),
            h('span', { class: 'leise' }, w.adresse),
            h('span', { class: 'leise' }, w.zeile)
        )
    );

// Wie viele Kacheln auf einer Seite stehen
const PRO_SEITE = 9;

// Websites nach Herkunft und Sichtbarkeit gefiltert und in der gewählten Reihenfolge: zuletzt geändert oder neuste zuerst
const sortierteWebsites = () => {
    const { sortierung, herkunft, sichtbarkeit } = DATEN.startAnsicht;
    const feld = sortierung === 'neu' ? 'erstelltVor' : 'geaendertVor';
    return [...nachSichtbarkeit(nachHerkunft(DATEN.websites, herkunft), sichtbarkeit)].sort(
        (a, b) => a[feld] - b[feld]
    );
};

// Umschalter für Reihenfolge und Herkunft, wechselt zurück auf Seite 1
const wahlKnopf = (feld, praefix, wert, text) =>
    h(
        'button',
        {
            type: 'button',
            id: praefix + wert,
            role: 'tab',
            'aria-selected': DATEN.startAnsicht[feld] === wert ? 'true' : 'false',
            onclick: () => {
                DATEN.startAnsicht[feld] = wert;
                DATEN.startAnsicht.seite = 1;
                huelle.neu();
            }
        },
        text
    );

// Zeile unter den Kacheln: welcher Bereich sichtbar ist und die Knöpfe zum Blättern
const blaettern = (seite, letzte, gesamt) => {
    const wechseln = neu => () => {
        DATEN.startAnsicht.seite = neu;
        huelle.neu();
    };
    const von = (seite - 1) * PRO_SEITE + 1;
    const bis = Math.min(seite * PRO_SEITE, gesamt);
    return h(
        'nav',
        { class: 'blaettern', 'aria-label': 'Seiten' },
        h('span', { class: 'leise' }, von + ' bis ' + bis + ' von ' + gesamt),
        h(
            'div',
            { class: 'blaettern-knoepfe' },
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-klein ' + (seite <= 1 ? 'bp-btn-off' : 'bp-btn-o'),
                    id: 'blaettern-zurueck',
                    type: 'button',
                    disabled: seite <= 1,
                    onclick: wechseln(seite - 1)
                },
                'Zurück'
            ),
            h('span', { class: 'leise', id: 'blaettern-stand' }, 'Seite ' + seite + ' von ' + letzte),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-klein ' + (seite >= letzte ? 'bp-btn-off' : 'bp-btn-o'),
                    id: 'blaettern-weiter',
                    type: 'button',
                    disabled: seite >= letzte,
                    onclick: wechseln(seite + 1)
                },
                'Weiter'
            )
        )
    );
};

// Knopf «Filter» (12.11.2026): Sichtbarkeit und Reihenfolge in einem kleinen Menü statt zwei
// Reihen Umschalter. Bleibt beim Neuzeichnen offen, schliesst mit Klick daneben oder Esc.
let filterOffen = false;
const filterSchliessen = () => {
    if (!filterOffen) return;
    filterOffen = false;
    huelle.neu();
};
let filterHorchtSchon = false;
const filterHorchen = () => {
    if (filterHorchtSchon) return;
    filterHorchtSchon = true;
    document.addEventListener('click', e => {
        if (filterOffen && !e.target.closest('.filter-wahl')) filterSchliessen();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') filterSchliessen();
    });
};

const filterWahl = (feld, praefix, wert, text) => {
    const gewaehlt = DATEN.startAnsicht[feld] === wert;
    return h(
        'button',
        {
            type: 'button',
            id: praefix + wert,
            role: 'menuitemradio',
            'aria-checked': gewaehlt ? 'true' : 'false',
            class: 'filter-zeile' + (gewaehlt ? ' gewaehlt' : ''),
            onclick: () => {
                DATEN.startAnsicht[feld] = wert;
                DATEN.startAnsicht.seite = 1;
                huelle.neu();
            }
        },
        h('span', { class: 'filter-haken' }, gewaehlt ? ikon('haken') : null),
        text
    );
};

const filterKnopf = (mitSichtbarkeit, mitReihenfolge) => {
    filterHorchen();
    const anzahl = filterAnzahl(DATEN.startAnsicht);
    return h(
        'div',
        { class: 'filter-wahl' },
        h(
            'button',
            {
                class: 'bp-btn bp-btn-o filter-knopf',
                id: 'filter-knopf',
                type: 'button',
                'aria-haspopup': 'menu',
                'aria-expanded': filterOffen ? 'true' : 'false',
                onclick: () => {
                    filterOffen = !filterOffen;
                    huelle.neu();
                }
            },
            ikon('filter'),
            'Filter',
            anzahl ? h('span', { class: 'filter-zahl', 'aria-label': anzahl + ' gewählt' }, String(anzahl)) : null
        ),
        filterOffen
            ? h(
                  'div',
                  { class: 'bp-menue filter-menue', role: 'menu', id: 'filter-menue' },
                  mitSichtbarkeit
                      ? [
                            h('span', { class: 'filter-gruppe' }, 'Sichtbarkeit'),
                            filterWahl('sichtbarkeit', 'sichtbar-', 'alle', 'Alle'),
                            filterWahl('sichtbarkeit', 'sichtbar-', 'public', 'Online'),
                            filterWahl('sichtbarkeit', 'sichtbar-', 'members', 'Nur Angemeldete'),
                            filterWahl('sichtbarkeit', 'sichtbar-', 'private', 'Privat')
                        ]
                      : null,
                  mitSichtbarkeit && mitReihenfolge ? h('hr') : null,
                  mitReihenfolge
                      ? [
                            h('span', { class: 'filter-gruppe' }, 'Reihenfolge'),
                            filterWahl('sortierung', 'sort-', 'geaendert', 'Zuletzt geändert'),
                            filterWahl('sortierung', 'sort-', 'neu', 'Neuste')
                        ]
                      : null,
                  anzahl
                      ? h(
                            'button',
                            {
                                type: 'button',
                                class: 'filter-zeile filter-weg',
                                id: 'filter-zuruecksetzen',
                                onclick: () => {
                                    Object.assign(DATEN.startAnsicht, FILTER_STANDARD, { seite: 1 });
                                    huelle.neu();
                                }
                            },
                            h('span', { class: 'filter-haken' }),
                            'Filter zurücksetzen'
                        )
                      : null
              )
            : null
    );
};

// Die Kacheln mit Filter und Blättern, auf Start und auf der Seite «Websites» dieselben
const websitesAbschnitt = ueberschrift => {
    // Beim allerersten Laden gescheitert: nicht «Noch keine Website» behaupten
    if (DATEN.websitesFehler && !DATEN.websites.length) {
        return h(
            'div',
            { class: 'bp-karte', id: 'websites-fehler' },
            leer(
                'kugel',
                'Konnte deine Websites nicht laden',
                'Versuch es in einer Minute nochmals.',
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: neuLaden }, 'Nochmals versuchen')
            )
        );
    }
    const alle = sortierteWebsites();
    const letzte = Math.max(1, Math.ceil(alle.length / PRO_SEITE));
    const seite = Math.min(DATEN.startAnsicht.seite, letzte);
    const sichtbar = alle.slice((seite - 1) * PRO_SEITE, seite * PRO_SEITE);
    return h(
        'section',
        { class: 'abschnitt' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, typeof ueberschrift === 'function' ? ueberschrift(alle.length) : ueberschrift),
            h(
                'div',
                { class: 'abschnitt-wahl' },
                hatBeideHerkuenfte(DATEN.websites)
                    ? h(
                          'div',
                          { class: 'bp-segment', role: 'tablist', 'aria-label': 'Herkunft' },
                          wahlKnopf('herkunft', 'herkunft-', 'alle', 'Alle'),
                          wahlKnopf('herkunft', 'herkunft-', 'mein', 'Von mir'),
                          wahlKnopf('herkunft', 'herkunft-', 'geteilt', 'Mit mir geteilt')
                      )
                    : null,
                hatMehrereSichtbarkeiten(DATEN.websites) || DATEN.websites.length > 1
                    ? filterKnopf(hatMehrereSichtbarkeiten(DATEN.websites), DATEN.websites.length > 1)
                    : null
            )
        ),
        alle.length
            ? [
                  h('div', { class: 'kacheln' }, sichtbar.map(websiteKachel)),
                  alle.length > PRO_SEITE ? blaettern(seite, letzte, alle.length) : null,
                  DATEN.websitesGekappt ? h('span', { class: 'leise' }, 'Es werden die ersten 200 gezeigt.') : null
              ]
            : DATEN.websites.length
              ? // Es gibt Websites, nur passt keine zu den gewählten Filtern
                h(
                    'div',
                    { class: 'bp-karte', id: 'filter-leer' },
                    leer('kugel', 'Keine Website passt', 'Wähle bei den Filtern oben etwas anderes.')
                )
              : h(
                    'div',
                    { class: 'bp-karte' },
                    leer(
                        'kugel',
                        'Noch keine Website',
                        'Lege deine erste Website an, dein KI-Helfer baut sie.',
                        h(
                            'button',
                            { class: 'bp-btn bp-btn-p', type: 'button', onclick: neueWebsiteOeffnen },
                            'Neue Website'
                        )
                    )
                )
    );
};

// Eigene Seite im Menü: nur die Websites, ohne alles andere von Start
export const seiteWebsites = () => [
    websitesAbschnitt(anzahl => (anzahl === 1 ? '1 Website' : anzahl + ' Websites')),
    papierkorbAbschnitt()
];

// Was wartet, steht jetzt in der Stand-Zeile unter der Begrüssung (12.11.2026)
export const seiteStart = () => [websitesAbschnitt('Meine Websites')];

// Kopfzeile von Start: Begrüssung nach Tageszeit, darunter die Stand-Zeile (12.11.2026).
// Die vindelis-ID steht im Konto, «Mein Baum» oben rechts in der Kopfzeile.
seiteStart.titel = () => {
    const stunde = new Date().getHours();
    const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';
    return DATEN.mensch.name ? gruss + ', ' + DATEN.mensch.name : gruss;
};

// Die Auslastung kommt einmal pro Minute vom Backend, nicht bei jedem Neuzeichnen
let auslastungGeholt = { zeit: 0, wert: null, laeuft: null };
const auslastungHolen = () => {
    if (DATEN.mensch.art !== 'user') return Promise.resolve(null);
    if (Date.now() - auslastungGeholt.zeit < 60000) return Promise.resolve(auslastungGeholt.wert);
    auslastungGeholt.laeuft ??= api
        .get('/api/billing/usage')
        .then(
            a => (a.ok ? auslastungKurz(a.data.data) : null),
            () => null
        )
        .then(wert => {
            auslastungGeholt = { zeit: Date.now(), wert, laeuft: null };
            return wert;
        });
    return auslastungGeholt.laeuft;
};

const standStueck = t =>
    t.href
        ? h('a', { class: 'stand-teil ' + t.art, href: t.href }, t.text)
        : h('span', { class: 'stand-teil ' + t.art }, t.text);

seiteStart.unter = () => {
    const zeile = h('p', { class: 'stand-zeile', id: 'stand-zeile' });
    const zeigen = auslastung =>
        zeile.replaceChildren(
            ...standTeile({ wartet: DATEN.wartet.length, websites: DATEN.websites, auslastung }).map(standStueck)
        );
    // Gleich zeigen, was schon da ist; die Auslastung kommt nach, sobald sie geladen ist
    zeigen(Date.now() - auslastungGeholt.zeit < 60000 ? auslastungGeholt.wert : null);
    auslastungHolen().then(wert => {
        if (wert && zeile.isConnected) zeigen(wert);
    });
    return zeile;
};

// Die Seite «Konto» steht seit 12.11.2026 in konto.js (Kacheln)

// Die Technik bleibt, wie sie ist. Hier führen die Wege hinein
export const seiteWerkstatt = () =>
    h(
        'div',
        { class: 'stapel', id: 'werkstatt' },
        h(
            'p',
            { class: 'leise' },
            'Die Technik-Seiten für alle, die genauer hinschauen wollen. Sie öffnen sich in der gewohnten Ansicht, zurück geht es mit dem Pfeil des Browsers.'
        ),
        werkzeugGruppen().map(([gruppe, liste]) =>
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h('h3', {}, gruppe),
                h(
                    'div',
                    { class: 'zeilen' },
                    liste.map(w =>
                        h(
                            'a',
                            { class: 'zeile zeile-link', href: w.adresse },
                            h(
                                'div',
                                { class: 'zeile-text' },
                                h('b', {}, w.titel),
                                h('span', { class: 'leise' }, w.text)
                            ),
                            h('span', { class: 'bp-ikonknopf', 'aria-hidden': 'true' }, ikon('pfeil'))
                        )
                    )
                )
            )
        )
    );
