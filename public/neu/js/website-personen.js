// Reiter «Personen»: wer Zugriff hat, offene Einladungen und Besucher mit E-Mail-Anmeldung.
// Alle Rechte prüft das Backend. Adressen sind Text von Fremden: nur über h(), nie als HTML.
import { api } from '../../js/core/api.js';
import { timeAgo, formatNumber } from '../../js/core/format.js';
import { h, ikon, leer, dialog, meldung, huelle } from './ui.js';
import { DATEN } from './daten.js';
import { zugriffGebenOeffnen } from './zugriff.js';
import {
    RECHTE,
    adressenAus,
    anmeldungGrund,
    besucherZustand,
    darfText,
    einladenText,
    einladungenAus,
    personenAus,
    rollenAenderung,
    teilPersonenAus,
    teileZumFragen
} from './personen-werte.js';

// Der geladene Stand. Gehört zu genau einer Website
const FRISCH_MS = 30000;
const ablage = { id: null, zeit: 0, lauf: 0, inhalt: null, fehler: null, adressen: '' };

const objektPfad = uuid => '/api/objects/' + encodeURIComponent(uuid);

// Holt für einen Teil nur das, was es dort wirklich gibt
const teilLaden = async (teil, ich) => {
    const [mitglieder, einladungen] = await Promise.all([
        teil.hasLock ? api.get(objektPfad(teil.uuid) + '/members') : null,
        teil.openInvitations > 0 ? api.get(objektPfad(teil.uuid) + '/invitations') : null
    ]);
    return {
        personen: mitglieder?.ok ? teilPersonenAus(mitglieder.data?.data?.locks, teil, ich) : [],
        einladungen: einladungen?.ok ? einladungenAus(einladungen.data?.data, teil.uuid, teil) : []
    };
};

const laden = async site => {
    const lauf = ++ablage.lauf;
    const ich = DATEN.mensch.id;
    const gast = DATEN.mensch.art !== 'user';
    const pfad = objektPfad(site.uuid);
    // Frisch fragen: Gerade eben kann ein Teil sein erstes Schloss oder eine Einladung bekommen haben
    const frisch = await api.get('/api/websites/' + encodeURIComponent(site.uuid));
    const stand = frisch.ok && frisch.data?.data ? frisch.data.data : site;
    const [mitglieder, einladungen, besucher, teile] = await Promise.all([
        api.get(pfad + '/members'),
        api.get(pfad + '/invitations'),
        gast ? null : api.get(pfad + '/email-login'),
        Promise.all(teileZumFragen(stand).map(t => teilLaden(t, ich)))
    ]);
    if (lauf !== ablage.lauf) return;
    const vorher = JSON.stringify([ablage.inhalt, ablage.fehler]);
    ablage.zeit = Date.now();
    ablage.fehler = mitglieder.ok ? null : mitglieder.status === 403 ? 'rechte' : 'netz';
    ablage.inhalt = mitglieder.ok
        ? {
              personen: [...personenAus(mitglieder.data?.data?.members, ich), ...teile.flatMap(t => t.personen)],
              einladungen: [
                  ...(einladungen.ok ? einladungenAus(einladungen.data?.data, site.uuid) : []),
                  ...teile.flatMap(t => t.einladungen)
              ],
              besucher: besucher?.ok ? besucher.data?.data : null
          }
        : null;
    // Nur neu zeichnen, wenn sich etwas geändert hat. Sonst springt beim Tippen nichts weg
    if (vorher !== JSON.stringify([ablage.inhalt, ablage.fehler])) huelle.neu();
};

// Nach einer Änderung sofort den neuen Stand zeigen
const nachher = site => () => {
    ablage.zeit = 0;
    return laden(site);
};

// Rückfrage mit eigener Fehleranzeige. tun() gibt nichts oder einen Fehlertext zurück
const fragen = ({ titel, text, knopf, gefahr = true, tun }) =>
    dialog(({ zu }) => {
        const fehler = h('div', {});
        const ja = h(
            'button',
            {
                class: 'bp-btn ' + (gefahr ? 'bp-btn-gefahr' : 'bp-btn-p'),
                id: 'frage-ja',
                type: 'button',
                onclick: async () => {
                    ja.disabled = true;
                    const problem = await tun();
                    if (problem) {
                        ja.disabled = false;
                        fehler.replaceChildren(h('div', { class: 'bp-hinweis bp-h-gefahr' }, problem));
                        return;
                    }
                    zu();
                }
            },
            knopf
        );
        return [
            h('h3', {}, titel),
            h('p', {}, text),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                ja
            )
        ];
    });

