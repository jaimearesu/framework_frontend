// js/pages/site.js
// ---------------------------------------------------------------------
// DIE WEBSITE-SEITE (Besitzer-Ansicht, Punkt 5, D4)  –  /#/website/<uuid>
//
//   Titelbild + Symbol (aus dem Namen berechnet, S2) + Name
//   Eigenschaften: Zustand, Adresse, Sichtbar für, Letzte Sicherung, Live, geändert
//   Notiz (direkt bearbeitbar, mit red)
//   Kästen: Was Besucher erlebt haben (+ "KI bitten, es zu reparieren"),
//           Teile, Zugriff (+ Jemanden einladen), Sicherungen, Speicher
//   unten: Technik-Details (die bisherige Objekt-Seite)
//
// Daten: GET /api/websites/:uuid (eine Rechte-Prüfung, S4). Ändern läuft über
// die BESTEHENDEN Routen (Notiz, Einladung, Sicherung) – das Backend prüft wie immer.
// Sichtbarkeit ändern bewusst NICHT hier (S1), sondern in den Technik-Details.
// Texte vom Backend immer über h()/textContent.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import { h, mount, emptyState, spinner, busyButton, copyButton, copyText, callout, toast } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { formatNumber, timeAgo } from '../core/format.js';
import { formatBytes } from '../core/site.js';
import {
    placeholderHue,
    displayAddress,
    problemsText,
    VISIBILITY_SENTENCE,
    roleText,
    memberText,
    partKind,
    problemKindText,
    repairPrompt
} from '../core/view.js';
import { renderSnapshotsTab } from './objectSnapshots.js';
import { loadThumbnail } from '../core/objects.js';

const STATE = {
    public: { text: 'Online', tone: 'public' },
    members: { text: 'Online · nur Angemeldete', tone: 'members' },
    private: { text: 'Privat', tone: 'private' }
};

const techHref = (uuid, tab) => href('objekte', uuid) + (tab ? `?tab=${tab}` : '');

// Eine Zeile der Eigenschaften (wie bei Notion)
const prop = (label, ...value) => [h('dt', {}, label), h('dd', {}, ...value)];

// Ein Kasten
const box = (title, actions, ...body) =>
    h(
        'section',
        { class: 'site-box' },
        h('header', { class: 'site-box-head' }, h('h2', {}, title), actions || null),
        h('div', { class: 'site-box-body' }, ...body)
    );

// ------------------------------------------------------------------
// NOTIZ (PUT /api/objects/:uuid/note, braucht red)
// ------------------------------------------------------------------
const renderNote = (el, site) => {
    const show = text =>
        mount(
            el,
            h(
                'p',
                { class: `site-note${text ? '' : ' is-empty'}` },
                text || (site.rights.write ? 'Notiz hinzufügen …' : 'Keine Notiz.')
            )
        );
    show(site.note);
    if (!site.rights.write) return;
    el.querySelector('.site-note').addEventListener('click', () => {
        const area = h('textarea', { class: 'input site-note-edit', rows: 3, maxlength: 2000 }, site.note || '');
        mount(
            el,
            area,
            h(
                'div',
                { class: 'row gap-s' },
                busyButton(
                    'Speichern',
                    async () => {
                        const res = await api.put(`/api/objects/${site.uuid}/note`, { note: area.value });
                        if (!res.ok) return toast(res.error || 'Speichern ging nicht.', 'error');
                        site.note = res.data?.data?.note ?? (area.value.trim() || null);
                        renderNote(el, site);
                    },
                    { className: 'btn primary small' }
                ),
                h(
                    'button',
                    { class: 'btn ghost small', type: 'button', onclick: () => renderNote(el, site) },
                    'Abbrechen'
                )
            )
        );
        area.focus();
    });
};

