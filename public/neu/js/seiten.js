// Die Seiten des Hauptmenüs: Start, Wartet auf mich, KI-Helfer, Verlauf, Konto, Werkstatt
import { h, ikon, zustandPlakette, meldung, nurAnprobe, leer, dialog, huelle, kopierKnopf, kopierZeile } from './ui.js';
import { DATEN } from './daten.js';
import { anleitungListe, neueWebsiteOeffnen } from './neue-website.js';
import { abmeldeAdresse } from './sitzung.js';

// Platzhalter fürs Vorschaubild (beim Einbau kommt das echte Bild)
export const vorschauBild = gross =>
    h('div', { class: 'vorschau' + (gross ? ' gross' : ''), 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));

// Eine Zeile «wer hat was wo gemacht»
export const ereignisZeile = (e, mitOrt) =>
    h(
        'div',
        { class: 'zeile' },
        h('span', { class: 'rund', 'aria-hidden': 'true' }, e.wer.charAt(0)),
        h(
            'div',
            { class: 'zeile-text' },
            h('span', {}, h('b', {}, e.wer), ' ' + e.was),
            h('span', { class: 'leise' }, (mitOrt ? e.wo + ', ' : '') + e.wann)
        )
    );

const websiteKachel = w =>
    h(
        'a',
        { class: 'bp-karte kachel', href: '#/website/' + w.id },
        vorschauBild(),
        h(
            'div',
            { class: 'kachel-text' },
            h('div', { class: 'kachel-titel' }, h('span', {}, w.titel), zustandPlakette(w.zustand)),
            h('span', { class: 'leise' }, w.id + '.vindelis.site'),
            h('span', { class: 'leise' }, w.von + ', ' + w.geaendert)
        )
    );

// Wie viele Kacheln auf einer Seite stehen
const PRO_SEITE = 9;

// Websites in der gewählten Reihenfolge: zuletzt geändert oder neuste zuerst
const sortierteWebsites = () => {
    const feld = DATEN.startAnsicht.sortierung === 'neu' ? 'erstelltVor' : 'geaendertVor';
    return [...DATEN.websites].sort((a, b) => a[feld] - b[feld]);
};

// Umschalter für die Reihenfolge, wechselt zurück auf Seite 1
const sortierKnopf = (wert, text) =>
    h(
        'button',
        {
            type: 'button',
            id: 'sort-' + wert,
            role: 'tab',
            'aria-selected': DATEN.startAnsicht.sortierung === wert ? 'true' : 'false',
            onclick: () => {
                DATEN.startAnsicht.sortierung = wert;
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
            h('h3', {}, ueberschrift),
            alle.length > 1
                ? h(
                      'div',
                      { class: 'bp-segment', role: 'tablist', 'aria-label': 'Reihenfolge' },
                      sortierKnopf('geaendert', 'Zuletzt geändert'),
                      sortierKnopf('neu', 'Neuste')
                  )
                : null
        ),
        alle.length
            ? [
                  h('div', { class: 'kacheln' }, sichtbar.map(websiteKachel)),
                  alle.length > PRO_SEITE ? blaettern(seite, letzte, alle.length) : null
              ]
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
export const seiteWebsites = () => websitesAbschnitt(DATEN.websites.length + ' Websites');

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
        websitesAbschnitt('Meine Websites'),
        h(
            'section',
            { class: 'abschnitt' },
            h(
                'div',
                { class: 'abschnitt-kopf' },
                h('h3', {}, 'Zuletzt passiert'),
                h('a', { class: 'leise', href: '#/verlauf' }, 'Ganzer Verlauf')
            ),
            h(
                'div',
                { class: 'bp-karte eng' },
                h(
                    'div',
                    { class: 'zeilen' },
                    DATEN.ereignisse.map(e => ereignisZeile(e, true))
                )
            )
        )
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

// Bitte entscheiden: aus der Liste nehmen, beim Veröffentlichen ändert sich auch der Zustand der Website
const entscheiden = (eintrag, freigegeben) => {
    DATEN.wartet = DATEN.wartet.filter(x => x.id !== eintrag.id);
    const website = DATEN.websites.find(w => w.titel === eintrag.website);
    if (website && eintrag.art === 'Veröffentlichen') website.zustand = freigegeben ? 'online' : 'entwurf';
    meldung(freigegeben ? 'Freigegeben' : 'Abgelehnt', eintrag.website);
    huelle.neu();
};

// Eine wartende Bitte, gleich in der Liste und auf der Seite der Website
export const wartetKarte = e =>
    h(
        'div',
        { class: 'bp-karte eng wartet-karte', id: 'bitte-' + e.id },
        h(
            'div',
            { class: 'zeile-text' },
            h('b', {}, e.art + ': ' + e.website),
            h('span', {}, e.grund),
            h('span', { class: 'leise' }, e.von + ', ' + e.wann)
        ),
        h(
            'div',
            { class: 'zeile-knopf' },
            h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: () => entscheiden(e, false) }, 'Ablehnen'),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    type: 'button',
                    id: 'freigeben-' + e.id,
                    onclick: () => entscheiden(e, true)
                },
                'Freigeben'
            )
        )
    );