// Rollen einer Person ändern. Geben zuerst, damit nie eine Lücke entsteht
const rollenSetzen = async (site, person, { geben, nehmen }) => {
    const ziel = person.teil ? person.teil.uuid : site.uuid;
    const scope = person.teil ? 'teil' : 'familie';
    for (const roleType of geben) {
        const antwort = await api.put(objektPfad(ziel) + '/members/' + person.id, { roleType, scope });
        if (!antwort.ok) return antwort.error;
    }
    for (const roleType of nehmen) {
        const antwort = await api.del(objektPfad(ziel) + '/members/' + person.id + '/' + roleType, {
            query: { scope }
        });
        if (!antwort.ok) return antwort.error;
    }
    return '';
};

// «Ändern» bei einer Person: andere Stufe wählen oder den Zugriff ganz entfernen
const personAendern = (site, person) => {
    let wahl = person.darf;
    const stufen = person.teil ? ['ansehen', 'aendern'] : ['ansehen', 'aendern', 'verwalten'];
    dialog(({ zu }) => {
        const fehler = h('div', {});
        const speichern = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'person-speichern',
                type: 'button',
                onclick: async () => {
                    speichern.disabled = true;
                    const problem = await rollenSetzen(site, person, rollenAenderung(person.rollen, wahl));
                    if (problem) {
                        speichern.disabled = false;
                        fehler.replaceChildren(h('div', { class: 'bp-hinweis bp-h-gefahr' }, problem));
                        return;
                    }
                    zu();
                    meldung('Gespeichert', person.name);
                    await nachher(site)();
                }
            },
            'Speichern'
        );
        return [
            h('h3', {}, person.name),
            person.teil ? h('p', { class: 'leise' }, 'Gilt nur für «' + person.teil.name + '».') : null,
            h(
                'div',
                { class: 'wahl-liste' },
                stufen.map(stufe =>
                    h(
                        'label',
                        { class: 'wahl' },
                        h('input', {
                            type: 'radio',
                            name: 'person-darf',
                            value: stufe,
                            checked: wahl === stufe,
                            onchange: () => (wahl = stufe)
                        }),
                        h(
                            'span',
                            { class: 'zeile-text' },
                            h('b', {}, RECHTE[stufe].titel),
                            h('span', { class: 'leise' }, RECHTE[stufe].text)
                        )
                    )
                )
            ),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o',
                        id: 'person-entfernen',
                        type: 'button',
                        onclick: () => {
                            zu();
                            personEntfernen(site, person);
                        }
                    },
                    'Zugriff entfernen'
                ),
                speichern
            )
        ];
    });
};

const personEntfernen = (site, person) =>
    fragen({
        titel: 'Zugriff entfernen?',
        text:
            person.name +
            ' kann danach nicht mehr auf ' +
            (person.teil ? 'diesen Teil' : 'diese Website') +
            ' zugreifen.',
        knopf: 'Entfernen',
        tun: async () => {
            const problem = await rollenSetzen(site, person, { geben: [], nehmen: person.rollen });
            if (problem) return problem;
            meldung('Zugriff entfernt', person.name);
            await nachher(site)();
            return '';
        }
    });

const personenTabelle = (site, personen) =>
    h(
        'div',
        { class: 'bp-tab-wrap' },
        h(
            'table',
            { class: 'bp-tab', id: 'personen-liste' },
            h(
                'thead',
                {},
                h(
                    'tr',
                    {},
                    ['Name', 'Art', 'Darf', ''].map(t => h('th', {}, t))
                )
            ),
            h(
                'tbody',
                {},
                personen.map(p =>
                    h(
                        'tr',
                        {},
                        h('td', {}, h('b', {}, p.name)),
                        h('td', {}, p.art),
                        h('td', {}, darfText(p)),
                        h(
                            'td',
                            { class: 'bp-rechts' },
                            p.ich
                                ? null
                                : h(
                                      'button',
                                      {
                                          class: 'bp-btn bp-btn-o bp-btn-klein',
                                          type: 'button',
                                          'aria-label': 'Zugriff von ' + p.name + ' ändern',
                                          onclick: () => personAendern(site, p)
                                      },
                                      'Ändern'
                                  )
                        )
                    )
                )
            )
        )
    );

