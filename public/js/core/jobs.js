// js/core/jobs.js
// ---------------------------------------------------------------------
// HINTERGRUND-AUFTRÄGE IM COCKPIT (Plan "SSF-Ausbau", Etappe C3)
// Reine Helfer ohne DOM – automatisch getestet (tests/jobs.test.mjs).
// Die Seite selbst ist der Reiter "Aufträge" in pages/objects.js.
// ---------------------------------------------------------------------

// Status eines Auftrags -> Text + Farbe (Namen kommen englisch vom Backend)
const STATUS = {
    queued: { tone: 'neutral', text: 'wartet' },
    running: { tone: 'accent', text: 'läuft' },
    done: { tone: 'ok', text: 'fertig' },
    failed: { tone: 'error', text: 'gescheitert' },
    cancelled: { tone: 'warn', text: 'abgebrochen' }
};
export const jobStatusText = status => STATUS[status] || { tone: 'neutral', text: String(status || '–') };

// Abbrechen geht nur, solange er noch offen ist
export const canCancel = status => status === 'queued' || status === 'running';

// Häufige Zeitpläne zum Anklicken (Cron: Minute Stunde Tag Monat Wochentag, Schweizer Zeit)
export const SCHEDULE_PRESETS = [
    { label: 'Jede Nacht um 3 Uhr', cron: '0 3 * * *' },
    { label: 'Stündlich', cron: '0 * * * *' },
    { label: 'Alle 15 Minuten', cron: '*/15 * * * *' },
    { label: 'Mo–Fr um 07:30', cron: '30 7 * * 1-5' },
    { label: 'Am 1. jedes Monats', cron: '0 0 1 * *' }
];

// Passt ein Ausdruck zu einer Vorlage? -> deren Text, sonst null
export const describeCron = cron => {
    const preset = SCHEDULE_PRESETS.find(p => p.cron === String(cron || '').trim());
    return preset ? preset.label : null;
};

/**
 * Eingabe aus einem Textfeld (JSON) lesen. Leer = {}.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export const parseJsonInput = text => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { ok: true, value: {} };
    try {
        const value = JSON.parse(trimmed);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { ok: false, error: 'Die Eingabe muss ein JSON-Objekt sein, z.B. { "seite": 1 }.' };
        }
        return { ok: true, value };
    } catch {
        return { ok: false, error: 'Das ist kein gültiges JSON, z.B. { "seite": 1 }.' };
    }
};

// Zusammenfassung für die Kopfzeile, z.B. { offen: 2, fertig: 5, gescheitert: 1 }
export const jobSummary = jobs => {
    const out = { offen: 0, fertig: 0, gescheitert: 0 };
    for (const j of jobs || []) {
        if (canCancel(j.status)) out.offen++;
        else if (j.status === 'done') out.fertig++;
        else if (j.status === 'failed') out.gescheitert++;
    }
    return out;
};

// Wann kommt der nächste Durchlauf? "jetzt", "in 45 Sek.", "in 3 Min.", "in 2 Std.", "in 3 Tagen"
// (timeAgo kann nur Vergangenes – der nächste Durchlauf liegt meist in der Zukunft)
export const untilText = (iso, now = Date.now()) => {
    const sec = Math.round((new Date(iso).getTime() - now) / 1000);
    if (!Number.isFinite(sec)) return '–';
    if (sec <= 5) return 'jetzt';
    if (sec < 60) return `in ${sec} Sek.`;
    if (sec < 3600) return `in ${Math.round(sec / 60)} Min.`;
    if (sec < 48 * 3600) return `in ${Math.round(sec / 3600)} Std.`;
    return `in ${Math.round(sec / 86400)} Tagen`;
};
