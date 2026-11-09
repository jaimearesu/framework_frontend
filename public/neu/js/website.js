// Eine Website mit ihren Reitern. Übersicht, Code und Daten sind echt,
// Personen und Einstellungen kommen mit den Etappen U4e und U4f
import { api } from '../../js/core/api.js';
import { h, ikon, zustandPlakette, nurAnprobe, huelle, leer } from './ui.js';
import { href } from '../../js/core/routes.js';
import { DATEN } from './daten.js';
import { verlaufPlatzhalter } from './seiten.js';
import { neuLaden } from './websites.js';
import { wartetKarte } from './wartet.js';
import { zugriffGebenOeffnen } from './zugriff.js';
import { websiteAus } from './websites-werte.js';
import { darfVeroeffentlichen, websiteLink } from './website-werte.js';
import { reiterUebersicht } from './website-uebersicht.js';
import { reiterCode } from './website-code.js';
import { reiterDaten } from './website-daten.js';
import { veroeffentlichenOeffnen } from './website-veroeffentlichen.js';

const REITER = [
    ['uebersicht', 'Übersicht'],
    ['verlauf', 'Verlauf'],
    ['code', 'Code'],
    ['daten', 'Daten'],
    ['personen', 'Personen'],
    ['einstellungen', 'Einstellungen']
];

const reiterPersonen = w =>
    h(
        'div',
        { class: 'stapel' },
        h(
            'div',
            { class: 'abschnitt' },
            h(
                'div',
                { class: 'abschnitt-kopf' },
                h('h3', {}, 'Wer hat Zugriff'),
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-p',
                        id: 'zugriff-geben',
                        type: 'button',
                        onclick: () => zugriffGebenOeffnen(w)
                    },
                    ikon('plus'),
                    'Zugriff geben'
                )
            ),
            h(
                'div',
                { class: 'bp-tab-wrap' },
                h(
                    'table',
                    { class: 'bp-tab' },
                    h(
                        'thead',
                        {},
                        h(
                            'tr',
                            {},
                            ['Name', 'Art', 'Darf', 'Seit', ''].map(t => h('th', {}, t))
                        )
                    ),
                    h(
                        'tbody',
                        {},
                        DATEN.personen.map(p =>
                            h(
                                'tr',
                                {},
                                h('td', {}, h('b', {}, p.name)),
                                h('td', {}, p.art),
                                h('td', {}, p.darf),
                                h('td', {}, p.seit),
                                h(
                                    'td',
                                    { class: 'bp-rechts' },
                                    p.darf === 'Besitzer'
                                        ? null
                                        : h(
                                              'button',
                                              {
                                                  class: 'bp-ikonknopf',
                                                  type: 'button',
                                                  'aria-label': 'Zugriff von ' + p.name + ' entfernen',
                                                  onclick: nurAnprobe
                                              },
                                              ikon('kreuz')
                                          )
                                )
                            )
                        )
                    )
                )
            )
        ),
        DATEN.einladungen.length
            ? h(
                  'div',
                  { class: 'abschnitt', id: 'offene-einladungen' },
                  h('div', { class: 'abschnitt-kopf' }, h('h3', {}, 'Offene Einladungen')),
                  h(
                      'div',
                      { class: 'bp-tab-wrap' },
                      h(
                          'table',
                          { class: 'bp-tab' },
                          h(
                              'thead',
                              {},
                              h(
                                  'tr',
                                  {},
                                  ['Worauf', 'Darf', 'Gültig', 'Benutzt', ''].map(t => h('th', {}, t))
                              )
                          ),
                          h(
                              'tbody',
                              {},
                              DATEN.einladungen.map(e =>
                                  h(
                                      'tr',
                                      {},
                                      h('td', {}, e.worauf),
                                      h('td', {}, e.darf),
                                      h('td', {}, e.gueltig),
                                      h('td', {}, e.benutzt),
                                      h(
                                          'td',
                                          { class: 'bp-rechts' },
                                          h(
                                              'button',
                                              {
                                                  class: 'bp-btn bp-btn-o bp-btn-klein',
                                                  type: 'button',
                                                  onclick: () => {
                                                      DATEN.einladungen = DATEN.einladungen.filter(x => x.id !== e.id);
                                                      huelle.neu();
                                                  }
                                              },
                                              'Widerrufen'
                                          )
                                      )
                                  )
                              )
                          )
                      )
                  )
              )
            : null
    );

