// Namen und Profilbilder (Plan "N", Stufe 1, 12.11.2026, Wunsch von Jaime «das übliche Profildesign»):
//   - profilBild(): rundes Bild oder Initialen – im Konto, bei den Personen einer Website
//   - profilKopf(): der Kopf oben im Konto (grosses Bild, Name, @name)
//   - profilBereich(): Konto → Profil, dort Name, Anzeigename und Bild ändern
//   - nameFragenWennNoetig(): beim ersten Öffnen einmal freundlich nach einem @namen fragen
// Alles nur für angemeldete Menschen. Texte immer über h()/textContent (nie innerHTML).
import { h, ikon, dialog, meldung, huelle, kopierZeile, laedtBalken } from './ui.js';
import { auswahlListe, gewaehlteUuids, seitenAdresse } from './profil-seite-werte.js';
import { api } from '../../js/core/api.js';
import { DATEN } from './daten.js';
import { initialen, profilTitel, nameNormal, nameFormFehler, wechselText, sollNameFragen } from './profil-werte.js';

// Bilder nur einmal holen: pro Konto und Stand ein Versprechen auf eine blob:-Adresse
const bilder = new Map();
const bildAdresse = (uuid, stand) => {
    const schluessel = uuid + '|' + (stand || '');
    if (!bilder.has(schluessel)) {
        bilder.set(
            schluessel,
            api
                .blob('/api/profil/' + uuid + '/bild')
                .then(a => (a.ok && a.blob ? URL.createObjectURL(a.blob) : null))
                .catch(() => null)
        );
    }
    return bilder.get(schluessel);
};

/**
 * Rundes Profilbild. Ohne Bild (oder solange es lädt) stehen die Initialen da.
 * groesse: 'klein' (Listen) | 'mittel' | 'gross' (Profil-Kopf)
 */
export const profilBild = ({ uuid, hatBild, stand = null, name = {}, groesse = 'klein' }) => {
    const kreis = h(
        'span',
        { class: 'profilbild profilbild-' + groesse, 'aria-hidden': 'true' },
        h('span', { class: 'profilbild-init' }, initialen(name))
    );
    if (hatBild && uuid) {
        bildAdresse(uuid, stand).then(adresse => {
            if (!adresse) return;
            kreis.replaceChildren(h('img', { src: adresse, alt: '', decoding: 'async' }));
        });
    }
    return kreis;
};

// Mein eigenes Bild (Stand aus DATEN.profil)
const meinBild = groesse =>
    profilBild({
        uuid: DATEN.mensch.id,
        hatBild: Boolean(DATEN.profil?.hasAvatar),
        stand: DATEN.profil?.avatarAt,
        name: { ...(DATEN.profil || {}), vorname: DATEN.mensch.name },
        groesse
    });

// Nach dem Speichern: neuen Stand merken und die Seite neu zeichnen
const merken = profil => {
    DATEN.profil = profil;
    huelle.neu();
};

/** Kopf oben im Konto: grosses Bild, Name, @name und ein Knopf zum Bearbeiten */
export const profilKopf = () => {
    if (!DATEN.profil) return null;
    const p = DATEN.profil;
    return h(
        'div',
        { class: 'bp-karte profil-kopf', id: 'profil-kopf' },
        meinBild('gross'),
        h(
            'div',
            { class: 'profil-kopf-text' },
            h('b', { class: 'profil-kopf-name' }, profilTitel(p, DATEN.mensch.name)),
            p.handle
                ? h('span', { class: 'leise mono', id: 'profil-handle' }, '@' + p.handle)
                : h('span', { class: 'leise' }, 'Noch kein @name – damit dich andere finden.')
        ),
        h('a', { class: 'bp-btn bp-btn-o', href: '#/konto/profil', id: 'profil-bearbeiten' }, 'Profil bearbeiten')
    );
};

