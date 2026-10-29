// js/pages/objectVectors.js
// ---------------------------------------------------------------------
// REITER "VEKTOREN" eines Objekts (Plan "V", V3) – Technik-Ansicht
//
//   - Übersicht: welche Quellen, wie viele Stücke/Tokens, Modell
//   - Text hinzufügen (Quelle + Text) – vindelis schneidet und rechnet (euRouter, EU)
//   - Probe-Suche: Frage -> die passendsten Stücke mit Ähnlichkeit
//   - Quelle löschen
//   - V4: Regel "diese Felder der Datensätze vektorisieren", wartende Stücke, pausiert, sofort abgleichen
// Routen: GET/POST /api/objects/:uuid/vectors, POST …/vectors/search, DELETE …/vectors?name=
// Rechte prüft das Backend (black suchen, red schreiben). Texte vom Backend nur über h().
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { h, mount, card, spinner, busyButton, callout, resultLine, toast } from '../core/ui.js';
import { formatNumber, timeAgo } from '../core/format.js';

export const renderVectorsTab = async (box, o) => {
    mount(box, spinner('Lade Vektoren …'));
    const res = await api.get(`/api/objects/${o.uuid}/vectors`);
    if (!res.ok) return mount(box, card({ title: 'Vektoren', icon: 'search' }, resultLine(res)));
    const info = res.data.data;
    const reload = () => renderVectorsTab(box, o);

    // --- Übersicht ---
    const overview = info.sources.length
        ? h(
              'div',
              { class: 'table-wrap' },
              h(
                  'table',
                  { class: 'data-table' },
                  h(
                      'thead',
                      {},
                      h(
                          'tr',
                          {},
                          ['Quelle', 'Stücke', 'Tokens', 'Geändert', ''].map(c => h('th', {}, c))
                      )
                  ),
                  h(
                      'tbody',
                      {},
                      info.sources.map(s =>
                          h(
                              'tr',
                              {},
                              h('td', { class: 'mono' }, s.name),
                              h('td', { class: 'num' }, formatNumber(s.chunks)),
                              h('td', { class: 'num' }, formatNumber(s.tokens)),
                              h('td', { class: 'small' }, s.updatedAt ? timeAgo(s.updatedAt) : '–'),
                              h(
                                  'td',
                                  {},
                                  busyButton(
                                      'Löschen',
                                      async () => {
                                          if (!confirm(`Quelle „${s.name}“ mit ${s.chunks} Stücken löschen?`)) return;
                                          const r = await api.del(
                                              `/api/objects/${o.uuid}/vectors?name=${encodeURIComponent(s.name)}`
                                          );
                                          if (!r.ok) return toast(r.error, 'error');
                                          reload();
                                      },
                                      { className: 'btn small danger' }
                                  )
                              )
                          )
                      )
                  )
              )
          )
        : h('p', { class: 'muted small' }, 'Noch keine Vektoren in diesem Objekt.');

    // --- Text hinzufügen ---
    const nameInput = h('input', { class: 'input', placeholder: 'Quelle, z.B. faq', value: 'text', maxlength: 100 });
    const textInput = h('textarea', {
        class: 'input mono',
        rows: 6,
        placeholder: '# Überschrift\n\nText … (Überschriften geben den Stücken Zusammenhang)'
    });
    const addResult = h('div');
    const addCard = card(
        {
            title: 'Text als Vektoren speichern',
            icon: 'upload',
            subtitle:
                'vindelis schneidet den Text in Stücke (~800 Tokens, 15 % Überlappung) und rechnet die Vektoren in der EU (bge-m3). Gleiche Quelle = ersetzt; unveränderte Stücke kosten nichts.'
        },
        h('div', { class: 'row gap-s' }, nameInput),
        textInput,
        h(
            'div',
            { class: 'row gap-s' },
            busyButton(
                'Speichern',
                async () => {
                    const r = await api.post(`/api/objects/${o.uuid}/vectors`, {
                        name: nameInput.value.trim() || 'text',
                        text: textInput.value
                    });
                    if (!r.ok) return mount(addResult, resultLine(r));
                    const d = r.data.data;
                    toast(
                        `${d.chunks} Stücke gespeichert (${d.embedded} neu gerechnet, ${d.reused} wiederverwendet).`,
                        'ok'
                    );
                    reload();
                },
                { className: 'btn primary', iconName: 'upload' }
            )
        ),
        addResult
    );

    // --- Probe-Suche ---
    const queryInput = h('input', { class: 'input', placeholder: 'Frage, z.B. «Wie storniere ich?»', maxlength: 2000 });
    // V5: hybrid (Bedeutung + genaue Wörter), nur Bedeutung, nur Wörter (gratis)
    const modeSelect = h(
        'select',
        { class: 'input' },
        h('option', { value: 'hybrid' }, 'Bedeutung + Wörter'),
        h('option', { value: 'vector' }, 'nur Bedeutung'),
        h('option', { value: 'text' }, 'nur Wörter (gratis)')
    );
    const hits = h('div');
    const searchCard = card(
        { title: 'Probe-Suche', icon: 'search', subtitle: 'Findet Stücke nach Bedeutung – auch ohne gleiche Wörter.' },
        h(
            'div',
            { class: 'row gap-s' },
            queryInput,
            modeSelect,
            busyButton(
                'Suchen',
                async () => {
                    const r = await api.post(`/api/objects/${o.uuid}/vectors/search`, {
                        query: queryInput.value,
                        limit: 5,
                        mode: modeSelect.value
                    });
                    if (!r.ok) return mount(hits, resultLine(r));
                    const list = r.data.data || [];
                    mount(
                        hits,
                        list.length
                            ? list.map(t =>
                                  h(
                                      'div',
                                      { class: 'kv' },
                                      h(
                                          'div',
                                          {},
                                          h('strong', {}, t.heading || t.source),
                                          h('div', { class: 'small muted' }, `${t.source} · Stück ${t.chunk}`),
                                          h('div', { class: 'small' }, t.content.slice(0, 400))
                                      ),
                                      h(
                                          'span',
                                          {
                                              class: 'mono small',
                                              title: 'warum gefunden: vektor = Bedeutung, text = genaue Wörter'
                                          },
                                          `${t.similarity === null ? '–' : t.similarity.toFixed(3)} · ${(t.match || []).join('+')}`
                                      )
                                  )
                              )
                            : h('p', { class: 'muted small' }, 'Keine Treffer.')
                    );
                },
                { className: 'btn', iconName: 'search' }
            )
        ),
        h('div', { class: 'kv-list' }, hits)
    );

    mount(
        box,
        info.enabled
            ? null
            : callout(
                  'warn',
                  'Vektoren sind auf diesem Server nicht eingeschaltet.',
                  ' (EUROUTER_API_KEY oder Migration 031 fehlt.)'
              ),
        card(
            {
                title: 'Vektoren',
                icon: 'search',
                subtitle: `Text dieses Objekts, durchsuchbar nach Bedeutung · Modell ${info.model} · ${formatNumber(info.chunks)} Stücke`
            },
            overview
        ),
        info.enabled ? ruleCard(o, info, reload) : null,
        info.enabled ? addCard : null,
        info.enabled && info.chunks ? searchCard : null
    );
};

