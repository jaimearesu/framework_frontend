// Rechnet aus, wie der Baum bei einem bestimmten Stand aussieht: von der Wurzel aus, Stück für Stück.
// Damit wächst er auf der Startseite und baut sich beim Übergang ins Cockpit wieder ab.
// Geprüft in tests/neuLanding.test.mjs

const punkt = ([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1);

// Liefert pro Linien-Art einen Pfad. «anzahl» darf eine Kommazahl sein: Die letzte Linie ist dann erst halb gezeichnet
export const filmPfade = (linien, anzahl) => {
    const pfade = {};
    const ganz = Math.min(linien.length, Math.floor(anzahl));
    const dazu = (linie, ende) => {
        pfade[linie.klasse] = (pfade[linie.klasse] || '') + 'M' + punkt(linie.pa) + 'L' + punkt(ende);
    };
    for (let i = 0; i < ganz; i++) dazu(linien[i], linien[i].pb);
    const rest = anzahl - ganz;
    if (rest > 0 && ganz < linien.length) {
        const { pa, pb } = linien[ganz];
        dazu(linien[ganz], [pa[0] + (pb[0] - pa[0]) * rest, pa[1] + (pb[1] - pa[1]) * rest]);
    }
    return pfade;
};

// Weicher Anfang, weiches Ende
export const sanft = t => t * t * (3 - 2 * t);
