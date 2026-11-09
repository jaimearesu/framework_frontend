// Eine Website mit ihren Reitern. Übersicht, Code und Daten sind echt,
// Personen und Einstellungen kommen mit den Etappen U4e und U4f
import { api } from '../../js/core/api.js';
import { h, ikon, zustandPlakette, huelle, leer, laedtKarte } from './ui.js';
import { DATEN } from './daten.js';
import { verlaufPlatzhalter } from './seiten.js';
import { neuLaden } from './websites.js';
import { wartetKarte } from './wartet.js';
import { reiterPersonen } from './website-personen.js';
import { reiterEinstellungen } from './website-einstellungen.js';
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
        return [zurueckLink(), laedtKarte('website-laedt')];
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
        personen: () => reiterPersonen(w, site),
        einstellungen: () => reiterEinstellungen(w, site, teil, sofortNeu)
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
        h('div', { class: 'reiter-inhalt' }, inhalt)
    ];
};
