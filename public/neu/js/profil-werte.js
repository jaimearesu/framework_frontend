// Namen und Profilbilder (Plan "N", Stufe 1, 12.11.2026): reine Funktionen ohne Browser,
// geprüft in tests/neuProfil.test.mjs. Die Regeln für @namen stehen auch im Backend
// (src/utils/handle.js) – dort wird entschieden, hier nur früh und freundlich gewarnt.

// Gleiche Regel wie im Backend: 3–30 Zeichen a–z, 0–9, Bindestrich (nicht am Anfang/Ende)
const FORMAT = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "@Anna-B " -> "anna-b"
export const nameNormal = text =>
    String(text || '')
        .trim()
        .replace(/^@/, '')
        .trim()
        .toLowerCase();

// Was sagt das Feld, während man tippt? Nur die Form – ob frei, sagt das Backend
export const nameFormFehler = text => {
    const name = nameNormal(text);
    if (!name) return '';
    if (name.length < 3) return 'Mindestens 3 Zeichen.';
    if (name.length > 30) return 'Höchstens 30 Zeichen.';
    if (!FORMAT.test(name)) return 'Nur a–z, 0–9 und Bindestrich (nicht am Anfang oder Ende). Keine Umlaute.';
    return '';
};

// Zwei Buchstaben für den runden Platzhalter, wenn es kein Bild gibt
export const initialen = ({ displayName, handle, vorname } = {}) => {
    const quelle = String(displayName || vorname || handle || '').trim();
    if (!quelle) return '?';
    const woerter = quelle.split(/[ -]+/).filter(Boolean);
    const buchstaben = woerter.length > 1 ? woerter[0][0] + woerter[woerter.length - 1][0] : [...woerter[0]][0];
    return buchstaben.toUpperCase();
};

// Die grosse Zeile im Profil-Kopf: Anzeigename, sonst Vorname, sonst @name
export const profilTitel = (profil, vorname) => {
    if (profil?.displayName) return profil.displayName;
    if (vorname) return vorname;
    if (profil?.handle) return '@' + profil.handle;
    return 'Dein Profil';
};

// Stand-Zeile der Kachel «Profil»
export const profilKurz = profil => (profil?.handle ? '@' + profil.handle : 'Noch kein Name');

// Ab wann darf man den Namen wieder wechseln? Text oder nichts
export const wechselText = (profil, jetzt = Date.now()) => {
    const bis = Date.parse(profil?.handleChangeableAt || '');
    if (!Number.isFinite(bis) || bis <= jetzt) return '';
    const tag = new Date(bis).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' });
    return 'Den Namen kannst du wieder ab ' + tag + ' wechseln.';
};

// Beim ersten Mal nach einem Namen fragen? Nur angemeldete Menschen ohne Namen, nur einmal
export const sollNameFragen = ({ art, profil, gefragt }) =>
    art === 'user' && Boolean(profil) && !profil.handle && !gefragt;

// Wer bekommt Zugriff? "@anna" oder eine vindelis-ID -> { art: 'name' | 'id', wert } oder null
export const empfaengerAus = text => {
    const roh = String(text || '').trim();
    if (UUID.test(roh)) return { art: 'id', wert: roh.toLowerCase() };
    const name = nameNormal(roh);
    if (roh && !nameFormFehler(name) && name) return { art: 'name', wert: name };
    return null;
};

// So heisst ein Mensch in Listen: Anzeigename, sonst @name, sonst null (dann bleibt die gekürzte ID)
export const menschName = mitglied => {
    if (!mitglied || mitglied.kind !== 'mensch') return null;
    if (mitglied.displayName) return mitglied.displayName;
    if (mitglied.handle) return '@' + mitglied.handle;
    return null;
};
