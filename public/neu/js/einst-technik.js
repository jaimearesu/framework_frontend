// Einstellungen für einzelne Teile: Schlüssel im Tresor, Aufträge, Webhooks, Vektoren.
// Werte aus dem Tresor kommen nie zurück. Texte vom Backend nur als Text, nie als HTML.
import { api } from '../../js/core/api.js';
import { formatDate, formatMs, formatNumber, timeAgo } from '../../js/core/format.js';
import { formatBytes, webhookStatusText } from '../../js/core/site.js';
import {
    SCHEDULE_PRESETS,
    canCancel,
    describeCron,
    jobStatusText,
    parseJsonInput,
    untilText
} from '../../js/core/jobs.js';
import { h, ikon, leer, kopierZeile, meldung, dialog, huelle } from './ui.js';
import { bereichKopf, formular, geladen, mitDaten, nochmals, tabelle, teilAuswahl } from './einst-hilfe.js';
import { felderAus, teileFuer, teilGewaehlt, vektorZustand } from './einstellungen-werte.js';

const pfad = uuid => '/api/objects/' + encodeURIComponent(uuid);

// Welcher Teil gerade offen ist, je Bereich gemerkt
const gewaehlt = {};
const teilVon = (bereich, teile) => teilGewaehlt(teile, gewaehlt[bereich]);
const teilWechsel = bereich => uuid => {
    gewaehlt[bereich] = uuid;
    huelle.neu();
};

const klein = (text, onclick, klasse = 'bp-btn-o') =>
    h('button', { class: 'bp-btn bp-btn-klein ' + klasse, type: 'button', onclick }, text);

const keineFunktion = () =>
    h(
        'div',
        { class: 'bp-karte', id: 'keine-funktion' },
        leer(
            'werkstatt',
            'Noch keine Server-Funktion',
            'Das gibt es erst, wenn deine Website einen Teil mit SSF hat. Dein KI-Helfer kann ihn bauen.'
        )
    );

// ---- Schlüssel ----

export const bereichSchluessel = (w, site) => {
    const teile = teileFuer(site, { mitWurzel: true });
    const teil = teilVon('schluessel', teile);
    const schluessel = 'tresor:' + teil.uuid;
    const adresse = '/api/secrets/' + encodeURIComponent(teil.uuid);
    const eintrag = geladen(schluessel, () => api.get(adresse));
    const setzen = name =>
        formular({
            titel: name ? name + ' ersetzen' : 'Schlüssel hinzufügen',
            text: 'Der Wert wird verschlüsselt gespeichert und nie mehr angezeigt. Nur die Server-Funktion dieses Teils kann ihn lesen.',
            felder: [
                ...(name
                    ? []
                    : [{ name: 'name', label: 'Name', platzhalter: 'z.B. WETTER_KEY', mono: true, fokus: true }]),
                { name: 'wert', label: 'Wert', art: 'password', fokus: Boolean(name) }
            ],
            knopf: 'Speichern',
            tun: async werte => {
                const ziel = name || werte.name.trim();
                if (!ziel) return 'Bitte gib einen Namen ein.';
                if (!werte.wert) return 'Bitte gib einen Wert ein.';
                const antwort = await api.put(
                    adresse + '/' + encodeURIComponent(ziel),
                    { value: werte.wert },
                    { sensitive: true }
                );
                if (!antwort.ok) return antwort.error;
                meldung('Schlüssel gespeichert', ziel);
                await nochmals(schluessel);
                return '';
            }
        });
    const entfernen = name =>
        formular({
            titel: name + ' löschen?',
            text: 'Server-Funktionen, die ihn brauchen, funktionieren danach nicht mehr.',
            knopf: 'Löschen',
            gefahr: true,
            tun: async () => {
                const antwort = await api.del(adresse + '/' + encodeURIComponent(name));
                if (!antwort.ok) return antwort.error;
                meldung('Schlüssel gelöscht', name);
                await nochmals(schluessel);
                return '';
            }
        });
    return [
        bereichKopf(
            w,
            'Schlüssel',
            'Zugangsdaten für fremde Dienste. Sie stehen nie im Code und kommen nie zurück.',
            h(
                'button',
                { class: 'bp-btn bp-btn-p', id: 'schluessel-neu', type: 'button', onclick: () => setzen() },
                ikon('plus'),
                'Schlüssel hinzufügen'
            )
        ),
        teilAuswahl(teile, teil, teilWechsel('schluessel')),
        mitDaten(eintrag, liste =>
            (liste || []).length
                ? h(
                      'div',
                      { class: 'bp-karte eng zeilen', id: 'schluessel-liste' },
                      liste.map(s =>
                          h(
                              'div',
                              { class: 'zeile' },
                              h(
                                  'div',
                                  { class: 'zeile-text' },
                                  h('b', { class: 'mono' }, s.name),
                                  h('span', { class: 'leise' }, 'Geändert ' + timeAgo(s.updatedAt))
                              ),
                              h(
                                  'div',
                                  { class: 'zeile-knopf' },
                                  klein('Ersetzen', () => setzen(s.name)),
                                  h(
                                      'button',
                                      {
                                          class: 'bp-ikonknopf',
                                          type: 'button',
                                          'aria-label': s.name + ' löschen',
                                          onclick: () => entfernen(s.name)
                                      },
                                      ikon('kreuz')
                                  )
                              )
                          )
                      )
                  )
                : h(
                      'div',
                      { class: 'bp-karte', id: 'schluessel-leer' },
                      leer('werkstatt', 'Noch keine Schlüssel', 'Dieser Teil hat keine gespeicherten Zugangsdaten.')
                  )
        )
    ];
};

