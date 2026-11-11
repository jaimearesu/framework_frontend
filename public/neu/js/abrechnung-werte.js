// Reine Funktionen für die Karte «Abrechnung» auf der Seite Konto (Plan "P", P2), ohne Browser.
// Geprüft in tests/neuAbrechnung.test.mjs.

export const WAEHRUNGEN = ['chf', 'eur', 'usd'];

// Wie der Stand des Abos auf Deutsch heisst
const STAENDE = {
    none: 'Kein Abo',
    active: 'Aktiv',
    past_due: 'Zahlung offen',
    paused: 'Pausiert',
    canceled: 'Gekündigt'
};

// Mit diesen Ständen läuft noch ein Abo: dann nicht nochmals kaufen, sondern im Portal verwalten
const LAUFEND = ['active', 'past_due', 'paused'];

const datum = wert => {
    const ms = Date.parse(wert);
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('de-CH') : null;
};

const mehrzahl = (n, eins, viele) => n + ' ' + (n === 1 ? eins : viele);

/**
 * Was die Karte zeigt, aus der Antwort von GET /api/billing.
 * rueckkehr: «danke» oder «abgebrochen» aus der Adresse (nach Stripe Checkout), sonst null.
 */
export const abrechnungAnsicht = (stand, rueckkehr = null) => {
    const status = stand.status || 'none';
    const laeuft = LAUFEND.includes(status);
    const zeilen = [
        ['Stand', stand.freeLive ? 'Gratis live' : STAENDE[status] || status],
        ['Live-Websites', mehrzahl(stand.liveSites || 0, 'Website', 'Websites')]
    ];
    if (stand.currency) zeilen.push(['Währung', stand.currency.toUpperCase()]);
    if (stand.agency) zeilen.push(['Preis', 'Agentur']);
    if (laeuft && datum(stand.currentPeriodEnd)) zeilen.push(['Bezahlt bis', datum(stand.currentPeriodEnd)]);
    // Im Kundenportal gekündigt: läuft bis zum Ende des bezahlten Monats (P4, Migration 041)
    const endetAm = laeuft ? datum(stand.cancelAt) : null;
    if (endetAm) zeilen.push(['Gekündigt auf', endetAm]);
    if (status === 'past_due' && datum(stand.graceUntil)) zeilen.push(['Frist bis', datum(stand.graceUntil)]);

    // Ein Satz oben in der Karte: was gerade los ist
    let hinweis = null;
    if (rueckkehr === 'danke' && !laeuft) {
        hinweis = ['info', 'Danke! Stripe bestätigt die Zahlung gleich. Lade die Seite in einer Minute neu.'];
    } else if (rueckkehr === 'danke') {
        hinweis = ['ok', 'Danke, dein Abo ist aktiv.'];
    } else if (rueckkehr === 'abgebrochen') {
        hinweis = ['info', 'Abgebrochen, es wurde nichts bezahlt.'];
    } else if (endetAm) {
        hinweis = [
            'info',
            'Dein Abo ist gekündigt und läuft bis ' +
                endetAm +
                '. Danach kannst du keine neuen Websites mehr veröffentlichen. Zurücknehmen geht im Kundenportal.'
        ];
    } else if (status === 'past_due') {
        hinweis = ['warn', 'Die letzte Zahlung hat nicht geklappt. Bitte die Karte im Kundenportal prüfen.'];
    } else if (status === 'paused') {
        hinweis = ['gefahr', 'Deine Websites sind pausiert. Nach dem Bezahlen ist sofort alles wieder da.'];
    }

    return {
        zeilen,
        hinweis,
        testmodus: stand.stripeMode === 'test',
        eingerichtet: stand.stripeEnabled === true,
        // «Abo starten» nur ohne laufendes Abo und ohne «gratis live»
        kaufen: stand.stripeEnabled === true && !laeuft && !stand.freeLive,
        // Die Währung wählt man nur beim ersten Mal, danach bleibt sie fest
        waehrungWaehlen: !stand.currency,
        waehrung: stand.currency || 'chf',
        portal: stand.stripeEnabled === true && stand.hasCustomer === true
    };
};

// Aus der Adresse nach der Rückkehr von Stripe: ?abrechnung=danke|abgebrochen
export const rueckkehrAus = suche => {
    const wert = new URLSearchParams(suche || '').get('abrechnung');
    return wert === 'danke' || wert === 'abgebrochen' ? wert : null;
};

// Nur zu Stripe weiterleiten, nie an eine fremde Adresse (falls je etwas anderes zurückkäme)
export const stripeAdresseOk = adresse => {
    try {
        const u = new URL(adresse);
        return u.protocol === 'https:' && (u.hostname === 'checkout.stripe.com' || u.hostname === 'billing.stripe.com');
    } catch {
        return false;
    }
};
