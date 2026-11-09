// Reiter «Einstellungen»: eine ruhige Übersicht, jeder Bereich hat seine eigene Adresse
//   #/website/<id>/einstellungen/<bereich>
import { h, ikon, leer } from './ui.js';
import { bereichErlaubt, einstellungenFuer } from './einstellungen-werte.js';
import {
    bereichDomain,
    bereichKlonen,
    bereichLoeschen,
    bereichSichtbarkeit,
    bereichSicherungen
} from './einst-betrieb.js';
import { bereichAuftraege, bereichSchluessel, bereichVektoren, bereichWebhooks } from './einst-technik.js';

const uebersicht = (w, site) => {
    const gruppen = einstellungenFuer(site.rights);
    if (!gruppen.length) {
        return h(
            'div',
            { class: 'bp-karte', id: 'einstellungen-keine-rechte' },
            leer(
                'werkstatt',
                'Nur für Verwalter',
                'Einstellungen sehen nur Menschen, die an dieser Website mitarbeiten.'
            )
        );
    }
    return h(
        'div',
        { class: 'stapel', id: 'einstellungen' },
        gruppen.map(([gruppe, zeilen]) =>
            h(
                'div',
                { class: 'bp-karte eng stapel' },
                h('h3', {}, gruppe),
                h(
                    'div',
                    { class: 'zeilen' },
                    zeilen.map(z =>
                        h(
                            'a',
                            {
                                class: z.gefahr ? 'zeile zeile-link gefahr' : 'zeile zeile-link',
                                href: '#/website/' + w.id + '/einstellungen/' + z.id
                            },
                            h(
                                'div',
                                { class: 'zeile-text' },
                                h('b', {}, z.titel),
                                h('span', { class: 'leise' }, z.text)
                            ),
                            h('span', { class: 'bp-ikonknopf', 'aria-hidden': 'true' }, ikon('pfeil'))
                        )
                    )
                )
            )
        )
    );
};

export const reiterEinstellungen = (w, site, bereich, fertig) => {
    if (!bereich || !bereichErlaubt(site.rights, bereich)) return uebersicht(w, site);
    const inhalt = {
        domain: () => bereichDomain(w, site),
        sichtbarkeit: () => bereichSichtbarkeit(w, site, fertig),
        schluessel: () => bereichSchluessel(w, site),
        sicherungen: () => bereichSicherungen(w, site),
        auftraege: () => bereichAuftraege(w, site),
        webhooks: () => bereichWebhooks(w, site),
        vektoren: () => bereichVektoren(w, site),
        klonen: () => bereichKlonen(w, site),
        loeschen: () => bereichLoeschen(w, site)
    }[bereich]();
    return h('div', { class: 'stapel', id: 'bereich-' + bereich }, inhalt);
};