// Die Einstellungen als ruhige Liste, nach Thema gruppiert
const EINSTELLUNGEN = [
    [
        'Website',
        [
            ['Eigene Domain', 'Die Website unter deiner eigenen Adresse zeigen.'],
            ['Sichtbarkeit', 'Wer welchen Teil der Website sehen kann.']
        ]
    ],
    [
        'Sicherheit',
        [
            ['Schlüssel', 'Zugangsdaten für fremde Dienste, sicher im Tresor.'],
            ['Sicherungen', 'Frühere Stände ansehen und wiederherstellen.']
        ]
    ],
    [
        'Automatik',
        [
            ['Aufträge und Zeitpläne', 'Was im Hintergrund oder regelmässig läuft.'],
            ['Webhooks', 'Nachrichten von fremden Diensten empfangen.'],
            ['Vektoren', 'Suche nach Bedeutung statt nach genauen Wörtern.']
        ]
    ],
    [
        'Website als Ganzes',
        [
            ['Klonen', 'Eine Kopie dieser Website anlegen.'],
            ['Löschen', 'Die Website mit allen Daten entfernen.', true]
        ]
    ]
];

const reiterEinstellungen = () =>
    h(
        'div',
        { class: 'stapel' },
        EINSTELLUNGEN.map(([gruppe, zeilen]) =>
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h('h3', {}, gruppe),
                h(
                    'div',
                    { class: 'zeilen' },
                    zeilen.map(([titel, text, gefahr]) =>
                        h(
                            'div',
                            { class: gefahr ? 'zeile gefahr' : 'zeile' },
                            h('div', { class: 'zeile-text' }, h('b', {}, titel), h('span', { class: 'leise' }, text)),
                            h(
                                'button',
                                {
                                    class: 'bp-ikonknopf',
                                    type: 'button',
                                    'aria-label': titel + ' öffnen',
                                    onclick: nurAnprobe
                                },
                                ikon('pfeil')
                            )
                        )
                    )
                )
            )
        )
    );

// Der geladene Stand der offenen Website. Wie lange er als frisch gilt, steht in FRISCH_MS
const FRISCH_MS = 30000;
const stand = { id: null, site: null, fehler: null, zeit: 0, laedt: null, bitten: null };

// Holt die Website vom Backend. Neu gezeichnet wird nur, wenn sich wirklich etwas geändert hat,
// damit beim Lesen nichts unter den Fingern wegspringt
const websiteLaden = async id => {
    if (stand.laedt === id) return;
    stand.laedt = id;
    const antwort = await api.get('/api/websites/' + encodeURIComponent(id));
    if (stand.laedt === id) stand.laedt = null;
    // Inzwischen ist eine andere Website offen
    if (stand.id !== id) return;
    const vorher = JSON.stringify([stand.site, stand.fehler]);
    stand.zeit = Date.now();
    if (antwort.ok && antwort.data?.data) {
        stand.site = antwort.data.data;
        stand.fehler = null;
    } else {
        stand.site = null;
        stand.fehler = antwort.status === 404 ? 'weg' : 'netz';
    }
    if (location.hash.startsWith('#/website/' + id) && vorher !== JSON.stringify([stand.site, stand.fehler])) {
        huelle.neu();
    }
};

// Der Name für den Tab des Browsers
export const websiteTitel = id => (stand.id === id ? stand.site?.name : undefined);

const zurueckLink = () => h('a', { class: 'zurueck', href: '#/websites' }, ikon('zurueck'), 'Meine Websites');

const fehlerAnzeige = art =>
    h(
        'div',
        { class: 'bp-karte', id: 'website-fehler' },
        art === 'weg'
            ? leer(
                  'kugel',
                  'Website nicht gefunden',
                  'Vielleicht wurde sie gelöscht, oder du hast keinen Zugriff.',
                  h('a', { class: 'bp-btn bp-btn-o', href: '#/' }, 'Zum Start')
              )
            : leer(
                  'kugel',
                  'Konnte die Website nicht laden',
                  'Versuch es in einer Minute nochmals.',
                  h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-o',
                          type: 'button',
                          onclick: () => {
                              stand.zeit = 0;
                              stand.fehler = null;
                              huelle.neu();
                          }
                      },
                      'Nochmals versuchen'
                  )
              )
    );