const einladungWiderrufen = (site, e) =>
    fragen({
        titel: 'Einladung widerrufen?',
        text: 'Der Link funktioniert danach nicht mehr. Wer ihn schon angenommen hat, behält den Zugriff.',
        knopf: 'Widerrufen',
        tun: async () => {
            const antwort = await api.del(objektPfad(e.ziel) + '/invitations/' + e.id);
            if (!antwort.ok) return antwort.error;
            meldung('Einladung widerrufen', e.worauf);
            await nachher(site)();
            return '';
        }
    });

const einladungenAbschnitt = (site, einladungen) =>
    einladungen.length
        ? h(
              'div',
              { class: 'abschnitt', id: 'offene-einladungen' },
              h('div', { class: 'abschnitt-kopf' }, h('h3', {}, 'Offene Einladungen')),
              h(
                  'div',
                  { class: 'bp-tab-wrap' },
                  h(
                      'table',
                      { class: 'bp-tab' },
                      h(
                          'thead',
                          {},
                          h(
                              'tr',
                              {},
                              ['Worauf', 'Darf', 'Gültig', 'Benutzt', ''].map(t => h('th', {}, t))
                          )
                      ),
                      h(
                          'tbody',
                          {},
                          einladungen.map(e =>
                              h(
                                  'tr',
                                  {},
                                  h('td', {}, h('b', {}, e.worauf)),
                                  h('td', {}, e.darf),
                                  h('td', {}, e.gueltig),
                                  h('td', {}, e.benutzt),
                                  h(
                                      'td',
                                      { class: 'bp-rechts' },
                                      h(
                                          'button',
                                          {
                                              class: 'bp-btn bp-btn-o bp-btn-klein',
                                              type: 'button',
                                              onclick: () => einladungWiderrufen(site, e)
                                          },
                                          'Widerrufen'
                                      )
                                  )
                              )
                          )
                      )
                  )
              )
          )
        : null;

// ---- Besucher mit E-Mail-Anmeldung ----

const anmeldungSetzen = async (site, enabled, open) => {
    const antwort = await api.put(objektPfad(site.uuid) + '/email-login', { enabled, open });
    if (!antwort.ok) return antwort.error;
    await nachher(site)();
    return '';
};

const fehlerMeldung = text => meldung('Hat nicht geklappt', text, 'kreuz');

const besucherHandlung = async (site, v, pfad, text) => {
    const antwort = await api.post(objektPfad(site.uuid) + '/email-login/besucher/' + v.uuid + '/' + pfad, {});
    if (!antwort.ok) return fehlerMeldung(antwort.error);
    meldung(text, v.email);
    await nachher(site)();
};

const besucherEntfernen = (site, v) =>
    fragen({
        titel: 'Von der Liste streichen?',
        text: v.email + ' verliert den Zugang. Eine laufende Anmeldung endet sofort.',
        knopf: 'Streichen',
        tun: async () => {
            const antwort = await api.del(objektPfad(site.uuid) + '/email-login/besucher/' + v.uuid);
            if (!antwort.ok) return antwort.error;
            meldung('Von der Liste gestrichen', v.email);
            await nachher(site)();
            return '';
        }
    });

const besucherZeile = (site, v) => {
    const zustand = besucherZustand(v);
    return h(
        'div',
        { class: 'zeile' },
        h(
            'div',
            { class: 'zeile-text' },
            h('b', { class: 'umbruch' }, v.email),
            h(
                'span',
                { class: 'leise' },
                v.lastLoginAt ? 'Zuletzt angemeldet ' + timeAgo(v.lastLoginAt) : 'Noch nie angemeldet'
            )
        ),
        zustand.art === 'stop' ? h('span', { class: 'bp-st bp-st-stop' }, zustand.text) : null,
        h(
            'div',
            { class: 'zeile-knopf' },
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o bp-btn-klein',
                    type: 'button',
                    onclick: () =>
                        v.blockedAt
                            ? besucherHandlung(site, v, 'entsperren', 'Wieder freigegeben')
                            : besucherHandlung(site, v, 'sperren', 'Gesperrt')
                },
                v.blockedAt ? 'Entsperren' : 'Sperren'
            ),
            h(
                'button',
                {
                    class: 'bp-ikonknopf',
                    type: 'button',
                    'aria-label': v.email + ' von der Liste streichen',
                    onclick: () => besucherEntfernen(site, v)
                },
                ikon('kreuz')
            )
        )
    );
};

