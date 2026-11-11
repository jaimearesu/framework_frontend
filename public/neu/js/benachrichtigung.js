// Karte «Benachrichtigungen» auf der Seite Konto (Warn-Mails, 11.11.2026).
// Adresse eintragen -> Code per Mail -> Code eingeben -> Warnungen bei 80 / 100 / 150 %
// und wenn das Konto automatisch hochgestuft wird. Jede Art einzeln abbestellbar.
// Texte vom Backend nur über h() (textContent), nie innerHTML.
import { api } from '../../js/core/api.js';
import { DATEN } from './daten.js';
import { h, laedtBalken, meldung } from './ui.js';
import { artenAnsicht, codeAus, stummNach, zustandVon } from './benachrichtigung-werte.js';

const PFAD = '/api/billing/benachrichtigung';
const SPAM = 'Kommt nichts an? Schau auch im Spam-Ordner nach.';

export const benachrichtigungKarte = () => {
    const karte = h(
        'div',
        { class: 'bp-karte stapel', id: 'benachrichtigung' },
        h('h3', {}, 'Benachrichtigungen'),
        laedtBalken()
    );
    // Was gerade im Feld steht, bleibt beim Neuzeichnen erhalten
    const merk = { adresse: '', code: '', aendern: false, arbeitet: false, fehler: null };
    let stand = null;

    const fehlerZeile = () =>
        merk.fehler ? h('div', { class: 'bp-hinweis bp-h-gefahr', id: 'warn-fehler' }, merk.fehler) : null;

    // Eine Anfrage schicken, Knöpfe sperren, danach neu zeichnen
    const tun = async (anfrage, danach) => {
        merk.arbeitet = true;
        merk.fehler = null;
        zeichnen();
        const antwort = await anfrage();
        merk.arbeitet = false;
        if (!antwort.ok) {
            merk.fehler = antwort.error || 'Das hat nicht geklappt. Bitte gleich nochmals versuchen.';
            zeichnen();
            return;
        }
        if (danach) danach(antwort.data.data);
        await laden();
    };

    const codeSchicken = () => {
        const email = (merk.adresse || '').trim();
        if (!email.includes('@')) {
            merk.fehler = 'Bitte gib eine gültige E-Mail-Adresse ein.';
            zeichnen();
            return;
        }
        tun(
            () => api.put(PFAD, { email }),
            () => {
                merk.code = '';
                merk.aendern = false;
            }
        );
    };

    const bestaetigen = () => {
        const code = codeAus(merk.code);
        if (!code) {
            merk.fehler = 'Der Code hat 6 Ziffern.';
            zeichnen();
            return;
        }
        tun(
            () => api.post(PFAD + '/bestaetigen', { code }),
            daten => meldung('Adresse bestätigt', 'Warnungen gehen ab jetzt an ' + daten.email + '.')
        );
    };

    const adressFeld = () =>
        h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: 'warn-adresse' }, 'E-Mail-Adresse für Warnungen'),
            h('input', {
                id: 'warn-adresse',
                class: 'bp-in',
                type: 'email',
                autocomplete: 'email',
                placeholder: 'du@beispiel.ch',
                value: merk.adresse,
                oninput: e => {
                    merk.adresse = e.target.value;
                },
                onkeydown: e => {
                    if (e.key === 'Enter') codeSchicken();
                }
            }),
            h('small', {}, 'Wir schicken dir zuerst einen Code, damit wir wissen, dass die Adresse dir gehört.')
        );

    const zeichnen = () => {
        const z = zustandVon(stand);
        const teile = [h('h3', {}, 'Benachrichtigungen')];

        if (z === 'aus') {
            teile.push(
                h('span', { class: 'leise' }, 'Der Mail-Versand ist auf diesem Server noch nicht eingerichtet.')
            );
            karte.replaceChildren(...teile);
            return;
        }

        teile.push(
            h(
                'span',
                { class: 'leise' },
                'Wir schreiben dir, bevor dein Konto voll ist – bei 80 %, bei 100 % und wenn es über 150 % gebremst wird. Jede Mail kommt pro Bereich und Monat höchstens einmal.'
            )
        );
        if (!stand.limitsEnforced) {
            teile.push(
                h(
                    'div',
                    { class: 'bp-hinweis bp-h-info', id: 'warn-nur-anzeige' },
                    'Die Grenzen werden im Moment nur angezeigt, noch nicht angewendet. Darum gibt es noch keine Warnungen.'
                )
            );
        }

        if (z === 'code') {
            teile.push(
                h(
                    'div',
                    { class: 'bp-hinweis bp-h-info', id: 'warn-code-unterwegs' },
                    'Wir haben einen Code an ' + stand.pendingEmail + ' geschickt. Er gilt 15 Minuten. ' + SPAM
                ),
                h(
                    'div',
                    { class: 'bp-feld' },
                    h('label', { for: 'warn-code' }, 'Code aus der Mail'),
                    h('input', {
                        id: 'warn-code',
                        class: 'bp-in mono',
                        inputmode: 'numeric',
                        autocomplete: 'one-time-code',
                        placeholder: '123456',
                        maxlength: '12',
                        value: merk.code,
                        'data-fokus': true,
                        oninput: e => {
                            merk.code = e.target.value;
                        },
                        onkeydown: e => {
                            if (e.key === 'Enter') bestaetigen();
                        }
                    })
                ),
                fehlerZeile(),
                h(
                    'div',
                    { class: 'knopf-reihe' },
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-p',
                            id: 'warn-bestaetigen',
                            type: 'button',
                            disabled: merk.arbeitet,
                            onclick: bestaetigen
                        },
                        merk.arbeitet ? 'Wird geprüft…' : 'Bestätigen'
                    ),
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-o',
                            id: 'warn-nochmals',
                            type: 'button',
                            disabled: merk.arbeitet,
                            onclick: () => {
                                merk.adresse = stand.pendingEmail;
                                codeSchicken();
                            }
                        },
                        'Code nochmals schicken'
                    )
                )
            );
        } else if (z === 'adresse' || merk.aendern) {
            teile.push(
                adressFeld(),
                fehlerZeile(),
                h(
                    'div',
                    { class: 'knopf-reihe' },
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-p',
                            id: 'warn-code-schicken',
                            type: 'button',
                            disabled: merk.arbeitet,
                            onclick: codeSchicken
                        },
                        merk.arbeitet ? 'Wird verschickt…' : 'Code schicken'
                    ),
                    merk.aendern
                        ? h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-o',
                                  type: 'button',
                                  onclick: () => {
                                      merk.aendern = false;
                                      merk.fehler = null;
                                      zeichnen();
                                  }
                              },
                              'Abbrechen'
                          )
                        : null
                ),
                h('small', { class: 'leise' }, SPAM)
            );
        } else {
            // aktiv: Adresse + Haken zum Abbestellen
            teile.push(
                h(
                    'div',
                    { class: 'kennzahl' },
                    h('span', {}, 'Warnungen gehen an'),
                    h('b', { id: 'warn-adresse-aktiv' }, stand.email)
                ),
                h(
                    'div',
                    { class: 'wahl-liste', id: 'warn-arten' },
                    artenAnsicht(stand).map(a =>
                        h(
                            'label',
                            { class: 'wahl' },
                            h('input', {
                                type: 'checkbox',
                                class: 'bp-cb',
                                checked: a.an,
                                disabled: merk.arbeitet,
                                onchange: e =>
                                    tun(() =>
                                        api.put(PFAD + '/arten', {
                                            muted: stummNach(stand.muted, a.id, e.target.checked)
                                        })
                                    )
                            }),
                            h(
                                'span',
                                { class: 'zeile-text' },
                                h('b', {}, a.text),
                                h('small', { class: 'leise' }, ' ' + a.erklaerung)
                            )
                        )
                    )
                ),
                fehlerZeile(),
                h(
                    'div',
                    { class: 'knopf-reihe' },
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-o',
                            id: 'warn-aendern',
                            type: 'button',
                            onclick: () => {
                                merk.aendern = true;
                                merk.adresse = stand.email;
                                zeichnen();
                            }
                        },
                        'Adresse ändern'
                    ),
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-o',
                            id: 'warn-entfernen',
                            type: 'button',
                            disabled: merk.arbeitet,
                            onclick: () => tun(() => api.del(PFAD))
                        },
                        'Keine Warn-Mails mehr'
                    )
                )
            );
        }
        karte.replaceChildren(...teile.filter(Boolean));
    };

    const laden = async () => {
        const antwort = await api.get(PFAD);
        if (!antwort.ok) {
            karte.replaceChildren(
                h('h3', {}, 'Benachrichtigungen'),
                h('span', { class: 'leise' }, 'Die Einstellungen lassen sich gerade nicht laden.')
            );
            return;
        }
        stand = antwort.data.data;
        // Vorschlag: die Adresse, mit der man angemeldet ist
        if (!merk.adresse) merk.adresse = DATEN.mensch.email || '';
        zeichnen();
    };
    laden();
    return karte;
};