// Nach einer Änderung (Veröffentlichen, Vorschaubild) sofort den neuen Stand holen und zeigen
const sofortNeu = async () => {
    await websiteLaden(stand.id);
    await neuLaden();
};

// Zwei Reiter zeigen bis U4e und U4f noch Beispiele. Das muss man sehen
const beispielHinweis = w =>
    h(
        'div',
        { class: 'bp-hinweis bp-h-warn mit-knopf', id: 'noch-beispiele' },
        h('span', {}, 'Dieser Reiter zeigt noch Beispiele, nicht diese Website.'),
        h('a', { class: 'bp-btn bp-btn-o bp-btn-klein', href: '/' + href('website', w.id) }, 'Im alten Cockpit öffnen')
    );

export const seiteWebsite = (id, reiter, teil) => {
    if (stand.id !== id) {
        Object.assign(stand, { id, site: null, fehler: null, zeit: 0, bitten: null });
    }
    if (stand.site) {
        // Wurde eine Bitte entschieden, hat sich vielleicht die Sichtbarkeit geändert
        const offen = DATEN.wartet.filter(e => e.website === stand.site.name).length;
        if (stand.bitten !== null && stand.bitten !== offen) stand.zeit = 0;
        stand.bitten = offen;
    }
    if (Date.now() - stand.zeit > FRISCH_MS) websiteLaden(id);
    if (stand.fehler) return [zurueckLink(), fehlerAnzeige(stand.fehler)];
    if (!stand.site) {
        return [
            zurueckLink(),
            h(
                'div',
                { class: 'bp-karte', id: 'website-laedt' },
                leer('kugel', 'Einen Moment', 'Die Website wird geladen.')
            )
        ];
    }
    const site = stand.site;
    const bitten = DATEN.wartet.filter(e => e.website === site.name);
    const namenMitBitte = new Set(bitten.filter(e => e.typ === 'bitte').map(e => e.website));
    const w = websiteAus(site, namenMitBitte);
    // Code sieht nur, wer ändern darf. Das Backend zeigt frühere Versionen sonst auch nicht
    const sichtbareReiter = REITER.filter(([k]) => k !== 'code' || site.rights?.write);
    const aktiv = sichtbareReiter.some(([k]) => k === reiter) ? reiter : 'uebersicht';
    const inhalt = {
        uebersicht: () => reiterUebersicht(w, site, sofortNeu),
        verlauf: () => verlaufPlatzhalter(),
        code: () => reiterCode(w, site, teil),
        daten: () => reiterDaten(w, site, teil),
        personen: () => reiterPersonen(w),
        einstellungen: () => reiterEinstellungen()
    }[aktiv]();
    const bitteOffen = bitten.some(e => e.art === 'Veröffentlichen');
    const link = websiteLink(site);
    return [
        zurueckLink(),
        h(
            'div',
            { class: 'website-kopf' },
            h(
                'div',
                { class: 'website-titel' },
                h('h2', {}, w.titel, zustandPlakette(w.zustand)),
                h('span', { class: 'leise' }, w.adresse)
            ),
            h(
                'div',
                { class: 'zeile-knopf' },
                link
                    ? h(
                          'a',
                          {
                              class: 'bp-btn bp-btn-o',
                              id: 'website-oeffnen',
                              href: link,
                              target: '_blank',
                              rel: 'noopener noreferrer'
                          },
                          ikon('aussen'),
                          'Website öffnen'
                      )
                    : null,
                darfVeroeffentlichen(site, DATEN.mensch.art, bitteOffen)
                    ? h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-p',
                              id: 'veroeffentlichen',
                              type: 'button',
                              onclick: () => veroeffentlichenOeffnen(w, site, sofortNeu)
                          },
                          'Veröffentlichen'
                      )
                    : null
            )
        ),
        bitten.map(wartetKarte),
        h(
            'div',
            { class: 'bp-tabs', role: 'tablist' },
            sichtbareReiter.map(([k, text]) =>
                h(
                    'button',
                    {
                        type: 'button',
                        role: 'tab',
                        'aria-selected': k === aktiv ? 'true' : 'false',
                        onclick: () => {
                            location.hash = '#/website/' + w.id + '/' + k;
                        }
                    },
                    text
                )
            )
        ),
        aktiv === 'personen' || aktiv === 'einstellungen' ? beispielHinweis(w) : null,
        h('div', { class: 'reiter-inhalt' }, inhalt)
    ];
};
