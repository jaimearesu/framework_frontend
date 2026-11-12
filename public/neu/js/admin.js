// Bereich «Admin» (Admin-Bereich, Stufe 1, 12.11.2026) – nur für Admins.
// Wer Admin ist, steht im Backend (ADMIN_ACCOUNTS in der .env); für alle anderen gibt es
// weder den Menüpunkt noch die Daten (das Backend antwortet 404).
//
// Drei Reiter unter #/admin/<reiter>:
//   Übersicht  Kennzahlen (nur Zahlen)
//   Meldungen  gemeldete Websites im Feed (meldungen.js)
//   Konten     Konto suchen und – immer mit Grund – eingreifen
//
// Alles, was von Kunden kommt (Namen, Websites, Adressen), nur über h(), nie als HTML.
import { api } from '../../js/core/api.js';
import { timeAgo } from '../../js/core/format.js';
import { h, meldung, leer, huelle } from './ui.js';
import { geladen, mitDaten, formular } from './einst-hilfe.js';
import { seiteMeldungen } from './meldungen.js';
import {
    ADMIN_REITER,
    reiterAusAdresse,
    GESCHENK_STUFEN,
    grundProblem,
    tageAusText,
    kennzahlen,
    aboText,
    verbrauchText,
    VERBRAUCH_NAMEN,
    stufenName,
    zahlText
} from './admin-werte.js';

// ---------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------
const uebersicht = () =>
    mitDaten(
        geladen('admin:uebersicht', () => api.get('/api/admin/uebersicht')),
        d =>
            h(
                'div',
                { class: 'stapel', id: 'admin-uebersicht' },
                h(
                    'div',
                    { class: 'admin-zahlen' },
                    kennzahlen(d).map(([titel, wert, unter]) =>
                        h(
                            'div',
                            { class: 'bp-karte admin-zahl' },
                            h('span', { class: 'leise' }, titel),
                            h('b', {}, wert),
                            unter ? h('small', { class: 'leise' }, unter) : null
                        )
                    )
                ),
                h(
                    'div',
                    { class: 'bp-karte stapel' },
                    h('h3', {}, 'Abos pro Stufe'),
                    d.tiers.map(t =>
                        h(
                            'div',
                            { class: 'kennzahl' },
                            h('span', {}, t.name),
                            h('span', { class: 'leise' }, zahlText(t.abos))
                        )
                    )
                ),
                h(
                    'div',
                    { class: 'bp-karte stapel' },
                    h('h3', {}, 'System'),
                    [
                        [
                            'Stripe',
                            d.system.stripe === 'live'
                                ? 'echtes Geld'
                                : d.system.stripe === 'test'
                                  ? 'Spielwiese'
                                  : 'aus'
                        ],
                        ['Grenzen der Stufen', d.system.limitsEnforced ? 'gelten' : 'gelten noch nicht'],
                        ['Mail-Versand', d.system.mail ? 'an' : 'aus'],
                        ['Admins', zahlText(d.system.admins)]
                    ].map(([name, wert]) =>
                        h('div', { class: 'kennzahl' }, h('span', {}, name), h('span', { class: 'leise' }, wert))
                    )
                )
            ),
        { symbol: 'werkstatt' }
    );

// ---------------------------------------------------------------------
// Konten
// ---------------------------------------------------------------------
// Was gerade gesucht/gezeigt wird (bleibt beim Neuzeichnen stehen)
const stand = { suche: '', konto: null, fehler: '', laedt: false, email: null };

const suchen = async text => {
    stand.suche = text.trim();
    if (!stand.suche) return;
    stand.laedt = true;
    stand.fehler = '';
    stand.email = null;
    huelle.neu();
    const antwort = await api.get('/api/admin/konten?suche=' + encodeURIComponent(stand.suche));
    stand.laedt = false;
    stand.konto = antwort.ok ? antwort.data.data : null;
    stand.fehler = antwort.ok ? '' : antwort.error || 'Das hat nicht geklappt.';
    huelle.neu();
};

// Ein Eingriff: Antwort ist das neue Konto. Gibt den Fehler-Text zurück (leer = ok)
const eingreifen = async (was, body, text) => {
    const antwort = await api.post('/api/admin/konten/' + stand.konto.uuid + '/' + was, body);
    if (!antwort.ok) return antwort.error || 'Das hat nicht geklappt.';
    stand.konto = antwort.data.data;
    meldung(text);
    huelle.neu();
    return '';
};

