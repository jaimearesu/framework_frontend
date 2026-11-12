// Seite «Meldungen» – nur für Admins (Plan "N", Stufe 4, 12.11.2026).
// Wer Admin ist, steht im Backend (ADMIN_ACCOUNTS in der .env); für alle anderen gibt es
// weder den Menüpunkt noch die Daten (das Backend antwortet 404).
// Titel, Sätze und Notizen kommen von fremden Menschen: nur über h(), nie als HTML.
import { api } from '../../js/core/api.js';
import { timeAgo } from '../../js/core/format.js';
import { h, meldung, leer } from './ui.js';
import { geladen, nochmals, mitDaten, formular } from './einst-hilfe.js';
import { gruendeText, meldungenTeilen } from './meldungen-werte.js';

const SCHLUESSEL = 'admin:meldungen';
const pfad = (site, was) => '/api/admin/netzwerk/' + encodeURIComponent(site) + '/' + was;

const tun = async (site, was, body, text) => {
    const antwort = await api.post(pfad(site, was), body || {});
    if (!antwort.ok) return antwort.error || 'Das hat nicht geklappt.';
    meldung(text);
    await nochmals(SCHLUESSEL);
    return '';
};

const herausnehmen = e =>
    formular({
        titel: '«' + e.title + '» aus dem Feed nehmen?',
        text: 'Die Website verschwindet aus «Entdecken». Online bleibt sie. Die teilende Person sieht den Grund im Cockpit und kann sie nicht neu teilen.',
        felder: [
            {
                name: 'grund',
                label: 'Grund (sieht die Person)',
                platzhalter: 'z.B. Werbung ist im Feed nicht erlaubt',
                fokus: true
            }
        ],
        knopf: 'Herausnehmen',
        gefahr: true,
        tun: ({ grund }) => tun(e.site, 'herausnehmen', { grund: grund.trim() || undefined }, 'Aus dem Feed genommen')
    });

const knopf = (text, onclick, art = 'bp-btn-o') =>
    h('button', { class: 'bp-btn bp-btn-klein ' + art, type: 'button', onclick }, text);

const eintrag = e =>
    h(
        'div',
        { class: 'bp-karte stapel', 'data-site': e.site },
        h(
            'div',
            { class: 'zeile-text' },
            h('b', {}, e.title),
            h(
                'span',
                { class: 'leise' },
                (e.handle ? '@' + e.handle + ' · ' : '') +
                    e.name +
                    (e.visibility !== 'public' ? ' · gerade nicht öffentlich' : '')
            )
        ),
        e.blurb ? h('span', {}, e.blurb) : null,
        e.open
            ? h(
                  'span',
                  { class: 'bp-hinweis bp-h-warn' },
                  gruendeText(e.reasons) + ' – zuerst ' + timeAgo(e.firstAt) + ', zuletzt ' + timeAgo(e.lastAt)
              )
            : null,
        e.notes.length
            ? h(
                  'ul',
                  { class: 'stapel meldung-notizen' },
                  e.notes.map(n => h('li', { class: 'leise' }, '«' + n + '»'))
              )
            : null,
        e.hidden
            ? h(
                  'span',
                  { class: 'leise' },
                  'Herausgenommen ' + timeAgo(e.hiddenAt) + (e.hiddenReason ? ': ' + e.hiddenReason : '')
              )
            : null,
        h(
            'div',
            { class: 'knopf-reihe' },
            e.address
                ? h(
                      'a',
                      {
                          class: 'bp-btn bp-btn-klein bp-btn-o',
                          href: e.address,
                          target: '_blank',
                          rel: 'noopener noreferrer'
                      },
                      'Website ansehen'
                  )
                : null,
            e.hidden
                ? knopf('Zurücklegen', () =>
                      tun(e.site, 'zuruecklegen', null, 'Wieder im Feed').then(f => f && meldung(f))
                  )
                : knopf('Herausnehmen', () => herausnehmen(e), 'bp-btn-gefahr'),
            e.open && !e.hidden
                ? knopf('Verwerfen', () =>
                      tun(e.site, 'verwerfen', null, 'Meldungen verworfen').then(f => f && meldung(f))
                  )
                : null
        )
    );

export const seiteMeldungen = () =>
    mitDaten(
        geladen(SCHLUESSEL, () => api.get('/api/admin/netzwerk')),
        daten => {
            const { offen, heraus } = meldungenTeilen(daten);
            return h(
                'div',
                { class: 'stapel', id: 'meldungen' },
                h('h3', {}, 'Offen'),
                offen.length
                    ? offen.map(eintrag)
                    : h(
                          'div',
                          { class: 'bp-karte' },
                          leer('haken', 'Keine offenen Meldungen', 'Im Feed ist gerade alles in Ordnung.')
                      ),
                heraus.length ? [h('h3', {}, 'Herausgenommen'), heraus.map(eintrag)] : null,
                h(
                    'p',
                    { class: 'leise' },
                    'Wer meldet, wird nie gespeichert. Erledigte Meldungen verschwinden nach 180 Tagen.'
                )
            );
        },
        { symbol: 'nachricht' }
    );
seiteMeldungen.unter = () => h('span', { class: 'leise' }, 'Gemeldete Websites im Feed «Entdecken»');
