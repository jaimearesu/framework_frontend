// «Wartet auf mich»: Bitten von KI-Helfern ums Veröffentlichen, neue Uploads von Besuchern
// und Websites, die mir jemand übergeben möchte.
// Eine KI veröffentlicht nie selbst, hier entscheidet ein Mensch.
// Begründungen und Dateinamen stammen von einer KI oder von Fremden: Sie laufen nur als Text durch h().
import { api } from '../../js/core/api.js';
import { href } from '../../js/core/routes.js';
import { h, ikon, meldung, leer, dialog } from './ui.js';
import { DATEN } from './daten.js';
import { neuLaden } from './websites.js';

// Die alte Adresse wird beim Öffnen übersetzt: Website = neues Cockpit, einzelner Teil = altes
const ansehenLink = e =>
    h(
        'a',
        {
            class: 'bp-btn bp-btn-o',
            id: 'ansehen-' + e.id,
            href: '/' + href('objekte', e.ziel),
            target: '_blank',
            rel: 'noopener'
        },
        'Ansehen'
    );

// Freigeben kann nur, wer ein Konto hat. Das prüft auch das Backend
const darfFreigeben = () => DATEN.mensch.art === 'user';

// Fragt nach, sagt genau was passiert und nimmt eine Notiz an die KI entgegen
const bitteEntscheidenOeffnen = (e, freigeben) =>
    dialog(({ zu }) => {
        const fehler = h('div');
        const notiz = h('input', {
            id: 'bitte-notiz',
            class: 'bp-in',
            maxlength: 500,
            autocomplete: 'off',
            'data-fokus': true
        });
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'bitte-bestaetigen',
                type: 'button',
                onclick: async () => {
                    knopf.disabled = true;
                    const antwort = await api.post(
                        '/api/publish-requests/' + e.id + (freigeben ? '/approve' : '/decline'),
                        { note: notiz.value.trim() || undefined }
                    );
                    if (!antwort.ok) {
                        fehler.replaceChildren(
                            h('div', { class: 'bp-hinweis bp-h-gefahr' }, antwort.error || 'Das hat nicht geklappt.')
                        );
                        knopf.disabled = false;
                        return;
                    }
                    zu();
                    meldung(freigeben ? 'Freigegeben' : 'Abgelehnt', e.website);
                    await neuLaden();
                }
            },
            freigeben ? 'Ja, freigeben' : 'Ablehnen'
        );
        return [
            h('h3', {}, freigeben ? 'Wirklich freigeben?' : 'Bitte ablehnen?'),
            h('p', {}, freigeben ? e.was + '.' : 'Es bleibt alles, wie es ist. Der KI-Helfer sieht deine Antwort.'),
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'bitte-notiz' }, 'Notiz an den KI-Helfer'),
                notiz,
                h('small', {}, 'Freiwillig.')
            ),
            fehler,
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });

const bitteKarte = e =>
    h(
        'div',
        { class: 'bp-karte eng wartet-karte', id: 'bitte-' + e.id },
        h(
            'div',
            { class: 'zeile-text' },
            h('b', {}, e.was),
            e.ausnahmen.length ? h('span', {}, 'Bleibt, wie es ist: ' + e.ausnahmen.join(', ')) : null,
            e.grund ? h('span', { class: 'leise' }, 'Begründung: ' + e.grund) : null,
            h('span', { class: 'leise' }, e.stand + ', Anfrage von ' + e.von + ', ' + e.wann),
            darfFreigeben() ? null : h('span', { class: 'leise' }, 'Zum Freigeben brauchst du ein Konto.')
        ),
        h(
            'div',
            { class: 'zeile-knopf' },
            ansehenLink(e),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'ablehnen-' + e.id,
                    type: 'button',
                    onclick: () => bitteEntscheidenOeffnen(e, false)
                },
                'Ablehnen'
            ),
            darfFreigeben()
                ? h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-p',
                          id: 'freigeben-' + e.id,
                          type: 'button',
                          onclick: () => bitteEntscheidenOeffnen(e, true)
                      },
                      'Freigeben'
                  )
                : null
        )
    );

