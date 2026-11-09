// Rechnet aus, wie der Baum bei einem bestimmten Stand aussieht: von der Wurzel aus, Stück für Stück.
// Damit wächst er auf der Startseite und baut sich beim Übergang ins Cockpit wieder ab.
// Geprüft in tests/neuLanding.test.mjs

const punkt = ([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1);

// Liefert pro Linien-Art einen Pfad. «anzahl» darf eine Kommazahl sein: Die letzte Linie ist dann erst halb gezeichnet.
// ansicht rechnet ein Stück für eine andere Blickrichtung um, ohne gilt die beim Wachsen gespeicherte
export const filmPfade = (linien, anzahl, ansicht = linie => linie) => {
    const pfade = {};
    const ganz = Math.min(linien.length, Math.floor(anzahl));
    const dazu = (klasse, anfang, ende) => {
        pfade[klasse] = (pfade[klasse] || '') + 'M' + punkt(anfang) + 'L' + punkt(ende);
    };
    for (let i = 0; i < ganz; i++) {
        const { klasse, pa, pb } = ansicht(linien[i]);
        dazu(klasse, pa, pb);
    }
    const rest = anzahl - ganz;
    if (rest > 0 && ganz < linien.length) {
        const { klasse, pa, pb } = ansicht(linien[ganz]);
        dazu(klasse, pa, [pa[0] + (pb[0] - pa[0]) * rest, pa[1] + (pb[1] - pa[1]) * rest]);
    }
    return pfade;
};

// Weicher Anfang, weiches Ende
export const sanft = t => t * t * (3 - 2 * t);
