// js/pages/systemcheck.js
// ---------------------------------------------------------------------
// SYSTEMCHECK – "Teste alles" mit einem Klick
//
// Führt alle Prüfungen aus js/check/checks.js nacheinander aus und zeigt
// sie gruppiert an: ✓ bestanden · ✗ fehlgeschlagen · ⏭ übersprungen.
// Ein Klick auf eine Prüfung zeigt die Details (Meldung, Antwort).
//
// Standard ist der TEST-Modus. Im Live-Modus schreibt der Check in die
// echte Datenbank (neue Domain "check-…", die bleibt) – darum muss man
// das dort ausdrücklich bestätigen.
// ---------------------------------------------------------------------
import { isTestMode, hasTestMode, setMode } from '../core/config.js';
import { invalidateObjects } from '../core/objects.js';
import { href } from '../core/routes.js';
import { h, mount, card, callout, toast, jsonView, copyText } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { pageHeader } from '../core/page.js';
import { formatMs } from '../core/format.js';
import { CHECKS, CHECK_GROUPS } from '../check/checks.js';
import { runChecks, summarize, reportText } from '../check/runner.js';

const STATUS_ICON = { pass: 'check', fail: 'alert', skip: 'arrowRight', running: 'refresh', idle: 'info' };

// Das letzte Ergebnis bleibt erhalten, wenn man die Seite wechselt
let lastRun = null; // { results: Map, mode, at, ms, ctx }

