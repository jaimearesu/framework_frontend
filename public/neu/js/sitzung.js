// Wer sitzt am Cockpit? Fragt beim Start das Backend und füllt damit DATEN.mensch und DATEN.konto.
// Die Verbindung zum Backend ist dieselbe wie beim alten Cockpit (js/core), die Regeln bleiben also gleich.
import { loadConfig, liveBase, isTestMode } from '../../js/core/config.js';
import { api } from '../../js/core/api.js';
import { describeIdentity } from '../../js/core/session.js';
import { DATEN } from './daten.js';
import { kontoZeilen, tageSeit, vornameAus } from './konto-werte.js';

// Login und Logout laufen immer über das Live-Backend, nur dort ist die Anmeldung eingerichtet
export const anmeldeAdresse = () => liveBase() + '/login';
// Die Adresse, die man in Claude oder ChatGPT einträgt
export const mcpAdresseLive = () => liveBase() + '/mcp';
export const abmeldeAdresse = () => liveBase() + '/logout';

// Liefert { erreichbar: true, art } oder { erreichbar: false, fehler }
export const sitzungLaden = async () => {
    await loadConfig();
    const [ich, objekt] = await Promise.all([api.get('/api/me'), api.get('/api/objects/me')]);
    if (!ich.ok || !objekt.ok) return { erreichbar: false, fehler: ich.error || objekt.error };

    const identitaet = describeIdentity(ich.data);
    DATEN.mensch = {
        art: identitaet.kind,
        name: vornameAus(identitaet),
        email: identitaet.email || null,
        id: objekt.data?.data?.uuid || null,
        tage: tageSeit(objekt.data?.data?.createdAt),
        testModus: isTestMode()
    };
    DATEN.konto = kontoZeilen(ich.data.limits);
    return { erreichbar: true, art: identitaet.kind };
};
