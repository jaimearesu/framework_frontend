// Holt Websites, offene Entscheidungen und Papierkorb vom Backend und legt sie in DATEN ab.
import { api } from '../../js/core/api.js';
import { loadObjects, loadObjectNames, objectLabel } from '../../js/core/objects.js';
import { DATEN } from './daten.js';
import { huelle } from './ui.js';
import { websitesAusApi, kaestenAusApi, bitteAusApi, uploadAusApi, papierkorbAusApi } from './websites-werte.js';
import { helferAusApi } from './helfer-werte.js';

const liste = antwort => (antwort.ok && Array.isArray(antwort.data?.data) ? antwort.data.data : []);

// 403 und 404 heissen: Diese Person hat hier nichts. Alles andere ist ein echter Fehler
const fehlgeschlagen = antwort => !antwort.ok && antwort.status !== 403 && antwort.status !== 404;

// Namen der Teile, die bei einer Bitte ausgenommen sind. Nur laden, wenn es solche Bitten gibt
const namenDerAusnahmen = async bitten => {
    const namen = {};
    if (!bitten.some(b => Array.isArray(b.except) && b.except.length)) return namen;
    const geladen = await loadObjects();
    const objekte = geladen.ok ? geladen.data : [];
    await loadObjectNames(objekte);
    for (const o of objekte) namen[o.uuid] = objectLabel(o);
    return namen;
};

// Damit eine langsame ältere Antwort nie eine neuere überschreibt
let letzteNummer = 0;

const stand = () =>
    JSON.stringify([DATEN.websites, DATEN.wartet, DATEN.papierkorb, DATEN.websitesFehler, DATEN.wartetFehler]);

// Liefert true, wenn sich etwas geändert hat
export const datenLaden = async () => {
    // Ohne Anmeldung und ohne Gast-Konto gibt es noch nichts zu laden
    if (DATEN.mensch.art === 'anon') return false;
    letzteNummer += 1;
    const nummer = letzteNummer;
    const [websites, bitten, uploads, geloescht] = await Promise.all([
        api.get('/api/websites'),
        api.get('/api/publish-requests/pending'),
        api.get('/api/uploads/pending'),
        // Der Papierkorb gehört zu einem richtigen Konto
        DATEN.mensch.art === 'user' ? api.get('/api/snapshots/deleted') : { ok: true, data: { data: [] } }
    ]);
    const namen = await namenDerAusnahmen(liste(bitten));
    if (nummer !== letzteNummer) return false;

    const vorher = stand();
    // Bei einem Fehler bleiben die bisherigen Kacheln stehen, falls es welche gibt
    DATEN.websitesFehler = !websites.ok;
    if (websites.ok) {
        DATEN.websites = websitesAusApi(websites.data?.data, liste(bitten));
        DATEN.kaesten = kaestenAusApi(websites.data?.data);
        DATEN.websitesGekappt = Boolean(websites.data?.meta?.capped);
    }
    DATEN.wartetFehler = fehlgeschlagen(bitten) || fehlgeschlagen(uploads);
    DATEN.wartet = [...liste(bitten).map(b => bitteAusApi(b, namen)), ...liste(uploads).map(u => uploadAusApi(u))];
    DATEN.papierkorb = papierkorbAusApi(liste(geloescht));
    return stand() !== vorher;
};

// Für die Knöpfe «Nochmals versuchen» und nach jeder Entscheidung
export const neuLaden = async () => {
    await datenLaden();
    huelle.neu();
};

// KI-Helfer gibt es nur für angemeldete Menschen. Sie werden nicht bei jedem Seitenwechsel geladen,
// sondern beim Start, auf ihrer Seite und vor dem Dialog «Neue Website». Liefert true bei einer Änderung
export const helferLaden = async () => {
    if (DATEN.mensch.art !== 'user') return false;
    const vorher = JSON.stringify([DATEN.helfer, DATEN.helferFehler, DATEN.mcpAdresse]);
    const antwort = await api.get('/api/agents', { query: { days: 180 } });
    DATEN.helferFehler = !antwort.ok;
    if (antwort.ok) {
        DATEN.helfer = liste(antwort).map(a => helferAusApi(a));
        DATEN.mcpAdresse = antwort.data?.meta?.oauth?.mcpUrl || null;
    }
    return JSON.stringify([DATEN.helfer, DATEN.helferFehler, DATEN.mcpAdresse]) !== vorher;
};

export const helferNeuLaden = async () => {
    await helferLaden();
    huelle.neu();
};
