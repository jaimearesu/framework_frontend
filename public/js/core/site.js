// js/core/site.js
// ---------------------------------------------------------------------
// WEBSITES (Plan "Bauarbeiter + Bauplan-Format", Etappe 4) – reine Hilfen
//
// Jede Domain (Wurzel-Objekt) kann eine Website sein: <name>.at0mic.site
// (lokal <name>.site.localhost:3001). Online ist sie nur, wenn sie
// ÖFFENTLICH ist – der Bauarbeiter fragt das Backend immer als anonymer
// Besucher. Private Kinder fehlen auf der Website einfach.
//
// Alles hier ist reine Logik (ohne Bildschirm, ohne Backend) und darum
// automatisch getestet (tests/site.test.mjs).
// ---------------------------------------------------------------------
import { isRoot, descendantsOf, objectLabel } from './objects.js';

// Gleiche Regel wie im Backend (siteService.isSiteName)
const SITE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const RESERVED_SITE_NAMES = ['www', 'api', 'builder', 'admin', 'mail', 'cockpit', 'status'];

export const isSiteName = name =>
    typeof name === 'string' && SITE_NAME.test(name) && !RESERVED_SITE_NAMES.includes(name);

// Adresse der Website aus der Vorlage in /config.json, z.B. "https://{name}.at0mic.site"
export const siteUrl = (template, name) => (template && name ? String(template).replace('{name}', name) : null);

/**
 * Wie steht es um die Website dieses Objekts?
 * @param {object}   o        das gewählte Objekt
 * @param {object[]} objects  alle Objekte, die ich sehen darf
 * @returns {{ kind: 'child', family } | { kind: 'badName', name }
 *         | { kind: 'site', name, online, hidden: object[] }}
 *   online = die Domain ist öffentlich
 *   hidden = Unter-Objekte, die NICHT öffentlich sind (fehlen auf der Website)
 */
export const siteStatus = (o, objects) => {
    if (!isRoot(o)) return { kind: 'child', family: o.domain_ref };
    if (!isSiteName(o.domain)) return { kind: 'badName', name: o.domain };
    return {
        kind: 'site',
        name: o.domain,
        online: o.visibility === 'public',
        hidden: descendantsOf(o, objects).filter(d => d.visibility !== 'public')
    };
};

// Namen der versteckten Teile, kurz (für einen Hinweis)
export const hiddenNames = (hidden, max = 5) => {
    const names = hidden.map(objectLabel);
    return names.length > max
        ? `${names.slice(0, max).join(', ')} und ${names.length - max} weitere`
        : names.join(', ');
};

// Dateien eines Bauplans als Liste: [{ path, bytes }], index.html zuerst, sonst alphabetisch
export const bauplanFiles = bauplan => {
    const files = (bauplan && bauplan.files) || {};
    const size = text => new TextEncoder().encode(String(text)).length;
    return Object.keys(files)
        .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))
        .map(path => ({ path, bytes: size(files[path]) }));
};

// Adresse einer Datei auf der Website (".md" und ".html" ohne Endung, index -> Ordner)
export const fileUrl = (base, path) => {
    const p = path.replace(/(^|\/)index\.(html|md)$/, '$1').replace(/\.(html|md)$/, '');
    return `${base}/${p}`;
};

export const formatBytes = n =>
    n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// ---------------------------------------------------------------------
// WEBHOOKS (Plan "SSF-Ausbau", Etappe B2): was heisst der Status eines
// Aufrufs für Menschen? (Antwort des Backends, siehe webhook_calls)
// ---------------------------------------------------------------------
export const webhookStatusText = status => {
    if (status === 200) return { tone: 'ok', text: 'OK' };
    if (status === 422) return { tone: 'error', text: 'Fehler in der SSF' };
    if (status === 429) return { tone: 'warn', text: 'gebremst (zu viele Aufrufe)' };
    if (status === 503) return { tone: 'warn', text: 'Server ausgelastet' };
    if (status === 404) return { tone: 'error', text: 'nicht gefunden' };
    if (status === 400) return { tone: 'error', text: 'ungültiger Aufruf' };
    return { tone: 'error', text: `Status ${status}` };
};
