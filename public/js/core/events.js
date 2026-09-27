// js/core/events.js
// ---------------------------------------------------------------------
// Ein kleines "Schwarzes Brett": Teile des Cockpits können hier Nachrichten
// aufhängen (emit) und andere Teile können darauf hören (on).
//
// Beispiele:
//   emit('request', …)  -> jede Anfrage ans Backend (fürs Protokoll)
//   emit('session', …)  -> "Wer bin ich / läuft der Server?" hat sich geändert
//   emit('mode', 'test')-> Live/Test wurde umgeschaltet
// ---------------------------------------------------------------------
const listeners = new Map(); // Name -> Set von Funktionen

// Zuhören. Gibt eine Funktion zurück, mit der man wieder aufhört.
export const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name).delete(fn);
};

// Nachricht an alle Zuhörer schicken. Ein Fehler in einem Zuhörer
// darf die anderen nicht stoppen.
export const emit = (name, data) => {
    for (const fn of listeners.get(name) || []) {
        try {
            fn(data);
        } catch (err) {
            console.error(`Fehler in einem Zuhörer für "${name}":`, err);
        }
    }
};
