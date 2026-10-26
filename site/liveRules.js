// site/liveRules.js
// ---------------------------------------------------------------------
// WELCHE LIVE-REGEL GILT FÜR EINEN KANAL? (Plan "F", F-3b)
//
// Die Regeln stehen in der DNA des Objekts ("live.kanaele") – das Backend hat sie
// beim Speichern geprüft und mit Standardwerten ergänzt und schickt sie beim Zutritt
// mit. Hier nur noch: genauer Kanal-Name zuerst, sonst das längste Muster mit "*"
// ("board-*" gilt für "board-123"). Gleiche Regel wie im Backend (src/services/liveRules.js).
// Keine Regel = der Browser darf in diesem Kanal nichts senden (Entscheidung E1).
// ---------------------------------------------------------------------

/**
 * @param {object|null} live  { kanaele: { name: regel } } aus dem Zutritt
 * @param {string} kanal
 * @returns {object|null}
 */
const ruleFor = (live, kanal) => {
    const channels = live && live.kanaele;
    if (!channels || typeof channels !== 'object') return null;
    if (Object.prototype.hasOwnProperty.call(channels, kanal)) return channels[kanal];
    let best = null;
    let bestLength = -1;
    for (const [name, rule] of Object.entries(channels)) {
        if (!name.endsWith('*')) continue;
        const prefix = name.slice(0, -1);
        if (kanal.startsWith(prefix) && prefix.length > bestLength) {
            best = rule;
            bestLength = prefix.length;
        }
    }
    return best;
};

module.exports = { ruleFor };
