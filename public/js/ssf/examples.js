// js/ssf/examples.js
// ---------------------------------------------------------------------
// BEISPIEL-BIBLIOTHEK FÜR SSFs (Server-Funktionen)
//
// Jedes Beispiel ist lauffähiger Code für die Spielwiese (siehe
// playground.js). Der Platzhalter {{SHOP}} wird beim Laden durch den
// Namen deiner Spielwiese ersetzt, z.B. "studio-k3x9".
//
// Die Spielwiese sieht so aus (alles Kinder derselben Domain):
//   {{SHOP}}                 die Domain (Wurzel)
//   ├── funktion             DIESE SSF – als Kind hat sie dieselben Rollen
//   │                        wie die Domain, darf also alle Geschwister
//   │                        lesen und beschreiben
//   ├── produkte             Datensätze { sku, name, kategorie, preis }
//   ├── lager                Datensätze { sku, bestand }
//   │                        + Relation produkte --"lager"--> lager (für Joins)
//   ├── nachrichten          leer (Kontaktformular schreibt hierhin)
//   ├── bestellungen         leer (Bestell-Beispiel schreibt hierhin)
//   ├── helfer               eine Bibliothek (Code-Art library) – Beispiel 12
//   └── export               leer – Beispiel 13 legt hier eine CSV-Datei ab (api.files)
//
// Aufbau eines Beispiels:
//   id, title, level (Einstieg | Fortgeschritten | Profi), summary,
//   learn (was man lernt), tools (benutzte Werkzeuge),
//   code, body (Standard-Body), presets (weitere Bodies zum Ausprobieren)
//
// WICHTIG: In der Sandbox gibt es kein console.log, kein fetch, kein
// setTimeout, kein require – nur JavaScript und das Objekt "api".
// ---------------------------------------------------------------------

