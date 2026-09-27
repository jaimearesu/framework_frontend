// js/core/format.js
// ---------------------------------------------------------------------
// Zahlen, Zeiten und IDs hübsch anzeigen. Alles reine Funktionen
// (ohne Bildschirm) – darum automatisch getestet (tests/format.test.mjs).
// ---------------------------------------------------------------------

// 12345 -> "12'345" (Schweizer Schreibweise)
export const formatNumber = n => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '–';
    const [int, dec] = String(Math.abs(n)).split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return (n < 0 ? '-' : '') + grouped + (dec ? '.' + dec : '');
};

// 42 -> "42 ms", 1000 -> "1 s", 1530 -> "1.53 s"
export const formatMs = ms => {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '–';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    // Number(…) entfernt überflüssige Nullen: 1.00 -> 1, 1.50 -> 1.5
    return `${Number((ms / 1000).toFixed(ms < 10000 ? 2 : 1))} s`;
};

// Lange UUID kürzen: "3e833995-3d48-81c1-…" -> "3e833995…"
export const shortUuid = uuid => {
    const s = String(uuid || '');
    return s.length > 12 ? s.slice(0, 8) + '…' : s;
};

// Datum als "27.09.2026, 14:05"
export const formatDate = value => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '–';
    const pad = x => String(x).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// "vor 5 Min." – relativ zu jetzt (now kann für Tests mitgegeben werden)
export const timeAgo = (value, now = Date.now()) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '–';
    const s = Math.round((now - d.getTime()) / 1000);
    if (s < 10) return 'gerade eben';
    if (s < 60) return `vor ${s} Sek.`;
    const m = Math.round(s / 60);
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60);
    if (h < 24) return `vor ${h} Std.`;
    const days = Math.round(h / 24);
    return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
};

// Objekt-Pfad als Text: ['shop','base','kunden'] -> "shop/base/kunden"
export const pathText = path => (Array.isArray(path) ? path.join('/') : String(path || ''));

// Ist das eine UUID? (für Eingabefelder "UUID oder Pfad")
export const isUuid = value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim());
