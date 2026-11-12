// Feed «Entdecken» (Plan "N", Stufe 4, 12.11.2026):
// reine Funktionen ohne Browser, geprüft in tests/neuEntdecken.test.mjs.

// Gründe zum Melden – gleiche Schlüssel wie im Backend (feedService.REPORT_REASONS, Migration 051)
export const GRUENDE = [
    ['spam', 'Spam oder Werbung'],
    ['illegal', 'Verboten oder gefährlich'],
    ['anstoessig', 'Anstössig oder verletzend'],
    ['falsch', 'Täuschend oder Betrug'],
    ['anderes', 'Etwas anderes']
];
export const NOTIZ_MAX = 500;

// Adresse einer Seite des Feeds beim Backend (limit + Merkpunkt zum Weiterblättern)
export const feedAdresse = (basis, { limit, nach } = {}) => {
    const q = new URLSearchParams();
    if (limit) q.set('limit', String(limit));
    if (nach) q.set('nach', nach);
    const text = q.toString();
    return basis + '/api/netzwerk/entdecken' + (text ? '?' + text : '');
};

// Wer hat geteilt? "Captain James T. Kirk · @kirk" oder nur "@kirk"
export const vonText = by => {
    if (!by || !by.handle) return '';
    return by.displayName ? by.displayName + ' · @' + by.handle : '@' + by.handle;
};

// Link zur Profilseite – nur wenn die Person sie selbst eingeschaltet hat
export const profilLink = by => (by && by.handle && by.profilePublic ? '/@' + by.handle : null);

// Adresse ohne https:// zum Anzeigen
export const adresseKurz = adresse => String(adresse || '').replace(/^https?:\/\//, '');

// Was in POST …/melden geht. Leere Notiz = keine
export const meldenAuftrag = (grund, notiz) => {
    const n = String(notiz || '').trim();
    return n ? { grund, notiz: n } : { grund };
};

// Neue Einträge an die Liste hängen, ohne doppelte (falls inzwischen etwas dazukam)
export const anhaengen = (bisher, neu) => {
    const da = new Set(bisher.map(i => i.site));
    return [...bisher, ...neu.filter(i => !da.has(i.site))];
};
