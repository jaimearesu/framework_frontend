// Eigene Domain verbinden, Schritt für Schritt mit «Weiter» und «Zurück».
// Die Anmeldung bei vindelis passiert nach dem ersten Schritt. Wer danach schliesst, macht auf der
// Karte der Domain mit «Anleitung fortsetzen» weiter.
import { api } from '../../js/core/api.js';
import { customDomainInputProblem, dnsNameHint } from '../../js/core/site.js';
import { h, dialog, meldung, kopierZeile } from './ui.js';
import { nochmals } from './einst-hilfe.js';
import { ANBIETER, anbieterVon, domainSchritte, ohneWww } from './domain-werte.js';

// Der gewählte Anbieter bleibt, solange das Cockpit offen ist
let letzterAnbieter = '';

const domainPfad = uuid => '/api/objects/' + encodeURIComponent(uuid) + '/custom-domains';

export const domainAnleitungOeffnen = ({ site, schluessel, cnameZiel, domain = null }) => {
    const stand = {
        schritt: domain ? 'anbieter' : 'adresse',
        eingabe: '',
        domain,
        anbieter: letzterAnbieter,
        fehler: '',
        arbeitet: false,
        ergebnis: null
    };

    dialog(({ zu, neu }) => {
        const schritte = domainSchritte(stand.domain?.hostname || stand.eingabe);
        const nummer = schritte.findIndex(([id]) => id === stand.schritt);
        const gehe = richtung => {
            stand.fehler = '';
            stand.schritt = schritte[nummer + richtung][0];
            neu();
        };
        const anzeige = h(
            'ol',
            { class: 'bp-stepper domain-schritte' },
            schritte.map(([, text], i) =>
                h(
                    'li',
                    { class: i === nummer ? 'aktiv' : i < nummer ? 'fertig' : null },
                    h('i', {}, String(i + 1)),
                    text
                )
            )
        );
        const fehler = stand.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr' }, stand.fehler) : null;
        const fuss = (weiter, weiterText, aus = false) =>
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                // Ist die Domain angemeldet, führt kein Weg mehr zum ersten Schritt zurück
                nummer > 1
                    ? h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: () => gehe(-1) }, 'Zurück')
                    : null,
                h(
                    'button',
                    { class: 'bp-btn bp-btn-p', id: 'domain-weiter', type: 'button', disabled: aus, onclick: weiter },
                    weiterText
                )
            );

        if (stand.schritt === 'adresse') {
            const anmelden = async () => {
                const problem = customDomainInputProblem(stand.eingabe);
                if (problem) {
                    stand.fehler = problem;
                    return neu();
                }
                stand.arbeitet = true;
                neu();
                const antwort = await api.post(domainPfad(site.uuid), { hostname: stand.eingabe.trim() });
                stand.arbeitet = false;
                if (!antwort.ok) {
                    stand.fehler = antwort.error;
                    return neu();
                }
                stand.domain = antwort.data?.data;
                stand.fehler = '';
                stand.schritt = 'anbieter';
                neu();
                await nochmals(schluessel);
            };
            return [
                h('h3', {}, 'Welche Adresse soll deine Website haben?'),
                anzeige,
                h(
                    'div',
                    { class: 'bp-feld' },
                    h('label', { for: 'domain-adresse' }, 'Deine Adresse'),
                    h('input', {
                        id: 'domain-adresse',
                        class: 'bp-in mono',
                        placeholder: 'www.meinladen.ch',
                        autocomplete: 'off',
                        value: stand.eingabe,
                        'data-fokus': true,
                        oninput: e => {
                            stand.eingabe = e.target.value;
                        },
                        onkeydown: e => {
                            if (e.key === 'Enter') anmelden();
                        }
                    }),
                    h(
                        'small',
                        {},
                        'Die Domain musst du schon besitzen. Nimm die Form mit www davor, die Adresse ohne www richten wir am Schluss ein.'
                    )
                ),
                fehler,
                fuss(anmelden, stand.arbeitet ? 'Wird angemeldet…' : 'Weiter', stand.arbeitet)
            ];
        }

        const hostname = stand.domain.hostname;
        const anbieter = anbieterVon(stand.anbieter);

        if (stand.schritt === 'anbieter') {
            return [
                h('h3', {}, 'Wo hast du ' + ohneWww(hostname) + ' gekauft?'),
                anzeige,
                h(
                    'div',
                    { class: 'wahl-liste' },
                    ANBIETER.map(a =>
                        h(
                            'label',
                            { class: 'wahl' },
                            h('input', {
                                type: 'radio',
                                name: 'domain-anbieter',
                                value: a.id,
                                checked: stand.anbieter === a.id,
                                onchange: () => {
                                    stand.anbieter = a.id;
                                    letzterAnbieter = a.id;
                                    neu();
                                }
                            }),
                            h('span', { class: 'zeile-text' }, h('b', {}, a.name))
                        )
                    )
                ),
                h(
                    'p',
                    { class: 'leise' },
                    'Weisst du es nicht mehr? Schau in deinen Mails nach der Rechnung für die Domain.'
                ),
                fuss(() => gehe(1), 'Weiter', !stand.anbieter)
            ];
        }

        if (stand.schritt === 'oeffnen') {
            return [
                h('h3', {}, 'Öffne die Einstellungen bei ' + anbieter.name),
                anzeige,
                h(
                    'ol',
                    { class: 'domain-liste' },
                    anbieter.oeffnen.map(text => h('li', {}, text))
                ),
                h('p', { class: 'leise' }, 'Lass dieses Fenster offen, im nächsten Schritt kannst du alles kopieren.'),
                fuss(() => gehe(1), 'Das Feld ist offen')
            ];
        }

        if (stand.schritt === 'eintragen') {
            const zeile = (label, wert) => h('div', { class: 'bp-feld' }, h('label', {}, label), kopierZeile(wert));
            return [
                h('h3', {}, 'Trage diese Werte ein'),
                anzeige,
                h('div', { class: 'bp-feld' }, h('label', {}, anbieter.felder.typ), h('b', { class: 'mono' }, 'CNAME')),
                zeile(anbieter.felder.name, dnsNameHint(hostname)),
                zeile(anbieter.felder.ziel, stand.domain.dns?.target || cnameZiel),
                anbieter.hinweis ? h('div', { class: 'bp-hinweis bp-h-warn' }, anbieter.hinweis) : null,
                h('p', {}, h('b', {}, anbieter.speichern)),
                h(
                    'p',
                    { class: 'leise' },
                    'Alles andere, zum Beispiel TTL, lässt du wie es ist. Gibt es schon einen Eintrag mit dem Namen ' +
                        dnsNameHint(hostname) +
                        ', lösche ihn zuerst. Wird der Name abgelehnt, trag den ganzen Namen ein: ' +
                        hostname +
                        '.'
                ),
                fuss(() => gehe(1), 'Gespeichert, weiter')
            ];
        }

        if (stand.schritt === 'pruefen') {
            const pruefen = async () => {
                stand.arbeitet = true;
                neu();
                const antwort = await api.post(
                    domainPfad(site.uuid) + '/' + encodeURIComponent(hostname) + '/check',
                    {}
                );
                stand.arbeitet = false;
                if (antwort.ok) stand.ergebnis = antwort.data?.data?.status;
                stand.fehler = antwort.ok ? '' : antwort.error;
                neu();
                if (antwort.ok) await nochmals(schluessel);
            };
            const aktiv = stand.ergebnis === 'active' || stand.domain.status === 'active';
            const naechster = schritte[nummer + 1];
            return [
                h('h3', {}, 'Klappt die Verbindung?'),
                anzeige,
                aktiv
                    ? h(
                          'div',
                          { class: 'bp-hinweis bp-h-ok', id: 'domain-aktiv' },
                          'Es hat geklappt, ' + hostname + ' ist aktiv.'
                      )
                    : stand.ergebnis
                      ? h(
                            'div',
                            { class: 'bp-hinweis bp-h-info', id: 'domain-wartet' },
                            'Noch nicht bereit. Dein Eintrag muss sich erst im Internet verteilen.'
                        )
                      : null,
                aktiv
                    ? null
                    : h(
                          'p',
                          {},
                          'Das dauert meist einige Minuten, manchmal bis zu 48 Stunden. Du kannst dieses Fenster ruhig schliessen: vindelis prüft alle 5 Minuten von selbst und holt auch das Zertifikat.'
                      ),
                fehler,
                aktiv
                    ? null
                    : h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-o',
                              id: 'domain-pruefen',
                              type: 'button',
                              disabled: stand.arbeitet,
                              onclick: pruefen
                          },
                          stand.arbeitet ? 'Wird geprüft…' : 'Jetzt prüfen'
                      ),
                fuss(
                    naechster
                        ? () => gehe(1)
                        : () => {
                              zu();
                              meldung('Domain angemeldet', hostname);
                          },
                    naechster ? 'Weiter' : 'Fertig'
                )
            ];
        }

        // Ohne www: Eine nackte Domain lässt sich nicht verbinden, sie wird weitergeleitet
        return [
            h('h3', {}, 'Auch ohne www erreichbar machen'),
            anzeige,
            h(
                'p',
                {},
                'Damit auch ' +
                    ohneWww(hostname) +
                    ' funktioniert, richtest du bei ' +
                    anbieter.name +
                    ' eine Weiterleitung ein. Sie heisst meist «Weiterleitung» oder «Redirect».'
            ),
            h('div', { class: 'bp-feld' }, h('label', {}, 'Von'), kopierZeile(ohneWww(hostname))),
            h('div', { class: 'bp-feld' }, h('label', {}, 'Nach'), kopierZeile('https://' + hostname)),
            h('p', { class: 'leise' }, 'Das ist freiwillig. Du kannst es auch später machen.'),
            fuss(() => {
                zu();
                meldung('Domain angemeldet', hostname);
            }, 'Fertig')
        ];
    });
};