// ------------------------------------------------------------------
// WAS BESUCHER ERLEBT HABEN (GET /api/objects/:uuid/problems, red)
// ------------------------------------------------------------------
const renderProblems = async (el, site) => {
    if (!site.rights.write) {
        return mount(el, h('p', { class: 'muted small' }, 'Probleme sieht, wer an dieser Website bauen darf.'));
    }
    let hours = 24;
    const load = async () => {
        mount(el, spinner());
        const res = await api.get(`/api/objects/${site.uuid}/problems?hours=${hours}`);
        const switcher = h(
            'div',
            { class: 'seg' },
            [24, 168].map(n =>
                h(
                    'button',
                    {
                        type: 'button',
                        class: n === hours ? 'on' : '',
                        onclick: () => {
                            hours = n;
                            load();
                        }
                    },
                    n === 24 ? '24 Std.' : '7 Tage'
                )
            )
        );
        if (!res.ok) return mount(el, switcher, h('p', { class: 'muted small' }, 'Konnte die Probleme nicht laden.'));
        const { problems } = res.data.data;
        if (!problems.length) {
            return mount(el, switcher, h('p', { class: 'site-ok' }, 'Keine Probleme – Besucher hatten keine Fehler.'));
        }
        return mount(
            el,
            switcher,
            h(
                'div',
                { class: 'kv-list' },
                problems.map(p =>
                    h(
                        'div',
                        { class: 'kv' },
                        h(
                            'div',
                            {},
                            h('span', { class: 'tree-dot warn' }),
                            h('span', {}, problemKindText(p.kind)),
                            p.part ? h('span', { class: 'mono muted small' }, ` · ${p.part}`) : null,
                            p.hint ? h('div', { class: 'muted small kv-hint' }, p.hint) : null
                        ),
                        h(
                            'span',
                            { class: 'muted nowrap' },
                            `${formatNumber(p.count)}× · ${p.lastAt ? timeAgo(p.lastAt) : '–'}`
                        )
                    )
                )
            ),
            h(
                'div',
                { class: 'row gap-s' },
                h(
                    'button',
                    {
                        type: 'button',
                        class: 'btn small',
                        onclick: async () => {
                            await copyText(repairPrompt(site.name, hours));
                            toast('Satz kopiert – füg ihn bei deinem KI-Helfer ein.', 'ok');
                        }
                    },
                    icon('copy', { size: 15 }),
                    h('span', {}, 'KI bitten, es zu reparieren')
                )
            )
        );
    };
    return load();
};

// ------------------------------------------------------------------
// ZUGRIFF (GET /api/objects/:uuid/members, blue) + Jemanden einladen
// ------------------------------------------------------------------
const renderAccess = async (el, site, myUuid) => {
    if (!site.rights.grant) {
        return mount(el, h('p', { class: 'muted small' }, 'Wer Zugriff hat, sehen nur Verwalter dieser Website.'));
    }
    mount(el, spinner());
    const res = await api.get(`/api/objects/${site.uuid}/members`);
    if (!res.ok) return mount(el, h('p', { class: 'muted small' }, 'Konnte den Zugriff nicht laden.'));
    // Nur echte Mitglieder der ganzen Website (keine Schutz-Einträge der Teile selbst)
    const members = (res.data?.data?.members || []).filter(m => !m.family);
    const invite = h('div');

    const startInvite = () => {
        const role = h(
            'select',
            { class: 'input' },
            h('option', { value: 'black' }, 'darf ansehen'),
            h('option', { value: 'red' }, 'darf mitbauen')
        );
        mount(
            invite,
            h(
                'div',
                { class: 'row gap-s wrap' },
                role,
                busyButton(
                    'Link erstellen',
                    async () => {
                        // "darf mitbauen" braucht auch Ansehen: red schliesst black NICHT ein
                        const roles = role.value === 'red' ? ['black', 'red'] : ['black'];
                        const r = await api.post(`/api/objects/${site.uuid}/invitations`, {
                            roles,
                            scope: 'familie',
                            hours: 7 * 24,
                            maxUses: 1
                        });
                        if (!r.ok) {
                            return mount(
                                invite,
                                callout(
                                    'info',
                                    'Einladen geht nur mit Login.',
                                    ' Gäste und KIs können keine Einladungen erstellen.'
                                )
                            );
                        }
                        const link = r.data?.data?.link || '';
                        mount(
                            invite,
                            h('p', { class: 'small' }, 'Schick diesen Link der Person (gilt 7 Tage, einmal):'),
                            h(
                                'div',
                                { class: 'row gap-s' },
                                h('code', { class: 'mono small invite-link' }, link),
                                copyButton(link, 'Link kopieren')
                            )
                        );
                    },
                    { className: 'btn primary small' }
                )
            )
        );
    };

    mount(
        el,
        h(
            'div',
            { class: 'kv-list' },
            members.map(m =>
                h(
                    'div',
                    { class: 'kv' },
                    h(
                        'span',
                        {},
                        h(
                            'span',
                            {
                                class: 'avatar',
                                style: `--hue: ${placeholderHue(m.uuid)}`
                            },
                            memberText(m, myUuid).slice(0, 1)
                        ),
                        memberText(m, myUuid)
                    ),
                    h('span', { class: 'muted' }, roleText(m.roles))
                )
            )
        ),
        invite
    );
    mount(invite, h('button', { class: 'btn small', type: 'button', onclick: startInvite }, '＋ Jemanden einladen'));
};

