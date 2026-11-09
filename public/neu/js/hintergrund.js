// Hintergrund unten rechts: ein feines, eingedelltes Gitter, aus der Mulde wächst ganz langsam ein Baum.
// Der Baum ist ein räumliches Modell (3D), das von einem festen Blickpunkt aus gezeichnet wird.
// Er wächst wie ein echter Baum in Rangstufen: Stamm, wenige lange Hauptäste, Nebenäste, feine Zweige.
// Jede Stufe ist kürzer und dünner, und wo es schon dicht ist, wächst nichts Kleines mehr.
// Die vindelis-ID bestimmt seine Form, die Zeit auf vindelis seine Grösse:
// Altes Holz bleibt immer gleich, die jüngsten Triebe wachsen langsam vor deinen Augen und immer wieder neu.
import { huelle } from './ui.js';
import { DATEN } from './daten.js';
import { baumBuehneOeffnen } from './baum-buehne.js';
import { filmPfade, sanft } from './baum-film.js';

// Macht aus einem Text eine Zahl: gleicher Text, gleiche Zahl
const textZuZahl = text => {
    let zahl = 2166136261;
    for (const zeichen of text) zahl = Math.imul(zahl ^ zeichen.charCodeAt(0), 16777619);
    return zahl >>> 0;
};