const grundFeld = {
    name: 'grund',
    label: 'Grund (kommt ins Protokoll)',
    platzhalter: 'z.B. Support-Anfrage, Tester',
    fokus: true
};

const emailZeigen = () =>
    formular({
        titel: 'Ganze E-Mail-Adresse zeigen?',
        text: 'Die Adresse ist persönlich. Der Blick kommt mit deinem Grund ins Protokoll.',
        felder: [grundFeld],
        knopf: 'Zeigen',
        tun: async ({ grund }) => {
            const problem = grundProblem(grund);
            if (problem) return problem;
            const antwort = await api.post('/api/admin/konten/' + stand.konto.uuid + '/email', { grund: grund.trim() });
            if (!antwort.ok) return antwort.error || 'Das hat nicht geklappt.';
            stand.email = antwort.data.data.email || 'keine Adresse bekannt';
            huelle.neu();
            return '';
        }
    });

const gratisLive = an =>
    formular({
        titel: an ? '«Gratis live» einschalten?' : '«Gratis live» ausschalten?',
        text: an
            ? 'Das Konto hat dann keine Grenzen der Stufen und bezahlt nichts (Freunde, Familie, eigene Websites).'
            : 'Danach gelten wieder die Grenzen der gebuchten (oder geschenkten) Stufe.',
        felder: [grundFeld],
        knopf: an ? 'Einschalten' : 'Ausschalten',
        gefahr: !an,
        tun: ({ grund }) =>
            grundProblem(grund) ||
            eingreifen('gratis-live', { an, grund: grund.trim() }, an ? 'Gratis live an' : 'Gratis live aus')
    });

const stufeSchenken = () =>
    formular({
        titel: 'Stufe schenken',
        text: 'Gilt sofort, ohne Stripe. Hat das Konto ein höheres Abo, gilt das Abo. Leere Tage = bis du es wegnimmst.',
        felder: [
            {
                name: 'stufe',
                label: 'Stufe',
                art: 'select',
                wert: 'klein',
                optionen: GESCHENK_STUFEN.map(([wert, text]) => ({ wert, text }))
            },
            { name: 'tage', label: 'Wie viele Tage? (leer = ohne Ende)', platzhalter: 'z.B. 30', mono: true },
            { ...grundFeld, fokus: false }
        ],
        knopf: 'Schenken',
        tun: ({ stufe, tage, grund }) => {
            const t = tageAusText(tage);
            if (t === undefined) return 'Tage: eine ganze Zahl von 1 bis 3650 – oder leer lassen.';
            return (
                grundProblem(grund) ||
                eingreifen('stufe', { stufe, tage: t, grund: grund.trim() }, stufenName(stufe) + ' geschenkt')
            );
        }
    });

const geschenkWegnehmen = () =>
    formular({
        titel: 'Geschenkte Stufe wegnehmen?',
        text: 'Danach gilt wieder die gebuchte Stufe (oder Gratis).',
        felder: [grundFeld],
        knopf: 'Wegnehmen',
        gefahr: true,
        tun: ({ grund }) =>
            grundProblem(grund) || eingreifen('stufe', { stufe: null, grund: grund.trim() }, 'Geschenk weggenommen')
    });

const zeile = (name, wert) => h('div', { class: 'kennzahl' }, h('span', {}, name), h('span', { class: 'leise' }, wert));
const knopf = (text, onclick, art = 'bp-btn-o', id = null) =>
    h('button', { class: 'bp-btn bp-btn-klein ' + art, type: 'button', onclick, id }, text);

