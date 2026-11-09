// Dialog «Zugriff geben» im Reiter Personen (Entwurf, Beispieldaten).
//   Schritt 1: Wie? Link, E-Mail oder vindelis-ID
//   Schritt 2: Worauf und was darf die Person?
//   Danach: beim Link der Link zum Kopieren, sonst eine kurze Meldung
// Regeln wie im Backend: «Verwalten» nie per Link und nie nur auf einen Teil.
import { h, ikon, dialog, kopierZeile, huelle } from './ui.js';
import { DATEN } from './daten.js';

const WEGE = [
    {
        wert: 'link',
        titel: 'Link verschicken',
        text: 'Du bekommst einen Link, zum Beispiel für WhatsApp. Die Person braucht ein vindelis-Konto.',
        tipp: true
    },
    {
        wert: 'email',
        titel: 'Per E-Mail',
        text: 'Für Besucher deiner Website. Sie melden sich mit einem Code an und brauchen kein Konto.'
    },
    {
        wert: 'id',
        titel: 'Mit vindelis-ID',
        text: 'Die Person hat dir ihre ID gegeben. Für Fachleute und Mitarbeitende.'
    }
];

const RECHTE = {
    ansehen: { titel: 'Ansehen', text: 'Sieht die gewählten Teile, kann nichts ändern.', tipp: 'Empfohlen' },
    aendern: { titel: 'Ansehen und ändern', text: 'Kann Inhalte und Code der gewählten Teile ändern.' },
    verwalten: { titel: 'Verwalten', text: 'Kann alles, auch anderen Zugriff geben und löschen.' }
};

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

// Worauf gilt der Zugriff, als Text
const woraufText = stand => (stand.worauf === 'alles' ? 'Ganze Website' : stand.teile.join(', '));

