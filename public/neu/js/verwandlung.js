// Der Übergang von der Startseite ins Cockpit: Der Text verschwindet, der Baum baut sich Stück für Stück
// bis zur Wurzel ab und sinkt dabei an seinen Platz. Dort wächst der eigene Baum, und das Cockpit erscheint.
// Grösse und Bewegung des Rahmens stehen in cockpit.css (body.landing-baum).
import { hintergrundStarten } from './hintergrund.js';

const STARTSEITE_ZEIGEN_MS = 400;
const TEXT_VORLAUF_MS = 300;
const ABBAU_MS = 2400;
const COCKPIT_NACH_MS = 350;
const COCKPIT_AUF_MS = 700;

const warte = ms => new Promise(fertig => setTimeout(fertig, ms));
const ruhig = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Grosser Beispiel-Baum auf der Startseite
export const startseitenBaum = ({ fertig = false } = {}) => {
    document.body.classList.add('landing-baum');
    return hintergrundStarten({ muster: true, fertig });
};

export const startseitenBaumWeg = beispielBaum => {
    beispielBaum?.entfernen();
    document.body.classList.remove('landing-baum');
};

export const insCockpit = async (beispielBaum, cockpitStarten) => {
    if (ruhig()) {
        startseitenBaumWeg(beispielBaum);
        cockpitStarten();
        return;
    }
    document.querySelector('.landing')?.classList.add('weg');
    await warte(TEXT_VORLAUF_MS);
    document.body.classList.remove('landing-baum');
    if (beispielBaum) await beispielBaum.abbauen(ABBAU_MS);
    // Auf dem Handy gibt es keinen Baum: Dann blendet nur die Seite über
    else await warte(TEXT_VORLAUF_MS);
    hintergrundStarten({ vorgaenger: beispielBaum });
    await warte(COCKPIT_NACH_MS);
    const app = document.getElementById('app');
    app.classList.add('cockpit-kommt');
    cockpitStarten({ baumSteht: true });
    setTimeout(() => app.classList.remove('cockpit-kommt'), COCKPIT_AUF_MS);
};

// Zurück von der Anmeldung: Die Startseite steht kurz genau so da wie vorher, dann beginnt der Übergang
export const nachAnmeldung = async (beispielBaum, cockpitStarten) => {
    await warte(STARTSEITE_ZEIGEN_MS);
    await insCockpit(beispielBaum, cockpitStarten);
};
