// Reiter «Auslastung» (Plan "T", T4, Wunsch von Jaime 11.11.2026):
// Auf einen Blick sehen, wie viel das Konto verbraucht und ob noch Platz ist –
// pro Bereich ein Balken bis 150 % mit Marke bei der Grenze der Stufe, darunter
// welche Website wie viel verbraucht, ganz unten die Stufen zum Wechseln.
// Lädt GET /api/billing/usage (Verbrauch) und GET /api/billing (Abo-Stand).
// Bezahlt wird immer bei Stripe – vindelis sieht keine Kartendaten.
import { api } from '../../js/core/api.js';
import { h, laedtBalken, meldung, dialog, leer } from './ui.js';
import { stripeAdresseOk, WAEHRUNGEN } from './abrechnung-werte.js';
import { bereichAnsicht, kopfAnsicht, stufenAnsicht, kostendachWahl, websitesAnsicht } from './auslastung-werte.js';
import { ohneAdresseHinweis } from './benachrichtigung-werte.js';

// Fehlermeldung des Backends zeigen (Texte immer als Text, nie als HTML)
const fehler = antwort =>
    meldung('Das hat nicht geklappt', antwort.error || 'Bitte gleich nochmals versuchen.', 'kreuz');

// Ein Bereich: Name, Zahlen, Balken mit Marke bei 100 %, «noch Platz», nächste Stufe
const bereichKarte = b =>
    h(
        'div',
        { class: 'aus-bereich', id: 'aus-' + b.key },
        h(
            'div',
            { class: 'kennzahl' },
            h('b', {}, b.name),
            h(
                'span',
                {},
                b.wort ? h('span', { class: 'bp-st bp-st-' + (b.farbe === 'stop' ? 'stop' : 'warn') }, b.wort) : null,
                ' ',
                h('span', { class: 'aus-prozent' }, b.prozent === null ? '' : b.prozent + ' %')
            )
        ),
        h(
            'div',
            { class: 'aus-balken', role: 'img', 'aria-label': b.name + ': ' + b.text },
            h('i', { class: 'aus-' + b.farbe, style: 'width:' + b.breite + '%' }),
            b.marke
                ? h('span', { class: 'aus-marke', style: 'left:' + b.marke + '%', title: 'Grenze der Stufe' })
                : null
        ),
        h('div', { class: 'kennzahl' }, h('span', { class: 'leise' }, b.text), h('span', { class: 'leise' }, b.platz)),
        b.naechste ? h('span', { class: 'leise' }, 'Nächste Stufe ' + b.naechste) : null
    );

// Pro Website: Name und drei kleine Anteils-Balken
const websitesKarte = u => {
    const liste = websitesAnsicht(u);
    return h(
        'div',
        { class: 'bp-karte stapel', id: 'aus-websites' },
        h('h3', {}, 'Pro Website'),
        h(
            'span',
            { class: 'leise' },
            'Welche Website wie viel verbraucht – der Balken zeigt den Anteil am ganzen Konto.'
        ),
        liste.length === 0
            ? leer('kugel', 'Noch keine Website', 'Sobald du eine Website hast, steht hier ihr Verbrauch.')
            : h(
                  'div',
                  { class: 'zeilen' },
                  liste.map(w =>
                      h(
                          'a',
                          { class: 'zeile zeile-link aus-website', href: '#/website/' + w.uuid },
                          h(
                              'div',
                              { class: 'zeile-text' },
                              h('b', {}, w.name),
                              h(
                                  'div',
                                  { class: 'aus-anteile' },
                                  w.zeilen.map(([name, wert, anteil]) =>
                                      h(
                                          'div',
                                          { class: 'aus-anteil' },
                                          h('span', { class: 'leise' }, name + ' ' + wert + ' (' + anteil + ' %)'),
                                          h(
                                              'div',
                                              { class: 'balken' },
                                              h('i', { style: 'width:' + Math.min(100, anteil) + '%' })
                                          )
                                      )
                                  )
                              )
                          )
                      )
                  )
              ),
        u.backupBytes > 0
            ? h('span', { class: 'leise' }, 'Dazu kommen die Sicherungen der Zeitmaschine (gehören zum Konto).')
            : null,
        u.sitesCapped
            ? h('span', { class: 'leise' }, 'Es werden nur die Websites mit dem meisten Verbrauch gezeigt.')
            : null
    );
};

// Zu Stripe (Kauf oder Kundenportal): Adresse holen, prüfen, hinüber
const zuStripe = async (knopf, pfad, body) => {
    knopf.disabled = true;
    const antwort = await api.post(pfad, body || {});
    const adresse = antwort.ok ? antwort.data?.data?.url : null;
    if (!adresse || !stripeAdresseOk(adresse)) {
        knopf.disabled = false;
        fehler(antwort);
        return;
    }
    location.href = adresse;
};

