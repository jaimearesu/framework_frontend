// Dialog «Neue Website» nach Jaimes Ablauf (09.11.):
//   Schritt 1: Name und Beschreibung
//   Schritt 2: bestehenden KI-Helfer zuweisen oder neuen erstellen
//   Danach, nur bei einem neuen Helfer: Anleitung zum Verbinden. Dann fertig.
// Eine KI bekommt alle drei Rechte, aber nur auf dieser Website (Entscheid 3 in Plan U).
import { api } from '../../js/core/api.js';
import { invalidateObjects } from '../../js/core/objects.js';
import { h, dialog, meldung, zuAdresse, kopierZeile } from './ui.js';
import { DATEN } from './daten.js';
import { datenLaden, helferLaden } from './websites.js';
import { sitzungLaden } from './sitzung.js';
import { helferKurztext, helferNameAus, websiteAnlegen } from './helfer-werte.js';

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

// Nur angemeldete Menschen können einen KI-Helfer zuweisen. Gäste legen die Website direkt an
const mitHelfer = () => DATEN.mensch.art === 'user';

export const neueWebsiteOeffnen = async () => {
    // Vorher frisch holen: Inzwischen kann ein Helfer dazugekommen sein
    await helferLaden();
    const stand = {
        schritt: 1,
        name: '',
        beschreibung: '',
        wahl: DATEN.helfer[0]?.id || 'neu',
        neuerName: '',
        helferName: '',
        fehler: '',
        arbeitet: false,
        fortschritt: {}
    };

    // Führt das Anlegen aus und entscheidet, was danach zu sehen ist
    const anlegen = async ({ zu, neu }) => {
        if (stand.arbeitet) return;
        const adresse = zuAdresse(stand.name);
        let helfer = null;
        if (mitHelfer() && stand.wahl === 'neu') {
            const name = helferNameAus(stand.neuerName, zuAdresse);
            if (name.fehler) {
                stand.fehler = name.fehler;
                neu();
                return;
            }
            stand.helferName = name.name;
            helfer = { neu: name.name };
        } else if (mitHelfer()) {
            helfer = { uuid: stand.wahl };
            stand.helferName = DATEN.helfer.find(x => x.id === stand.wahl)?.name || '';
        }
        stand.arbeitet = true;
        stand.fehler = '';
        neu();
        const ergebnis = await websiteAnlegen({
            api,
            adresse,
            beschreibung: stand.beschreibung.trim(),
            helfer,
            fortschritt: stand.fortschritt
        });
        stand.arbeitet = false;
        invalidateObjects();
        // Wer ohne Konto angefangen hat, ist jetzt Gast. Erst dann liefern die Listen etwas
        if (DATEN.mensch.art === 'anon' && stand.fortschritt.website) await sitzungLaden();
        // Auch nach einem Teil-Erfolg, damit die neue Website in der Liste steht
        await Promise.all([datenLaden(), helferLaden()]);
        if (!ergebnis.ok) {
            stand.fehler =
                ergebnis.schritt === 'website'
                    ? ergebnis.error
                    : 'Die Website ist angelegt, der KI-Helfer aber noch nicht zugewiesen: ' + ergebnis.error;
            if (ergebnis.schritt === 'website') stand.schritt = 1;
            neu();
            return;
        }
        stand.id = ergebnis.uuid;
        DATEN.startAnsicht.seite = 1;
        if (helfer?.neu) {
            // Neuer Helfer: zuerst die Anleitung zum Verbinden
            stand.schritt = 3;
            neu();
            return;
        }
        zu();
        meldung('Website angelegt', ergebnis.warnung || (helfer ? 'Dein KI-Helfer kann jetzt loslegen.' : adresse));
        location.hash = '#/website/' + stand.id;
    };

    const schrittEins = ({ zu, neu }) => {
        const adresse = h('small', {}, adressText(stand.name));
        return [
            h('h3', {}, 'Neue Website'),
            mitHelfer() ? schrittAnzeige(1) : null,
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
                            else if (!stand.fortschritt.website && DATEN.websites.some(w => w.titel === id))
                                stand.fehler = 'Diese Adresse ist schon vergeben.';
                            else {
                                stand.fehler = '';
                                if (mitHelfer()) stand.schritt = 2;
                                else {
                                    anlegen({ zu, neu });
                                    return;
                                }
                            }
                            neu();
                        }
                    },
                    mitHelfer() ? 'Weiter' : stand.arbeitet ? 'Wird angelegt…' : 'Website anlegen'
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
                            h('span', { class: 'leise' }, helferKurztext(x))
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
                      }),
                      h('small', {}, 'Du erkennst ihn beim Verbinden unter «agent-…» wieder.')
                  )
                : null,
            stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null,
            h(
                'p',
                { class: 'leise' },
                'Der Helfer bekommt seine Rechte nur für diese Website. Veröffentlichen kannst nur du.'
            ),
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h(
                    'button',
                    {
                        class: 'bp-btn ' + (stand.fortschritt.website ? 'bp-btn-off' : 'bp-btn-o'),
                        type: 'button',
                        // Ist die Website schon angelegt, lässt sich ihr Name hier nicht mehr ändern
                        disabled: Boolean(stand.fortschritt.website),
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
                        disabled: stand.arbeitet,
                        onclick: () => anlegen({ zu, neu })
                    },
                    stand.arbeitet ? 'Wird angelegt…' : 'Website anlegen'
                )
            )
        ];
    };

    const schrittAnleitung = ({ zu }) => [
        h('h3', {}, stand.helferName + ' verbinden'),
        h('p', { class: 'leise' }, 'Die Website ist angelegt. Noch drei Schritte, dann kann der Helfer loslegen.'),
        anleitungListe(stand.helferName),
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

// Die drei Schritte zum Verbinden, auch auf der Seite KI-Helfer gebraucht.
// name: Dieser Helfer soll es sein. Ohne Namen legt man ihn beim «Erlauben» an
export const anleitungListe = name =>
    DATEN.mcpAdresse
        ? h(
              'ol',
              { class: 'anleitung' },
              h(
                  'li',
                  {},
                  h(
                      'span',
                      {},
                      'Öffne in Claude oder ChatGPT die Einstellungen und füge einen eigenen Connector hinzu.'
                  )
              ),
              h('li', {}, h('span', {}, 'Füge diese Adresse ein:'), kopierZeile(DATEN.mcpAdresse)),
              h(
                  'li',
                  {},
                  h(
                      'span',
                      {},
                      name
                          ? 'Melde dich bei vindelis an, wähle «' + name + '» und klicke auf «Erlauben».'
                          : 'Melde dich bei vindelis an, wähle einen Namen für den Helfer und klicke auf «Erlauben».'
                  )
              )
          )
        : h(
              'div',
              { class: 'bp-hinweis bp-h-warn', id: 'verbinden-aus' },
              'Das Verbinden von KI-Helfern ist auf diesem Server noch nicht eingeschaltet.'
          );
