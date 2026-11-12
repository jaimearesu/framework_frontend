// Dialog «Veröffentlichen»: Die Website wird für alle sichtbar, einzelne Teile kann man davon ausnehmen.
// Das darf nur ein angemeldeter Mensch, das Backend prüft es nochmals.
import { api } from '../../js/core/api.js';
import { invalidateObjects } from '../../js/core/objects.js';
import { h, dialog, meldung } from './ui.js';
import { darfTeilen, teilenFragen } from './netzwerk-teilen.js';
import { teileGekappt, veroeffentlichenAuftrag, veroeffentlichenWahl } from './website-werte.js';

export const veroeffentlichenOeffnen = (w, site, fertig) => {
    const wahl = veroeffentlichenWahl(site);
    dialog(({ zu }) => {
        const fehler = h('div', {});
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'veroeffentlichen-ja',
                type: 'button',
                onclick: async () => {
                    knopf.disabled = true;
                    const antwort = await api.put(
                        '/api/objects/' + site.uuid + '/visibility',
                        veroeffentlichenAuftrag(wahl)
                    );
                    if (!antwort.ok) {
                        knopf.disabled = false;
                        fehler.replaceChildren(
                            h('div', { class: 'bp-hinweis bp-h-gefahr' }, antwort.error || 'Das hat nicht geklappt.')
                        );
                        return;
                    }
                    zu();
                    invalidateObjects();
                    meldung('Veröffentlicht', w.adresse);
                    await fertig();
                    // Plan "N", Stufe 3: gleich fragen, ob sie im Netzwerk erscheinen soll
                    if (darfTeilen(site)) teilenFragen(site, { nachVeroeffentlichen: true, fertig });
                }
            },
            'Jetzt veröffentlichen'
        );
        return [
            h('h3', {}, w.titel + ' veröffentlichen'),
            h(
                'p',
                {},
                'Danach kann jeder die Website unter ' +
                    w.adresse +
                    ' sehen. Datensätze und Schlüssel bleiben geschützt.'
            ),
            wahl.length
                ? h(
                      'div',
                      { class: 'stapel', id: 'veroeffentlichen-teile' },
                      h('b', {}, 'Welche Teile werden sichtbar?'),
                      h(
                          'div',
                          { class: 'wahl-liste' },
                          wahl.map(t =>
                              h(
                                  'label',
                                  { class: 'wahl-zeile' },
                                  h('input', {
                                      class: 'bp-cb',
                                      type: 'checkbox',
                                      checked: t.an,
                                      onchange: e => {
                                          t.an = e.target.checked;
                                      }
                                  }),
                                  h('span', {}, t.name),
                                  h('span', { class: 'leise' }, t.grund ? t.art + ', ' + t.grund : t.art)
                              )
                          )
                      ),
                      h('span', { class: 'leise' }, 'Was unter einem Teil liegt, folgt diesem Teil.'),
                      teileGekappt(site)
                          ? h(
                                'div',
                                { class: 'bp-hinweis bp-h-warn' },
                                'Hier stehen nur die ersten 100 Teile. Alle weiteren werden mit veröffentlicht.'
                            )
                          : null
                  )
                : null,
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });
};
