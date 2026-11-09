// Adressen aus der Zeit vor dem Umstellen (Plan U, U6): Einladungen, die Verbinden-Seite für KIs
// und Lesezeichen zeigen noch auf /#/objekte/… und Ähnliches. Hier steht, wohin sie jetzt führen.
// Geprüft in tests/neuUmstellen.test.mjs: Jede Seite des alten Cockpits muss hier vorkommen.

// Hier läuft das alte Cockpit weiter
export const ALTES_COCKPIT = '/alt/';

// Diese Seiten gibt es nur im alten Cockpit
export const NUR_ALT = ['code', 'ssf', 'daten', 'relationen', 'rechte', 'tresor', 'ki', 'systemcheck'];

// Antwort: { hash } = andere Seite im neuen Cockpit, { weg } = ins alte Cockpit,
// { objekt } = kommt darauf an, ob es eine Website ist, null = die Adresse stimmt schon
export const alteAdresse = hash => {
    const text = String(hash || '');
    const [seite, id] = text.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
    if (seite === 'agenten') return { hash: '#/helfer' };
    if (seite === 'objekte') return id ? { objekt: id } : { hash: '#/websites' };
    if (NUR_ALT.includes(seite)) return { weg: ALTES_COCKPIT + text };
    return null;
};
