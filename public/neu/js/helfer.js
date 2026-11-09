// Seite «KI-Helfer»: wer verbunden ist, woran er arbeitet, Verbindung trennen.
// Nur angemeldete Menschen. Schlüssel und Werkzeugkästen bleiben in der Werkstatt.
import { api } from '../../js/core/api.js';
import { invalidateObjects } from '../../js/core/objects.js';
import { h, ikon, leer, dialog, meldung } from './ui.js';
import { DATEN } from './daten.js';
import { helferNeuLaden } from './websites.js';
import { formular } from './einst-hilfe.js';
import { helferVerbindenOeffnen, websitesZuordnenOeffnen } from './helfer-zuordnen.js';
import { HELFER_KURZ, alleTrennen, verbindungsNamen } from './helfer-werte.js';

// Trennen wirkt sofort. Die Rechte bleiben, mit «Erlauben» geht es später weiter
const trennenOeffnen = x =>
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
                    const problem = await alleTrennen({ api, verbindungen: x.verbindungen });
                    if (problem) {
                        knopf.disabled = false;
                        fehler.replaceChildren(h('div', { class: 'bp-hinweis bp-h-gefahr' }, problem));
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
            h('h3', {}, 'Verbindung zu ' + verbindungsNamen(x.verbindungen) + ' trennen?'),
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

// Löschen ist endgültig. Zuerst fragt das Backend, ob es überhaupt geht
const loeschenOeffnen = async x => {
    const pfad = '/api/objects/' + encodeURIComponent(x.id);
    const vorschau = await api.get(pfad + '/delete-preview', { query: { deep: 'true' } });
    if (!vorschau.ok) {
        meldung(
            'Löschen geht nicht',
            vorschau.status === 403 ? 'Diesen Helfer darfst du nicht löschen.' : vorschau.error,
            'kreuz'
        );
        return;
    }
    const hindernisse = vorschau.data?.data?.blockers || [];
    if (hindernisse.length) {
        dialog(({ zu }) => [
            h('h3', {}, x.name + ' lässt sich gerade nicht löschen'),
            h('div', { class: 'bp-hinweis bp-h-warn', id: 'helfer-hindernis' }, hindernisse.join(' ')),
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Schliessen')
            )
        ]);
        return;
    }
    formular({
        titel: x.name + ' endgültig löschen?',
        text: 'Seine Verbindungen und Schlüssel verschwinden sofort. Websites, an denen er gearbeitet hat, bleiben bestehen, nur seine Rechte dort fallen weg. Der Name lässt sich danach nicht mehr verwenden.',
        felder: [{ name: 'name', label: 'Zur Sicherheit: tippe «' + x.name + '»', mono: true, fokus: true }],
        knopf: 'Endgültig löschen',
        gefahr: true,
        tun: async ({ name }) => {
            if (name.trim() !== x.name) return 'Der Name stimmt nicht.';
            const antwort = await api.del(pfad, { query: { deep: 'true' } });
            if (!antwort.ok) return antwort.error;
            invalidateObjects();
            offeneKarten.delete(x.id);
            meldung('Helfer gelöscht', x.name);
            await helferNeuLaden();
            return '';
        }
    });
};

const helferPlakette = x => {
    if (x.zustand === 'aktiv') return h('span', { class: 'bp-st bp-st-ok' }, x.status);
    if (x.zustand === 'neu') return h('span', { class: 'bp-st bp-st-warn' }, 'Wartet auf Verbindung');
    return h('span', { class: 'bp-badge bp-badge-s' }, 'Nicht verbunden');
};

// Karten, bei denen man «Alle anzeigen» gedrückt hat. Bleibt, wenn die Seite neu gezeichnet wird
const offeneKarten = new Set();

const arbeitListe = x => {
    const lang = x.arbeit.length > HELFER_KURZ;
    const offen = offeneKarten.has(x.id);
    const liste = h(
        'div',
        { class: 'helfer-arbeit' },
        h('span', { class: 'leise' }, 'Arbeitet an'),
        (lang && !offen ? x.arbeit.slice(0, HELFER_KURZ) : x.arbeit).map(s =>
            h(
                'a',
                { class: 'kennzahl', href: '#/website/' + s.rootUuid },
                h('span', {}, s.name),
                h('span', { class: 'leise' }, s.role)
            )
        ),
        lang
            ? h(
                  'button',
                  {
                      class: 'bp-btn bp-btn-o bp-btn-klein helfer-mehr',
                      type: 'button',
                      onclick: () => {
                          if (offen) offeneKarten.delete(x.id);
                          else offeneKarten.add(x.id);
                          liste.replaceWith(arbeitListe(x));
                      }
                  },
                  offen ? 'Weniger anzeigen' : 'Alle ' + x.arbeit.length + ' anzeigen'
              )
            : null
    );
    return liste;
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
        x.arbeit.length ? arbeitListe(x) : h('span', { class: 'leise' }, 'Arbeitet noch an keiner Website.'),
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
            x.verbindungen.length
                ? h(
                      'button',
                      { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: () => trennenOeffnen(x) },
                      'Verbindung trennen'
                  )
                : null,
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
                  ),
            h(
                'button',
                { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: () => websitesZuordnenOeffnen(x) },
                'Website zuordnen'
            ),
            h(
                'button',
                { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: () => loeschenOeffnen(x) },
                'Löschen'
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
    return h('div', { class: 'kacheln helfer-kacheln' }, DATEN.helfer.map(helferKarte));
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