// V4: Datensätze automatisch – Regel setzen/entfernen, Zustand, sofort abgleichen
const ruleCard = (o, info, reload) => {
    const fields = h('input', {
        class: 'input',
        placeholder: 'Felder, mit Komma getrennt, z.B. titel, beschreibung, adresse.ort',
        value: info.rule ? info.rule.felder.join(', ') : ''
    });
    const out = h('div');
    const records = info.sources.find(s => s.name === 'datensaetze');
    const state = [
        info.rule ? `Regel: ${info.rule.felder.join(', ')}` : 'Keine Regel – Datensätze werden nicht vektorisiert.',
        records ? `${formatNumber(records.records)} Datensätze, ${formatNumber(records.chunks)} Stücke` : null,
        info.pending ? `${formatNumber(info.pending)} Stücke warten auf ihren Vektor` : null
    ]
        .filter(Boolean)
        .join(' · ');
    return card(
        {
            title: 'Datensätze automatisch',
            icon: 'database',
            subtitle:
                'Diese Felder jedes Datensatzes werden als Vektoren gehalten – neue, geänderte und gelöschte gleicht vindelis innert ~1 Minute ab.'
        },
        info.paused
            ? callout(
                  'warn',
                  'Pausiert:',
                  ' Das Vektor-Kontingent dieses Monats ist aufgebraucht – nächsten Monat geht es weiter.'
              )
            : null,
        h('p', { class: 'small muted' }, state),
        h('div', { class: 'row gap-s wrap' }, fields),
        h(
            'div',
            { class: 'row gap-s wrap' },
            busyButton(
                'Regel speichern',
                async () => {
                    const felder = fields.value
                        .split(',')
                        .map(f => f.trim())
                        .filter(Boolean);
                    const r = await api.put(`/api/objects/${o.uuid}/vectors/rule`, { felder });
                    if (!r.ok) return mount(out, resultLine(r));
                    toast('Regel gespeichert – der Abgleich läuft innert einer Minute.', 'ok');
                    reload();
                },
                { className: 'btn primary' }
            ),
            info.rule
                ? busyButton(
                      'Jetzt abgleichen',
                      async () => {
                          const r = await api.post(`/api/objects/${o.uuid}/vectors/sync`, {});
                          if (!r.ok) return mount(out, resultLine(r));
                          const d = r.data.data;
                          toast(
                              `${d.records} Datensätze, ${d.embedded} Stücke neu, ${d.deleted} gelöscht${d.more ? ' – der Rest folgt im Hintergrund' : ''}.`,
                              'ok'
                          );
                          reload();
                      },
                      { className: 'btn' }
                  )
                : null,
            info.rule
                ? busyButton(
                      'Regel entfernen',
                      async () => {
                          if (!confirm('Regel entfernen? Die Vektoren der Datensätze werden gelöscht.')) return;
                          const r = await api.del(`/api/objects/${o.uuid}/vectors/rule`);
                          if (!r.ok) return mount(out, resultLine(r));
                          reload();
                      },
                      { className: 'btn danger' }
                  )
                : null
        ),
        out
    );
};