// ---- Aufträge und Zeitplan ----

const zeitplanFormular = (teil, zeitplan, schluessel) => {
    const vorlage = SCHEDULE_PRESETS.find(p => p.cron === zeitplan?.cron);
    formular({
        titel: 'Zeitplan für «' + teil.name + '»',
        text: 'Zu jedem Termin startet ein Auftrag. Schweizer Zeit, höchstens alle 5 Minuten.',
        felder: [
            {
                name: 'vorlage',
                label: 'Wann?',
                art: 'select',
                wert: vorlage?.cron || (zeitplan ? '' : SCHEDULE_PRESETS[0].cron),
                optionen: [
                    ...SCHEDULE_PRESETS.map(p => ({ wert: p.cron, text: p.label })),
                    { wert: '', text: 'Eigener Zeitplan' }
                ]
            },
            {
                name: 'cron',
                label: 'Eigener Zeitplan (Minute Stunde Tag Monat Wochentag)',
                wert: vorlage ? '' : zeitplan?.cron || '',
                platzhalter: '0 3 * * *',
                mono: true
            },
            {
                name: 'eingabe',
                label: 'Eingabe für jeden Auftrag (JSON, freiwillig)',
                art: 'textarea',
                mono: true,
                wert: zeitplan?.input ? JSON.stringify(zeitplan.input, null, 2) : ''
            },
            { name: 'an', label: 'Eingeschaltet', art: 'checkbox', wert: zeitplan ? zeitplan.enabled : true }
        ],
        knopf: 'Speichern',
        tun: async ({ vorlage: gewaehlterPlan, cron, eingabe, an }) => {
            const plan = cron.trim() || gewaehlterPlan;
            if (!plan) return 'Bitte wähle einen Zeitplan.';
            const json = parseJsonInput(eingabe);
            if (!json.ok) return json.error;
            const antwort = await api.put(pfad(teil.uuid) + '/schedule', {
                cron: plan,
                input: json.value,
                enabled: an
            });
            if (!antwort.ok) return antwort.error;
            meldung('Zeitplan gespeichert', teil.name);
            await nochmals(schluessel);
            return '';
        }
    });
};

const auftragStarten = (teil, schluessel) =>
    formular({
        titel: 'Auftrag starten',
        text: 'Die Server-Funktion «' + teil.name + '» arbeitet im Hintergrund, Stück für Stück.',
        felder: [
            {
                name: 'eingabe',
                label: 'Eingabe (JSON, freiwillig)',
                art: 'textarea',
                mono: true,
                platzhalter: '{ "seite": 1 }'
            }
        ],
        knopf: 'Starten',
        tun: async ({ eingabe }) => {
            const json = parseJsonInput(eingabe);
            if (!json.ok) return json.error;
            const antwort = await api.post(pfad(teil.uuid) + '/jobs', { input: json.value });
            if (!antwort.ok) return antwort.error;
            meldung('Auftrag angelegt', 'Er startet in wenigen Sekunden.');
            await nochmals(schluessel);
            return '';
        }
    });

