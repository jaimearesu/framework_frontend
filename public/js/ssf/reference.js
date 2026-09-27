// js/ssf/reference.js
// ---------------------------------------------------------------------
// WERKZEUG-REFERENZ: alle 15 Werkzeuge, die eine SSF über "api" hat.
// (Stand Backend: src/services/ssfApi/index.js)
//
// Felder:
//   name       – so ruft man es auf: api.<name>(…)
//   signature  – Argumente
//   role       – welche Rolle die SSF auf dem Ziel braucht
//   budget     – welches Kontingent pro Ausführung es verbraucht
//   returns    – was zurückkommt
//   text       – kurze Erklärung
//   snippet    – Beispiel zum Einfügen in den Editor
//
// "ziel" ist immer eine UUID oder ein Pfad wie 'shop/produkte'.
// ---------------------------------------------------------------------

export const TOOL_GROUPS = [
    { id: 'data', title: 'Daten', text: 'Datensätze eines Objekts lesen und schreiben.' },
    { id: 'objects', title: 'Objekte', text: 'Objekte ansehen und neue anlegen.' },
    { id: 'relations', title: 'Relationen', text: 'Objekte miteinander verbinden (Grundlage für Joins).' },
    { id: 'roles', title: 'Rollen', text: 'Rechte vergeben, entziehen und ansehen.' },
    { id: 'http', title: 'Aussenwelt', text: 'Fremde Server fragen – abgesichert gegen Missbrauch.' },
    { id: 'secrets', title: 'Tresor', text: 'Geheime Schlüssel der eigenen SSF lesen.' }
];