// Würfel mit festem Startwert: Bei gleichem Startwert fallen immer die gleichen Zahlen
const wuerfelAus = saat => () => {
    saat = (saat + 0x6d2b79f5) | 0;
    let t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const svgTeil = (name, felder) => {
    const teil = document.createElementNS(SVG_NS, name);
    Object.entries(felder).forEach(([k, v]) => teil.setAttribute(k, v));
    return teil;
};

// Zeichenfläche, wird per CSS auf die Bildschirmgrösse skaliert
const FLAECHE = { breite: 1100, hoehe: 560 };
const svgFlaeche = klasse =>
    svgTeil('svg', { class: klasse, viewBox: '0 0 ' + FLAECHE.breite + ' ' + FLAECHE.hoehe, 'aria-hidden': 'true' });

// Mitte der Mulde, dort steht die Wurzel des Baums
const WURZEL = { x: 820, y: 490 };
const BAUM_RASTER = 12;
// Ein Stück braucht so lange. Die nächste Linie beginnt, wenn die letzte fertig ist, deshalb steht der Stift nie still
const BAUM_TAKT = 8000;
// So viel ist höchstens junger Trieb: 450 Stücke sind eine Stunde Wachsen
const BAUM_TRIEBE = 450;
// Der Blick auf das Modell: leicht von der Seite und von oben
const BLICK = { dreh: 0.56, neig: 0.22, abstand: 120 };

// Wie viele Stücke ein Baum nach so vielen Tagen hat: am Anfang schnell, später langsamer, nach oben begrenzt
const stueckeFuerAlter = tage => Math.min(4000, Math.round(14 * Math.pow(Math.max(1, tage), 0.66)));

// Berechnet die Linien des Gitters: flach, nur um die Wurzel eingedellt und perspektivisch kleiner nach hinten
const gitterLinien = () => {
    const delle = (x, z) => 1.3 * Math.exp(-(x * x + (z - 4) * (z - 4)) / 10);
    const punkt = (x, z) => {
        const nah = 8 / (8 + z);
        return (WURZEL.x + x * nah * 75).toFixed(1) + ' ' + (190 + (2.2 + delle(x, z)) * nah * 128).toFixed(1);
    };
    const linie = verlauf => {
        let pfad = '';
        for (let n = 0; n <= 40; n++) pfad += (n ? 'L' : 'M') + verlauf(n / 40);
        return pfad;
    };
    let alle = '';
    for (let x = -24; x <= 24; x++) alle += linie(t => punkt(x, -2 + 22 * t));
    for (let z = -2; z <= 20; z++) alle += linie(t => punkt(-24 + 48 * t, z));
    return alle;
};

// Stand des Baums pro Browser merken, so wächst er nach dem Neuladen dort weiter, wo er war.
// Die Form entsteht aus der ID von selbst neu, gespeichert werden nur ein paar Zahlen
const BAUM_SPEICHER = 'neu-baum';

const baumLesen = kennung => {
    try {
        const stand = JSON.parse(localStorage.getItem(BAUM_SPEICHER));
        return stand && stand.kennung === kennung && stand.tage ? stand : null;
    } catch {
        return null;
    }
};

const baumMerken = stand => {
    try {
        localStorage.setItem(BAUM_SPEICHER, JSON.stringify(stand));
    } catch {
        // Ohne Speicher beginnt der Baum beim Neuladen einfach von vorne
    }
};

const HOCH = [0, 1, 0];
// Acht Richtungen rund um den Stamm
const RUNDUM = [
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
    [-1, 0, 1],
    [-1, 0, 0],
    [-1, 0, -1],
    [0, 0, -1],
    [1, 0, -1]
];
// So viele Stücke dürfen höchstens in einem Würfel von 4 Feldern liegen, pro Rangstufe (Luft zwischen den Ästen)
const DICHTE_GRENZE = [99, 18, 11, 9];

// Nimmt einen Eintrag schnell aus einer Liste, die Reihenfolge ist dabei egal
const herausnehmen = (liste, stelle) => {
    const eintrag = liste[stelle];
    liste[stelle] = liste[liste.length - 1];
    liste.pop();
    return eintrag;
};

// Pflanzt den Baum und gibt die Funktion zurück, mit der man sein Alter wechselt
const baumPflanzen = (
    altEbene,
    triebEbene,
    kennung,
    nurAnschauen,
    startTage,
    spaeterWachsen,
    dichteGrenze = DICHTE_GRENZE
) => {
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tage, ziel, trieb, basis, hoehe, breite;
    let belegt, dichte, straenge, haken, stamm, stuecke, wuerfel, sammlung, uhr;
    // Alle Stücke in Wuchs-Reihenfolge, daraus zeichnet die grosse Ansicht den Baum
    let linien = [];
    // Zählt die Durchgänge der jungen Triebe: Jedes Mal wachsen sie wieder anders
    let triebNummer = 0;

    const zufall = (von, bis) => von + Math.floor(wuerfel() * (bis - von + 1));
    const schluessel = ([i, j, k]) => i + ',' + j + ',' + k;
    const dazu = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const mitte = (a, r) => 'm' + (2 * a[0] + r[0]) + ',' + (2 * a[1] + r[1]) + ',' + (2 * a[2] + r[2]);
    const istSchraeg = r => (r[0] !== 0) + (r[1] !== 0) + (r[2] !== 0) > 1;
    const wuerfelFeld = ([i, j, k]) => (i >> 2) + ',' + (j >> 2) + ',' + (k >> 2);

    // Rechnet einen Punkt des Modells auf die Zeichenfläche um und liefert auch, wie weit hinten er liegt
    const abbilden = ([i, j, k], dreh = BLICK.dreh) => {
        const quer = i * Math.cos(dreh) - k * Math.sin(dreh);
        const tiefe = i * Math.sin(dreh) + k * Math.cos(dreh);
        const nah = BLICK.abstand / (BLICK.abstand + tiefe);
        return {
            x: WURZEL.x + quer * BAUM_RASTER * nah,
            y: WURZEL.y - (j * Math.cos(BLICK.neig) + tiefe * Math.sin(BLICK.neig)) * BAUM_RASTER * nah,
            tiefe
        };
    };

    // Die Krone: in der Mitte breit, unten und oben schmaler. Der Baum darf über den Bildschirm hinauswachsen,
    // ganz sichtbar ist er in der grossen Ansicht
    const kronenRadius = j => breite * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, (j + 2) / (hoehe + 2))));
    const frei = feld =>
        feld[1] > 0 && Math.hypot(feld[0], feld[2]) <= kronenRadius(feld[1]) && !belegt.has(schluessel(feld));

    // Passt das nächste Stück? Geprüft werden Platz, Dichte und Abstand zu den Nachbarn
    const passt = (von, richtung, rang) => {
        const nach = dazu(von, richtung);
        if (!frei(nach) || (dichte.get(wuerfelFeld(nach)) || 0) >= dichteGrenze[rang]) return false;
        if (istSchraeg(richtung)) return !belegt.has(mitte(von, richtung));
        for (let achse = 0; achse < 3; achse++) {
            if (richtung[achse] !== 0) continue;
            const schritt1 = [0, 0, 0];
            schritt1[achse] = 1;
            const schritt2 = [0, 0, 0];
            schritt2[achse] = -1;
            if (belegt.has(schluessel(dazu(nach, schritt1))) || belegt.has(schluessel(dazu(nach, schritt2))))
                return false;
        }
        return true;
    };

    const aufwaerts = richtung => [richtung[0], 1, richtung[2]];

    // Merkt sich, wo an diesem neuen Punkt später ein Strang der nächsten Rangstufe einhaken darf
    const hakenAnlegen = (feld, rang, aussen, nr) => {
        const merke = (neuerRang, neuAussen, plan) =>
            haken[neuerRang].push({ von: feld, rang: neuerRang, aussen: neuAussen, plan });
        if (rang === 0) {
            // Hauptäste: nur alle paar Felder am Stamm, rund um ihn herum versetzt, unten frei von Ästen
            if (feld[1] < Math.max(2, Math.round(hoehe * 0.2)) || feld[1] % 2 !== 0) return;
            const richtung = RUNDUM[(feld[1] + zufall(0, 7)) % 8];
            const lang = Math.max(3, Math.round(hoehe * 0.45));
            merke(1, richtung, [
                [richtung, zufall(3, lang)],
                [aufwaerts(richtung), zufall(2, lang)],
                [HOCH, zufall(2, Math.max(3, Math.round(lang * 0.6)))]
            ]);
        } else if (rang === 1 && nr % 3 === 0) {
            // Nebenäste: abwechselnd links und rechts vom Hauptast
            const seite = nr % 6 === 0 ? 1 : -1;
            const richtung = [seite * aussen[2], 0, -seite * aussen[0]];
            merke(2, richtung, [
                [richtung, zufall(2, 6)],
                [aufwaerts(richtung), zufall(1, 5)]
            ]);
            merke(2, aussen, [
                [HOCH, zufall(2, 6)],
                [aufwaerts(aussen), zufall(1, 3)]
            ]);
        } else if (rang === 2 && nr % 2 === 0) {
            // Zweige: kurz und fein, immer nach oben oder schräg
            merke(3, aussen, [[aufwaerts(aussen), zufall(2, 5)]]);
            merke(3, aussen, [[HOCH, zufall(2, 5)]]);
        }
    };

    // Hinten blasser als vorne: Das gibt dem Baum seine Tiefe
    const tiefenStufe = tiefe => Math.max(0, Math.min(3, Math.floor(((tiefe + breite) / (2 * breite + 1)) * 4)));

    const klasseFuer = (rang, a, b) => 'baum-linie baum-r' + rang + ' baum-t' + tiefenStufe((a.tiefe + b.tiefe) / 2);

    const zeichne = (von, nach, rang) => {
        const a = abbilden(von);
        const b = abbilden(nach);
        const klasse = klasseFuer(rang, a, b);
        const d = 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
        linien.push({
            a: von,
            b: nach,
            rang,
            seit: sammlung ? 0 : performance.now(),
            klasse,
            pa: [a.x, a.y],
            pb: [b.x, b.y]
        });
        if (sammlung) {
            sammlung[klasse] = (sammlung[klasse] || '') + d;
            return;
        }
        triebEbene.append(
            svgTeil('path', {
                d,
                pathLength: 1,
                class: klasse + ' waechst',
                style: 'animation-duration:' + BAUM_TAKT + 'ms'
            })
        );
    };

    // Was schon gewachsen ist, wird pro Stärke und Tiefe zu einer einzigen Linie zusammengefasst. Das hält die Seite leicht
    const sammlungZeichnen = ebene => {
        ebene.replaceChildren(...Object.entries(sammlung).map(([klasse, d]) => svgTeil('path', { d, class: klasse })));
        sammlung = null;
    };

    const wachse = (von, richtung, rang, aussen, nr) => {
        const nach = dazu(von, richtung);
        zeichne(von, nach, rang);
        belegt.add(schluessel(nach));
        if (istSchraeg(richtung)) belegt.add(mitte(von, richtung));
        const feld = wuerfelFeld(nach);
        dichte.set(feld, (dichte.get(feld) || 0) + 1);
        stuecke++;
        hakenAnlegen(nach, rang, aussen, nr);
        return nach;
    };

    // Lässt einen Strang weiterwachsen. Ist ein Abschnitt seines Plans fertig, kommt der nächste
    const strangWeiter = s => {
        while (s.plan.length && s.plan[0][1] <= 0) s.plan.shift();
        if (!s.plan.length || !passt(s.kopf, s.plan[0][0], s.rang)) return false;
        s.nr++;
        s.kopf = wachse(s.kopf, s.plan[0][0], s.rang, s.aussen, s.nr);
        s.plan[0][1]--;
        return true;
    };

    // Wächst um genau ein Stück. «false» heisst: Es gibt keinen Platz mehr
    const schritt = () => {
        for (;;) {
            const gruppen = [];
            if (stamm < hoehe && frei([0, stamm + 1, 0])) gruppen.push(['stamm', 3]);
            if (straenge.length) gruppen.push(['strang', 10]);
            if (haken[1].length) gruppen.push([1, 3]);
            if (haken[2].length) gruppen.push([2, 2]);
            if (haken[3].length) gruppen.push([3, 2]);
            if (!gruppen.length) return false;
            let los = wuerfel() * gruppen.reduce((summe, g) => summe + g[1], 0);
            const [gruppe] = gruppen.find(g => (los -= g[1]) < 0) || gruppen[0];

            if (gruppe === 'stamm') {
                wachse([0, stamm, 0], HOCH, 0, [0, 0, 0], 0);
                stamm++;
                return true;
            }
            if (gruppe === 'strang') {
                // Meist wächst der zuletzt begonnene Strang weiter: So entsteht beim Zusehen eine fortlaufende Linie
                const stelle = wuerfel() < 0.75 ? straenge.length - 1 : zufall(0, straenge.length - 1);
                if (strangWeiter(straenge[stelle])) return true;
                herausnehmen(straenge, stelle);
                continue;
            }
            const neu = herausnehmen(haken[gruppe], zufall(0, haken[gruppe].length - 1));
            const strang = { kopf: neu.von, rang: neu.rang, aussen: neu.aussen, plan: neu.plan, nr: 0 };
            if (strangWeiter(strang)) {
                straenge.push(strang);
                return true;
            }
        }
    };

    // Baut das alte Holz immer gleich auf, und danach die jungen Triebe dieses Durchgangs
    const aufbauen = gewachsen => {
        belegt = new Set(['0,0,0']);
        linien = [];
        dichte = new Map();
        straenge = [];
        haken = [[], [], [], []];
        stamm = 0;
        stuecke = 0;
        wuerfel = wuerfelAus(textZuZahl(kennung));
        sammlung = {};
        while (stuecke < basis && schritt());
        sammlungZeichnen(altEbene);
        wuerfel = wuerfelAus(textZuZahl(kennung + ':' + triebNummer));
        sammlung = {};
        while (stuecke < basis + gewachsen && schritt());
        sammlungZeichnen(triebEbene);
    };

    const merken = () => {
        if (!nurAnschauen) baumMerken({ kennung, tage, nummer: triebNummer, gewachsen: stuecke - basis });
    };

    const weiter = () => {
        if (stuecke < ziel && schritt()) {
            merken();
            uhr = setTimeout(weiter, BAUM_TAKT);
            return;
        }
        // Der Baum ist so gross wie sein Alter: eine Weile stehen lassen, dann wachsen die Triebe neu
        uhr = setTimeout(() => {
            triebEbene.classList.add('verblasst');
            uhr = setTimeout(() => {
                triebEbene.classList.remove('verblasst');
                triebNummer++;
                aufbauen(0);
                merken();
                weiter();
            }, 8000);
        }, 300000);
    };

    // Setzt das Alter. Ohne gemerkten Stand ist der Baum fast fertig und wächst die letzten Stücke sichtbar
    const pflanzen = (neueTage, gewachsen) => {
        clearTimeout(uhr);
        triebEbene.classList.remove('verblasst');
        tage = neueTage;
        ziel = stueckeFuerAlter(tage);
        trieb = Math.min(BAUM_TRIEBE, Math.round(ziel * 0.3));
        basis = ziel - trieb;
        hoehe = Math.round(2.4 * Math.pow(ziel, 0.4));
        breite = hoehe * 1.0;
        aufbauen(ruhig ? trieb : gewachsen === null ? Math.max(0, trieb - 20) : gewachsen);
        if (!ruhig && !spaeterWachsen) weiter();
    };

    const gemerkt = nurAnschauen ? null : baumLesen(kennung);
    if (gemerkt) triebNummer = gemerkt.nummer;
    // Die Grösse kommt immer vom echten Alter. Der gemerkte Stand gilt nur am selben Tag, danach ist der Baum grösser
    pflanzen(startTage, gemerkt && gemerkt.tage === startTage ? gemerkt.gewachsen : null);
    return {
        alter: () => tage,
        linien: () => linien,
        stoppen: () => clearTimeout(uhr),
        // Wie die Stücke aussehen, wenn man den Baum von einer anderen Seite ansieht
        ansicht: dreh => linie => {
            const a = abbilden(linie.a, dreh);
            const b = abbilden(linie.b, dreh);
            return { klasse: klasseFuer(linie.rang, a, b), pa: [a.x, a.y], pb: [b.x, b.y] };
        },
        wachsenLassen: () => {
            if (!ruhig) weiter();
        }
    };
};

