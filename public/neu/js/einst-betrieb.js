// Einstellungen rund um die Website als Ganzes: Domain, Sichtbarkeit, Sicherungen, Klonen, Löschen.
// Alle Rechte prüft das Backend. Texte vom Backend nur als Text, nie als HTML.
import { api } from '../../js/core/api.js';
import { formatDate, timeAgo } from '../../js/core/format.js';
import { customDomainStatusText, dnsNameHint } from '../../js/core/site.js';
import { domainAnleitungOeffnen } from './domain-anleitung.js';
import { invalidateObjects } from '../../js/core/objects.js';
import { h, leer, kopierZeile, meldung } from './ui.js';
import { DATEN } from './daten.js';
import { neuLaden } from './websites.js';
import { veroeffentlichenOeffnen } from './website-veroeffentlichen.js';
import { bereichKopf, formular, geladen, hinweiseZeigen, mitDaten, nochmals } from './einst-hilfe.js';
import {
    ART_DER_SICHERUNG,
    STUFEN,
    loeschUmfang,
    sicherungText,
    stufeText,
    wiederherstellenName
} from './einstellungen-werte.js';

const pfad = uuid => '/api/objects/' + encodeURIComponent(uuid);
const nurMitKonto = text =>
    h('div', { class: 'bp-karte', id: 'braucht-konto' }, leer('konto', 'Bitte melde dich an', text));
const istGast = () => DATEN.mensch.art !== 'user';

const klein = (text, onclick, klasse = 'bp-btn-o') =>
    h('button', { class: 'bp-btn bp-btn-klein ' + klasse, type: 'button', onclick }, text);

// ---- Eigene Domain ----

const domainZeile = (site, d, schluessel, cnameZiel) => {
    const zustand = customDomainStatusText(d.status);
    const adresse = pfad(site.uuid) + '/custom-domains/' + encodeURIComponent(d.hostname);
    return h(
        'div',
        { class: 'bp-karte stapel domain-karte' },
        h(
            'div',
            { class: 'abschnitt-kopf' },
            d.status === 'active'
                ? h(
                      'a',
                      { class: 'mono', href: 'https://' + d.hostname, target: '_blank', rel: 'noopener noreferrer' },
                      d.hostname
                  )
                : h('b', { class: 'mono' }, d.hostname),
            h(
                'span',
                {
                    class:
                        'bp-st ' +
                        (d.status === 'active' ? 'bp-st-ok' : d.status === 'failed' ? 'bp-st-stop' : 'bp-st-warn')
                },
                zustand.text
            )
        ),
        d.status === 'active'
            ? null
            : h(
                  'div',
                  { class: 'stapel' },
                  h('span', {}, 'Lege bei deinem Domain-Anbieter diesen Eintrag an:'),
                  h('div', {}, h('b', {}, 'Typ: '), 'CNAME'),
                  h('div', {}, h('b', {}, 'Name: '), h('span', { class: 'mono' }, dnsNameHint(d.hostname))),
                  h('div', {}, h('b', {}, 'Ziel:')),
                  kopierZeile(d.dns.target),
                  h('span', { class: 'leise' }, 'Liegt die Domain bei Cloudflare: Proxy-Status auf «DNS only» stellen.')
              ),
        d.lastError ? h('span', { class: 'leise' }, 'Stand: ' + d.lastError) : null,
        h(
            'div',
            { class: 'zeile-knopf' },
            d.status === 'active'
                ? null
                : klein('Anleitung fortsetzen', () =>
                      domainAnleitungOeffnen({ site, schluessel, cnameZiel, domain: d })
                  ),
            d.status === 'active'
                ? null
                : klein('Jetzt prüfen', async () => {
                      const antwort = await api.post(adresse + '/check', {});
                      if (!antwort.ok) return meldung('Hat nicht geklappt', antwort.error, 'kreuz');
                      meldung(
                          antwort.data.data.status === 'active' ? 'Die Domain ist aktiv' : 'Noch nicht bereit',
                          d.hostname
                      );
                      await nochmals(schluessel);
                  }),
            klein('Trennen', () =>
                formular({
                    titel: 'Domain trennen?',
                    text: d.hostname + ' zeigt danach nicht mehr auf diese Website.',
                    knopf: 'Trennen',
                    gefahr: true,
                    tun: async () => {
                        const antwort = await api.del(adresse);
                        if (!antwort.ok) return antwort.error;
                        meldung('Domain getrennt', d.hostname);
                        await nochmals(schluessel);
                        return '';
                    }
                })
            )
        )
    );
};