export const seiteWartet = () => {
    if (!DATEN.wartet.length) {
        return h(
            'div',
            { class: 'bp-karte' },
            leer('haken', 'Alles erledigt', 'Wenn ein KI-Helfer dich um etwas bittet, steht es hier.')
        );
    }
    return h('div', { class: 'stapel wartet-liste' }, DATEN.wartet.map(wartetKarte));
};

const helferVerbindenOeffnen = () =>
    dialog(({ zu }) => [
        h('h3', {}, 'KI-Helfer verbinden'),
        anleitungListe(),
        h(
            'p',
            { class: 'leise' },
            'Ein KI-Helfer arbeitet mit seinen eigenen Rechten, nie mit deinen. Veröffentlichen kann er nie, er bittet dich darum.'
        ),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h('button', { class: 'bp-btn bp-btn-p', type: 'button', onclick: zu }, 'Fertig')
        )
    ]);

const helferPlakette = x => {
    if (x.zustand === 'aktiv') return h('span', { class: 'bp-st bp-st-ok' }, 'Verbunden mit ' + x.verbunden);
    if (x.zustand === 'neu') return h('span', { class: 'bp-st bp-st-warn' }, 'Wartet auf Verbindung');
    return h('span', { class: 'bp-badge bp-badge-s' }, 'Nicht verbunden');
};

export const seiteHelfer = () => [
    h(
        'div',
        { class: 'kacheln' },
        DATEN.helfer.map(x =>
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h(
                    'div',
                    { class: 'zeile', style: 'padding:0;border:0' },
                    h('span', { class: 'rund', 'aria-hidden': 'true' }, ikon('helfer')),
                    h(
                        'div',
                        { class: 'zeile-text' },
                        h('b', {}, x.name),
                        h('span', { class: 'leise' }, 'Zuletzt aktiv: ' + x.aktiv)
                    )
                ),
                h('div', {}, helferPlakette(x)),
                h('div', { class: 'leise' }, 'Arbeitet an: ' + (x.websites.join(', ') || 'noch nichts')),
                h(
                    'div',
                    { class: 'zeile-knopf' },
                    x.zustand === 'aktiv'
                        ? h(
                              'button',
                              { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: nurAnprobe },
                              'Verbindung trennen'
                          )
                        : h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-o bp-btn-klein',
                                  type: 'button',
                                  onclick: helferVerbindenOeffnen
                              },
                              'Verbinden'
                          )
                )
            )
        )
    )
];
seiteHelfer.knopf = () =>
    h(
        'button',
        { class: 'bp-btn bp-btn-p', type: 'button', onclick: helferVerbindenOeffnen },
        ikon('plus'),
        'KI-Helfer verbinden'
    );

// Platz ist reserviert, Jaimes Idee zum Verlauf kommt noch
export const verlaufPlatzhalter = () =>
    h(
        'div',
        { class: 'bp-karte' },
        leer(
            'verlauf',
            'Hier kommt der Verlauf',
            'Wer hat wann was gemacht. Dieser Bereich wird nach Jaimes Idee gebaut.'
        )
    );

export const seiteVerlauf = () => verlaufPlatzhalter();

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
        h('div', { class: 'bp-karte' }, leer('konto', 'Abrechnung', 'Kommt später mit dem Plan für die Preise.')),
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

export const seiteWerkstatt = () =>
    h(
        'div',
        { class: 'bp-karte' },
        leer(
            'werkstatt',
            'Die Technik bleibt hier',
            'Objekte, Rechte, SSF-Studio und Systemcheck ziehen unverändert hierher, nur in den neuen Farben.'
        )
    );
