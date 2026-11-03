// js/core/testPersons.js
// ---------------------------------------------------------------------
// TESTPERSONEN – reine Hilfsfunktionen für die Karte auf der Agenten-Seite
// (Plan "K", K5b, Entscheid T8). Automatisch getestet in tests/testPersons.test.mjs.
//
// Eine Testperson ist ein erfundener Benutzer ohne Anmeldung: Ein Agent (oder du)
// gibt ihr genau die Rechte z.B. eines Verkäufers und testet "als" sie. Das Backend
// räumt sie 30 Tage nach dem letzten Test selbst weg (T5).
// ---------------------------------------------------------------------

export const MAX_NAME = 60;
export const UNUSED_DAYS = 30; // gleich wie SYSTEM.testPersons.unusedDays im Backend

// Name prüfen wie das Backend: 1–60 Zeichen, Steuerzeichen weg -> { name } | { error }
export const checkTestPersonName = raw => {
    // eslint-disable-next-line no-control-regex
    const name = String(raw ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim();
    if (!name) return { error: 'Gib der Testperson einen Namen, z.B. „Test Verkäufer“.' };
    if (name.length > MAX_NAME) return { error: `Der Name darf höchstens ${MAX_NAME} Zeichen lang sein.` };
    return { name };
};

// Was darf sie? "black + red in mein-crm, black in einer anderen Familie" bzw. "noch keine Rechte"
export const rightsText = person => {
    const rights = Array.isArray(person?.rights) ? person.rights : [];
    if (!rights.length) return 'noch keine Rechte – gib ihr welche im Reiter „Rechte“ eines Objekts';
    return rights
        .map(r => `${(r.roles || []).join(' + ')} in ${r.domain ? r.domain : 'einer Familie, die du nicht siehst'}`)
        .join(', ');
};

// Wann wird sie automatisch gelöscht? (30 Tage nach dem letzten Test) -> Date | null
export const deletedAt = person => {
    const last = new Date(person?.lastUsedAt);
    if (Number.isNaN(last.getTime())) return null;
    return new Date(last.getTime() + UNUSED_DAYS * 24 * 60 * 60 * 1000);
};
