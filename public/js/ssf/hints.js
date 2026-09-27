// js/ssf/hints.js
// ---------------------------------------------------------------------
// FEHLER VERSTÄNDLICH MACHEN
//
// Wenn eine SSF scheitert, schickt das Backend eine technische Meldung.
// Hier steht zu jeder bekannten Meldung ein Tipp in einfacher Sprache.
// (reine Funktion -> automatisch getestet)
// ---------------------------------------------------------------------

const HINTS = [
    {
        test: /Rechenzeit|timed out/i,
        tip: 'Die SSF hat länger als 1 Sekunde gerechnet – meistens eine Endlosschleife. Der Wachhund hat sie gestoppt.'
    },
    {
        test: /Gesamtzeit/i,
        tip: 'Die SSF lief länger als 5 Sekunden (z.B. eine langsame fremde API oder viele Aufrufe nacheinander).'
    },
    {
        test: /Kein Zugriff oder nicht gefunden/i,
        tip: 'Die SSF selbst (nicht du!) braucht Rechte auf dieses Ziel: black zum Lesen, red zum Schreiben. Stimmt der Pfad? Liegt die SSF in derselben Domain (als Kind)? Absichtlich sieht „gibt es nicht“ gleich aus wie „kein Zugriff“.'
    },
    {
        test: /Zu viele Werkzeug-Aufrufe/i,
        tip: 'Pro Ausführung sind höchstens 50 Werkzeug-Aufrufe erlaubt. Tipp: mit limit mehr Datensätze pro Aufruf holen.'
    },
    {
        test: /Kontingent erschöpft/i,
        tip: 'Pro Ausführung höchstens 500 geschriebene Datensätze, 5 neue Objekte und 10 Anfragen nach aussen.'
    },
    {
        test: /interne oder reservierte Adresse|Nur verschlüsselte Adressen|Port 443/i,
        tip: 'http.fetch darf nur öffentliche https-Adressen erreichen. Interne Dienste des Servers sind gesperrt (Schutz vor SSRF).'
    },
    {
        test: /reserviert/i,
        tip: 'Felder, die mit _sys_ beginnen, gehören dem System (z.B. _sys_id). Benenne dein Feld anders.'
    },
    {
        test: /is not defined/i,
        tip: 'Ein Name ist unbekannt. In der Sandbox gibt es nur JavaScript, requestContext und api – kein console, fetch, setTimeout oder require.'
    },
    {
        test: /besitzt keine Serverless-Function|Keine Daten für dieses Objekt/i,
        tip: 'Dieses Objekt hat noch keinen SSF-Code. Erst speichern, dann ausführen.'
    },
    {
        test: /Unexpected token|Syntax/i,
        tip: 'Der Code enthält einen Schreibfehler (Klammer, Komma, Anführungszeichen …). Die Zeilenangabe hilft beim Finden.'
    },
    {
        test: /Tresor ist auf diesem Server nicht eingerichtet/i,
        tip: 'Auf dem Server fehlt SECRETS_KEY in der .env – ohne ihn funktioniert der Tresor nicht.'
    },
    {
        test: /Kein Schlüssel/i,
        tip: 'Diesen Schlüssel gibt es im Tresor dieser SSF nicht. Lege ihn auf der Seite „Tresor“ an (Name genau gleich, Grossbuchstaben).'
    },
    {
        test: /Interner Fehler \(Fehler-ID/i,
        tip: 'Ein Fehler auf dem Server. Mit der Fehler-ID findest du die Details im Server-Log (docker logs).'
    },
    {
        test: /ausgelastet|503/i,
        tip: 'Gerade laufen zu viele SSFs gleichzeitig (max. 12). Einfach kurz warten und nochmals versuchen.'
    }
];

// Tipp zu einer Fehlermeldung (oder null, wenn keiner passt)
export const explainError = message => {
    const text = String(message || '');
    return HINTS.find(h => h.test.test(text))?.tip || null;
};

// Tipp zum HTTP-Status der Ausführung
export const explainStatus = status =>
    ({
        0: 'Das Backend ist nicht erreichbar.',
        401: 'Bitte zuerst einloggen.',
        403: 'Du (der Aufrufer) brauchst black auf der SSF, um sie auszuführen. Als „Fremder“ ohne Cookies ist das normal.',
        404: 'Die SSF wurde nicht gefunden – oder sie hat noch keinen Code.',
        422: 'Die SSF ist mit einem Fehler abgebrochen (siehe Meldung).',
        503: 'Zu viele SSFs gleichzeitig. Kurz warten und nochmals versuchen.'
    })[status] || null;