const kontoKarte = k =>
    h(
        'div',
        { class: 'stapel', id: 'admin-konto' },
        h(
            'div',
            { class: 'bp-karte stapel' },
            h(
                'div',
                { class: 'zeile-text' },
                h('b', {}, k.displayName || (k.handle ? '@' + k.handle : 'Ohne Namen')),
                h('span', { class: 'leise mono' }, k.uuid)
            ),
            zeile('@name', k.handle ? '@' + k.handle + (k.profilePublic ? ' (Profilseite an)' : '') : '–'),
            h(
                'div',
                { class: 'kennzahl' },
                h('span', {}, 'E-Mail'),
                h(
                    'span',
                    { class: 'leise', id: 'admin-email' },
                    stand.email || k.email || 'keine bekannt',
                    k.email && !k.emailVerified ? ' (unbestätigt)' : ''
                )
            ),
            zeile('Konto seit', k.createdAt ? new Date(k.createdAt).toLocaleDateString('de-CH') : '–'),
            zeile('Zuletzt aktiv', k.lastActionAt ? timeAgo(k.lastActionAt) : 'nichts im Protokoll'),
            zeile('Agenten', zahlText(k.agents) + (k.lastAgentAt ? ' · zuletzt ' + timeAgo(k.lastAgentAt) : '')),
            zeile('Objekte', zahlText(k.objects)),
            h(
                'div',
                { class: 'knopf-reihe' },
                k.email && !stand.email ? knopf('E-Mail zeigen', emailZeigen, 'bp-btn-o', 'admin-email-zeigen') : null
            )
        ),
        h(
            'div',
            { class: 'bp-karte stapel' },
            h('h3', {}, 'Stufe und Verbrauch'),
            h('span', { id: 'admin-abo' }, aboText(k.billing)),
            VERBRAUCH_NAMEN.map(([key, name]) => zeile(name, verbrauchText(key, k.usage[key], k.limits[key]))),
            h(
                'div',
                { class: 'knopf-reihe' },
                knopf('Stufe schenken', stufeSchenken, 'bp-btn-o', 'admin-schenken'),
                k.billing.giftActive ? knopf('Geschenk wegnehmen', geschenkWegnehmen, 'bp-btn-o') : null,
                k.billing.freeLive
                    ? knopf('Gratis live aus', () => gratisLive(false), 'bp-btn-gefahr', 'admin-gratis')
                    : knopf('Gratis live an', () => gratisLive(true), 'bp-btn-o', 'admin-gratis')
            )
        ),
        h(
            'div',
            { class: 'bp-karte stapel' },
            h('h3', {}, 'Websites (' + zahlText(k.sitesCount) + ')'),
            k.sites.length
                ? k.sites.map(s =>
                      h(
                          'div',
                          { class: 'kennzahl' },
                          s.address
                              ? h('a', { href: s.address, target: '_blank', rel: 'noopener noreferrer' }, s.name)
                              : h('span', {}, s.name),
                          h(
                              'span',
                              { class: 'leise' },
                              s.visibility + (s.shared ? ' · im Feed' : '') + (s.hidden ? ' · herausgenommen' : '')
                          )
                      )
                  )
                : h('span', { class: 'leise' }, 'Keine Websites.'),
            k.sitesCount > k.sites.length
                ? h('small', { class: 'leise' }, 'Gezeigt: die neusten ' + k.sites.length + '.')
                : null
        )
    );

const konten = () => {
    const eingabe = h('input', {
        class: 'bp-in',
        id: 'admin-suche',
        type: 'search',
        autocomplete: 'off',
        placeholder: '@name, E-Mail, UUID oder Website-Name',
        value: stand.suche,
        onkeydown: e => {
            if (e.key === 'Enter') suchen(eingabe.value);
        }
    });
    return h(
        'div',
        { class: 'stapel' },
        h(
            'div',
            { class: 'bp-karte stapel' },
            h(
                'div',
                { class: 'knopf-reihe admin-suche' },
                eingabe,
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-p',
                        type: 'button',
                        id: 'admin-suchen',
                        disabled: stand.laedt,
                        onclick: () => suchen(eingabe.value)
                    },
                    stand.laedt ? 'Sucht…' : 'Suchen'
                )
            ),
            h(
                'small',
                { class: 'leise' },
                'Jeder Blick in ein Konto kommt ins Protokoll. Gezeigt wird nie, was in den Websites steht.'
            )
        ),
        stand.fehler ? h('div', { class: 'bp-karte' }, leer('suche', 'Nichts gefunden', stand.fehler)) : null,
        stand.konto ? kontoKarte(stand.konto) : null
    );
};

// ---------------------------------------------------------------------
// Die Seite
// ---------------------------------------------------------------------
export const seiteAdmin = () => {
    const aktiv = reiterAusAdresse(location.hash);
    const inhalt = aktiv === 'meldungen' ? seiteMeldungen() : aktiv === 'konten' ? konten() : uebersicht();
    return [
        h(
            'div',
            { class: 'bp-tabs', role: 'tablist' },
            ADMIN_REITER.map(([id, text]) =>
                h(
                    'button',
                    {
                        type: 'button',
                        role: 'tab',
                        'aria-selected': id === aktiv ? 'true' : 'false',
                        onclick: () => {
                            location.hash = '#/admin/' + id;
                        }
                    },
                    text
                )
            )
        ),
        h('div', { class: 'reiter-inhalt' }, inhalt)
    ];
};
seiteAdmin.unter = () =>
    h('span', { class: 'leise' }, 'Nur für das vindelis-Team. Eingriffe immer mit Grund, alles im Protokoll.');