// ------------------------------------------------------------------
// SEITE
// ------------------------------------------------------------------
export default {
    async render(root, { params }) {
        const uuid = params[0];
        if (!uuid) {
            location.hash = '#/';
            return;
        }
        mount(root, spinner('Lade die Website …'));
        const [res, me] = await Promise.all([
            api.get(`/api/websites/${encodeURIComponent(uuid)}`),
            api.get('/api/objects/me')
        ]);
        if (!res.ok) {
            return mount(
                root,
                emptyState({
                    icon: 'alert',
                    title: res.status === 404 ? 'Website nicht gefunden' : 'Konnte die Website nicht laden',
                    text:
                        res.status === 404
                            ? 'Es gibt sie nicht (mehr), oder du hast keinen Zugriff.'
                            : 'Versuch es in einer Minute nochmals.',
                    action: h('a', { class: 'btn', href: href('') }, 'Zur Übersicht')
                })
            );
        }
        const site = res.data.data;
        const myUuid = me.ok ? me.data?.data?.uuid || null : null;
        document.title = `${site.name} · vindelis Cockpit`;
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = site.name;

        const state = STATE[site.visibility] || STATE.private;
        const problems = problemsText(site.problems24h);
        const address = displayAddress(site);
        const url = site.customHost ? `https://${site.customHost}` : site.address;

        // Titelbild: berechnete Fläche, mit Vorschaubild (D3b) darüber, sobald geladen
        const cover = h(
            'div',
            { class: 'site-cover', style: `--hue: ${placeholderHue(site.name)}` },
            h('div', { class: 'site-icon' }, site.name.slice(0, 1).toUpperCase())
        );
        const showThumb = url => {
            if (!url) return;
            cover.classList.add('has-shot');
            cover.prepend(h('img', { class: 'site-cover-img', src: url, alt: '' }));
        };
        loadThumbnail(site).then(showThumb);
        // "Vorschau jetzt aufnehmen" (T3): nur wer bauen darf, nur öffentliche Websites
        const thumbButton =
            site.rights.write && site.visibility === 'public'
                ? busyButton(
                      site.thumbAt ? 'Vorschau neu aufnehmen' : 'Vorschau aufnehmen',
                      async () => {
                          const r = await api.post(`/api/websites/${site.uuid}/vorschau`, {});
                          if (!r.ok) return toast(r.error || 'Kein Bild möglich.', 'error');
                          toast('Vorschaubild aufgenommen.', 'ok');
                          const fresh = await api.get(`/api/websites/${site.uuid}`);
                          if (fresh.ok) {
                              cover.querySelector('.site-cover-img')?.remove();
                              showThumb(await loadThumbnail(fresh.data.data));
                          }
                      },
                      { className: 'btn small cover-btn' }
                  )
                : null;
        if (thumbButton) cover.append(thumbButton);

        const noteEl = h('div');
        const problemsEl = h('div');
        const accessEl = h('div');
        const backupsEl = h('div');

        mount(
            root,
            cover,
            h(
                'div',
                { class: 'site-page' },
                h('h1', { class: 'site-title' }, site.name),
                h(
                    'dl',
                    { class: 'site-props' },
                    prop(
                        'Zustand',
                        h('span', { class: `tree-dot ${state.tone}` }),
                        state.text,
                        problems ? h('span', { class: site.problems24h ? 'is-warn' : 'muted' }, ` · ${problems}`) : null
                    ),
                    prop(
                        'Adresse',
                        url
                            ? h(
                                  'a',
                                  { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'mono' },
                                  address
                              )
                            : h('span', { class: 'muted' }, '–'),
                        url ? copyButton(url, 'Adresse kopieren') : null,
                        site.rights.grant && !site.customHost
                            ? h(
                                  'a',
                                  { class: 'small prop-link', href: techHref(site.uuid, 'website') },
                                  'Eigene Domain verbinden'
                              )
                            : null
                    ),
                    prop(
                        'Sichtbar für',
                        VISIBILITY_SENTENCE[site.visibility] || VISIBILITY_SENTENCE.private,
                        site.rights.grant
                            ? h('a', { class: 'small prop-link', href: techHref(site.uuid, 'sichtbar') }, 'ändern')
                            : null
                    ),
                    site.backups
                        ? prop(
                              'Letzte Sicherung',
                              site.backups.latestAt ? timeAgo(site.backups.latestAt) : 'noch keine',
                              site.backups.count
                                  ? h('span', { class: 'muted' }, ` · ${site.backups.count} gesamt`)
                                  : null
                          )
                        : null,
                    site.lastChange ? prop('Zuletzt geändert', timeAgo(site.lastChange)) : null,
                    site.liveNow !== null && site.liveNow !== undefined
                        ? prop(
                              'Live gerade',
                              site.liveNow === 1 ? '1 Verbindung' : `${formatNumber(site.liveNow)} Verbindungen`
                          )
                        : null
                ),
                noteEl,
                h(
                    'div',
                    { class: 'site-cols' },
                    h(
                        'div',
                        { class: 'site-col' },
                        box('Was Besucher erlebt haben', null, problemsEl),
                        box(
                            'Teile',
                            null,
                            site.parts.length
                                ? h(
                                      'div',
                                      { class: 'kv-list' },
                                      site.parts.map(p =>
                                          h(
                                              'a',
                                              { class: 'kv kv-link', href: techHref(p.uuid) },
                                              h(
                                                  'span',
                                                  {},
                                                  h('span', { class: `tree-dot ${p.visibility}` }),
                                                  h('span', { class: 'mono' }, p.name || 'ohne Namen')
                                              ),
                                              h('span', { class: 'muted' }, partKind(p))
                                          )
                                      )
                                  )
                                : h('p', { class: 'muted small' }, 'Noch keine Teile.')
                        )
                    ),
                    h(
                        'div',
                        { class: 'site-col' },
                        box('Zugriff', null, accessEl),
                        box(
                            'Speicher',
                            null,
                            h(
                                'div',
                                { class: 'kv-list' },
                                h(
                                    'div',
                                    { class: 'kv' },
                                    h('span', {}, 'Dateien'),
                                    h(
                                        'span',
                                        { class: 'muted' },
                                        `${formatNumber(site.storage.files)} · ${formatBytes(site.storage.fileBytes)}`
                                    )
                                ),
                                h(
                                    'div',
                                    { class: 'kv' },
                                    h('span', {}, 'Datensätze'),
                                    h('span', { class: 'muted' }, formatNumber(site.storage.dataRows))
                                )
                            )
                        )
                    )
                ),
                site.backups ? backupsEl : null,
                h(
                    'p',
                    { class: 'site-tech' },
                    h('a', { href: techHref(site.uuid) }, 'Technik-Details →'),
                    h('span', { class: 'muted small' }, ' Code, DNA, Rechte im Detail, Sichtbarkeit, Klonen, Löschen')
                )
            )
        );

        renderNote(noteEl, site);
        renderProblems(problemsEl, site);
        renderAccess(accessEl, site, myUuid);
        // Sicherungen: die bestehende Zeitmaschine (Liste, Jetzt sichern, Zurückholen) – nur mit blue
        if (site.backups) renderSnapshotsTab(backupsEl, { uuid: site.uuid });
    }
};
