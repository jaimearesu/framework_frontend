// js/check/runner.js
// ---------------------------------------------------------------------
// DER PRÜF-MOTOR für den Systemcheck ("Teste alles")
//
// Eine Prüfung ist ein Objekt:
//   {
//     id:    'daten-einfuegen',
//     group: 'Daten & Suche',
//     title: 'Datensätze speichern',
//     needs: ['daten'],            // braucht Ergebnisse früherer Prüfungen
//     run:   async ctx => '12 gespeichert'   // wirft einen Fehler = nicht bestanden
//   }
//
// Die Prüfungen laufen NACHEINANDER. Sie teilen sich "ctx" (Kontext): Eine
// Prüfung kann dort etwas ablegen (z.B. die UUID der Test-Domain), das
// spätere brauchen. Fehlt etwas, wird die spätere Prüfung ÜBERSPRUNGEN
// statt mit einem Folgefehler zu scheitern – so sieht man die echte Ursache.
//
// Der Motor kennt kein Backend und keinen Bildschirm (reine Logik) –
// darum ist er automatisch getestet (tests/check.test.mjs).
// ---------------------------------------------------------------------

// Fehler einer Prüfung mit verständlicher Meldung
export class CheckError extends Error {
    constructor(message, response) {
        super(message);
        this.response = response; // die Antwort des Backends (für die Details)
    }
}

// Kleine Helfer für die Prüfungen
export const expect = (condition, message, response) => {
    if (!condition) throw new CheckError(message, response);
};
export const expectStatus = (res, status, what) =>
    expect(
        res.status === status,
        `${what}: erwartet Status ${status}, bekommen ${res.status || 'keine Antwort'}${res.error ? ` (${res.error})` : ''}`,
        res
    );

// Alle Prüfungen ausführen.
//   onUpdate(result) wird bei jeder Änderung aufgerufen (für die Anzeige)
//   shouldStop()     -> true bricht ab (Knopf "Stopp")
// Ergebnis je Prüfung: { id, status: 'pass'|'fail'|'skip', detail, ms, response }
export const runChecks = async (
    checks,
    { ctx = {}, onUpdate = () => {}, shouldStop = () => false, now = () => Date.now() } = {}
) => {
    const results = [];
    for (const check of checks) {
        if (shouldStop()) {
            const r = { id: check.id, status: 'skip', detail: 'abgebrochen' };
            results.push(r);
            onUpdate(r);
            continue;
        }
        const missing = (check.needs || []).filter(key => ctx[key] === undefined || ctx[key] === null);
        if (missing.length) {
            const r = { id: check.id, status: 'skip', detail: `übersprungen – es fehlt: ${missing.join(', ')}` };
            results.push(r);
            onUpdate(r);
            continue;
        }
        onUpdate({ id: check.id, status: 'running' });
        const started = now();
        let r;
        try {
            const detail = await check.run(ctx);
            r = { id: check.id, status: 'pass', detail: detail ?? '', ms: now() - started };
        } catch (err) {
            r = {
                id: check.id,
                status: 'fail',
                detail: err?.message || String(err),
                response: err?.response,
                ms: now() - started
            };
        }
        results.push(r);
        onUpdate(r);
    }
    return results;
};

// Zusammenfassung (reine Funktion)
export const summarize = results => ({
    total: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    skip: results.filter(r => r.status === 'skip').length
});

// Bericht als Text (zum Kopieren, z.B. in Notion oder einen Chat)
export const reportText = (checks, results, { mode, at = new Date() } = {}) => {
    const byId = new Map(results.map(r => [r.id, r]));
    const s = summarize(results);
    const mark = { pass: '✅', fail: '❌', skip: '⏭️' };
    const lines = [`at0mic Systemcheck – ${at.toLocaleString('de-CH')} – ${mode === 'test' ? 'Test-Modus' : 'LIVE'}`];
    lines.push(`${s.pass}/${s.total} bestanden, ${s.fail} fehlgeschlagen, ${s.skip} übersprungen`);
    let group = null;
    for (const c of checks) {
        if (c.group !== group) {
            group = c.group;
            lines.push('', `## ${group}`);
        }
        const r = byId.get(c.id);
        lines.push(`${r ? mark[r.status] || '•' : '•'} ${c.title}${r?.detail ? ` – ${r.detail}` : ''}`);
    }
    return lines.join('\n');
};
