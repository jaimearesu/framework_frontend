// Reiter «Übersicht» einer Website: Probleme, Vorschaubild, Zustand, Notiz
import { api } from '../../js/core/api.js';
import { formatNumber, timeAgo } from '../../js/core/format.js';
import { problemKindText, repairPrompt } from '../../js/core/view.js';
import { h, meldung, laedtBalken } from './ui.js';
import { vorschauBild } from './seiten.js';
import { zustandZeilen } from './website-werte.js';

// Der gewählte Zeitraum bleibt, auch wenn die Seite neu gezeichnet wird
const problemAnsicht = { stunden: 24 };

const reparierenKnopf = (name, stunden) =>
    h(
        'button',
        {
            class: 'bp-btn bp-btn-o bp-btn-klein',
            type: 'button',
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(repairPrompt(name, stunden));
                    meldung('Text kopiert', 'Füge ihn bei deinem KI-Helfer ein.');
                } catch {
                    meldung('Kopieren ging nicht', 'Der Browser hat es nicht erlaubt.', 'kreuz');
                }
            }
        },
        'KI bitten, es zu reparieren'
    );

// Probleme sieht nur, wer ändern darf. Die Texte stammen zum Teil von Besuchern und bleiben reiner Text
const problemeKarte = site => {
    const karte = h('div', { class: 'bp-karte eng stapel', id: 'probleme-karte' });
    let lauf = 0;
    const zeichne = async () => {
        const dieser = ++lauf;
        const stunden = problemAnsicht.stunden;
        const zeitKnopf = (wert, text) =>
            h(
                'button',
                {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': stunden === wert ? 'true' : 'false',
                    onclick: () => {
                        problemAnsicht.stunden = wert;
                        zeichne();
                    }
                },
                text
            );
        const kopf = h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, 'Probleme'),
            h(
                'div',
                { class: 'bp-segment', role: 'tablist', 'aria-label': 'Zeitraum' },
                zeitKnopf(24, '24 Std.'),
                zeitKnopf(168, '7 Tage')
            )
        );
        karte.replaceChildren(kopf, laedtBalken());
        const antwort = await api.get('/api/objects/' + site.uuid + '/problems', { query: { hours: stunden } });
        if (dieser !== lauf) return;
        if (!antwort.ok) {
            karte.replaceChildren(kopf, h('span', { class: 'leise' }, 'Die Probleme konnten nicht geladen werden.'));
            return;
        }
        const liste = antwort.data?.data?.problems || [];
        karte.replaceChildren(kopf);
        karte.append(
            liste.length
                ? h(
                      'div',
                      { class: 'zeilen' },
                      liste.map(p =>
                          h(
                              'div',
                              { class: 'zeile' },
                              h(
                                  'div',
                                  { class: 'zeile-text' },
                                  h('b', {}, problemKindText(p.kind)),
                                  p.part ? h('span', { class: 'leise mono' }, p.part) : null,
                                  p.hint ? h('span', { class: 'leise' }, p.hint) : null
                              ),
                              h(
                                  'span',
                                  { class: 'leise' },
                                  formatNumber(p.count) + '×, ' + (p.lastAt ? timeAgo(p.lastAt) : '–')
                              )
                          )
                      )
                  )
                : h('span', { class: 'leise' }, 'Keine Probleme in diesem Zeitraum.')
        );
        if (liste.length) karte.append(h('div', {}, reparierenKnopf(site.name, stunden)));
    };
    zeichne();
    return karte;
};

