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
// 'kunden' = CNAME-Ziel für eigene Domains (kunden.vindelis.site) – wie im Backend (siteService)
export const RESERVED_SITE_NAMES = ['www', 'api', 'builder', 'admin', 'mail', 'cockpit', 'status', 'kunden'];

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

// Bytes lesbar. Seit "Dateien mit R2" (D2) auch GB – für das Speicher-Kontingent (1 GB)
export const formatBytes = n =>
    n < 1024
        ? `${n} B`
        : n < 1024 * 1024
          ? `${(n / 1024).toFixed(1)} KB`
          : n < 1024 * 1024 * 1024
            ? `${(n / 1024 / 1024).toFixed(1)} MB`
            : `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;

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

// ---------------------------------------------------------------------
// EIGENE DOMAINS (Plan "SSF-Ausbau", Etappe D3) – Helfer für die Karte
// "Eigene Domain" im Reiter "Website". Die echte Prüfung macht das Backend;
// hier nur, was der Mensch beim Eintragen sofort sehen soll.
// ---------------------------------------------------------------------
export const customDomainStatusText = status => {
    if (status === 'active') return { tone: 'ok', text: 'aktiv' };
    if (status === 'pending') return { tone: 'warn', text: 'wartet auf DNS und Zertifikat' };
    if (status === 'failed') return { tone: 'error', text: 'gescheitert' };
    return { tone: 'neutral', text: String(status || '–') };
};

// Was trägt der Kunde bei seinem Anbieter als "Name" ein? Die meisten Anbieter wollen nur
// den vorderen Teil (www), manche den ganzen Namen – darum zeigen wir beides.
export const dnsNameHint = hostname => {
    const parts = String(hostname || '').split('.');
    return parts.length > 2 ? parts.slice(0, -2).join('.') : String(hostname || '');
};

// Schnelle Vor-Prüfung im Browser (gleiche Grundregeln wie das Backend) -> Fehlertext oder null
export const customDomainInputProblem = value => {
    const host = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
    if (!host) return 'Bitte eine Domain eingeben, z.B. www.meinladen.ch.';
    if (/[^a-z0-9.-]/.test(host)) return 'Nur Buchstaben a–z, Ziffern, „-“ und Punkte.';
    const parts = host.split('.');
    if (parts.length < 3) {
        return `Bitte eine Unterdomain wie www.${host}. Die nackte Domain leitest du bei deinem Anbieter auf www um.`;
    }
    if (['.vindelis.site', '.vindelis.com', '.at0mic.site', '.at0mic.ch'].some(end => host.endsWith(end)))
        return 'Adressen von vindelis kann man nicht verbinden.';
    return null;
};

// ---------------------------------------------------------------------
// SCREENSHOT (Plan "Screenshots in der Vorschau", S3) – reine Funktion, getestet
// Aus meta.screenshot eine Bild-Adresse machen – aber nur, wenn es wirklich ein
// JPEG/PNG in Base64 ist (das Bild kommt von Cloudflare, nie blind übernehmen).
// ---------------------------------------------------------------------
const SCREENSHOT_TYPES = ['image/jpeg', 'image/png'];
export const screenshotSource = shot => {
    if (!shot || !SCREENSHOT_TYPES.includes(shot.mimeType)) return null;
    if (typeof shot.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(shot.base64)) return null;
    return `data:${shot.mimeType};base64,${shot.base64}`;
};

// ---------------------------------------------------------------------
// LIVE-VERBINDUNGEN (Plan "W", W4b): Text für "Live gerade" im Reiter "Website"
// data = Antwort von GET /api/objects/:uuid/live -> { verbindungen, kanaele, stand }
// verbindungen null = unbekannt (der Bauarbeiter hat sich länger nicht gemeldet)
// ---------------------------------------------------------------------
// LIVE-REGELN LESBAR MACHEN (Härtungs-Runde, 28.10.2026)
// Die Regeln stehen in der DNA eines Objekts unter "live.kanaele" (Plan "F", F-3) –
// bisher sah der Besitzer sie nur als rohes JSON. Diese reine Funktion macht daraus
// eine Zeile pro Kanal in Alltagssprache. Standardwerte wie im Backend (liveRules.js).
// syntax: die DNA als Text oder Objekt -> [{ kanal, browser, wer, takt, felder, extras }]
export const liveRulesRows = syntax => {
    let dna = syntax;
    if (typeof syntax === 'string') {
        try {
            dna = JSON.parse(syntax);
        } catch {
            return [];
        }
    }
    const kanaele = dna && typeof dna === 'object' ? dna.live?.kanaele : null;
    if (!kanaele || typeof kanaele !== 'object') return [];
    return Object.entries(kanaele).map(([name, r]) => {
        const rule = r && typeof r === 'object' ? r : {};
        const extras = [];
        if (rule.presence) extras.push('Anwesenheit');
        if (rule.ticket) extras.push('nur mit Ticket');
        return {
            kanal: name.endsWith('*') ? `${name} (alle, die so beginnen)` : name,
            browser: rule.browser ? 'ja, direkt (flüchtig)' : 'nein, nur über die SSF',
            wer: rule.wer === 'angemeldet' ? 'nur Angemeldete' : 'alle',
            takt: rule.browser ? `${rule.proSekunde || 10}/s, max. ${rule.maxBytes || 512} Bytes` : '–',
            felder: Array.isArray(rule.felder) && rule.felder.length ? rule.felder.join(', ') : 'alle',
            extras: extras.join(', ') || '–'
        };
    });
};

export const liveCountText = data => {
    if (!data || data.verbindungen === null || data.verbindungen === undefined) {
        return 'unbekannt (der Bauarbeiter meldet sich alle 30 s)';
    }
    if (data.verbindungen === 0) return 'niemand verbunden';
    const wer = data.verbindungen === 1 ? '1 Verbindung' : `${data.verbindungen} Verbindungen`;
    const kanaele = data.kanaele === 1 ? '1 Kanal' : `${data.kanaele} Kanäle`;
    return `${wer} · ${kanaele}`;
};
