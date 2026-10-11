// site/host.js
// ---------------------------------------------------------------------
// ADRESSE -> NAME DER WEBSITE (Plan "Bauarbeiter + Bauplan-Format", Etappe 3)
//
//   shop.at0mic.site        -> Website "shop"  (= Domain "shop" in at0mic)
//   at0mic.site             -> gehört zu den Websites, aber ohne Namen (-> 404)
//   a.b.at0mic.site         -> gehört dazu, aber ungültig (-> 404)
//   at0mic.ch               -> gehört NICHT dazu (-> Cockpit)
//
// Lokal heisst die Website-Domain "site.localhost": Browser schicken jede
// Adresse, die auf ".localhost" endet, an den eigenen PC. So geht
// http://shop.site.localhost:3001 ohne DNS-Eintrag.
//
// WICHTIG: Alles unter der Website-Domain wird IMMER vom Bauarbeiter
// beantwortet, nie vom Cockpit – sonst liefe das Cockpit (mit Login) auf
// der Domain, auf der fremder Kunden-Code läuft.
// ---------------------------------------------------------------------

// Gleiche Regel wie im Backend (siteService.isSiteName): nur Kleinbuchstaben,
// Ziffern und "-" (nicht am Rand), max. 63 Zeichen
const SITE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * @param {string} hostHeader  der Host-Header, z.B. "shop.at0mic.site" oder "shop.site.localhost:3001"
 * @param {string} siteDomain  z.B. "at0mic.site"
 * @returns {{ isSiteHost: boolean, name: string|null }}
 */
const siteNameFromHost = (hostHeader, siteDomain) => {
    let host = String(hostHeader || '')
        .trim()
        .toLowerCase();
    if (host.startsWith('[')) return { isSiteHost: false, name: null }; // IPv6-Adresse, nie eine Website
    host = host.replace(/:\d+$/, '').replace(/\.$/, ''); // Port und Punkt am Ende weg

    const domain = String(siteDomain || '').toLowerCase();
    if (!domain) return { isSiteHost: false, name: null };
    if (host === domain) return { isSiteHost: true, name: null };
    if (!host.endsWith('.' + domain)) return { isSiteHost: false, name: null };

    const label = host.slice(0, -(domain.length + 1));
    // Mehrere Ebenen (a.b.at0mic.site) oder ungültige Zeichen: dazugehörig, aber keine Website
    return { isSiteHost: true, name: SITE_NAME.test(label) ? label : null };
};

module.exports = { siteNameFromHost };
