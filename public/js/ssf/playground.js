// js/ssf/playground.js
// ---------------------------------------------------------------------
// DIE SPIELWIESE – eine fertige Umgebung für alle SSF-Beispiele
//
// Mit einem Klick legt das Cockpit (mit DEINEN Rechten, über die normale
// HTTP-API) diese Objekte an:
//
//   studio-xxxx              neue Domain (du bist Besitzer)
//   ├── funktion             hier liegt der SSF-Code
//   ├── produkte             10 Beispiel-Produkte
//   ├── lager                10 Lager-Einträge (gleiche sku)
//   ├── nachrichten          leer
//   └── bestellungen         leer
//   + Relation produkte --"lager"--> lager (für Joins)
//
// Warum als Kinder? Ein Kind bekommt dieselben Rollen wie das Eltern-
// Objekt. Die SSF "funktion" darf darum alle Geschwister lesen (black)
// und beschreiben (red) – mit ihren EIGENEN Rechten.
//
// Welche Spielwiese zu welchem Backend gehört (Live/Test), merkt sich
// der Browser (localStorage).
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { apiBase } from '../core/config.js';
import { load, save } from '../core/storage.js';
import { invalidateObjects, childRefFor, loadCode, saveCode } from '../core/objects.js';
import { addChildToDna } from '../core/dna.js';
import { EXAMPLES, fillExample } from './examples.js';

export const CHILDREN = ['funktion', 'produkte', 'lager', 'nachrichten', 'bestellungen'];

export const SEED_PRODUCTS = [
    { sku: 'SCH-01', name: 'Sneaker', kategorie: 'Schuhe', preis: 89.9 },
    { sku: 'SCH-02', name: 'Wanderschuh', kategorie: 'Schuhe', preis: 149 },
    { sku: 'SCH-03', name: 'Sandalen', kategorie: 'Schuhe', preis: 39 },
    { sku: 'KLE-01', name: 'T-Shirt', kategorie: 'Kleider', preis: 19.9 },
    { sku: 'KLE-02', name: 'Hoodie', kategorie: 'Kleider', preis: 59 },
    { sku: 'KLE-03', name: 'Regenjacke', kategorie: 'Kleider', preis: 129 },
    { sku: 'MUE-01', name: 'Wollmütze', kategorie: 'Accessoires', preis: 24.5 },
    { sku: 'ACC-01', name: 'Rucksack', kategorie: 'Accessoires', preis: 79 },
    { sku: 'ACC-02', name: 'Sonnenbrille', kategorie: 'Accessoires', preis: 45 },
    { sku: 'ACC-03', name: 'Trinkflasche', kategorie: 'Accessoires', preis: 15 }
];

export const SEED_STOCK = [
    { sku: 'SCH-01', bestand: 12 },
    { sku: 'SCH-02', bestand: 3 },
    { sku: 'SCH-03', bestand: 6 },
    { sku: 'KLE-01', bestand: 40 },
    { sku: 'KLE-02', bestand: 8 },
    { sku: 'KLE-03', bestand: 2 },
    { sku: 'MUE-01', bestand: 4 },
    { sku: 'ACC-01', bestand: 15 },
    { sku: 'ACC-02', bestand: 0 },
    { sku: 'ACC-03', bestand: 60 }
];

// Speicher-Schlüssel je Backend (Live und Test haben verschiedene Spielwiesen)
const storageKey = () => 'playground.' + apiBase();

export const getPlayground = () => load(storageKey());
export const forgetPlayground = () => save(storageKey(), null);

// Gibt es die gemerkte Spielwiese im Backend noch? (z.B. nach "npm test" in der Test-DB nicht mehr)
export const checkPlayground = (pg, objects) => Boolean(pg && objects.some(o => o.uuid === pg.uuids?.funktion));

// Zufälliger, gut lesbarer Name wie "studio-k3x9"
const randomName = () => 'studio-' + Math.random().toString(36).slice(2, 6);

// Spielwiese anlegen. step(text, result) meldet jeden Schritt (für die Anzeige).
export const createPlayground = async ({ step = () => {} } = {}) => {
    const must = (text, res) => {
        step(text, res);
        if (!res.ok) throw new Error(`${text}: ${res.error}`);
        return res;
    };

    // 1. Domain
    const domain = randomName();
    const root = must(`Domain „${domain}“ anlegen`, await api.post('/api/objects', { domain })).data.data;

    // 2. Kinder – nacheinander (die Nummerierung der Zweige hängt vom vorherigen ab)
    const uuids = { root: root.uuid };
    const children = [];
    for (const name of CHILDREN) {
        const res = must(
            `Kind „${name}“ anhängen`,
            await api.post(`/api/objects/${root.uuid}/links`, { domainRef: domain, pathStep: 0, identifier: name })
        );
        uuids[name] = res.data.data.uuid;
        children.push({ name, object: res.data.data });
    }

    // 3. Kinder in die DNA der Domain eintragen (sonst gibt es keine Pfade wie "studio-x/produkte")
    const code = await loadCode(root.uuid);
    let dna = code.code.syntax
        ? JSON.parse(code.code.syntax)
        : { type: 'instance', identifier: domain, domain, source: ['0'] };
    for (const c of children) dna = addChildToDna(dna, childRefFor(c.object, c.name));
    must(
        'Kinder in die DNA eintragen',
        await saveCode(root.uuid, [{ type: 'syntax', code: JSON.stringify(dna, null, 2) }])
    );

    // 4. Beispiel-Daten
    must('10 Produkte speichern', await api.post(`/api/core-data/${uuids.produkte}`, { data: SEED_PRODUCTS }));
    must('10 Lager-Einträge speichern', await api.post(`/api/core-data/${uuids.lager}`, { data: SEED_STOCK }));

    // 5. Relation für Joins
    must(
        'Relation produkte → lager',
        await api.post(`/api/relations/${uuids.produkte}`, { targetUuid: uuids.lager, relationType: 'lager' })
    );

    // 6. Erstes Beispiel als SSF-Code speichern
    const hello = EXAMPLES[0];
    must(
        'SSF-Code „Hallo Welt“ speichern',
        await saveCode(uuids.funktion, [{ type: 'ssf', code: fillExample(hello.code, { shop: domain }) }])
    );

    const pg = { domain, uuids, createdAt: new Date().toISOString() };
    save(storageKey(), pg);
    invalidateObjects();
    return pg;
};