const zeitplanKarte = (teil, s, schluessel) =>
    h(
        'div',
        { class: 'abschnitt', id: 'zeitplan' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            h('h3', {}, 'Zeitplan'),
            h(
                'div',
                { class: 'zeile-knopf' },
                klein(s ? 'Ändern' : 'Zeitplan anlegen', () => zeitplanFormular(teil, s, schluessel)),
                s
                    ? klein('Entfernen', () =>
                          formular({
                              titel: 'Zeitplan entfernen?',
                              text: 'Es starten danach keine neuen Aufträge mehr von selbst.',
                              knopf: 'Entfernen',
                              gefahr: true,
                              tun: async () => {
                                  const antwort = await api.del(pfad(teil.uuid) + '/schedule');
                                  if (!antwort.ok) return antwort.error;
                                  await nochmals(schluessel);
                                  return '';
                              }
                          })
                      )
                    : null
            )
        ),
        h(
            'div',
            { class: 'bp-karte stapel' },
            s
                ? [
                      h('b', {}, describeCron(s.cron) || s.cron),
                      h(
                          'span',
                          { class: 'leise' },
                          s.enabled ? 'Nächster Termin: ' + formatDate(s.nextRunAt) : 'Pausiert'
                      ),
                      s.lastError ? h('span', { class: 'leise' }, 'Hinweis: ' + s.lastError) : null
                  ]
                : h('span', { class: 'leise' }, 'Kein Zeitplan. Aufträge starten nur, wenn sie jemand anstösst.')
        )
    );

const auftragTabelle = (teil, jobs, schluessel) =>
    jobs.length
        ? tabelle(
              ['Angelegt', 'Status', 'Durchläufe', 'Nächster', 'Fehler', ''],
              jobs.map(j => [
                  timeAgo(j.createdAt),
                  jobStatusText(j.status).text,
                  j.attempts > 0 ? j.runs + ' (' + j.attempts + ' Fehlversuche)' : String(j.runs),
                  canCancel(j.status) ? untilText(j.nextRunAt) : '–',
                  j.lastError || '–',
                  canCancel(j.status)
                      ? klein('Abbrechen', async () => {
                            const antwort = await api.post(pfad(teil.uuid) + '/jobs/' + j.id + '/cancel', {});
                            if (!antwort.ok) return meldung('Hat nicht geklappt', antwort.error, 'kreuz');
                            meldung('Auftrag abgebrochen', teil.name);
                            await nochmals(schluessel);
                        })
                      : null
              ]),
              'auftraege-liste'
          )
        : h('div', { class: 'bp-karte' }, h('span', { class: 'leise' }, 'Noch keine Aufträge.'));

export const bereichAuftraege = (w, site) => {
    const teile = teileFuer(site, { nurSsf: true });
    const kopf = knopf =>
        bereichKopf(w, 'Aufträge und Zeitpläne', 'Lange Arbeit im Hintergrund, von Hand oder regelmässig.', knopf);
    if (!teile.length) return [kopf(), keineFunktion()];
    const teil = teilVon('auftraege', teile);
    const schluessel = 'auftraege:' + teil.uuid;
    const eintrag = geladen(schluessel, () => api.get(pfad(teil.uuid) + '/jobs'));
    return [
        kopf(
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    id: 'auftrag-neu',
                    type: 'button',
                    onclick: () => auftragStarten(teil, schluessel)
                },
                'Auftrag starten'
            )
        ),
        teilAuswahl(teile, teil, teilWechsel('auftraege')),
        mitDaten(eintrag, d =>
            h(
                'div',
                { class: 'stapel' },
                zeitplanKarte(teil, d.schedule, schluessel),
                h(
                    'div',
                    { class: 'abschnitt' },
                    h('div', { class: 'abschnitt-kopf' }, h('h3', {}, 'Letzte Aufträge')),
                    auftragTabelle(teil, d.jobs, schluessel)
                )
            )
        )
    ];
};

// ---- Webhooks ----

