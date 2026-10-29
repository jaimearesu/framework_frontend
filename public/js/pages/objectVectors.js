// js/pages/objectVectors.js
// ---------------------------------------------------------------------
// REITER "VEKTOREN" eines Objekts (Plan "V", V3) – Technik-Ansicht
//
//   - Übersicht: welche Quellen, wie viele Stücke/Tokens, Modell
//   - Text hinzufügen (Quelle + Text) – vindelis schneidet und rechnet (euRouter, EU)
//   - Probe-Suche: Frage -> die passendsten Stücke mit Ähnlichkeit
//   - Quelle löschen
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
    const hits = h('div');
    const searchCard = card(
        { title: 'Probe-Suche', icon: 'search', subtitle: 'Findet Stücke nach Bedeutung – auch ohne gleiche Wörter.' },
        h(
            'div',
            { class: 'row gap-s' },
            queryInput,
            busyButton(
                'Suchen',
                async () => {
                    const r = await api.post(`/api/objects/${o.uuid}/vectors/search`, {
                        query: queryInput.value,
                        limit: 5
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
                                      h('span', { class: 'mono small' }, t.similarity.toFixed(3))
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
        info.enabled ? addCard : null,
        info.enabled && info.chunks ? searchCard : null
    );
};
