// Feed «Entdecken» (Plan "N", Stufe 4, 12.11.2026): eine Karte pro geteilter Website
// und der Dialog «Melden». Benutzt von der Seite /entdecken und von der Startseite.
// Alle Texte stammen von Menschen: nur über h()/textContent, nie als HTML.
// Gemeldet wird ohne Cookies (credentials: 'omit') – das Backend speichert nie, wer meldet.
import { h, dialog } from './ui.js';
import { initialen } from './profil-werte.js';
import { GRUENDE, NOTIZ_MAX, vonText, profilLink, adresseKurz, meldenAuftrag } from './entdecken-werte.js';

const meldenDialog = (basis, item) =>
    dialog(({ zu, neu }) => {
        const stand = meldenDialog.stand;
        if (stand.fertig) {
            return [
                h('h3', {}, 'Danke!'),
                h('p', {}, 'Wir schauen uns «' + item.title + '» an. Du hörst nichts mehr davon – das ist so gewollt.'),
                h(
                    'div',
                    { class: 'bp-dialog-fuss' },
                    h('button', { class: 'bp-btn bp-btn-p', type: 'button', onclick: zu }, 'Schliessen')
                )
            ];
        }
        let grund = stand.grund;
        const notiz = h('textarea', {
            id: 'melden-notiz',
            class: 'bp-in',
            rows: 3,
            maxlength: NOTIZ_MAX,
            placeholder: 'Was stimmt nicht? (freiwillig)'
        });
        const fehler = h('div', { class: 'bp-hinweis bp-h-gefahr', hidden: true, id: 'melden-fehler' });
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                type: 'button',
                id: 'melden-senden',
                onclick: async () => {
                    if (!grund) {
                        fehler.textContent = 'Wähl einen Grund.';
                        fehler.hidden = false;
                        return;
                    }
                    knopf.disabled = true;
                    let res = null;
                    try {
                        res = await fetch(basis + '/api/netzwerk/entdecken/' + item.site + '/melden', {
                            method: 'POST',
                            credentials: 'omit',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(meldenAuftrag(grund, notiz.value))
                        });
                    } catch {
                        res = null;
                    }
                    knopf.disabled = false;
                    if (res && res.ok) {
                        stand.fertig = true;
                        neu();
                        return;
                    }
                    let text = 'Das hat nicht geklappt. Bitte später nochmals.';
                    try {
                        if (res) text = (await res.json()).error || text;
                    } catch {
                        // Standard-Text
                    }
                    fehler.textContent = text;
                    fehler.hidden = false;
                }
            },
            'Melden'
        );
        return [
            h('h3', {}, '«' + item.title + '» melden'),
            h(
                'p',
                { class: 'leise' },
                'Das vindelis-Team schaut sich die Website an und nimmt sie wenn nötig aus dem Feed. Wer meldet, speichern wir nicht.'
            ),
            h(
                'div',
                { class: 'wahl-liste', id: 'melden-gruende', role: 'radiogroup' },
                GRUENDE.map(([wert, text]) =>
                    h(
                        'label',
                        { class: 'wahl-zeile' },
                        h('input', {
                            type: 'radio',
                            name: 'melden-grund',
                            value: wert,
                            checked: grund === wert,
                            onchange: () => {
                                grund = wert;
                                stand.grund = wert;
                            }
                        }),
                        h('span', {}, text)
                    )
                )
            ),
            h('div', { class: 'bp-feld' }, h('label', { for: 'melden-notiz' }, 'Notiz'), notiz),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });
meldenDialog.stand = {};

// Kleines rundes Bild (nur wenn die Profilseite an ist), sonst Initialen
const kleinesBild = (basis, by) =>
    by.hasAvatar
        ? h(
              'span',
              { class: 'profilbild feed-profilbild' },
              h('img', {
                  src:
                      basis +
                      '/api/profil/oeffentlich/@' +
                      by.handle +
                      '/bild?v=' +
                      encodeURIComponent(by.avatarAt || ''),
                  alt: '',
                  loading: 'lazy'
              })
          )
        : h(
              'span',
              { class: 'profilbild feed-profilbild', 'aria-hidden': 'true' },
              h('span', { class: 'profilbild-init' }, initialen(by))
          );

/**
 * Eine Karte im Feed.
 * basis = Adresse des Backends (Bilder laden direkt von dort), item = ein Eintrag aus GET /api/netzwerk/entdecken
 */
export const feedKarte = (basis, item) => {
    const link = profilLink(item.by);
    const von = [kleinesBild(basis, item.by), h('span', {}, vonText(item.by))];
    return h(
        'article',
        { class: 'bp-karte feed-karte', 'data-site': item.site },
        h(
            'a',
            {
                class: 'profilseite-vorschau feed-vorschau',
                href: item.address || '#',
                target: '_blank',
                rel: 'noopener',
                tabindex: '-1',
                'aria-hidden': 'true'
            },
            item.hasThumb
                ? h('img', {
                      src:
                          basis +
                          '/api/netzwerk/entdecken/' +
                          item.site +
                          '/vorschau?v=' +
                          encodeURIComponent(item.thumbAt || ''),
                      alt: '',
                      loading: 'lazy',
                      decoding: 'async'
                  })
                : h('span', { class: 'profilseite-vorschau-leer' }, String(item.title).slice(0, 1).toUpperCase())
        ),
        h(
            'div',
            { class: 'feed-text' },
            h('a', { class: 'feed-titel', href: item.address || '#', target: '_blank', rel: 'noopener' }, item.title),
            item.blurb ? h('p', { class: 'feed-satz' }, item.blurb) : null,
            item.address ? h('span', { class: 'leise mono feed-adresse' }, adresseKurz(item.address)) : null
        ),
        h(
            'div',
            { class: 'feed-fuss' },
            link ? h('a', { class: 'feed-von', href: link }, ...von) : h('span', { class: 'feed-von' }, ...von),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-g bp-btn-klein feed-melden',
                    type: 'button',
                    onclick: () => {
                        meldenDialog.stand = {};
                        meldenDialog(basis, item);
                    }
                },
                'Melden'
            )
        )
    );
};