// Höher stufen kostet sofort (anteilig) – darum zuerst fragen
const wechselnFragen = (stufe, hoeher, neuLaden) =>
    dialog(({ zu }) => {
        const ja = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'aus-wechseln-ja',
                type: 'button',
                onclick: async () => {
                    ja.disabled = true;
                    const antwort = await api.post('/api/billing/tier', { tier: stufe.id });
                    zu();
                    if (!antwort.ok) return fehler(antwort);
                    meldung(
                        hoeher ? 'Gewechselt' : 'Vorgemerkt',
                        hoeher
                            ? 'Du bist jetzt auf der Stufe ' + stufe.name + '.'
                            : 'Ab dem nächsten Monat gilt die Stufe ' + stufe.name + '.'
                    );
                    neuLaden();
                }
            },
            hoeher ? 'Jetzt wechseln' : 'Vormerken'
        );
        return [
            h('h3', {}, 'Auf ' + stufe.name + ' wechseln?'),
            h(
                'p',
                {},
                hoeher
                    ? 'Die neue Stufe gilt sofort. Für den Rest dieses Monats wird der Unterschied gleich verrechnet, danach ' +
                          stufe.preis +
                          '.'
                    : 'Dieser Monat ist schon bezahlt. Die Stufe ' +
                          stufe.name +
                          ' gilt ab dem nächsten Monat, falls dein Verbrauch dann noch hineinpasst.'
            ),
            h(
                'div',
                { class: 'knopf-reihe' },
                ja,
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen')
            )
        ];
    });

// Die Stufen nebeneinander, mit Knopf
const stufenKarte = (u, stand, neuLaden) => {
    let waehrung = stand.currency || 'chf';
    const waehlen =
        !stand.currency && stand.stripeEnabled === true && !['active', 'past_due', 'paused'].includes(stand.status);
    const stufen = stufenAnsicht(u, stand);
    const gebuchtRang = stufen.findIndex(s => s.jetzt);
    const waehlKnoepfe = WAEHRUNGEN.map(w =>
        h(
            'button',
            {
                type: 'button',
                id: 'aus-waehrung-' + w,
                role: 'tab',
                'aria-selected': w === waehrung ? 'true' : 'false',
                onclick: () => {
                    waehrung = w;
                    for (const k of waehlKnoepfe)
                        k.setAttribute('aria-selected', k.id === 'aus-waehrung-' + w ? 'true' : 'false');
                }
            },
            w.toUpperCase()
        )
    );
    const knopfFuer = (s, i) => {
        if (!s.knopf) return null;
        const k = h(
            'button',
            {
                class:
                    'bp-btn ' +
                    (s.knopf.art === 'kaufen' || (s.knopf.art === 'wechseln' && i > gebuchtRang)
                        ? 'bp-btn-p'
                        : 'bp-btn-o'),
                id: 'aus-stufe-' + s.id,
                type: 'button',
                onclick: () => {
                    if (s.knopf.art === 'kaufen')
                        return zuStripe(k, '/api/billing/checkout', { currency: waehrung, tier: s.id });
                    if (s.knopf.art === 'portal') return zuStripe(k, '/api/billing/portal');
                    if (s.knopf.art === 'zuruecknehmen') {
                        return api.post('/api/billing/tier', { tier: s.id }).then(a => (a.ok ? neuLaden() : fehler(a)));
                    }
                    return wechselnFragen(s, i > gebuchtRang, neuLaden);
                }
            },
            s.knopf.text
        );
        return k;
    };
    return h(
        'div',
        { class: 'bp-karte stapel', id: 'aus-stufen' },
        h('h3', {}, 'Stufen'),
        h(
            'span',
            { class: 'leise' },
            'Bauen, testen und veröffentlichen sind immer gratis. Bezahlt wird nach Verbrauch des ganzen Kontos.'
        ),
        stand.stripeMode === 'test'
            ? h(
                  'div',
                  { class: 'bp-hinweis bp-h-info' },
                  'Testmodus: Hier fliesst kein echtes Geld (Testkarte 4242 4242 4242 4242).'
              )
            : null,
        waehlen ? h('div', { class: 'bp-segment', role: 'tablist', 'aria-label': 'Währung' }, waehlKnoepfe) : null,
        h(
            'div',
            { class: 'aus-stufen' },
            stufen.map((s, i) =>
                h(
                    'div',
                    { class: 'aus-stufe' + (s.jetzt ? ' jetzt' : ''), id: 'aus-stufe-karte-' + s.id },
                    h(
                        'div',
                        { class: 'kennzahl' },
                        h('b', {}, s.name),
                        s.jetzt
                            ? h('span', { class: 'bp-st bp-st-ok' }, 'Deine Stufe')
                            : s.passt
                              ? h('span', { class: 'bp-st bp-st-info' }, 'Passt zu dir')
                              : null
                    ),
                    h('span', { class: 'aus-preis' }, s.preis),
                    h(
                        'ul',
                        { class: 'aus-liste' },
                        s.zeilen.map(z => h('li', {}, z))
                    ),
                    s.notiz ? h('span', { class: 'leise' }, s.notiz) : null,
                    knopfFuer(s, i)
                )
            )
        ),
        kostendachTeil(u, stand, neuLaden)
    );
};

