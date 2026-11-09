// Seite «KI-Helfer»: wer verbunden ist, woran er arbeitet, Verbindung trennen.
// Nur angemeldete Menschen. Schlüssel und Werkzeugkästen bleiben in der Werkstatt.
import { api } from '../../js/core/api.js';
import { disconnect } from '../../js/core/agent.js';
import { h, ikon, leer, dialog, meldung } from './ui.js';
import { DATEN } from './daten.js';
import { anleitungListe } from './neue-website.js';
import { helferNeuLaden } from './websites.js';

const helferVerbindenOeffnen = name =>
    dialog(({ zu }) => [
        h('h3', {}, name ? name + ' verbinden' : 'KI-Helfer verbinden'),
        anleitungListe(name),
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

// Trennen wirkt sofort. Die Rechte bleiben, mit «Erlauben» geht es später weiter
const trennenOeffnen = (x, verbindung) =>
    dialog(({ zu }) => {
        const fehler = h('div', {});
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-gefahr',
                id: 'trennen-ja',
                type: 'button',
                onclick: async () => {
                    knopf.disabled = true;
                    const antwort = await disconnect({ api, uuid: verbindung.id });
                    if (!antwort.ok) {
                        knopf.disabled = false;
                        fehler.replaceChildren(h('div', { class: 'bp-hinweis bp-h-gefahr' }, antwort.error));
                        return;
                    }
                    zu();
                    meldung('Verbindung getrennt', x.name);
                    await helferNeuLaden();
                }
            },
            'Trennen'
        );
        return [
            h('h3', {}, 'Verbindung zu ' + verbindung.name + ' trennen?'),
            h(
                'p',
                {},
                x.name +
                    ' kann danach sofort nicht mehr arbeiten. Seine Rechte bleiben, mit «Erlauben» lässt er sich wieder verbinden.'
            ),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });

const helferPlakette = x => {
    if (x.zustand === 'aktiv') return h('span', { class: 'bp-st bp-st-ok' }, x.status);
    if (x.zustand === 'neu') return h('span', { class: 'bp-st bp-st-warn' }, 'Wartet auf Verbindung');
    return h('span', { class: 'bp-badge bp-badge-s' }, 'Nicht verbunden');
};

const helferKarte = x =>
    h(
        'div',
        { class: 'bp-karte eng stapel helfer-karte' },
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
        x.arbeit.length
            ? h(
                  'div',
                  { class: 'helfer-arbeit' },
                  h('span', { class: 'leise' }, 'Arbeitet an'),
                  x.arbeit.map(s =>
                      h(
                          'a',
                          { class: 'kennzahl', href: '#/website/' + s.rootUuid },
                          h('span', {}, s.name),
                          h('span', { class: 'leise' }, s.role)
                      )
                  )
              )
            : h('span', { class: 'leise' }, 'Arbeitet noch an keiner Website.'),
        x.kaesten || x.versteckt
            ? h(
                  'span',
                  { class: 'leise' },
                  [
                      x.kaesten ? (x.kaesten === 1 ? '1 Werkzeugkasten' : x.kaesten + ' Werkzeugkästen') : null,
                      x.versteckt ? x.versteckt + ' weitere, die du nicht siehst' : null
                  ]
                      .filter(Boolean)
                      .join(', ')
              )
            : null,
        h(
            'div',
            { class: 'zeile-knopf' },
            x.verbindungen.map(v =>
                h(
                    'button',
                    { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: () => trennenOeffnen(x, v) },
                    'Verbindung zu ' + v.name + ' trennen'
                )
            ),
            x.zustand === 'aktiv'
                ? null
                : h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-o bp-btn-klein',
                          type: 'button',
                          onclick: () => helferVerbindenOeffnen(x.name)
                      },
                      'Verbinden'
                  )
        )
    );

export const seiteHelfer = () => {
    if (DATEN.mensch.art !== 'user') {
        return h(
            'div',
            { class: 'bp-karte', id: 'helfer-anmelden' },
            leer('helfer', 'Bitte melde dich an', 'KI-Helfer verbinden und verwalten können nur angemeldete Menschen.')
        );
    }
    if (DATEN.helferFehler && !DATEN.helfer.length) {
        return h(
            'div',
            { class: 'bp-karte', id: 'helfer-fehler' },
            leer(
                'helfer',
                'Konnte deine KI-Helfer nicht laden',
                'Versuch es in einer Minute nochmals.',
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: helferNeuLaden }, 'Nochmals versuchen')
            )
        );
    }
    if (!DATEN.helfer.length) {
        return h(
            'div',
            { class: 'bp-karte', id: 'helfer-leer' },
            leer(
                'helfer',
                'Noch kein KI-Helfer',
                'Verbinde Claude oder ChatGPT, dann baut die KI deine Websites.',
                h(
                    'button',
                    { class: 'bp-btn bp-btn-p', type: 'button', onclick: () => helferVerbindenOeffnen() },
                    'KI-Helfer verbinden'
                )
            )
        );
    }
    return h('div', { class: 'kacheln' }, DATEN.helfer.map(helferKarte));
};

seiteHelfer.knopf = () =>
    DATEN.mensch.art === 'user'
        ? h(
              'button',
              { class: 'bp-btn bp-btn-p', type: 'button', onclick: () => helferVerbindenOeffnen() },
              ikon('plus'),
              'KI-Helfer verbinden'
          )
        : null;
