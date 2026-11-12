// Rechnet die Antworten des Backends in das um, was das neue Cockpit anzeigt.
// Hier stehen nur reine Funktionen ohne Browser, darum sind sie in tests/neuKonto.test.mjs geprüft.

const TAG_MS = 24 * 60 * 60 * 1000;

// Wie viele Tage es das Konto schon gibt. Der erste Tag zählt als Tag 1, ohne Datum gilt ebenfalls Tag 1.
export const tageSeit = (datum, jetzt = Date.now()) => {
    const start = Date.parse(datum);
    if (!Number.isFinite(start)) return 1;
    return Math.max(1, Math.floor((jetzt - start) / TAG_MS) + 1);
};

// Der Name für die Begrüssung: nur der Vorname. Eine E-Mail-Adresse oder «Gast» ist kein Name.
export const vornameAus = identitaet => {
    if (!identitaet || identitaet.kind !== 'user') return null;
    const name = String(identitaet.label || '').trim();
    if (!name || name.includes('@')) return null;
    return name.split(/\s+/)[0];
};

const ZAHL = new Intl.NumberFormat('de-CH');

// Bytes als gut lesbarer Text
// Mit 1024 gerechnet wie die Grenzen im Backend (1 GB = 1024 * 1024 * 1024 Bytes)
export const groesseText = bytes => {
    const wert = Math.max(0, Number(bytes) || 0);
    const KB = 1024;
    if (wert < KB * KB) return Math.round(wert / KB) + ' KB';
    if (wert < KB * KB * KB) return Math.round(wert / (KB * KB)) + ' MB';
    return ZAHL.format(Math.round((wert / (KB * KB * KB)) * 10) / 10) + ' GB';
};

// Eine Zeile «so viel von so viel». Fehlt eine Angabe, entfällt die Zeile.
const kontoZeile = (name, angabe, text) => {
    if (!angabe || typeof angabe.used !== 'number' || typeof angabe.limit !== 'number') return null;
    // Grenze 0 heisst: gibt es nur mit Konto (Gäste haben keinen Datei-Speicher). Das ist nicht «voll»
    if (angabe.limit <= 0) return { name, wert: 'Nur mit Konto', anteil: 0 };
    const anteil = Math.min(100, Math.round((angabe.used / angabe.limit) * 100));
    return { name, wert: text(angabe.used) + ' von ' + text(angabe.limit), anteil };
};

// Die Grenzen des Kontos aus «limits» von /api/me. Ohne Konto ist die Liste leer.
export const kontoZeilen = limits => {
    const verbrauch = limits?.usage;
    if (!verbrauch) return [];
    const zahl = n => ZAHL.format(n);
    return [
        kontoZeile('Speicher', verbrauch.storageBytes, groesseText),
        kontoZeile('Objekte', verbrauch.objects, zahl),
        kontoZeile('Datensätze', verbrauch.dataRows, zahl)
    ].filter(Boolean);
};

// ---------------------------------------------------------------------
// Konto als Kacheln (12.11.2026, Wunsch von Jaime «wie bei Stripe»): jede Kachel zeigt Titel und
// eine Zeile Stand, ein Klick öffnet den Bereich unter #/konto/<id>.
// ---------------------------------------------------------------------

// Die Bereiche. nurMitKonto = nur für angemeldete Menschen (Gäste haben kein Abo, keine Mails)
export const KONTO_BEREICHE = Object.freeze([
    // Plan "N": Name, Anzeigename und Bild
    { id: 'profil', titel: 'Profil', symbol: 'konto', text: 'Dein @name und dein Bild', nurMitKonto: true },
    {
        id: 'ausweis',
        titel: 'Deine vindelis-ID',
        symbol: 'konto',
        text: 'Zum Teilen, wenn dir jemand Zugriff geben will'
    },
    { id: 'grenzen', titel: 'Speicher und Grenzen', symbol: 'tabelle', text: 'Wie viel dein Konto belegt' },
    { id: 'abrechnung', titel: 'Abrechnung', symbol: 'datei', text: 'Abo, Rechnungen und Karte', nurMitKonto: true },
    {
        id: 'benachrichtigungen',
        titel: 'Benachrichtigungen',
        symbol: 'brief',
        text: 'Mails, wenn dein Konto voll wird',
        nurMitKonto: true
    },
    {
        id: 'anmeldung',
        titel: 'Anmeldung',
        symbol: 'aussen',
        text: 'Mit welcher Adresse du angemeldet bist',
        nurMitKonto: true
    }
]);

// Welche Bereiche es für diese Person gibt
export const kontoBereiche = ({ angemeldet, mitId, mitGrenzen }) =>
    KONTO_BEREICHE.filter(
        b => (angemeldet || !b.nurMitKonto) && (b.id !== 'ausweis' || mitId) && (b.id !== 'grenzen' || mitGrenzen)
    );

// Welcher Bereich ist offen? '#/konto/abrechnung' -> 'abrechnung', sonst null (= Übersicht)
export const bereichAusAdresse = (hash, bereiche = KONTO_BEREICHE) => {
    const teil =
        String(hash || '')
            .replace(/^#\/?/, '')
            .split(/[/?]/)[1] || null;
    return bereiche.some(b => b.id === teil) ? teil : null;
};

// Die ID kurz: die ersten 8 Zeichen
export const idKurz = id => (id ? String(id).slice(0, 8) + '…' : '');

// Stand der Benachrichtigungen in einer Zeile (Antwort von GET /api/billing/benachrichtigung)
export const benachrichtigungKurz = stand => {
    if (!stand) return null;
    if (!stand.mailEnabled) return 'Auf diesem Server aus';
    if (stand.pendingEmail) return 'Code an ' + stand.pendingEmail + ' geschickt';
    if (stand.email) return 'An ' + stand.email;
    return 'Noch keine Adresse';
};