const besucherEinladen = async site => {
    const emails = adressenAus(ablage.adressen);
    if (!emails.length) return fehlerMeldung('Bitte gib mindestens eine Adresse ein.');
    const antwort = await api.post(objektPfad(site.uuid) + '/email-login/besucher', { emails });
    if (!antwort.ok) return fehlerMeldung(antwort.error);
    ablage.adressen = '';
    meldung('Liste aktualisiert', einladenText(antwort.data.data));
    await nachher(site)();
    huelle.neu();
};

const anmeldungKopf = (site, d, grund) => {
    if (d.enabled) {
        return h(
            'button',
            {
                class: 'bp-btn bp-btn-o bp-btn-klein',
                id: 'anmeldung-aus',
                type: 'button',
                onclick: () =>
                    fragen({
                        titel: 'Anmeldung per E-Mail ausschalten?',
                        text: 'Alle Besucher mit E-Mail-Anmeldung werden sofort abgemeldet.',
                        knopf: 'Ausschalten',
                        tun: () => anmeldungSetzen(site, false)
                    })
            },
            'Ausschalten'
        );
    }
    if (grund) return null;
    return h(
        'button',
        {
            class: 'bp-btn bp-btn-p bp-btn-klein',
            id: 'anmeldung-ein',
            type: 'button',
            onclick: async () => {
                const problem = await anmeldungSetzen(site, true);
                if (problem) fehlerMeldung(problem);
            }
        },
        'Einschalten'
    );
};

const werDarf = (site, d) => {
    const auswahl = h(
        'select',
        {
            id: 'anmeldung-wer',
            class: 'bp-in',
            onchange: () => {
                const offen = auswahl.value === 'offen';
                auswahl.value = d.openSignup ? 'offen' : 'eingeladen';
                if (!offen) {
                    anmeldungSetzen(site, true, false).then(problem => problem && fehlerMeldung(problem));
                    return;
                }
                fragen({
                    titel: 'Für alle E-Mail-Adressen öffnen?',
                    text: 'Dann kann sich jede beliebige E-Mail-Adresse auf dieser Website anmelden.',
                    knopf: 'Öffnen',
                    tun: () => anmeldungSetzen(site, true, true)
                });
            }
        },
        h('option', { value: 'eingeladen', selected: !d.openSignup }, 'Nur Eingeladene'),
        h('option', { value: 'offen', selected: d.openSignup }, 'Offen: jede E-Mail-Adresse')
    );
    return h('div', { class: 'bp-feld' }, h('label', { for: 'anmeldung-wer' }, 'Wer darf sich anmelden?'), auswahl);
};

