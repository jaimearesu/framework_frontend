// Websites im Netzwerk teilen (Plan "N", Stufe 3, 12.11.2026).
// Geht eine Website online, fragt das Cockpit: «Im Netzwerk zeigen?» – mit Vorschaubild,
// Titel und einem Satz. Dazu die Karte «Im Netzwerk» in der Übersicht einer Website.
// Das Backend prüft alles nochmals (Mensch, @name, blue, öffentlich). Texte nur über h().
import { api } from '../../js/core/api.js';
import { h, dialog, meldung, laedtBalken } from './ui.js';
import { DATEN } from './daten.js';
import { vorschauBild } from './seiten.js';
import { netzwerkZustand, teilenAuftrag, zeichenRest } from './netzwerk-werte.js';

const pfad = uuid => '/api/netzwerk/websites/' + encodeURIComponent(uuid);

// Nur Menschen mit Konto, die die Website verwalten (blue), sehen das überhaupt
export const darfTeilen = site => DATEN.mensch.art === 'user' && Boolean(site?.rights?.grant);

const profilLink = () =>
    h('a', { class: 'bp-btn bp-btn-o bp-btn-klein', href: '#/konto/profil', id: 'netzwerk-profil' }, '@namen wählen');

// Ein Textfeld mit Zähler darunter
const feld = ({ id, label, wert, max, platzhalter, zeilen }) => {
    const rest = h('small', { class: 'leise' }, '');
    const zeigeRest = text => {
        const n = zeichenRest(text, max);
        rest.textContent = n < 0 ? Math.abs(n) + ' Zeichen zu viel' : 'noch ' + n + ' Zeichen';
    };
    zeigeRest(wert);
    const eingabe = h(zeilen ? 'textarea' : 'input', {
        id,
        class: 'bp-in',
        value: wert,
        placeholder: platzhalter,
        maxlength: max,
        ...(zeilen ? { rows: zeilen } : { type: 'text' }),
        oninput: e => zeigeRest(e.target.value)
    });
    return { eingabe, block: h('div', { class: 'bp-feld' }, h('label', { for: id }, label), eingabe, rest) };
};

/**
 * Der Dialog «Im Netzwerk zeigen?».
 * site = Website aus GET /api/websites/:uuid, nachVeroeffentlichen = gleich nach dem Veröffentlichen gefragt
 * fertig = wird nach Teilen/Entfernen aufgerufen (z.B. Karte neu laden)
 */
