// Rechnet die Antworten des Backends in das um, was die Seite einer Website zeigt.
// Hier stehen nur reine Funktionen ohne Browser, darum sind sie in tests/neuWebsite.test.mjs geprüft.
import { timeAgo, formatNumber } from '../../js/core/format.js';
import { formatBytes } from '../../js/core/site.js';
import { VISIBILITY_SENTENCE, partKind, problemsText } from '../../js/core/view.js';

// Die Code-Arten in fester Reihenfolge, mit dem Namen, der auf dem Knopf steht
const CODE_ARTEN = [
    ['html', 'HTML'],
    ['css', 'CSS'],
    ['javascript', 'JavaScript'],
    ['ssf', 'SSF'],
    ['library', 'Bibliothek'],
    ['syntax', 'DNA'],
    ['data', 'Daten'],
    ['werkzeug', 'Werkzeug']
];
const ART_NAME = new Map(CODE_ARTEN);
const ART_RANG = new Map(CODE_ARTEN.map(([art], i) => [art, i]));

export const codeArtName = art => ART_NAME.get(art) || String(art);

// Alle Code-Arten, die in irgendeiner Version vorkommen. Unbekannte Arten kommen ans Ende
export const artenAusVersionen = versionen => {
    const arten = new Set((versionen || []).flatMap(v => (Array.isArray(v.types) ? v.types : [])));
    const rang = art => (ART_RANG.has(art) ? ART_RANG.get(art) : CODE_ARTEN.length);
    return [...arten].sort((a, b) => rang(a) - rang(b) || String(a).localeCompare(String(b)));
};

// Nur die Versionen, in denen diese Code-Art wirklich gespeichert wurde
export const versionenMitArt = (versionen, art) =>
    (versionen || []).filter(v => Array.isArray(v.types) && v.types.includes(art));

// Code als Text. Die DNA und andere JSON-Arten können als Objekt ankommen
export const codeAlsText = wert => {
    if (wert === null || wert === undefined) return '';
    return typeof wert === 'string' ? wert : JSON.stringify(wert, null, 2);
};

// Wie viele Zeilen die Seite höchstens zeigt, damit der Browser nicht hängen bleibt
export const MAX_CODE_ZEILEN = 5000;
// Grösster Vergleich (Zeilen alt mal Zeilen neu), der noch schnell genug geht
const MAX_VERGLEICH = 4_000_000;

// Vergleicht zwei Fassungen Zeile für Zeile.
// Ergebnis: [{ art: 'gleich' | 'dazu' | 'weg', text }], in der Reihenfolge der Datei
export const zeilenVergleich = (altText, neuText) => {
    const alt = String(altText ?? '').split('\n');
    const neu = String(neuText ?? '').split('\n');
    // Gleicher Anfang und gleiches Ende müssen nicht verglichen werden
    let anfang = 0;
    while (anfang < alt.length && anfang < neu.length && alt[anfang] === neu[anfang]) anfang++;
    let ende = 0;
    while (
        ende < alt.length - anfang &&
        ende < neu.length - anfang &&
        alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]
    ) {
        ende++;
    }
    const a = alt.slice(anfang, alt.length - ende);
    const b = neu.slice(anfang, neu.length - ende);
    const zeilen = art => text => ({ art, text });
    const kopf = neu.slice(0, anfang).map(zeilen('gleich'));
    const fuss = neu.slice(neu.length - ende).map(zeilen('gleich'));
    const n = a.length;
    const m = b.length;
    // Zu gross zum genauen Vergleich: alles alte weg, alles neue dazu. Lieber grob als hängen
    if (!n || !m || n * m > MAX_VERGLEICH) {
        return [...kopf, ...a.map(zeilen('weg')), ...b.map(zeilen('dazu')), ...fuss];
    }
    // Längste gemeinsame Folge von Zeilen, von hinten her gerechnet
    const breite = m + 1;
    const tabelle = new Uint16Array((n + 1) * breite);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            tabelle[i * breite + j] =
                a[i] === b[j]
                    ? tabelle[(i + 1) * breite + j + 1] + 1
                    : Math.max(tabelle[(i + 1) * breite + j], tabelle[i * breite + j + 1]);
        }
    }
    const mitte = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            mitte.push({ art: 'gleich', text: b[j] });
            i++;
            j++;
        } else if (tabelle[(i + 1) * breite + j] >= tabelle[i * breite + j + 1]) {
            mitte.push({ art: 'weg', text: a[i++] });
        } else {
            mitte.push({ art: 'dazu', text: b[j++] });
        }
    }
    while (i < n) mitte.push({ art: 'weg', text: a[i++] });
    while (j < m) mitte.push({ art: 'dazu', text: b[j++] });
    return [...kopf, ...mitte, ...fuss];
};

// Pfade wie ['0', '3', '1'] der Reihe nach, Eltern vor ihren Kindern
const pfadVergleich = (a, b) => {
    const x = a.path || [];
    const y = b.path || [];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const d = Number(x[i]) - Number(y[i]);
        if (d) return d;
    }
    return x.length - y.length;
};

// Teile, die nur Daten oder eine Datei enthalten, haben keinen Code zum Anschauen
const ohneCode = teil => !teil.types?.length && (teil.hasFile || teil.dataRows > 0);

