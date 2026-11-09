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
export const groesseText = bytes => {
    const wert = Math.max(0, Number(bytes) || 0);
    if (wert < 1000 * 1000) return Math.round(wert / 1000) + ' KB';
    if (wert < 1000 * 1000 * 1000) return Math.round(wert / (1000 * 1000)) + ' MB';
    return ZAHL.format(Math.round(wert / (1000 * 1000 * 100)) / 10) + ' GB';
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
