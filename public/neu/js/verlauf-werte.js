// Verlauf: aus den Einträgen des Protokolls werden Sätze für Menschen.
// Ohne Browser, darum in tests/neuVerlauf.test.mjs geprüft.
import { shortUuid } from '../../js/core/format.js';

const CODE_ARTEN = {
    html: 'HTML',
    css: 'CSS',
    javascript: 'JavaScript',
    ssf: 'Server-Funktion',
    library: 'Bibliothek',
    syntax: 'Aufbau',
    data: 'Daten',
    werkzeug: 'Werkzeug'
};
const ROLLEN = { black: 'Ansehen', red: 'Ändern', blue: 'Verwalten' };
const SICHTBAR = { public: 'öffentlich', members: 'nur Angemeldete', private: 'privat' };

const mehrzahl = (n, eins, viele) => (n === 1 ? '1 ' + eins : n + ' ' + viele);

// Worum es geht: ein Teil mit Namen, die Website selbst oder ein Teil ohne Namen
const ort = e => (e.teil ? '«' + e.teil + '»' : e.targetUuid === e.websiteUuid ? 'die Website' : 'einen Teil');
const inOrt = e =>
    e.teil ? 'in «' + e.teil + '»' : e.targetUuid === e.websiteUuid ? 'in der Website' : 'in einem Teil';

// Name von jemandem, der Rechte bekommt. Menschen haben im System bewusst keinen Namen
const empfaenger = e => {
    if (e.memberName) return e.memberName;
    return e.details?.member ? 'Person ' + shortUuid(e.details.member) : 'jemanden';
};

const codeArten = d => (d.types || []).map(t => CODE_ARTEN[t] || t).join(', ');

const SAETZE = {
    'objekt.anlegen': () => 'Website angelegt',
    'objekt.anhaengen': e => (e.details?.identifier ? 'Teil «' + e.details.identifier + '»' : 'Teil') + ' angelegt',
    'objekt.klonen': e => ort(e) + ' kopiert',
    'objekt.zuegeln': e => ort(e) + ' verschoben',
    'objekt.loeschen': e => {
        const d = e.details || {};
        const wieviele = d.teile > 1 ? ' mit allen Unterteilen' : '';
        return (
            (d.teil ? 'Teil «' + d.teil + '»' : e.targetUuid === e.websiteUuid ? 'Einen Teil' : 'Teil') +
            wieviele +
            ' gelöscht'
        );
    },
    'objekt.sichtbarkeit': e => ort(e) + ' auf «' + (SICHTBAR[e.details?.visibility] || 'anders') + '» gestellt',
    'code.speichern': e => {
        const arten = codeArten(e.details || {});
        return ort(e) + ' geändert' + (arten ? ' (' + arten + ')' : '');
    },
    'code.buendel': e => mehrzahl(e.details?.teile || 0, 'Teil', 'Teile') + ' auf einmal gespeichert',
    'code.baum': () => 'Speicherart des Codes umgestellt',
    'daten.schreiben': e =>
        mehrzahl(e.details?.count || 0, 'Datensatz', 'Datensätze') + ' ' + inOrt(e) + ' gespeichert',
    'daten.loeschen': e => 'Datensatz ' + inOrt(e) + ' gelöscht',
    'datei.hochladen': e => 'Datei ' + inOrt(e) + ' hochgeladen',
    'datei.entfernen': e => 'Datei ' + inOrt(e) + ' entfernt',
    'relation.anlegen': e => 'Verbindung bei ' + ort(e) + ' angelegt',
    'rolle.vergeben': e =>
        empfaenger(e) + ' darf jetzt «' + (ROLLEN[e.details?.roleType] || e.details?.roleType || 'mehr') + '»',
    'rolle.entziehen': e =>
        empfaenger(e) + ' darf nicht mehr «' + (ROLLEN[e.details?.roleType] || e.details?.roleType || 'das') + '»',
    'schloss.entfernen': e => 'Eigene Rechte von ' + ort(e) + ' entfernt',
    'einladung.erstellen': () => 'Einladung erstellt',
    'einladung.widerrufen': () => 'Einladung zurückgezogen',
    'einladung.mail': () => 'Einladung per Mail geschickt',
    'einladung.annehmen': () => 'Einladung angenommen',
    'freigabe.anfragen': () => 'bittet ums Veröffentlichen',
    'freigabe.erteilen': () => 'Veröffentlichen erlaubt',
    'freigabe.ablehnen': () => 'Veröffentlichen abgelehnt',
    'domain.verbinden': e => 'Domain ' + (e.details?.hostname || '') + ' verbunden',
    'domain.trennen': e => 'Domain ' + (e.details?.hostname || '') + ' getrennt',
    'tresor.setzen': e => 'Geheimnis «' + (e.details?.name || '') + '» gesetzt',
    'tresor.loeschen': e => 'Geheimnis «' + (e.details?.name || '') + '» gelöscht',
    'zeitplan.setzen': e => 'Zeitplan von ' + ort(e) + ' gesetzt',
    'zeitplan.entfernen': e => 'Zeitplan von ' + ort(e) + ' entfernt',
    'auftrag.abbrechen': e => 'Auftrag von ' + ort(e) + ' abgebrochen',
    'sicherung.erstellen': () => 'Sicherung erstellt',
    'vektoren.regel': e => 'Regel für die Suche ' + inOrt(e) + ' geändert',
    'vektoren.hinzufuegen': e => 'Text für die Suche ' + inOrt(e) + ' hinzugefügt',
    'vektoren.entfernen': e => 'Text für die Suche ' + inOrt(e) + ' entfernt',
    'upload.freigeben': () => 'Upload freigegeben',
    'upload.behalten': () => 'Upload privat behalten',
    'emaillogin.schalten': e => 'Anmeldung per E-Mail ' + (e.details?.enabled ? 'eingeschaltet' : 'ausgeschaltet'),
    'besucher.einladen': () => 'Besucher eingeladen',
    'besucher.sperren': () => 'Besucher gesperrt',
    'besucher.entsperren': () => 'Besucher entsperrt',
    'besucher.entfernen': () => 'Besucher entfernt'
};