// Die Liste links im Reiter Code: die Website selbst und alle Teile, auf jeder Ebene.
// Geht die Objekt-Liste nicht, bleiben wenigstens die direkten Teile der Website
export const codeTeile = (site, objekte, name) => {
    const wurzel = { uuid: site.uuid, name: 'Wurzel', tiefe: 0 };
    const direkte = new Map((site.parts || []).map(t => [t.uuid, t]));
    const passt = t => !t || !ohneCode(t);
    const unten = (Array.isArray(objekte) ? objekte : []).filter(o => o && !o.domain && o.domain_ref === site.name);
    if (!unten.length) {
        return [
            wurzel,
            ...[...direkte.values()].filter(passt).map(t => ({ uuid: t.uuid, name: String(t.name), tiefe: 1 }))
        ];
    }
    return [
        wurzel,
        ...unten
            .filter(o => passt(direkte.get(o.uuid)))
            .sort(pfadVergleich)
            .map(o => ({
                uuid: o.uuid,
                name: String(direkte.get(o.uuid)?.name || name(o)),
                tiefe: Math.max(1, (o.path || []).length - 1)
            }))
    ];
};

// Teile mit Datensätzen und Teile mit einer Datei
export const datenTeile = site => (site.parts || []).filter(t => t.dataRows > 0);
export const dateiTeile = site => (site.parts || []).filter(t => t.hasFile);

// Datensätze, die nicht in den direkten Teilen liegen, sondern tiefer oder in der Wurzel
export const datenAnderswo = site => {
    const inTeilen = datenTeile(site).reduce((summe, t) => summe + t.dataRows, 0);
    return Math.max(0, (site.storage?.dataRows || 0) - inTeilen);
};

// Die Spalten der Tabelle: alle Felder der Datensätze, ohne die internen _sys-Felder
export const datenSpalten = zeilen => {
    const spalten = new Set();
    for (const zeile of zeilen || []) {
        for (const feld of Object.keys(zeile || {})) if (!feld.startsWith('_sys')) spalten.add(feld);
    }
    return [...spalten];
};

const MAX_ZELLE = 200;

// Ein Wert als Text für die Tabelle, lange Werte gekürzt
export const zelleText = wert => {
    if (wert === null || wert === undefined) return '';
    const text = typeof wert === 'object' ? JSON.stringify(wert) : String(wert);
    return text.length > MAX_ZELLE ? text.slice(0, MAX_ZELLE) + '…' : text;
};

// Gibt es noch eine nächste Seite? Ist die Zahl gedeckelt, entscheidet, ob die Seite voll war
export const hatWeiter = (meta, seite, proSeite) => {
    if (!meta) return false;
    if (meta.total_count_capped) return meta.returned_count >= proSeite;
    return seite * proSeite < (meta.total_count || 0);
};

// Backend-Grenze für die Teile auf der Website-Seite (SYSTEM.websites.maxParts)
const MAX_TEILE = 100;
export const teileGekappt = site => (site.parts || []).length >= MAX_TEILE;

// Wahl beim Veröffentlichen. Nicht vorgewählt sind Teile, die jemand bewusst auf «nur Angemeldete»
// gestellt hat, und reine Datenspeicher: Sie gehören nicht zu dem, was Besucher sehen sollen
export const veroeffentlichenWahl = site =>
    (site.parts || []).map(t => {
        const art = partKind(t);
        const beibehalten = t.visibility === 'members' || art === 'Daten';
        return {
            uuid: t.uuid,
            name: String(t.name),
            art,
            sichtbar: t.visibility,
            an: !beibehalten,
            grund: t.visibility === 'members' ? 'nur Angemeldete' : art === 'Daten' ? 'Datenspeicher' : null
        };
    });

// Was ans Backend geht: alles darunter öffentlich, ausser den nicht angekreuzten Teilen
export const veroeffentlichenAuftrag = wahl => ({
    visibility: 'public',
    includeChildren: true,
    except: wahl.filter(t => !t.an).map(t => t.uuid)
});

// Veröffentlichen dürfen nur angemeldete Menschen mit blue, und nur wenn es noch nicht geschehen ist
export const darfVeroeffentlichen = (site, artDesMenschen, bitteOffen) =>
    Boolean(site.rights?.grant) && artDesMenschen === 'user' && site.visibility !== 'public' && !bitteOffen;

// Adresse für «Website öffnen». Nur http und https, nie etwas anderes als Link
export const websiteLink = site => {
    if (site.customHost) {
        const host = String(site.customHost).replace(/^https?:\/\//, '');
        return 'https://' + host;
    }
    return /^https?:\/\//.test(String(site.address || '')) ? String(site.address) : null;
};

const SICHERUNG_ART = { nightly: 'nachts', manual: 'von Hand' };

// Die Zeilen der Karte «Zustand». Was man nicht sehen darf, kommt als null und fällt weg
export const zustandZeilen = (site, jetzt = Date.now()) => {
    const speicher = site.storage || {};
    const sicherung = site.backups;
    return [
        ['Sichtbar für', VISIBILITY_SENTENCE[site.visibility] || VISIBILITY_SENTENCE.private],
        ['Zuletzt geändert', site.lastChange ? timeAgo(site.lastChange, jetzt) : 'Noch nichts geändert'],
        site.liveNow === null || site.liveNow === undefined
            ? null
            : ['Live gerade', site.liveNow === 1 ? '1 Verbindung' : formatNumber(site.liveNow) + ' Verbindungen'],
        ['Dateien', formatNumber(speicher.files || 0) + ', ' + formatBytes(speicher.fileBytes || 0)],
        ['Datensätze', formatNumber(speicher.dataRows || 0)],
        problemsText(site.problems24h) ? ['Probleme', problemsText(site.problems24h)] : null,
        sicherung
            ? [
                  'Letzte Sicherung',
                  sicherung.latestAt
                      ? timeAgo(sicherung.latestAt, jetzt) +
                        (SICHERUNG_ART[sicherung.latestKind] ? ', ' + SICHERUNG_ART[sicherung.latestKind] : '')
                      : 'Noch keine'
              ]
            : null
    ].filter(Boolean);
};