export default {
    render(root) {
        let running = false;
        let stopRequested = false;
        const results = new Map(lastRun?.results || []);

        const progressBar = h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill' }));
        const summaryBox = h('div', { class: 'check-summary' });
        const groupsBox = h('div', { class: 'check-groups' });
        const onlyFailed = h('input', { type: 'checkbox' });
        const liveConfirm = h('input', { type: 'checkbox' });

        const startBtn = h(
            'button',
            { class: 'btn primary big', type: 'button' },
            icon('check'),
            h('span', {}, 'Teste alles')
        );
        const stopBtn = h('button', { class: 'btn', type: 'button', hidden: true }, icon('x'), 'Stopp');
        const copyBtn = h(
            'button',
            { class: 'btn ghost', type: 'button', hidden: !lastRun },
            icon('copy'),
            'Bericht kopieren'
        );

        // ---------- Anzeige ----------
        const rowFor = check => {
            const r = results.get(check.id) || { status: 'idle' };
            const hasDetails = r.response || (r.status === 'fail' && r.detail);
            const row = h(
                'details',
                { class: `check-row ${r.status}`, open: r.status === 'fail' },
                h(
                    'summary',
                    {},
                    h('span', { class: 'check-icon' }, icon(STATUS_ICON[r.status] || 'info', { size: 16 })),
                    h('span', { class: 'check-title' }, check.title),
                    h('span', { class: 'check-detail muted small' }, r.status === 'fail' ? '' : r.detail || ''),
                    r.ms !== undefined ? h('span', { class: 'muted small nowrap' }, formatMs(r.ms)) : null
                ),
                hasDetails
                    ? h(
                          'div',
                          { class: 'check-body' },
                          r.status === 'fail' ? h('p', { class: 'check-error' }, r.detail) : null,
                          r.response
                              ? [
                                    h(
                                        'div',
                                        { class: 'muted small' },
                                        `Antwort des Backends (Status ${r.response.status}):`
                                    ),
                                    jsonView(r.response.data, { maxHeight: '220px' })
                                ]
                              : null
                      )
                    : null
            );
            return row;
        };

        const render = () => {
            const list = [...results.values()];
            const done = list.filter(r => r.status !== 'running').length;
            progressBar.firstChild.style.width = `${Math.round((done / CHECKS.length) * 100)}%`;
            progressBar.classList.toggle('active', running);

            const s = summarize(list.filter(r => r.status !== 'running'));
            mount(
                summaryBox,
                !list.length
                    ? h(
                          'span',
                          { class: 'muted' },
                          `${CHECKS.length} Prüfungen in ${CHECK_GROUPS.length} Gruppen – bereit.`
                      )
                    : [
                          h('span', { class: 'sum pass' }, icon('check', { size: 16 }), `${s.pass} bestanden`),
                          h(
                              'span',
                              { class: `sum fail ${s.fail ? '' : 'zero'}` },
                              icon('alert', { size: 16 }),
                              `${s.fail} fehlgeschlagen`
                          ),
                          h(
                              'span',
                              { class: `sum skip ${s.skip ? '' : 'zero'}` },
                              icon('arrowRight', { size: 16 }),
                              `${s.skip} übersprungen`
                          ),
                          h('span', { class: 'muted small' }, `${done}/${CHECKS.length}`),
                          lastRun && !running
                              ? h(
                                    'span',
                                    { class: 'muted small' },
                                    `· ${formatMs(lastRun.ms)} · ${lastRun.mode === 'test' ? 'Test-Modus' : 'LIVE'} · ${lastRun.at.toLocaleTimeString('de-CH')}`
                                )
                              : null
                      ]
            );

            mount(
                groupsBox,
                CHECK_GROUPS.map(group => {
                    const checks = CHECKS.filter(c => c.group === group);
                    const visible = onlyFailed.checked
                        ? checks.filter(c => results.get(c.id)?.status === 'fail')
                        : checks;
                    if (!visible.length) return null;
                    const gs = summarize(checks.map(c => results.get(c.id)).filter(r => r && r.status !== 'running'));
                    const state = gs.fail
                        ? 'fail'
                        : gs.total === checks.length && gs.pass === checks.length
                          ? 'pass'
                          : '';
                    return h(
                        'section',
                        { class: `card check-group ${state}` },
                        h(
                            'header',
                            { class: 'check-group-head' },
                            h('h2', {}, group),
                            h('span', { class: 'muted small' }, `${gs.pass}/${checks.length}`)
                        ),
                        visible.map(rowFor)
                    );
                })
            );
        };

        // ---------- Ablauf ----------
        const start = async () => {
            if (running) return;
            if (!isTestMode() && !liveConfirm.checked) {
                toast('Im Live-Modus bitte zuerst bestätigen (Kästchen) – oder auf „Test“ umschalten.', 'error', 5000);
                return;
            }
            running = true;
            stopRequested = false;
            results.clear();
            startBtn.disabled = true;
            stopBtn.hidden = false;
            copyBtn.hidden = true;
            render();
            const t0 = performance.now();
            const ctx = {};
            await runChecks(CHECKS, {
                ctx,
                shouldStop: () => stopRequested,
                onUpdate: r => {
                    results.set(r.id, r);
                    render();
                }
            });
            running = false;
            startBtn.disabled = false;
            stopBtn.hidden = true;
            copyBtn.hidden = false;
            lastRun = {
                results: [...results.entries()],
                mode: isTestMode() ? 'test' : 'live',
                at: new Date(),
                ms: performance.now() - t0,
                ctx
            };
            invalidateObjects(); // es gibt neue Objekte
            render();
            const s = summarize([...results.values()]);
            toast(
                s.fail ? `${s.fail} Prüfung(en) fehlgeschlagen.` : `Alles grün: ${s.pass} von ${s.total}.`,
                s.fail ? 'error' : 'ok',
                6000
            );
        };

        startBtn.addEventListener('click', start);
        stopBtn.addEventListener('click', () => {
            stopRequested = true;
        });
        copyBtn.addEventListener('click', () =>
            copyText(reportText(CHECKS, [...results.values()], { mode: lastRun?.mode, at: lastRun?.at }))
        );
        onlyFailed.addEventListener('change', render);

        // ---------- Aufbau ----------
        const modeInfo = isTestMode()
            ? callout(
                  'test',
                  'Test-Modus:',
                  ' Der Check legt eine Domain „check-…“ in der Test-Datenbank an. Deine echten Daten bleiben unberührt.'
              )
            : h(
                  'div',
                  { class: 'stack-s' },
                  callout(
                      'warn',
                      'Du bist im Live-Modus.',
                      ' Der Check schreibt dann in deine ECHTE Datenbank: eine neue Domain „check-…“ mit Test-Daten. Es gibt noch keine Route zum Löschen von Objekten – sie bleibt bestehen.'
                  ),
                  hasTestMode()
                      ? h(
                            'div',
                            {},
                            h(
                                'button',
                                { class: 'btn', type: 'button', onclick: () => setMode('test') },
                                icon('flask', { size: 16 }),
                                'Auf Test umschalten (empfohlen)'
                            )
                        )
                      : null,
                  h(
                      'label',
                      { class: 'check' },
                      liveConfirm,
                      h('span', {}, 'Ich weiss das und will trotzdem LIVE testen.')
                  )
              );

        root.append(
            pageHeader({
                intro: `Ein Klick – und das Cockpit prüft das ganze Backend: ${CHECKS.length} Prüfungen von der Verbindung über Daten, Rechte und SSFs bis zur Sicherheit als Fremder.`
            }),
            card(
                { className: 'check-hero' },
                h('div', { class: 'check-hero-row' }, startBtn, stopBtn, h('span', { class: 'grow' }), copyBtn),
                progressBar,
                summaryBox,
                modeInfo,
                h('label', { class: 'check' }, onlyFailed, h('span', {}, 'Nur fehlgeschlagene anzeigen'))
            ),
            groupsBox,
            card(
                { title: 'Was wird geprüft?', icon: 'info' },
                h(
                    'p',
                    { class: 'small' },
                    'Jede Prüfung macht echte Anfragen – genau wie das Cockpit oder ein Besucher. Die Test-Welt: eine Domain mit den Kindern ',
                    h('code', {}, 'funktion'),
                    ', ',
                    h('code', {}, 'daten'),
                    ' und ',
                    h('code', {}, 'lager'),
                    '. Braucht eine Prüfung ein Ergebnis einer früheren, die gescheitert ist, wird sie übersprungen – so siehst du die eigentliche Ursache.'
                ),
                h(
                    'p',
                    { class: 'small muted' },
                    'Nach dem Check findest du die Test-Domain unter ',
                    h('a', { href: href('objekte') }, 'Objekte'),
                    '. Ein automatischer Check der Backend-Logik läuft zusätzlich mit „npm test“ im Backend-Ordner (über 500 Tests).'
                )
            )
        );
        render();
        return () => {
            stopRequested = true; // Seite verlassen: laufenden Check anhalten
        };
    }
};