// Kommt eine neue Aktion dazu, erscheint sie trotzdem, bis es einen Satz dafür gibt
export const verlaufSatz = e => (SAETZE[e.action] ? SAETZE[e.action](e) : ort(e) + ' geändert');

export const verlaufWer = (e, ichId) => {
    if (e.actorUuid && e.actorUuid === ichId) return 'Du';
    if (e.actorKind === 'ai') return e.actorName || 'KI-Helfer';
    if (e.actorKind === 'guest') return 'Gast';
    return 'Person ' + shortUuid(e.actorUuid);
};

const zweistellig = x => String(x).padStart(2, '0');
const tagSchluessel = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();

export const verlaufUhrzeit = at => {
    const d = new Date(at);
    return zweistellig(d.getHours()) + ':' + zweistellig(d.getMinutes());
};

export const verlaufTag = (at, jetzt = new Date()) => {
    const d = new Date(at);
    const gestern = new Date(jetzt);
    gestern.setDate(jetzt.getDate() - 1);
    if (tagSchluessel(d) === tagSchluessel(jetzt)) return 'Heute';
    if (tagSchluessel(d) === tagSchluessel(gestern)) return 'Gestern';
    return zweistellig(d.getDate()) + '.' + zweistellig(d.getMonth() + 1) + '.' + d.getFullYear();
};

// Einträge nach Tagen. Die Reihenfolge bleibt: neuste zuerst
export const nachTagen = (eintraege, jetzt = new Date()) => {
    const tage = [];
    for (const e of eintraege) {
        const titel = verlaufTag(e.at, jetzt);
        const letzter = tage[tage.length - 1];
        if (letzter && letzter.titel === titel) letzter.eintraege.push(e);
        else tage.push({ titel, eintraege: [e] });
    }
    return tage;
};
