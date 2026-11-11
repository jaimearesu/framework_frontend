// Karte «Abrechnung» auf der Seite Konto (Plan "P", P2; seit Plan "T" mit Stufen).
// Lädt den Stand über GET /api/billing. «Abo starten» und «Rechnungen und Karte verwalten»
// schicken zu Stripe – die Kartendaten gibt man dort ein, vindelis sieht sie nie.
// Ob bezahlt ist, sagt nie der Browser, sondern nur Stripe selbst (Webhook, P3).
import { api } from '../../js/core/api.js';
import { h, laedtBalken, meldung } from './ui.js';
import { abrechnungAnsicht, rueckkehrAus, stripeAdresseOk } from './abrechnung-werte.js';

// Zu Stripe gehen: Adresse holen, prüfen, hinüber. Der Knopf bleibt gesperrt, bis es weitergeht
const zuStripe = async (knopf, pfad, body) => {
    knopf.disabled = true;
    const antwort = await api.post(pfad, body || {});
    const adresse = antwort.ok ? antwort.data?.data?.url : null;
    if (!adresse || !stripeAdresseOk(adresse)) {
        knopf.disabled = false;
        meldung('Das hat nicht geklappt', antwort.error || 'Bitte gleich nochmals versuchen.', 'kreuz');
        return;
    }
    location.href = adresse;
};

const inhalt = (stand, karte) => {
    const a = abrechnungAnsicht(stand, rueckkehrAus(location.search));
    // Den Gruss nach Stripe (?abrechnung=danke) nur einmal zeigen: aus der Adresse nehmen,
    // sonst stünde er nach jedem Neuladen wieder da (auch nach einer Kündigung)
    if (rueckkehrAus(location.search)) {
        const adresse = new URL(location.href);
        adresse.searchParams.delete('abrechnung');
        history.replaceState(history.state, '', adresse.pathname + adresse.search + adresse.hash);
    }
    if (!a.eingerichtet) {
        return [
            h('h3', {}, 'Abrechnung'),
            h('span', { class: 'leise' }, 'Die Abrechnung ist auf diesem Server noch nicht eingerichtet.')
        ];
    }

    // Kaufen geht seit Plan "T" über die Stufen im Reiter «Auslastung»
    const kaufKnopf = h('a', { class: 'bp-btn bp-btn-p', id: 'abo-starten', href: '#/auslastung' }, 'Stufe wählen');
    const portalKnopf = h(
        'button',
        {
            class: 'bp-btn bp-btn-o',
            id: 'abo-portal',
            type: 'button',
            onclick: () => zuStripe(portalKnopf, '/api/billing/portal')
        },
        'Rechnungen und Karte verwalten'
    );

    return [
        h('h3', {}, 'Abrechnung'),
        a.testmodus
            ? h(
                  'div',
                  { class: 'bp-hinweis bp-h-info', id: 'abo-testmodus' },
                  'Testmodus: Hier fliesst kein echtes Geld. Zum Ausprobieren die Testkarte 4242 4242 4242 4242 benutzen.'
              )
            : null,
        a.hinweis ? h('div', { class: 'bp-hinweis bp-h-' + a.hinweis[0], id: 'abo-hinweis' }, a.hinweis[1]) : null,
        h(
            'div',
            { class: 'zeilen' },
            a.zeilen.map(([name, wert]) =>
                h('div', { class: 'kennzahl' }, h('span', {}, name), h('span', { class: 'leise' }, wert))
            )
        ),
        h(
            'span',
            { class: 'leise' },
            'Bauen, testen und veröffentlichen sind gratis. Bezahlt wird nach Verbrauch des ganzen Kontos – wie viel, zeigt der Reiter «Auslastung».'
        ),
        a.kaufen || a.portal
            ? h('div', { class: 'knopf-reihe' }, a.kaufen ? kaufKnopf : null, a.portal ? portalKnopf : null)
            : null
    ];
};

// Die Karte: zuerst ein Platzhalter, dann der echte Stand
export const abrechnungKarte = () => {
    const karte = h('div', { class: 'bp-karte stapel', id: 'abrechnung' }, h('h3', {}, 'Abrechnung'), laedtBalken());
    api.get('/api/billing').then(antwort => {
        if (!antwort.ok) {
            karte.replaceChildren(
                h('h3', {}, 'Abrechnung'),
                h(
                    'span',
                    { class: 'leise' },
                    antwort.status === 403
                        ? 'Die Abrechnung gibt es nur mit Anmeldung.'
                        : 'Der Stand lässt sich gerade nicht laden.'
                )
            );
            return;
        }
        karte.replaceChildren(...inhalt(antwort.data.data, karte).filter(Boolean));
    });
    return karte;
};
