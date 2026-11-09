// KI-Helfer einer Website zuordnen, von beiden Seiten:
//   auf der Website: Helfer antippen, fertig
//   auf der Helfer-Karte: Websites, Speicher und Werkzeugkästen anhaken
// Es entsteht nichts Neues im Backend, es sind die normalen Rechte auf dem Objekt.
import { api } from '../../js/core/api.js';
import { h, dialog, meldung, zuAdresse } from './ui.js';
import { DATEN } from './daten.js';
import { anleitungListe } from './neue-website.js';
import { datenLaden, helferLaden, helferNeuLaden } from './websites.js';
import {
    helferKurztext,
    helferNameAus,
    mehrereZuordnen,
    neuenHelferAnlegen,
    rechteGeben,
    zuordnungsZiele
} from './helfer-werte.js';

export const helferVerbindenOeffnen = name =>
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

// Auf der Website: einen Helfer antippen, und er ist zugeordnet
export const helferZuordnenOeffnen = async (site, nachher) => {
    await helferLaden();
    const stand = { neuerName: '', neueUuid: null, fehler: '', arbeitet: false };
    dialog(({ zu, neu }) => {
        const zuordnen = async x => {
            stand.arbeitet = true;
            neu();
            const problem = await rechteGeben({ api, ziel: site.uuid, helfer: x.id });
            stand.arbeitet = false;
            if (problem) {
                stand.fehler = problem;
                return neu();
            }
            zu();
            meldung('Helfer zugeordnet', x.name + ' kann jetzt an ' + site.name + ' arbeiten.');
            await helferLaden();
            nachher();
        };
        const neuAnlegen = async () => {
            const name = helferNameAus(stand.neuerName, zuAdresse);
            if (name.fehler) {
                stand.fehler = name.fehler;
                return neu();
            }
            stand.arbeitet = true;
            neu();
            // Scheitert danach das Zuordnen, entsteht beim nächsten Versuch kein zweiter Helfer
            if (!stand.neueUuid) {
                const angelegt = await neuenHelferAnlegen(api, name.name);
                if (angelegt.fehler) {
                    stand.arbeitet = false;
                    stand.fehler = angelegt.fehler;
                    return neu();
                }
                stand.neueUuid = angelegt.uuid;
            }
            const problem = await rechteGeben({ api, ziel: site.uuid, helfer: stand.neueUuid });
            stand.arbeitet = false;
            if (problem) {
                stand.fehler = problem;
                return neu();
            }
            zu();
            await helferLaden();
            nachher();
            helferVerbindenOeffnen(name.name);
        };
        return [
            h('h3', {}, 'Wer soll an ' + site.name + ' arbeiten?'),
            h('p', { class: 'leise' }, 'Der Helfer darf diese Website bearbeiten und verwalten, sonst nichts.'),
            DATEN.helfer.length
                ? h(
                      'div',
                      { class: 'wahl-liste', id: 'zuordnen-liste' },
                      DATEN.helfer.map(x => {
                          const schon = x.zugeordnet.includes(site.uuid);
                          return h(
                              'button',
                              {
                                  class: 'zuordnen-zeile',
                                  type: 'button',
                                  disabled: schon || stand.arbeitet,
                                  onclick: () => zuordnen(x)
                              },
                              h(
                                  'span',
                                  { class: 'zeile-text' },
                                  h('b', {}, x.name),
                                  h('span', { class: 'leise' }, helferKurztext(x))
                              ),
                              schon
                                  ? h('span', { class: 'bp-badge bp-badge-s' }, 'Schon zugeordnet')
                                  : h('span', { class: 'bp-btn bp-btn-o bp-btn-klein' }, 'Zuordnen')
                          );
                      })
                  )
                : null,
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'zuordnen-neu' }, 'Oder neuen Helfer anlegen'),
                h(
                    'div',
                    { class: 'zuordnen-neu' },
                    h('input', {
                        id: 'zuordnen-neu',
                        class: 'bp-in',
                        placeholder: 'Name des Helfers',
                        autocomplete: 'off',
                        maxlength: 60,
                        value: stand.neuerName,
                        oninput: e => {
                            stand.neuerName = e.target.value;
                        }
                    }),
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-o',
                            id: 'zuordnen-neu-ja',
                            type: 'button',
                            disabled: stand.arbeitet,
                            onclick: neuAnlegen
                        },
                        'Anlegen'
                    )
                )
            ),
            stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null
        ];
    });
};

// Auf der Helfer-Karte: anhaken, was er bearbeiten soll
export const websitesZuordnenOeffnen = async x => {
    await datenLaden();
    const ziele = zuordnungsZiele(DATEN.websites, DATEN.kaesten);
    const gewaehlt = new Set();
    dialog(({ zu }) => {
        const fehler = h('div', {});
        const knopfText = () => (gewaehlt.size ? 'Zuordnen (' + gewaehlt.size + ')' : 'Zuordnen');
        const ja = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'zuordnen-ja',
                type: 'button',
                disabled: true,
                onclick: async () => {
                    ja.disabled = true;
                    fehler.replaceChildren();
                    const auswahl = ziele.filter(z => gewaehlt.has(z.id));
                    const ergebnis = await mehrereZuordnen({ api, helfer: x.id, ziele: auswahl });
                    if (ergebnis.fehler.length) {
                        ja.disabled = false;
                        fehler.replaceChildren(
                            h(
                                'div',
                                { class: 'bp-hinweis bp-h-gefahr' },
                                'Hat nicht geklappt bei: ' + ergebnis.fehler.map(f => f.titel).join(', ')
                            )
                        );
                        await helferLaden();
                        return;
                    }
                    zu();
                    meldung('Zugeordnet', x.name + ' hat ' + auswahl.length + ' neue Zugriffe.');
                    await helferNeuLaden();
                }
            },
            knopfText()
        );
        const zeilen = ziele.map(z => {
            const schon = x.zugeordnet.includes(z.id);
            return {
                z,
                teil: h(
                    'label',
                    { class: 'wahl-zeile zuordnen-haken' },
                    h('input', {
                        type: 'checkbox',
                        class: 'bp-cb',
                        checked: schon,
                        disabled: schon,
                        onchange: e => {
                            if (e.target.checked) gewaehlt.add(z.id);
                            else gewaehlt.delete(z.id);
                            ja.textContent = knopfText();
                            ja.disabled = !gewaehlt.size;
                        }
                    }),
                    h('span', {}, z.titel),
                    h('span', { class: 'leise' }, schon ? 'Schon zugeordnet' : z.text)
                )
            };
        });
        return [
            h('h3', {}, 'Woran soll ' + x.name + ' arbeiten?'),
            ziele.length > 8
                ? h('input', {
                      class: 'bp-in',
                      id: 'zuordnen-suche',
                      placeholder: 'Suchen…',
                      autocomplete: 'off',
                      oninput: e => {
                          const text = e.target.value.trim().toLowerCase();
                          zeilen.forEach(({ z, teil }) => {
                              teil.style.display = z.titel.toLowerCase().includes(text) ? '' : 'none';
                          });
                      }
                  })
                : null,
            ziele.length
                ? h(
                      'div',
                      { class: 'wahl-liste', id: 'zuordnen-liste' },
                      zeilen.map(({ teil }) => teil)
                  )
                : h('p', { class: 'leise' }, 'Du hast noch nichts, das du anderen geben darfst.'),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                ja
            )
        ];
    });
};
