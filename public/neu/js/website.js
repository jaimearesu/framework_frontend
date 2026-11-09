// Eine Website mit ihren Reitern: Übersicht, Verlauf, Code, Daten, Personen, Einstellungen
import { h, ikon, zustandPlakette, nurAnprobe, huelle, leer } from './ui.js';
import { DATEN } from './daten.js';
import { vorschauBild, ereignisZeile, verlaufPlatzhalter, wartetKarte } from './seiten.js';
import { zugriffGebenOeffnen } from './zugriff.js';

const REITER = [
    ['uebersicht', 'Übersicht'],
    ['verlauf', 'Verlauf'],
    ['code', 'Code'],
    ['daten', 'Daten'],
    ['personen', 'Personen'],
    ['einstellungen', 'Einstellungen']
];

const reiterUebersicht = w => {
    const ereignisse = DATEN.ereignisse.filter(e => e.wo === w.titel);
    return h(
        'div',
        { class: 'zweispalter' },
        h(
            'div',
            { class: 'stapel' },
            w.probleme
                ? h(
                      'div',
                      { class: 'bp-hinweis bp-h-gefahr mit-knopf' },
                      h('span', {}, w.probleme + ' Probleme in den letzten 24 Stunden.'),
                      h(
                          'button',
                          { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: nurAnprobe },
                          'Ansehen'
                      )
                  )
                : null,
            vorschauBild(true),
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h('h3', {}, 'Letzte Änderungen'),
                ereignisse.length
                    ? h(
                          'div',
                          { class: 'zeilen' },
                          ereignisse.map(e => ereignisZeile(e, false))
                      )
                    : h('span', { class: 'leise' }, 'Noch keine Änderungen.')
            )
        ),
        h(
            'div',
            { class: 'stapel' },
            h(
                'div',
                { class: 'bp-karte eng kennzahlen' },
                h('h3', {}, 'Zustand'),
                h(
                    'div',
                    { class: 'kennzahl' },
                    h('span', { class: 'leise' }, 'Besuche, 30 Tage'),
                    h('span', {}, w.besuche)
                ),
                h('div', { class: 'kennzahl' }, h('span', { class: 'leise' }, 'Speicher'), h('span', {}, w.speicher)),
                h(
                    'div',
                    { class: 'kennzahl' },
                    h('span', { class: 'leise' }, 'Probleme'),
                    h('span', {}, String(w.probleme))
                )
            ),
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h('h3', {}, 'Beschreibung'),
                h('span', {}, w.beschreibung || 'Noch keine Beschreibung.')
            )
        )
    );
};

// Welcher Teil und welche Version im Reiter Code gewählt sind
const codeStand = { teil: 0, version: 0, vergleichen: false };

// Vergleicht zwei Fassungen Zeile für Zeile
const codeZeilen = (neu, alt) => {
    const neuZeilen = neu.split('\n');
    if (alt === null) return neuZeilen.map(z => h('span', {}, z));
    const altZeilen = alt.split('\n');
    return [
        ...altZeilen.filter(z => !neuZeilen.includes(z)).map(z => h('span', { class: 'weg' }, '- ' + z)),
        ...neuZeilen.map(z =>
            altZeilen.includes(z) ? h('span', {}, '  ' + z) : h('span', { class: 'dazu' }, '+ ' + z)
        )
    ];
};

const reiterCode = w => {
    const teil = DATEN.codeTeile[codeStand.teil];
    const version = teil.versionen[codeStand.version] || teil.versionen[0];
    const vorherige = teil.versionen[teil.versionen.indexOf(version) + 1];
    const vergleich = codeStand.vergleichen && vorherige ? vorherige.code : null;
    return h(
        'div',
        { class: 'code-raster' },
        h(
            'div',
            { class: 'bp-karte eng baum' },
            DATEN.codeTeile.map((t, i) =>
                h(
                    'button',
                    {
                        type: 'button',
                        class: i === codeStand.teil ? 'aktiv' : null,
                        // Der gewählte Teil steht in der Adresse, so kann die Suche direkt hinführen
                        onclick: () => {
                            location.hash = '#/website/' + w.id + '/code/' + i;
                        }
                    },
                    ikon('datei'),
                    t.name
                )
            )
        ),
        h(
            'div',
            { class: 'bp-karte code-karte' },
            h(
                'div',
                { class: 'code-kopf' },
                h(
                    'span',
                    { class: 'leise' },
                    teil.art.toUpperCase() + ', gespeichert von ' + version.von + ', ' + version.wann
                ),
                h(
                    'div',
                    { class: 'zeile-knopf' },
                    vorherige
                        ? h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-o bp-btn-klein',
                                  type: 'button',
                                  onclick: () => {
                                      codeStand.vergleichen = !codeStand.vergleichen;
                                      huelle.neu();
                                  }
                              },
                              codeStand.vergleichen ? 'Vergleich aus' : 'Mit Version ' + vorherige.nr + ' vergleichen'
                          )
                        : null,
                    h(
                        'select',
                        {
                            class: 'bp-in',
                            'aria-label': 'Version',
                            onchange: e => {
                                codeStand.version = Number(e.target.value);
                                huelle.neu();
                            }
                        },
                        teil.versionen.map((v, i) =>
                            h('option', { value: i, selected: i === codeStand.version }, 'Version ' + v.nr)
                        )
                    )
                )
            ),
            h('pre', { class: 'code-text mono' }, codeZeilen(version.code, vergleich))
        )
    );
};

