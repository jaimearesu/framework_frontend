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
// Höchstens maxEntries Websites. Ist er voll, fliegt die am längsten
// nicht mehr benutzte raus (Map merkt sich die Reihenfolge).
// Liegt nur im Arbeitsspeicher – reicht für einen Server.
// ---------------------------------------------------------------------
class BauplanCache {
    constructor({ maxEntries = 200, missingSeconds = 10, now = () => Date.now() } = {}) {
        this.maxEntries = maxEntries;
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

    setSite(name, bauplan) {
        const seconds = Number.isInteger(bauplan.cache) ? bauplan.cache : 60;
        this._put(name, { kind: 'site', bauplan, freshUntil: this.now() + seconds * 1000 });
    }

    setMissing(name) {
        this._put(name, { kind: 'missing', freshUntil: this.now() + this.missingSeconds * 1000 });
    }

    clear() {
        this.entries.clear();
    }

    get size() {
        return this.entries.size;
    }

    _put(name, entry) {
        this.entries.delete(name);
        this.entries.set(name, entry);
        while (this.entries.size > this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value); // der älteste
        }
    }
}

module.exports = { BauplanCache };
