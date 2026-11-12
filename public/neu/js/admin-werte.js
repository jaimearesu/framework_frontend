// Admin-Bereich, Stufe 1 (12.11.2026): reine Funktionen ohne Browser,
// geprüft in tests/neuAdmin.test.mjs.
import { formatBytes } from '../../js/core/site.js';

// Die Reiter unter #/admin/<reiter> (der erste ist der Standard)
export const ADMIN_REITER = [
    ['uebersicht', 'Übersicht'],
    ['meldungen', 'Meldungen'],
    ['konten', 'Konten']
];

// "#/admin/konten" -> "konten"; unbekannt oder leer -> "uebersicht"
export const reiterAusAdresse = hash => {
    const teil = String(hash || '')
        .replace(/^#\/?/, '')
        .split('/')[1];
    return ADMIN_REITER.some(([id]) => id === teil) ? teil : ADMIN_REITER[0][0];
};

// Stufen, die man schenken kann (gleiche Liste wie das Backend, adminService.GIFT_TIERS)
export const GESCHENK_STUFEN = [
    ['klein', 'Klein'],
    ['mittel', 'Mittel'],
    ['gross', 'Gross'],
    ['plattform', 'Plattform']
];
const STUFEN_NAME = { gratis: 'Gratis', ...Object.fromEntries(GESCHENK_STUFEN) };
export const stufenName = id => (id === null ? 'Gratis live (ohne Grenzen)' : STUFEN_NAME[id] || String(id));

// Wie das Backend: 3–200 Zeichen, sonst die Meldung (leer = in Ordnung)
export const grundProblem = grund => {
    const n = [...String(grund || '').trim()].length;
    if (n < 3) return 'Bitte einen Grund angeben (mindestens 3 Zeichen).';
    if (n > 200) return 'Der Grund hat höchstens 200 Zeichen.';
    return '';
};

// Tage fürs Geschenk: leer = ohne Ende (null), sonst 1–3650; ungültig -> undefined
export const tageAusText = text => {
    const t = String(text || '').trim();
    if (!t) return null;
    if (!/^\d{1,4}$/.test(t)) return undefined;
    const n = Number(t);
    return n >= 1 && n <= 3650 ? n : undefined;
};

// 1234567 -> "1'234'567" (Schweizer Schreibweise)
export const zahlText = n => (n === null || n === undefined ? '–' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'"));

// { chf: 24, eur: 5 } -> "24 CHF · 5 EUR"; leer -> "0"
export const umsatzText = umsatz => {
    const teile = Object.entries(umsatz || {})
        .filter(([, n]) => n > 0)
        .map(([w, n]) => zahlText(Math.round(n * 100) / 100) + ' ' + w.toUpperCase());
    return teile.length ? teile.join(' · ') : '0';
};

// Die Kacheln der Übersicht: [titel, wert, unterzeile?]
export const kennzahlen = d => [
    ['Konten', zahlText(d.accounts), '+' + zahlText(d.new7) + ' in 7 Tagen, +' + zahlText(d.new30) + ' in 30'],
    ['Aktiv (30 Tage)', zahlText(d.active30), 'mit einer Aktion im Protokoll'],
    ['Websites', zahlText(d.sites), zahlText(d.publicSites) + ' öffentlich'],
    ['Im Feed', zahlText(d.shared), d.hidden ? zahlText(d.hidden) + ' herausgenommen' : 'nichts herausgenommen'],
    ['Offene Meldungen', zahlText(d.openReports), null],
    ['Agenten', zahlText(d.agents), 'mit gültigem Schlüssel'],
    ['Umsatz pro Monat', umsatzText(d.revenuePerMonth), 'Listenpreis der laufenden Abos'],
    ['Speicher belegt', formatBytes(d.storageBytes || 0), 'Dateien und Sicherungen'],
    ['Gratis live', zahlText(d.freeLive), zahlText(d.gifts) + ' mit geschenkter Stufe'],
    ['Gäste', zahlText(d.guests), 'leben 24 Stunden']
];

// Abo-Zeile eines Kontos in Worten
export const aboText = b => {
    if (!b) return '';
    if (b.freeLive) return 'Gratis live (von Hand, ohne Grenzen)';
    const teile = ['Gilt: ' + stufenName(b.currentTier)];
    if (b.status && b.status !== 'none') teile.push('Abo ' + stufenName(b.tier) + ' (' + b.status + ')');
    if (b.giftActive) {
        teile.push(
            'geschenkt: ' +
                stufenName(b.giftTier) +
                (b.giftUntil ? ' bis ' + new Date(b.giftUntil).toLocaleDateString('de-CH') : ' ohne Ende')
        );
    }
    if (b.cancelAt) teile.push('gekündigt auf ' + new Date(b.cancelAt).toLocaleDateString('de-CH'));
    return teile.join(' · ');
};

// "1'234 von 5'000" bzw. Bytes; ohne Grenze "1'234 (ohne Grenze)"
export const verbrauchText = (key, used, limit) => {
    const f = key === 'storageBytes' ? n => formatBytes(n || 0) : zahlText;
    return limit === null || limit === undefined ? f(used) + ' (ohne Grenze)' : f(used) + ' von ' + f(limit);
};
export const VERBRAUCH_NAMEN = [
    ['runs', 'Ausführungen diesen Monat'],
    ['dataRows', 'Datensätze'],
    ['storageBytes', 'Speicher'],
    ['customDomains', 'Eigene Domains']
];
