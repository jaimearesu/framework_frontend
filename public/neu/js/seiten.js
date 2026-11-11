// Die Seiten des Hauptmenüs: Start, Websites, Konto, Werkstatt
import { h, ikon, zustandPlakette, leer, huelle, kopierKnopf, kopierZeile } from './ui.js';
import { loadThumbnail } from '../../js/core/objects.js';
import { DATEN } from './daten.js';
import { neueWebsiteOeffnen } from './neue-website.js';
import { abmeldeAdresse } from './sitzung.js';
import { neuLaden } from './websites.js';
import { papierkorbAbschnitt } from './papierkorb.js';
import { abrechnungKarte } from './abrechnung.js';
import { werkzeugGruppen } from './werkstatt-werte.js';
import { hatBeideHerkuenfte, hatMehrereSichtbarkeiten, nachHerkunft, nachSichtbarkeit } from './websites-werte.js';

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
                hatMehrereSichtbarkeiten(DATEN.websites)
                    ? h(
                          'div',
                          { class: 'bp-segment', role: 'tablist', 'aria-label': 'Sichtbarkeit' },
                          wahlKnopf('sichtbarkeit', 'sichtbar-', 'alle', 'Alle'),
                          wahlKnopf('sichtbarkeit', 'sichtbar-', 'public', 'Online'),
                          wahlKnopf('sichtbarkeit', 'sichtbar-', 'members', 'Nur Angemeldete'),
                          wahlKnopf('sichtbarkeit', 'sichtbar-', 'private', 'Privat')
                      )
                    : null,
                alle.length > 1
                    ? h(
                          'div',
                          { class: 'bp-segment', role: 'tablist', 'aria-label': 'Reihenfolge' },
                          wahlKnopf('sortierung', 'sort-', 'geaendert', 'Zuletzt geändert'),
                          wahlKnopf('sortierung', 'sort-', 'neu', 'Neuste')
                      )
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

export const seiteStart = () => {
    const anzahl = DATEN.wartet.length;
    return [
        anzahl
            ? h(
                  'div',
                  { class: 'bp-hinweis bp-h-info mit-knopf' },
                  h('span', {}, anzahl === 1 ? '1 Sache wartet auf dich.' : anzahl + ' Sachen warten auf dich.'),
                  h('a', { class: 'bp-btn bp-btn-o bp-btn-klein', href: '#/wartet' }, 'Ansehen')
              )
            : null,
        websitesAbschnitt('Meine Websites')
    ];
};

// Kopfzeile von Start: Begrüssung nach Tageszeit, darunter die eigene vindelis-ID
seiteStart.titel = () => {
    const stunde = new Date().getHours();
    const gruss = stunde < 11 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend';
    return DATEN.mensch.name ? gruss + ', ' + DATEN.mensch.name : gruss;
};
seiteStart.unter = () =>
    h(
        'div',
        { class: 'id-zeile leise', id: 'meine-id' },
        // Ohne Konto gibt es noch keine ID
        DATEN.mensch.id
            ? [
                  h('span', {}, 'Deine vindelis-ID'),
                  h('code', { class: 'mono' }, DATEN.mensch.id),
                  kopierKnopf(DATEN.mensch.id)
              ]
            : null,
        h(
            'button',
            {
                class: 'bp-btn bp-btn-o bp-btn-klein',
                id: 'mein-baum',
                type: 'button',
                onclick: () => huelle.baumOeffnen()
            },
            'Mein Baum'
        )
    );

export const seiteKonto = () =>
    h(
        'div',
        { class: 'stapel' },
        DATEN.mensch.id
            ? h(
                  'div',
                  { class: 'bp-karte stapel' },
                  h('h3', {}, 'Deine vindelis-ID'),
                  h('span', { class: 'leise' }, 'Schick sie jemandem, der dir Zugriff auf seine Website geben möchte.'),
                  kopierZeile(DATEN.mensch.id)
              )
            : null,
        DATEN.konto.length
            ? h(
                  'div',
                  { class: 'bp-karte stapel', id: 'konto-grenzen' },
                  h('h3', {}, 'Speicher und Grenzen'),
                  DATEN.konto.map(k =>
                      h(
                          'div',
                          { class: 'mass' },
                          h('div', { class: 'kennzahl' }, h('span', {}, k.name), h('span', { class: 'leise' }, k.wert)),
                          h('div', { class: 'balken' }, h('i', { style: 'width:' + k.anteil + '%' }))
                      )
                  )
              )
            : null,
        // Abrechnung (Plan "P", P2): nur mit Anmeldung, Gäste haben kein Abo
        DATEN.mensch.art === 'user' ? abrechnungKarte() : null,
        // Abmelden gibt es nur mit Anmeldung. Ohne Anmeldung steht der Knopf im Hinweis oben auf der Seite
        DATEN.mensch.art === 'user'
            ? h(
                  'div',
                  { class: 'bp-karte stapel' },
                  h('h3', {}, 'Anmeldung'),
                  DATEN.mensch.email ? h('span', { class: 'leise' }, 'Angemeldet als ' + DATEN.mensch.email) : null,
                  h('div', {}, h('a', { class: 'bp-btn bp-btn-o', id: 'abmelden', href: abmeldeAdresse() }, 'Abmelden'))
              )
            : null
    );

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