// Das Bild mit dem Knopf zum Aufnehmen. Geht bei jeder Website, an der man bauen darf
const vorschauBlock = (w, site, neuHolen) => {
    if (!site.rights?.write) return vorschauBild(true, w);
    const text = site.thumbAt ? 'Vorschau neu aufnehmen' : 'Vorschau aufnehmen';
    const knopf = h(
        'button',
        {
            class: 'bp-btn bp-btn-o bp-btn-klein',
            id: 'vorschau-aufnehmen',
            type: 'button',
            onclick: async () => {
                knopf.disabled = true;
                knopf.textContent = 'Wird aufgenommen…';
                const antwort = await api.post('/api/websites/' + site.uuid + '/vorschau');
                if (antwort.ok) {
                    meldung('Vorschau aufgenommen');
                    await neuHolen();
                    return;
                }
                knopf.disabled = false;
                knopf.textContent = text;
                meldung('Das hat nicht geklappt', antwort.error, 'kreuz');
            }
        },
        text
    );
    return h('div', { class: 'stapel' }, vorschauBild(true, w), h('div', {}, knopf));
};

const zustandKarte = site =>
    h(
        'div',
        { class: 'bp-karte eng kennzahlen', id: 'zustand-karte' },
        h('h3', {}, 'Zustand'),
        zustandZeilen(site).map(([titel, wert]) =>
            h('div', { class: 'kennzahl' }, h('span', { class: 'leise' }, titel), h('span', {}, wert))
        )
    );

// Was gerade im Notizfeld steht. So geht nichts verloren, wenn die Seite neu gezeichnet wird
const notizStand = { id: null, entwurf: null };

const notizKarte = site => {
    const karte = h('div', { class: 'bp-karte eng stapel', id: 'notiz-karte' });
    if (notizStand.id !== site.uuid) {
        notizStand.id = site.uuid;
        notizStand.entwurf = null;
    }
    const lesen = () => {
        karte.replaceChildren(
            h('h3', {}, 'Notiz'),
            h('span', { class: 'notiz-text' + (site.note ? '' : ' leise') }, site.note || 'Noch keine Notiz.'),
            site.rights?.write
                ? h(
                      'div',
                      {},
                      h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-o bp-btn-klein',
                              id: 'notiz-aendern',
                              type: 'button',
                              onclick: () => {
                                  notizStand.entwurf = site.note || '';
                                  schreiben();
                              }
                          },
                          'Bearbeiten'
                      )
                  )
                : null
        );
    };
    const schreiben = () => {
        const feld = h('textarea', {
            class: 'bp-in',
            id: 'notiz-feld',
            rows: 4,
            maxlength: 2000,
            'aria-label': 'Notiz',
            oninput: e => {
                notizStand.entwurf = e.target.value;
            }
        });
        feld.value = notizStand.entwurf;
        const fehler = h('div', {});
        const speichern = h(
            'button',
            {
                class: 'bp-btn bp-btn-p bp-btn-klein',
                id: 'notiz-speichern',
                type: 'button',
                onclick: async () => {
                    speichern.disabled = true;
                    const antwort = await api.put('/api/objects/' + site.uuid + '/note', { note: feld.value });
                    speichern.disabled = false;
                    if (!antwort.ok) {
                        fehler.replaceChildren(
                            h('div', { class: 'bp-hinweis bp-h-gefahr' }, antwort.error || 'Das hat nicht geklappt.')
                        );
                        return;
                    }
                    site.note = antwort.data?.data?.note ?? null;
                    notizStand.entwurf = null;
                    lesen();
                    meldung('Notiz gespeichert');
                }
            },
            'Speichern'
        );
        karte.replaceChildren(
            h('h3', {}, 'Notiz'),
            feld,
            fehler,
            h(
                'div',
                { class: 'zeile-knopf' },
                speichern,
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o bp-btn-klein',
                        type: 'button',
                        onclick: () => {
                            notizStand.entwurf = null;
                            lesen();
                        }
                    },
                    'Abbrechen'
                )
            )
        );
    };
    if (notizStand.entwurf !== null && site.rights?.write) schreiben();
    else lesen();
    return karte;
};

export const reiterUebersicht = (w, site, neuHolen) =>
    h(
        'div',
        { class: 'zweispalter' },
        h(
            'div',
            { class: 'stapel' },
            site.rights?.write ? problemeKarte(site) : null,
            vorschauBlock(w, site, neuHolen)
        ),
        h('div', { class: 'stapel' }, zustandKarte(site), notizKarte(site))
    );
