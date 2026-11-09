// Dialog «Neue Website» nach Jaimes Ablauf (09.11.):
//   Schritt 1: Name und Beschreibung
//   Schritt 2: bestehenden KI-Helfer zuweisen oder neuen erstellen
//   Danach, nur bei einem neuen Helfer: Anleitung zum Verbinden. Dann fertig.
import { h, dialog, meldung, zuAdresse, kopierZeile } from './ui.js';
import { DATEN } from './daten.js';

// Kopfzeile mit den zwei Schritten
const schrittAnzeige = aktuell =>
    h(
        'ol',
        { class: 'bp-stepper' },
        ['Website', 'KI-Helfer'].map((text, i) =>
            h(
                'li',
                { class: i + 1 === aktuell ? 'aktiv' : i + 1 < aktuell ? 'fertig' : null },
                h('i', {}, String(i + 1)),
                text
            )
        )
    );

// Beim Tippen verschwindet eine alte Fehlermeldung, ohne den Dialog neu zu zeichnen
const fehlerWeg = (stand, feld) => {
    stand.fehler = '';
    feld.classList.remove('bp-in-fehler');
    feld.closest('.dlg-box').querySelector('.bp-h-gefahr')?.remove();
};

// Legt die Website in den Beispieldaten an und geht zu ihr
const websiteAnlegen = stand => {
    const id = zuAdresse(stand.name);
    const helferName = stand.wahl === 'neu' ? stand.neuerName.trim() : DATEN.helfer.find(x => x.id === stand.wahl).name;
    DATEN.websites.unshift({
        id,
        titel: stand.name.trim(),
        beschreibung: stand.beschreibung.trim(),
        zustand: 'entwurf',
        geaendert: 'gerade eben',
        geaendertVor: 0,
        erstelltVor: 0,
        von: 'Du',
        besuche: '0',
        speicher: '0 MB',
        probleme: 0
    });
    // Zurück auf die erste Seite, dort steht die neue Website
    DATEN.startAnsicht.seite = 1;
    if (stand.wahl === 'neu') {
        DATEN.helfer.push({
            id: zuAdresse(helferName),
            name: helferName,
            verbunden: null,
            aktiv: 'noch nie',
            zustand: 'neu',
            websites: [stand.name.trim()]
        });
    } else {
        DATEN.helfer.find(x => x.id === stand.wahl).websites.push(stand.name.trim());
    }
    return id;
};

