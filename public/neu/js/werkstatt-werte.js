// Die Werkstatt: die bestehende Technik-Ansicht des alten Cockpits, nur in den neuen Farben.
// Geprüft in tests/neuWerkstatt.test.mjs: Jede id muss eine Seite des alten Cockpits sein.
export const WERKZEUGE = [
    ['Bauen', 'objekte', 'Objekte', 'Alle Objekte mit Baum, Klonen, Zügeln und Kind anhängen.'],
    ['Bauen', 'code', 'Code & DNA', 'Code und Aufbau bearbeiten.'],
    ['Bauen', 'ssf', 'SSF-Studio', 'Server-Funktionen schreiben und ausprobieren.'],
    ['Daten', 'daten', 'Daten & Suche', 'Datensätze mit der Such-Sprache durchsuchen.'],
    ['Daten', 'relationen', 'Relationen', 'Verbindungen zwischen Objekten.'],
    ['Sicherheit', 'rechte', 'Rechte', 'Triplets und Rollen im Detail.'],
    ['Sicherheit', 'agenten', 'Agenten', 'Agenten im Detail und Testpersonen.'],
    ['Sicherheit', 'ki', 'KI-Zugänge', 'Schlüssel für KI-Helfer.'],
    ['Prüfen', 'systemcheck', 'Systemcheck', 'Alle Prüfungen gegen das laufende Backend.']
].map(([gruppe, id, titel, text]) => ({ gruppe, id, titel, text, adresse: '/?werkstatt=1#/' + id }));

// Nach Thema gruppiert, in der Reihenfolge der Liste
export const werkzeugGruppen = () =>
    [...new Set(WERKZEUGE.map(w => w.gruppe))].map(g => [g, WERKZEUGE.filter(w => w.gruppe === g)]);
