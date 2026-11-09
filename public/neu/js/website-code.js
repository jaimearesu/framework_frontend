// Reiter «Code»: Links alle Teile der Website, rechts der Code mit seinen früheren Versionen.
// Nur lesen. Geändert wird der Code von KI-Helfern oder in der Werkstatt.
import { api } from '../../js/core/api.js';
import { timeAgo } from '../../js/core/format.js';
import { loadObjectNames, loadObjects, objectLabel } from '../../js/core/objects.js';
import { h, ikon, huelle, laedtBalken } from './ui.js';
import {
    MAX_CODE_ZEILEN,
    artenAusVersionen,
    codeAlsText,
    codeArtName,
    codeTeile,
    versionenMitArt,
    zeilenVergleich
} from './website-werte.js';

// Die Teile-Liste kommt aus der Objekt-Liste und wird pro Website einmal geladen
const liste = { id: null, teile: null };

// Geladener Code, damit Hin- und Herschalten sofort geht. Alte Versionen ändern sich nie
const codeSpeicher = new Map();

// Was rechts gewählt ist. Beim Wechsel auf einen anderen Teil fängt es neu an
const auswahl = { teil: null, art: null, schritt: null, vergleichen: false };

const teileLaden = async site => {
    const objekte = await loadObjects();
    if (objekte.ok) await loadObjectNames(objekte.data);
    liste.id = site.uuid;
    liste.teile = codeTeile(site, objekte.ok ? objekte.data : [], objectLabel);
};

const versionenHolen = async uuid => {
    const antwort = await api.get('/api/ast/' + uuid + '/versions');
    return antwort.ok ? { versionen: antwort.data?.data || [] } : { fehler: antwort.error || true };
};

// Der ganze Code eines Teils bei einer Version
const standHolen = async (uuid, schritt) => {
    const schluessel = uuid + '|' + schritt;
    if (codeSpeicher.has(schluessel)) return codeSpeicher.get(schluessel);
    const antwort = await api.get('/api/ast/' + uuid + '/versions/' + schritt);
    if (!antwort.ok) return null;
    // Nicht endlos wachsen: Der älteste Eintrag fällt weg
    if (codeSpeicher.size >= 60) codeSpeicher.delete(codeSpeicher.keys().next().value);
    codeSpeicher.set(schluessel, antwort.data?.data || {});
    return codeSpeicher.get(schluessel);
};

const hinweisKarte = text => h('div', { class: 'bp-karte code-karte' }, h('p', { class: 'code-leer leise' }, text));

const codeZeilen = zeilen =>
    zeilen.slice(0, MAX_CODE_ZEILEN).map(z => {
        if (z.art === 'gleich') return h('span', {}, z.text);
        return h('span', { class: z.art }, (z.art === 'dazu' ? '+ ' : '- ') + z.text);
    });