export const neueWebsiteOeffnen = () => {
    const stand = {
        schritt: 1,
        name: '',
        beschreibung: '',
        wahl: DATEN.helfer[0]?.id || 'neu',
        neuerName: '',
        fehler: ''
    };

    const schrittEins = ({ zu, neu }) => {
        const adresse = h('small', {}, adressText(stand.name));
        return [
            h('h3', {}, 'Neue Website'),
            schrittAnzeige(1),
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'nw-name' }, 'Name'),
                h('input', {
                    id: 'nw-name',
                    class: 'bp-in' + (stand.fehler ? ' bp-in-fehler' : ''),
                    value: stand.name,
                    maxlength: 60,
                    'data-fokus': true,
                    autocomplete: 'off',
                    oninput: e => {
                        stand.name = e.target.value;
                        adresse.textContent = adressText(stand.name);
                        fehlerWeg(stand, e.target);
                    }
                }),
                adresse
            ),
            stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null,
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'nw-text' }, 'Was soll die Website können?'),
                h('textarea', {
                    id: 'nw-text',
                    class: 'bp-in',
                    maxlength: 2000,
                    value: stand.beschreibung,
                    oninput: e => (stand.beschreibung = e.target.value)
                }),
                h('small', {}, 'Dein KI-Helfer liest das als Auftrag.')
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
                        id: 'nw-weiter',
                        onclick: () => {
                            const id = zuAdresse(stand.name);
                            if (!id) stand.fehler = 'Bitte gib der Website einen Namen.';
                            else if (DATEN.websites.some(w => w.id === id))
                                stand.fehler = 'Diese Adresse ist schon vergeben.';
                            else {
                                stand.fehler = '';
                                stand.schritt = 2;
                            }
                            neu();
                        }
                    },
                    'Weiter'
                )
            )
        ];
    };

    const schrittZwei = ({ zu, neu }) => {
        const auswahl = (wert, inhalt) =>
            h(
                'label',
                { class: 'wahl' },
                h('input', {
                    type: 'radio',
                    name: 'nw-helfer',
                    value: wert,
                    checked: stand.wahl === wert,
                    onchange: () => {
                        stand.wahl = wert;
                        stand.fehler = '';
                        neu();
                    }
                }),
                inhalt
            );
        return [
            h('h3', {}, 'Wer baut «' + stand.name.trim() + '»?'),
            schrittAnzeige(2),
            h(
                'div',
                { class: 'wahl-liste' },
                DATEN.helfer.map(x =>
                    auswahl(
                        x.id,
                        h(
                            'span',
                            { class: 'zeile-text' },
                            h('b', {}, x.name),
                            h(
                                'span',
                                { class: 'leise' },
                                x.verbunden
                                    ? 'Verbunden mit ' + x.verbunden + ', zuletzt ' + x.aktiv
                                    : 'Nicht verbunden'
                            )
                        )
                    )
                ),
                auswahl('neu', h('span', { class: 'zeile-text' }, h('b', {}, 'Neuen KI-Helfer erstellen')))
            ),
            stand.wahl === 'neu'
                ? h(
                      'div',
                      { class: 'bp-feld' },
                      h('label', { for: 'nw-helfer-name' }, 'Name des neuen Helfers'),
                      h('input', {
                          id: 'nw-helfer-name',
                          class: 'bp-in' + (stand.fehler ? ' bp-in-fehler' : ''),
                          value: stand.neuerName,
                          maxlength: 60,
                          'data-fokus': true,
                          autocomplete: 'off',
                          oninput: e => {
                              stand.neuerName = e.target.value;
                              fehlerWeg(stand, e.target);
                          }
                      })
                  )
                : null,
            stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null,
            h('p', { class: 'leise' }, 'Der Helfer darf nur an dieser Website arbeiten. Veröffentlichen kann nur du.'),
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
                        id: 'nw-anlegen',
                        onclick: () => {
                            if (stand.wahl === 'neu' && !stand.neuerName.trim()) {
                                stand.fehler = 'Bitte gib dem neuen Helfer einen Namen.';
                                neu();
                                return;
                            }
                            stand.id = websiteAnlegen(stand);
                            if (stand.wahl === 'neu') {
                                // Neuer Helfer: zuerst die Anleitung zum Verbinden
                                stand.schritt = 3;
                                neu();
                            } else {
                                zu();
                                meldung('Website angelegt', 'Dein KI-Helfer kann jetzt loslegen.');
                                location.hash = '#/website/' + stand.id;
                            }
                        }
                    },
                    'Website anlegen'
                )
            )
        ];
    };

    const schrittAnleitung = ({ zu }) => [
        h('h3', {}, stand.neuerName.trim() + ' verbinden'),
        h('p', { class: 'leise' }, 'Die Website ist angelegt. Noch drei Schritte, dann kann der Helfer loslegen.'),
        anleitungListe(),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    type: 'button',
                    id: 'nw-fertig',
                    onclick: () => {
                        zu();
                        location.hash = '#/website/' + stand.id;
                    }
                },
                'Fertig'
            )
        )
    ];

    dialog(hilfe => {
        if (stand.schritt === 1) return schrittEins(hilfe);
        if (stand.schritt === 2) return schrittZwei(hilfe);
        return schrittAnleitung(hilfe);
    });
};

const adressText = name => {
    const id = zuAdresse(name);
    return id ? 'Adresse: ' + id + '.vindelis.site' : 'Daraus entsteht die Adresse der Website.';
};

// Die drei Schritte zum Verbinden, auch auf der Seite KI-Helfer gebraucht
export const anleitungListe = () =>
    h(
        'ol',
        { class: 'anleitung' },
        h(
            'li',
            {},
            h('span', {}, 'Öffne in Claude oder ChatGPT die Einstellungen und füge einen eigenen Connector hinzu.')
        ),
        h('li', {}, h('span', {}, 'Füge diese Adresse ein:'), kopierZeile(DATEN.mcpAdresse)),
        h('li', {}, h('span', {}, 'Melde dich bei vindelis an und klicke auf «Erlauben».'))
    );
