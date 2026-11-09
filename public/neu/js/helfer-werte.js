// KI-Helfer und «Neue Website»: was das Backend liefert, in Cockpit-Form, und der Ablauf beim Anlegen.
// Alles ohne Bildschirm, darum in tests/neuHelfer.test.mjs geprüft.
import { timeAgo } from '../../js/core/format.js';
import { clientLabel, helperStatus, helperWork } from '../../js/core/view.js';
import { activeConnections, checkAgentName, createAgent, disconnect, AGENT_PREFIX } from '../../js/core/agent.js';

// Ein Agent aus GET /api/agents, so wie Karte und Auswahl ihn zeigen.
// «neu»: Er war noch nie verbunden und hat noch nichts getan
export const helferAusApi = (agent, jetzt = Date.now()) => {
    const status = helperStatus(agent);
    const arbeit = helperWork(agent);
    const warVerbunden = (agent.connections || []).length > 0 || Boolean(agent.lastActivityAt);
    return {
        id: agent.uuid,
        name: String(agent.domain),
        zustand: status.tone === 'ok' ? 'aktiv' : warVerbunden ? 'getrennt' : 'neu',
        status: status.text,
        aktiv: agent.lastActivityAt ? timeAgo(agent.lastActivityAt, jetzt) : 'noch nie',
        websites: arbeit.sites.map(s => s.name),
        arbeit: arbeit.sites,
        kaesten: arbeit.toolboxes,
        versteckt: arbeit.hidden,
        verbindungen: activeConnections(agent).map(c => ({ id: c.uuid, name: clientLabel(c) }))
    };
};

// So viele Websites zeigt eine Karte, bevor man «Alle anzeigen» drücken muss
export const HELFER_KURZ = 3;

// Jedes «Erlauben» in Claude macht eine neue Verbindung, die alten bleiben bestehen.
// Für Menschen ist das EINE Verbindung, darum nennt die Karte jeden Dienst nur einmal
export const verbindungsNamen = verbindungen => [...new Set(verbindungen.map(v => v.name))].join(' und ');

// Trennt alle Verbindungen eines Helfers. Liefert null oder den ersten Fehler
export const alleTrennen = async ({ api, verbindungen }) => {
    const antworten = await Promise.all(verbindungen.map(v => disconnect({ api, uuid: v.id })));
    const gescheitert = antworten.find(a => !a.ok);
    return gescheitert ? gescheitert.error : null;
};

// Aus dem, was man eintippt, wird der Name des Agenten. So erkennt man ihn beim «Erlauben» wieder
export const helferNameAus = (eingabe, zuAdresse) => {
    const teil = zuAdresse(String(eingabe ?? ''));
    if (!teil) return { fehler: 'Bitte gib dem neuen Helfer einen Namen.' };
    const pruefung = checkAgentName(teil.startsWith(AGENT_PREFIX) ? teil : AGENT_PREFIX + teil);
    return pruefung.error ? { fehler: pruefung.error } : { name: pruefung.name };
};

// Entscheid 3: Ein Helfer bekommt alle drei Rechte, aber nur auf dieser Website.
// Ohne blue könnte er nicht um eine Freigabe bitten. Veröffentlichen kann er trotzdem nie
const HELFER_ROLLEN = ['black', 'red', 'blue'];

// Macht aus einem neuen Objekt einen Agenten, der noch auf seine Verbindung wartet.
// Als Agent gilt, was einen Schlüssel hatte. Mit «Erlauben» bekommt er danach eigene Schlüssel.
// Dieser hier wird sofort widerrufen, sein Wert wird nirgends gezeigt oder gespeichert.
// Klappt das Widerrufen nicht, läuft er nach einer Stunde von selbst ab.
const neuenHelferAnlegen = async (api, name) => {
    const ergebnis = await createAgent({ api, name, boxes: [], hours: 1 });
    if (!ergebnis.ok) return { fehler: ergebnis.error };
    if (ergebnis.token?.uuid) await api.del('/api/tokens/' + encodeURIComponent(ergebnis.token.uuid));
    return { uuid: ergebnis.agentUuid };
};

/**
 * Legt die Website an und gibt dem Helfer seine Rechte.
 * Merkt sich in «fortschritt», was schon erledigt ist: Scheitert ein späterer Schritt,
 * entsteht beim nächsten Versuch nichts doppelt.
 *   adresse      Name der Website, geprüft mit zuAdresse
 *   beschreibung wird zur Notiz, die der Helfer als Auftrag liest
 *   helfer       null | { uuid } bestehend | { neu: name }
 * Rückgabe: { ok: true, uuid, warnung? } oder { ok: false, schritt, error }
 */
export const websiteAnlegen = async ({ api, adresse, beschreibung, helfer, fortschritt }) => {
    if (!fortschritt.website) {
        const angelegt = await api.post('/api/objects', { domain: adresse });
        const uuid = angelegt.ok ? angelegt.data?.data?.uuid : null;
        if (!uuid) {
            return { ok: false, schritt: 'website', error: angelegt.error || 'Die Website liess sich nicht anlegen.' };
        }
        fortschritt.website = uuid;
    }
    const site = fortschritt.website;
    const pfad = '/api/objects/' + encodeURIComponent(site);
    let warnung = null;
    if (beschreibung && !fortschritt.notiz) {
        const notiz = await api.put(pfad + '/note', { note: beschreibung });
        // Eine fehlende Beschreibung ist kein Grund, alles abzubrechen
        if (notiz.ok) fortschritt.notiz = true;
        else warnung = 'Die Beschreibung konnte nicht gespeichert werden.';
    }
    if (!helfer) return { ok: true, uuid: site, warnung };
    if (helfer.neu && !fortschritt.helfer) {
        const neu = await neuenHelferAnlegen(api, helfer.neu);
        if (neu.fehler) return { ok: false, schritt: 'helfer', error: neu.fehler };
        fortschritt.helfer = neu.uuid;
    }
    const helferUuid = helfer.neu ? fortschritt.helfer : helfer.uuid;
    for (const rolle of HELFER_ROLLEN) {
        const recht = await api.put(pfad + '/members/' + encodeURIComponent(helferUuid), { roleType: rolle });
        if (!recht.ok) {
            return { ok: false, schritt: 'rechte', error: recht.error || 'Das Recht liess sich nicht vergeben.' };
        }
    }
    return { ok: true, uuid: site, warnung };
};
