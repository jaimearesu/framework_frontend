// js/core/access.js
// ---------------------------------------------------------------------
// ZUGRIFF: WER DARF DIESES OBJEKT SEHEN UND ÄNDERN?
// (Plan "Login auf Websites", Etappe 4+5 – Rollen pro Teil)
//
// Reine Hilfsfunktionen für den Reiter "Zugriff" (pages/objects.js), getestet
// in tests/access.test.mjs. Sie bauen die Antwort von
//   GET /api/objects/<uuid>/members
//     -> { triplet, members: [...], locks: [{ object, own, triplet, members }] }
// in das um, was die Seite zeigt:
//
//   website   Rechte auf die GANZE Website (Familien-Schloss) – ohne die
//             Teile der Website selbst (deren Eintrag ist ihr Schutz, kein Recht)
//   own       Rechte NUR auf diesen Teil (sein Zusatz-Schloss) oder null
//   inherited Zusatz-Schlösser von Eltern-Teilen (gelten hier mit)
// ---------------------------------------------------------------------

export const SCOPES = {
    familie: { label: 'Ganze Website', text: 'Das Recht gilt für alle Teile der Website.' },
    teil: {
        label: 'Nur dieser Teil',
        text: 'Das Recht gilt nur für diesen Teil und seine Unter-Teile (auch spätere). Nur black und red.'
    }
};

const ROLE_ORDER = ['black', 'red', 'blue'];

// Welche Rollen gibt es bei welchem Bereich? (blue nur für die ganze Website)
export const rolesForScope = scope => (scope === 'teil' ? ['black', 'red'] : [...ROLE_ORDER]);

// "Nur dieser Teil" geht nur bei Kindern, nicht bei der Website selbst
export const canUsePartScope = o => Boolean(o && !o.domain && o.domain_ref);

// Rollen in fester Reihenfolge
const sortRoles = roles => ROLE_ORDER.filter(r => (roles || []).includes(r));

// Nur echte Mitglieder (keine Schutz-Einträge der Teile selbst)
const realMembers = list => (list || []).filter(m => !m.family).map(m => ({ ...m, roles: sortRoles(m.roles) }));

/**
 * Antwort von GET …/members -> was die Seite zeigt.
 * @returns {{ website: Array, parts: number, own: { triplet, members } | null,
 *             inherited: Array<{ object, triplet, members }> }}
 */
export const accessOverview = data => {
    const members = (data && data.members) || [];
    const locks = (data && data.locks) || [];
    const ownLock = locks.find(l => l.own);
    return {
        website: realMembers(members),
        parts: members.filter(m => m.family).length,
        own: ownLock ? { triplet: ownLock.triplet, members: realMembers(ownLock.members) } : null,
        inherited: locks
            .filter(l => !l.own)
            .map(l => ({ object: l.object, triplet: l.triplet, members: realMembers(l.members) }))
    };
};

/**
 * Wie heisst ein Mitglied? Menschen ohne Namen (Datenschutz) – nur "Mensch" + kurze ID.
 * @param {object} m  Mitglied aus /members
 * @param {function} shortUuid  z.B. aus core/format.js
 */
export const memberLabel = (m, shortUuid = id => String(id).slice(0, 8)) => {
    if (m.kind === 'mensch') return `Mensch ${shortUuid(m.uuid)}`;
    if (m.identifier) return `${m.name}/${m.identifier}`;
    return m.name || shortUuid(m.uuid);
};

// Adresse zum Entziehen (scope 'teil' -> ?scope=teil)
export const revokePath = (targetUuid, memberUuid, role, scope = 'familie') =>
    `/api/objects/${encodeURIComponent(targetUuid)}/members/${encodeURIComponent(memberUuid)}/${encodeURIComponent(role)}` +
    (scope === 'teil' ? '?scope=teil' : '');