export const teilenFragen = (site, { nachVeroeffentlichen = false, fertig = async () => {} } = {}) => {
    const stand = { status: null, fehler: null, thumbAt: site.thumbAt || null, aufnahme: false };
    api.get(pfad(site.uuid)).then(antwort => {
        if (antwort.ok) stand.status = antwort.data.data;
        else stand.fehler = antwort.error || 'Das hat nicht geklappt.';
        neuZeichnen();
    });
    let neuZeichnen = () => {};
    dialog(({ zu, neu }) => {
        neuZeichnen = neu;
        const kopf = [
            h('h3', {}, nachVeroeffentlichen ? 'Online! Im Netzwerk zeigen?' : 'Im Netzwerk zeigen'),
            h(
                'p',
                { class: 'leise' },
                'Andere auf vindelis sehen dann Vorschaubild, Titel, deinen Satz und deinen @namen. Die Website ist schon öffentlich – Teilen ändert daran nichts.'
            )
        ];
        if (stand.fehler) return [...kopf, h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler)];
        if (!stand.status) return [...kopf, laedtBalken()];
        const s = stand.status;
        const z = netzwerkZustand(s);
        if (!s.canShare && !s.share) {
            return [
                ...kopf,
                h('div', { class: 'bp-hinweis bp-h-info', id: 'netzwerk-grund' }, z.text),
                h(
                    'div',
                    { class: 'bp-dialog-fuss' },
                    h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Schliessen'),
                    z.profilLink ? profilLink() : null
                )
            ];
        }

        // Vorschaubild: fehlt es (z.B. gleich nach dem Veröffentlichen), kann man es hier aufnehmen
        const bild = vorschauBild(true, { uuid: site.uuid, thumbAt: stand.thumbAt });
        const aufnehmen = h(
            'button',
            {
                class: 'bp-btn bp-btn-o bp-btn-klein',
                type: 'button',
                id: 'netzwerk-bild',
                disabled: stand.aufnahme,
                onclick: async () => {
                    stand.aufnahme = true;
                    neu();
                    const antwort = await api.post('/api/websites/' + site.uuid + '/vorschau');
                    stand.aufnahme = false;
                    if (antwort.ok) stand.thumbAt = antwort.data?.data?.thumbAt || new Date().toISOString();
                    else meldung('Vorschaubild nicht aufgenommen', antwort.error, 'kreuz');
                    neu();
                }
            },
            stand.aufnahme ? 'Wird aufgenommen…' : stand.thumbAt ? 'Neu aufnehmen' : 'Vorschaubild aufnehmen'
        );

        const titel = feld({
            id: 'netzwerk-titel',
            label: 'Titel',
            wert: s.share?.title || s.suggestedTitle || '',
            max: s.limits.title,
            platzhalter: 'z.B. USS Enterprise'
        });
        const satz = feld({
            id: 'netzwerk-satz',
            label: 'Ein Satz dazu (freiwillig)',
            wert: s.share?.blurb || '',
            max: s.limits.blurb,
            platzhalter: 'z.B. Logbuch der Crew – mutig dorthin, wo noch niemand war.',
            zeilen: 2
        });
        titel.eingabe.dataset.fokus = '1';
        const fehler = h('div', { class: 'bp-hinweis bp-h-gefahr', id: 'netzwerk-fehler', hidden: true });

        const speichern = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                type: 'button',
                id: 'netzwerk-teilen',
                onclick: async () => {
                    speichern.disabled = true;
                    const antwort = await api.put(
                        pfad(site.uuid),
                        teilenAuftrag(titel.eingabe.value, satz.eingabe.value)
                    );
                    speichern.disabled = false;
                    if (!antwort.ok) {
                        fehler.textContent = antwort.error || 'Das hat nicht geklappt.';
                        fehler.hidden = false;
                        return;
                    }
                    zu();
                    meldung(s.share ? 'Gespeichert' : 'Im Netzwerk geteilt', antwort.data.data.title);
                    await fertig();
                }
            },
            s.share ? 'Speichern' : 'Im Netzwerk zeigen'
        );
        const entfernen = s.share
            ? h(
                  'button',
                  {
                      class: 'bp-btn bp-btn-o',
                      type: 'button',
                      id: 'netzwerk-entfernen',
                      onclick: async () => {
                          entfernen.disabled = true;
                          const antwort = await api.del(pfad(site.uuid));
                          entfernen.disabled = false;
                          if (!antwort.ok) {
                              fehler.textContent = antwort.error || 'Das hat nicht geklappt.';
                              fehler.hidden = false;
                              return;
                          }
                          zu();
                          meldung('Nicht mehr im Netzwerk', site.name);
                          await fertig();
                      }
                  },
                  'Nicht mehr zeigen'
              )
            : null;

        return [
            ...kopf,
            z.zustand === 'pausiert' ? h('div', { class: 'bp-hinweis bp-h-warn' }, z.text) : null,
            h('div', { class: 'stapel netzwerk-bild' }, bild, h('div', {}, aufnehmen)),
            titel.block,
            satz.block,
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                entfernen,
                h(
                    'button',
                    { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu },
                    nachVeroeffentlichen && !s.share ? 'Nicht jetzt' : 'Abbrechen'
                ),
                speichern
            )
        ];
    });
};

// Die Karte «Im Netzwerk» in der Übersicht einer Website (lädt ihren Stand selbst)
export const netzwerkKarte = site => {
    if (!darfTeilen(site)) return null;
    const karte = h(
        'div',
        { class: 'bp-karte eng stapel', id: 'netzwerk-karte' },
        h('h3', {}, 'Im Netzwerk'),
        laedtBalken()
    );
    const laden = async () => {
        const antwort = await api.get(pfad(site.uuid));
        if (!antwort.ok) {
            karte.replaceChildren(h('h3', {}, 'Im Netzwerk'), h('span', { class: 'leise' }, antwort.error || ''));
            return;
        }
        const z = netzwerkZustand(antwort.data.data);
        karte.replaceChildren(
            h('h3', {}, z.titel),
            h('span', { class: z.zustand === 'geteilt' ? '' : 'leise', id: 'netzwerk-text' }, z.text),
            z.knopf || z.profilLink
                ? h(
                      'div',
                      { class: 'knopf-reihe' },
                      z.knopf
                          ? h(
                                'button',
                                {
                                    class: 'bp-btn bp-btn-o bp-btn-klein',
                                    type: 'button',
                                    id: 'netzwerk-oeffnen',
                                    onclick: () => teilenFragen(site, { fertig: laden })
                                },
                                z.knopf
                            )
                          : null,
                      z.profilLink ? profilLink() : null
                  )
                : null
        );
    };
    laden();
    return karte;
};
