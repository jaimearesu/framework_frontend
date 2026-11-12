// Öffentliche Profilseite vindelis.com/@name (Plan "N", Stufe 2, 12.11.2026):
// reine Funktionen ohne Browser, geprüft in tests/neuProfilSeite.test.mjs.

// Gleiche Regel wie für @namen (src/utils/handle.js im Backend)
const NAME = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// "/@Kirk" oder "/@kirk/" -> "kirk"; alles andere -> null
export const handleAusPfad = pfad => {
    const m = /^\/@([^/]+)\/?$/.exec(String(pfad || ''));
    if (!m) return null;
    let name;
    try {
        name = decodeURIComponent(m[1]).toLowerCase();
    } catch {
        return null;
    }
    return NAME.test(name) ? name : null;
};

// Die Adresse der eigenen Profilseite (Cockpit läuft auf derselben Adresse)
export const seitenAdresse = (origin, handle) => (handle ? String(origin).replace(/\/$/, '') + '/@' + handle : null);

// Titel im Browser-Tab
export const seitenTitel = profil =>
    profil
        ? (profil.displayName ? profil.displayName + ' (@' + profil.handle + ')' : '@' + profil.handle) + ' · vindelis'
        : 'Profil nicht gefunden · vindelis';

// Adresse ohne https:// zum Anzeigen
export const adresseKurz = adresse => String(adresse || '').replace(/^https?:\/\//, '');

/**
 * Welche Websites kann ich auf meine Profilseite setzen?
 * websites = Antwort von GET /api/websites, gewaehlt = UUIDs aus GET /api/profil/websites
 * -> [{ uuid, name, gewaehlt, waehlbar, grund }]: nur echte Websites, die ich verwalte.
 *    Nicht öffentliche kann man nicht wählen (Grund steht dabei); gewählte zuerst in ihrer Reihenfolge.
 */
export const auswahlListe = (websites, gewaehlt = []) => {
    const meine = (Array.isArray(websites) ? websites : []).filter(
        w => (!w.art || w.art === 'website') && w.rights && w.rights.grant
    );
    const rang = uuid => {
        const i = gewaehlt.indexOf(uuid);
        return i === -1 ? Infinity : i;
    };
    return meine
        .map(w => ({
            uuid: w.uuid,
            name: w.name,
            gewaehlt: gewaehlt.includes(w.uuid),
            waehlbar: w.visibility === 'public',
            grund: w.visibility === 'public' ? null : 'nicht öffentlich'
        }))
        .sort((a, b) => rang(a.uuid) - rang(b.uuid) || a.name.localeCompare(b.name));
};

// Was in PUT /api/profil/websites geht: die gewählten, in der Reihenfolge der Liste
export const gewaehlteUuids = liste => liste.filter(w => w.gewaehlt && w.waehlbar).map(w => w.uuid);
