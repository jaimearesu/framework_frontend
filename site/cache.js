// site/cache.js
// ---------------------------------------------------------------------
// ZWISCHENSPEICHER FÜR BAUPLÄNE (Plan "Bauarbeiter + Bauplan-Format", Entscheidung E)
//
// Ein Seitenaufruf sind mehrere Anfragen (index.html, style.css, js/1.js …).
// Der Bauplan wird darum nicht jedes Mal neu geholt, sondern so lange
// behalten, wie er selbst sagt ("cache", Standard 60 s, max. 1 h).
//
// Zwei Arten von Einträgen:
//   site     ein Bauplan. Nach Ablauf bleibt er als "alter Stand" liegen:
//            Ist das Backend kurz weg, liefert der Bauarbeiter ihn weiter aus.
//   missing  "diese Website gibt es nicht" – kurz gemerkt (Standard 10 s),
//            damit Bots mit erfundenen Namen nicht jedes Mal das Backend fragen.
//
// Höchstens maxEntries Websites UND höchstens maxBytes zusammen (Plan "T", 11.11.2026:
// grössere Stufen dürfen bis 30 MB grosse Baupläne haben – 200 × 30 MB wären 6 GB).
// Ist er voll, fliegt die am längsten nicht mehr benutzte raus (Map merkt sich die
// Reihenfolge). Ein Bauplan, der allein grösser ist als ein Viertel davon, wird gar
// nicht gemerkt (er würde alle anderen verdrängen) – er wird dann jedes Mal neu geholt.
// Liegt nur im Arbeitsspeicher – reicht für einen Server.
// ---------------------------------------------------------------------
// Grösse eines Bauplans in Bytes (Text der Dateien, so wie er im Speicher liegt – grob)
const bauplanBytes = bauplan => {
    let n = 0;
    const files = bauplan && bauplan.files;
    if (files && typeof files === 'object') {
        for (const text of Object.values(files)) if (typeof text === 'string') n += Buffer.byteLength(text, 'utf8');
    }
    return n;
};

class BauplanCache {
    constructor({ maxEntries = 200, maxBytes = 300 * 1024 * 1024, missingSeconds = 10, now = () => Date.now() } = {}) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
        this.bytes = 0; // Summe aller gemerkten Baupläne
        this.missingSeconds = missingSeconds;
        this.now = now;
        this.entries = new Map();
    }

    // Eintrag holen (auch abgelaufene). Zählt als "benutzt".
    get(name) {
        const entry = this.entries.get(name);
        if (!entry) return undefined;
        this.entries.delete(name);
        this.entries.set(name, entry); // ans Ende = zuletzt benutzt
        return entry;
    }

    isFresh(entry) {
        return !!entry && this.now() < entry.freshUntil;
    }

    // Ist ein (abgelaufener) Eintrag noch jung genug als Ersatz? (maxAgeMs ab dem Merken)
    isUsableStale(entry, maxAgeMs) {
        return !!entry && entry.kind === 'site' && this.now() - (entry.savedAt || 0) <= maxAgeMs;
    }

    setSite(name, bauplan) {
        const seconds = Number.isInteger(bauplan.cache) ? bauplan.cache : 60;
        const size = bauplanBytes(bauplan);
        if (size > this.maxBytes / 4) {
            this.delete(name); // zu gross zum Merken – lieber jedes Mal neu holen
            return;
        }
        // savedAt: wann gemerkt (für "höchstens 1 Stunde alter Ersatz", Nachzügler N-B)
        this._put(name, {
            kind: 'site',
            bauplan,
            size,
            savedAt: this.now(),
            freshUntil: this.now() + seconds * 1000
        });
    }

    setMissing(name) {
        this._put(name, { kind: 'missing', freshUntil: this.now() + this.missingSeconds * 1000 });
    }

    // Eine Website vergessen (z.B. wenn sie privat geworden ist)
    delete(name) {
        this._remove(name);
    }

    clear() {
        this.entries.clear();
        this.bytes = 0;
    }

    get size() {
        return this.entries.size;
    }

    _remove(name) {
        const old = this.entries.get(name);
        if (old) this.bytes -= old.size || 0;
        this.entries.delete(name);
    }

    _put(name, entry) {
        this._remove(name);
        this.entries.set(name, entry);
        this.bytes += entry.size || 0;
        while (this.entries.size > this.maxEntries || (this.bytes > this.maxBytes && this.entries.size > 1)) {
            this._remove(this.entries.keys().next().value); // der älteste
        }
    }
}

module.exports = { BauplanCache, bauplanBytes };
