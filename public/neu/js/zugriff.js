// Dialog «Zugriff geben» im Reiter Personen.
//   Schritt 1: Wie? Link, E-Mail oder vindelis-ID
//   Schritt 2: Worauf und was darf die Person?
//   Danach: beim Link der Link zum Kopieren, sonst eine kurze Bestätigung
// Regeln wie im Backend: «Verwalten» nie per Link und nie nur auf einen Teil.
// Ein Link gilt für die ganze Website oder für genau einen Teil.
import { api } from '../../js/core/api.js';
import { h, ikon, dialog, kopierZeile } from './ui.js';
import { empfaengerAus } from './profil-werte.js';
import {
    GUELTIG,
    RECHTE,
    adressenAus,
    eingabeFehler,
    einladungKoerper,
    rechteFuer,
    wegeFuer,
    zielAus
} from './personen-werte.js';

const WEGE = {
    link: {
        titel: 'Link verschicken',
        text: 'Du bekommst einen Link, zum Beispiel für WhatsApp. Die Person braucht ein vindelis-Konto.',
        tipp: true
    },
    email: {
        titel: 'Besucher per E-Mail',
        text: 'Für Besucher deiner Website. Sie melden sich mit einem Code an und brauchen kein Konto.'
    },
    id: {
        titel: 'Mit vindelis-ID',
        text: 'Die Person hat dir ihre ID gegeben. Für Fachleute und Mitarbeitende.'
    }
};

const TIPP = { ansehen: 'Empfohlen' };

const zugriffSchritte = aktuell =>
    h(
        'ol',
        { class: 'bp-stepper' },
        ['Wie', 'Was'].map((text, i) =>
            h(
                'li',
                { class: i + 1 === aktuell ? 'aktiv' : i + 1 < aktuell ? 'fertig' : null },
                h('i', {}, String(i + 1)),
                text
            )
        )
    );