// Feld für den @namen mit Prüfung beim Tippen: Form sofort, «frei?» nach einer kurzen Pause
const nameFeld = ({ wert, onWert }) => {
    const hinweis = h('small', { class: 'profil-hinweis', id: 'profil-name-hinweis' }, '3–30 Zeichen: a–z, 0–9, -');
    let warten = null;
    let zaehler = 0;
    const pruefen = async text => {
        const eigene = ++zaehler;
        const formFehler = nameFormFehler(text);
        hinweis.className = 'profil-hinweis';
        if (formFehler || !nameNormal(text)) {
            hinweis.textContent = formFehler || '3–30 Zeichen: a–z, 0–9, -';
            if (formFehler) hinweis.classList.add('fehler');
            return;
        }
        if (nameNormal(text) === DATEN.profil?.handle) {
            hinweis.textContent = 'Das ist dein Name.';
            return;
        }
        hinweis.textContent = 'Wird geprüft…';
        const antwort = await api.get('/api/profil/name-frei?name=' + encodeURIComponent(nameNormal(text)));
        if (eigene !== zaehler) return; // inzwischen weiter getippt
        if (!antwort.ok) {
            hinweis.textContent = antwort.error;
            return;
        }
        const d = antwort.data.data;
        hinweis.textContent = d.frei ? '@' + d.name + ' ist frei.' : d.grund;
        hinweis.classList.add(d.frei ? 'ok' : 'fehler');
    };
    const feld = h(
        'div',
        { class: 'profil-name-feld' },
        h('span', { class: 'profil-at', 'aria-hidden': 'true' }, '@'),
        h('input', {
            id: 'profil-name',
            class: 'bp-in mono',
            value: wert || '',
            maxlength: 31,
            autocomplete: 'off',
            autocapitalize: 'none',
            spellcheck: 'false',
            'data-fokus': true,
            'aria-describedby': 'profil-name-hinweis',
            oninput: e => {
                onWert(e.target.value);
                clearTimeout(warten);
                warten = setTimeout(() => pruefen(e.target.value), 350);
            }
        })
    );
    return { feld, hinweis };
};

// Profilbild wählen, hochladen oder entfernen
const bildKarte = () => {
    const p = DATEN.profil || {};
    const status = h('small', { class: 'leise' }, 'JPG, PNG, WebP oder GIF, höchstens 5 MB. Wird rund zugeschnitten.');
    const auswahl = h('input', {
        type: 'file',
        accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
        id: 'profil-bild-datei',
        hidden: true,
        onchange: async e => {
            const datei = e.target.files && e.target.files[0];
            if (!datei) return;
            if (datei.size > 5 * 1024 * 1024) {
                status.textContent = 'Das Bild ist zu gross (max. 5 MB).';
                return;
            }
            status.textContent = 'Wird hochgeladen…';
            const antwort = await api.upload('/api/profil/bild', datei);
            if (!antwort.ok) {
                status.textContent = antwort.error;
                return;
            }
            meldung('Profilbild gespeichert');
            merken(antwort.data.data);
        }
    });
    return h(
        'div',
        { class: 'bp-karte stapel', id: 'profil-bild-karte' },
        h('h3', {}, 'Profilbild'),
        h(
            'div',
            { class: 'profil-bild-zeile' },
            meinBild('mittel'),
            h(
                'div',
                { class: 'knopf-reihe' },
                auswahl,
                h(
                    'button',
                    {
                        class: 'bp-btn bp-btn-o',
                        type: 'button',
                        id: 'profil-bild-waehlen',
                        onclick: () => auswahl.click()
                    },
                    p.hasAvatar ? 'Anderes Bild' : 'Bild wählen'
                ),
                p.hasAvatar
                    ? h(
                          'button',
                          {
                              class: 'bp-btn bp-btn-o',
                              type: 'button',
                              id: 'profil-bild-weg',
                              onclick: async () => {
                                  const antwort = await api.del('/api/profil/bild');
                                  if (!antwort.ok) return meldung('Ging nicht', antwort.error, 'kreuz');
                                  meldung('Profilbild entfernt');
                                  merken(antwort.data.data);
                              }
                          },
                          'Entfernen'
                      )
                    : null
            )
        ),
        status
    );
};