// Lässt den Baum im Zeitraffer wachsen oder sich abbauen. Solange das läuft, sind die normalen Ebenen versteckt.
// drehen: Er dreht sich dabei langsam um den Stamm, gleich schnell wie in der grossen Ansicht
const filmFuer = (baum, altEbene, triebEbene, filmEbene, drehen = false) => {
    const pfade = new Map();
    let stand = 1;
    let dreh = BLICK.dreh;
    let lauf = null;
    let letztesBild = null;
    let tickLaeuft = false;
    let aus = false;

    const ebenenVerstecken = ja => {
        altEbene.style.display = ja ? 'none' : '';
        triebEbene.style.display = ja ? 'none' : '';
    };

    const bild = () => {
        const linien = baum.linien();
        const neu = filmPfade(linien, stand * linien.length, drehen ? baum.ansicht(dreh) : undefined);
        pfade.forEach((pfad, klasse) => {
            if (!(klasse in neu)) pfad.setAttribute('d', '');
        });
        Object.entries(neu).forEach(([klasse, d]) => {
            if (!pfade.has(klasse)) {
                pfade.set(klasse, svgTeil('path', { class: klasse }));
                filmEbene.append(pfade.get(klasse));
            }
            pfade.get(klasse).setAttribute('d', d);
        });
    };

    const laufBeenden = () => {
        const { bis, fertig, wache } = lauf;
        clearTimeout(wache);
        stand = bis;
        lauf = null;
        if (bis === 1 && !drehen) {
            // Der eigene Baum ist da: zurück zu den normalen Ebenen, ab jetzt wächst er in seinem echten Tempo
            filmEbene.replaceChildren();
            pfade.clear();
            ebenenVerstecken(false);
            baum.wachsenLassen();
        } else {
            bild();
        }
        if (bis === 0) aus = true;
        fertig();
    };

    const tick = jetzt => {
        if (aus) {
            tickLaeuft = false;
            return;
        }
        if (drehen) {
            if (letztesBild !== null) dreh += Math.min(100, jetzt - letztesBild) * DREH_TEMPO;
            letztesBild = jetzt;
        }
        if (lauf) {
            const t = Math.min(1, (jetzt - lauf.beginn) / lauf.dauer);
            if (t >= 1) laufBeenden();
            else stand = lauf.von + (lauf.bis - lauf.von) * sanft(t);
        }
        if (aus || (!drehen && !lauf)) {
            tickLaeuft = false;
            return;
        }
        bild();
        requestAnimationFrame(tick);
    };

    const loslegen = () => {
        if (tickLaeuft) return;
        tickLaeuft = true;
        requestAnimationFrame(tick);
    };

    const spielen = ({ von = stand, bis, dauer }) =>
        new Promise(fertig => {
            if (lauf) {
                clearTimeout(lauf.wache);
                lauf.fertig();
            }
            baum.stoppen();
            ebenenVerstecken(true);
            stand = von;
            const meiner = { von, bis, dauer, beginn: performance.now(), fertig, wache: null };
            // In einem Tab im Hintergrund steht requestAnimationFrame still, der Ablauf darf trotzdem nicht hängen
            meiner.wache = setTimeout(() => {
                if (lauf === meiner) laufBeenden();
            }, dauer + 300);
            lauf = meiner;
            bild();
            loslegen();
        });

    // Steht sofort fertig da und dreht sich nur noch
    const stehen = () => {
        ebenenVerstecken(true);
        bild();
        loslegen();
    };

    return { spielen, stehen, anhalten: () => (aus = true) };
};