export const bereichDomain = (w, site) => {
    const kopf = knopf =>
        bereichKopf(
            w,
            'Eigene Domain',
            'Die Website unter deiner Adresse zeigen, z.B. www.meinladen.ch. Wir führen dich Schritt für Schritt durch, das Zertifikat kommt von selbst.',
            knopf
        );
    if (istGast()) return [kopf(), nurMitKonto('Eigene Domains können nur angemeldete Menschen verbinden.')];
    const schluessel = 'domain:' + site.uuid;
    const eintrag = geladen(schluessel, () => api.get(pfad(site.uuid) + '/custom-domains'));
    const daten = eintrag.daten;
    return [
        kopf(
            daten?.enabled && daten.domains.length < daten.maxPerSite
                ? h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-p',
                          id: 'domain-neu',
                          type: 'button',
                          onclick: () => domainAnleitungOeffnen({ site, schluessel, cnameZiel: daten.cnameTarget })
                      },
                      'Domain verbinden'
                  )
                : null
        ),
        mitDaten(eintrag, d =>
            h(
                'div',
                { class: 'stapel', id: 'domain-liste' },
                d.enabled
                    ? null
                    : h(
                          'div',
                          { class: 'bp-hinweis bp-h-warn' },
                          'Eigene Domains sind auf diesem Server noch nicht eingerichtet.'
                      ),
                d.domains.length
                    ? d.domains.map(x => domainZeile(site, x, schluessel, d.cnameTarget))
                    : h(
                          'div',
                          { class: 'bp-karte' },
                          leer(
                              'kugel',
                              'Noch keine eigene Domain',
                              'Deine Website läuft unter ' +
                                  w.adresse +
                                  '. Mit «Domain verbinden» startest du die Anleitung.'
                          )
                      )
            )
        )
    ];
};

// ---- Sichtbarkeit ----

const sichtbarkeitSetzen = async (uuid, visibility) =>
    await api.put(pfad(uuid) + '/visibility', { visibility, includeChildren: true });

const stufeWaehlen = (w, site, stufe, fertig) => {
    if (stufe === 'public') return veroeffentlichenOeffnen(w, site, fertig);
    formular({
        titel: 'Auf «' + STUFEN[stufe].titel + '» stellen?',
        text: STUFEN[stufe].text + ' Das gilt für die ganze Website mit allen Teilen.',
        knopf: 'Umstellen',
        tun: async () => {
            const antwort = await sichtbarkeitSetzen(site.uuid, stufe);
            if (!antwort.ok) return antwort.error;
            invalidateObjects();
            meldung('Sichtbarkeit geändert', STUFEN[stufe].titel);
            await fertig();
            return '';
        }
    });
};

const teilStufe = (site, teil, fertig) =>
    formular({
        titel: 'Sichtbarkeit von «' + (teil.name || 'Teil') + '»',
        text: 'Gilt für diesen Teil und alles darunter. Ein Teil ist nie offener als die Website.',
        felder: [
            {
                name: 'stufe',
                label: 'Wer sieht diesen Teil?',
                art: 'select',
                wert: teil.visibility,
                optionen: Object.entries(STUFEN).map(([wert, s]) => ({ wert, text: s.titel }))
            }
        ],
        knopf: 'Speichern',
        tun: async ({ stufe }) => {
            const antwort = await sichtbarkeitSetzen(teil.uuid, stufe);
            if (!antwort.ok) return antwort.error;
            invalidateObjects();
            meldung('Sichtbarkeit geändert', teil.name || 'Teil');
            await fertig();
            return '';
        }
    });