// «Automatisch hochstufen» mit Kostendach (Entscheidung T-D)
const kostendachTeil = (u, stand, neuLaden) => {
    const wahl = kostendachWahl(u, stand);
    if (!wahl) return null;
    const auswahl = h(
        'select',
        { class: 'bp-in aus-wahl', id: 'aus-kostendach' },
        wahl.optionen.map(([wert, text]) => h('option', { value: wert, selected: wert === wahl.wert }, text))
    );
    const speichern = h(
        'button',
        {
            class: 'bp-btn bp-btn-o',
            id: 'aus-kostendach-speichern',
            type: 'button',
            onclick: async () => {
                speichern.disabled = true;
                const antwort = await api.post('/api/billing/auto', { max: auswahl.value || null });
                speichern.disabled = false;
                if (!antwort.ok) return fehler(antwort);
                meldung(
                    'Gespeichert',
                    auswahl.value ? 'Automatisch hochstufen ist an.' : 'Automatisch hochstufen ist aus.'
                );
                neuLaden();
            }
        },
        'Speichern'
    );
    return h(
        'div',
        { class: 'stapel aus-kostendach' },
        h('b', {}, 'Automatisch hochstufen'),
        h(
            'span',
            { class: 'leise' },
            'Wird es voll, wechselt dein Konto von selbst in die nächste passende Stufe – höchstens bis zum Kostendach. Zurück geht es von selbst, wenn ein ganzer Monat in die kleinere Stufe passt (nie unter Klein).'
        ),
        h('div', { class: 'knopf-reihe' }, auswahl, speichern)
    );
};

// Die ganze Seite
const inhalt = (u, stand, neuLaden, warn) => {
    const k = kopfAnsicht(u);
    const naechste = u.tiers.find(t => t.id === u.tier.next);
    return [
        h(
            'div',
            { class: 'bp-karte stapel', id: 'aus-kopf' },
            h(
                'div',
                { class: 'kennzahl' },
                h('h3', {}, 'Stufe ' + k.stufe),
                h('span', { class: 'leise' }, k.neuAb || '')
            ),
            h(
                'div',
                { class: 'bp-hinweis bp-h-' + (k.farbe === 'ok' ? 'ok' : k.farbe), id: 'aus-satz' },
                h('b', {}, k.titel + '. '),
                k.text
            ),
            k.braucht ? h('span', { class: 'leise' }, k.braucht) : null,
            // Warn-Mails (11.11.2026): noch keine Adresse hinterlegt
            ohneAdresseHinweis(warn)
                ? h(
                      'div',
                      { class: 'bp-hinweis bp-h-info mit-knopf', id: 'aus-warnmail' },
                      h(
                          'span',
                          {},
                          'Hinterlege eine Adresse, damit wir dich warnen können, bevor dein Konto voll ist.'
                      ),
                      h('a', { class: 'bp-btn bp-btn-o', href: '#/konto' }, 'Adresse eintragen')
                  )
                : null,
            k.nurAnzeige
                ? h(
                      'span',
                      { class: 'leise', id: 'aus-nur-anzeige' },
                      'Die Grenzen werden im Moment nur angezeigt, noch nicht angewendet.'
                  )
                : null,
            h(
                'div',
                { class: 'aus-bereiche' },
                u.metrics.map(m => bereichKarte(bereichAnsicht(m, naechste ? naechste.name : null)))
            )
        ),
        websitesKarte(u),
        stufenKarte(u, stand, neuLaden)
    ];
};

export const seiteAuslastung = () => {
    const seite = h('div', { class: 'stapel', id: 'auslastung' }, h('div', { class: 'bp-karte' }, laedtBalken()));
    const laden = () =>
        Promise.all([
            api.get('/api/billing/usage'),
            api.get('/api/billing'),
            api.get('/api/billing/benachrichtigung')
        ]).then(([u, s, w]) => {
            if (!u.ok || !s.ok) {
                seite.replaceChildren(
                    h(
                        'div',
                        { class: 'bp-karte' },
                        leer(
                            'tabelle',
                            u.status === 403 || s.status === 403 ? 'Nur mit Anmeldung' : 'Gerade nicht verfügbar',
                            u.status === 403 || s.status === 403
                                ? 'Die Auslastung gibt es für angemeldete Konten.'
                                : 'Der Verbrauch lässt sich gerade nicht laden. Bitte später nochmals.'
                        )
                    )
                );
                return;
            }
            seite.replaceChildren(
                ...inhalt(u.data.data, s.data.data, laden, w.ok ? w.data.data : null).filter(Boolean)
            );
        });
    laden();
    return seite;
};
