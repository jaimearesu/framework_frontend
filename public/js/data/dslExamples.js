// js/data/dslExamples.js
// ---------------------------------------------------------------------
// BEISPIELE FÜR DIE SUCH-SPRACHE (Query-DSL)
//
// Passen zu den Produkten der Spielwiese (SSF-Studio):
//   { sku, name, kategorie, preis }   z.B. { sku: 'SCH-01', name: 'Sneaker', kategorie: 'Schuhe', preis: 89.9 }
// und zur Relation produkte --"lager"--> lager ({ sku, bestand }).
//
// Eine Abfrage hat bis zu vier Teile (alle freiwillig):
//   filter  – welche Datensätze?
//   sort    – in welcher Reihenfolge? { field, order: 'ASC' | 'DESC' }
//   select  – welche Felder zurückgeben? ['name', 'preis']
//   joins   – verknüpfte Daten über Relationen dazuholen
// Seitengrösse und Blättern laufen über die Adresse (limit, Cursor).
// ---------------------------------------------------------------------

export const DSL_EXAMPLES = [
    {
        id: 'alles',
        title: 'Alles',
        group: 'Grundlagen',
        text: 'Leere Abfrage: alle Datensätze, die neusten zuerst.',
        query: {}
    },
    {
        id: 'exakt',
        title: 'Genau gleich',
        group: 'Grundlagen',
        text: 'Ein Feld hat genau diesen Wert. Mehrere Felder = alle müssen passen (UND).',
        query: { filter: { kategorie: 'Schuhe' } }
    },
    {
        id: 'bereich',
        title: 'Von … bis',
        group: 'Vergleiche',
        text: '$gte (≥), $gt (>), $lte (≤), $lt (<). Zahlen werden als Zahlen verglichen.',
        query: { filter: { preis: { $gte: 20, $lt: 100 } }, sort: { field: 'preis', order: 'ASC' } }
    },
    {
        id: 'ungleich',
        title: 'Nicht gleich',
        group: 'Vergleiche',
        text: '$ne: alles ausser diesem Wert.',
        query: { filter: { kategorie: { $ne: 'Kleider' } } }
    },
    {
        id: 'liste',
        title: 'Einer von mehreren',
        group: 'Vergleiche',
        text: '$in: der Wert steht in der Liste.',
        query: { filter: { sku: { $in: ['SCH-01', 'KLE-02', 'ACC-03'] } } }
    },
    {
        id: 'like',
        title: 'Beginnt mit …',
        group: 'Text',
        text: '$like mit % als Platzhalter (Gross/Klein zählt). "S%" = beginnt mit S.',
        query: { filter: { name: { $like: 'S%' } }, sort: { field: 'name', order: 'ASC' } }
    },
    {
        id: 'ilike',
        title: 'Enthält (egal ob gross/klein)',
        group: 'Text',
        text: '$ilike: wie $like, aber Gross/Klein egal. "%schuh%" findet Wanderschuh.',
        query: { filter: { name: { $ilike: '%schuh%' } } }
    },
    {
        id: 'volltext',
        title: 'Volltextsuche',
        group: 'Text',
        text: '$search sucht Wörter im Text (Volltext), unabhängig von der Reihenfolge.',
        query: { filter: { name: { $search: 'wanderschuh' } } }
    },
    {
        id: 'exists',
        title: 'Feld vorhanden?',
        group: 'Vergleiche',
        text: '$exists: true = Feld muss da sein, false = Feld darf nicht da sein.',
        query: { filter: { rabatt: { $exists: false } }, select: ['name', 'preis'] }
    },
    {
        id: 'oder',
        title: 'Oder',
        group: 'Logik',
        text: '$or: mindestens eine der Bedingungen muss passen.',
        query: {
            filter: { $or: [{ kategorie: 'Kleider' }, { preis: { $lt: 20 } }] },
            sort: { field: 'preis', order: 'DESC' }
        }
    },
    {
        id: 'und-oder',
        title: 'Und + Oder kombiniert',
        group: 'Logik',
        text: 'Günstig (unter 50) UND (Schuhe ODER Accessoires). $and und $or lassen sich verschachteln.',
        query: {
            filter: {
                $and: [{ preis: { $lt: 50 } }, { $or: [{ kategorie: 'Schuhe' }, { kategorie: 'Accessoires' }] }]
            },
            sort: { field: 'preis', order: 'ASC' }
        }
    },
    {
        id: 'select',
        title: 'Nur bestimmte Felder',
        group: 'Ausgabe',
        text: 'select liefert nur diese Felder (plus _sys_id und _sys_created_at). Spart Daten.',
        query: { select: ['name', 'preis'], sort: { field: 'preis', order: 'DESC' } }
    },
    {
        id: 'alt-zuerst',
        title: 'Älteste zuerst',
        group: 'Ausgabe',
        text: 'Nach Erstellungszeit sortieren: _sys_created_at (ASC = älteste zuerst).',
        query: { sort: { field: '_sys_created_at', order: 'ASC' } }
    },
    {
        id: 'join',
        title: 'Join: Lagerbestand dazu',
        group: 'Joins',
        text: 'Holt über die Relation "lager" den passenden Lager-Eintrag (sku = sku) und hängt ihn als Feld "lager" an. Braucht die Relation produkte → lager.',
        query: {
            select: ['sku', 'name', 'preis'],
            joins: [{ relationType: 'lager', as: 'lager', sourceKey: 'sku', targetKey: 'sku', single: true }],
            sort: { field: 'preis', order: 'DESC' }
        }
    },
    {
        id: 'join-filter',
        title: 'Join mit Filter',
        group: 'Joins',
        text: 'Nur Lager-Einträge mit weniger als 5 Stück anhängen. Produkte ohne passenden Eintrag bekommen null.',
        query: {
            joins: [
                {
                    relationType: 'lager',
                    as: 'knapp',
                    sourceKey: 'sku',
                    targetKey: 'sku',
                    single: true,
                    filter: { bestand: { $lt: 5 } }
                }
            ]
        }
    }
];

