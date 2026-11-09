// Der Verlauf: wer hat wann was geändert. Einmal für eine Website, einmal für alle.
// Das Backend zeigt ihn nur mit blue und lässt weg, was nichts verändert.
import { api } from '../../js/core/api.js';
import { h, leer, huelle, laedtKarte } from './ui.js';
import { DATEN } from './daten.js';
import { nachTagen, verlaufSatz, verlaufUhrzeit, verlaufWer } from './verlauf-werte.js';

const FRISCH_MS = 30000;
const PRO_SEITE = 50;
const speicher = new Map();

const laden = async (eintrag, mehr = false) => {
    // Antwortet eine ältere Anfrage erst nach einem Filter-Wechsel, zählt sie nicht mehr
    const nummer = ++eintrag.nummer;
    eintrag.laeuft = true;
    eintrag.zeit = Date.now();
    const query = { limit: PRO_SEITE };
    if (eintrag.wer !== 'alle') query.wer = eintrag.wer;
    if (mehr) query.before = eintrag.weiter;
    const antwort = await api.get(eintrag.pfad, { query });
    if (nummer !== eintrag.nummer) return;
    const vorher = JSON.stringify([eintrag.liste, eintrag.fehler, eintrag.da]);
    eintrag.laeuft = false;
    eintrag.da = true;
    eintrag.status = antwort.status;
    eintrag.fehler = antwort.ok ? null : antwort.error || 'Das hat gerade nicht geklappt.';
    if (antwort.ok) {
        const neu = antwort.data?.data || [];
        eintrag.liste = mehr ? [...eintrag.liste, ...neu] : neu;
        eintrag.weiter = antwort.data?.meta?.next_before ?? null;
    }
    if (mehr || vorher !== JSON.stringify([eintrag.liste, eintrag.fehler, eintrag.da])) huelle.neu();
};

const eintragFuer = pfad => {
    let eintrag = speicher.get(pfad);
    if (!eintrag) {
        eintrag = {
            pfad,
            wer: 'alle',
            liste: [],
            weiter: null,
            fehler: null,
            status: 0,
            da: false,
            laeuft: false,
            zeit: 0,
            nummer: 0
        };
        speicher.set(pfad, eintrag);
    }
    // Nur die erste Seite auffrischen, sonst springt beim Lesen der älteren alles weg
    if (!eintrag.laeuft && !eintrag.weiterGeladen && Date.now() - eintrag.zeit > FRISCH_MS) laden(eintrag);
    return eintrag;
};

const zeileEintrag = (e, mitWebsite) =>
    h(
        'li',
        { class: 'verlauf-zeile' },
        h('time', { class: 'leise mono', datetime: e.at }, verlaufUhrzeit(e.at)),
        h(
            'div',
            { class: 'zeile-text' },
            h('span', {}, h('b', {}, verlaufWer(e, DATEN.mensch.id)), ' · ', verlaufSatz(e)),
            mitWebsite ? h('a', { class: 'leise', href: '#/website/' + e.websiteUuid + '/verlauf' }, e.website) : null
        )
    );

const filterKnopf = (eintrag, wert, text) =>
    h(
        'button',
        {
            type: 'button',
            id: 'verlauf-' + wert,
            role: 'tab',
            'aria-selected': eintrag.wer === wert ? 'true' : 'false',
            onclick: () => {
                eintrag.wer = wert;
                eintrag.da = false;
                eintrag.liste = [];
                eintrag.weiterGeladen = false;
                laden(eintrag);
                huelle.neu();
            }
        },
        text
    );

const verlaufAnzeige = (pfad, { titel, mitWebsite }) => {
    const eintrag = eintragFuer(pfad);
    const koerper = () => {
        if (!eintrag.da) return laedtKarte('verlauf-laedt');
        if (eintrag.fehler) {
            const rechte = eintrag.status === 403;
            return h(
                'div',
                { class: 'bp-karte', id: 'verlauf-fehler' },
                leer('verlauf', rechte ? 'Keine Berechtigung' : 'Konnte den Verlauf nicht laden', eintrag.fehler)
            );
        }
        if (!eintrag.liste.length) {
            return h(
                'div',
                { class: 'bp-karte', id: 'verlauf-leer' },
                leer('verlauf', 'Noch keine Änderungen', 'Sobald jemand etwas ändert, steht es hier.')
            );
        }
        return [
            h(
                'div',
                { class: 'bp-karte stapel', id: 'verlauf-liste' },
                nachTagen(eintrag.liste).map(tag =>
                    h(
                        'section',
                        { class: 'verlauf-tag' },
                        h('h4', {}, tag.titel),
                        h(
                            'ul',
                            { class: 'verlauf-zeilen' },
                            tag.eintraege.map(e => zeileEintrag(e, mitWebsite))
                        )
                    )
                )
            ),
            eintrag.weiter
                ? h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-o',
                          id: 'verlauf-mehr',
                          type: 'button',
                          onclick: () => {
                              eintrag.weiterGeladen = true;
                              laden(eintrag, true);
                          }
                      },
                      'Ältere anzeigen'
                  )
                : null
        ];
    };
    return h(
        'section',
        { class: 'abschnitt' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h(
                'div',
                { class: 'zeile-text' },
                h('h3', {}, titel),
                h('span', { class: 'leise' }, 'Wer wann was geändert hat. Einträge bleiben 180 Tage.')
            ),
            h(
                'div',
                { class: 'bp-segment', role: 'tablist', 'aria-label': 'Wer' },
                filterKnopf(eintrag, 'alle', 'Alle'),
                filterKnopf(eintrag, 'ki', 'KI-Helfer'),
                filterKnopf(eintrag, 'mensch', 'Menschen')
            )
        ),
        koerper()
    );
};

export const reiterVerlauf = site =>
    verlaufAnzeige('/api/audit/website/' + encodeURIComponent(site.uuid), { titel: 'Verlauf', mitWebsite: false });

export const seiteVerlauf = () => verlaufAnzeige('/api/audit/verlauf', { titel: 'Verlauf', mitWebsite: true });
