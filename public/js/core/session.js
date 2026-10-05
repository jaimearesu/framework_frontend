// js/core/session.js
// ---------------------------------------------------------------------
// WER BIN ICH, UND LÄUFT DER SERVER?
//
// Fragt das (gerade gewählte) Backend zwei Dinge:
//   GET /api/health -> läuft der Server, geht die Datenbank, Test-Modus?
//   GET /api/me     -> eingeloggt (Auth0), Gast oder anonym?
//
// Das Ergebnis liegt in getSession() und wird als 'session' gemeldet,
// damit Topbar und Seiten sich aktualisieren.
// ---------------------------------------------------------------------
import { api } from './api.js';
import { emit } from './events.js';

let session = { loading: true };

// Aus der /api/me-Antwort eine einfache Beschreibung machen (reine Funktion, getestet)
//   kind: 'user' (eingeloggt) | 'guest' (Gast) | 'anon' (anonym) | 'offline'
export const describeIdentity = me => {
    if (!me) return { kind: 'offline', label: 'Nicht verbunden', id: null };
    if (me.isAuthenticated) {
        const u = me.user || {};
        return {
            kind: 'user',
            label: u.name || u.nickname || u.email || 'Eingeloggt',
            id: u.sub || null,
            email: u.email || null
        };
    }
    if (me.isGuest) return { kind: 'guest', label: 'Gast', id: me.user?.sub || null };
    return { kind: 'anon', label: 'Anonym', id: null };
};

// Hinweis für Gäste (reine Funktion, getestet): Ein Gast lebt 24 Stunden ab dem
// Anlegen. Danach löscht der Gäste-Aufräumer im Backend ihn MIT allem, was nur
// ihm gehört. Wer sich vorher einloggt, behält alles. Für alle anderen: null.
export const GUEST_HINT = {
    title: 'Du bist Gast.',
    text: ' Deine Objekte bleiben 24 Stunden ab dem ersten Erstellen – danach werden sie gelöscht, samt allem, was nur dir gehört. Logge dich ein, um sie zu behalten.'
};
export const guestHint = identity => (identity?.kind === 'guest' ? GUEST_HINT : null);

// ------------------------------------------------------------------
// KONTINGENTE (reine Funktion, getestet)
// /api/me liefert seit "Kontingente" Etappe 5 zusätzlich:
//   limits: {
//     profile: 'gast' | 'standard' | …,
//     rate:    { requests, writes, ssf }                 -> Bremse pro Minute
//     usage:   { objects: { used, limit },               -> Deckel (Verbrauch)
//                dataRows: { used, limit } } | null      (null = anonym, noch kein Konto)
//   }
// Daraus wird eine Beschreibung für die Anzeige. Ältere Backends ohne
// "limits" -> null (die Kachel wird dann einfach nicht gezeigt).
//   tone pro Zeile: 'ok' unter 80 %, 'warn' ab 80 %, 'error' bei 100 %
// ------------------------------------------------------------------
const PROFILE_LABELS = { gast: 'Gast', standard: 'Standard' };

const toneFor = pct => (pct >= 100 ? 'error' : pct >= 80 ? 'warn' : 'ok');

export const describeLimits = me => {
    const limits = me?.limits;
    if (!limits || typeof limits !== 'object') return null;

    const row = (label, value) => {
        if (!value || typeof value.used !== 'number' || typeof value.limit !== 'number') return null;
        const pct = value.limit > 0 ? Math.min(100, Math.round((value.used / value.limit) * 100)) : 100;
        return { label, used: value.used, limit: value.limit, pct, tone: toneFor(pct) };
    };
    const rows = limits.usage
        ? [row('Objekte', limits.usage.objects), row('Datensätze', limits.usage.dataRows)].filter(Boolean)
        : [];

    // Die "schlimmste" Zeile bestimmt die Farbe der ganzen Kachel
    const tone = rows.some(r => r.tone === 'error') ? 'error' : rows.some(r => r.tone === 'warn') ? 'warn' : 'ok';

    return {
        profile: limits.profile || null,
        profileLabel: PROFILE_LABELS[limits.profile] || limits.profile || 'unbekannt',
        rate: limits.rate || null,
        rows,
        tone
    };
};

export const refreshSession = async () => {
    const [health, me] = await Promise.all([api.get('/api/health'), api.get('/api/me')]);
    session = {
        loading: false,
        online: health.status !== 0,
        health: health.data && typeof health.data === 'object' ? health.data : null,
        healthMs: health.ms,
        // Ältere Backends kennen /api/health noch nicht -> 404, aber online
        healthMissing: health.status === 404,
        identity: describeIdentity(me.ok ? me.data : null),
        limits: describeLimits(me.ok ? me.data : null)
    };
    emit('session', session);
    return session;
};

export const getSession = () => session;
