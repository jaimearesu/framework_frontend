// js/core/intro.js
// ---------------------------------------------------------------------
// Das Logo "vindelis" und sein Auftritt (Punkt 5, D1, 28.10.2026)
//
// Beim ersten Öffnen des Cockpits (einmal pro Browser-Sitzung):
//   1. Alles andere wird unscharf und gedämpft.
//   2. "vindelis" zeichnet sich gross in der Mitte selbst (Kontur), füllt sich,
//      der i-Punkt springt in Blau dazu.
//   3. Das Logo fliegt an seinen Platz oben links in der Seitenleiste,
//      das Cockpit wird scharf.
// Wer im Betriebssystem "weniger Bewegung" eingestellt hat, sieht das Logo
// sofort an seinem Platz. Ein Klick irgendwohin überspringt den Auftritt.
// ---------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
// sessionStorage: gilt nur, solange der Tab offen ist – beim nächsten Besuch wieder
const SEEN_KEY = 'at0mic.introSeen';

/**
 * Baut das Logo als SVG: Schreibschrift-Text + blauer Punkt über dem letzten "i".
 * Der Punkt wird erst gesetzt, wenn die Schrift geladen ist (placeDot).
 */
export function createLogo() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 560 190');
    svg.setAttribute('class', 'logo-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'vindelis');
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '10');
    text.setAttribute('y', '138');
    text.textContent = 'vindelis';
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'logo-dot');
    dot.setAttribute('r', '0');
    svg.append(text, dot);
    return svg;
}

/** Setzt den blauen Punkt genau über das letzte "i" (braucht die geladene Schrift). */
export function placeDot(svg) {
    const text = svg.querySelector('text');
    const dot = svg.querySelector('.logo-dot');
    try {
        const i = text.textContent.lastIndexOf('i');
        const box = text.getExtentOfChar(i);
        dot.setAttribute('cx', String(box.x + box.width * 0.62));
        dot.setAttribute('cy', String(box.y + box.height * 0.3));
        dot.setAttribute('r', '9.5');
    } catch {
        // SVG noch nicht im Dokument oder Schrift fehlt: Punkt einfach weglassen
    }
}

const seen = () => {
    try {
        return sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
        return false;
    }
};
const markSeen = () => {
    try {
        sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
        /* ohne Speicher: dann halt jedes Mal */
    }
};

/**
 * Setzt das Logo in die Seitenleiste (#brandLogo) und spielt – falls noch nicht
 * gesehen – den Auftritt ab. Gibt ein Promise zurück, das am Ende erfüllt ist.
 */
export async function initLogo({ force = false } = {}) {
    const slot = document.getElementById('brandLogo');
    if (!slot) return;
    const logo = createLogo();
    slot.replaceChildren(logo);
    // Warten, bis die Schreibschrift da ist (sonst misst placeDot die Ersatzschrift)
    try {
        await document.fonts.load('120px Pacifico');
    } catch {
        /* egal – dann eben ohne Punkt */
    }
    placeDot(logo);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || (seen() && !force)) return;
    markSeen();
    await playIntro(slot);
}

/** Der eigentliche Auftritt. */
function playIntro(slot) {
    return new Promise(resolve => {
        const body = document.body;
        const veil = document.createElement('div');
        veil.className = 'intro-veil';
        const stage = document.createElement('div');
        stage.className = 'intro-logo draw';
        const big = createLogo();
        stage.append(big);
        body.append(veil, stage);
        body.classList.add('intro-on');
        slot.classList.add('is-waiting');
        placeDot(big);

        let done = false;
        const timers = [];
        const finish = () => {
            if (done) return;
            done = true;
            timers.forEach(clearTimeout);
            stage.remove();
            veil.remove();
            body.classList.remove('intro-on', 'intro-leaving');
            slot.classList.remove('is-waiting');
            removeEventListener('pointerdown', finish);
            removeEventListener('keydown', finish);
            resolve();
        };
        // Klick oder Taste überspringt den Auftritt
        addEventListener('pointerdown', finish);
        addEventListener('keydown', finish);

        // Nach dem Zeichnen: an den Platz in der Seitenleiste fliegen (FLIP:
        // Start- und Ziel-Rechteck messen, dann nur verschieben + verkleinern)
        timers.push(
            setTimeout(() => {
                const from = stage.getBoundingClientRect();
                const to = slot.getBoundingClientRect();
                body.classList.add('intro-leaving');
                // Seitenleiste nicht sichtbar (Handy): einfach ausblenden
                if (!to.width || to.right <= 0) {
                    stage.classList.add('fade');
                } else {
                    const scale = to.width / from.width;
                    const dx = to.left - from.left;
                    const dy = to.top + (to.height - from.height * scale) / 2 - from.top;
                    stage.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
                }
                timers.push(setTimeout(finish, 1000));
            }, 3000)
        );
    });
}
