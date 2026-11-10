// Rechnet die Antworten des Backends in das um, was Kacheln, «Wartet auf mich» und Papierkorb zeigen.
// Hier stehen nur reine Funktionen ohne Browser, darum sind sie in tests/neuWebsites.test.mjs geprüft.
// Die Sätze zu Freigaben, Uploads und Sicherungen kommen aus dem alten Cockpit: Was bei einem
// Klick passiert, soll in beiden Cockpits gleich beschrieben sein.
import { timeAgo, formatDate } from '../../js/core/format.js';
import { displayAddress, problemsText } from '../../js/core/view.js';
import { describeRequest } from '../../js/pages/publishRequests.js';
import { describeUpload, collectionHint, IMAGE_KINDS } from '../../js/pages/visitorUploads.js';
import { describeSnapshot, suggestRestoreName } from '../../js/pages/objectSnapshots.js';

// Ohne Datum: ganz nach hinten sortieren. Eine feste grosse Zahl, weil «unendlich minus unendlich» die Sortierung stört
const WEIT_ZURUECK = Number.MAX_SAFE_INTEGER;

// Wie viele Millisekunden etwas her ist
const alterMs = (datum, jetzt) => {
    const zeit = Date.parse(datum);
    return Number.isFinite(zeit) ? Math.max(0, jetzt - zeit) : WEIT_ZURUECK;
};

// Was auf der Plakette steht. Ein Problem zählt vor allem anderen, denn dort muss man hinschauen
export const zustandAus = (website, namenMitBitte) => {
    if (website.art && website.art !== 'website') return 'leer';
    if (website.problems24h > 0) return 'problem';
    if (namenMitBitte.has(website.name)) return 'wartet';
    if (website.visibility === 'public') return 'online';
    if (website.visibility === 'members') return 'mitglieder';
    return 'entwurf';
};

// Die Zeile unten auf der Kachel. Nur die Zeit, weil Versionen noch nicht wissen, wer sie gemacht hat
export const kachelZeile = (website, jetzt) => {
    const teile = [
        website.problems24h > 0 ? problemsText(website.problems24h) : null,
        website.lastChange ? 'geändert ' + timeAgo(website.lastChange, jetzt) : 'Noch nichts geändert'
    ];
    return teile.filter(Boolean).join(', ');
};

// Eine Website so, wie Kachel und Website-Seite sie brauchen
export const websiteAus = (w, namenMitBitte, jetzt = Date.now()) => ({
    id: w.uuid,
    uuid: w.uuid,
    titel: String(w.name),
    adresse: displayAddress(w),
    beschreibung: w.note || '',
    zustand: zustandAus(w, namenMitBitte),
    // Für den Filter: die echte Sichtbarkeit, auch wenn die Plakette gerade «Problem» sagt
    sichtbarkeit: w.visibility || 'private',
    zeile: kachelZeile(w, jetzt),
    geaendertVor: alterMs(w.lastChange, jetzt),
    erstelltVor: alterMs(w.createdAt, jetzt),
    thumbAt: w.thumbAt || null,
    probleme: w.problems24h || 0,
    art: w.art,
    darfVerwalten: Boolean(w.rights?.grant)
});

// Werkzeugkästen gehören in die Werkstatt, auf den Kacheln stehen nur Websites und noch leere Domains
export const websitesAusApi = (liste, bitten, jetzt = Date.now()) => {
    const namenMitBitte = new Set((bitten || []).map(b => b.objectName));
    return (Array.isArray(liste) ? liste : [])
        .filter(w => w && w.uuid && w.name && w.art !== 'werkzeugkasten')
        .map(w => ({ ...websiteAus(w, namenMitBitte, jetzt), mein: w.mine !== false }));
};

// Werkzeugkästen stehen nicht auf den Kacheln, einem Helfer kann man sie trotzdem geben
export const kaestenAusApi = liste =>
    (Array.isArray(liste) ? liste : [])
        .filter(w => w && w.uuid && w.name && w.art === 'werkzeugkasten' && w.rights?.grant)
        .map(w => ({ id: w.uuid, titel: String(w.name) }));

