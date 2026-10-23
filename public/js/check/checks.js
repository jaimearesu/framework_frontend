// js/check/checks.js
// ---------------------------------------------------------------------
// ALLE PRÜFUNGEN DES SYSTEMCHECKS
//
// Sie laufen der Reihe nach gegen das gewählte Backend (Live oder Test)
// und bauen sich dabei eine eigene kleine Welt:
//
//   check-xxxx               neue Domain (du bist Besitzer)
//   ├── funktion             die Test-SSF
//   ├── daten                12 Test-Datensätze
//   └── lager                Ziel einer Relation (für Joins)
//
// AUFRÄUMEN: Die letzte Gruppe "Löschen & Aufräumen" löscht alles wieder,
// was der Check angelegt hat (von unten nach oben, DELETE /api/objects/:uuid).
// Die Namen bleiben danach gesperrt – sie sind zufällig, das stört nicht.
// Bricht der Check vorher ab, bleibt ein Rest liegen – darum fragt der
// Systemcheck im Live-Modus weiterhin nach.
//
// WEBSITE (Plan "Bauarbeiter"): Mit Login wird die Check-Domain kurz öffentlich
// gemacht, ihr Bauplan geholt und sie gleich wieder privat gestellt.
//
// KI-ZUGANG (Plan "MCP"): Mit Login erzeugt der Check einen Schlüssel für die
// Test-Domain und prüft, was die KI darf und was nicht. Er wird am Ende der
// Gruppe widerrufen und verschwindet beim Aufräumen mit der Domain.
//
// WERKZEUGE (Plan "MCP Etappe 5c"): ein Werkzeug-Kind mit SSF + Beschreibung,
// benutzt, falsch benutzt und am Ende der Gruppe wieder gelöscht.
//
// Jede Prüfung: { id, group, title, needs?, run(ctx) }  (siehe runner.js)
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { apiBase } from '../core/config.js';
import { childRefFor } from '../core/objects.js';
import { addChildToDna } from '../core/dna.js';
import { screenshotSource } from '../core/site.js';
import { expect, expectStatus } from './runner.js';

// Die Beschreibung des Test-Werkzeugs (Code-Art "werkzeug")
const TOOL_SPEC = {
    name: 'addieren',
    beschreibung: 'Addiert zwei Zahlen (Systemcheck).',
    eingabe: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
        additionalProperties: false
    },
    beispiele: [{ eingabe: { a: 1, b: 2 } }],
    version: 1
};

const RECORDS = [
    { sku: 'A1', name: 'Apfel rot', kategorie: 'obst', preis: 2.5 },
    { sku: 'A2', name: 'Birne', kategorie: 'obst', preis: 3 },
    { sku: 'A3', name: 'Banane', kategorie: 'obst', preis: 1.2 },
    { sku: 'A4', name: 'Kirsche', kategorie: 'obst', preis: 12 },
    { sku: 'G1', name: 'Karotte', kategorie: 'gemuese', preis: 0.9 },
    { sku: 'G2', name: 'Lauch', kategorie: 'gemuese', preis: 2.2 },
    { sku: 'G3', name: 'Kartoffel festkochend', kategorie: 'gemuese', preis: 1.5 },
    { sku: 'G4', name: 'Tomate', kategorie: 'gemuese', preis: 4.8 },
    { sku: 'B1', name: 'Brot hell', kategorie: 'brot', preis: 3.6 },
    { sku: 'B2', name: 'Zopf', kategorie: 'brot', preis: 6.9 },
    { sku: 'B3', name: 'Gipfeli', kategorie: 'brot', preis: 1.3 },
    { sku: 'X1', name: 'Geschenkkarte', kategorie: 'extra', preis: 100 }
];

// SSF speichern und ausführen (Hilfsfunktion für mehrere Prüfungen)
// query: z.B. '?as=anonymous' (Plan "Lehren aus dem Restaurant-Test", E2)
const runSsf = async (ctx, code, body = {}, query = '') => {
    const save = await api.post(`/api/ast/${ctx.funktion}`, { snippets: [{ type: 'ssf', code }] });
    expectStatus(save, 201, 'SSF speichern');
    return api.post(`/api/functions/${ctx.funktion}/executions${query}`, body);
};

// Eine SSF MUSS mit einer bestimmten Meldung scheitern (422)
const expectSsfError = async (ctx, code, pattern, what) => {
    const r = await runSsf(ctx, code);
    expectStatus(r, 422, what);
    const details = String(r.data?.details || '');
    expect(pattern.test(details), `${what}: unerwartete Meldung "${details}"`, r);
    return details.length > 90 ? details.slice(0, 87) + '…' : details;
};

