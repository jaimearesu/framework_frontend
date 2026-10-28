// tests/load/live.mjs
// ---------------------------------------------------------------------
// LIVE-LAST (Härtungs-Runde Punkt 4a, 28.10.2026, Entscheidung L2)
//
// Wie viele gleichzeitige Live-Verbindungen schafft der Bauarbeiter, und wie
// schnell kommt eine Nachricht bei ALLEN an? Gemessen wird die echte WebSocket-Tür
// (site/live.js) auf einem eigenen Test-Port – nie die echten Websites. Das Backend
// ist nachgebaut (Zutritt immer erlaubt, die interne Leitung schreibt dieses Skript),
// damit nur der Bauarbeiter gemessen wird.
//
// Stufen: 50 / 200 / 500 Verbindungen, je 20 Nachrichten an alle.
// Starten (lokal oder auf dem Server im Frontend-Ordner):
//   node tests/load/live.mjs
// Optional: LIVE_STAGES=50,200,1000 LIVE_MESSAGES=50 node tests/load/live.mjs
// ---------------------------------------------------------------------
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const { createLive } = require('../../site/live.js');

const STAGES = (process.env.LIVE_STAGES || '50,200,500').split(',').map(Number);
const MESSAGES = Number(process.env.LIVE_MESSAGES || 20);
const KEY = 'k'.repeat(40);
const API_UUID = '11111111-1111-4111-8111-111111111111';
const wait = ms => new Promise(r => setTimeout(r, ms));
const silent = { info() {}, warn() {}, error() {} };

// --- das nachgebaute Backend -----------------------------------------
const streams = [];
const push = obj => {
    const line = new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
    for (const s of streams) {
        try {
            s.enqueue(line);
        } catch {
            // geschlossen
        }
    }
};
const fakeFetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/api/sites/_live/strom') {
        const body = new ReadableStream({
            start(c) {
                streams.push(c);
                c.enqueue(new TextEncoder().encode('{"t":"hallo"}\n'));
            }
        });
        return new Response(body, { status: 200 });
    }
    if (u.pathname === '/api/sites/_live/zahlen') return new Response('{}', { status: 200 });
    if (/\/live\/zutritt$/.test(u.pathname)) {
        const { pfade } = JSON.parse(init.body);
        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    erlaubt: Object.fromEntries(pfade.map(p => [p, API_UUID])),
                    regeln: {},
                    angemeldet: false,
                    konto: 'konto-last',
                    maxVerbindungen: 100000
                }
            }),
            { status: 200 }
        );
    }
    return new Response('{}', { status: 404 });
};

// --- Bauarbeiter-Tür auf einem freien Port ---------------------------
const live = createLive({
    apiUrl: 'http://backend.last',
    key: KEY,
    resolveHost: async () => ({ name: 'last', custom: null }),
    fetchImpl: fakeFetch,
    log: silent,
    limits: { maxPerIp: 100000 }
});
const server = http.createServer((req, res) => res.end('kein upgrade'));
server.on('upgrade', (req, socket, head) => live.handleUpgrade(req, socket, head));
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
live.start();
while (streams.length === 0) await wait(10);

// --- Besucher verbinden ----------------------------------------------
const clients = [];
const connectOne = () =>
    new Promise(resolve => {
        const host = `last.site.localhost:${port}`;
        const ws = new WebSocket(`ws://127.0.0.1:${port}/_at0mic/live`, {
            headers: { host, origin: `http://${host}` }
        });
        const client = { ws, got: new Map(), ok: false };
        ws.on('message', raw => {
            const m = JSON.parse(raw.toString());
            if (m.typ === 'abo-ok') client.ok = true;
            if (m.typ === 'nachricht' && m.daten && typeof m.daten.nr === 'number')
                client.got.set(m.daten.nr, Date.now());
        });
        ws.on('open', () => {
            ws.send(JSON.stringify({ typ: 'abo', pfad: 'api', kanal: 'chat' }));
            resolve(client);
        });
        ws.on('error', () => resolve(client));
    });

const percentile = (values, p) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const mb = bytes => Math.round(bytes / 1024 / 1024);

const rows = [];
const rssStart = process.memoryUsage().rss;
for (const target of STAGES) {
    while (clients.length < target) {
        const batch = Math.min(50, target - clients.length);
        clients.push(...(await Promise.all(Array.from({ length: batch }, connectOne))));
    }
    // warten, bis alle ihr Abo bestätigt haben (höchstens 10 s)
    const t0 = Date.now();
    while (clients.some(c => !c.ok) && Date.now() - t0 < 10000) await wait(20);
    const subscribed = clients.filter(c => c.ok).length;

    // Nachrichten an alle schicken und messen, wann sie ankommen
    for (const c of clients) c.got.clear();
    const sentAt = new Map();
    for (let nr = 0; nr < MESSAGES; nr++) {
        sentAt.set(nr, Date.now());
        push({ t: 'n', o: API_UUID, k: 'chat', d: { nr, text: 'Hallo an alle' } });
        await wait(50);
    }
    const t1 = Date.now();
    while (clients.some(c => c.ok && c.got.size < MESSAGES) && Date.now() - t1 < 15000) await wait(20);

    const latencies = [];
    let missing = 0;
    for (const c of clients.filter(x => x.ok)) {
        for (let nr = 0; nr < MESSAGES; nr++) {
            const at = c.got.get(nr);
            if (at) latencies.push(at - sentAt.get(nr));
            else missing++;
        }
    }
    rows.push({
        Verbindungen: target,
        'mit Abo': subscribed,
        Nachrichten: MESSAGES,
        'Median ms': percentile(latencies, 50),
        'p99 ms': percentile(latencies, 99),
        Verloren: missing,
        'Speicher MB': mb(process.memoryUsage().rss),
        'Speicher +MB': mb(process.memoryUsage().rss - rssStart)
    });
    console.log(`${target} Verbindungen gemessen …`);
}

console.log('');
console.table(rows);
console.log('Hinweis: Speicher = dieser ganze Prozess (Bauarbeiter-Tür UND die simulierten Besucher).');
console.log('Kopiere die Tabelle oben und schick sie an Claude. 🙂\n');

for (const c of clients) c.ws.terminate();
live.stop();
server.closeAllConnections();
server.close();
process.exit(0);