export const EXAMPLES = [
    // ------------------------------------------------------------------
    {
        id: 'hallo',
        title: 'Hallo Welt',
        level: 'Einstieg',
        summary: 'Was weiss eine SSF über ihren Aufruf?',
        learn: [
            'requestContext enthält body, query, target und userUuid',
            'Mit return gibst du die Antwort zurück (als JSON)',
            'Cookies und Login-Daten sieht die SSF nie'
        ],
        tools: [],
        body: { name: 'Jaime' },
        code: `// 1) HALLO WELT
// requestContext kommt vom Server und beschreibt den Aufruf.
// Die SSF sieht NIE Cookies, Passwörter oder Login-Daten.
const { body, query, target, userUuid, originalUrl } = requestContext;

// Alles, was du zurückgibst, landet als JSON beim Aufrufer.
return {
    gruss: \`Hallo \${body?.name || 'Welt'}!\`,
    aufgerufenVon: userUuid ?? 'anonym',          // UUID des Besuchers (Objekt!)
    ziel: target ?? 'kein Ziel (POST-Aufruf)',    // nur bei GET …/target/…
    empfangen: body,
    query,
    adresse: originalUrl,
    zeit: new Date().toISOString()
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'produktliste',
        title: 'Produktliste als HTML',
        level: 'Einstieg',
        summary: 'Daten suchen, filtern, sortieren – und eine Webseite daraus bauen.',
        learn: [
            'api.data.find mit filter, sort und select',
            'meta.total_count: wie viele passen insgesamt',
            'Texte vor dem Einbauen in HTML „entschärfen“ (Schutz vor XSS)',
            'Gibt die SSF ein Feld html zurück, zeigt das Studio es als Vorschau'
        ],
        tools: ['data.find'],
        body: { maxPreis: 100 },
        presets: {
            'Alles bis 100': { maxPreis: 100 },
            'Nur Kleider': { kategorie: 'Kleider', maxPreis: 1000 },
            'Günstig (bis 20)': { maxPreis: 20 }
        },
        code: `// 2) PRODUKTLISTE ALS HTML
const SHOP = '{{SHOP}}';
const { kategorie, maxPreis = 1000 } = requestContext.body || {};

// Filter zusammenbauen – dieselbe Such-Sprache wie auf der Seite "Daten & Suche"
const filter = { preis: { $lte: Number(maxPreis) } };
if (kategorie) filter.kategorie = kategorie;

const res = await api.data.find(\`\${SHOP}/produkte\`, {
    filter,
    sort: { field: 'preis', order: 'ASC' },
    select: ['name', 'kategorie', 'preis'],
    limit: 50
});

// WICHTIG: Daten können von Fremden stammen -> vor dem Einbauen in HTML entschärfen,
// sonst könnte jemand über einen Produktnamen Schad-Code einschleusen (XSS).
const esc = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const zeilen = res.data
    .map(p => \`<tr><td>\${esc(p.name)}</td><td>\${esc(p.kategorie)}</td><td class="preis">CHF \${Number(p.preis).toFixed(2)}</td></tr>\`)
    .join('');

return {
    anzahl: res.meta.total_count,
    html: \`
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2328; }
  h1 { color: #6d5dfc; margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  td { padding: 8px 10px; border-bottom: 1px solid #e1e4ea; }
  .preis { text-align: right; font-variant-numeric: tabular-nums; }
</style>
<h1>Unsere Produkte</h1>
<p>\${res.meta.total_count} Treffer\${kategorie ? ' in ' + esc(kategorie) : ''} bis CHF \${esc(maxPreis)}</p>
<table>\${zeilen}</table>\`
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'kontakt',
        title: 'Kontaktformular',
        level: 'Einstieg',
        summary: 'Eingaben prüfen, speichern und eine Bestätigung zurückgeben.',
        learn: [
            'Eingaben IMMER prüfen – der Body kommt von Fremden',
            'api.data.insert speichert einen Datensatz',
            'Die SSF schreibt mit IHREN Rechten (red), nicht mit denen des Besuchers'
        ],
        tools: ['data.insert', 'data.find'],
        body: { name: 'Anna Muster', email: 'anna@example.ch', nachricht: 'Habt ihr die Schuhe auch in Grösse 42?' },
        presets: {
            Gültig: {
                name: 'Anna Muster',
                email: 'anna@example.ch',
                nachricht: 'Habt ihr die Schuhe auch in Grösse 42?'
            },
            Ungültig: { name: 'A', email: 'keine-mail', nachricht: '' }
        },
        code: `// 3) KONTAKTFORMULAR
const SHOP = '{{SHOP}}';
const { name, email, nachricht } = requestContext.body || {};

// 1. Prüfen: Der Body kommt vom Besucher – also von irgendwem.
const fehler = [];
if (!name || String(name).trim().length < 2) fehler.push('Name fehlt (mindestens 2 Zeichen).');
if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(String(email || ''))) fehler.push('E-Mail-Adresse ist ungültig.');
if (!nachricht || String(nachricht).length > 2000) fehler.push('Nachricht fehlt oder ist länger als 2000 Zeichen.');
if (fehler.length) return { ok: false, fehler };

// 2. Speichern – nur die Felder, die wir wirklich wollen (nie einfach den ganzen Body!)
const gespeichert = await api.data.insert(\`\${SHOP}/nachrichten\`, {
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    nachricht: String(nachricht),
    absender: requestContext.userUuid ?? 'anonym',
    status: 'neu'
});

// 3. Wie viele unbeantwortete Nachrichten gibt es jetzt?
const offen = await api.data.find(\`\${SHOP}/nachrichten\`, { filter: { status: 'neu' }, limit: 1 });

return {
    ok: true,
    danke: \`Danke, \${String(name).trim()}! Wir melden uns.\`,
    id: gespeichert._sys_id,
    offeneNachrichten: offen.meta.total_count
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'projekt',
        title: 'Projekt für den Besucher',
        level: 'Fortgeschritten',
        summary: 'Ein neues Objekt anlegen und dem Besucher Rechte darauf geben.',
        learn: [
            'api.objects.create: die SSF wird Besitzerin (black, red, blue)',
            'api.roles.grant: Rechte an den Besucher weitergeben',
            'api.roles.list: wer hat jetzt welche Rolle?',
            'Pro Ausführung höchstens 5 neue Objekte'
        ],
        tools: ['objects.create', 'roles.grant', 'data.insert', 'roles.list'],
        body: { titel: 'Mein Garten-Blog' },
        code: `// 4) PROJEKT FÜR DEN BESUCHER
// Achtung: legt bei jedem Ausführen ein ECHTES neues Objekt an.
const besucher = requestContext.userUuid;
if (!besucher) {
    // Anonyme Besucher haben kein Objekt, dem man Rechte geben könnte
    return { ok: false, fehler: 'Bitte zuerst etwas erstellen oder einloggen (dann bist du Gast/User).' };
}

// 1. Neues Objekt – eindeutiger Name (jede Domain gibt es nur einmal)
const name = 'projekt-' + Math.random().toString(36).slice(2, 8);
const projekt = await api.objects.create(name);   // SSF hat jetzt black/red/blue darauf

// 2. Dem Besucher lesen (black) und ändern (red) erlauben – aber nicht blue:
//    Rechte weitergeben darf weiterhin nur die SSF.
await api.roles.grant(projekt.uuid, besucher, 'black');
await api.roles.grant(projekt.uuid, besucher, 'red');

// 3. Gleich einen ersten Datensatz hineinlegen
await api.data.insert(projekt.uuid, {
    titel: String(requestContext.body?.titel || 'Mein Projekt').slice(0, 100),
    erstellt: new Date().toISOString()
});

// 4. Wer ist jetzt Mitglied?
const mitglieder = await api.roles.list(projekt.uuid);

return {
    ok: true,
    projekt,
    mitglieder,
    hinweis: 'Das Projekt erscheint jetzt auch bei dir unter "Objekte".'
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'wetter',
        title: 'Wetter-API mit Tresor',
        level: 'Fortgeschritten',
        summary: 'Einen fremden Server fragen – mit einem geheimen Schlüssel aus dem Tresor.',
        learn: [
            'api.http.fetch: nur https, max. 3 s, 1 MB, 10 pro Ausführung (länger: Beispiel "LLM fragen")',
            'Die Antwort (body) ist Text – JSON selbst auslesen',
            'api.secrets.has/get: Schlüssel nie in den Code schreiben',
            'Gelesene Schlüssel werden in der Antwort automatisch zu *** geschwärzt'
        ],
        tools: ['http.fetch', 'secrets.has', 'secrets.get'],
        body: { lat: 47.37, lon: 8.54, ort: 'Zürich' },
        presets: {
            Zürich: { lat: 47.37, lon: 8.54, ort: 'Zürich' },
            Bern: { lat: 46.95, lon: 7.45, ort: 'Bern' },
            Lugano: { lat: 46.0, lon: 8.95, ort: 'Lugano' }
        },
        code: `// 5) WETTER-API MIT TRESOR
// open-meteo.com braucht keinen Schlüssel. Viele andere APIs schon – dafür ist der Tresor da.
const { lat = 47.37, lon = 8.54, ort = 'Zürich' } = requestContext.body || {};
const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + Number(lat) + '&longitude=' + Number(lon)
    + '&current=temperature_2m,wind_speed_10m';

// Schlüssel aus dem Tresor (falls vorhanden). Anlegen: Seite "Tresor", Name WETTER_KEY.
const hatSchluessel = await api.secrets.has('WETTER_KEY');
const schluessel = hatSchluessel ? await api.secrets.get('WETTER_KEY') : null;

// open-meteo braucht keinen Schlüssel (und lehnt fremde Header ab) – darum schicken
// wir ihn hier NICHT mit. Bei einer API, die einen braucht, sähe es so aus:
//   api.http.fetch(url, { headers: { Authorization: 'Bearer ' + schluessel } })
const antwort = await api.http.fetch(url);
if (!antwort.ok) return { ok: false, status: antwort.status };

const daten = JSON.parse(antwort.body);   // body ist immer Text
return {
    ok: true,
    ort,
    temperatur: daten.current.temperature_2m + ' °C',
    wind: daten.current.wind_speed_10m + ' km/h',
    tresor: hatSchluessel
        // Der echte Wert erscheint hier NICHT – der Server schwärzt ihn zu ***
        ? 'Gelesener Schlüssel: ' + schluessel
        : 'Kein WETTER_KEY im Tresor – lege einen an und führe nochmals aus.'
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'llm',
        title: 'Ein LLM fragen (Claude)',
        level: 'Fortgeschritten',
        summary: 'Claude eine Frage stellen und die Antwort zurückgeben – mit einem Schlüssel aus dem Tresor.',
        learn: [
            'api.http.fetch mit timeoutMs: bis 85 s warten statt 3 s',
            'Die Wartezeit zählt nicht zur Gesamtzeit (5 s), die Rechenzeit (1 s) bleibt',
            'Der API-Schlüssel kommt aus dem Tresor (Name ANTHROPIC_API_KEY)',
            'Die Antwort enthält mehrere Blöcke – nur die Text-Blöcke sind die Antwort',
            'Jede Frage kostet Geld: Länge begrenzen, auf Websites nur für Angemeldete'
        ],
        tools: ['http.fetch', 'secrets.has', 'secrets.get'],
        body: { frage: 'Erkläre in zwei Sätzen, was ein Objekt in vindelis ist.' },
        presets: {
            Kurz: { frage: 'Was ist die Hauptstadt der Schweiz?' },
            Gedicht: { frage: 'Schreib ein Vierzeiler über Berge.' }
        },
        code: `// 6) EIN LLM FRAGEN (Claude)
// Vorher: Seite "Tresor" -> bei DIESER SSF den Schlüssel ANTHROPIC_API_KEY anlegen
// (von platform.claude.com). Ohne Schlüssel gibt es nur einen Hinweis.
if (!(await api.secrets.has('ANTHROPIC_API_KEY'))) {
    return { fehler: 'Bitte zuerst den Schlüssel ANTHROPIC_API_KEY im Tresor dieser SSF anlegen.' };
}
const frage = String((requestContext.body || {}).frage || '').slice(0, 4000);
if (!frage) return { fehler: 'Keine Frage.' };

const antwort = await api.http.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    timeoutMs: 80000, // ein LLM braucht oft 10–60 s – ohne timeoutMs wäre nach 3 s Schluss
    headers: {
        'x-api-key': await api.secrets.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: {
        model: 'claude-opus-5-5',
        max_tokens: 2000,
        output_config: { effort: 'low' }, // schneller und günstiger; 'medium'/'high' für schwierige Fragen
        fallbacks: 'default', // lehnt das Modell ab, springt automatisch ein anderes ein
        messages: [{ role: 'user', content: frage }]
    }
});

const daten = JSON.parse(antwort.body);
// 429 = zu viele Anfragen, 529 = überlastet: später nochmals versuchen
if (!antwort.ok) return { fehler: 'Das LLM ist gerade nicht erreichbar (' + antwort.status + ').' };
if (daten.stop_reason === 'refusal') return { fehler: 'Diese Frage kann ich nicht beantworten.' };

// content ist eine Liste von Blöcken – nur die Text-Blöcke sind die Antwort
const text = daten.content.filter(b => b.type === 'text').map(b => b.text).join('');
return { antwort: text, tokens: daten.usage };
`
    },

    // ------------------------------------------------------------------
    {
        id: 'blaettern',
        title: 'Alle Daten durchblättern',
        level: 'Fortgeschritten',
        summary: 'Seite für Seite mit einem Cursor – so kommt man an beliebig viele Datensätze.',
        learn: [
            'limit = Seitengrösse (1–500)',
            'meta.cursors.last ist das Lesezeichen für die nächste Seite',
            'Jede Seite ist ein Werkzeug-Aufruf – höchstens 50 pro Ausführung'
        ],
        tools: ['data.find'],
        body: { seitengroesse: 3 },
        code: `// 7) ALLE DATEN DURCHBLÄTTERN
const SHOP = '{{SHOP}}';
const groesse = Math.min(Math.max(Number(requestContext.body?.seitengroesse) || 3, 1), 500);

const alle = [];
const seiten = [];
let cursor;   // beim ersten Mal leer = von vorne

while (seiten.length < 20) {                       // Sicherheitsgrenze
    const seite = await api.data.find(\`\${SHOP}/produkte\`, { limit: groesse, cursor, direction: 'next' });
    seiten.push(seite.meta.returned_count);
    alle.push(...seite.data.map(p => p.name));
    if (seite.meta.returned_count < groesse) break; // letzte Seite
    cursor = seite.meta.cursors.last;                // Lesezeichen für die nächste Seite
}

return {
    seitengroesse: groesse,
    seiten: seiten.length,
    proSeite: seiten,
    insgesamt: alle.length,
    namen: alle
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'bestellung',
        title: 'Bestellung mit Lager',
        level: 'Profi',
        summary: 'Lager prüfen, Bestand abbuchen, Bestellung speichern.',
        learn: [
            'Mehrere Werkzeuge nacheinander: find → update → insert',
            'api.data.update ändert nur die angegebenen Felder',
            'Geschäftsregeln (Menge, Bestand) gehören in die SSF – nicht in den Browser'
        ],
        tools: ['data.find', 'data.update', 'data.insert'],
        body: { sku: 'SCH-01', menge: 2 },
        presets: {
            '2 Sneaker': { sku: 'SCH-01', menge: 2 },
            'Zu viele': { sku: 'MUE-01', menge: 20 },
            Unbekannt: { sku: 'XYZ-99', menge: 1 }
        },
        code: `// 8) BESTELLUNG MIT LAGER
const SHOP = '{{SHOP}}';
const { sku, menge = 1 } = requestContext.body || {};
const anzahl = Number(menge);

// 1. Eingaben prüfen
if (!sku || !Number.isInteger(anzahl) || anzahl < 1 || anzahl > 20) {
    return { ok: false, fehler: 'Bitte sku und eine menge von 1 bis 20 angeben.' };
}

// 2. Lager und Produkt nachschlagen (parallel – höchstens 4 Aufrufe gleichzeitig)
const [lager, produkte] = await Promise.all([
    api.data.find(\`\${SHOP}/lager\`, { filter: { sku }, limit: 1 }),
    api.data.find(\`\${SHOP}/produkte\`, { filter: { sku }, limit: 1 })
]);
const eintrag = lager.data[0];
const produkt = produkte.data[0];
if (!eintrag || !produkt) return { ok: false, fehler: \`Unbekannter Artikel "\${sku}".\` };
if (eintrag.bestand < anzahl) return { ok: false, fehler: \`Nur noch \${eintrag.bestand} Stück an Lager.\` };

// 3. Bestand abbuchen – update ändert nur "bestand", alles andere bleibt
// (Hinweis für Profis: Zwei gleichzeitige Bestellungen könnten sich hier überholen.)
const neu = await api.data.update(\`\${SHOP}/lager\`, eintrag._sys_id, { bestand: eintrag.bestand - anzahl });

// 4. Bestellung speichern
const bestellung = await api.data.insert(\`\${SHOP}/bestellungen\`, {
    sku,
    name: produkt.name,
    menge: anzahl,
    total: Math.round(produkt.preis * anzahl * 100) / 100,
    kunde: requestContext.userUuid ?? 'anonym',
    status: 'bestellt'
});

return {
    ok: true,
    bestellung: bestellung._sys_id,
    artikel: produkt.name,
    total: 'CHF ' + (produkt.preis * anzahl).toFixed(2),
    restbestand: neu.bestand
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'joins',
        title: 'Bericht mit Joins',
        level: 'Profi',
        summary: 'Produkte und Lager in EINER Abfrage verbinden und auswerten.',
        learn: [
            'joins holen verknüpfte Daten über eine Relation (hier: produkte --lager--> lager)',
            'sourceKey/targetKey: welche Felder zusammengehören (sku = sku)',
            'single: true -> ein Objekt statt einer Liste',
            'Auch bei Joins zählen die Rechte der SSF'
        ],
        tools: ['data.find (joins)'],
        body: { knappAb: 5 },
        code: `// 9) BERICHT MIT JOINS
const SHOP = '{{SHOP}}';
const knappAb = Number(requestContext.body?.knappAb ?? 5);

const res = await api.data.find(\`\${SHOP}/produkte\`, {
    sort: { field: 'preis', order: 'DESC' },
    limit: 100,
    joins: [
        {
            relationType: 'lager',   // Relation vom Objekt "produkte" zum Objekt "lager"
            as: 'lager',             // unter diesem Namen hängt es am Produkt
            sourceKey: 'sku',        // Feld im Produkt …
            targetKey: 'sku',        // … passt zu diesem Feld im Lager
            single: true             // ein Eintrag statt Liste
        }
    ]
});

const zeilen = res.data.map(p => {
    const bestand = p.lager?.bestand ?? 0;
    return { name: p.name, preis: p.preis, bestand, wert: Math.round(p.preis * bestand * 100) / 100 };
});

return {
    produkte: zeilen.length,
    lagerwert: 'CHF ' + zeilen.reduce((summe, z) => summe + z.wert, 0).toFixed(2),
    knapp: zeilen.filter(z => z.bestand < knappAb).map(z => \`\${z.name} (\${z.bestand})\`),
    teuerstes: zeilen[0]?.name,
    zeilen
};
`
    },

    // ------------------------------------------------------------------
    {
        id: 'grenzen',
        title: 'Grenzen erleben',
        level: 'Profi',
        summary: 'Was passiert bei Endlosschleife, fehlenden Rechten, SSRF oder zu vielen Aufrufen?',
        learn: [
            'Der Wachhund stoppt Endlosschleifen nach 1 s Rechenzeit',
            'Fehlende Rechte und „gibt es nicht“ sehen gleich aus (verrät nichts)',
            'Interne Adressen (127.0.0.1, 10.x …) sind für http.fetch gesperrt',
            'Höchstens 50 Werkzeug-Aufrufe pro Ausführung'
        ],
        tools: ['alles'],
        body: { test: 'rechte' },
        presets: {
            'Fremde Daten': { test: 'rechte' },
            Endlosschleife: { test: 'schleife' },
            'Zu viele Aufrufe': { test: 'aufrufe' },
            'Interne Adresse (SSRF)': { test: 'ssrf' },
            'Reserviertes Feld': { test: 'reserviert' },
            'Eigener Fehler': { test: 'fehler' }
        },
        code: `// 10) GRENZEN ERLEBEN – jeder Test endet absichtlich mit einem Fehler (Status 422)
const SHOP = '{{SHOP}}';
const test = requestContext.body?.test || 'rechte';

if (test === 'rechte') {
    // Diese Domain gibt es nicht – oder die SSF hat keine Rechte. Die Meldung ist absichtlich dieselbe.
    await api.data.find('fremde-domain-die-es-nicht-gibt', {});
}

if (test === 'schleife') {
    // Rechnet ewig -> nach 1 s Rechenzeit stoppt der Wachhund die Sandbox
    let i = 0;
    while (true) i++;
}

if (test === 'aufrufe') {
    // 60 Aufrufe -> ab dem 51. ist Schluss. Jeder Aufruf scheitert hier absichtlich
    // sofort (keine gültige ID) – so zählt nur die Anzahl, nicht die Zeit.
    for (let i = 1; i <= 60; i++) {
        try {
            await api.data.get(SHOP, 'keine-gueltige-id');
        } catch (err) {
            if (String(err.message).includes('Zu viele')) throw new Error('Aufruf Nr. ' + i + ': ' + err.message);
        }
    }
}

if (test === 'ssrf') {
    // Versuch, einen internen Dienst des Servers zu erreichen -> gesperrt
    await api.http.fetch('https://127.0.0.1/admin');
}

if (test === 'reserviert') {
    // Felder mit _sys_ gehören dem System (sonst könnte man fremde Datensätze überschreiben)
    await api.data.insert(\`\${SHOP}/nachrichten\`, { _sys_id: 'gefälscht', text: 'hallo' });
}

if (test === 'fehler') {
    throw new Error('Das ist ein absichtlicher Fehler aus der SSF.');
}

return { hinweis: 'Unbekannter Test. Erlaubt: rechte, schleife, aufrufe, ssrf, reserviert, fehler' };
`
    },

    // ------------------------------------------------------------------
    {
        id: 'verkaufsautomat',
        title: 'Verkaufsautomat',
        level: 'Profi',
        summary: 'Eine Kopie für den Besucher klonen, verschenken und danach zurücktreten.',
        learn: [
            'api.objects.clone: Kopie als NEUE Domain – Code, auf Wunsch Daten, nie Tresor',
            'Die Kopie trägt ihre Herkunft (origin) mit',
            'api.roles.grant: der Besucher bekommt alles, auch blue',
            'api.roles.leave: die SSF tritt zurück – danach gehört die Kopie nur noch dem Besucher',
            'Dein Original bleibt geschützt: der Besucher bekommt nie Rechte darauf'
        ],
        tools: ['objects.clone', 'roles.grant', 'roles.leave'],
        body: { mitDaten: true },
        presets: {
            'Mit Daten': { mitDaten: true },
            'Nur Code': { mitDaten: false }
        },
        code: `// 11) VERKAUFSAUTOMAT
// Achtung: legt bei jedem Ausführen eine ECHTE neue Domain an.
// Die Kopie gehört danach dem Besucher – unter "Objekte" kann er sie
// in seine eigene Domain zügeln.
const kunde = requestContext.userUuid;
if (!kunde) {
    return { ok: false, fehler: 'Bitte zuerst etwas erstellen oder einloggen (dann bist du Gast/User).' };
}

// 1. Klonen: die Produkte als neue Domain (jeder Name existiert nur einmal)
const name = 'kauf-' + Math.random().toString(36).slice(2, 8);
const kopie = await api.objects.clone('{{SHOP}}/produkte', name, {
    withData: requestContext.body?.mitDaten !== false
});

// 2. Verschenken: der Kunde bekommt alle drei Rollen
for (const rolle of ['black', 'red', 'blue']) {
    await api.roles.grant(kopie.uuid, kunde, rolle);
}

// 3. Zurücktreten: Ab jetzt hat die SSF auf die Kopie keine Rechte mehr.
//    (Ginge nicht, wenn der Kunde kein blue hätte – das Objekt wäre herrenlos.)
const austritt = await api.roles.leave(kopie.uuid);

return {
    ok: true,
    kopie: kopie.domain,
    herkunft: kopie.origin,
    ssfHatAbgegeben: austritt.left,
    hinweis: 'Die Kopie gehört jetzt dir. Unter "Objekte" findest du sie – dort kannst du sie auch zügeln.'
};
`
    }
];

// Platzhalter ersetzen (reine Funktion, getestet)
// (Das Beispiel "Bibliothek" steht am Ende der Liste – siehe EXAMPLES.push unten.)
export const fillExample = (code, { shop }) => String(code).replaceAll('{{SHOP}}', shop || 'meine-domain');

export const findExample = id => EXAMPLES.find(e => e.id === id) || null;

// ------------------------------------------------------------------
// 12) BIBLIOTHEK (Plan "Lehren aus dem Restaurant-Test", E6)
EXAMPLES.push({
    id: 'bibliothek',
    title: 'Bibliothek',
    level: 'Fortgeschritten',
    summary: 'Gemeinsamen Code aus einer Bibliothek laden statt ihn in jede SSF zu kopieren.',
    learn: [
        'Eine Bibliothek ist ein Objekt mit der Code-Art „Bibliothek“ (library) – hier das Kind „helfer“',
        'api.lib.load lädt sie: exports.chf = … wird zu helfer.chf',
        'Die Bibliothek läuft IN dieser SSF – mit ihren Rechten (darum darf sie api.data benutzen)',
        'Aus einer fremden Domain nur mit angehefteter Version: { version: 3 }'
    ],
    tools: ['lib.load'],
    body: { menge: 3, preis: 19.9 },
    presets: {
        '3 Stück': { menge: 3, preis: 19.9 },
        'Zu viele': { menge: 50, preis: 19.9 }
    },
    code: `// 12) BIBLIOTHEK
// Den Code der Bibliothek siehst du unter "Code & DNA" beim Kind "helfer" (Reiter Bibliothek).
let helfer;
try {
    helfer = await api.lib.load('{{SHOP}}/helfer');
} catch (e) {
    if (e.code === 'NOT_FOUND') {
        return { fehler: 'Deine Spielwiese ist älter als die Bibliotheken – bitte eine neue anlegen.' };
    }
    throw e;
}

const { menge, preis } = requestContext.body || {};
if (!helfer.pruefeMenge(menge)) {
    return { ok: false, fehler: 'Menge muss 1 bis 20 sein.' };
}
return {
    ok: true,
    total: helfer.chf(menge * preis),
    produkteImShop: await helfer.anzahlProdukte('{{SHOP}}')
};
`
});

// ------------------------------------------------------------------
// 13) DATEI SCHREIBEN UND LESEN (Plan "R1 – Eine SSF schreibt und liest Dateien", R1c)
EXAMPLES.push({
    id: 'datei',
    title: 'Datei schreiben (CSV-Export)',
    level: 'Fortgeschritten',
    summary: 'Aus den Produkten eine CSV-Datei machen, ablegen und wieder lesen.',
    learn: [
        'api.files.write legt eine Datei als neue Version ab – hier im Kind „export“ (braucht red)',
        'Text-Dateien brauchen type (csv, ics, json, txt) – Bilder/PDFs gehen als base64',
        'api.files.read liest sie wieder, api.files.info zeigt die Versionen (ohne Inhalt)',
        'Platz zählt aufs Konto – Gäste haben keinen Datei-Speicher (e.code QUOTA_EXCEEDED)'
    ],
    tools: ['data.find', 'files.write', 'files.read', 'files.info'],
    body: { trennzeichen: ';' },
    presets: {
        'Strichpunkt (Excel CH)': { trennzeichen: ';' },
        Komma: { trennzeichen: ',' }
    },
    code: `// 13) DATEI SCHREIBEN UND LESEN (CSV-Export)
// Die SSF macht aus den Produkten eine CSV-Datei im Kind "export" – mit IHREN Rechten (red).
// Ansehen: Seite "Objekte" -> Kind "export" -> Reiter "Datei" (jedes Ausführen = neue Version).
const { trennzeichen = ';' } = requestContext.body || {};
const produkte = await api.data.find('{{SHOP}}/produkte', { sort: { field: 'name', order: 'ASC' }, limit: 100 });

// CSV-Regel: Ein Feld mit Trennzeichen, Anführungszeichen oder Zeilenumbruch kommt in "…"
const feld = wert => {
    const text = String(wert ?? '');
    return /["\\n]/.test(text) || text.includes(trennzeichen) ? '"' + text.replace(/"/g, '""') + '"' : text;
};
const zeilen = [['sku', 'name', 'kategorie', 'preis'].join(trennzeichen)];
for (const p of produkte.data) zeilen.push([p.sku, p.name, p.kategorie, p.preis].map(feld).join(trennzeichen));

let datei;
try {
    // type 'csv' sagt at0mic, was es ist (Text erkennt man nicht an den ersten Bytes)
    datei = await api.files.write('{{SHOP}}/export', zeilen.join('\\n') + '\\n', { type: 'csv', name: 'produkte.csv' });
} catch (e) {
    if (e.code === 'QUOTA_EXCEEDED') return { fehler: 'Dateien gibt es nur mit Login – Gäste haben keinen Speicher.' };
    if (e.code === 'FILES_DISABLED') return { fehler: 'Der Datei-Speicher ist auf diesem Server nicht eingerichtet.' };
    if (/Kein Zugriff oder nicht gefunden/.test(e.message)) {
        return { fehler: 'Deine Spielwiese ist älter als das Kind "export" – bitte eine neue anlegen.' };
    }
    throw e;
}

// Wieder lesen (Text kommt als Text) und alle Versionen ansehen (ohne Inhalt)
const zurueck = await api.files.read('{{SHOP}}/export');
const info = await api.files.info('{{SHOP}}/export');
return {
    ok: true,
    datei,                                   // version, kind, bytes, sha256 …
    versionen: info.versions.length,         // die neuesten 3 bleiben
    vorschau: zurueck.text.split('\\n').slice(0, 4)
};
`
});

// ------------------------------------------------------------------
// 14) LIVE-NACHRICHT (Plan "W – Live-Verbindungen", W4)
EXAMPLES.push({
    id: 'live',
    title: 'Live-Nachricht senden',
    level: 'Fortgeschritten',
    summary: 'Eine Nachricht speichern und sofort an alle schicken, die auf der Website zuhören.',
    learn: [
        'api.live.send(kanal, nachricht) schickt sofort an alle offenen Seiten, die zuhören',
        'Ohne ziel ist es der Kanal der SSF selbst – dafür braucht sie kein Recht',
        'Kanäle speichern nichts: zuerst in den Daten speichern, dann senden',
        'Auf der Website: <script src="/_vindelis/live.js"> und vindelis.live.listen(pfad, kanal, …)'
    ],
    tools: ['data.insert', 'live.send'],
    body: { text: 'Hallo zusammen!' },
    presets: {
        Gruss: { text: 'Hallo zusammen!' },
        'Neue Bestellung': { text: 'Tisch 4: 2x Rösti' }
    },
    code: `// 14) LIVE-NACHRICHT
// Auf einer echten Website hört das JavaScript so zu (siehe Anleitung "live"):
//     <script src="/_at0mic/live.js"></script>
//     at0mic.live.listen('api', 'chat', nachricht => zeigeAn(nachricht));
// Hier in der Spielwiese hört niemand zu – die Nachricht geht trotzdem raus.
const text = String((requestContext.body || {}).text || '').trim().slice(0, 500);
if (!text) return { fehler: 'Bitte einen Text schicken, z.B. { "text": "Hallo" }.' };

const nachricht = { text, zeit: new Date().toISOString() };

// 1. Zuerst speichern: Wer gerade nicht zuhört, holt es später aus den Daten
await api.data.insert('{{SHOP}}/nachrichten', nachricht);

// 2. Dann allen zeigen, die zuhören (max. 16 KB, max. 20 pro Ausführung)
const live = await api.live.send('chat', nachricht);

return { ok: true, live, nachricht };
`
});