// Füllt die rechte Seite, ohne die ganze Seite neu zu zeichnen
const rechtsFuellen = async (flaeche, uuid, zuletzt) => {
    const dieser = ++zuletzt.lauf;
    const aktuell = () => dieser === zuletzt.lauf;
    flaeche.replaceChildren(h('div', { class: 'bp-karte code-karte' }, laedtBalken()));
    if (!zuletzt.versionen) {
        const geholt = await versionenHolen(uuid);
        if (!aktuell()) return;
        if (geholt.fehler) {
            flaeche.replaceChildren(hinweisKarte('Der Code konnte nicht geladen werden.'));
            return;
        }
        zuletzt.versionen = geholt.versionen;
    }
    const arten = artenAusVersionen(zuletzt.versionen);
    if (!arten.length) {
        flaeche.replaceChildren(hinweisKarte('Dieser Teil hat noch keinen Code.'));
        return;
    }
    if (!arten.includes(auswahl.art)) auswahl.art = arten[0];
    const passende = versionenMitArt(zuletzt.versionen, auswahl.art);
    if (!passende.some(v => v.step === auswahl.schritt)) auswahl.schritt = passende[0].step;
    const version = passende.find(v => v.step === auswahl.schritt);
    const vorherige = passende[passende.indexOf(version) + 1] || null;
    const vergleich = auswahl.vergleichen && vorherige;
    const [jetzt, davor] = await Promise.all([
        standHolen(uuid, version.step),
        vergleich ? standHolen(uuid, vorherige.step) : null
    ]);
    if (!aktuell()) return;
    if (!jetzt || (vergleich && !davor)) {
        flaeche.replaceChildren(hinweisKarte('Diese Version konnte nicht geladen werden.'));
        return;
    }
    const text = codeAlsText(jetzt[auswahl.art]);
    const zeilen = vergleich
        ? zeilenVergleich(codeAlsText(davor[auswahl.art]), text)
        : text.split('\n').map(z => ({ art: 'gleich', text: z }));
    const neuZeichnen = () => rechtsFuellen(flaeche, uuid, zuletzt);
    flaeche.replaceChildren(
        h(
            'div',
            { class: 'bp-karte code-karte', id: 'code-karte' },
            arten.length > 1
                ? h(
                      'div',
                      { class: 'code-arten' },
                      h(
                          'div',
                          { class: 'bp-segment', role: 'tablist', 'aria-label': 'Code-Art' },
                          arten.map(art =>
                              h(
                                  'button',
                                  {
                                      type: 'button',
                                      role: 'tab',
                                      'aria-selected': art === auswahl.art ? 'true' : 'false',
                                      onclick: () => {
                                          auswahl.art = art;
                                          auswahl.schritt = null;
                                          auswahl.vergleichen = false;
                                          neuZeichnen();
                                      }
                                  },
                                  codeArtName(art)
                              )
                          )
                      )
                  )
                : null,
            h(
                'div',
                { class: 'code-kopf' },
                h(
                    'span',
                    { class: 'leise', id: 'code-stand' },
                    codeArtName(auswahl.art) + ', gespeichert ' + timeAgo(version.at)
                ),
                h(
                    'div',
                    { class: 'zeile-knopf' },
                    vorherige
                        ? h(
                              'button',
                              {
                                  class: 'bp-btn bp-btn-o bp-btn-klein',
                                  id: 'code-vergleich',
                                  type: 'button',
                                  onclick: () => {
                                      auswahl.vergleichen = !auswahl.vergleichen;
                                      neuZeichnen();
                                  }
                              },
                              auswahl.vergleichen ? 'Vergleich aus' : 'Mit Version ' + vorherige.step + ' vergleichen'
                          )
                        : null,
                    h(
                        'select',
                        {
                            class: 'bp-in',
                            id: 'code-version',
                            'aria-label': 'Version',
                            onchange: e => {
                                auswahl.schritt = Number(e.target.value);
                                neuZeichnen();
                            }
                        },
                        passende.map(v =>
                            h('option', { value: v.step, selected: v.step === auswahl.schritt }, 'Version ' + v.step)
                        )
                    )
                )
            ),
            zeilen.length > MAX_CODE_ZEILEN
                ? h(
                      'div',
                      { class: 'bp-hinweis bp-h-info' },
                      'Dieser Code ist sehr lang. Hier stehen die ersten ' + MAX_CODE_ZEILEN + ' Zeilen.'
                  )
                : null,
            h('pre', { class: 'code-text mono' }, codeZeilen(zeilen))
        )
    );
};

export const reiterCode = (w, site, teilUuid) => {
    if (liste.id !== site.uuid) {
        liste.id = site.uuid;
        liste.teile = null;
        // Erst laden, dann die Seite nochmals zeichnen
        teileLaden(site).then(() => huelle.neu());
    }
    const teile = liste.teile || [{ uuid: site.uuid, name: 'Wurzel', tiefe: 0 }];
    const teil = teile.find(t => t.uuid === teilUuid) || teile[0];
    if (auswahl.teil !== teil.uuid) {
        auswahl.teil = teil.uuid;
        auswahl.art = null;
        auswahl.schritt = null;
        auswahl.vergleichen = false;
    }
    const flaeche = h('div', {});
    rechtsFuellen(flaeche, teil.uuid, { lauf: 0, versionen: null });
    return h(
        'div',
        { class: 'code-raster' },
        h(
            'div',
            { class: 'bp-karte eng baum', id: 'code-teile' },
            teile.map(t =>
                h(
                    'button',
                    {
                        type: 'button',
                        class: t.uuid === teil.uuid ? 'aktiv' : null,
                        style: t.tiefe > 1 ? 'padding-left:' + (t.tiefe - 1) * 14 + 'px' : null,
                        onclick: () => {
                            location.hash = '#/website/' + w.id + '/code/' + t.uuid;
                        }
                    },
                    ikon('datei'),
                    h('span', { class: 'baum-name' }, t.name)
                )
            )
        ),
        flaeche
    );
};