// Den Umschalter braucht es nur, wenn es beides gibt
export const hatBeideHerkuenfte = websites => websites.some(w => w.mein) && websites.some(w => !w.mein);

// «alle», «mein» (zählt auf mein Konto, auch was mein Agent gebaut hat) oder «geteilt»
export const nachHerkunft = (websites, herkunft) => {
    if (herkunft === 'alle' || !hatBeideHerkuenfte(websites)) return websites;
    return websites.filter(w => w.mein === (herkunft === 'mein'));
};

// Den Filter nach Sichtbarkeit braucht es nur, wenn es mindestens zwei Arten gibt
export const hatMehrereSichtbarkeiten = websites => new Set(websites.map(w => w.sichtbarkeit)).size > 1;

// «alle», «public», «members» oder «private». Gibt es nur noch eine Art, fällt der Filter weg:
// Sonst sässe man auf einer leeren Liste fest, ohne Knopf zum Zurückstellen
export const nachSichtbarkeit = (websites, sichtbarkeit) => {
    if (sichtbarkeit === 'alle' || !hatMehrereSichtbarkeiten(websites)) return websites;
    return websites.filter(w => w.sichtbarkeit === sichtbarkeit);
};

const SICHTBAR = { public: 'öffentlich', members: 'nur Angemeldete', private: 'privat' };

// Eine Bitte um Veröffentlichung. «was» sagt genau, was beim Freigeben passiert,
// «grund» hat die KI geschrieben und ist darum nur Text, der klein darunter steht
export const bitteAusApi = (eintrag, namen = {}, jetzt = Date.now()) => ({
    id: eintrag.uuid,
    typ: 'bitte',
    art: 'Veröffentlichen',
    website: eintrag.objectName,
    ziel: eintrag.objectUuid,
    was: describeRequest(eintrag),
    ausnahmen: (Array.isArray(eintrag.except) ? eintrag.except : []).map(u => namen[u] || String(u).slice(0, 8)),
    stand: 'Jetzt ' + (SICHTBAR[eintrag.currentVisibility] || eintrag.currentVisibility),
    von: eintrag.requestedByName || 'einem Menschen',
    wann: timeAgo(eintrag.createdAt, jetzt),
    grund: eintrag.reason || null
});

// Eine Datei, die ein Besucher hochgeladen hat. Der Name stammt von einem Fremden und bleibt reiner Text
export const uploadAusApi = (eintrag, jetzt = Date.now()) => ({
    id: eintrag.uuid,
    typ: 'upload',
    art: 'Neuer Upload',
    website: eintrag.site,
    ziel: eintrag.uuid,
    was: describeUpload(eintrag),
    hinweis: collectionHint(eintrag),
    name: eintrag.name || null,
    bild: IMAGE_KINDS.includes(eintrag.kind),
    wann: timeAgo(eintrag.createdAt, jetzt)
});

// Jemand möchte mir eine Website übergeben. Bei Menschen kennt das Backend bewusst keinen Namen
export const uebergabeAusApi = (eintrag, jetzt = Date.now()) => ({
    id: eintrag.uuid,
    typ: 'uebergabe',
    art: 'Übergabe',
    website: eintrag.siteName,
    ziel: eintrag.rootUuid,
    was: 'Möchtest du die Website «' + eintrag.siteName + '» übernehmen?',
    von: 'Mensch ' + String(eintrag.fromUser).slice(0, 8) + '…',
    wann: timeAgo(eintrag.createdAt, jetzt)
});

// Pro gelöschter Website nur die neuste Sicherung. Das Backend liefert die neusten zuerst
export const papierkorbAusApi = (liste, jetzt = Date.now()) => {
    const gesehen = new Set();
    return (Array.isArray(liste) ? liste : [])
        .filter(s => {
            if (!s || gesehen.has(s.domain)) return false;
            gesehen.add(s.domain);
            return true;
        })
        .map(s => ({
            id: s.uuid,
            name: s.domain,
            geloescht: timeAgo(s.domainDeletedAt, jetzt),
            sicherung: formatDate(s.createdAt),
            inhalt: describeSnapshot(s),
            vorschlag: suggestRestoreName(s)
        }));
};