export const zugriffGebenOeffnen = website => {
    const stand = {
        schritt: 1,
        weg: 'link',
        worauf: 'alles',
        teile: [],
        darf: 'ansehen',
        gueltig: '7 Tage',
        anzahl: 1,
        id: '',
        email: '',
        fehler: '',
        mailOffen: false,
        mailAn: '',
        erfolg: null
    };

    // Eine Auswahl-Karte mit Titel und Erklärung
    const karte = (name, wert, gewaehlt, inhalt, wennGewaehlt) =>
        h(
            'label',
            { class: 'wahl' },
            h('input', { type: 'radio', name, value: wert, checked: gewaehlt, onchange: wennGewaehlt }),
            inhalt
        );

    const schrittWie = ({ zu, neu }) => [
        h('h3', {}, 'Zugriff geben'),
        zugriffSchritte(1),
        h(
            'div',
            { class: 'wahl-liste' },
            WEGE.map(w =>
                karte(
                    'zg-weg',
                    w.wert,
                    stand.weg === w.wert,
                    h(
                        'span',
                        { class: 'zeile-text' },
                        h(
                            'span',
                            { class: 'wahl-kopf' },
                            h('b', {}, w.titel),
                            w.tipp ? h('span', { class: 'bp-badge bp-badge-s' }, 'Am einfachsten') : null
                        ),
                        h('span', { class: 'leise' }, w.text)
                    ),
                    () => {
                        stand.weg = w.wert;
                        stand.fehler = '';
                        // «Verwalten» gibt es nur mit der ID
                        if (w.wert !== 'id' && stand.darf === 'verwalten') stand.darf = 'ansehen';
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

    // Worauf gilt der Zugriff: ganze Website oder einzelne Teile
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
                    h(
                        'span',
                        { class: 'zeile-text' },
                        h(
                            'span',
                            { class: 'wahl-kopf' },
                            h('b', {}, 'Ganze Website'),
                            h('span', { class: 'bp-badge bp-badge-s' }, 'Am einfachsten')
                        )
                    ),
                    () => {
                        stand.worauf = 'alles';
                        stand.fehler = '';
                        neu();
                    }
                ),
                karte(
                    'zg-worauf',
                    'teile',
                    stand.worauf === 'teile',
                    h('span', { class: 'zeile-text' }, h('b', {}, 'Nur bestimmte Teile')),
                    () => {
                        stand.worauf = 'teile';
                        if (stand.darf === 'verwalten') stand.darf = 'ansehen';
                        neu();
                    }
                ),
                stand.worauf === 'teile'
                    ? h(
                          'div',
                          { class: 'wahl-unter' },
                          DATEN.teile.map(teil =>
                              h(
                                  'label',
                                  {},
                                  h('input', {
                                      type: 'checkbox',
                                      value: teil,
                                      checked: stand.teile.includes(teil),
                                      onchange: e => {
                                          stand.teile = e.target.checked
                                              ? [...stand.teile, teil]
                                              : stand.teile.filter(x => x !== teil);
                                          fehlerEntfernen(e.target);
                                      }
                                  }),
                                  teil
                              )
                          )
                      )
                    : null
            )
        );

    // Beim Antippen verschwindet eine alte Fehlermeldung, ohne neu zu zeichnen
    const fehlerEntfernen = feld => {
        stand.fehler = '';
        feld.closest('.dlg-box').querySelector('.bp-h-gefahr')?.remove();
    };

    // Was darf die Person: je nach Weg und Umfang stehen nicht alle Rechte zur Wahl
    const rechteWahl = neu => {
        const moeglich =
            stand.weg === 'id' && stand.worauf === 'alles'
                ? ['ansehen', 'aendern', 'verwalten']
                : ['ansehen', 'aendern'];
        return h(
            'div',
            { class: 'feld-gruppe' },
            h('span', { class: 'feld-titel' }, 'Was darf die Person?'),
            h(
                'div',
                { class: 'wahl-liste' },
                moeglich.map(wert =>
                    karte(
                        'zg-darf',
                        wert,
                        stand.darf === wert,
                        h(
                            'span',
                            { class: 'zeile-text' },
                            h(
                                'span',
                                { class: 'wahl-kopf' },
                                h('b', {}, RECHTE[wert].titel),
                                RECHTE[wert].tipp
                                    ? h('span', { class: 'bp-badge bp-badge-s' }, RECHTE[wert].tipp)
                                    : null
                            ),
                            h('span', { class: 'leise' }, RECHTE[wert].text)
                        ),
                        () => {
                            stand.darf = wert;
                            neu();
                        }
                    )
                )
            )
        );
    };

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
                        ['1 Tag', '7 Tage', '30 Tage'].map(v =>
                            h('option', { value: v, selected: v === stand.gueltig }, v)
                        )
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
                h('small', {}, 'Die Person sieht den geschützten Bereich deiner Website und kann nichts ändern.')
            );
        }
        return h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: 'zg-id' }, 'vindelis-ID der Person'),
            h('input', {
                id: 'zg-id',
                class: 'bp-in mono',
                value: stand.id,
                autocomplete: 'off',
                placeholder: 'z.B. a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
                'data-fokus': true,
                oninput: e => {
                    stand.id = e.target.value;
                    fehlerEntfernen(e.target);
                }
            }),
            h('small', {}, 'Die Person findet ihre ID in ihrem Konto.')
        );
    };

    // Prüft die Eingaben, gibt einen Fehlertext oder nichts zurück
    const fehlerText = () => {
        if (stand.weg === 'email') return stand.email.includes('@') ? '' : 'Bitte gib eine gültige E-Mail-Adresse ein.';
        if (stand.worauf === 'teile' && !stand.teile.length) return 'Bitte wähle mindestens einen Teil.';
        if (stand.weg === 'id' && !/^[0-9a-f-]{36}$/i.test(stand.id.trim()))
            return 'Das sieht nicht wie eine vindelis-ID aus.';
        const anzahl = Number(stand.anzahl);
        if (stand.weg === 'link' && !(Number.isInteger(anzahl) && anzahl >= 1 && anzahl <= 100))
            return 'Die Anzahl Personen muss zwischen 1 und 100 liegen.';
        return '';
    };

    const speichern = ({ neu }) => {
        stand.fehler = fehlerText();
        if (stand.fehler) return neu();
        if (stand.weg === 'link') {
            DATEN.einladungen.unshift({
                id: 'e' + Date.now(),
                worauf: woraufText(stand),
                darf: RECHTE[stand.darf].titel,
                gueltig: 'noch ' + stand.gueltig,
                benutzt: '0 von ' + stand.anzahl
            });
            stand.schritt = 3;
            huelle.neu();
            return neu();
        }
        if (stand.weg === 'email') {
            DATEN.personen.push({
                name: stand.email.trim(),
                art: 'Besucher mit E-Mail-Login',
                darf: 'Geschützten Bereich sehen',
                seit: 'Heute'
            });
            erfolg(neu, 'Hat geklappt!', stand.email.trim() + ' kann sich jetzt mit einem Code anmelden.');
        } else {
            DATEN.personen.push({
                name: stand.id.trim().slice(0, 8) + '…',
                art: 'Mensch',
                darf: RECHTE[stand.darf].titel + ': ' + woraufText(stand),
                seit: 'Heute'
            });
            erfolg(neu, 'Hat geklappt!', 'Die Person hat jetzt Zugriff auf «' + website.titel + '».');
        }
        huelle.neu();
    };

    // Wechselt auf die Schluss-Ansicht mit dem animierten Haken
    const erfolg = (neu, titel, text) => {
        stand.erfolg = { titel, text };
        stand.schritt = 4;
        neu();
    };

    const schrittWas = hilfe => {
        const { neu } = hilfe;
        return [
            h('h3', {}, 'Zugriff auf «' + website.titel + '»'),
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
                    { class: 'bp-btn bp-btn-p', type: 'button', id: 'zg-speichern', onclick: () => speichern(hilfe) },
                    stand.weg === 'link' ? 'Link erstellen' : 'Zugriff geben'
                )
            )
        ];
    };

    // Beispiel-Link der Anprobe. Beim Einbau kommt er vom Backend.
    const LINK = 'https://vindelis.com/einladung/beispiel-link';

    // Fertiger Text für WhatsApp
    const whatsappAdresse = () =>
        'https://wa.me/?text=' +
        encodeURIComponent(DATEN.mensch.name + ' lädt dich zu «' + website.titel + '» auf vindelis ein: ' + LINK);

    // Feld für die Adresse, erscheint nach dem Klick auf «Per E-Mail»
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
                    {
                        class: 'bp-btn bp-btn-p',
                        type: 'button',
                        id: 'zg-mail-senden',
                        onclick: () => {
                            if (!stand.mailAn.includes('@')) {
                                stand.fehler = 'Bitte gib eine gültige E-Mail-Adresse ein.';
                                return neu();
                            }
                            erfolg(neu, 'Gesendet!', 'Die Einladung ist unterwegs an ' + stand.mailAn.trim() + '.');
                        }
                    },
                    'Senden'
                )
            )
        );

    const schrittLink = hilfe => [
        h('h3', {}, 'Dein Link ist bereit'),
        kopierZeile(LINK),
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
            h('b', {}, DATEN.mensch.name + ' lädt dich zu «' + website.titel + '» ein'),
            h('span', { class: 'leise' }, RECHTE[stand.darf].titel + ': ' + woraufText(stand)),
            h('span', { class: 'bp-btn bp-btn-p bp-btn-klein' }, 'Einladung annehmen')
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