export const CHECKS = [
    // ============================================================== VERBINDUNG
    {
        id: 'health',
        group: 'Verbindung',
        title: 'Backend erreichbar',
        run: async ctx => {
            const r = await api.get('/api/health');
            expect(r.status !== 0, 'Backend antwortet nicht – läuft der Server?', r);
            expectStatus(r, 200, 'GET /api/health');
            ctx.health = r.data;
            return `Antwort in ${r.ms} ms`;
        }
    },
    {
        id: 'database',
        group: 'Verbindung',
        title: 'Datenbank verbunden',
        needs: ['health'],
        run: async ctx => {
            expect(ctx.health.database === 'ok', 'Die Datenbank antwortet nicht (SSH-Tunnel?)');
            return ctx.health.testMode ? 'Test-Datenbank' : 'echte Datenbank';
        }
    },
    {
        id: 'sandbox',
        group: 'Verbindung',
        title: 'SSF-Sandbox bereit',
        needs: ['health'],
        run: async ctx => {
            const s = ctx.health.sandbox;
            expect(s && s.memoryMb > 0 && s.cpuMs > 0, 'Keine Angaben zur Sandbox');
            return `${s.memoryMb} MB, ${s.cpuMs} ms Rechenzeit, ${s.running} aktiv`;
        }
    },
    {
        id: 'not-found',
        group: 'Verbindung',
        title: 'Unbekannte Adresse gibt sauberes 404 (JSON)',
        run: async () => {
            const r = await api.get('/api/gibt-es-nicht');
            expectStatus(r, 404, 'GET /api/gibt-es-nicht');
            expect(r.data && typeof r.data.error === 'string', 'Antwort ist kein JSON mit "error"', r);
            return r.data.error;
        }
    },
    {
        id: 'bad-json',
        group: 'Verbindung',
        title: 'Kaputtes JSON wird abgelehnt (400)',
        run: async () => {
            // absichtlich OHNE den API-Client: wir schicken ungültiges JSON
            const res = await fetch(apiBase() + '/api/objects', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: '{ "domain": kaputt'
            }).catch(() => {
                throw new Error('Backend nicht erreichbar. Läuft der Server?');
            });
            const data = await res.json().catch(() => ({}));
            expect(res.status === 400, `erwartet 400, bekommen ${res.status}`);
            return data.error || '400';
        }
    },

    // ============================================================== IDENTITÄT & OBJEKTE
    {
        id: 'create-domain',
        group: 'Objekte',
        title: 'Domain anlegen (du wirst bei Bedarf Gast)',
        run: async ctx => {
            ctx.domainName = 'check-' + Math.random().toString(36).slice(2, 8);
            const r = await api.post('/api/objects', { domain: ctx.domainName });
            expectStatus(r, 201, 'POST /api/objects');
            ctx.root = r.data.data.uuid;
            const me = await api.get('/api/me');
            expect(
                me.data?.isGuest || me.data?.isAuthenticated,
                'Nach dem Anlegen solltest du Gast oder eingeloggt sein',
                me
            );
            return `${ctx.domainName} (${me.data.isAuthenticated ? 'eingeloggt' : 'Gast'})`;
        }
    },
    {
        id: 'limits',
        group: 'Objekte',
        title: 'Kontingent: /api/me zeigt Profil, Verbrauch und Grenzen',
        needs: ['root'],
        run: async () => {
            const me = await api.get('/api/me');
            expectStatus(me, 200, 'GET /api/me');
            const l = me.data?.limits;
            expect(l && typeof l.profile === 'string', 'limits.profile fehlt (Backend zu alt?)', me);
            expect(l.rate && l.rate.requests > 0, 'limits.rate (Bremse) fehlt', me);
            const o = l.usage?.objects;
            expect(
                o && o.used >= 1 && o.limit > o.used,
                'Verbrauch "objects" fehlt oder ist unplausibel (die Check-Domain zählt schon mit)',
                me
            );
            return `Profil ${l.profile}: ${o.used} / ${o.limit} Objekte`;
        }
    },
    {
        id: 'duplicate-domain',
        group: 'Objekte',
        title: 'Doppelte Domain wird abgelehnt (409)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.post('/api/objects', { domain: ctx.domainName });
            expectStatus(r, 409, 'Domain nochmals anlegen');
            return r.error;
        }
    },
    {
        id: 'invalid-domain',
        group: 'Objekte',
        title: 'Ungültiger Name wird abgelehnt (400)',
        run: async () => {
            const r = await api.post('/api/objects', { domain: 'mit/schraegstrich' });
            expectStatus(r, 400, 'Domain mit "/"');
            return r.error;
        }
    },
    {
        id: 'children',
        group: 'Objekte',
        title: 'Kinder anhängen und in die DNA eintragen',
        needs: ['root'],
        run: async ctx => {
            let dna = { type: 'instance', identifier: ctx.domainName, domain: ctx.domainName, source: ['0'] };
            for (const name of ['funktion', 'daten', 'lager']) {
                const r = await api.post(`/api/objects/${ctx.root}/links`, {
                    domainRef: ctx.domainName,
                    pathStep: 0,
                    identifier: name
                });
                expectStatus(r, 201, `Kind "${name}"`);
                ctx[name] = r.data.data.uuid;
                dna = addChildToDna(dna, childRefFor(r.data.data, name));
            }
            const s = await api.post(`/api/ast/${ctx.root}`, {
                snippets: [{ type: 'syntax', code: JSON.stringify(dna) }]
            });
            expectStatus(s, 201, 'DNA speichern');
            return 'funktion, daten, lager';
        }
    },
    {
        id: 'tree',
        group: 'Objekte',
        title: 'Baum wird aufgelöst',
        needs: ['daten'],
        run: async ctx => {
            const r = await api.get(`/api/ast/${ctx.root}/tree`);
            expectStatus(r, 200, 'GET …/tree');
            const ids = (r.data.tree?.children || []).map(c => c.identifier);
            expect(
                ['funktion', 'daten', 'lager'].every(i => ids.includes(i)),
                `Kinder im Baum: ${ids.join(', ')}`,
                r
            );
            return `${ids.length} Kinder`;
        }
    },
    {
        id: 'path',
        group: 'Objekte',
        title: 'Pfad auflösen wie ein Besucher',
        needs: ['daten'],
        run: async ctx => {
            const r = await api.get(`/api/ast/tree/path/${ctx.domainName}/daten`);
            expectStatus(r, 200, 'GET /api/ast/tree/path/…');
            expect(r.data.targetUuid === ctx.daten, 'Der Pfad führt zum falschen Objekt', r);
            return `${ctx.domainName}/daten → richtig`;
        }
    },

    // ============================================================== CODE
    {
        id: 'code-save',
        group: 'Code',
        title: 'HTML, CSS und JS speichern und laden',
        needs: ['root'],
        run: async ctx => {
            const s = await api.post(`/api/ast/${ctx.root}`, {
                snippets: [
                    { type: 'html', code: '<h1 class="t">Systemcheck</h1>' },
                    { type: 'css', code: '.t { color: red; }' },
                    { type: 'javascript', code: 'const x = 1 + 1;' }
                ]
            });
            expectStatus(s, 201, 'Code speichern');
            const g = await api.get(`/api/ast/${ctx.root}`);
            expectStatus(g, 200, 'Code laden');
            expect(
                g.data.data.html?.includes('Systemcheck') &&
                    g.data.data.css?.includes('color') &&
                    g.data.data.javascript?.includes('x'),
                'Nicht alles kam zurück',
                g
            );
            return `Schritt ${s.data.savedDetails?.step}`;
        }
    },
    {
        id: 'code-comments',
        group: 'Code',
        title: 'Kommentare bleiben beim Speichern erhalten',
        needs: ['root'],
        run: async ctx => {
            const s = await api.post(`/api/ast/${ctx.root}`, {
                snippets: [{ type: 'javascript', code: '// Systemcheck-Kommentar\nconst y = 2;' }]
            });
            expectStatus(s, 201, 'Code speichern');
            const g = await api.get(`/api/ast/${ctx.root}`);
            expect(g.data.data.javascript?.includes('// Systemcheck-Kommentar'), 'Der Kommentar ist verschwunden', g);
            return 'Kommentar noch da';
        }
    },
    // Plan "Geo-Monitor", G3: Beim Speichern sagt at0mic, was GENAU angekommen ist
    // (Zeichen, Bytes, Zeilen, Prüfwert) – damit eine KI verlorene Backslashes bemerkt
    {
        id: 'code-received',
        group: 'Code',
        title: 'Empfangsbestätigung beim Speichern (received: Zeichen, Prüfwert)',
        needs: ['root'],
        run: async ctx => {
            const code = 'const re = /\\d+\\\\/; // grüezi 🚀\r\nconst z = 3;';
            const s = await api.post(`/api/ast/${ctx.root}`, { snippets: [{ type: 'javascript', code }] });
            expectStatus(s, 201, 'Code speichern');
            const received = s.data.formatted?.[0]?.received;
            expect(received, 'received fehlt in der Antwort', s);
            const bytes = new TextEncoder().encode(code);
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
            expect(received.chars === [...code].length, `chars: ${received.chars}`, s);
            expect(received.bytes === bytes.length, `bytes: ${received.bytes}`, s);
            expect(received.lines === 2, `lines: ${received.lines}`, s);
            expect(received.sha256 === hex, `sha256 passt nicht: ${received.sha256}`, s);
            return `${received.chars} Zeichen, Prüfwert stimmt`;
        }
    },
    {
        id: 'code-syntax-error',
        group: 'Code',
        title: 'Syntaxfehler wird erkannt (422)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.post(`/api/ast/${ctx.root}`, { snippets: [{ type: 'javascript', code: 'const = ;' }] });
            expectStatus(r, 422, 'kaputter JS-Code');
            return String(r.data?.details || r.error);
        }
    },
    {
        id: 'code-error-location',
        group: 'Code',
        title: 'Syntaxfehler nennt Zeile, Spalte und Ausschnitt',
        needs: ['root'],
        run: async ctx => {
            const r = await api.post(`/api/ast/${ctx.root}`, {
                snippets: [{ type: 'javascript', code: 'const a = 1;\nconst b = ;' }]
            });
            expectStatus(r, 422, 'kaputter JS-Code');
            const loc = r.data?.location;
            expect(loc?.line === 2 && loc?.column === 11, `Stelle ${loc?.line}:${loc?.column} statt 2:11`, r);
            expect(String(loc?.excerpt || '').includes('> 2 |'), 'Ausschnitt mit Pfeil fehlt', r);
            return `Zeile ${loc.line}, Spalte ${loc.column}`;
        }
    },
    {
        id: 'code-es2022',
        group: 'Code',
        title: 'ECMAScript 2022 (Klassen-Felder, ??=) lässt sich speichern',
        needs: ['root'],
        run: async ctx => {
            const code = 'class Z { #n = 1; static m = 2; }\nlet q = null;\nq ??= 3;';
            const s = await api.post(`/api/ast/${ctx.root}`, { snippets: [{ type: 'javascript', code }] });
            expectStatus(s, 201, 'ES2022-Code speichern');
            const g = await api.get(`/api/ast/${ctx.root}`);
            expect(g.data?.data?.javascript?.includes('#n = 1'), 'Klassen-Feld ging verloren', g);
            return '#privat · static · ??=';
        }
    },
    {
        id: 'dna-unknown-domain',
        group: 'Code',
        title: 'DNA mit unbekannter Domain wird abgelehnt',
        needs: ['root'],
        run: async ctx => {
            const dna = {
                domain: ctx.domainName,
                children: [{ identifier: 'x', domain: 'gibt-es-sicher-nicht-' + Date.now() }]
            };
            const r = await api.post(`/api/ast/${ctx.root}`, {
                snippets: [{ type: 'syntax', code: JSON.stringify(dna) }]
            });
            expectStatus(r, 422, 'DNA mit fremder Domain');
            return r.error;
        }
    },
    // Plan "Lehren aus dem Restaurant-Test", E5: Bündel – hier nur Probelauf (schreibt nichts)
    {
        id: 'bundle-dry-run',
        group: 'Code',
        title: 'Bündel: Probelauf zeigt den Plan, Fehler im Code wird mit Teil und Zeile gemeldet',
        needs: ['root'],
        run: async ctx => {
            const probe = await api.post(`/api/objects/${ctx.root}/bundle`, {
                dry_run: true,
                children: [{ identifier: 'check-teil', code: { html: '<p>Probe</p>' } }]
            });
            expectStatus(probe, 200, 'Probelauf');
            expect(probe.data?.data?.children?.[0]?.action === 'create', 'Plan fehlt', probe);
            const bad = await api.post(`/api/objects/${ctx.root}/bundle`, {
                dry_run: true,
                children: [{ identifier: 'check-teil', code: { ssf: 'return (;' } }]
            });
            expectStatus(bad, 422, 'Fehler im Code');
            expect(/Kind "check-teil", ssf: Zeile 1/.test(String(bad.data?.details?.[0])), 'Meldung ohne Zeile', bad);
            return 'Plan: create; Fehler mit Teil und Zeile';
        }
    },

    // ============================================================== DATEN
    {
        id: 'data-insert',
        group: 'Daten & Suche',
        title: '12 Datensätze speichern',
        needs: ['daten'],
        run: async ctx => {
            const r = await api.post(`/api/core-data/${ctx.daten}`, { data: RECORDS });
            expectStatus(r, 201, 'Datensätze speichern');
            ctx.dataInserted = true;
            return `${RECORDS.length} gespeichert`;
        }
    },
    {
        id: 'data-filter',
        group: 'Daten & Suche',
        title: 'Suche mit Filter und Zählung',
        needs: ['dataInserted'],
        run: async ctx => {
            const r = await api.post(`/api/core-data/search/${ctx.daten}`, {
                filter: { kategorie: 'obst', preis: { $lt: 5 } }
            });
            expectStatus(r, 200, 'Suche');
            expect(r.data.meta.total_count === 3, `erwartet 3 Treffer, bekommen ${r.data.meta.total_count}`, r);
            return '3 Treffer (obst unter 5)';
        }
    },
    {
        id: 'data-or',
        group: 'Daten & Suche',
        title: 'Suche mit $or und $in',
        needs: ['dataInserted'],
        run: async ctx => {
            const r = await api.post(`/api/core-data/search/${ctx.daten}`, {
                filter: { $or: [{ kategorie: 'brot' }, { sku: { $in: ['A1', 'G1'] } }] }
            });
            expectStatus(r, 200, 'Suche');
            expect(r.data.meta.total_count === 5, `erwartet 5, bekommen ${r.data.meta.total_count}`, r);
            return '5 Treffer';
        }
    },
    {
        id: 'data-search',
        group: 'Daten & Suche',
        title: 'Volltextsuche ($search)',
        needs: ['dataInserted'],
        run: async ctx => {
            const r = await api.post(`/api/core-data/search/${ctx.daten}`, {
                filter: { name: { $search: 'festkochend' } }
            });
            expectStatus(r, 200, 'Suche');
            expect(r.data.data.length === 1 && r.data.data[0].sku === 'G3', 'Falscher Treffer', r);
            return 'Kartoffel gefunden';
        }
    },
    {
        id: 'data-sort-number',
        group: 'Daten & Suche',
        title: 'Sortierung nach Zahl (100 vor 12 vor 6.9)',
        needs: ['dataInserted'],
        run: async ctx => {
            const r = await api.post(
                `/api/core-data/search/${ctx.daten}`,
                { sort: { field: 'preis', order: 'DESC' } },
                { query: { limit: 3 } }
            );
            expectStatus(r, 200, 'Suche');
            const preise = r.data.data.map(d => d.preis);
            expect(
                JSON.stringify(preise) === JSON.stringify([100, 12, 6.9]),
                `Reihenfolge falsch: ${preise.join(', ')}`,
                r
            );
            return preise.join(' > ');
        }
    },
    {
        id: 'data-paging',
        group: 'Daten & Suche',
        title: 'Blättern: jeder Datensatz genau einmal',
        needs: ['dataInserted'],
        run: async ctx => {
            const seen = [];
            let cursor = null;
            for (let i = 0; i < 10; i++) {
                const query = { limit: 5 };
                if (cursor) Object.assign(query, { cursorValue: cursor.value, cursorId: cursor.id, direction: 'next' });
                const r = await api.post(
                    `/api/core-data/search/${ctx.daten}`,
                    { sort: { field: 'preis', order: 'ASC' } },
                    { query }
                );
                expectStatus(r, 200, `Seite ${i + 1}`);
                seen.push(...r.data.data.map(d => d.sku));
                if (r.data.meta.returned_count < 5) break;
                cursor = r.data.meta.cursors.last;
            }
            expect(
                seen.length === RECORDS.length && new Set(seen).size === RECORDS.length,
                `${seen.length} gesehen, ${new Set(seen).size} verschieden`
            );
            return `${seen.length} auf 3 Seiten`;
        }
    },
    {
        id: 'data-delete',
        group: 'Daten & Suche',
        title: 'Datensatz löschen',
        needs: ['dataInserted'],
        run: async ctx => {
            const f = await api.post(`/api/core-data/search/${ctx.daten}`, { filter: { sku: 'X1' } });
            const id = f.data?.data?.[0]?._sys_id;
            expect(id, 'Datensatz X1 nicht gefunden', f);
            const d = await api.del(`/api/core-data/${ctx.daten}/record/${id}`);
            expectStatus(d, 200, 'Löschen');
            const again = await api.post(`/api/core-data/search/${ctx.daten}`, { filter: { sku: 'X1' } });
            expect(again.data.meta.total_count === 0, 'Datensatz ist noch da', again);
            return 'X1 gelöscht';
        }
    },
    {
        id: 'data-invalid-id',
        group: 'Daten & Suche',
        title: 'Ungültige Datensatz-ID wird abgelehnt (400)',
        needs: ['daten'],
        run: async ctx => {
            const r = await api.del(`/api/core-data/${ctx.daten}/record/keine-uuid`);
            expectStatus(r, 400, 'Löschen mit falscher ID');
            return r.error;
        }
    },

    // ============================================================== RELATIONEN
    {
        id: 'relation',
        group: 'Relationen & Joins',
        title: 'Relation anlegen (daten → lager)',
        needs: ['daten', 'lager'],
        run: async ctx => {
            const s = await api.post(`/api/core-data/${ctx.lager}`, {
                data: [
                    { sku: 'A1', bestand: 7 },
                    { sku: 'B2', bestand: 0 }
                ]
            });
            expectStatus(s, 201, 'Lager-Daten');
            const r = await api.post(`/api/relations/${ctx.daten}`, { targetUuid: ctx.lager, relationType: 'lager' });
            expectStatus(r, 201, 'Relation anlegen');
            const g = await api.get(`/api/relations/${ctx.daten}`);
            expect(
                (g.data?.data || []).some(x => x.relation_type === 'lager' && x.target === ctx.lager),
                'Relation fehlt in der Liste',
                g
            );
            ctx.relation = true;
            return 'daten ──lager──▶ lager';
        }
    },
    {
        id: 'join',
        group: 'Relationen & Joins',
        title: 'Join holt verknüpfte Daten',
        needs: ['relation', 'dataInserted'],
        run: async ctx => {
            const r = await api.post(`/api/core-data/search/${ctx.daten}`, {
                filter: { sku: 'A1' },
                joins: [{ relationType: 'lager', as: 'lager', sourceKey: 'sku', targetKey: 'sku', single: true }]
            });
            expectStatus(r, 200, 'Suche mit Join');
            expect(r.data.data[0]?.lager?.bestand === 7, 'Join lieferte nicht den Bestand 7', r);
            return 'A1: Bestand 7';
        }
    },

    // ============================================================== RECHTE
    {
        id: 'roles-owner',
        group: 'Rechte',
        title: 'Die Domain hat ihr Triplet mit allen drei Rollen',
        needs: ['root'],
        run: async ctx => {
            const r = await api.get(`/api/objects/${ctx.root}/roles`);
            expectStatus(r, 200, 'Rollen laden');
            const types = (r.data?.[ctx.domainName] || []).map(x => x.type).sort();
            expect(JSON.stringify(types) === '["black","blue","red"]', `Rollen: ${types.join(', ')}`, r);
            ctx.triplet = r.data[ctx.domainName][0].triplet_uuid;
            return 'black, red, blue';
        }
    },
    {
        id: 'roles-mine',
        group: 'Rechte',
        title: 'Das Triplet steht bei „Meine Triplets“',
        needs: ['triplet'],
        run: async ctx => {
            const r = await api.get('/api/roles/triplets/me');
            expectStatus(r, 200, 'Meine Triplets');
            expect(
                (r.data || []).some(t => t.triplet_uuid === ctx.triplet),
                'Triplet fehlt',
                r
            );
            return `${r.data.length} Triplets`;
        }
    },
    {
        id: 'roles-grant-revoke',
        group: 'Rechte',
        title: 'Rolle vergeben und wieder entziehen',
        needs: ['triplet', 'lager'],
        run: async ctx => {
            // Eine zweite Domain gibt "lager" (einem Objekt der Check-Domain) Leserechte …
            const second = await api.post('/api/objects', { domain: ctx.domainName + '-zwei' });
            expectStatus(second, 201, 'zweite Domain');
            ctx.zwei = second.data.data.uuid; // zum Aufräumen am Schluss
            const roles = await api.get(`/api/objects/${second.data.data.uuid}/roles`);
            const t2 = roles.data?.[ctx.domainName + '-zwei']?.[0]?.triplet_uuid;
            expect(t2, 'Triplet der zweiten Domain fehlt', roles);
            const g = await api.put(`/api/roles/${ctx.lager}/triplets/${t2}`, { roleType: 'black' });
            expectStatus(g, 200, 'Vergeben');
            const after = await api.get(`/api/objects/${ctx.lager}/roles`);
            expect(
                (after.data?.[ctx.domainName + '-zwei'] || []).some(x => x.type === 'black'),
                'Rolle kam nicht an',
                after
            );
            // … und nimmt sie wieder weg
            const d = await api.del(`/api/roles/${ctx.lager}/triplets/${t2}/black`);
            expectStatus(d, 200, 'Entziehen');
            return 'vergeben und entzogen';
        }
    },
    {
        id: 'members-list',
        group: 'Rechte',
        title: 'Wer hat welche Rechte? (GET /members, ohne persönliche Daten)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.get(`/api/objects/${ctx.root}/members`);
            expectStatus(r, 200, 'Mitglieder laden');
            const members = r.data?.data?.members || [];
            expect(r.data?.data?.triplet === ctx.triplet || !ctx.triplet, 'falsches Triplet', r);
            const mensch = members.find(m => m.kind === 'mensch');
            expect(mensch && mensch.roles.includes('blue'), 'Du (Mensch mit blue) fehlst in der Liste', r);
            expect(mensch.name === null, 'Ein Mensch darf keinen Namen in der Liste haben', r);
            expect(
                members.some(m => m.uuid === ctx.root && m.family === true),
                'Die Domain selbst (family) fehlt',
                r
            );
            return `${members.length} Mitglieder`;
        }
    },
    {
        // Nachbesserung nach dem Finale: Kinder zeigten nur den Namen der Familie
        id: 'members-identifier',
        group: 'Rechte',
        title: 'Kinder mit ihrem Namen aus der DNA (identifier in /members und /api/objects)',
        needs: ['root', 'lager'],
        run: async ctx => {
            const r = await api.get(`/api/objects/${ctx.root}/members`);
            expectStatus(r, 200, 'Mitglieder laden');
            const members = r.data?.data?.members || [];
            const lager = members.find(m => m.uuid === ctx.lager);
            expect(lager && lager.identifier === 'lager', 'Das Kind "lager" hat keinen identifier', r);
            expect(lager.name === ctx.domainName, 'name sollte bei Kindern die Familie bleiben', r);
            const root = members.find(m => m.uuid === ctx.root);
            expect(root && root.identifier === null, 'Die Domain selbst sollte keinen identifier haben', r);
            const mensch = members.find(m => m.kind === 'mensch');
            expect(mensch && mensch.identifier === null, 'Ein Mensch darf keinen identifier haben', r);

            const list = await api.get('/api/objects');
            expectStatus(list, 200, 'Objekte laden');
            const kind = (Array.isArray(list.data) ? list.data : []).find(o => o.uuid === ctx.lager);
            expect(kind && kind.identifier === 'lager', 'In /api/objects fehlt der identifier des Kindes', list);
            return 'lager = "lager" · Domain und Mensch ohne';
        }
    },
    {
        id: 'members-grant-revoke',
        group: 'Rechte',
        title: 'Recht über das Objekt vergeben und entziehen (PUT/DELETE /members)',
        needs: ['zwei', 'lager'],
        run: async ctx => {
            const g = await api.put(`/api/objects/${ctx.zwei}/members/${ctx.lager}`, { roleType: 'black' });
            expectStatus(g, 200, 'Vergeben');
            expect(g.data?.data?.changed === true, 'changed sollte true sein', g);
            const again = await api.put(`/api/objects/${ctx.zwei}/members/${ctx.lager}`, { roleType: 'black' });
            expect(again.data?.data?.changed === false, 'Zweimal vergeben: changed sollte false sein', again);
            const d = await api.del(`/api/objects/${ctx.zwei}/members/${ctx.lager}/black`);
            expectStatus(d, 200, 'Entziehen');
            expect(d.data?.data?.changed === true, 'Entziehen: changed sollte true sein', d);
            const bad = await api.put(`/api/objects/${ctx.zwei}/members/${ctx.lager}`, { roleType: 'gold' });
            expectStatus(bad, 400, 'roleType "gold"');
            return 'vergeben · doppelt (changed false) · entzogen · gold ⛔';
        }
    },
    {
        // Plan "Login auf Websites", Etappe 4: Rollen pro Teil (Zusatz-Schloss)
        id: 'members-part',
        group: 'Rechte',
        title: 'Recht nur auf einen Teil (Zusatz-Schloss): vergeben, anzeigen, entziehen, Schloss entfernen',
        needs: ['root', 'zwei', 'lager'],
        run: async ctx => {
            const g = await api.put(`/api/objects/${ctx.lager}/members/${ctx.zwei}`, {
                roleType: 'black',
                scope: 'teil'
            });
            expectStatus(g, 200, 'Vergeben (nur dieser Teil)');
            expect(g.data?.data?.scope === 'teil', 'scope sollte "teil" sein', g);

            const list = await api.get(`/api/objects/${ctx.lager}/members`);
            expectStatus(list, 200, 'Mitglieder laden');
            const own = (list.data?.data?.locks || []).find(l => l.own);
            expect(own, 'Das Zusatz-Schloss fehlt in der Liste (locks)', list);
            expect(
                own.members.some(m => m.uuid === ctx.zwei && m.roles.includes('black')),
                'Das Mitglied fehlt im Zusatz-Schloss',
                list
            );
            expect(
                !(list.data?.data?.members || []).some(m => m.uuid === ctx.zwei),
                'Das Recht ist fälschlich auf der ganzen Website gelandet',
                list
            );

            const blue = await api.put(`/api/objects/${ctx.lager}/members/${ctx.zwei}`, {
                roleType: 'blue',
                scope: 'teil'
            });
            expectStatus(blue, 400, 'blue nur auf einen Teil');
            const root = await api.put(`/api/objects/${ctx.root}/members/${ctx.zwei}`, {
                roleType: 'black',
                scope: 'teil'
            });
            expectStatus(root, 400, 'Zusatz-Schloss auf der Website selbst');

            const d = await api.del(`/api/objects/${ctx.lager}/members/${ctx.zwei}/black?scope=teil`);
            expectStatus(d, 200, 'Entziehen (nur dieser Teil)');
            expect(d.data?.data?.changed === true, 'Entziehen: changed sollte true sein', d);

            const lock = await api.del(`/api/objects/${ctx.lager}/lock`);
            expectStatus(lock, 200, 'Zusatz-Schloss entfernen');
            expect(lock.data?.data?.removed === true, 'Das Schloss wurde nicht entfernt', lock);
            const again = await api.del(`/api/objects/${ctx.lager}/lock`);
            expect(again.data?.data?.removed === false, 'Zweites Entfernen sollte removed: false melden', again);
            return 'teil ✓ · locks ✓ · blue ⛔ · Website ⛔ · entzogen · Schloss weg';
        }
    },
    {
        // Plan "Login auf Websites", Etappe 6: Einladungs-Links
        id: 'invitations',
        group: 'Rechte',
        title: 'Einladungs-Link: nur ein eingeloggter Mensch erstellt, nie blue, auflisten, widerrufen',
        needs: ['root'],
        run: async ctx => {
            const me = await api.get('/api/me');
            if (!me.data?.isAuthenticated) {
                const gast = await api.post(`/api/objects/${ctx.root}/invitations`, { roles: ['black'] });
                expectStatus(gast, 403, 'Einladung als Gast');
                return 'als Gast abgelehnt ✓ (Erstellen nur mit Login prüfbar)';
            }
            const blue = await api.post(`/api/objects/${ctx.root}/invitations`, { roles: ['blue'] });
            expectStatus(blue, 400, 'blue per Link');
            const r = await api.post(`/api/objects/${ctx.root}/invitations`, { roles: ['black'], hours: 1 });
            expectStatus(r, 201, 'Einladung erstellen');
            expect(/\/einladung\/[A-Za-z0-9_-]{43}$/.test(r.data?.data?.link || ''), 'Link sieht falsch aus', r);
            const list = await api.get(`/api/objects/${ctx.root}/invitations`);
            expectStatus(list, 200, 'Einladungen laden');
            const mine = (list.data?.data || []).find(i => i.uuid === r.data.data.uuid);
            expect(mine && mine.open === true, 'Die neue Einladung fehlt in der Liste', list);
            expect(!JSON.stringify(list.data).includes('/einladung/'), 'Die Liste verrät den Link!', list);
            const del = await api.del(`/api/objects/${ctx.root}/invitations/${r.data.data.uuid}`);
            expectStatus(del, 200, 'Widerrufen');
            expect(del.data?.data?.revoked === true, 'Nicht widerrufen', del);
            return 'blue ⛔ · erstellt · Liste ohne Link · widerrufen';
        }
    },
    {
        id: 'roles-invalid',
        group: 'Rechte',
        title: 'Ungültige Rolle wird abgelehnt (400)',
        needs: ['triplet', 'lager'],
        run: async ctx => {
            const r = await api.put(`/api/roles/${ctx.lager}/triplets/${ctx.triplet}`, { roleType: 'gold' });
            expectStatus(r, 400, 'roleType "gold"');
            return r.error;
        }
    },
    {
        id: 'roles-foreign-triplet',
        group: 'Rechte',
        title: 'In fremden Triplets darfst du nichts vergeben (403)',
        needs: ['lager'],
        run: async ctx => {
            const r = await api.put(`/api/roles/${ctx.lager}/triplets/00000000-0000-4000-8000-000000000000`, {
                roleType: 'black'
            });
            expectStatus(r, 403, 'Vergeben im fremden Triplet');
            return r.error;
        }
    },

    // ============================================================== SSF
    {
        id: 'ssf-hello',
        group: 'SSF',
        title: 'SSF speichern und ausführen',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(ctx, '// Systemcheck\nreturn { hallo: requestContext.body.name, summe: 1 + 2 };', {
                name: 'Check'
            });
            expectStatus(r, 200, 'Ausführen');
            expect(r.data.result?.hallo === 'Check' && r.data.result?.summe === 3, 'Falsches Ergebnis', r);
            return `Antwort in ${r.ms} ms`;
        }
    },
    {
        id: 'ssf-read',
        group: 'SSF',
        title: 'SSF liest Daten mit eigenen Rechten (api.data.find)',
        needs: ['funktion', 'dataInserted'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const res = await api.data.find('${ctx.domainName}/daten', { filter: { kategorie: 'brot' } });\nreturn res.meta.total_count;`
            );
            expectStatus(r, 200, 'Ausführen');
            expect(r.data.result === 3, `erwartet 3, bekommen ${JSON.stringify(r.data.result)}`, r);
            return '3 Brote gefunden';
        }
    },
    {
        id: 'ssf-write',
        group: 'SSF',
        title: 'SSF schreibt (api.data.insert)',
        needs: ['funktion', 'daten'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const neu = await api.data.insert('${ctx.domainName}/daten', { sku: 'S1', name: 'von der SSF', preis: 1 });\nreturn neu._sys_id;`
            );
            expectStatus(r, 200, 'Ausführen');
            expect(typeof r.data.result === 'string', 'Keine ID zurück', r);
            return 'Datensatz angelegt';
        }
    },
    {
        // Plan "MCP Etappe 5b": Der Speicher einer App ist ein Kind der App, NICHT in
        // der DNA. Die SSF (ein Geschwister) schreibt ohne zusätzliche Rechte hinein –
        // aber nur per UUID (Pfade laufen über die DNA). Danach wird er gleich gelöscht.
        id: 'ssf-storage-child',
        group: 'SSF',
        title: 'Speicher als Kind der App: SSF schreibt per UUID, ohne Extra-Rechte',
        needs: ['root', 'funktion', 'domainName'],
        run: async ctx => {
            const c = await api.post(`/api/objects/${ctx.root}/links`, {
                domainRef: ctx.domainName,
                pathStep: 'base',
                identifier: 'speicher'
            });
            expectStatus(c, 201, 'Speicher-Kind anlegen');
            const speicher = c.data.data.uuid;
            try {
                const r = await runSsf(
                    ctx,
                    `await api.data.insert('${speicher}', { typ: 'eintrag' });\nreturn (await api.data.find('${speicher}', {})).data.length;`
                );
                expectStatus(r, 200, 'SSF schreibt per UUID');
                expect(r.data.result === 1, `erwartet 1 Datensatz, bekam ${r.data.result}`, r);

                const s = await api.post(`/api/core-data/search/${speicher}`, {});
                expectStatus(s, 200, 'Du siehst die Daten');
                expect(s.data?.data?.length === 1, 'Datensatz fehlt in deiner Suche', s);

                // Per Pfad nicht erreichbar (nicht in der DNA) – darum empfiehlt die Anleitung die UUID
                const p = await runSsf(ctx, `return await api.data.find('${ctx.domainName}/speicher', {});`);
                expectStatus(p, 422, 'SSF per Pfad');
            } finally {
                await api.del(`/api/objects/${speicher}`);
            }
            return 'UUID ✓ · du siehst die Daten ✓ · Pfad ⛔ · wieder gelöscht';
        }
    },
    {
        id: 'ssf-loop',
        group: 'SSF',
        title: 'Endlosschleife wird gestoppt',
        needs: ['funktion'],
        run: ctx => expectSsfError(ctx, 'while (true) {}', /timed out|Zeitlimit/i, 'Endlosschleife')
    },
    {
        id: 'ssf-foreign',
        group: 'SSF',
        title: 'Fremde Daten: kein Zugriff',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.data.find('gibt-es-sicher-nicht-xyz', {});",
                /Kein Zugriff oder nicht gefunden/,
                'fremde Domain'
            )
    },
    {
        id: 'ssf-ssrf',
        group: 'SSF',
        title: 'Interne Adressen sind gesperrt (SSRF)',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.http.fetch('https://127.0.0.1/');",
                /interne oder reservierte/,
                'http.fetch auf 127.0.0.1'
            )
    },
    {
        id: 'ssf-http-only',
        group: 'SSF',
        title: 'Nur https ist erlaubt',
        needs: ['funktion'],
        run: ctx => expectSsfError(ctx, "await api.http.fetch('http://example.com/');", /https/, 'http://')
    },
    // Lange Anfragen (Plan "SSF-Ausbau", Teil A): ohne fremden Server prüfbar –
    // die Grenze und die Sperrliste gelten auch mit timeoutMs
    {
        id: 'ssf-long-max',
        group: 'SSF',
        title: 'Lange Anfragen: timeoutMs höchstens 85 s',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.http.fetch('https://example.com/', { timeoutMs: 999999 });",
                /höchstens 85000/,
                'timeoutMs zu gross'
            )
    },
    {
        id: 'ssf-long-invalid',
        group: 'SSF',
        title: 'Lange Anfragen: timeoutMs muss eine ganze Zahl sein',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.http.fetch('https://example.com/', { timeoutMs: '60000' });",
                /timeoutMs muss eine ganze Zahl/,
                'timeoutMs als Text'
            )
    },
    {
        id: 'ssf-long-ssrf',
        group: 'SSF',
        title: 'Lange Anfragen: interne Adressen bleiben gesperrt',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.http.fetch('https://127.0.0.1/', { timeoutMs: 20000 });",
                /interne oder reservierte/,
                'lange Anfrage auf 127.0.0.1'
            )
    },
    // Webhooks (Plan "SSF-Ausbau", Teil B)
    {
        id: 'ssf-webhook-only',
        group: 'SSF',
        title: 'Webhooks: verify geht nur in einem echten Webhook-Aufruf',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "await api.webhook.verify({ secret: 'CHECK_KEY', format: 'github' });",
                /nur, wenn die SSF als Webhook aufgerufen wird/,
                'verify ohne Webhook'
            )
    },
    {
        id: 'webhook-route-protected',
        group: 'SSF',
        title: 'Webhooks: die Backend-Route nimmt nur den Bauarbeiter an',
        run: async () => {
            const r = await api.post('/api/sites/check-gibt-es-nicht/hook/api', { rawBodyBase64: '' });
            expectStatus(r, 403, 'Webhook ohne Bauarbeiter-Schlüssel');
            expect(r.data?.code === 'BAUARBEITER_ONLY', `unerwarteter Code "${r.data?.code}"`, r);
            return 'ohne Schlüssel: 403';
        }
    },
    {
        id: 'webhook-calls',
        group: 'SSF',
        title: 'Webhooks: Protokoll der letzten Aufrufe lesbar (mit red)',
        needs: ['funktion'],
        run: async ctx => {
            const r = await api.get(`/api/objects/${ctx.funktion}/webhook-calls`);
            expectStatus(r, 200, 'Webhook-Protokoll');
            expect(Array.isArray(r.data?.data?.calls), 'calls fehlt', r);
            return `${r.data.data.calls.length} Aufrufe`;
        }
    },
    // Hintergrund-Aufträge (Plan "SSF-Ausbau", Teil C). Der Auftrag startet erst in einer
    // Stunde (startInSec) und wird gleich abgebrochen – der Arbeiter führt ihn also nie aus.
    {
        id: 'jobs-start-cancel',
        group: 'SSF',
        title: 'Aufträge: anlegen (api.jobs.start), in der Liste sehen, abbrechen',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `return await api.jobs.start('${ctx.funktion}', { check: true }, { startInSec: 3600 });`
            );
            expectStatus(r, 200, 'api.jobs.start');
            const job = r.data?.result;
            expect(job && job.status === 'queued', `unerwarteter Status "${job && job.status}"`, r);

            const list = await api.get(`/api/objects/${ctx.funktion}/jobs`);
            expectStatus(list, 200, 'Liste der Aufträge');
            expect(
                list.data.data.jobs.some(j => j.id === job.id),
                'der neue Auftrag fehlt in der Liste',
                list
            );

            const cancel = await api.post(`/api/objects/${ctx.funktion}/jobs/${job.id}/cancel`, {});
            expectStatus(cancel, 200, 'Abbrechen');
            expect(cancel.data?.data?.status === 'cancelled', 'nicht abgebrochen', cancel);
            return 'angelegt, gelistet, abgebrochen';
        }
    },
    {
        id: 'jobs-schedule',
        group: 'SSF',
        title: 'Zeitplan: zu oft wird abgelehnt, setzen und entfernen geht',
        needs: ['funktion'],
        run: async ctx => {
            const tooOften = await api.put(`/api/objects/${ctx.funktion}/schedule`, { cron: '* * * * *' });
            expectStatus(tooOften, 400, 'Zeitplan jede Minute');
            expect(/höchstens alle 5 Minuten/.test(tooOften.data?.error || ''), 'unerwartete Meldung', tooOften);

            const set = await api.put(`/api/objects/${ctx.funktion}/schedule`, { cron: '0 3 * * *', enabled: false });
            expectStatus(set, 200, 'Zeitplan setzen');
            expect(set.data?.data?.timeZone === 'Europe/Zurich', 'Zeitzone fehlt', set);

            const del = await api.del(`/api/objects/${ctx.funktion}/schedule`);
            expectStatus(del, 200, 'Zeitplan entfernen');
            expect(del.data?.data?.deleted === true, 'nicht entfernt', del);
            return 'abgelehnt, gesetzt (pausiert), entfernt';
        }
    },
    {
        id: 'ssf-call-limit',
        group: 'SSF',
        title: 'Höchstens 50 Werkzeug-Aufrufe',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                "for (let i = 0; i < 60; i++) { try { await api.data.get('x', 'keine-id'); } catch (e) { if (String(e.message).includes('Zu viele')) throw e; } }",
                /Zu viele Werkzeug-Aufrufe/,
                '60 Aufrufe'
            )
    },
    {
        id: 'ssf-reserved',
        group: 'SSF',
        title: 'System-Felder (_sys_) sind geschützt',
        needs: ['funktion'],
        run: ctx =>
            expectSsfError(
                ctx,
                `await api.data.insert('${ctx.domainName}/daten', { _sys_id: 'x' });`,
                /reserviert/,
                '_sys_id schreiben'
            )
    },
    // Plan "Lehren aus dem Restaurant-Test", E4: Schlüssel und "nur wenn" (Migration 020)
    {
        id: 'ssf-data-key',
        group: 'SSF',
        title: 'Schlüssel: derselbe Schlüssel nur einmal pro Speicher (KEY_TAKEN)',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const ziel = '${ctx.domainName}/daten';
                 const key = 'check|' + (await api.crypto.randomToken(16, 'hex'));
                 const eins = await api.data.insert(ziel, { check: 'schluessel' }, { key });
                 let zwei = null;
                 try { await api.data.insert(ziel, { check: 'schluessel' }, { key }); } catch (e) { zwei = e.code; }
                 const gefunden = await api.data.getByKey(ziel, key);
                 const weg = await api.data.deleteByKey(ziel, key);
                 return { eins: eins._sys_key === key, zwei, gefunden: gefunden && gefunden._sys_id === eins._sys_id, weg: weg.deleted };`
            );
            expectStatus(r, 200, 'Ausführen');
            const x = r.data.result;
            expect(x.eins && x.zwei === 'KEY_TAKEN' && x.gefunden && x.weg, JSON.stringify(x), r);
            return 'zweiter Versuch: KEY_TAKEN';
        }
    },
    {
        id: 'ssf-data-onlyif',
        group: 'SSF',
        title: 'Nur wenn noch: onlyIf schaltet einen Status nur einmal weiter',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const ziel = '${ctx.domainName}/daten';
                 const neu = await api.data.insert(ziel, { check: 'onlyif', status: 'eingegangen' });
                 const ok = await api.data.update(ziel, neu._sys_id, { status: 'fertig' }, { onlyIf: { status: 'eingegangen' } });
                 let nochmals = null;
                 try { await api.data.update(ziel, neu._sys_id, { status: 'fertig' }, { onlyIf: { status: 'eingegangen' } }); }
                 catch (e) { nochmals = e.code; }
                 await api.data.delete(ziel, neu._sys_id);
                 return { status: ok.status, nochmals };`
            );
            expectStatus(r, 200, 'Ausführen');
            expect(
                r.data.result.status === 'fertig' && r.data.result.nochmals === 'CONDITION_FAILED',
                JSON.stringify(r.data.result),
                r
            );
            return 'zweites Mal: CONDITION_FAILED';
        }
    },
    // Plan "Lehren aus dem Restaurant-Test", E2: sicherer Zufall und anonym testen
    {
        id: 'ssf-crypto',
        group: 'SSF',
        title: 'Sicherer Zufall: api.crypto.randomToken und randomUuid',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                'return { a: await api.crypto.randomToken(), b: await api.crypto.randomToken(), id: await api.crypto.randomUuid() };'
            );
            expectStatus(r, 200, 'Ausführen');
            const { a, b, id } = r.data.result;
            expect(/^[A-Za-z0-9_-]{43}$/.test(a) && a !== b, `Tokens: ${a} / ${b}`, r);
            expect(/^[0-9a-f-]{36}$/.test(id), `UUID: ${id}`, r);
            return '43 Zeichen, jedes Mal anders';
        }
    },
    // Plan "Geo-Monitor", G1: api.crypto antwortet sofort (ohne await), und ein vergessenes
    // await fällt auf (Warnung bei "[object Promise]", Fehler bei einem Promise als Argument)
    {
        id: 'ssf-sofort',
        group: 'SSF',
        title: 'Sofort-Werkzeuge ohne await + Warnung „await vergessen?“',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const link = 'x/' + api.crypto.randomToken();
                 let fehler = null;
                 try { await api.objects.get({ ziel: api.objects.get('${ctx.domainName}') }); } catch (e) { fehler = e.message; }
                 try { await api.objects.get('${ctx.domainName}|' + api.objects.get('${ctx.domainName}')); } catch (e) {}
                 return { link, fehler };`
            );
            expectStatus(r, 200, 'Ausführen');
            const { link, fehler } = r.data.result;
            expect(/^x\/[A-Za-z0-9_-]{43}$/.test(link), `Link ohne await: ${link}`, r);
            expect(/await vergessen/.test(fehler || ''), `Promise als Argument: ${fehler}`, r);
            const warnings = r.data.warnings || [];
            expect(
                warnings.some(w => w.includes('[object Promise]')),
                `Warnung fehlt: ${JSON.stringify(warnings)}`,
                r
            );
            return 'Token sofort da, Promise abgelehnt, Warnung gemeldet';
        }
    },
    // Plan "Geo-Monitor", G2: Adressen zerlegen und zusammensetzen (es gibt kein URL in der Sandbox)
    {
        id: 'ssf-url',
        group: 'SSF',
        title: 'Adressen: api.url.parse, join und params',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `return {
                    host: api.url.parse('https://shop.ch:8080/a?q=1').hostname,
                    links: api.url.join('https://shop.ch/a/b.html', ['../c', '/d#oben', 'http://[kaputt'], { stripHash: true }),
                    params: api.url.params({ q: 'grüner tee', seite: 2 })
                 };`
            );
            expectStatus(r, 200, 'Ausführen');
            const { host, links, params } = r.data.result;
            expect(host === 'shop.ch', `hostname: ${host}`, r);
            expect(
                JSON.stringify(links) === JSON.stringify(['https://shop.ch/c', 'https://shop.ch/d', null]),
                `join: ${JSON.stringify(links)}`,
                r
            );
            expect(params === 'q=gr%C3%BCner+tee&seite=2', `params: ${params}`, r);
            return 'zerlegt, zusammengesetzt, kodiert';
        }
    },
    // Plan "Lehren aus dem Restaurant-Test", E6: Bibliothek speichern und aus der SSF laden
    {
        id: 'ssf-library',
        group: 'SSF',
        title: 'Bibliothek: Code-Art library speichern und mit api.lib.load laden',
        needs: ['funktion', 'daten'],
        run: async ctx => {
            // Die Bibliothek kommt ins Kind "daten" (gleiche Domain -> keine Version nötig)
            const lib = await api.post(`/api/ast/${ctx.daten}`, {
                snippets: [{ type: 'library', code: 'exports.doppelt = x => x * 2;' }]
            });
            expectStatus(lib, 201, 'Bibliothek speichern');
            const r = await runSsf(
                ctx,
                `const h = await api.lib.load('${ctx.domainName}/daten');
                 let ohne = null;
                 try { await api.lib.load('${ctx.domainName}/lager'); } catch (e) { ohne = e.code; }
                 return { wert: h.doppelt(21), ohne };`
            );
            expectStatus(r, 200, 'Ausführen');
            expect(r.data.result.wert === 42 && r.data.result.ohne === 'NOT_FOUND', JSON.stringify(r.data.result), r);
            return '21 × 2 = 42; Objekt ohne Bibliothek: NOT_FOUND';
        }
    },
    {
        id: 'ssf-run-anonymous',
        group: 'SSF',
        title: 'Als anonymer Besucher ausführen (?as=anonymous)',
        needs: ['funktion'],
        run: async ctx => {
            const code = 'return { user: requestContext.userUuid };';
            const normal = await runSsf(ctx, code);
            expectStatus(normal, 200, 'normal');
            expect(normal.data.result.user !== null, 'normal: kein Besucher', normal);
            const anonym = await runSsf(ctx, code, {}, '?as=anonymous');
            expectStatus(anonym, 200, 'anonym');
            expect(anonym.data.result.user === null, `anonym: ${anonym.data.result.user}`, anonym);
            const falsch = await runSsf(ctx, code, {}, '?as=jemand');
            expectStatus(falsch, 400, 'as=jemand');
            return 'anonym: userUuid null, nur "anonymous" erlaubt';
        }
    },
    {
        id: 'ssf-no-globals',
        group: 'SSF',
        title: 'Kein Zugriff auf process/require in der Sandbox',
        needs: ['funktion'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                'return { process: typeof process, require: typeof require, fetch: typeof fetch };'
            );
            expectStatus(r, 200, 'Ausführen');
            expect(
                Object.values(r.data.result).every(v => v === 'undefined'),
                `sichtbar: ${JSON.stringify(r.data.result)}`,
                r
            );
            return 'alles undefined';
        }
    },

    // ============================================================== TRESOR
    {
        id: 'vault-set',
        group: 'Tresor',
        title: 'Schlüssel setzen',
        needs: ['funktion'],
        run: async ctx => {
            ctx.secretValue = 'check-geheim-' + Math.random().toString(36).slice(2, 10);
            const r = await api.put(
                `/api/secrets/${ctx.funktion}/CHECK_KEY`,
                { value: ctx.secretValue },
                { sensitive: true }
            );
            if (r.status === 503) throw new Error('Tresor nicht eingerichtet (SECRETS_KEY fehlt in der .env)');
            expectStatus(r, 200, 'Setzen');
            ctx.secret = true;
            return 'CHECK_KEY gespeichert';
        }
    },
    {
        id: 'vault-list',
        group: 'Tresor',
        title: 'Liste zeigt nur Namen, nie Werte',
        needs: ['secret'],
        run: async ctx => {
            const r = await api.get(`/api/secrets/${ctx.funktion}`);
            expectStatus(r, 200, 'Auflisten');
            expect(
                (r.data.data || []).some(s => s.name === 'CHECK_KEY'),
                'CHECK_KEY fehlt',
                r
            );
            expect(!JSON.stringify(r.data).includes(ctx.secretValue), 'Der WERT steht in der Antwort!', r);
            return 'nur Namen';
        }
    },
    {
        id: 'vault-mask',
        group: 'Tresor',
        title: 'SSF liest den Schlüssel – Antwort geschwärzt (***)',
        needs: ['secret'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                "const k = await api.secrets.get('CHECK_KEY');\nreturn { laenge: k.length, text: 'Wert: ' + k };"
            );
            expectStatus(r, 200, 'Ausführen');
            expect(!JSON.stringify(r.data).includes(ctx.secretValue), 'Der Wert kam ungeschwärzt zurück!', r);
            expect(
                r.data.result.text === 'Wert: ***' && r.data.result.laenge === ctx.secretValue.length,
                'Schwärzung/Länge stimmt nicht',
                r
            );
            return r.data.result.text;
        }
    },
    {
        id: 'vault-delete',
        group: 'Tresor',
        title: 'Schlüssel löschen',
        needs: ['secret'],
        run: async ctx => {
            const r = await api.del(`/api/secrets/${ctx.funktion}/CHECK_KEY`);
            expectStatus(r, 200, 'Löschen');
            return 'gelöscht';
        }
    },

    // ============================================================== KLONEN & ZÜGELN
    // Legt zusätzlich an: check-xxxx-kopie (wird danach in check-xxxx gezügelt),
    // check-xxxx-daten (Kopie mit Daten) und check-xxxx-kauf (vom Verkaufsautomaten)
    {
        id: 'clone',
        group: 'Klonen & Zügeln',
        title: 'Klonen: Kopie als neue Domain, mit Herkunft',
        needs: ['root'],
        run: async ctx => {
            ctx.copyName = `${ctx.domainName}-kopie`;
            const r = await api.post(`/api/objects/${ctx.root}/clone`, { domain: ctx.copyName });
            expectStatus(r, 201, 'POST /clone');
            const origin = r.data.data.origin;
            expect(origin?.uuid === ctx.root && origin?.domain === ctx.domainName, 'Herkunft fehlt oder falsch', r);
            ctx.copy = r.data.data.uuid;
            return `${ctx.copyName} ← ${ctx.domainName}, Version ${origin.step}`;
        }
    },
    {
        id: 'clone-data',
        group: 'Klonen & Zügeln',
        title: 'Klonen mit Daten: alle Datensätze kommen mit',
        needs: ['daten', 'dataInserted'],
        run: async ctx => {
            // Wie viele hat das Original gerade? (frühere Prüfungen löschen/fügen einzelne hinzu)
            const original = await api.post(`/api/core-data/search/${ctx.daten}`, {});
            expectStatus(original, 200, 'Suche im Original');
            const want = original.data.meta?.total_count;

            const r = await api.post(`/api/objects/${ctx.daten}/clone`, {
                domain: `${ctx.domainName}-daten`,
                withData: true
            });
            expectStatus(r, 201, 'POST /clone mit withData');
            ctx.dataCopy = r.data.data.uuid; // zum Aufräumen am Schluss
            const s = await api.post(`/api/core-data/search/${r.data.data.uuid}`, {});
            expectStatus(s, 200, 'Suche in der Kopie');
            const n = s.data.meta?.total_count;
            expect(n === want && n > 0, `Kopie hat ${n} Datensätze, das Original ${want}`, s);
            return `${n} Datensätze kopiert`;
        }
    },
    {
        id: 'clone-bad-version',
        group: 'Klonen & Zügeln',
        title: 'Klonen einer Version, die es nicht gibt, wird abgelehnt (400)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.post(`/api/objects/${ctx.root}/clone`, { domain: `${ctx.domainName}-x`, version: 999 });
            expectStatus(r, 400, 'Version 999');
            return r.error;
        }
    },
    {
        id: 'move',
        group: 'Klonen & Zügeln',
        title: 'Zügeln: die Kopie zieht als Kind in die Test-Domain',
        needs: ['copy'],
        run: async ctx => {
            const r = await api.post(`/api/objects/${ctx.copy}/move`, { targetParent: ctx.root, pathStep: 'base' });
            expectStatus(r, 200, 'POST /move');
            const moved = r.data.data;
            expect(moved.domain === null && moved.domain_ref === ctx.domainName, 'neuer Platz stimmt nicht', r);
            ctx.moved = true;
            return `jetzt ${ctx.domainName} ${JSON.stringify(moved.path)}`;
        }
    },
    {
        id: 'move-name-locked',
        group: 'Klonen & Zügeln',
        title: 'Der alte Name ist danach gesperrt (409)',
        needs: ['moved'],
        run: async ctx => {
            const r = await api.post('/api/objects', { domain: ctx.copyName });
            expectStatus(r, 409, 'alten Namen neu anlegen');
            expect(/gesperrt/.test(r.error || ''), `unerwartete Meldung "${r.error}"`, r);
            return r.error;
        }
    },
    {
        id: 'move-with-children',
        group: 'Klonen & Zügeln',
        title: 'Eine Domain mit Kindern kann (noch) nicht zügeln (409)',
        needs: ['root', 'copy'],
        run: async ctx => {
            // check-xxxx hat Kinder (funktion, daten, lager) – Ziel egal
            const r = await api.post(`/api/objects/${ctx.root}/move`, { targetParent: ctx.copy });
            expect(r.status === 409, `erwartet 409, bekommen ${r.status}`, r);
            return r.error;
        }
    },
    {
        id: 'ssf-vending',
        group: 'Klonen & Zügeln',
        title: 'Verkaufsautomat: SSF klont, verschenkt und tritt zurück',
        needs: ['funktion', 'daten'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const kopie = await api.objects.clone('${ctx.domainName}/daten', '${ctx.domainName}-kauf');
for (const rolle of ['black', 'red', 'blue']) await api.roles.grant(kopie.uuid, requestContext.userUuid, rolle);
const austritt = await api.roles.leave(kopie.uuid);
return { uuid: kopie.uuid, left: austritt.left };`
            );
            expectStatus(r, 200, 'Ausführen');
            const result = r.data.result;
            ctx.kauf = result.uuid; // zum Aufräumen am Schluss
            expect(result.left?.join(',') === 'black,blue,red', `SSF hat abgegeben: ${result.left}`, r);
            // Die Kopie gehört jetzt dir: du siehst ihre Rollen (dafür braucht es black)
            const roles = await api.get(`/api/objects/${result.uuid}/roles`);
            expectStatus(roles, 200, 'Rollen der Kopie ansehen');
            return 'Kopie gehört dir, SSF ist raus';
        }
    },
    {
        id: 'ssf-leave-last-admin',
        group: 'Klonen & Zügeln',
        title: 'SSF kann nicht zurücktreten, wenn das Objekt herrenlos würde',
        needs: ['funktion'],
        run: ctx => {
            // "-solo" bleibt danach bestehen und gehört NUR der SSF.
            // Die Gruppe "Löschen & Aufräumen" holt es am Schluss zurück.
            ctx.soloName = `${ctx.domainName}-solo`;
            return expectSsfError(
                ctx,
                `const o = await api.objects.create('${ctx.soloName}');\nawait api.roles.leave(o.uuid);`,
                /herrenlos/,
                'leave ohne anderen Verwalter'
            );
        }
    },

    // ============================================================== SICHERHEIT (als Fremder)
    {
        id: 'stranger-list',
        group: 'Sicherheit (als Fremder)',
        title: 'Fremder sieht keine Objekte',
        run: async () => {
            const r = await api.get('/api/objects', { anonymous: true });
            expectStatus(r, 200, 'Objekt-Liste');
            expect(Array.isArray(r.data) && r.data.length === 0, `Fremder sieht ${r.data?.length} Objekte!`, r);
            return 'leere Liste';
        }
    },
    ...[
        [
            'stranger-code',
            'Fremder kann keinen Code lesen',
            ctx => api.get(`/api/ast/${ctx.root}`, { anonymous: true })
        ],
        [
            'stranger-data',
            'Fremder kann keine Daten suchen',
            ctx => api.post(`/api/core-data/search/${ctx.daten}`, {}, { anonymous: true })
        ],
        [
            'stranger-write',
            'Fremder kann keine Daten schreiben',
            ctx => api.post(`/api/core-data/${ctx.daten}`, { data: { x: 1 } }, { anonymous: true })
        ],
        [
            'stranger-ssf',
            'Fremder kann die SSF nicht ausführen',
            ctx => api.post(`/api/functions/${ctx.funktion}/executions`, {}, { anonymous: true })
        ],
        [
            'stranger-vault',
            'Fremder sieht den Tresor nicht',
            ctx => api.get(`/api/secrets/${ctx.funktion}`, { anonymous: true })
        ],
        [
            'stranger-clone',
            'Fremder kann nichts klonen',
            ctx => api.post(`/api/objects/${ctx.root}/clone`, { domain: `${ctx.domainName}-klau` }, { anonymous: true })
        ],
        [
            'stranger-delete',
            'Fremder kann nichts löschen',
            ctx => api.del(`/api/objects/${ctx.root}`, { anonymous: true })
        ],
        [
            'stranger-roles',
            'Fremder kann keine Rollen vergeben',
            ctx => api.put(`/api/roles/${ctx.daten}/triplets/${ctx.triplet}`, { roleType: 'blue' }, { anonymous: true })
        ]
    ].map(([id, title, request]) => ({
        id,
        group: 'Sicherheit (als Fremder)',
        title,
        needs: ['root', 'daten', 'funktion', 'triplet'],
        run: async ctx => {
            const r = await request(ctx);
            expect(r.status === 403 || r.status === 404, `erwartet 403/404, bekommen ${r.status}`, r);
            return String(r.status);
        }
    })),

    // ============================================================== SICHTBARKEIT
    // Als Gast: Veröffentlichen muss abgelehnt werden (403). Mit Login: die
    // Check-Domain kurz öffentlich machen, als Fremder prüfen, wieder privat.
    {
        id: 'visibility-set',
        group: 'Sichtbarkeit',
        title: 'Veröffentlichen: nur mit Login (Gast wird abgelehnt)',
        needs: ['root'],
        run: async ctx => {
            const me = await api.get('/api/me');
            const r = await api.put(`/api/objects/${ctx.root}/visibility`, {
                visibility: 'public',
                includeChildren: true
            });
            if (!me.data?.isAuthenticated) {
                expectStatus(r, 403, 'Gast veröffentlicht');
                return 'Gast: abgelehnt (richtig) – die nächsten zwei Prüfungen brauchen einen Login';
            }
            expectStatus(r, 200, 'Domain + Unter-Objekte öffentlich');
            ctx.published = true;
            return `${r.data?.data?.changed} Objekte öffentlich`;
        }
    },
    {
        id: 'visibility-stranger',
        group: 'Sichtbarkeit',
        title: 'Öffentlich: Fremder sieht den Code und startet die SSF – Daten bleiben gesperrt',
        needs: ['root', 'funktion', 'daten'],
        run: async ctx => {
            if (!ctx.published) return 'nur mit Login prüfbar – übersprungen';
            const save = await runSsf(ctx, 'return "oeffentlich";');
            expectStatus(save, 200, 'SSF vorbereiten');
            expectStatus(await api.get(`/api/ast/${ctx.root}`, { anonymous: true }), 200, 'Fremder liest Code');
            const run = await api.post(`/api/functions/${ctx.funktion}/executions`, {}, { anonymous: true });
            expectStatus(run, 200, 'Fremder startet SSF');
            expect(run.data?.result === 'oeffentlich', 'Unerwartetes Ergebnis der SSF', run);
            expectStatus(
                await api.post(`/api/core-data/search/${ctx.daten}`, {}, { anonymous: true }),
                403,
                'Fremder sucht Daten'
            );
            return 'Code ✓ · SSF ✓ · Daten gesperrt ✓';
        }
    },
    {
        id: 'visibility-private',
        group: 'Sichtbarkeit',
        title: 'Zurück auf privat: Fremder sieht wieder nichts',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.published) return 'nur mit Login prüfbar – übersprungen';
            const r = await api.put(`/api/objects/${ctx.root}/visibility`, {
                visibility: 'private',
                includeChildren: true
            });
            expectStatus(r, 200, 'wieder privat');
            ctx.published = false;
            expectStatus(await api.get(`/api/ast/${ctx.root}`, { anonymous: true }), 403, 'Fremder liest Code');
            return 'privat';
        }
    },

    // ============================================================== WEBSITE
    // Plan "Bauarbeiter + Bauplan-Format": GET /api/sites/<domain> liefert den
    // Bauplan – immer so, wie ein anonymer Besucher die Website sieht. Mit Login
    // wird die Check-Domain kurz öffentlich gemacht (nur sie, nicht die Kinder).
    // Eigene Domains (Plan "SSF-Ausbau", Teil D) – legt NIE etwas bei Cloudflare an:
    // nur Liste, eine ungültige Eingabe und die geschützte Abfrage des Bauarbeiters
    {
        id: 'custom-domains-list',
        group: 'Website',
        title: 'Eigene Domains: Liste der Website (mit blue)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.get(`/api/objects/${ctx.root}/custom-domains`);
            expectStatus(r, 200, 'Liste der eigenen Domains');
            const data = r.data?.data;
            expect(Array.isArray(data?.domains) && typeof data.enabled === 'boolean', 'Antwort unvollständig', r);
            return `${data.enabled ? 'eingerichtet' : 'nicht eingerichtet'}, Ziel ${data.cnameTarget}`;
        }
    },
    {
        id: 'custom-domains-apex',
        group: 'Website',
        title: 'Eigene Domains: nackte Domain wird abgelehnt (nichts bei Cloudflare)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.post(`/api/objects/${ctx.root}/custom-domains`, { hostname: 'check-beispiel.ch' });
            // Gast: 403 (nur Menschen) · nicht eingerichtet: 503 · eingeloggt: 400 (nackte Domain)
            expect([400, 403, 503].includes(r.status), `unerwarteter Status ${r.status}`, r);
            if (r.status === 400) expect(/Unterdomain/.test(r.data?.error || ''), 'unerwartete Meldung', r);
            return `abgelehnt (${r.status})`;
        }
    },
    {
        id: 'custom-domains-lookup-protected',
        group: 'Website',
        title: 'Eigene Domains: die Abfrage des Bauarbeiters braucht seinen Schlüssel',
        run: async () => {
            const r = await api.get('/api/sites/_host/www.check-beispiel.ch', { anonymous: true });
            expectStatus(r, 403, 'Abfrage ohne Bauarbeiter-Schlüssel');
            return 'ohne Schlüssel: 403';
        }
    },
    {
        id: 'site-private',
        group: 'Website',
        title: 'Private Domain: ohne Website-Anmeldung zu – auch für dich (401 „bitte anmelden“)',
        needs: ['domainName'],
        run: async ctx => {
            // Seit "Login auf Websites": 401 SITE_LOGIN_REQUIRED statt 404 – nie ein Bauplan.
            // Das Cockpit-Login zählt hier nicht (nur ein Website-Ausweis über den Bauarbeiter).
            const r = await api.get(`/api/sites/${ctx.domainName}`);
            expectStatus(r, 401, 'Bauplan einer privaten Domain');
            expect(r.data?.code === 'SITE_LOGIN_REQUIRED', `code "${r.data?.code}" statt SITE_LOGIN_REQUIRED`, r);
            expect(r.data?.data === undefined, 'Eine private Domain hat einen Bauplan geliefert!', r);
            return r.error;
        }
    },
    {
        // Plan "Login auf Websites": Ausweis holen/prüfen geht NUR mit Bauarbeiter-Schlüssel
        id: 'site-login-bauarbeiter',
        group: 'Website',
        title: 'Login auf Websites: Ausweis und „wer ist angemeldet?“ nur für den Bauarbeiter (403)',
        needs: ['domainName'],
        run: async ctx => {
            const ausweis = await api.post(`/api/sites/${ctx.domainName}/ausweis`, { code: 'x', state: 'y' });
            expectStatus(ausweis, 403, 'Ausweis ohne Bauarbeiter-Schlüssel');
            expect(ausweis.data?.code === 'BAUARBEITER_ONLY', 'code BAUARBEITER_ONLY fehlt', ausweis);
            const wer = await api.get(`/api/sites/${ctx.domainName}/besucher`);
            expectStatus(wer, 403, '„wer ist angemeldet?“ ohne Bauarbeiter-Schlüssel');
            const ab = await api.post(`/api/sites/${ctx.domainName}/abmelden`, { token: 'x' });
            expectStatus(ab, 403, 'Abmelden ohne Bauarbeiter-Schlüssel');
            return 'ausweis · besucher · abmelden ⛔';
        }
    },
    {
        id: 'site-preview',
        group: 'Website',
        title: 'Vorschau für den Besitzer: auch privat sichtbar, mit Adresse und „noch privat“',
        needs: ['root', 'domainName'],
        run: async ctx => {
            const r = await api.get(`/api/sites/${ctx.domainName}/vorschau`);
            expectStatus(r, 200, 'Vorschau holen');
            const meta = r.data?.meta || {};
            expect(meta.preview === true, 'meta.preview fehlt', r);
            expect(typeof r.data?.data?.files?.['index.html'] === 'string', 'index.html fehlt', r);
            expect(meta.online === false, 'Die private Domain sollte nicht online sein', r);
            expect(
                (meta.notPublic || []).some(n => n.uuid === ctx.root),
                'Die Domain fehlt in „noch privat“',
                r
            );
            const anon = await api.get(`/api/sites/${ctx.domainName}/vorschau`, { anonymous: true });
            expectStatus(anon, 404, 'Vorschau als anonymer Besucher');
            return `${meta.address} · ${meta.notPublic.length} Teil(e) noch privat`;
        }
    },
    // Plan "Screenshots in der Vorschau", S3: ein Bild aus einem echten Browser (Cloudflare)
    {
        id: 'site-screenshot',
        group: 'Website',
        title: 'Screenshot der Vorschau: Bild + Fehler aus der Browser-Konsole (Cloudflare)',
        needs: ['domainName'],
        run: async ctx => {
            const bad = await api.get(`/api/sites/${ctx.domainName}/vorschau`, { query: { screenshot: 'riesig' } });
            expectStatus(bad, 400, 'falscher Wert');
            const r = await api.get(`/api/sites/${ctx.domainName}/vorschau`, { query: { screenshot: 'mobile' } });
            // Gäste bekommen keine Screenshots (kostet Geld) – dann ist hier nichts zu prüfen
            if (r.status === 403) return 'nur mit Login prüfbar – übersprungen';
            expectStatus(r, 200, 'Vorschau mit Screenshot');
            const shot = r.data?.meta?.screenshot || {};
            if (/nicht eingerichtet/.test(shot.error || '')) return 'Cloudflare-Schlüssel fehlt hier – übersprungen';
            expect(!shot.error, `Screenshot: ${shot.error}`, r);
            expect(screenshotSource(shot) !== null, 'Kein gültiges Bild', r);
            expect(Array.isArray(shot.consoleErrors), 'consoleErrors fehlt', r);
            return `${shot.width}×${shot.height} ${shot.mimeType}, ${shot.consoleErrors.length} Konsolen-Meldung(en)`;
        }
    },
    // Plan "Geo-Monitor", G4: Unterseite fotografieren – nur Pfade dieser Website.
    // Prüft nur die Ablehnungen (kostet keinen Screenshot bei Cloudflare).
    {
        id: 'site-screenshot-path',
        group: 'Website',
        title: 'Screenshot einer Unterseite (path): fremde Adressen abgelehnt',
        needs: ['domainName'],
        run: async ctx => {
            const ohne = await api.get(`/api/sites/${ctx.domainName}/vorschau`, { query: { path: '#/a' } });
            expectStatus(ohne, 400, 'path ohne screenshot');
            const fremd = await api.get(`/api/sites/${ctx.domainName}/vorschau`, {
                query: { screenshot: 'mobile', path: '//böse.example' }
            });
            if (fremd.status === 403) return 'nur mit Login ganz prüfbar – Teil 1 ok';
            expectStatus(fremd, 400, 'fremde Adresse als path');
            return 'ohne screenshot: 400 · fremde Adresse: 400';
        }
    },
    {
        id: 'site-names',
        group: 'Website',
        title: 'Ungültige und reservierte Namen haben keine Website (404)',
        run: async () => {
            for (const name of ['www', 'api', 'Gross-Geschrieben', 'mit_unterstrich']) {
                expectStatus(await api.get(`/api/sites/${encodeURIComponent(name)}`), 404, `Name „${name}“`);
            }
            return 'www · api · Grossbuchstaben · _';
        }
    },
    {
        id: 'site-static',
        group: 'Website',
        title: 'Öffentlich: statischer Bauplan aus der DNA, private Kinder fehlen',
        needs: ['root', 'domainName'],
        run: async ctx => {
            const me = await api.get('/api/me');
            if (!me.data?.isAuthenticated) return 'nur mit Login prüfbar (veröffentlichen) – übersprungen';
            const pub = await api.put(`/api/objects/${ctx.root}/visibility`, {
                visibility: 'public',
                includeChildren: false
            });
            expectStatus(pub, 200, 'Domain öffentlich');
            ctx.sitePublished = true;

            const r = await api.get(`/api/sites/${ctx.domainName}`);
            expectStatus(r, 200, 'Bauplan holen');
            const plan = r.data?.data;
            expect(plan?.bauplan === 1, 'Bauplan ohne Versionsnummer 1', r);
            expect(r.data?.meta?.source === 'static', `Quelle "${r.data?.meta?.source}" statt "static"`, r);
            expect(typeof plan.files?.['index.html'] === 'string', 'index.html fehlt', r);
            // Die Kinder (funktion, daten, lager) sind privat -> kein JS der Test-SSF usw.
            expect(!JSON.stringify(plan).includes('requestContext'), 'SSF-Code ist im Bauplan gelandet!', r);
            return `${Object.keys(plan.files).length} Datei(en), cache ${plan.cache} s`;
        }
    },
    {
        id: 'site-run-private',
        group: 'Website',
        title: 'Private SSF ist für die Website nicht erreichbar (404)',
        needs: ['domainName', 'funktion'],
        run: async ctx => {
            // Die Test-SSF "funktion" ist privat -> eine Website kann sie nicht starten
            expectStatus(await api.post(`/api/sites/${ctx.domainName}/run/funktion`, {}), 404, 'private SSF');
            return '404';
        }
    },
    {
        id: 'site-run',
        group: 'Website',
        title: 'Öffentlich: die Website ruft ihre SSF auf (mit Eingabe, als anonymer Besucher)',
        needs: ['root', 'domainName', 'funktion'],
        run: async ctx => {
            if (!ctx.sitePublished) return 'nur mit Login prüfbar – übersprungen';
            const pub = await api.put(`/api/objects/${ctx.funktion}/visibility`, { visibility: 'public' });
            expectStatus(pub, 200, 'SSF öffentlich');
            const save = await api.post(`/api/ast/${ctx.funktion}`, {
                snippets: [
                    {
                        type: 'ssf',
                        code: 'return { site: requestContext.site, besucher: requestContext.userUuid, x: requestContext.body.x };'
                    }
                ]
            });
            expectStatus(save, 201, 'SSF speichern');
            const r = await api.post(`/api/sites/${ctx.domainName}/run/funktion`, { x: 42 });
            expectStatus(r, 200, 'SSF der Website ausführen');
            const res = r.data?.result || {};
            expect(res.site?.domain === ctx.domainName && res.site?.run === 'funktion', 'requestContext.site fehlt', r);
            expect(res.besucher === null, 'Die SSF hätte den Aufrufer nicht kennen dürfen', r);
            expect(res.x === 42, 'Eingabe kam nicht an', r);
            return 'site ✓ · anonym ✓ · Eingabe ✓';
        }
    },
    {
        id: 'site-unpublish',
        group: 'Website',
        title: 'Wieder privat: die Website ist sofort zu (401 „bitte anmelden“)',
        needs: ['root', 'domainName'],
        run: async ctx => {
            if (!ctx.sitePublished) return 'nur mit Login prüfbar – übersprungen';
            if (ctx.funktion) await api.put(`/api/objects/${ctx.funktion}/visibility`, { visibility: 'private' });
            const r = await api.put(`/api/objects/${ctx.root}/visibility`, { visibility: 'private' });
            expectStatus(r, 200, 'wieder privat');
            ctx.sitePublished = false;
            expectStatus(await api.get(`/api/sites/${ctx.domainName}`), 401, 'Bauplan nach dem Zurückstellen');
            return 'privat · 401';
        }
    },

    // ============================================================== WERKZEUGE
    // Plan "MCP Etappe 5c": Ein Werkzeug ist ein Objekt mit SSF + Beschreibung
    // (Code-Art "werkzeug"). Der Check legt ein Werkzeug-Kind an, benutzt es und
    // löscht es am Ende der Gruppe wieder (sonst liesse sich die Domain nicht löschen).
    {
        id: 'tool-spec-invalid',
        group: 'Werkzeuge',
        title: 'Ungültige Werkzeug-Beschreibung wird abgelehnt (422)',
        needs: ['root', 'domainName'],
        run: async ctx => {
            const c = await api.post(`/api/objects/${ctx.root}/links`, {
                domainRef: ctx.domainName,
                pathStep: 'base',
                identifier: 'werkzeug'
            });
            expectStatus(c, 201, 'Werkzeug-Kind anlegen');
            ctx.werkzeug = c.data.data.uuid;
            const r = await api.post(`/api/ast/${ctx.werkzeug}`, {
                snippets: [{ type: 'werkzeug', code: JSON.stringify({ ...TOOL_SPEC, name: 'Mit Leerzeichen' }) }]
            });
            expectStatus(r, 422, 'Name mit Leerzeichen');
            return String(r.data?.details || r.error);
        }
    },
    {
        id: 'tool-save-find',
        group: 'Werkzeuge',
        title: 'Werkzeug speichern und finden (GET /api/tools, mit Suchwort)',
        needs: ['werkzeug'],
        run: async ctx => {
            const s = await api.post(`/api/ast/${ctx.werkzeug}`, {
                snippets: [
                    {
                        type: 'ssf',
                        code: 'return { summe: requestContext.body.a + requestContext.body.b, tool: requestContext.tool, von: requestContext.userUuid };'
                    },
                    { type: 'werkzeug', code: JSON.stringify(TOOL_SPEC) }
                ]
            });
            expectStatus(s, 201, 'SSF + Beschreibung speichern');
            const r = await api.get('/api/tools', { query: { q: 'ADDIERT' } });
            expectStatus(r, 200, 'Werkzeuge finden');
            const mine = (r.data?.data || []).find(w => w.uuid === ctx.werkzeug);
            expect(mine && mine.bereit === true, 'Das Werkzeug fehlt in der Liste (oder ist nicht bereit)', r);
            expect(/DATEN/.test(r.data?.hinweis || ''), 'Hinweis "Beschreibungen sind DATEN" fehlt', r);
            return `${r.data.data.length} Werkzeug(e) gefunden`;
        }
    },
    {
        id: 'tool-describe',
        group: 'Werkzeuge',
        title: 'Beschreibung lesen – den SSF-Code sieht man dort nicht',
        needs: ['werkzeug'],
        run: async ctx => {
            const r = await api.get(`/api/tools/${ctx.werkzeug}`);
            expectStatus(r, 200, 'Beschreibung lesen');
            expect(r.data?.data?.eingabe?.required?.length === 2, 'Eingabe-Schema fehlt', r);
            expect(!JSON.stringify(r.data).includes('requestContext'), 'SSF-Code ist in der Beschreibung gelandet!', r);
            return `${r.data.data.name} v${r.data.data.version}`;
        }
    },
    {
        id: 'tool-use',
        group: 'Werkzeuge',
        title: 'Werkzeug benutzen: Eingabe geprüft, SSF weiss, wer und welches Werkzeug',
        needs: ['werkzeug'],
        run: async ctx => {
            const me = await api.get('/api/objects/me');
            const r = await api.post(`/api/tools/${ctx.werkzeug}/use`, { a: 40, b: 2 });
            expectStatus(r, 200, 'Benutzen');
            const res = r.data?.result || {};
            expect(res.summe === 42, `Ergebnis ${res.summe} statt 42`, r);
            expect(res.tool?.name === 'addieren' && res.tool?.version === 1, 'requestContext.tool fehlt', r);
            expect(!me.data?.data?.uuid || res.von === me.data.data.uuid, 'Die SSF kennt den Aufrufer nicht', r);
            return 'Summe 42 · tool ✓ · Aufrufer ✓';
        }
    },
    {
        id: 'tool-use-invalid',
        group: 'Werkzeuge',
        title: 'Falsche Eingabe: 400 mit der Liste der Probleme',
        needs: ['werkzeug'],
        run: async ctx => {
            const r = await api.post(`/api/tools/${ctx.werkzeug}/use`, { a: 'viel', extra: 1 });
            expectStatus(r, 400, 'Falsche Eingabe');
            expect(r.data?.code === 'INVALID_INPUT', 'code INVALID_INPUT fehlt', r);
            const details = r.data?.details || [];
            expect(details.length === 3, `erwartet 3 Probleme, bekam ${details.length}`, r);
            return details.join(' · ');
        }
    },
    {
        id: 'tool-delete',
        group: 'Werkzeuge',
        title: 'Werkzeug löschen: danach nicht mehr in der Liste',
        needs: ['werkzeug'],
        run: async ctx => {
            expectStatus(await api.del(`/api/objects/${ctx.werkzeug}`), 200, 'Werkzeug löschen');
            const r = await api.get('/api/tools');
            expect(
                !(r.data?.data || []).some(w => w.uuid === ctx.werkzeug),
                'Gelöschtes Werkzeug noch in der Liste',
                r
            );
            ctx.werkzeug = null;
            return 'gelöscht';
        }
    },

    // ============================================================== FREIGABE-ANFRAGEN
    // Plan "MCP Etappe 5d": um Veröffentlichung BITTEN (das darf jeder mit blue,
    // auch eine KI) und entscheiden (nur Menschen). Der Check bittet für die
    // Test-Domain und lehnt dann ab – veröffentlicht wird hier nie etwas.
    {
        id: 'publish-request-create',
        group: 'Freigabe-Anfragen',
        title: 'Um Veröffentlichung bitten – eine neue Bitte ersetzt die alte',
        needs: ['root'],
        run: async ctx => {
            const body = { visibility: 'public', includeChildren: true, reason: 'Systemcheck' };
            const r = await api.post(`/api/objects/${ctx.root}/publish-request`, body);
            expectStatus(r, 201, 'Bitte stellen');
            const again = await api.post(`/api/objects/${ctx.root}/publish-request`, body);
            expectStatus(again, 201, 'zweite Bitte');
            expect(again.data?.replaced === true, 'Die zweite Bitte hat die erste nicht ersetzt', again);
            ctx.publishRequest = again.data.data.uuid;
            const priv = await api.post(`/api/objects/${ctx.root}/publish-request`, { visibility: 'private' });
            expectStatus(priv, 400, 'Bitte um "privat"');
            return 'gestellt · ersetzt · "privat" ⛔';
        }
    },
    {
        id: 'publish-request-pending',
        group: 'Freigabe-Anfragen',
        title: '„Wartet auf dich“ zeigt die Bitte mit allem, was passieren würde',
        needs: ['publishRequest', 'domainName'],
        run: async ctx => {
            const r = await api.get('/api/publish-requests/pending');
            expectStatus(r, 200, 'Wartet auf dich');
            const item = (r.data?.data || []).find(x => x.uuid === ctx.publishRequest);
            expect(item, 'Die Bitte fehlt in der Liste', r);
            expect(item.objectName === ctx.domainName && item.includeChildren === true, 'Falsche Angaben', r);
            expect(item.childCount >= 1, `childCount ${item.childCount} – die Test-Domain hat Kinder`, r);
            return `${ctx.domainName} + ${item.childCount} Unter-Objekte → öffentlich`;
        }
    },
    {
        id: 'publish-request-decline',
        group: 'Freigabe-Anfragen',
        title: 'Ablehnen mit Notiz: nichts wird veröffentlicht',
        needs: ['publishRequest', 'root'],
        run: async ctx => {
            const me = await api.get('/api/me');
            if (!me.data?.isAuthenticated) {
                // Gäste dürfen nie veröffentlichen – auch nicht über eine Bitte
                const a = await api.post(`/api/publish-requests/${ctx.publishRequest}/approve`, {});
                expectStatus(a, 403, 'Freigeben als Gast');
            }
            const d = await api.post(`/api/publish-requests/${ctx.publishRequest}/decline`, { note: 'Systemcheck' });
            expectStatus(d, 200, 'Ablehnen');
            expect(d.data?.data?.status === 'declined', 'Status ist nicht "declined"', d);
            const mine = await api.get('/api/publish-requests/mine');
            const item = (mine.data?.data || []).find(x => x.uuid === ctx.publishRequest);
            expect(
                item?.status === 'declined' && item?.note === 'Systemcheck',
                'Eigene Liste zeigt die Entscheidung nicht',
                mine
            );
            const objs = await api.get('/api/objects');
            const root = (objs.data || []).find(o => o.uuid === ctx.root);
            expect(root?.visibility === 'private', 'Die Domain ist nicht mehr privat!', objs);
            return `abgelehnt · noch privat${me.data?.isAuthenticated ? '' : ' · Gast darf nicht freigeben ✓'}`;
        }
    },

    // ============================================================== KI-ZUGANG
    // Plan "MCP": Eine KI arbeitet mit einem Schlüssel als ein Objekt – hier als
    // die Test-Domain. Schlüssel erzeugen darf nur ein eingeloggter Mensch; als
    // Gast wird nur geprüft, dass es abgelehnt wird. Die Schlüssel verschwinden
    // beim Aufräumen automatisch mit der Test-Domain.
    {
        id: 'ai-token-create',
        group: 'KI-Zugang',
        title: 'KI-Schlüssel erzeugen: nur mit Login (Gast wird abgelehnt)',
        needs: ['root'],
        run: async ctx => {
            const me = await api.get('/api/me');
            const r = await api.post(
                `/api/tokens/object/${ctx.root}`,
                { name: 'Systemcheck', expiresInHours: 1 },
                { sensitive: true } // Schlüssel im Anfragen-Protokoll nur als ***
            );
            if (!me.data?.isAuthenticated) {
                expectStatus(r, 403, 'Gast erzeugt Schlüssel');
                return 'Gast: abgelehnt (richtig) – die nächsten Prüfungen brauchen einen Login';
            }
            expectStatus(r, 201, 'Schlüssel erzeugen');
            const token = r.data?.data?.token;
            expect(/^at0_[A-Za-z0-9_-]{43}$/.test(token || ''), 'Schlüssel hat nicht das Format at0_…', r);
            ctx.aiToken = token;
            ctx.aiTokenUuid = r.data.data.uuid;
            return `gültig bis ${new Date(r.data.data.expiresAt).toLocaleString('de-CH')}`;
        }
    },
    {
        id: 'ai-acts-as-object',
        group: 'KI-Zugang',
        title: 'Mit dem Schlüssel handelt die KI als die Test-Domain und darf dort schreiben',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            const me = await api.get('/api/me', { bearer: ctx.aiToken });
            expectStatus(me, 200, 'GET /api/me als KI');
            expect(me.data?.isAi === true, 'Antwort sagt nicht "isAi"', me);
            expect(me.data?.object?.uuid === ctx.root, 'KI handelt als falsches Objekt', me);
            const w = await api.post(`/api/core-data/${ctx.root}`, { data: { von: 'KI' } }, { bearer: ctx.aiToken });
            expectStatus(w, 201, 'KI schreibt Daten');
            return `als „${me.data.object.domain}“ · schreiben ✓`;
        }
    },
    {
        id: 'ai-human-only',
        group: 'KI-Zugang',
        title: 'Die KI darf nie veröffentlichen und keine Tresor-Werte setzen (HUMAN_ONLY)',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            const v = await api.put(
                `/api/objects/${ctx.root}/visibility`,
                { visibility: 'public' },
                { bearer: ctx.aiToken }
            );
            expectStatus(v, 403, 'KI veröffentlicht');
            expect(v.data?.code === 'HUMAN_ONLY', 'erwartet code HUMAN_ONLY', v);
            const s = await api.put(
                `/api/secrets/${ctx.root}/KI_TEST`,
                { value: 'x' },
                { bearer: ctx.aiToken, sensitive: true }
            );
            expectStatus(s, 403, 'KI setzt Tresor-Wert');
            return 'veröffentlichen ⛔ · Tresor ⛔';
        }
    },
    {
        id: 'ai-audit',
        group: 'KI-Zugang',
        title: 'Das Protokoll zeigt den abgelehnten Versuch der KI',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            // Das Backend schreibt NACH der Antwort – darum bis zu 5x kurz warten
            let entry = null;
            let r;
            for (let i = 0; i < 5 && !entry; i++) {
                if (i) await new Promise(res => setTimeout(res, 300));
                r = await api.get(`/api/audit/actor/${ctx.root}`, { query: { limit: 20 } });
                expectStatus(r, 200, 'Protokoll lesen');
                entry = (r.data?.data || []).find(
                    e => e.action === 'objekt.sichtbarkeit' && e.actorKind === 'ai' && e.success === false
                );
            }
            expect(entry, 'Kein Eintrag "objekt.sichtbarkeit" (KI, abgelehnt) im Protokoll', r);
            expect(entry.tokenUuid === ctx.aiTokenUuid, 'Eintrag nennt den falschen Schlüssel', r);
            return `${r.data.data.length} Einträge · Versuch mit ${entry.status} protokolliert`;
        }
    },
    {
        id: 'ai-domain-co-owner',
        group: 'KI-Zugang',
        title: 'Eine Domain, die die KI anlegt, gehört auch dir (black/red/blue)',
        needs: ['root', 'domainName'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            const me = await api.get('/api/me', { bearer: ctx.aiToken });
            const humanUuid = me.data?.human?.uuid;
            expect(humanUuid, 'whoami der KI nennt ihren Menschen nicht', me);

            const c = await api.post('/api/objects', { domain: ctx.domainName + '-ki' }, { bearer: ctx.aiToken });
            expectStatus(c, 201, 'KI legt Domain an');
            const kiDomain = c.data.data.uuid;
            try {
                const m = await api.get(`/api/objects/${kiDomain}/members`);
                expectStatus(m, 200, 'Du siehst die Rechte der KI-Domain');
                const mine = (m.data?.data?.members || []).find(x => x.uuid === humanUuid);
                expect(
                    mine && JSON.stringify(mine.roles) === '["black","blue","red"]',
                    `Deine Rechte: ${mine ? mine.roles.join(', ') : 'keine'}`,
                    m
                );
            } finally {
                // Gleich wieder weg (du hast blue darauf)
                await api.del(`/api/objects/${kiDomain}`);
            }
            return 'black · red · blue für dich · wieder gelöscht';
        }
    },
    // Plan "Agenten im Griff" (18.10.2026): Die Test-Domain hat jetzt einen Schlüssel
    // von dir – also ist sie einer "deiner Agenten" in GET /api/agents.
    {
        id: 'agents-overview',
        group: 'KI-Zugang',
        title: 'Agenten-Übersicht: die Test-Domain erscheint mit Schlüssel und Aktivität',
        needs: ['root'],
        run: async ctx => {
            const r = await api.get('/api/agents', { query: { days: 7 } });
            if (!ctx.aiToken) {
                expectStatus(r, 403, 'Agenten-Übersicht als Gast');
                return 'Gast: abgelehnt (richtig) – nur mit Login';
            }
            expectStatus(r, 200, 'Agenten-Übersicht');
            expect(r.data?.meta?.days === 7, 'Zeitraum ?days=7 nicht übernommen', r);
            // Das Protokoll schreibt NACH der Antwort – darum bis zu 5x kurz warten
            let agent = null;
            for (let i = 0; i < 5; i++) {
                const list = i ? await api.get('/api/agents', { query: { days: 7 } }) : r;
                agent = (list.data?.data || []).find(a => a.uuid === ctx.root);
                if (agent && agent.stats?.actions > 0) break;
                await new Promise(res => setTimeout(res, 300));
            }
            expect(agent, 'Die Test-Domain fehlt in der Übersicht', r);
            expect(agent.tokens?.active >= 1, 'Kein gültiger Schlüssel gezählt', r);
            expect(agent.lastActivityAt && agent.stats.actions > 0, 'Keine Aktivität der KI gezählt', r);
            expect(!JSON.stringify(agent).includes('tokenHash'), 'Fingerabdruck in der Antwort!', r);
            return `${r.data.data.length} Agent(en) · ${agent.stats.actions} Aktionen · ${agent.tokens.active} Schlüssel`;
        }
    },
    {
        id: 'agents-ai-denied',
        group: 'KI-Zugang',
        title: 'Eine KI sieht die Agenten-Übersicht nie (HUMAN_ONLY)',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            const r = await api.get('/api/agents', { bearer: ctx.aiToken });
            expectStatus(r, 403, 'KI fragt die Agenten-Übersicht');
            expect(r.data?.code === 'HUMAN_ONLY', 'erwartet code HUMAN_ONLY', r);
            return '⛔ HUMAN_ONLY';
        }
    },
    // Plan "OAuth für MCP" (Etappe 4): Verbindungen trennen dürfen nur Menschen – und
    // nur ihre eigenen. Eine erfundene Verbindung gibt es für niemanden (404).
    {
        id: 'oauth-disconnect-guarded',
        group: 'KI-Zugang',
        title: 'OAuth-Verbindung trennen: nur Menschen, unbekannte Verbindung = 404',
        needs: ['root'],
        run: async ctx => {
            const fake = crypto.randomUUID();
            const r = await api.del(`/api/agents/connections/${fake}`);
            if (!ctx.aiToken) {
                expectStatus(r, 403, 'Gast trennt eine Verbindung');
                return 'Gast: abgelehnt (richtig)';
            }
            expectStatus(r, 404, 'Erfundene Verbindung trennen');
            const ki = await api.del(`/api/agents/connections/${fake}`, { bearer: ctx.aiToken });
            expectStatus(ki, 403, 'KI trennt eine Verbindung');
            expect(ki.data?.code === 'HUMAN_ONLY', 'erwartet code HUMAN_ONLY', ki);
            return 'erfunden: 404 · KI: ⛔ HUMAN_ONLY';
        }
    },
    // Ist OAuth eingeschaltet, muss die Auskunft genau das sagen, was Claude braucht
    // (Ausweis-Seite/CIMD, nur PKCE S256, keine Selbst-Registrierung).
    {
        id: 'oauth-metadata',
        group: 'KI-Zugang',
        title: 'OAuth-Auskunft für Claude (nur wenn OAuth eingeschaltet ist)',
        run: async () => {
            const res = await fetch(`${apiBase()}/.well-known/oauth-authorization-server`);
            if (res.status === 404) return 'OAuth ist aus (OAUTH_ENABLED) – nichts zu prüfen';
            expect(res.ok, `Auskunft antwortet mit ${res.status}`);
            const m = await res.json();
            expect(m.client_id_metadata_document_supported === true, 'CIMD fehlt in der Auskunft', m);
            expect(JSON.stringify(m.token_endpoint_auth_methods_supported) === '["none"]', 'Nur "none" erwartet', m);
            expect(JSON.stringify(m.code_challenge_methods_supported) === '["S256"]', 'Nur S256 erwartet', m);
            expect(!m.registration_endpoint, 'Selbst-Registrierung ist offen!', m);
            const prm = await fetch(`${apiBase()}/.well-known/oauth-protected-resource/mcp`);
            expect(prm.ok, `Auskunft für /mcp antwortet mit ${prm.status}`);
            const p = await prm.json();
            expect(p.resource === `${m.issuer}/mcp`, `resource ${p.resource} passt nicht zu ${m.issuer}/mcp`, p);
            return `eingeschaltet · ${m.issuer} · CIMD ✓ · S256 ✓ · keine Selbst-Registrierung ✓`;
        }
    },
    {
        id: 'ai-revoke',
        group: 'KI-Zugang',
        title: 'Widerrufen: der Schlüssel ist sofort ungültig (401)',
        needs: ['root'],
        run: async ctx => {
            if (!ctx.aiToken) return 'nur mit Login prüfbar – übersprungen';
            expectStatus(await api.del(`/api/tokens/${ctx.aiTokenUuid}`), 200, 'Schlüssel widerrufen');
            const me = await api.get('/api/me', { bearer: ctx.aiToken });
            expectStatus(me, 401, 'GET /api/me mit widerrufenem Schlüssel');
            ctx.aiToken = null;
            return 'widerrufen ✓ · 401 ✓';
        }
    },

    // ============================================================== LÖSCHEN & AUFRÄUMEN
    // Muss GANZ AM SCHLUSS stehen: Hier wird alles gelöscht, was der Check
    // angelegt hat. Regeln (Plan "Objekte löschen"): blue nötig, nur ohne
    // Kinder, Name wird gesperrt, nie herrenlos.
    {
        id: 'delete-with-children',
        group: 'Löschen & Aufräumen',
        title: 'Eine Domain mit Kindern kann nicht gelöscht werden (409)',
        needs: ['root'],
        run: async ctx => {
            const r = await api.del(`/api/objects/${ctx.root}`);
            expectStatus(r, 409, 'Domain mit Kindern löschen');
            return r.error;
        }
    },
    {
        id: 'delete-orphan-guard',
        group: 'Löschen & Aufräumen',
        title: 'Nie herrenlos: die SSF ist einzige Verwalterin von „-solo“ (409)',
        needs: ['funktion', 'soloName'],
        run: async ctx => {
            const r = await api.del(`/api/objects/${ctx.funktion}`);
            expectStatus(r, 409, 'SSF löschen');
            const orphans = r.data?.orphans || [];
            expect(orphans.includes(ctx.soloName), `„${ctx.soloName}“ fehlt in der Liste: ${orphans.join(', ')}`, r);
            return `betroffen: ${orphans.join(', ')}`;
        }
    },
    {
        id: 'delete-solo',
        group: 'Löschen & Aufräumen',
        title: 'Die SSF gibt dir „-solo“ (blue), danach kannst du es löschen',
        needs: ['funktion', 'soloName'],
        run: async ctx => {
            const r = await runSsf(
                ctx,
                `const o = await api.objects.get('${ctx.soloName}');
for (const rolle of ['black', 'red', 'blue']) await api.roles.grant(o.uuid, requestContext.userUuid, rolle);
return o.uuid;`
            );
            expectStatus(r, 200, 'SSF gibt ab');
            const d = await api.del(`/api/objects/${r.data.result}`);
            expectStatus(d, 200, '„-solo“ löschen');
            return `${ctx.soloName} gelöscht`;
        }
    },
    {
        id: 'delete-children',
        group: 'Löschen & Aufräumen',
        title: 'Von unten nach oben: zuerst die Kinder löschen',
        needs: ['root', 'funktion', 'daten', 'lager'],
        run: async ctx => {
            // Die gezügelte Kopie ist ebenfalls ein Kind von check-xxxx
            const kids = { funktion: ctx.funktion, daten: ctx.daten, lager: ctx.lager };
            if (ctx.moved) kids.kopie = ctx.copy;
            for (const [name, uuid] of Object.entries(kids)) {
                const r = await api.del(`/api/objects/${uuid}`);
                expectStatus(r, 200, `Kind „${name}“ löschen`);
            }
            ctx.childrenDeleted = true;
            return Object.keys(kids).join(', ');
        }
    },
    {
        id: 'delete-root',
        group: 'Löschen & Aufräumen',
        title: 'Danach die Domain selbst löschen',
        needs: ['root', 'childrenDeleted'],
        run: async ctx => {
            const r = await api.del(`/api/objects/${ctx.root}`);
            expectStatus(r, 200, 'Domain löschen');
            ctx.rootDeleted = true;
            return `${ctx.domainName} gelöscht`;
        }
    },
    {
        id: 'delete-name-locked',
        group: 'Löschen & Aufräumen',
        title: 'Der Name ist danach gesperrt (409)',
        needs: ['rootDeleted'],
        run: async ctx => {
            const r = await api.post('/api/objects', { domain: ctx.domainName });
            expectStatus(r, 409, 'gelöschten Namen neu anlegen');
            expect(/gesperrt/.test(r.error || ''), `unerwartete Meldung "${r.error}"`, r);
            return r.error;
        }
    },
    {
        id: 'delete-extras',
        group: 'Löschen & Aufräumen',
        title: 'Die übrigen Test-Domains löschen (-zwei, -daten, -kauf)',
        needs: ['root'],
        run: async ctx => {
            const extras = { zwei: ctx.zwei, daten: ctx.dataCopy, kauf: ctx.kauf };
            const done = [];
            for (const [name, uuid] of Object.entries(extras)) {
                if (!uuid) continue; // wurde nicht angelegt (frühere Prüfung fehlgeschlagen)
                const r = await api.del(`/api/objects/${uuid}`);
                expectStatus(r, 200, `„-${name}“ löschen`);
                done.push(`-${name}`);
            }
            return done.length ? done.join(', ') : 'nichts zu tun';
        }
    },
    {
        id: 'delete-all-gone',
        group: 'Löschen & Aufräumen',
        title: 'Aufgeräumt: kein Objekt des Checks ist übrig',
        needs: ['rootDeleted'],
        run: async ctx => {
            const r = await api.get('/api/objects');
            expectStatus(r, 200, 'Objekt-Liste');
            const prefix = ctx.domainName;
            const left = (r.data || []).filter(o => (o.domain || o.domain_ref || '').startsWith(prefix));
            expect(left.length === 0, `${left.length} Objekte sind übrig`, r);
            return 'alles weg';
        }
    }
];

export const CHECK_GROUPS = [...new Set(CHECKS.map(c => c.group))];
