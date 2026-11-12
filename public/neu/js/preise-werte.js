// Preisliste (12.11.2026): was auf den Stufen-Karten und in der Vergleichs-Tabelle steht –
// im Cockpit (Reiter «Auslastung») und auf der Startseite, Deutsch und Englisch.
// Reine Funktionen ohne Browser, geprüft in tests/neuPreise.test.mjs.
// Die Zahlen kommen immer vom Backend (GET /api/billing/stufen bzw. /usage), nie von hier.

// Diese Stufe wird hervorgehoben (die meisten Vereine und kleinen Firmen passen hinein)
export const EMPFOHLEN = 'mittel';

const MB = 1024 * 1024;
const GB = 1024 * MB;

// 12'345 (Deutsch, wie in der Schweiz) bzw. 12,345 (Englisch); ab 1 Mio. kurz: «2 Mio.» / «2M»
export const zahlKurz = (n, sprache = 'de') => {
    if (!Number.isFinite(n)) return '–';
    if (n >= 1000000 && n % 100000 === 0) {
        const mio = (n / 1000000).toString();
        return sprache === 'en' ? mio + 'M' : mio + ' Mio.';
    }
    return Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, sprache === 'en' ? ',' : "'");
};

// 500 MB, 5 GB (mit 1024 gerechnet wie das Backend)
export const groesse = n => {
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    if (n >= GB) return Math.round((n / GB) * 10) / 10 + ' GB';
    return Math.round((n / MB) * 10) / 10 + ' MB';
};

// Preis in Rappen -> { betrag: '19.–', einheit: 'CHF / Monat' } für die grosse Zahl auf der Karte
export const preisTeile = (rappen, sprache = 'de', waehrung = 'chf') => {
    const t = TEXTE[sprache];
    const betrag = rappen % 100 === 0 ? rappen / 100 + '.–' : (rappen / 100).toFixed(2);
    return {
        betrag: rappen === 0 ? '0.–' : betrag,
        einheit: rappen === 0 ? t.fuerImmer : waehrung.toUpperCase() + ' ' + t.proMonat
    };
};

export const TEXTE = {
    de: {
        proMonat: '/ Monat',
        fuerImmer: 'für immer gratis',
        empfohlen: 'Empfohlen',
        kurz: {
            gratis: 'Zum Ausprobieren und für kleine Projekte.',
            klein: 'Für die erste eigene Website mit eigener Domain.',
            mittel: 'Für Vereine, Läden und kleine Firmen.',
            gross: 'Für mehrere Websites mit vielen Besuchern.',
            plattform: 'Für Agenturen und alles, was gross wird.'
        },
        immer: 'In jeder Stufe dabei: bauen mit deiner KI, testen, veröffentlichen, Sicherungen, Login für Besucher und Live-Verbindungen.',
        vergleichen: 'Alle Grenzen im Vergleich',
        alleZeigen: n => 'Alle ' + n + ' Grenzen zeigen',
        weniger: 'Weniger zeigen',
        grenze: 'Grenze',
        unbegrenzt: 'unbegrenzt',
        keine: '–',
        zeilen: {
            runs: n => n + ' Ausführungen / Monat',
            dataRows: n => n + ' Datensätze',
            storageBytes: n => n + ' für Dateien',
            customDomains: n =>
                n === null ? 'Eigene Domains unbegrenzt' : n === 0 ? 'Keine eigene Domain' : n + ' eigene Domains',
            siteBytes: n => 'Websites bis ' + n,
            objects: n => n + ' Objekte'
        },
        matrix: {
            price: 'Preis pro Monat',
            runs: 'Ausführungen pro Monat',
            dataRows: 'Datensätze',
            storageBytes: 'Speicher für Dateien',
            customDomains: 'Eigene Domains',
            siteBytes: 'Grösse pro Website',
            siteFiles: 'Dateien pro Website',
            siteParts: 'Teile pro Website',
            objects: 'Objekte im Konto',
            uploadLinks: 'Offene Upload-Adressen',
            liveConnections: 'Live-Verbindungen gleichzeitig',
            openJobs: 'Offene Aufträge',
            vectorTokens: 'Suche nach Bedeutung (Tokens / Monat)'
        }
    },
    en: {
        proMonat: '/ month',
        fuerImmer: 'free forever',
        empfohlen: 'Recommended',
        kurz: {
            gratis: 'To try things out and for small projects.',
            klein: 'For your first website with your own domain.',
            mittel: 'For clubs, shops and small companies.',
            gross: 'For several websites with many visitors.',
            plattform: 'For agencies and everything that grows big.'
        },
        immer: 'Included in every tier: building with your AI, testing, publishing, backups, visitor login and live connections.',
        vergleichen: 'All limits compared',
        alleZeigen: n => 'Show all ' + n + ' limits',
        weniger: 'Show less',
        grenze: 'Limit',
        unbegrenzt: 'unlimited',
        keine: '–',
        zeilen: {
            runs: n => n + ' runs / month',
            dataRows: n => n + ' data records',
            storageBytes: n => n + ' for files',
            customDomains: n =>
                n === null ? 'Unlimited custom domains' : n === 0 ? 'No custom domain' : n + ' custom domains',
            siteBytes: n => 'Websites up to ' + n,
            objects: n => n + ' objects'
        },
        matrix: {
            price: 'Price per month',
            runs: 'Runs per month',
            dataRows: 'Data records',
            storageBytes: 'File storage',
            customDomains: 'Custom domains',
            siteBytes: 'Size per website',
            siteFiles: 'Files per website',
            siteParts: 'Parts per website',
            objects: 'Objects in the account',
            uploadLinks: 'Open upload links',
            liveConnections: 'Live connections at once',
            openJobs: 'Open jobs',
            vectorTokens: 'Search by meaning (tokens / month)'
        }
    }
};