/** Konto → Profil: Namen und Bild ändern */
export const profilBereich = () => {
    const p = DATEN.profil || {};
    const stand = { handle: p.handle || '', anzeige: p.displayName || '', fehler: '', arbeitet: false };
    const { feld, hinweis } = nameFeld({ wert: stand.handle, onWert: w => (stand.handle = w) });
    const gesperrt = wechselText(p);
    const fehler = h('div', { class: 'bp-hinweis bp-h-gefahr', id: 'profil-fehler', hidden: true });
    const knopf = h('button', { class: 'bp-btn bp-btn-p', type: 'button', id: 'profil-speichern' }, 'Speichern');
    knopf.onclick = async () => {
        const koerper = { displayName: stand.anzeige.trim() || null };
        if (nameNormal(stand.handle) && nameNormal(stand.handle) !== p.handle) {
            const formFehler = nameFormFehler(stand.handle);
            if (formFehler) {
                fehler.textContent = formFehler;
                fehler.hidden = false;
                return;
            }
            koerper.handle = nameNormal(stand.handle);
        }
        knopf.disabled = true;
        knopf.textContent = 'Einen Moment…';
        const antwort = await api.put('/api/profil', koerper);
        knopf.disabled = false;
        knopf.textContent = 'Speichern';
        if (!antwort.ok) {
            fehler.textContent = antwort.error;
            fehler.hidden = false;
            return;
        }
        meldung('Profil gespeichert');
        merken(antwort.data.data);
    };
    const nameInput = feld.querySelector('input');
    if (gesperrt) nameInput.disabled = true;
    return h(
        'div',
        { class: 'stapel', id: 'profil-bereich' },
        h(
            'div',
            { class: 'bp-karte stapel', id: 'profil-namen' },
            h('h3', {}, 'Name'),
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'profil-name' }, 'Dein @name'),
                feld,
                gesperrt ? h('small', { class: 'leise' }, gesperrt) : hinweis,
                h(
                    'small',
                    { class: 'leise' },
                    'Wer mit dir eine Website teilt, sieht diesen Namen. So kann man dir Zugriff geben, ohne deine ID zu kennen.'
                )
            ),
            h(
                'div',
                { class: 'bp-feld' },
                h('label', { for: 'profil-anzeige' }, 'Anzeigename (freiwillig)'),
                h('input', {
                    id: 'profil-anzeige',
                    class: 'bp-in',
                    value: stand.anzeige,
                    maxlength: 60,
                    placeholder: 'z.B. Captain James T. Kirk',
                    oninput: e => (stand.anzeige = e.target.value)
                })
            ),
            fehler,
            h('div', {}, knopf)
        ),
        bildKarte(),
        oeffentlichKarte()
    );
};

// ---------------------------------------------------------------------
// Öffentliche Profilseite (Plan "N", Stufe 2): vindelis.com/@name
// Aus, bis man sie einschaltet. Ein Satz über mich und welche Websites drauf stehen.
// ---------------------------------------------------------------------
const oeffentlichKarte = () => {
    const p = DATEN.profil || {};
    const adresse = seitenAdresse(location.origin, p.handle);
    const stand = { an: p.publicEnabled === true, bio: p.bio || '', liste: null };
    const fehler = h('div', { class: 'bp-hinweis bp-h-gefahr', id: 'profilseite-fehler', hidden: true });
    const zeigeFehler = text => {
        fehler.textContent = text;
        fehler.hidden = !text;
    };
    const listeBox = h('div', { class: 'stapel', id: 'profilseite-auswahl' }, laedtBalken());

    // Websites laden: meine (mit Rechten und Sichtbarkeit) und die schon gewählten
    const zeichneListe = () => {
        if (!stand.liste) return;
        if (!stand.liste.length) {
            listeBox.replaceChildren(
                h('span', { class: 'leise' }, 'Du verwaltest noch keine Website, die du zeigen könntest.')
            );
            return;
        }
        listeBox.replaceChildren(
            ...stand.liste.map(w =>
                h(
                    'label',
                    { class: 'wahl' + (w.waehlbar ? '' : ' gesperrt') },
                    h('input', {
                        type: 'checkbox',
                        value: w.uuid,
                        checked: w.gewaehlt,
                        disabled: !w.waehlbar,
                        onchange: e => (w.gewaehlt = e.target.checked)
                    }),
                    h(
                        'span',
                        { class: 'zeile-text' },
                        h('b', {}, w.name),
                        w.grund ? h('small', { class: 'leise' }, ' – ' + w.grund) : null
                    )
                )
            )
        );
    };
    Promise.all([api.get('/api/websites'), api.get('/api/profil/websites')]).then(([alle, gewaehlt]) => {
        if (!alle.ok || !gewaehlt.ok) {
            listeBox.replaceChildren(h('span', { class: 'leise' }, alle.error || gewaehlt.error));
            return;
        }
        stand.liste = auswahlListe(
            alle.data.data,
            gewaehlt.data.data.map(w => w.uuid)
        );
        zeichneListe();
    });

    const knopf = h('button', { class: 'bp-btn bp-btn-p', type: 'button', id: 'profilseite-speichern' }, 'Speichern');
    knopf.onclick = async () => {
        zeigeFehler('');
        knopf.disabled = true;
        const profil = await api.put('/api/profil', { publicEnabled: stand.an, bio: stand.bio.trim() || null });
        let sites = { ok: true };
        if (profil.ok && stand.liste)
            sites = await api.put('/api/profil/websites', { sites: gewaehlteUuids(stand.liste) });
        knopf.disabled = false;
        if (!profil.ok) return zeigeFehler(profil.error);
        if (!sites.ok) return zeigeFehler(sites.error);
        meldung(
            stand.an ? 'Profilseite ist online' : 'Profilseite gespeichert',
            stand.an ? adresse : 'Sie ist ausgeschaltet.'
        );
        merken(profil.data.data);
    };

    return h(
        'div',
        { class: 'bp-karte stapel', id: 'profilseite-karte' },
        h('h3', {}, 'Öffentliche Profilseite'),
        h(
            'span',
            { class: 'leise' },
            'Eine Seite für alle, mit Bild, Name, einem Satz und den Websites, die du zeigen willst. Aus, bis du sie einschaltest.'
        ),
        p.handle
            ? h(
                  'label',
                  { class: 'wahl' },
                  h('input', {
                      type: 'checkbox',
                      id: 'profilseite-an',
                      checked: stand.an,
                      onchange: e => (stand.an = e.target.checked)
                  }),
                  h('span', { class: 'zeile-text' }, h('b', {}, 'Profilseite einschalten'))
              )
            : h(
                  'div',
                  { class: 'bp-hinweis bp-h-info' },
                  'Wähl zuerst oben einen @namen – er ist die Adresse der Seite.'
              ),
        adresse && p.publicEnabled ? kopierZeile(adresse) : null,
        h(
            'div',
            { class: 'bp-feld' },
            h('label', { for: 'profilseite-bio' }, 'Ein Satz über dich (freiwillig)'),
            h('textarea', {
                id: 'profilseite-bio',
                class: 'bp-in',
                rows: 2,
                maxlength: 160,
                placeholder: 'z.B. Kapitän der Enterprise. Baue Websites für die Crew.',
                value: stand.bio,
                oninput: e => (stand.bio = e.target.value)
            })
        ),
        h('div', { class: 'bp-feld' }, h('label', {}, 'Diese Websites zeigen'), listeBox),
        fehler,
        h(
            'div',
            { class: 'knopf-reihe' },
            knopf,
            adresse && p.publicEnabled
                ? h(
                      'a',
                      {
                          class: 'bp-btn bp-btn-o',
                          href: adresse,
                          target: '_blank',
                          rel: 'noopener',
                          id: 'profilseite-ansehen'
                      },
                      'Ansehen'
                  )
                : null
        )
    );
};