export const bereichWebhooks = (w, site) => {
    const teile = teileFuer(site, { nurSsf: true });
    const kopf = bereichKopf(
        w,
        'Webhooks',
        'Unter dieser Adresse können fremde Dienste wie Stripe oder GitHub deine Website benachrichtigen.'
    );
    if (!teile.length) return [kopf, keineFunktion()];
    const teil = teilVon('webhooks', teile);
    const eintrag = geladen('webhooks:' + teil.uuid, () => api.get(pfad(teil.uuid) + '/webhook-calls'));
    return [
        kopf,
        teilAuswahl(teile, teil, teilWechsel('webhooks')),
        mitDaten(eintrag, d =>
            h(
                'div',
                { class: 'stapel', id: 'webhook-inhalt' },
                d.address
                    ? h(
                          'div',
                          { class: 'stapel' },
                          kopierZeile(d.address),
                          h(
                              'span',
                              { class: 'leise' },
                              'Damit es klappt, muss die Website und dieser Teil öffentlich sein.'
                          )
                      )
                    : h('div', { class: 'bp-hinweis bp-h-info' }, 'Für diesen Teil gibt es keine Webhook-Adresse.'),
                d.calls.length
                    ? tabelle(
                          ['Wann', 'Status', 'Dauer', 'Grösse', 'Fehler'],
                          d.calls.map(c => [
                              timeAgo(c.createdAt),
                              c.status + ', ' + webhookStatusText(c.status).text,
                              formatMs(c.durationMs),
                              formatBytes(c.bytes),
                              c.error || '–'
                          ])
                      )
                    : h('div', { class: 'bp-karte' }, h('span', { class: 'leise' }, 'Noch keine Aufrufe.'))
            )
        )
    ];
};

// ---- Vektoren ----

const trefferZeigen = treffer =>
    dialog(({ zu }) => [
        h('h3', {}, 'Treffer'),
        treffer.length
            ? h(
                  'div',
                  { class: 'zeilen', id: 'vektor-treffer' },
                  treffer.map(t =>
                      h(
                          'div',
                          { class: 'zeile' },
                          h(
                              'div',
                              { class: 'zeile-text' },
                              h('b', {}, t.heading || t.source),
                              h('span', { class: 'leise' }, String(t.content).slice(0, 300))
                          )
                      )
                  )
              )
            : h('p', { class: 'leise' }, 'Keine Treffer.'),
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h('button', { class: 'bp-btn bp-btn-p', type: 'button', onclick: zu }, 'Fertig')
        )
    ]);

const vektorSuche = (teil, info) =>
    formular({
        titel: 'Probe-Suche',
        felder: [
            { name: 'frage', label: 'Frage', platzhalter: 'z.B. Wie storniere ich?', fokus: true },
            {
                name: 'art',
                label: 'Wie suchen?',
                art: 'select',
                wert: 'hybrid',
                optionen: [
                    { wert: 'hybrid', text: 'Bedeutung und Wörter' },
                    { wert: 'vector', text: 'Nur Bedeutung' },
                    { wert: 'text', text: 'Nur Wörter (gratis)' }
                ]
            }
        ],
        knopf: 'Suchen',
        tun: async ({ frage, art }) => {
            if (!frage.trim()) return 'Bitte gib eine Frage ein.';
            const antwort = await api.post(pfad(teil.uuid) + '/vectors/search', { query: frage, limit: 5, mode: art });
            if (!antwort.ok) return antwort.error;
            trefferZeigen(antwort.data.data || []);
            return '';
        }
    });

const textHinzufuegen = (teil, schluessel) =>
    formular({
        titel: 'Text hinzufügen',
        text: 'Der Text wird in Stücke geschnitten und nach Bedeutung durchsuchbar.',
        felder: [
            { name: 'name', label: 'Quelle', wert: 'text', mono: true },
            {
                name: 'text',
                label: 'Text',
                art: 'textarea',
                zeilen: 8,
                fokus: true,
                platzhalter: 'Überschriften geben den Stücken Zusammenhang.'
            }
        ],
        knopf: 'Speichern',
        tun: async ({ name, text }) => {
            if (!text.trim()) return 'Bitte gib einen Text ein.';
            const antwort = await api.post(pfad(teil.uuid) + '/vectors', { name: name.trim() || 'text', text });
            if (!antwort.ok) return antwort.error;
            meldung('Gespeichert', formatNumber(antwort.data.data.chunks) + ' Stücke');
            await nochmals(schluessel);
            return '';
        }
    });

const regelSetzen = (teil, info, schluessel) =>
    formular({
        titel: 'Datensätze automatisch erfassen',
        text: 'Diese Felder jedes Datensatzes bleiben von selbst durchsuchbar: neue, geänderte und gelöschte.',
        felder: [
            {
                name: 'felder',
                label: 'Felder, mit Komma getrennt',
                wert: info.rule ? info.rule.felder.join(', ') : '',
                platzhalter: 'titel, beschreibung, adresse.ort',
                mono: true,
                fokus: true
            }
        ],
        knopf: 'Speichern',
        tun: async ({ felder }) => {
            const antwort = await api.put(pfad(teil.uuid) + '/vectors/rule', { felder: felderAus(felder) });
            if (!antwort.ok) return antwort.error;
            meldung('Regel gespeichert', 'Der Abgleich läuft innert einer Minute.');
            await nochmals(schluessel);
            return '';
        }
    });

