// Reiter «Daten»: Datensätze als Tabelle und die Dateien der Website. Nur lesen.
import { api } from '../../js/core/api.js';
import { formatNumber } from '../../js/core/format.js';
import { h, ikon, leer, meldung, huelle, laedtKarte } from './ui.js';
import { datenAnderswo, dateiTeile, datenSpalten, datenTeile, hatWeiter, zelleText } from './website-werte.js';

const PRO_SEITE = 50;
const DATEIEN_PRO_SEITE = 24;

// Wo man beim Blättern steht. Gehört zu genau einem Speicher
const blatt = { teil: null, seite: 1, zeiger: null };
const dateienBlatt = { id: null, seite: 1 };

// Bilder im Speicher des Browsers wieder freigeben, sobald sie nicht mehr zu sehen sind
let bildAdressen = [];
const bilderFreigeben = () => {
    bildAdressen.forEach(a => URL.revokeObjectURL(a));
    bildAdressen = [];
};

// Füllt die Tabelle, ohne die ganze Seite neu zu zeichnen
const tabelleFuellen = async (flaeche, teil, zuletzt) => {
    const dieser = ++zuletzt.lauf;
    flaeche.replaceChildren(laedtKarte());
    const query = { limit: PRO_SEITE };
    if (blatt.zeiger) {
        query.cursorValue = blatt.zeiger.value;
        query.cursorId = blatt.zeiger.id;
        query.direction = blatt.zeiger.richtung;
    }
    const antwort = await api.get('/api/core-data/' + teil.uuid, { query });
    if (dieser !== zuletzt.lauf) return;
    if (!antwort.ok) {
        flaeche.replaceChildren(
            h(
                'div',
                { class: 'bp-karte', id: 'daten-fehler' },
                antwort.status === 403 || antwort.status === 404
                    ? leer('datei', 'Keine Berechtigung', 'Du darfst diese Daten nicht lesen.')
                    : leer('datei', 'Konnte die Daten nicht laden', 'Versuch es in einer Minute nochmals.')
            )
        );
        return;
    }
    const zeilen = Array.isArray(antwort.data?.data) ? antwort.data.data : [];
    const meta = antwort.data?.meta;
    const spalten = datenSpalten(zeilen);
    const blaettern = (seite, zeiger, richtung) => () => {
        blatt.seite = seite;
        blatt.zeiger = zeiger ? { ...zeiger, richtung } : null;
        tabelleFuellen(flaeche, teil, zuletzt);
    };
    const weiter = hatWeiter(meta, blatt.seite, PRO_SEITE);
    const zurueck = blatt.seite > 1;
    flaeche.replaceChildren(
        h(
            'div',
            { class: 'abschnitt', id: 'daten-tabelle' },
            h(
                'div',
                { class: 'abschnitt-kopf' },
                h('h3', {}, teil.name),
                h(
                    'span',
                    { class: 'leise' },
                    meta
                        ? formatNumber(meta.total_count) + (meta.total_count_capped ? ' oder mehr' : '') + ' Einträge'
                        : ''
                )
            ),
            spalten.length
                ? h(
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
                                  spalten.map(s => h('th', {}, s))
                              )
                          ),
                          h(
                              'tbody',
                              {},
                              zeilen.map(z =>
                                  h(
                                      'tr',
                                      {},
                                      spalten.map(s => h('td', {}, zelleText(z[s])))
                                  )
                              )
                          )
                      )
                  )
                : h('div', { class: 'bp-karte' }, h('span', { class: 'leise' }, 'Keine Einträge.')),
            zurueck || weiter
                ? h(
                      'nav',
                      { class: 'blaettern', 'aria-label': 'Seiten' },
                      h('span', { class: 'leise' }, 'Seite ' + blatt.seite),
                      h(
                          'div',
                          { class: 'blaettern-knoepfe' },
                          h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-klein ' + (zurueck ? 'bp-btn-o' : 'bp-btn-off'),
                                  id: 'daten-zurueck',
                                  type: 'button',
                                  disabled: !zurueck,
                                  // Auf Seite 1 führt kein Zeiger, so stimmt der Anfang immer
                                  onclick: blaettern(
                                      blatt.seite - 1,
                                      blatt.seite === 2 ? null : meta?.cursors?.first,
                                      'prev'
                                  )
                              },
                              'Zurück'
                          ),
                          h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-klein ' + (weiter ? 'bp-btn-o' : 'bp-btn-off'),
                                  id: 'daten-weiter',
                                  type: 'button',
                                  disabled: !weiter,
                                  onclick: blaettern(blatt.seite + 1, meta?.cursors?.last, 'next')
                              },
                              'Weiter'
                          )
                      )
                  )
                : null
        )
    );
};

// Lädt die Datei erst auf Klick: Eine Datei kann bis zu 10 MB gross sein
const dateiHolen = async uuid => {
    const antwort = await api.blob('/api/objects/' + uuid + '/file/content');
    if (!antwort.ok || !antwort.blob) {
        meldung('Das hat nicht geklappt', antwort.error || 'Die Datei konnte nicht geladen werden.', 'kreuz');
        return null;
    }
    return antwort.blob;
};

// Der Dateiname beim Herunterladen, wie er beim Hochladen hiess
const dateiName = async teil => {
    const antwort = await api.get('/api/objects/' + teil.uuid + '/file');
    return antwort.data?.data?.current?.originalName || teil.name;
};

