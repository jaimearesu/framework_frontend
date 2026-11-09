// Merkt sich über den Umweg zu Auth0, dass gerade jemand auf «Anmelden» geklickt hat.
// sessionStorage gilt nur für diesen Tab. Wer später wiederkommt, landet ohne Übergang im Cockpit.
// Geprüft in tests/neuLanding.test.mjs
const SCHLUESSEL = 'neu-vom-login';
const tabSpeicher = () => sessionStorage;

export const anmeldungMerken = (speicher = tabSpeicher) => {
    try {
        speicher().setItem(SCHLUESSEL, '1');
    } catch {
        // Ohne Speicher gibt es einfach keinen Übergang
    }
};

// Gilt nur einmal: Beim nächsten Neuladen läuft der Übergang nicht nochmals
export const anmeldungHolen = (speicher = tabSpeicher) => {
    try {
        const da = speicher().getItem(SCHLUESSEL) === '1';
        speicher().removeItem(SCHLUESSEL);
        return da;
    } catch {
        return false;
    }
};