const besucherAbschnitt = (site, d) => {
    const grund = anmeldungGrund(d);
    return h(
        'div',
        { class: 'abschnitt', id: 'besucher' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, 'Besucher mit E-Mail-Anmeldung'),
            anmeldungKopf(site, d, grund)
        ),
        h(
            'div',
            { class: 'bp-karte stapel' },
            h(
                'p',
                { class: 'leise' },
                d.enabled
                    ? 'Eingeschaltet. Besucher melden sich auf deiner Website mit einem Code aus einer Mail an und brauchen kein Konto.'
                    : 'Ausgeschaltet. Eingeschaltet melden sich Besucher auf deiner Website mit einem Code aus einer Mail an und brauchen kein Konto.'
            ),
            grund ? h('div', { class: 'bp-hinweis bp-h-warn' }, grund) : null,
            d.enabled ? werDarf(site, d) : null,
            d.enabled
                ? h(
                      'span',
                      { class: 'leise' },
                      'Diesen Monat: ' +
                          formatNumber(d.mails.used) +
                          ' von ' +
                          formatNumber(d.mails.max) +
                          ' Mails, ' +
                          formatNumber(d.loginsThisMonth) +
                          ' Anmeldungen'
                  )
                : null,
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'besucher-adressen' }, 'Besucher auf die Liste setzen'),
                h('textarea', {
                    id: 'besucher-adressen',
                    class: 'bp-in',
                    rows: 2,
                    autocomplete: 'off',
                    placeholder: 'anna@beispiel.ch, ben@beispiel.ch',
                    value: ablage.adressen,
                    oninput: e => (ablage.adressen = e.target.value)
                }),
                h(
                    'small',
                    {},
                    'Dabei geht keine Mail raus. Sag den Leuten die Adresse der Website, dort bekommen sie ihren Code.'
                )
            ),
            h(
                'div',
                {},
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o',
                        id: 'besucher-einladen',
                        type: 'button',
                        onclick: () => besucherEinladen(site)
                    },
                    'Auf die Liste setzen'
                )
            ),
            d.visitors.length
                ? h(
                      'div',
                      { class: 'zeilen', id: 'besucher-liste' },
                      d.visitors.map(v => besucherZeile(site, v))
                  )
                : h('span', { class: 'leise' }, 'Noch niemand auf der Liste.'),
            d.visitorCount > d.visitors.length
                ? h(
                      'span',
                      { class: 'leise' },
                      'Es werden die neusten ' + d.visitors.length + ' von ' + d.visitorCount + ' angezeigt.'
                  )
                : null,
            h(
                'span',
                { class: 'leise' },
                'Wer sich ' +
                    Math.round(d.visitorKeepDays / 30) +
                    ' Monate lang nicht anmeldet, wird von der Liste gestrichen. Gesperrte bleiben.'
            )
        )
    );
};

export const reiterPersonen = (w, site) => {
    if (!site.rights?.grant) {
        return h(
            'div',
            { class: 'bp-karte', id: 'personen-keine-rechte' },
            leer('konto', 'Nur für Verwalter', 'Wer Zugriff hat, sehen nur Menschen, die diese Website verwalten.')
        );
    }
    if (ablage.id !== site.uuid)
        Object.assign(ablage, { id: site.uuid, zeit: 0, inhalt: null, fehler: null, adressen: '' });
    if (Date.now() - ablage.zeit > FRISCH_MS) {
        ablage.zeit = Date.now();
        laden(site);
    }
    if (ablage.fehler) {
        return h(
            'div',
            { class: 'bp-karte', id: 'personen-fehler' },
            ablage.fehler === 'rechte'
                ? leer('konto', 'Keine Berechtigung', 'Du darfst den Zugriff auf diese Website nicht verwalten.')
                : leer(
                      'personen',
                      'Konnte die Personen nicht laden',
                      'Versuch es in einer Minute nochmals.',
                      h(
                          'button',
                          { class: 'bp-btn bp-btn-o', type: 'button', onclick: nachher(site) },
                          'Nochmals versuchen'
                      )
                  )
        );
    }
    if (!ablage.inhalt) {
        return h('div', { class: 'bp-karte', id: 'personen-laedt' }, h('span', { class: 'leise' }, 'Wird geladen…'));
    }
    const { personen, einladungen, besucher } = ablage.inhalt;
    const gast = DATEN.mensch.art !== 'user';
    return h(
        'div',
        { class: 'stapel', id: 'personen-reiter' },
        h(
            'div',
            { class: 'abschnitt' },
            h(
                'div',
                { class: 'abschnitt-kopf' },
                h('h3', {}, 'Wer hat Zugriff'),
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-p',
                        id: 'zugriff-geben',
                        type: 'button',
                        onclick: () => zugriffGebenOeffnen({ w, site, besucher, gast, nachher: nachher(site) })
                    },
                    ikon('plus'),
                    'Zugriff geben'
                )
            ),
            personenTabelle(site, personen)
        ),
        einladungenAbschnitt(site, einladungen),
        besucher
            ? besucherAbschnitt(site, besucher)
            : gast
              ? h(
                    'div',
                    { class: 'bp-hinweis bp-h-info', id: 'personen-gast' },
                    'Mit einem Konto kannst du auch Einladungs-Links verschicken und Besucher per E-Mail anmelden lassen.'
                )
              : null
    );
};
