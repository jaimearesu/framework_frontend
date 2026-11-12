// Aufklappen mit Unschärfe (12.11.2026, Wunsch von Jaime statt des Pfeils von <details>):
// Ein Teil ist schon zu sehen, das nächste Stück läuft unten weich in einen Schleier aus,
// darauf liegt ein Knopf. Ein Klick fährt den ganzen Inhalt weich auf.
// Gebraucht für die Websites in der Auslastung und die Vergleichs-Tabelle der Preise.
import { h } from './ui.js';

// So viel vom nächsten Eintrag schaut unter dem Schleier hervor
const ANSCHNITT_PX = 72;

/**
 * inhalt  = das Element mit allen Einträgen
 * eintraege = () => Liste der Einträge (z.B. die Zeilen einer Tabelle), um die Höhe zu messen
 * sichtbar = so viele Einträge sind ganz zu sehen
 * text    = Beschriftung des Knopfs, z.B. «Alle 12 Websites zeigen»
 * weniger = Beschriftung zum Zuklappen (null = kein Zuklappen)
 */
export const teaser = (inhalt, { eintraege, sichtbar, text, weniger = null, id = null }) => {
    if (eintraege().length <= sichtbar) return inhalt;
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const kasten = h('div', { class: 'teaser zu', id }, inhalt);
    // Höhe bis zum Anfang des ersten versteckten Eintrags, plus ein Anschnitt davon
    const zuHoehe = () => {
        const naechster = eintraege()[sichtbar];
        if (!naechster) return null;
        return naechster.getBoundingClientRect().top - kasten.getBoundingClientRect().top + ANSCHNITT_PX;
    };
    const anpassen = () => {
        if (!kasten.classList.contains('zu')) return;
        const hoehe = zuHoehe();
        if (hoehe) kasten.style.maxHeight = Math.round(hoehe) + 'px';
    };
    // Neu messen, sobald der Kasten auf der Seite steht und wenn sich die Breite ändert
    if (typeof ResizeObserver === 'function') new ResizeObserver(anpassen).observe(kasten);
    requestAnimationFrame(anpassen);

    const zuKnopf = weniger
        ? h('button', { type: 'button', class: 'teaser-weniger', hidden: true, onclick: () => zuklappen() }, weniger)
        : null;
    const aufklappen = () => {
        kasten.style.maxHeight = kasten.scrollHeight + 'px';
        kasten.classList.remove('zu');
        kasten.classList.add('offen');
        const fertig = () => {
            if (kasten.classList.contains('offen')) kasten.style.maxHeight = 'none';
        };
        if (ruhig) fertig();
        else {
            kasten.addEventListener('transitionend', fertig, { once: true });
            // Falls der Browser kein «transitionend» schickt (z.B. Tab im Hintergrund)
            setTimeout(fertig, 700);
        }
        if (zuKnopf) zuKnopf.hidden = false;
    };
    const zuklappen = () => {
        // Von «none» aus gibt es keine Bewegung: zuerst die echte Höhe setzen
        kasten.style.maxHeight = kasten.scrollHeight + 'px';
        void kasten.offsetHeight;
        kasten.classList.remove('offen');
        kasten.classList.add('zu');
        anpassen();
        if (zuKnopf) zuKnopf.hidden = true;
        kasten.scrollIntoView({ block: 'nearest', behavior: ruhig ? 'auto' : 'smooth' });
    };
    const schleier = h(
        'div',
        { class: 'teaser-schleier' },
        h('button', { type: 'button', class: 'bp-btn bp-btn-o teaser-knopf', onclick: aufklappen }, text)
    );
    kasten.append(schleier);
    return zuKnopf ? h('div', { class: 'teaser-huelle' }, kasten, zuKnopf) : kasten;
};