// ---------------------------------------------------------------------
// Beim ersten Öffnen nach einem Namen fragen (überspringbar, pro Konto nur einmal)
// ---------------------------------------------------------------------
const GEFRAGT = 'neu-profil-gefragt-';
const schonGefragt = () => {
    try {
        return localStorage.getItem(GEFRAGT + DATEN.mensch.id) === '1';
    } catch {
        return true; // ohne Speicher lieber nicht bei jedem Start fragen
    }
};
const gefragtMerken = () => {
    try {
        localStorage.setItem(GEFRAGT + DATEN.mensch.id, '1');
    } catch {
        /* egal */
    }
};

export const nameFragenWennNoetig = () => {
    if (!sollNameFragen({ art: DATEN.mensch.art, profil: DATEN.profil, gefragt: schonGefragt() })) return;
    gefragtMerken();
    const stand = { handle: '' };
    const { feld, hinweis } = nameFeld({ wert: '', onWert: w => (stand.handle = w) });
    const fehler = h('div', { class: 'bp-hinweis bp-h-gefahr', hidden: true });
    dialog(({ zu }) => [
        h('div', { class: 'profil-frage-kopf' }, h('span', { class: 'konto-symbol' }, ikon('konto'))),
        h('h3', {}, 'Wie sollen dich andere finden?'),
        h(
            'p',
            { class: 'leise' },
            'Wähl einen @namen. Wer mit dir eine Website teilt, sieht ihn statt einer langen ID – und kann dir damit Zugriff geben.'
        ),
        h('div', { class: 'bp-feld' }, feld, hinweis),
        fehler,
        h(
            'div',
            { class: 'bp-dialog-fuss' },
            h(
                'button',
                { class: 'bp-btn bp-btn-o', type: 'button', id: 'profil-frage-spaeter', onclick: zu },
                'Später'
            ),
            h(
                'button',
                {
                    class: 'bp-btn bp-btn-p',
                    type: 'button',
                    id: 'profil-frage-ok',
                    onclick: async () => {
                        const formFehler =
                            nameFormFehler(stand.handle) ||
                            (nameNormal(stand.handle) ? '' : 'Bitte gib einen Namen ein.');
                        if (formFehler) {
                            fehler.textContent = formFehler;
                            fehler.hidden = false;
                            return;
                        }
                        const antwort = await api.put('/api/profil', { handle: nameNormal(stand.handle) });
                        if (!antwort.ok) {
                            fehler.textContent = antwort.error;
                            fehler.hidden = false;
                            return;
                        }
                        zu();
                        meldung('Willkommen, @' + antwort.data.data.handle);
                        merken(antwort.data.data);
                    }
                },
                'Name speichern'
            )
        )
    ]);
};
