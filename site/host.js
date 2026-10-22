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

// ---------------------------------------------------------------------
// EIGENE DOMAINS (Plan "SSF-Ausbau", D2): Seit Kunden ihre eigene Domain
// (www.meinladen.ch) verbinden können, schickt Traefik ALLE fremden Namen
// hierher. Wir unterscheiden vier Fälle:
//
//   { kind: 'site', name }       shop.at0mic.site  -> Website "shop"
//   { kind: 'siteNoName' }       at0mic.site, a.b.at0mic.site -> 404 (wie bisher)
//   { kind: 'cockpit' }          at0mic.ch, localhost, IP-Adressen -> Cockpit
//   { kind: 'custom', hostname } alles andere -> vielleicht eine eigene Domain
//                                (der Bauarbeiter fragt das Backend)
//
// cockpitHosts: Namen, unter denen das COCKPIT läuft (z.B. at0mic.ch). Nur die –
// eine fremde Domain bekommt nie das Cockpit (mit Login) zu sehen.
// ---------------------------------------------------------------------
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const classifyHost = (hostHeader, siteDomain, cockpitHosts = []) => {
    const site = siteNameFromHost(hostHeader, siteDomain);
    if (site.isSiteHost) return site.name ? { kind: 'site', name: site.name } : { kind: 'siteNoName' };

    const raw = String(hostHeader || '')
        .trim()
        .toLowerCase();
    if (!raw || raw.startsWith('[')) return { kind: 'cockpit' }; // leer oder IPv6
    const host = raw.replace(/:\d+$/, '').replace(/\.$/, '');
    if (IPV4.test(host) || cockpitHosts.includes(host) || !host.includes('.')) return { kind: 'cockpit' };
    if (!HOSTNAME.test(host)) return { kind: 'siteNoName' }; // kaputter Name: neutrale 404, nie das Cockpit
    return { kind: 'custom', hostname: host };
};

module.exports = { siteNameFromHost, classifyHost };