// Die Namen der Stufen auf Englisch (die IDs bleiben gleich)
const NAMEN_EN = { gratis: 'Free', klein: 'Small', mittel: 'Medium', gross: 'Large', plattform: 'Platform' };
export const stufenName = (t, sprache = 'de') => (sprache === 'en' ? NAMEN_EN[t.id] || t.name : t.name);

// Ein Wert einer Grenze als Text (Speicher als MB/GB, Domains mit 0 = «–», null = unbegrenzt)
export const grenzeText = (key, wert, sprache = 'de') => {
    const t = TEXTE[sprache];
    if (wert === null || wert === undefined) return key === 'customDomains' ? t.unbegrenzt : t.keine;
    if (key === 'storageBytes' || key === 'siteBytes') return groesse(wert);
    if (key === 'customDomains' && wert === 0) return t.keine;
    return zahlKurz(wert, sprache);
};

// Die wichtigsten Zeilen für eine Karte (der Rest steht in der Tabelle)
const KARTEN_ZEILEN = ['runs', 'dataRows', 'storageBytes', 'customDomains', 'siteBytes', 'objects'];
export const kartenZeilen = (stufe, sprache = 'de') => {
    const z = TEXTE[sprache].zeilen;
    return KARTEN_ZEILEN.filter(k => stufe[k] !== undefined).map(k =>
        k === 'customDomains' ? z[k](stufe[k]) : z[k](grenzeText(k, stufe[k], sprache))
    );
};

// Eine Stufe für die Karte: Name, Preis (gross), Satz, Zeilen, ob empfohlen
export const stufenKarte = (stufe, sprache = 'de', waehrung = 'chf') => ({
    id: stufe.id,
    name: stufenName(stufe, sprache),
    preis: preisTeile(stufe.price, sprache, waehrung),
    kurz: TEXTE[sprache].kurz[stufe.id] || '',
    empfohlen: stufe.id === EMPFOHLEN,
    zeilen: kartenZeilen(stufe, sprache)
});

// Die Vergleichs-Tabelle: Kopf = Stufen, eine Zeile pro Grenze (nur Grenzen, die das Backend schickt)
const MATRIX_KEYS = [
    'price',
    'runs',
    'dataRows',
    'storageBytes',
    'customDomains',
    'siteBytes',
    'siteFiles',
    'siteParts',
    'objects',
    'uploadLinks',
    'liveConnections',
    'openJobs',
    'vectorTokens'
];
export const matrix = (stufen, sprache = 'de', waehrung = 'chf') => {
    const t = TEXTE[sprache];
    return {
        kopf: [t.grenze, ...stufen.map(s => stufenName(s, sprache))],
        empfohlen: stufen.findIndex(s => s.id === EMPFOHLEN),
        zeilen: MATRIX_KEYS.filter(k => k === 'price' || stufen.some(s => s[k] !== undefined)).map(k => [
            t.matrix[k],
            ...stufen.map(s =>
                k === 'price'
                    ? s.price === 0
                        ? '0.–'
                        : preisTeile(s.price, sprache, waehrung).betrag + ' ' + waehrung.toUpperCase()
                    : grenzeText(k, s[k], sprache)
            )
        ])
    };
};

// Antwort von GET /api/billing/stufen -> Liste der Stufen (oder null, wenn etwas fehlt)
export const stufenAusAntwort = antwort => {
    const liste = antwort && antwort.ok && antwort.data && antwort.data.data && antwort.data.data.tiers;
    return Array.isArray(liste) && liste.length > 0 ? liste : null;
};