export const TOOLS = [
    {
        name: 'data.find',
        group: 'data',
        signature: 'ziel, { filter, sort, select, joins, limit, cursor, direction }',
        role: 'black',
        returns: '{ data: [...], meta: { total_count, total_count_capped, limit, returned_count, cursors } }',
        text: 'Datensätze suchen – mit derselben Such-Sprache wie auf der Seite „Daten & Suche“. Höchstens 500 pro Seite, gezählt wird bis 10’000.',
        snippet:
            "const res = await api.data.find('shop/produkte', {\n    filter: { preis: { $lt: 50 } },\n    sort: { field: 'preis', order: 'ASC' },\n    limit: 20\n});\n"
    },
    {
        name: 'data.get',
        group: 'data',
        signature: 'ziel, datensatzId',
        role: 'black',
        returns: '{ _sys_id, _sys_created_at, …felder }',
        text: 'Einen einzelnen Datensatz über seine ID laden.',
        snippet: "const produkt = await api.data.get('shop/produkte', id);\n"
    },
    {
        name: 'data.insert',
        group: 'data',
        signature: 'ziel, datensatz | [datensätze]',
        role: 'red',
        budget: 'writes (je Datensatz 1, max. 500)',
        returns: '{ _sys_id, _sys_created_at } bzw. eine Liste davon',
        text: 'Einen oder mehrere Datensätze anlegen – alles oder nichts. Felder mit _sys_ sind reserviert, Felder mit null werden nicht gespeichert.',
        snippet: "const neu = await api.data.insert('shop/nachrichten', { name: 'Anna', text: 'Hallo' });\n"
    },
    {
        name: 'data.update',
        group: 'data',
        signature: 'ziel, datensatzId, änderungen',
        role: 'red',
        budget: 'writes (1)',
        returns: 'der ganze Datensatz nach der Änderung',
        text: 'Nur die angegebenen Felder ändern. null löscht ein Feld.',
        snippet: "const geaendert = await api.data.update('shop/lager', id, { bestand: 7 });\n"
    },
    {
        name: 'data.delete',
        group: 'data',
        signature: 'ziel, datensatzId',
        role: 'red',
        budget: 'writes (1)',
        returns: '{ deleted: true }',
        text: 'Einen Datensatz löschen.',
        snippet: "await api.data.delete('shop/nachrichten', id);\n"
    },
    {
        name: 'objects.get',
        group: 'objects',
        signature: 'ziel',
        role: 'black',
        returns: '{ uuid, domain, domainRef, path, createdAt, updatedAt }',
        text: 'Grunddaten eines Objekts – ohne persönliche Angaben (kein Besitzer, kein User).',
        snippet: "const info = await api.objects.get('shop');\n"
    },
    {
        name: 'objects.create',
        group: 'objects',
        signature: 'domain',
        role: '– (die SSF wird Besitzerin)',
        budget: 'objects (max. 5)',
        returns: '{ uuid, domain, domainRef, path, createdAt, updatedAt }',
        text: 'Neue Domain anlegen. Die SSF bekommt black, red und blue darauf – Menschen zunächst nichts (vergeben mit roles.grant).',
        snippet: "const projekt = await api.objects.create('projekt-' + Math.random().toString(36).slice(2, 8));\n"
    },
    {
        name: 'relations.get',
        group: 'relations',
        signature: 'ziel',
        role: 'black',
        returns: '[ { uuid, source, target, relationType, createdAt } ]',
        text: 'Alle Verbindungen eines Objekts.',
        snippet: "const verbindungen = await api.relations.get('shop/produkte');\n"
    },
    {
        name: 'relations.add',
        group: 'relations',
        signature: 'quelle, ziel, typ',
        role: 'red auf beiden',
        returns: '{ uuid, source, target, relationType, createdAt }',
        text: 'Zwei Objekte verbinden, z.B. produkte --„lager“--> lager. Danach funktionieren Joins über diesen Typ.',
        snippet: "await api.relations.add('shop/produkte', 'shop/lager', 'lager');\n"
    },
    {
        name: 'roles.grant',
        group: 'roles',
        signature: 'ziel, empfänger, rolle',
        role: 'blue',
        returns: '{ changed: true | false }',
        text: 'Eine Rolle (black, red, blue) vergeben – im schützenden Triplet des Ziels. Empfänger ist eine UUID oder ein Pfad, oft requestContext.userUuid.',
        snippet: "await api.roles.grant(projekt.uuid, requestContext.userUuid, 'black');\n"
    },
    {
        name: 'roles.revoke',
        group: 'roles',
        signature: 'ziel, empfänger, rolle',
        role: 'blue',
        returns: '{ changed: true | false }',
        text: 'Eine Rolle entziehen – aber nie jemandem, der blue auf dem Ziel hat (Admin-Schutz: Code kann den Besitzer nie aussperren).',
        snippet: "await api.roles.revoke(projekt.uuid, besucherUuid, 'red');\n"
    },
    {
        name: 'roles.list',
        group: 'roles',
        signature: 'ziel',
        role: 'blue',
        returns: '[ { uuid, roles: ["black", "red", …] } ]',
        text: 'Wer hat welche Rollen auf dem Ziel? (nur UUIDs, keine persönlichen Daten)',
        snippet: 'const mitglieder = await api.roles.list(projekt.uuid);\n'
    },
    {
        name: 'http.fetch',
        group: 'http',
        signature: 'url, { method, headers, body }',
        role: '–',
        budget: 'http (max. 10, dazu 60 pro Minute je SSF)',
        returns: '{ status, ok, headers, body (Text), url, redirected }',
        text: 'Nur https:// auf Port 443, höchstens 3 s und 1 MB. Interne Adressen (localhost, private Netze, Cloud-Metadaten) sind gesperrt, auch nach Weiterleitungen.',
        snippet:
            "const antwort = await api.http.fetch('https://api.example.com/daten', { method: 'GET' });\nconst daten = JSON.parse(antwort.body);\n"
    },
    {
        name: 'secrets.get',
        group: 'secrets',
        signature: 'name',
        role: '– (nur eigene Schlüssel)',
        returns: 'der Wert als Text',
        text: 'Einen eigenen geheimen Schlüssel lesen. Taucht der Wert in der Antwort oder in einem Fehler auf, wird er zu *** geschwärzt.',
        snippet: "const key = await api.secrets.get('WETTER_KEY');\n"
    },
    {
        name: 'secrets.has',
        group: 'secrets',
        signature: 'name',
        role: '– (nur eigene Schlüssel)',
        returns: 'true | false',
        text: 'Prüfen, ob ein Schlüssel im Tresor dieser SSF liegt – ohne ihn zu lesen.',
        snippet: "if (await api.secrets.has('WETTER_KEY')) { /* … */ }\n"
    }
];

// Die Grenzen einer Ausführung (Stand Backend, siehe README "Grenzen pro Ausführung")
export const LIMITS = [
    ['Rechenzeit', '1 Sekunde (Wachhund, auch nach await)'],
    ['Gesamtzeit', '5 Sekunden'],
    ['Speicher', '64 MB'],
    ['Werkzeug-Aufrufe', '50, davon 4 gleichzeitig'],
    ['Geschriebene Datensätze', '500'],
    ['Neue Objekte', '5'],
    ['Anfragen nach aussen', '10 (und 60 pro Minute je SSF)'],
    ['Antwort', 'bis 5 MB'],
    ['Gleichzeitige SSFs (Server)', '12, weitere warten kurz, sonst 503']
];