export const zugriffGebenOeffnen = ({ w, site, besucher, gast, nachher }) => {
    const wege = wegeFuer(gast);
    const stand = {
        schritt: 1,
        weg: wege[0],
        worauf: 'alles',
        teil: '',
        darf: 'ansehen',
        gueltig: '7 Tage',
        anzahl: 1,
        id: '',
        email: '',
        fehler: '',
        arbeitet: false,
        link: '',
        einladung: null,
        ziel: null,
        mailOffen: false,
        mailAn: '',
        erfolg: null
    };
    const teile = (site.parts || []).map(p => ({ uuid: p.uuid, name: p.name || 'Teil' }));

    const woraufText = () =>
        stand.worauf === 'alles' ? 'Ganze Website' : teile.find(t => t.uuid === stand.teil)?.name || 'Ein Teil';

    // Eine Auswahl-Karte mit Titel und Erklärung
    const karte = (name, wert, gewaehlt, inhalt, wennGewaehlt) =>
        h(
            'label',
            { class: 'wahl' },
            h('input', { type: 'radio', name, value: wert, checked: gewaehlt, onchange: wennGewaehlt }),
            inhalt
        );

    const kartenText = (titel, tipp, text) =>
        h(
            'span',
            { class: 'zeile-text' },
            h(
                'span',
                { class: 'wahl-kopf' },
                h('b', {}, titel),
                tipp ? h('span', { class: 'bp-badge bp-badge-s' }, tipp) : null
            ),
            text ? h('span', { class: 'leise' }, text) : null
        );

    // Beim Antippen verschwindet eine alte Fehlermeldung, ohne neu zu zeichnen
    const fehlerEntfernen = feld => {
        stand.fehler = '';
        feld.closest('.dlg-box').querySelector('.bp-h-gefahr')?.remove();
    };

    // Passt die gewählte Stufe nicht mehr zu Weg und Umfang, zurück auf «Ansehen»
    const darfPruefen = () => {
        if (!rechteFuer(stand.weg, stand.worauf).includes(stand.darf)) stand.darf = 'ansehen';
    };

    const schrittWie = ({ zu, neu }) => [
        h('h3', {}, 'Zugriff geben'),
        zugriffSchritte(1),
        h(
            'div',
            { class: 'wahl-liste' },
            wege.map(wert =>
                karte(
                    'zg-weg',
                    wert,
                    stand.weg === wert,
                    kartenText(WEGE[wert].titel, WEGE[wert].tipp ? 'Am einfachsten' : null, WEGE[wert].text),
                    () => {
                        stand.weg = wert;
                        stand.fehler = '';
                        darfPruefen();
                        neu();
                    }
                )
            )
        ),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    type: 'button',
                    id: 'zg-weiter',
                    onclick: () => {
                        stand.schritt = 2;
                        neu();
                    }
                },
                'Weiter'
            )
        )
    ];

    // Worauf gilt der Zugriff: ganze Website oder genau ein Teil
    const woraufWahl = neu =>
        h(
            'div',
            { class: 'feld-gruppe' },
            h('span', { class: 'feld-titel' }, 'Was soll die Person sehen?'),
            h(
                'div',
                { class: 'wahl-liste' },
                karte(
                    'zg-worauf',
                    'alles',
                    stand.worauf === 'alles',
                    kartenText('Ganze Website', 'Am einfachsten'),
                    () => {
                        stand.worauf = 'alles';
                        stand.fehler = '';
                        neu();
                    }
                ),
                teile.length
                    ? karte('zg-worauf', 'teil', stand.worauf === 'teil', kartenText('Nur einen Teil'), () => {
                          stand.worauf = 'teil';
                          darfPruefen();
                          neu();
                      })
                    : null,
                stand.worauf === 'teil'
                    ? h(
                          'div',
                          { class: 'wahl-unter' },
                          h(
                              'select',
                              {
                                  id: 'zg-teil',
                                  class: 'bp-in',
                                  'aria-label': 'Teil wählen',
                                  onchange: e => {
                                      stand.teil = e.target.value;
                                      fehlerEntfernen(e.target);
                                  }
                              },
                              h('option', { value: '', selected: !stand.teil }, 'Bitte wählen'),
                              teile.map(t => h('option', { value: t.uuid, selected: t.uuid === stand.teil }, t.name))
                          )
                      )
                    : null
            )
        );

    const rechteWahl = neu =>
        h(
            'div',
            { class: 'feld-gruppe' },
            h('span', { class: 'feld-titel' }, 'Was darf die Person?'),
            h(
                'div',
                { class: 'wahl-liste' },
                rechteFuer(stand.weg, stand.worauf).map(wert =>
                    karte(
                        'zg-darf',
                        wert,
                        stand.darf === wert,
                        kartenText(RECHTE[wert].titel, TIPP[wert], RECHTE[wert].text),
                        () => {
                            stand.darf = wert;
                            neu();
                        }
                    )
                )
            )
        );

    // Felder, die nur bei einem bestimmten Weg gebraucht werden
    const wegFelder = () => {
        if (stand.weg === 'link') {
            return h(
                'div',
                { class: 'zwei-felder' },
                h(
                    'div',
                    { class: 'bp-feld' },
                    h('label', { for: 'zg-gueltig' }, 'Gültig für'),
                    h(
                        'select',
                        { id: 'zg-gueltig', class: 'bp-in', onchange: e => (stand.gueltig = e.target.value) },
                        GUELTIG.map(v => h('option', { value: v, selected: v === stand.gueltig }, v))
                    )
                ),
                h(
                    'div',
                    { class: 'bp-feld' },
                    h('label', { for: 'zg-anzahl' }, 'Wie viele Personen?'),
                    h('input', {
                        id: 'zg-anzahl',
                        class: 'bp-in',
                        type: 'number',
                        min: 1,
                        max: 100,
                        value: stand.anzahl,
                        oninput: e => (stand.anzahl = e.target.value)
                    })
                )
            );
        }
        if (stand.weg === 'email') {
            return h(
                'div',
                { class: 'stapel' },
                h(
                    'div',
                    { class: 'bp-feld' },
                    h('label', { for: 'zg-email' }, 'E-Mail-Adresse'),
                    h('input', {
                        id: 'zg-email',
                        class: 'bp-in',
                        type: 'email',
                        value: stand.email,
                        autocomplete: 'off',
                        'data-fokus': true,
                        oninput: e => {
                            stand.email = e.target.value;
                            fehlerEntfernen(e.target);
                        }
                    }),
                    h(
                        'small',
                        {},
                        'Die Person kann sich auf deiner Website anmelden und nichts ändern. Es geht keine Mail raus.'
                    )
                ),
                besucher && !besucher.enabled
                    ? h(
                          'div',
                          { class: 'bp-hinweis bp-h-warn', id: 'zg-anmeldung-aus' },
                          'Die Anmeldung per E-Mail ist noch ausgeschaltet. Die Adresse kommt auf die Liste und wirkt, sobald du sie einschaltest.'
                      )
                    : null
            );
        }
        return h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: 'zg-id' }, '@name oder vindelis-ID der Person'),
            h('input', {
                id: 'zg-id',
                class: 'bp-in mono',
                value: stand.id,
                autocomplete: 'off',
                placeholder: 'z.B. @anna oder a1b2c3d4-5e6f-…',
                'data-fokus': true,
                oninput: e => {
                    stand.id = e.target.value;
                    fehlerEntfernen(e.target);
                }
            }),
            h('small', {}, 'Die Person findet beides in ihrem Konto unter «Profil» bzw. «Deine vindelis-ID».')
        );
    };

    // Wechselt auf die Schluss-Ansicht mit dem animierten Haken
    const erfolg = (neu, titel, text) => {
        stand.erfolg = { titel, text };
        stand.schritt = 4;
        neu();
    };

    const linkErstellen = async neu => {
        const ziel = zielAus(stand, site.uuid);
        const antwort = await api.post('/api/objects/' + ziel.uuid + '/invitations', einladungKoerper(stand), {
            sensitive: true
        });
        if (!antwort.ok) return antwort.error;
        stand.link = antwort.data.data.link;
        stand.einladung = antwort.data.data.uuid;
        stand.ziel = ziel.uuid;
        stand.schritt = 3;
        neu();
        return '';
    };

    const besucherEintragen = async neu => {
        const adresse = adressenAus(stand.email)[0];
        const antwort = await api.post('/api/objects/' + site.uuid + '/email-login/besucher', { emails: [adresse] });
        if (!antwort.ok) return antwort.error;
        const { invalid, already } = antwort.data.data;
        if (invalid) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
        erfolg(
            neu,
            already ? 'Steht schon auf der Liste' : 'Hat geklappt!',
            adresse +
                ' bekommt keine automatische Mail. Sag der Person die Adresse deiner Website, dort bekommt sie ihren Code.' +
                ' Kommt der Code nicht, soll die Person auch im Spam-Ordner nachsehen.'
        );
        return '';
    };

    const rechteGeben = async neu => {
        const ziel = zielAus(stand, site.uuid);
        // Plan "N": ein @name wird zuerst zur ID aufgelöst – die Rechte hängen immer an der ID
        const empfaenger = empfaengerAus(stand.id);
        let id = empfaenger.wert;
        if (empfaenger.art === 'name') {
            const person = await api.get('/api/profil/@' + encodeURIComponent(empfaenger.wert));
            if (person.status === 404) return 'Niemand heisst @' + empfaenger.wert + '.';
            if (!person.ok) return person.error;
            id = person.data.data.uuid;
        }
        for (const roleType of RECHTE[stand.darf].rollen) {
            const antwort = await api.put('/api/objects/' + ziel.uuid + '/members/' + id, {
                roleType,
                scope: ziel.scope
            });
            if (antwort.status === 404)
                return empfaenger.art === 'name'
                    ? 'Diese Person gibt es nicht mehr.'
                    : 'Diese vindelis-ID gibt es nicht.';
            if (!antwort.ok) return antwort.error;
        }
        erfolg(neu, 'Hat geklappt!', 'Die Person hat jetzt Zugriff auf «' + w.titel + '».');
        return '';
    };

    const speichern = async ({ neu }) => {
        if (stand.arbeitet) return;
        stand.fehler = eingabeFehler(stand);
        if (stand.fehler) return neu();
        stand.arbeitet = true;
        neu();
        const tun = { link: linkErstellen, email: besucherEintragen, id: rechteGeben }[stand.weg];
        stand.fehler = await tun(neu);
        stand.arbeitet = false;
        neu();
        if (!stand.fehler) await nachher();
    };

    const schrittWas = hilfe => {
        const { neu } = hilfe;
        return [
            h('h3', {}, 'Zugriff auf «' + w.titel + '»'),
            zugriffSchritte(2),
            stand.weg === 'email' ? null : woraufWahl(neu),
            stand.weg === 'email' ? null : rechteWahl(neu),
            wegFelder(),
            stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o',
                        type: 'button',
                        onclick: () => {
                            stand.schritt = 1;
                            stand.fehler = '';
                            neu();
                        }
                    },
                    'Zurück'
                ),
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-p',
                        type: 'button',
                        id: 'zg-speichern',
                        disabled: stand.arbeitet,
                        onclick: () => speichern(hilfe)
                    },
                    stand.arbeitet ? 'Einen Moment…' : stand.weg === 'link' ? 'Link erstellen' : 'Zugriff geben'
                )
            )
        ];
    };

    // Fertiger Text für WhatsApp. Abgeschickt wird dort, nicht hier
    const whatsappAdresse = () =>
        'https://wa.me/?text=' +
        encodeURIComponent('Ich lade dich zu «' + w.titel + '» auf vindelis ein: ' + stand.link);

    // «Gesendet» steht nur da, wenn vindelis die Mail wirklich verschickt hat
    const mailSenden = async neu => {
        if (stand.arbeitet) return;
        const adresse = stand.mailAn.trim();
        if (!adresse.includes('@')) {
            stand.fehler = 'Bitte gib eine gültige E-Mail-Adresse ein.';
            return neu();
        }
        stand.arbeitet = true;
        const antwort = await api.post(
            '/api/objects/' + stand.ziel + '/invitations/' + stand.einladung + '/mail',
            { link: stand.link, email: adresse },
            { sensitive: true }
        );
        stand.arbeitet = false;
        if (!antwort.ok) {
            stand.fehler = antwort.error;
            return neu();
        }
        erfolg(
            neu,
            'Gesendet!',
            'Die Einladung ist unterwegs an ' +
                adresse +
                '. Kommt sie nicht an, soll die Person auch im Spam-Ordner nachsehen.'
        );
    };

    // Feld für die Adresse, erscheint nach dem Klick auf «E-Mail»
    const mailFeld = ({ neu }) =>
        h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: 'zg-mail-an' }, 'E-Mail-Adresse'),
            h(
                'div',
                { class: 'zeile-knopf mail-zeile' },
                h('input', {
                    id: 'zg-mail-an',
                    class: 'bp-in' + (stand.fehler ? ' bp-in-fehler' : ''),
                    type: 'email',
                    value: stand.mailAn,
                    autocomplete: 'off',
                    'data-fokus': true,
                    oninput: e => {
                        stand.mailAn = e.target.value;
                        fehlerEntfernen(e.target);
                        e.target.classList.remove('bp-in-fehler');
                    }
                }),
                h(
                    'button',
                    { class: 'bp-btn bp-btn-p', type: 'button', id: 'zg-mail-senden', onclick: () => mailSenden(neu) },
                    'Senden'
                )
            )
        );

    const schrittLink = hilfe => [
        h('h3', {}, 'Dein Link ist bereit'),
        kopierZeile(stand.link),
        h('div', { class: 'bp-hinweis bp-h-warn' }, 'Kopiere ihn jetzt, er wird nur dieses eine Mal angezeigt.'),
        h('span', { class: 'feld-titel' }, 'Direkt verschicken'),
        h(
            'div',
            { class: 'zwei-felder' },
            h(
                'a',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'zg-whatsapp',
                    href: whatsappAdresse(),
                    target: '_blank',
                    rel: 'noopener',
                    // WhatsApp öffnet sich, abgeschickt wird dort. Darum nicht «Gesendet».
                    onclick: () =>
                        erfolg(hilfe.neu, 'Bereit in WhatsApp!', 'Wähle dort die Person aus und drücke auf Senden.')
                },
                ikon('nachricht'),
                'WhatsApp'
            ),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o',
                    type: 'button',
                    id: 'zg-mail',
                    'aria-expanded': stand.mailOffen ? 'true' : 'false',
                    onclick: () => {
                        stand.mailOffen = !stand.mailOffen;
                        stand.fehler = '';
                        hilfe.neu();
                    }
                },
                ikon('brief'),
                'E-Mail'
            )
        ),
        stand.mailOffen ? mailFeld(hilfe) : null,
        stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null,
        h('span', { class: 'feld-titel' }, 'So sieht es die Person'),
        h(
            'div',
            { class: 'einladung-vorschau', id: 'zg-vorschau' },
            h('b', {}, 'Einladung zu «' + w.titel + '»'),
            h('span', { class: 'leise' }, RECHTE[stand.darf].titel + ': ' + woraufText()),
            h('span', { class: 'bp-btn bp-btn-p bp-btn-klein' }, 'Annehmen')
        ),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h('button', { class: 'bp-btn bp-btn-p', type: 'button', id: 'zg-fertig', onclick: hilfe.zu }, 'Fertig')
        )
    ];

    // Schluss-Ansicht: animierter Haken und eine kurze Bestätigung
    const schrittErfolg = ({ zu }) => [
        h(
            'div',
            { class: 'erfolg', id: 'zg-erfolg' },
            h('span', { class: 'erfolg-kreis', 'aria-hidden': 'true' }, ikon('haken')),
            h('h3', {}, stand.erfolg.titel),
            h('p', { class: 'leise' }, stand.erfolg.text)
        ),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h('button', { class: 'bp-btn bp-btn-p', type: 'button', id: 'zg-fertig', onclick: zu }, 'Fertig')
        )
    ];

    dialog(hilfe => {
        if (stand.schritt === 1) return schrittWie(hilfe);
        if (stand.schritt === 2) return schrittWas(hilfe);
        if (stand.schritt === 3) return schrittLink(hilfe);
        return schrittErfolg(hilfe);
    });
};