// Zeichenfläche mit Gitter und drei Ebenen für den Baum
const rahmenBauen = () => {
    const gitter = svgFlaeche('hg-gitter');
    gitter.append(svgTeil('path', { d: gitterLinien() }));
    const bild = svgFlaeche('hg-baum');
    const altEbene = svgTeil('g', {});
    const triebEbene = svgTeil('g', {});
    const filmEbene = svgTeil('g', {});
    bild.append(altEbene, triebEbene, filmEbene);
    const rahmen = document.createElement('div');
    rahmen.className = 'hintergrund';
    rahmen.append(gitter, bild);
    document.body.prepend(rahmen);
    return { rahmen, altEbene, triebEbene, filmEbene };
};

// Der Baum auf der Startseite: Wer nicht angemeldet ist, hat noch keinen eigenen. Er merkt sich nichts
// Weniger Stücke und weniger Gedränge als ein echter Baum in diesem Alter, damit er luftig bleibt
const MUSTER = { kennung: 'vindelis', tage: 150, dichte: [99, 12, 7, 5] };
const MUSTER_WACHSEN_MS = 10000;
// Gleich schnell wie in der grossen Ansicht, eine Umdrehung dauert gut zweieinhalb Minuten
const DREH_TEMPO = 0.00004;
// Ein junger Baum mit wenigen Stücken ist schneller fertig als ein alter
const eigenerBaumMs = stuecke => Math.min(3000, 800 + stuecke * 30);