const reiterDaten = () =>
    h(
        'div',
        { class: 'abschnitt' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, 'Vorbestellungen'),
            h('span', { class: 'leise' }, DATEN.datensaetze.length + ' Einträge')
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
                        ['Kunde', 'Produkt', 'Abholung', 'Stand'].map(t => h('th', {}, t))
                    )
                ),
                h(
                    'tbody',
                    {},
                    DATEN.datensaetze.map(d =>
                        h(
                            'tr',
                            {},
                            h('td', {}, d.kunde),
                            h('td', {}, d.produkt),
                            h('td', {}, d.abholung),
                            h(
                                'td',
                                {},
                                h(
                                    'span',
                                    { class: d.stand === 'Offen' ? 'bp-st bp-st-warn' : 'bp-st bp-st-ok' },
                                    d.stand
                                )
                            )
                        )
                    )
                )
            )
        )
    );

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

export const seiteWebsite = (id, reiter, teilNr) => {
    const w = DATEN.websites.find(x => x.id === id);
    if (!w)
        return h(
            'div',
            { class: 'bp-karte' },
            leer(
                'kugel',
                'Website nicht gefunden',
                'Vielleicht wurde sie gelöscht.',
                h('a', { class: 'bp-btn bp-btn-o', href: '#/' }, 'Zum Start')
            )
        );
    const aktiv = REITER.some(([k]) => k === reiter) ? reiter : 'uebersicht';
    // Reiter Code: Der Teil kommt aus der Adresse, bei einem Wechsel beginnt er bei der neusten Version
    if (aktiv === 'code') {
        const nr = DATEN.codeTeile[Number(teilNr)] ? Number(teilNr) : 0;
        if (nr !== codeStand.teil) {
            codeStand.teil = nr;
            codeStand.version = 0;
        }
    }
    const inhalt = {
        uebersicht: reiterUebersicht,
        verlauf: verlaufPlatzhalter,
        code: reiterCode,
        daten: reiterDaten,
        personen: reiterPersonen,
        einstellungen: reiterEinstellungen
    }[aktiv](w);
    // Alles, was bei dieser Website auf eine Entscheidung wartet, steht gleich hier
    const bitten = DATEN.wartet.filter(e => e.website === w.titel);
    const bitteOffen = bitten.some(e => e.art === 'Veröffentlichen');
    return [
        h('a', { class: 'zurueck', href: '#/websites' }, ikon('zurueck'), 'Meine Websites'),
        h(
            'div',
            { class: 'website-kopf' },
            h(
                'div',
                { class: 'website-titel' },
                h('h2', {}, w.titel, zustandPlakette(w.zustand)),
                h('span', { class: 'leise' }, w.id + '.vindelis.site')
            ),
            h(
                'div',
                { class: 'zeile-knopf' },
                h(
                    'button',
                    { class: 'bp-btn bp-btn-o', type: 'button', onclick: nurAnprobe },
                    ikon('aussen'),
                    'Website öffnen'
                ),
                w.zustand === 'online' || bitteOffen
                    ? null
                    : h('button', { class: 'bp-btn bp-btn-p', type: 'button', onclick: nurAnprobe }, 'Veröffentlichen')
            )
        ),
        bitten.map(wartetKarte),
        h(
            'div',
            { class: 'bp-tabs', role: 'tablist' },
            REITER.map(([k, text]) =>
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