export const bereichSichtbarkeit = (w, site, fertig) => {
    const kopf = bereichKopf(w, 'Sichtbarkeit', 'Wer die Website und ihre Teile sehen kann.');
    if (istGast()) return [kopf, nurMitKonto('Veröffentlichen können nur angemeldete Menschen.')];
    return [
        kopf,
        h(
            'div',
            { class: 'wahl-liste', id: 'stufen' },
            Object.entries(STUFEN).map(([stufe, s]) =>
                h(
                    'div',
                    { class: 'bp-karte eng abschnitt-kopf' },
                    h('div', { class: 'zeile-text' }, h('b', {}, s.titel), h('span', { class: 'leise' }, s.text)),
                    site.visibility === stufe
                        ? h('span', { class: 'bp-st bp-st-ok' }, 'Aktuell')
                        : klein('Wählen', () => stufeWaehlen(w, site, stufe, fertig))
                )
            )
        ),
        (site.parts || []).length
            ? h(
                  'div',
                  { class: 'abschnitt', id: 'teil-stufen' },
                  h('div', { class: 'abschnitt-kopf' }, h('h3', {}, 'Einzelne Teile')),
                  h(
                      'div',
                      { class: 'bp-karte eng zeilen' },
                      site.parts.map(p =>
                          h(
                              'div',
                              { class: 'zeile' },
                              h(
                                  'div',
                                  { class: 'zeile-text' },
                                  h('b', {}, p.name || 'Teil'),
                                  h('span', { class: 'leise' }, stufeText(p.visibility))
                              ),
                              klein('Ändern', () => teilStufe(site, p, fertig))
                          )
                      )
                  )
              )
            : null
    ];
};

// ---- Sicherungen ----

export const bereichSicherungen = (w, site) => {
    const schluessel = 'sicherungen:' + site.uuid;
    const eintrag = geladen(schluessel, () => api.get(pfad(site.uuid) + '/snapshots'));
    const jetztSichern = () =>
        formular({
            titel: 'Jetzt sichern',
            text: 'Die ganze Website mit allen Teilen, Daten und Dateien. Der Platz zählt zu deinem Speicher.',
            felder: [
                { name: 'label', label: 'Beschriftung (freiwillig)', platzhalter: 'z.B. vor dem Umbau', fokus: true }
            ],
            knopf: 'Sichern',
            tun: async ({ label }) => {
                const antwort = await api.post(
                    pfad(site.uuid) + '/snapshots',
                    label.trim() ? { label: label.trim() } : {}
                );
                if (!antwort.ok) return antwort.error;
                meldung('Gesichert', w.titel);
                await nochmals(schluessel);
                return '';
            }
        });
    const wiederherstellen = s =>
        formular({
            titel: 'Als neue Website wiederherstellen',
            text:
                'Die Sicherung vom ' +
                formatDate(s.createdAt) +
                ' wird als neue, private Website aufgebaut. Deine jetzige Website bleibt unverändert.',
            felder: [
                {
                    name: 'domain',
                    label: 'Name der neuen Website',
                    wert: wiederherstellenName(s),
                    mono: true,
                    fokus: true
                }
            ],
            knopf: 'Wiederherstellen',
            tun: async ({ domain }) => {
                const antwort = await api.post('/api/snapshots/' + s.uuid + '/restore', { domain: domain.trim() });
                if (!antwort.ok) return antwort.error;
                invalidateObjects();
                await neuLaden();
                const d = antwort.data.data;
                hinweiseZeigen('Wiederhergestellt als «' + d.domain + '»', d.hinweise, '#/website/' + d.uuid);
                return '';
            }
        });
    return [
        bereichKopf(
            w,
            'Sicherungen',
            'Nachts sichert vindelis geänderte Websites selbst. Wiederherstellen baut immer eine neue Website.',
            h(
                'button',
                { class: 'bp-btn bp-btn-p', id: 'sichern', type: 'button', onclick: jetztSichern },
                'Jetzt sichern'
            )
        ),
        mitDaten(eintrag, liste =>
            (liste || []).length
                ? h(
                      'div',
                      { class: 'bp-karte eng zeilen', id: 'sicherungen-liste' },
                      liste.map(s =>
                          h(
                              'div',
                              { class: 'zeile' },
                              h(
                                  'div',
                                  { class: 'zeile-text' },
                                  h(
                                      'span',
                                      { class: 'wahl-kopf' },
                                      h('b', {}, formatDate(s.createdAt)),
                                      h('span', { class: 'bp-badge bp-badge-s' }, ART_DER_SICHERUNG[s.kind] || s.kind)
                                  ),
                                  s.label ? h('span', {}, s.label) : null,
                                  h('span', { class: 'leise' }, sicherungText(s) + ', ' + timeAgo(s.createdAt)),
                                  s.note ? h('span', { class: 'leise' }, s.note) : null
                              ),
                              klein('Wiederherstellen', () => wiederherstellen(s))
                          )
                      )
                  )
                : h(
                      'div',
                      { class: 'bp-karte', id: 'sicherungen-leer' },
                      leer('kugel', 'Noch keine Sicherung', 'Mit «Jetzt sichern» legst du die erste an.')
                  )
        )
    ];
};

