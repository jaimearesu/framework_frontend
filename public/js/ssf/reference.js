// js/ssf/reference.js
// ---------------------------------------------------------------------
// WERKZEUG-REFERENZ: alle 17 Werkzeuge, die eine SSF über "api" hat.
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
    { id: 'objects', title: 'Objekte', text: 'Objekte ansehen, neue anlegen und klonen.' },
    { id: 'relations', title: 'Relationen', text: 'Objekte miteinander verbinden (Grundlage für Joins).' },
    { id: 'roles', title: 'Rollen', text: 'Rechte vergeben, entziehen und ansehen.' },
    { id: 'http', title: 'Aussenwelt', text: 'Fremde Server fragen – abgesichert gegen Missbrauch.' },
    { id: 'secrets', title: 'Tresor', text: 'Geheime Schlüssel der eigenen SSF lesen.' },
    {
        id: 'visitor',
        title: 'Besucher',
        text: 'Wer ruft gerade auf? Bei einer Website der angemeldete Besucher (Login auf Websites).'
    },
    {
        id: 'webhook',
        title: 'Webhooks',
        text: 'Ein fremder Server (Stripe, GitHub, ein ERP …) ruft die SSF über <website>/_at0mic/hook/<name> auf – prüfen, ob der Aufruf echt ist.'
    },
    {
        id: 'jobs',
        title: 'Hintergrund-Aufträge',
        text: 'Lange Arbeit Stück für Stück: viele kurze Durchläufe einer SSF mit Merkzettel – übersteht Fehler und Neustarts (Reiter „Aufträge“ eines Objekts).'
    },
    {
        id: 'lib',
        title: 'Bibliotheken',
        text: 'Gemeinsamer Code mehrerer SSFs: einmal als Objekt mit der Code-Art „Bibliothek“ ablegen, in jeder SSF laden.'
    },
    {
        id: 'files',
        title: 'Dateien',
        text: 'Dateien ablegen und lesen (Plan „R1“): Kalender, CSV-Exporte, Grafiken, Importe – mit den Rechten der SSF, der Platz zählt aufs Konto.'
    },
    {
        id: 'crypto',
        title: 'Sicherer Zufall',
        text: 'Geheime Tokens und IDs, die niemand erraten kann – für Geheimes nie Math.random() benutzen.'
    }
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
        signature: 'ziel, datensatz | [datensätze], { key | keys, onlyIfNone }',
        role: 'red',
        budget: 'writes (je Datensatz 1, max. 500)',
        returns: '{ _sys_id, _sys_created_at, _sys_key? } bzw. eine Liste davon',
        text: "Einen oder mehrere Datensätze anlegen – alles oder nichts. Felder mit _sys_ sind reserviert, Felder mit null werden nicht gespeichert. Sicher auch bei gleichzeitigen Anfragen: key = Schlüssel, den es pro Speicher nur einmal gibt (sonst Fehler mit e.code 'KEY_TAKEN'); onlyIfNone = Filter wie bei find, gespeichert wird nur, wenn nichts passt (sonst 'ALREADY_EXISTS') – z.B. gegen überlappende Reservationen.",
        snippet: "const neu = await api.data.insert('shop/nachrichten', { name: 'Anna', text: 'Hallo' });\n"
    },
    {
        name: 'data.update',
        group: 'data',
        signature: 'ziel, datensatzId, änderungen, { onlyIf }',
        role: 'red',
        budget: 'writes (1)',
        returns: 'der ganze Datensatz nach der Änderung',
        text: "Nur die angegebenen Felder ändern. null löscht ein Feld. Mit onlyIf nur, wenn die Felder noch genau diese Werte haben (sonst e.code 'CONDITION_FAILED') – z.B. Status nur von 'eingegangen' auf 'in Zubereitung'.",
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
        name: 'data.getByKey',
        group: 'data',
        signature: 'ziel, key',
        role: 'black',
        returns: '{ _sys_id, _sys_key, _sys_created_at, …felder } oder null',
        text: 'Einen Datensatz über seinen Schlüssel holen (schnell, der Schlüssel ist eindeutig pro Speicher).',
        snippet: "const buchung = await api.data.getByKey('resto/buchungen', 'tisch5|2026-10-24|19:00');\n"
    },
    {
        name: 'data.updateByKey',
        group: 'data',
        signature: 'ziel, key, änderungen, { onlyIf }',
        role: 'red',
        budget: 'writes (1)',
        returns: 'der ganze Datensatz nach der Änderung',
        text: "Wie update, nur über den Schlüssel. Gibt es ihn nicht: e.code 'NOT_FOUND'.",
        snippet: "await api.data.updateByKey('resto/buchungen', key, { bestaetigt: true });\n"
    },
    {
        name: 'data.deleteByKey',
        group: 'data',
        signature: 'ziel, key',
        role: 'red',
        budget: 'writes (1)',
        returns: '{ deleted: true | false }',
        text: 'Über den Schlüssel löschen. false = es gab ihn nicht (mehr) – kein Fehler.',
        snippet: "await api.data.deleteByKey('resto/buchungen', key);\n"
    },
    {
        name: 'data.upsert',
        group: 'data',
        signature: 'ziel, key, daten',
        role: 'red',
        budget: 'writes (1)',
        returns: '{ _sys_id, _sys_key, _sys_created_at, created }',
        text: 'Anlegen oder GANZ ersetzen: Gibt es den Schlüssel schon, bekommt der Datensatz genau diese Daten (ID bleibt). Gut für Einstellungen oder den aktuellen Stand von etwas.',
        snippet: "await api.data.upsert('resto/einstellungen', 'oeffnungszeiten', { mo: '11–22' });\n"
    },
    {
        name: 'objects.get',
        group: 'objects',
        signature: 'ziel',
        role: 'black',
        returns: '{ uuid, domain, domainRef, path, origin, createdAt, updatedAt }',
        text: 'Grunddaten eines Objekts – ohne persönliche Angaben (kein Besitzer, kein User). origin ist bei Kopien die Herkunft { uuid, domain, path, step }, sonst null.',
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
        name: 'objects.clone',
        group: 'objects',
        signature: 'ziel, neueDomain, { version, withData }',
        role: 'red (einstellbar: CLONE_PERMISSION)',
        budget: 'objects (1) + writes (je mitkopiertem Datensatz 1)',
        returns: '{ uuid, domain, domainRef, path, origin, createdAt, updatedAt }',
        text: 'Kopie als NEUE Domain: Code genau einer Version (Standard: neueste), Daten nur mit withData. Tresor-Schlüssel, Rechte und Relationen kommen nie mit. Die SSF wird Besitzerin – typisch danach: roles.grant an den Kunden und roles.leave.',
        snippet:
            "const kopie = await api.objects.clone('shop/produkte', 'kauf-' + Math.random().toString(36).slice(2, 8), { withData: true });\n"
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
        name: 'roles.leave',
        group: 'roles',
        signature: 'ziel',
        role: '– (gibt nur die EIGENEN Rollen ab)',
        budget: 'writes (1)',
        returns: '{ left: ["black", "blue", "red"] }',
        text: 'Die SSF tritt selbst zurück. Geht nur, wenn danach noch ein anderer Verwalter (blue) da ist – und nie aus dem Triplet, das die SSF selbst schützt.',
        snippet: 'await api.roles.leave(kopie.uuid);\n'
    },
    {
        name: 'http.fetch',
        group: 'http',
        signature: 'url, { method, headers, body, timeoutMs }',
        role: '–',
        budget: 'http (max. 10, dazu 60 pro Minute je SSF; lange: 20 pro Minute, 6 gleichzeitig auf dem Server)',
        returns: '{ status, ok, headers, body (Text), url, redirected }',
        text: 'Nur https:// auf Port 443, höchstens 3 s und 1 MB. Interne Adressen (localhost, private Netze, Cloud-Metadaten) sind gesperrt, auch nach Weiterleitungen. Für langsame Dienste wie ein LLM: timeoutMs bis 85000 (85 s, Antwort bis 4 MB) – diese Wartezeit zählt nicht zur Gesamtzeit.',
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
    },
    {
        name: 'visitor.can',
        group: 'visitor',
        signature: "ziel, rolle = 'black'",
        role: '– (nur Objekte der eigenen Domain)',
        returns: 'true | false',
        text: 'Hat der Besucher (requestContext.userUuid – bei einer Website der Angemeldete) diese Rolle auf ein Objekt der eigenen Domain? Anonym = immer false. Zählt nur Rollen, nicht die Sichtbarkeit. Damit schützt du Aktionen – ein versteckter Knopf ist keine Sicherheit.',
        snippet:
            "if (!(await api.visitor.can('portal/bereich-anna', 'red'))) {\n    return { fehler: 'Dafür fehlt dir das Recht.' };\n}\n"
    },
    {
        name: 'webhook.verify',
        group: 'webhook',
        signature:
            "{ secret, format: 'stripe' | 'github' | 'hmac-sha256', header?, encoding?, prefix?, toleranceSec? }",
        role: '– (nur der eigene Tresor, nur im Webhook-Aufruf)',
        returns: 'true | false',
        text: "Stimmt die Unterschrift des LAUFENDEN Webhook-Aufrufs? Das Geheimnis kommt aus dem Tresor dieser SSF und verlässt den Server nie. Stripe: Zeitstempel höchstens 5 Minuten alt. Frei (z.B. Shopify): header + encoding 'base64'. Die Daten stehen in requestContext.webhook = { method, headers, query, rawBody, body }.",
        snippet:
            "const echt = await api.webhook.verify({ secret: 'STRIPE_WEBHOOK_SECRET', format: 'stripe' });\nif (!echt) throw new Error('Unterschrift ungültig');\nconst ereignis = requestContext.webhook.body;\n"
    },
    {
        name: 'jobs.start',
        group: 'jobs',
        signature: 'ziel, eingabe = {}, { startInSec }',
        role: 'black auf die Ziel-SSF',
        budget: 'jobs (max. 5 pro Ausführung; offene pro Konto: Gast 5, eingeloggt 50)',
        returns: "{ id, status: 'queued', nextRunAt }",
        text: 'Legt einen Hintergrund-Auftrag an. Die Ziel-SSF bekommt requestContext.job = { id, input, state, run, attempt } und gibt { continue: merkzettel, waitSec? } zurück, solange es weitergeht – alles andere ist das Ergebnis. Nach Fehlern: neuer Versuch nach 1, 5, 30, 120 Min., nach 5 Fehlversuchen "failed". Ein Durchlauf darf 60 s dauern.',
        snippet: "const auftrag = await api.jobs.start('shop/import', { seite: 1 });\n"
    },
    {
        name: 'jobs.status',
        group: 'jobs',
        signature: 'id',
        role: '– (nur selbst angelegte oder selbst ausgeführte Aufträge)',
        returns: '{ id, status, runs, attempts, state, result, lastError, createdAt, finishedAt }',
        text: 'Stand eines Auftrags. Status: queued (wartet), running (läuft), done (fertig), failed (gescheitert), cancelled (abgebrochen).',
        snippet: 'const stand = await api.jobs.status(auftrag.id);\n'
    },
    {
        name: 'jobs.cancel',
        group: 'jobs',
        signature: 'id',
        role: '– (nur selbst angelegte oder selbst ausgeführte Aufträge)',
        returns: 'der Auftrag danach (status cancelled, wenn er noch offen war)',
        text: 'Bricht einen Auftrag ab. Ein wartender startet nie mehr; ein laufender Durchlauf rechnet zu Ende, sein Ergebnis wird verworfen.',
        snippet: 'await api.jobs.cancel(auftrag.id);\n'
    },
    {
        name: 'lib.load',
        group: 'lib',
        signature: 'ziel, { version }',
        role: 'black',
        budget: 'libraries (max. 10 pro Ausführung, je 256 KB)',
        returns: 'was die Bibliothek exportiert (exports.x = … wird zu helfer.x)',
        text: "Lädt eine Bibliothek (Code-Art library) und führt sie in DIESER SSF aus – mit deren Rechten. Ohne version die neueste. Aus einer fremden Domain nur mit angehefteter Version (sonst e.code 'VERSION_REQUIRED'), damit ihr Besitzer den Code nicht nachträglich ändern kann.",
        snippet: "const helfer = await api.lib.load('shop/helfer');\nreturn helfer.chf(12.5);\n"
    },
    {
        name: 'files.write',
        group: 'files',
        signature: 'ziel, inhalt, { type, name, encoding }',
        role: 'red',
        budget: 'files (max. 5 pro Ausführung, zusammen 10 MB, je 2 MB)',
        returns: '{ version, kind, mime, bytes, sha256, name, createdAt }',
        text: "Legt eine Datei als neue Version ab (die neuesten 3 bleiben). Text: type 'csv' | 'ics' | 'json' | 'txt' oder name mit Endung; SVG erkennt at0mic selbst; Bilder/PDFs als base64 mit encoding: 'base64'. Nie HTML. Das Objekt muss es schon geben. Gäste haben keinen Speicher (e.code 'QUOTA_EXCEEDED').",
        snippet: "await api.files.write('shop/export', 'sku;preis\\nA-1;9.90\\n', { type: 'csv' });\n"
    },
    {
        name: 'files.read',
        group: 'files',
        signature: 'ziel, { version, as }',
        role: 'black',
        budget: 'max. 4 MB pro Datei, 16 MB pro Ausführung',
        returns: '{ …wie files.write, text } bzw. { …, base64 }',
        text: "Liest eine Datei. as: 'text' (Standard für Text und SVG) oder 'base64' (Standard für Bilder, PDFs …). Ohne version die neueste. Keine Datei: e.code 'NO_FILE'.",
        snippet: "const liste = await api.files.read('shop/import');\nreturn liste.text.split('\\n').length;\n"
    },
    {
        name: 'files.info',
        group: 'files',
        signature: 'ziel',
        role: 'black',
        returns: '{ current, versions: [{ version, kind, bytes, sha256, name, createdAt }] }',
        text: 'Zeigt Art, Grösse und alle Versionen einer Datei – ohne den Inhalt. current ist null, wenn keine Datei da ist.',
        snippet: "const { current } = await api.files.info('shop/export');\nreturn current;\n"
    },
    {
        name: 'files.remove',
        group: 'files',
        signature: 'ziel',
        role: 'red',
        budget: 'files (zählt wie ein Schreiben)',
        returns: '{ removed: Anzahl Versionen }',
        text: 'Entfernt alle Versionen der Datei (das Objekt bleibt). Die Bytes im Speicher löscht der Aufräumer.',
        snippet: "await api.files.remove('shop/export');\n"
    },
    {
        // Plan "R2": nur wenn ein Besucher über /_at0mic/upload/<pfad> eine Datei schickt
        name: 'files.accept',
        group: 'files',
        signature: 'ziel, { types, maxBytes, anonym, name, neu }',
        role: 'red',
        budget: 'files (wie ein Schreiben); mit neu: zusätzlich objects',
        returns: '{ version, kind, bytes, sha256, … } – mit neu dazu { uuid, adresse }',
        text: 'Legt die Datei eines Website-Besuchers ab (requestContext.upload zeigt nur die Beschreibung). Ohne accept wird nichts gespeichert. Standard: nur angemeldete Besucher (anonym: true für alle), nur Fotos + PDF, max. 10 MB, einmal pro Upload. neu: true = in eine Sammlung, als neues privates Kind – sichtbar erst nach deiner Freigabe im Cockpit.',
        snippet:
            "const foto = await api.files.accept('shop/fotos', { neu: true, anonym: true });\nreturn foto.adresse;\n"
    },
    {
        name: 'files.readUpload',
        group: 'files',
        signature: '{ as }',
        role: '– (nur der Upload dieses Aufrufs)',
        budget: 'max. 4 MB',
        returns: '{ name, kind, bytes, sha256, text | base64 }',
        text: "Liest die Datei eines Website-Besuchers, OHNE sie abzulegen – z.B. eine CSV-Liste direkt einlesen. Ohne Upload: e.code 'NO_UPLOAD'.",
        snippet: "const liste = await api.files.readUpload();\nreturn liste.text.split('\\n').length;\n"
    },
    {
        name: 'crypto.randomToken',
        group: 'crypto',
        signature: "bytes = 32, encoding = 'base64url' | 'hex'",
        role: '– (braucht keine Rechte)',
        returns: 'Text, z.B. 43 Zeichen (32 Byte als base64url)',
        text: 'Ein geheimer Zufalls-Text aus dem Zufall des Servers – für Tisch-Tokens, Einladungs-Links oder Bestätigungs-Codes. bytes 16 bis 64. base64url enthält nur Buchstaben, Ziffern, - und _ und passt direkt in eine Adresse.',
        snippet:
            "const token = await api.crypto.randomToken();\nconst link = 'https://mein-restaurant.at0mic.site/tisch?t=' + token;\n"
    },
    {
        name: 'crypto.randomUuid',
        group: 'crypto',
        signature: '(keine Angaben)',
        role: '– (braucht keine Rechte)',
        returns: 'UUID (Version 4)',
        text: 'Eine zufällige UUID, z.B. als eigene ID für einen Datensatz.',
        snippet: 'const id = await api.crypto.randomUuid();\n'
    }
];

// Die Grenzen einer Ausführung (Stand Backend, siehe README "Grenzen pro Ausführung")
export const LIMITS = [
    ['Rechenzeit', '1 Sekunde (Wachhund, auch nach await)'],
    ['Gesamtzeit', '5 Sekunden (Warten auf lange Anfragen zählt nicht)'],
    ['Obergrenze', '90 Sekunden, auch mit langen Anfragen'],
    ['Speicher', '64 MB'],
    ['Werkzeug-Aufrufe', '50, davon 4 gleichzeitig'],
    ['Geschriebene Datensätze', '500'],
    ['Neue Objekte', '5'],
    ['Anfragen nach aussen', '10 (und 60 pro Minute je SSF)'],
    ['Antwort', 'bis 5 MB'],
    ['Dateien (api.files)', '5 pro Ausführung, je 2 MB schreiben, 4 MB lesen'],
    ['Gleichzeitige SSFs (Server)', '12, weitere warten kurz, sonst 503']
];