// Steht ausserhalb von #app, so wächst der Baum beim Seitenwechsel einfach weiter. Auf dem Handy gibt es ihn nicht
// muster: der grosse Baum der Startseite. fertig: steht sofort da, statt zu wachsen.
// vorgaenger: übernimmt dessen Gitter und wächst aus der Wurzel, dort wo sich der Vorgänger abgebaut hat
export const hintergrundStarten = ({ muster = false, fertig = false, vorgaenger = null } = {}) => {
    if (window.matchMedia('(max-width: 760px)').matches) return null;
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const teile = vorgaenger ? vorgaenger.teile : rahmenBauen();
    const { rahmen, altEbene, triebEbene, filmEbene } = teile;
    filmEbene.replaceChildren();
    // Nur zum Anschauen: ?id=irgendwas zeigt den Baum einer anderen ID und merkt sich nichts
    const andereId = new URLSearchParams(location.search).get('id');
    const baum = muster
        ? baumPflanzen(altEbene, triebEbene, MUSTER.kennung, true, MUSTER.tage, true, MUSTER.dichte)
        : baumPflanzen(
              altEbene,
              triebEbene,
              andereId || DATEN.mensch.id || 'gast',
              Boolean(andereId),
              DATEN.mensch.tage,
              Boolean(vorgaenger)
          );
    const film = filmFuer(baum, altEbene, triebEbene, filmEbene, muster && !ruhig);

    // Auf der Startseite gibt es keine grosse Ansicht, der Baum muss nur wieder verschwinden können
    if (muster) {
        if (!ruhig) {
            if (fertig) film.stehen();
            else film.spielen({ von: 0, bis: 1, dauer: MUSTER_WACHSEN_MS });
        }
        return {
            teile,
            abbauen: dauer => film.spielen({ bis: 0, dauer }),
            entfernen: () => {
                film.anhalten();
                baum.stoppen();
                rahmen.remove();
            }
        };
    }
    if (vorgaenger) film.spielen({ von: 0, bis: 1, dauer: eigenerBaumMs(baum.linien().length) });

    // Öffnet die grosse Ansicht. Sie beginnt genau dort, wo der Baum gerade im Hintergrund steht
    huelle.baumOeffnen = () => {
        const flaeche = rahmen.getBoundingClientRect();
        const massstab = flaeche.width / FLAECHE.breite;
        baumBuehneOeffnen({
            linien: baum.linien,
            tage: baum.alter(),
            blick: BLICK,
            takt: BAUM_TAKT,
            start: {
                x: flaeche.left + WURZEL.x * massstab,
                y: flaeche.top + WURZEL.y * massstab,
                zoom: BAUM_RASTER * massstab
            }
        });
    };

    // Ein Klick auf die freie Fläche beim Baum öffnet ihn auch. Karten, Knöpfe und Menü bleiben unberührt
    const aufDemBaum = e => {
        if (
            e.target.closest(
                'a, button, input, textarea, select, .bp-karte, .bp-hinweis, .bp-segment, .db-seite, .dlg-grund, .baum-buehne'
            )
        )
            return false;
        const flaeche = rahmen.getBoundingClientRect();
        return e.clientX >= flaeche.left + flaeche.width * 0.45 && e.clientY >= flaeche.top;
    };
    document.addEventListener('click', e => {
        if (aufDemBaum(e)) huelle.baumOeffnen();
    });
    document.addEventListener('mousemove', e => {
        document.body.classList.toggle('ueber-baum', aufDemBaum(e));
    });
};