const herunterladen = async teil => {
    const [inhalt, name] = await Promise.all([dateiHolen(teil.uuid), dateiName(teil)]);
    if (!inhalt) return;
    // Immer als Download, nie als eigene Seite: Fremde Dateien sollen hier nichts ausführen
    const adresse = URL.createObjectURL(inhalt);
    h('a', { href: adresse, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(adresse), 30000);
};

// Nur echte Bilder zeigen. Ein SVG kann Programmcode enthalten und wird darum nie hier geöffnet
const istBild = typ => /^image\//.test(typ) && !/svg/.test(typ);

const dateiZeile = teil => {
    const platz = h('div', {});
    const ansehen = h(
        'button',
        {
            class: 'bp-btn bp-btn-o bp-btn-klein',
            type: 'button',
            onclick: async () => {
                ansehen.disabled = true;
                const inhalt = await dateiHolen(teil.uuid);
                ansehen.disabled = false;
                if (!inhalt) return;
                if (!istBild(inhalt.type)) {
                    platz.replaceChildren(
                        h(
                            'span',
                            { class: 'leise' },
                            'Diese Art von Datei lässt sich hier nicht zeigen. Lade sie herunter.'
                        )
                    );
                    return;
                }
                const adresse = URL.createObjectURL(inhalt);
                bildAdressen.push(adresse);
                platz.replaceChildren(h('img', { class: 'datei-bild', src: adresse, alt: teil.name }));
                ansehen.remove();
            }
        },
        'Ansehen'
    );
    return h(
        'div',
        { class: 'zeile datei-zeile' },
        h(
            'div',
            { class: 'datei-kopf' },
            h('span', { class: 'rund', 'aria-hidden': 'true' }, ikon('datei')),
            h('div', { class: 'zeile-text' }, h('b', {}, teil.name)),
            h(
                'div',
                { class: 'zeile-knopf' },
                ansehen,
                h(
                    'button',
                    { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: () => herunterladen(teil) },
                    'Herunterladen'
                )
            )
        ),
        platz
    );
};

const dateienAbschnitt = site => {
    const teile = dateiTeile(site);
    if (!teile.length) return null;
    if (dateienBlatt.id !== site.uuid) {
        dateienBlatt.id = site.uuid;
        dateienBlatt.seite = 1;
    }
    const letzte = Math.max(1, Math.ceil(teile.length / DATEIEN_PRO_SEITE));
    const seite = Math.min(dateienBlatt.seite, letzte);
    const wechseln = neu => () => {
        dateienBlatt.seite = neu;
        huelle.neu();
    };
    return h(
        'div',
        { class: 'abschnitt', id: 'dateien' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, 'Dateien'),
            h('span', { class: 'leise' }, formatNumber(teile.length))
        ),
        h(
            'div',
            { class: 'bp-karte eng' },
            h(
                'div',
                { class: 'zeilen' },
                teile.slice((seite - 1) * DATEIEN_PRO_SEITE, seite * DATEIEN_PRO_SEITE).map(dateiZeile)
            )
        ),
        letzte > 1
            ? h(
                  'nav',
                  { class: 'blaettern', 'aria-label': 'Seiten der Dateien' },
                  h('span', { class: 'leise' }, 'Seite ' + seite + ' von ' + letzte),
                  h(
                      'div',
                      { class: 'blaettern-knoepfe' },
                      h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-klein ' + (seite > 1 ? 'bp-btn-o' : 'bp-btn-off'),
                              type: 'button',
                              disabled: seite <= 1,
                              onclick: wechseln(seite - 1)
                          },
                          'Zurück'
                      ),
                      h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-klein ' + (seite < letzte ? 'bp-btn-o' : 'bp-btn-off'),
                              type: 'button',
                              disabled: seite >= letzte,
                              onclick: wechseln(seite + 1)
                          },
                          'Weiter'
                      )
                  )
              )
            : null
    );
};

export const reiterDaten = (w, site, teilUuid) => {
    bilderFreigeben();
    const speicher = datenTeile(site);
    const anderswo = datenAnderswo(site);
    const dateien = dateienAbschnitt(site);
    if (!speicher.length && !dateien && !anderswo) {
        return h(
            'div',
            { class: 'bp-karte', id: 'daten-leer' },
            leer('datei', 'Noch keine Daten', 'Hier erscheinen Einträge und Dateien, sobald es welche gibt.')
        );
    }
    const hinweis = anderswo
        ? h(
              'div',
              { class: 'bp-hinweis bp-h-info', id: 'daten-anderswo' },
              formatNumber(anderswo) +
                  ' weitere Einträge liegen tiefer in der Website. Du findest sie in der Werkstatt.'
          )
        : null;
    if (!speicher.length) return h('div', { class: 'stapel' }, hinweis, dateien);
    const teil = speicher.find(t => t.uuid === teilUuid) || speicher[0];
    if (blatt.teil !== teil.uuid) {
        blatt.teil = teil.uuid;
        blatt.seite = 1;
        blatt.zeiger = null;
    }
    const flaeche = h('div', {});
    tabelleFuellen(flaeche, teil, { lauf: 0 });
    return h(
        'div',
        { class: 'stapel' },
        hinweis,
        h(
            'div',
            { class: speicher.length > 1 ? 'code-raster' : null },
            speicher.length > 1
                ? h(
                      'div',
                      { class: 'bp-karte eng baum', id: 'daten-speicher' },
                      speicher.map(t =>
                          h(
                              'button',
                              {
                                  type: 'button',
                                  class: t.uuid === teil.uuid ? 'aktiv' : null,
                                  onclick: () => {
                                      location.hash = '#/website/' + w.id + '/daten/' + t.uuid;
                                  }
                              },
                              ikon('datei'),
                              h('span', { class: 'baum-name' }, t.name)
                          )
                      )
                  )
                : null,
            flaeche
        ),
        dateien
    );
};