// Die Bilder werden mit den eigenen Rechten geholt und nur in einem <img> gezeigt,
// so kann in einer fremden Datei nichts ausgeführt werden. Pro Upload nur einmal laden
const uploadBilder = new Map();

const bildVergessen = id => {
    if (uploadBilder.has(id)) URL.revokeObjectURL(uploadBilder.get(id));
    uploadBilder.delete(id);
};

const uploadBild = e => {
    const box = h('div', { class: 'upload-bild', 'aria-hidden': 'true' }, ikon('datei'));
    if (!e.bild) return box;
    const zeigen = adresse => box.replaceChildren(h('img', { src: adresse, alt: '' }));
    if (uploadBilder.has(e.id)) zeigen(uploadBilder.get(e.id));
    else {
        api.blob('/api/objects/' + e.id + '/file/content').then(antwort => {
            if (!antwort.ok) return;
            uploadBilder.set(e.id, URL.createObjectURL(antwort.blob));
            zeigen(uploadBilder.get(e.id));
        });
    }
    return box;
};

// Führt eine Entscheidung zu einem Upload aus. Der Knopf bleibt gesperrt, bis die Antwort da ist
const uploadAktion = async (knopf, e, anfrage, erfolg) => {
    knopf.disabled = true;
    const antwort = await anfrage();
    if (!antwort.ok) {
        meldung('Das hat nicht geklappt', antwort.error, 'kreuz');
        knopf.disabled = false;
        return;
    }
    bildVergessen(e.id);
    meldung(erfolg, e.website);
    await neuLaden();
};

const uploadLoeschenOeffnen = e =>
    dialog(({ zu }) => {
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-gefahr',
                id: 'upload-loeschen-ja',
                type: 'button',
                onclick: async () => {
                    zu();
                    await uploadAktion(knopf, e, () => api.del('/api/objects/' + e.id), 'Gelöscht');
                }
            },
            'Endgültig löschen'
        );
        return [
            h('h3', {}, 'Diesen Upload löschen?'),
            h('p', {}, e.was + '. Das lässt sich nicht rückgängig machen.'),
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });

const uploadKarte = e =>
    h(
        'div',
        { class: 'bp-karte eng wartet-karte', id: 'bitte-' + e.id },
        uploadBild(e),
        h(
            'div',
            { class: 'zeile-text' },
            h('b', {}, e.was),
            e.name ? h('span', { class: 'leise' }, 'Name: ' + e.name) : null,
            e.hinweis ? h('span', {}, e.hinweis) : null,
            h('span', { class: 'leise' }, e.wann),
            darfFreigeben() ? null : h('span', { class: 'leise' }, 'Zum Freigeben brauchst du ein Konto.')
        ),
        h(
            'div',
            { class: 'zeile-knopf' },
            ansehenLink(e),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'upload-loeschen-' + e.id,
                    type: 'button',
                    onclick: () => uploadLoeschenOeffnen(e)
                },
                'Löschen'
            ),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'upload-privat-' + e.id,
                    type: 'button',
                    onclick: ereignis =>
                        uploadAktion(
                            ereignis.currentTarget,
                            e,
                            () => api.post('/api/uploads/' + e.id + '/keep', {}),
                            'Bleibt privat'
                        )
                },
                'Privat behalten'
            ),
            darfFreigeben()
                ? h(
                      'button',
                      {
                          class: 'bp-btn bp-btn-p',
                          id: 'freigeben-' + e.id,
                          type: 'button',
                          onclick: ereignis =>
                              uploadAktion(
                                  ereignis.currentTarget,
                                  e,
                                  () => api.post('/api/uploads/' + e.id + '/approve', { visibility: 'public' }),
                                  'Freigegeben'
                              )
                      },
                      'Freigeben'
                  )
                : null
        )
    );