export const DSL_GROUPS = ['Grundlagen', 'Vergleiche', 'Text', 'Logik', 'Ausgabe', 'Joins'];

// Kurzübersicht aller Operatoren (für die Hilfe)
export const DSL_OPERATORS = [
    ['{ feld: wert }', 'genau gleich'],
    ['$ne', 'nicht gleich'],
    ['$gt · $gte', 'grösser · grösser/gleich'],
    ['$lt · $lte', 'kleiner · kleiner/gleich'],
    ['$in', 'einer der Werte in der Liste'],
    ['$like · $ilike', 'Text-Muster mit % (ilike: Gross/Klein egal)'],
    ['$search', 'Volltextsuche nach Wörtern'],
    ['$exists', 'Feld vorhanden (true) oder nicht (false)'],
    ['$and · $or', 'Bedingungen verknüpfen (verschachtelbar)'],
    ['_sys_id · _sys_created_at', 'System-Felder (ID, Erstellungszeit)']
];

// Zufällige Test-Produkte erzeugen – zum Ausprobieren von Blättern und Zählen
// (reine Funktion, getestet; zufall kann für Tests fest vorgegeben werden)
export const makeTestProducts = (anzahl, zufall = Math.random) => {
    const namen = ['Sneaker', 'Hoodie', 'Mütze', 'Rucksack', 'Jacke', 'Socken', 'Schal', 'Gürtel', 'Sandale', 'Tasche'];
    const kategorien = ['Schuhe', 'Kleider', 'Accessoires'];
    return Array.from({ length: anzahl }, (_, i) => ({
        sku: `TST-${String(i + 1).padStart(4, '0')}`,
        name: `${namen[Math.floor(zufall() * namen.length)]} ${i + 1}`,
        kategorie: kategorien[Math.floor(zufall() * kategorien.length)],
        preis: Math.round(zufall() * 20000) / 100,
        testdaten: true
    }));
};
