// Papierkorb: gelöschte Websites mit Sicherung, 30 Tage lang wiederherstellbar.
// Wiederherstellen baut immer eine NEUE Website auf, nie wird etwas Bestehendes überschrieben.
import { api } from '../../js/core/api.js';
import { invalidateObjects } from '../../js/core/objects.js';
import { h, ikon, dialog, meldung } from './ui.js';
import { DATEN } from './daten.js';
import { datenLaden } from './websites.js';

const zurNeuenWebsite = uuid => {
    location.hash = '#/website/' + uuid;
};

// Was man nach dem Wiederherstellen wissen muss (z.B. Tresor-Schlüssel neu eintragen)
const hinweiseZeigen = (hinweise, uuid) =>
    dialog(({ zu }) => [
        h('h3', {}, 'Bitte beachten'),
        h(
            'ul',
            { class: 'hinweis-liste' },
            hinweise.map(text => h('li', {}, String(text)))
        ),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    id: 'hinweise-weiter',
                    type: 'button',
                    onclick: () => {
                        zu();
                        zurNeuenWebsite(uuid);
                    }
                },
                'Verstanden'
            )
        )
    ]);

const wiederherstellenOeffnen = eintrag =>
    dialog(({ zu }) => {
        const fehler = h('div');
        const name = h('input', {
            id: 'neuer-name',
            class: 'bp-in',
            value: eintrag.vorschlag,
            maxlength: 100,
            autocomplete: 'off',
            'data-fokus': true
        });
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'wiederherstellen-ja',
                type: 'button',
                onclick: async () => {
                    knopf.disabled = true;
                    const antwort = await api.post('/api/snapshots/' + eintrag.id + '/restore', {
                        domain: name.value.trim()
                    });
                    if (!antwort.ok) {
                        fehler.replaceChildren(
                            h('div', { class: 'bp-hinweis bp-h-gefahr' }, antwort.error || 'Das hat nicht geklappt.')
                        );
                        knopf.disabled = false;
                        return;
                    }
                    const neu = antwort.data.data;
                    invalidateObjects();
                    await datenLaden();
                    zu();
                    meldung('Wiederhergestellt', neu.domain);
                    const hinweise = Array.isArray(neu.hinweise) ? neu.hinweise : [];
                    if (hinweise.length) hinweiseZeigen(hinweise, neu.uuid);
                    else zurNeuenWebsite(neu.uuid);
                }
            },
            'Wiederherstellen'
        );
        return [
            h('h3', {}, eintrag.name + ' wiederherstellen'),
            h(
                'p',
                {},
                'Die Sicherung vom ' +
                    eintrag.sicherung +
                    ' wird als neue, private Website aufgebaut. Nur du hast Rechte darauf.'
            ),
            h('div', { class: 'bp-feld' }, h('label', { for: 'neuer-name' }, 'Name der neuen Website'), name),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });

// Eigener Abschnitt unter den Websites. Ist der Papierkorb leer, steht hier nichts
export const papierkorbAbschnitt = () =>
    DATEN.papierkorb.length
        ? h(
              'section',
              { class: 'abschnitt', id: 'papierkorb' },
              h('div', { class: 'abschnitt-kopf' }, h('h3', {}, 'Papierkorb')),
              h(
                  'div',
                  { class: 'bp-karte eng' },
                  h(
                      'div',
                      { class: 'zeilen' },
                      DATEN.papierkorb.map(e =>
                          h(
                              'div',
                              { class: 'zeile' },
                              h(
                                  'div',
                                  { class: 'zeile-text' },
                                  h('b', {}, e.name),
                                  h('span', { class: 'leise' }, 'Gelöscht ' + e.geloescht + ', ' + e.inhalt)
                              ),
                              h(
                                  'button',
                                  {
                                      class: 'bp-btn bp-btn-o bp-btn-klein',
                                      id: 'wiederherstellen-' + e.id,
                                      type: 'button',
                                      onclick: () => wiederherstellenOeffnen(e)
                                  },
                                  ikon('zurueck'),
                                  'Wiederherstellen'
                              )
                          )
                      )
                  )
              ),
              h('span', { class: 'leise' }, 'Sicherungen gelöschter Websites bleiben 30 Tage, danach sind sie weg.')
          )
        : null;