// Annehmen ändert, auf wessen Kontingent die Website zählt: darum eine Rückfrage, die das genau sagt
const uebergabeAnnehmenOeffnen = e =>
    dialog(({ zu }) => {
        const knopf = h(
            'button',
            {
                class: 'bp-btn bp-btn-p',
                id: 'uebergabe-annehmen-ja',
                type: 'button',
                onclick: async () => {
                    zu();
                    await uploadAktion(
                        knopf,
                        e,
                        () => api.post('/api/websites/uebergaben/' + e.id + '/annehmen', {}),
                        'Übernommen'
                    );
                }
            },
            'Ja, übernehmen'
        );
        return [
            h('h3', {}, 'Website übernehmen?'),
            h(
                'p',
                {},
                '«' +
                    e.website +
                    '» zählt danach auf dein Kontingent. Die Person, die sie dir gibt, und ihre KI-Helfer verlieren den Zugriff.'
            ),
            h(
                'div',
                { class: 'bp-dialog-fuss' },
                h('button', { class: 'bp-btn bp-btn-o', type: 'button', onclick: zu }, 'Abbrechen'),
                knopf
            )
        ];
    });

const uebergabeKarte = e =>
    h(
        'div',
        { class: 'bp-karte eng wartet-karte', id: 'bitte-' + e.id },
        h(
            'div',
            { class: 'zeile-text' },
            h('b', {}, e.was),
            h('span', { class: 'leise' }, 'Anfrage von ' + e.von + ', ' + e.wann)
        ),
        h(
            'div',
            { class: 'zeile-knopf' },
            h('a', { class: 'bp-btn bp-btn-o', id: 'ansehen-' + e.id, href: '#/website/' + e.ziel }, 'Ansehen'),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-o',
                    id: 'ablehnen-' + e.id,
                    type: 'button',
                    onclick: ereignis =>
                        uploadAktion(
                            ereignis.currentTarget,
                            e,
                            () => api.post('/api/websites/uebergaben/' + e.id + '/ablehnen', {}),
                            'Abgelehnt'
                        )
                },
                'Ablehnen'
            ),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    id: 'annehmen-' + e.id,
                    type: 'button',
                    onclick: () => uebergabeAnnehmenOeffnen(e)
                },
                'Annehmen'
            )
        )
    );

// Eine wartende Entscheidung, gleich in der Liste und auf der Seite der Website
export const wartetKarte = e =>
    e.typ === 'upload' ? uploadKarte(e) : e.typ === 'uebergabe' ? uebergabeKarte(e) : bitteKarte(e);

const ladeFehler = () =>
    h(
        'div',
        { class: 'bp-hinweis bp-h-gefahr mit-knopf', id: 'wartet-fehler' },
        h('span', {}, 'Es konnte nicht alles geladen werden. Vielleicht wartet noch mehr auf dich.'),
        h('button', { class: 'bp-btn bp-btn-o bp-btn-klein', type: 'button', onclick: neuLaden }, 'Nochmals versuchen')
    );

export const seiteWartet = () => {
    const fehler = DATEN.wartetFehler ? ladeFehler() : null;
    if (!DATEN.wartet.length) {
        // Nach einem Ladefehler darf hier nicht «Alles erledigt» stehen
        if (fehler) return fehler;
        return h(
            'div',
            { class: 'bp-karte' },
            leer('haken', 'Alles erledigt', 'Wenn ein KI-Helfer dich um etwas bittet, steht es hier.')
        );
    }
    return h(
        'div',
        { class: 'stapel wartet-liste' },
        fehler,
        DATEN.wartet.map(wartetKarte),
        h('span', { class: 'leise' }, 'Offene Bitten verfallen nach 30 Tagen.')
    );
};
