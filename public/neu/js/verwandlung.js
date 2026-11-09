// Der Übergang von der Startseite ins Cockpit: Der Text verblasst, der Baum schrumpft an seinen
// Platz unten rechts, das Cockpit erscheint. Grösse und Bewegung stehen in cockpit.css (body.landing-baum).
import { hintergrundStarten } from './hintergrund.js';

const BAUM_ZEIGEN_MS = 900;
const TEXT_WEG_MS = 400;
const BIS_COCKPIT_MS = 450;
const COCKPIT_AUF_MS = 700;

const warte = ms => new Promise(fertig => setTimeout(fertig, ms));
const ruhig = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Grosser Beispiel-Baum auf der Startseite
export const startseitenBaum = () => {
    document.body.classList.add('landing-baum');
    return hintergrundStarten({ muster: true });
};

const textWegUndCockpit = async cockpitAuf => {
    document.querySelector('.landing')?.classList.add('weg');
    await warte(TEXT_WEG_MS);
    document.body.classList.remove('landing-baum');
    await warte(BIS_COCKPIT_MS);
    const app = document.getElementById('app');
    app.classList.add('cockpit-kommt');
    cockpitAuf();
    setTimeout(() => app.classList.remove('cockpit-kommt'), COCKPIT_AUF_MS);
};

// Zurück von der Anmeldung: Der eigene Baum steht gross da und schrumpft genau an seinen Platz
export const nachAnmeldung = async cockpitStarten => {
    if (ruhig()) {
        cockpitStarten();
        return;
    }
    document.body.classList.add('landing-baum');
    hintergrundStarten();
    await warte(BAUM_ZEIGEN_MS);
    await textWegUndCockpit(() => cockpitStarten({ baumSteht: true }));
};

// Ohne Konto weiter: Gäste haben einen anderen Baum, darum blendet der Beispiel-Baum beim Schrumpfen aus
export const alsGastWeiter = async (beispielBaum, cockpitStarten) => {
    if (ruhig()) {
        beispielBaum?.wegblenden();
        document.body.classList.remove('landing-baum');
        cockpitStarten();
        return;
    }
    beispielBaum?.wegblenden();
    await textWegUndCockpit(cockpitStarten);
};