const regelEntfernen = (teil, schluessel) =>
    formular({
        titel: 'Regel entfernen?',
        text: 'Die Vektoren der Datensätze werden gelöscht.',
        knopf: 'Entfernen',
        gefahr: true,
        tun: async () => {
            const antwort = await api.del(pfad(teil.uuid) + '/vectors/rule');
            if (!antwort.ok) return antwort.error;
            await nochmals(schluessel);
            return '';
        }
    });

const quelleEntfernen = (teil, s, schluessel) =>
    formular({
        titel: 'Quelle «' + s.name + '» löschen?',
        text: formatNumber(s.chunks) + ' Stücke werden gelöscht.',
        knopf: 'Löschen',
        gefahr: true,
        tun: async () => {
            const antwort = await api.del(pfad(teil.uuid) + '/vectors', { query: { name: s.name } });
            if (!antwort.ok) return antwort.error;
            await nochmals(schluessel);
            return '';
        }
    });

export const bereichVektoren = (w, site) => {
    const teile = teileFuer(site, { mitWurzel: true });
    const teil = teilVon('vektoren', teile);
    const schluessel = 'vektoren:' + teil.uuid;
    const eintrag = geladen(schluessel, () => api.get(pfad(teil.uuid) + '/vectors'));
    return [
        bereichKopf(w, 'Vektoren', 'Text und Datensätze nach Bedeutung durchsuchen, auch ohne gleiche Wörter.'),
        teilAuswahl(teile, teil, teilWechsel('vektoren')),
        mitDaten(eintrag, info =>
            h(
                'div',
                { class: 'stapel', id: 'vektor-inhalt' },
                info.enabled
                    ? null
                    : h(
                          'div',
                          { class: 'bp-hinweis bp-h-warn' },
                          'Vektoren sind auf diesem Server nicht eingeschaltet.'
                      ),
                info.paused
                    ? h(
                          'div',
                          { class: 'bp-hinweis bp-h-warn' },
                          'Pausiert: Das Kontingent dieses Monats ist aufgebraucht. Nächsten Monat geht es weiter.'
                      )
                    : null,
                info.sources.length
                    ? tabelle(
                          ['Quelle', 'Stücke', 'Geändert', ''],
                          info.sources.map(s => [
                              h('span', { class: 'mono' }, s.name),
                              formatNumber(s.chunks),
                              s.updatedAt ? timeAgo(s.updatedAt) : '–',
                              s.name === 'datensaetze'
                                  ? null
                                  : klein('Löschen', () => quelleEntfernen(teil, s, schluessel))
                          ]),
                          'vektor-quellen'
                      )
                    : h(
                          'div',
                          { class: 'bp-karte' },
                          h('span', { class: 'leise' }, 'Noch keine Vektoren in diesem Teil.')
                      ),
                info.enabled
                    ? h(
                          'div',
                          { class: 'bp-karte stapel', id: 'vektor-regel' },
                          h('span', { class: 'leise' }, vektorZustand(info)),
                          h(
                              'div',
                              { class: 'zeile-knopf' },
                              klein('Text hinzufügen', () => textHinzufuegen(teil, schluessel)),
                              klein(info.rule ? 'Regel ändern' : 'Datensätze erfassen', () =>
                                  regelSetzen(teil, info, schluessel)
                              ),
                              info.rule
                                  ? klein('Jetzt abgleichen', async () => {
                                        const antwort = await api.post(pfad(teil.uuid) + '/vectors/sync', {});
                                        if (!antwort.ok) return meldung('Hat nicht geklappt', antwort.error, 'kreuz');
                                        meldung('Abgeglichen', formatNumber(antwort.data.data.records) + ' Datensätze');
                                        await nochmals(schluessel);
                                    })
                                  : null,
                              info.rule ? klein('Regel entfernen', () => regelEntfernen(teil, schluessel)) : null,
                              info.chunks ? klein('Probe-Suche', () => vektorSuche(teil, info)) : null
                          )
                      )
                    : null
            )
        )
    ];
};