// ---- Klonen ----

export const bereichKlonen = (w, site) => {
    const klonen = () =>
        formular({
            titel: 'Website klonen',
            felder: [
                {
                    name: 'domain',
                    label: 'Name der Kopie',
                    wert: site.name + '-kopie',
                    mono: true,
                    fokus: true,
                    hilfe: 'Jeder Name existiert nur einmal.'
                },
                { name: 'daten', label: 'Datensätze mitkopieren', art: 'checkbox' }
            ],
            knopf: 'Klonen',
            tun: async ({ domain, daten }) => {
                const antwort = await api.post(pfad(site.uuid) + '/clone', {
                    domain: domain.trim(),
                    deep: true,
                    withData: daten
                });
                if (!antwort.ok) return antwort.error;
                invalidateObjects();
                await neuLaden();
                const d = antwort.data?.data || {};
                hinweiseZeigen('Kopie «' + domain.trim() + '» erstellt', antwort.data?.hinweise, '#/website/' + d.uuid);
                return '';
            }
        });
    return [
        bereichKopf(w, 'Klonen', 'Eine eigene Kopie der ganzen Website. Das Original bleibt unverändert.'),
        h(
            'div',
            { class: 'bp-karte stapel', id: 'klonen-karte' },
            h(
                'ul',
                { class: 'stapel' },
                h('li', {}, 'Kommt mit: alle Teile, der neuste Code und die Dateien. Zeitpläne sind zuerst pausiert.'),
                h('li', {}, 'Kommt nie mit: Schlüssel aus dem Tresor, Rechte und Besucher.'),
                h('li', {}, 'Die Kopie ist zuerst privat und gehört dir.')
            ),
            h(
                'div',
                {},
                h(
                    'button',
                    { class: 'bp-btn bp-btn-p', id: 'klonen', type: 'button', onclick: klonen },
                    'Website klonen'
                )
            )
        )
    ];
};

// ---- Löschen ----

export const bereichLoeschen = (w, site) => {
    const eintrag = geladen('loeschen:' + site.uuid, () =>
        api.get(pfad(site.uuid) + '/delete-preview', { query: { deep: 'true' } })
    );
    const loeschen = () =>
        formular({
            titel: 'Website endgültig löschen?',
            text: 'Das lässt sich nicht rückgängig machen. Vorhandene Sicherungen bleiben 30 Tage im Papierkorb.',
            felder: [{ name: 'name', label: 'Zur Sicherheit: tippe «' + site.name + '»', mono: true, fokus: true }],
            knopf: 'Endgültig löschen',
            gefahr: true,
            tun: async ({ name }) => {
                if (name.trim() !== site.name) return 'Der Name stimmt nicht.';
                const antwort = await api.del(pfad(site.uuid), { query: { deep: 'true' } });
                if (!antwort.ok) return antwort.error;
                invalidateObjects();
                meldung('Website gelöscht', site.name);
                location.hash = '#/websites';
                await neuLaden();
                return '';
            }
        });
    return [
        bereichKopf(w, 'Löschen', 'Die Website mit allen Teilen, Daten und Dateien entfernen.'),
        mitDaten(eintrag, v =>
            h(
                'div',
                { class: 'bp-karte stapel', id: 'loeschen-karte' },
                h('p', {}, loeschUmfang(v)),
                v.blockers.length
                    ? h(
                          'div',
                          { class: 'bp-hinweis bp-h-warn', id: 'loeschen-hindernis' },
                          'Geht gerade nicht: ' + v.blockers.join(' ')
                      )
                    : null,
                h(
                    'div',
                    {},
                    h(
                        'button',
                        {
                            class: 'bp-btn bp-btn-gefahr',
                            id: 'loeschen',
                            type: 'button',
                            disabled: !v.canDelete,
                            onclick: loeschen
                        },
                        'Website löschen'
                    )
                )
            )
        )
    ];
};
