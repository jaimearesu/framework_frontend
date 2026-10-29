// js/pages/helpers.js
// ---------------------------------------------------------------------
// KI-HELFER (Besitzer-Ansicht, Punkt 5, D4b)  –  /#/agenten
//
// Die einfache Fassung der Agenten-Seite (pages/agents.js bleibt die
// Technik-Ansicht mit Schlüsseln, Werkzeugkästen und Statistik):
//   - "Neuen KI-Helfer verbinden": Adresse zum Kopieren + 3 Schritte
//   - pro KI-Helfer: verbunden mit Claude/ChatGPT?, zuletzt aktiv,
//     woran er arbeitet (Websites + was er darf), "Verbindung trennen"
// Daten: GET /api/agents (nur eingeloggte Menschen, nur eigene Agenten).
// Trennen: DELETE /api/agents/connections/:uuid (bestehende Route).
// Texte vom Backend immer über h()/textContent.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { getSession } from '../core/session.js';
import { href } from '../core/routes.js';
import { h, mount, spinner, emptyState, busyButton, copyButton, toast } from '../core/ui.js';
import { formatNumber, timeAgo } from '../core/format.js';
import { pageHeader } from '../core/page.js';
import { setView, placeholderHue, clientLabel, helperStatus, helperWork } from '../core/view.js';

// Kasten "Neuen KI-Helfer verbinden" – nur wenn OAuth auf dem Server an ist
const connectBox = oauth =>
    oauth?.enabled && oauth.mcpUrl
        ? h(
              'section',
              { class: 'site-box' },
              h('header', { class: 'site-box-head' }, h('h2', {}, 'Neuen KI-Helfer verbinden')),
              h(
                  'div',
                  { class: 'site-box-body' },
                  h(
                      'ol',
                      { class: 'helper-steps' },
                      h(
                          'li',
                          {},
                          'In Claude (claude.ai) oder ChatGPT: Einstellungen → Connectors → eigenen Connector hinzufügen.'
                      ),
                      h(
                          'li',
                          {},
                          'Diese Adresse einfügen: ',
                          h('code', { class: 'mono' }, oauth.mcpUrl),
                          ' ',
                          copyButton(oauth.mcpUrl, 'Adresse kopieren')
                      ),
                      h(
                          'li',
                          {},
                          'Bei vindelis anmelden, einen Namen für den Helfer wählen und «Erlauben» klicken – fertig.'
                      )
                  ),
                  h(
                      'p',
                      { class: 'muted small' },
                      'Ein KI-Helfer arbeitet mit seinen eigenen Rechten, nie mit deinen. Veröffentlichen kann er nie – er bittet dich darum.'
                  )
              )
          )
        : null;

// Eine Karte pro KI-Helfer
const helperCard = (agent, reload) => {
    const status = helperStatus(agent);
    const work = helperWork(agent);
    const active = (agent.connections || []).filter(c => c.status === 'active');
    return h(
        'section',
        { class: 'site-box helper-card' },
        h(
            'header',
            { class: 'site-box-head' },
            h(
                'div',
                { class: 'helper-title' },
                h('span', { class: 'avatar', style: `--hue: ${placeholderHue(agent.uuid)}` }, '✦'),
                h(
                    'div',
                    {},
                    h('h2', {}, agent.domain),
                    h(
                        'div',
                        { class: 'muted small' },
                        h('span', { class: `tree-dot ${status.tone === 'ok' ? 'public' : 'private'}` }),
                        status.text,
                        agent.lastActivityAt ? ` · zuletzt aktiv ${timeAgo(agent.lastActivityAt)}` : ' · noch nie aktiv'
                    )
                )
            ),
            agent.stats?.actions
                ? h('span', { class: 'muted small' }, `${formatNumber(agent.stats.actions)} Aktionen in 30 Tagen`)
                : null
        ),
        h(
            'div',
            { class: 'site-box-body' },
            h('div', { class: 'small muted' }, 'Arbeitet an'),
            work.sites.length
                ? h(
                      'div',
                      { class: 'kv-list' },
                      work.sites.map(s =>
                          h(
                              'a',
                              { class: 'kv kv-link', href: href('website', s.rootUuid) },
                              h('span', { class: 'mono' }, s.name),
                              h('span', { class: 'muted' }, s.role)
                          )
                      )
                  )
                : h('p', { class: 'small' }, 'Noch an keiner Website – gib ihm auf einer Website Zugriff.'),
            work.toolboxes || work.hidden
                ? h(
                      'p',
                      { class: 'muted small' },
                      [
                          work.toolboxes
                              ? work.toolboxes === 1
                                  ? '1 Werkzeugkasten'
                                  : `${work.toolboxes} Werkzeugkästen`
                              : null,
                          work.hidden ? `${work.hidden} weitere, die du nicht siehst` : null
                      ]
                          .filter(Boolean)
                          .join(' · ')
                  )
                : null,
            active.length
                ? h(
                      'div',
                      { class: 'row gap-s wrap' },
                      active.map(c =>
                          busyButton(
                              `Verbindung zu ${clientLabel(c)} trennen`,
                              async () => {
                                  if (
                                      !confirm(
                                          `Verbindung zu ${clientLabel(c)} trennen?\n\n${agent.domain} kann dann nichts mehr tun, bis du ihn neu verbindest.`
                                      )
                                  )
                                      return;
                                  const r = await api.del(`/api/agents/connections/${encodeURIComponent(c.uuid)}`);
                                  if (!r.ok) return toast(r.error || 'Trennen ging nicht.', 'error');
                                  toast('Verbindung getrennt.', 'ok');
                                  reload();
                              },
                              { className: 'btn small danger' }
                          )
                      )
                  )
                : null
        )
    );
};

export default {
    async render(root) {
        root.append(
            pageHeader({
                intro: 'Die KIs, die an deinen Websites bauen – woran sie arbeiten, und wie du sie verbindest oder stoppst.'
            })
        );
        if (getSession().identity?.kind !== 'user') {
            root.append(
                emptyState({
                    icon: 'user',
                    title: 'Bitte melde dich an',
                    text: 'KI-Helfer verbinden und verwalten können nur angemeldete Menschen.'
                })
            );
            return;
        }
        const body = h('div', { class: 'helper-list' }, spinner('Lade deine KI-Helfer …'));
        root.append(body);

        const load = async () => {
            const r = await api.get('/api/agents', { query: { days: 30 } });
            if (!r.ok) return mount(body, h('p', { class: 'muted' }, 'Konnte deine KI-Helfer nicht laden.'));
            const agents = Array.isArray(r.data?.data) ? r.data.data : [];
            mount(
                body,
                connectBox(r.data?.meta?.oauth),
                agents.length
                    ? agents.map(a => helperCard(a, load))
                    : emptyState({
                          icon: 'robot',
                          title: 'Noch kein KI-Helfer',
                          text: 'Verbinde Claude oder ChatGPT – dann kann er Websites für dich bauen.'
                      }),
                h(
                    'p',
                    { class: 'site-tech' },
                    h(
                        'button',
                        { type: 'button', class: 'linklike', onclick: () => setView('technik') },
                        'Technik-Ansicht →'
                    ),
                    h('span', { class: 'muted small' }, ' Schlüssel, Werkzeugkästen, Statistik pro Werkzeug')
                )
            );
        };
        await load();
    }
};
