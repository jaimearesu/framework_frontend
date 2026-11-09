// Grosse Ansicht des eigenen Baums: Alles andere blendet aus, der Baum wandert in die Mitte,
// spult zurück bis zum Keimling und wächst im Zeitraffer bis heute, die Ansicht zoomt dabei heraus.
// Danach wächst er in Echtzeit weiter. Mit der Maus lässt er sich drehen.
// Gezeichnet wird auf eine Leinwand (canvas), dafür braucht es keine fremde Bibliothek.
import { h, ikon } from './ui.js';

const BUEHNE_BREITE = [1.7, 1.2, 0.8, 0.55];
const BUEHNE_DECKKRAFT = [0.72, 0.56, 0.42, 0.28];
const DAUER_MITTE = 1400;
const DAUER_ZURUECK = 1800;
// Wie lange der Zeitraffer dauert, in Minuten. 0 heisst: kurz, je nach Grösse des Baums höchstens 20 Sekunden
const ZEITRAFFER = [
    [0, 'Kurz'],
    [5, '5 Min'],
    [15, '15 Min'],
    [30, '30 Min'],
    [60, '1 Std']
];
// Bleibt erhalten, wenn man die Ansicht schliesst und wieder öffnet
const BUEHNE_WAHL = { minuten: 0, drehen: true };

const sanft = t => t * t * (3 - 2 * t);

// Schreibt eine Anzahl Tage so, wie man es sagen würde
const dauerText = tage => {
    if (tage < 2) return 'Erster Tag auf vindelis';
    if (tage < 30) return tage + ' Tage auf vindelis';
    if (tage < 365) {
        const monate = Math.floor(tage / 30);
        return monate + (monate === 1 ? ' Monat' : ' Monate') + ' auf vindelis';
    }
    const jahre = Math.floor(tage / 365);
    const monate = Math.floor((tage % 365) / 30);
    return (
        jahre +
        (jahre === 1 ? ' Jahr' : ' Jahre') +
        (monate ? ', ' + monate + (monate === 1 ? ' Monat' : ' Monate') : '') +
        ' auf vindelis'
    );
};

// Die Mulde im Boden, aus der der Baum herauskommt
const bodenHoehe = (i, k) => 4 - 4 * Math.exp(-(i * i + k * k) / 90);

// baum: { linien() = alle Stücke in Wuchs-Reihenfolge, tage, start = Lage des Baums im Hintergrund, blick, takt }
export const baumBuehneOeffnen = baum => {
    if (document.getElementById('baum-buehne')) return;
    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const leinwand = h('canvas', { class: 'bb-leinwand', 'aria-hidden': 'true' });
    const pinsel = leinwand.getContext('2d');
    const zeitGross = h('b', {}, '');
    const zeitKlein = h('span', { class: 'leise' }, '');
    const uhr = h('div', { class: 'bb-uhr', id: 'bb-uhr' }, '');
    const knopf = h(
        'button',
        { class: 'bp-btn bp-btn-o bp-btn-klein', id: 'bb-knopf', type: 'button', onclick: () => knopfGedrueckt() },
        ''
    );
    const drehKnopf = h(
        'button',
        { class: 'bp-btn bp-btn-o bp-btn-klein', id: 'bb-drehen', type: 'button', onclick: () => drehenWechseln() },
        ''
    );
    const raffKnoepfe = ZEITRAFFER.map(([minuten, text]) =>
        h(
            'button',
            {
                type: 'button',
                role: 'tab',
                id: 'raffer-' + minuten,
                'aria-selected': minuten === BUEHNE_WAHL.minuten ? 'true' : 'false',
                onclick: () => zeitrafferWaehlen(minuten)
            },
            text
        )
    );
    const buehne = h(
        'div',
        { class: 'baum-buehne', id: 'baum-buehne', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mein Baum' },
        leinwand,
        uhr,
        h(
            'button',
            {
                class: 'bp-ikonknopf bb-zu',
                id: 'bb-zu',
                type: 'button',
                'aria-label': 'Schliessen',
                onclick: () => zu()
            },
            ikon('kreuz')
        ),
        h(
            'div',
            { class: 'bb-fuss' },
            h('div', { class: 'bb-zeit', id: 'bb-zeit' }, zeitGross, zeitKlein),
            h(
                'div',
                { class: 'bb-raffer' },
                h('span', { class: 'leise' }, 'Zeitraffer'),
                h('div', { class: 'bp-segment', role: 'tablist', 'aria-label': 'Dauer des Zeitraffers' }, raffKnoepfe)
            ),
            h('div', { class: 'bb-knoepfe' }, drehKnopf, knopf)
        )
    );

    const farben = getComputedStyle(document.body);
    const farbeBaum = farben.getPropertyValue('--muted').trim();
    const farbeGitter = farben.getPropertyValue('--border-strong').trim();

    let breite, hoehe, punktDichte;
    const groesseSetzen = () => {
        punktDichte = Math.min(2, window.devicePixelRatio || 1);
        breite = window.innerWidth;
        hoehe = window.innerHeight;
        leinwand.width = Math.round(breite * punktDichte);
        leinwand.height = Math.round(hoehe * punktDichte);
    };

    // Merkt sich für jede Stückzahl, wie hoch und breit der Baum dann ist. Das braucht das automatische Zoomen
    let bekannteListe = null;
    let masse = [];
    const masseNachfuehren = liste => {
        if (liste !== bekannteListe) {
            bekannteListe = liste;
            masse = [{ h: 0, r: 0 }];
        }
        while (masse.length <= liste.length) {
            const b = liste[masse.length - 1].b;
            const vorher = masse[masse.length - 1];
            masse.push({ h: Math.max(vorher.h, b[1]), r: Math.max(vorher.r, Math.hypot(b[0], b[2])) });
        }
    };

    // Der Boden wird einmal berechnet und passt zur Grösse des ganzen Baums
    masseNachfuehren(baum.linien());
    const bodenRand = Math.max(24, Math.ceil(masse[masse.length - 1].r * 1.4));
    const bodenLinien = [];
    const bodenStueck = (a, b) => {
        const weite = Math.hypot(a[0], a[2]) / bodenRand;
        if (weite < 1) bodenLinien.push({ a, b, stufe: weite < 0.4 ? 0 : weite < 0.7 ? 1 : 2 });
    };
    for (let spur = -bodenRand; spur <= bodenRand; spur += 6) {
        for (let lauf = -bodenRand; lauf < bodenRand; lauf += 3) {
            bodenStueck([spur, bodenHoehe(spur, lauf), lauf], [spur, bodenHoehe(spur, lauf + 3), lauf + 3]);
            bodenStueck([lauf, bodenHoehe(lauf, spur), spur], [lauf + 3, bodenHoehe(lauf + 3, spur), spur]);
        }
    }

    let drehung = baum.blick.dreh;
    let neigung = baum.blick.neig;
    let lage = { x: baum.start.x, y: baum.start.y, zoom: baum.start.zoom };
    let abschnitt = ruhig ? 'jetzt' : 'mitte';
    let abschnittStart = performance.now();
    let letztesBild = abschnittStart;
    let ziehen = null;
    let bildNummer = 0;
    let offen = true;

    const abschnittSetzen = neu => {
        abschnitt = neu;
        abschnittStart = performance.now();
        knopf.textContent = neu === 'jetzt' ? 'Nochmals ansehen' : 'Überspringen';
    };
    abschnittSetzen(abschnitt);
    const knopfGedrueckt = () => abschnittSetzen(abschnitt === 'jetzt' ? 'zurueck' : 'jetzt');

    // Eine neue Dauer spult zurück und lässt den Baum im gewählten Tempo neu wachsen
    const zeitrafferWaehlen = minuten => {
        BUEHNE_WAHL.minuten = minuten;
        raffKnoepfe.forEach((k, i) => k.setAttribute('aria-selected', ZEITRAFFER[i][0] === minuten ? 'true' : 'false'));
        abschnittSetzen('zurueck');
    };

    const drehKnopfBeschriften = () => {
        drehKnopf.textContent = BUEHNE_WAHL.drehen ? 'Drehen aus' : 'Drehen an';
    };
    const drehenWechseln = () => {
        BUEHNE_WAHL.drehen = !BUEHNE_WAHL.drehen;
        drehKnopfBeschriften();
    };
    drehKnopfBeschriften();

    // Wo und wie gross der Baum stehen soll, damit er bei dieser Stückzahl ganz zu sehen ist
    const zielLage = stuecke => {
        const mass = masse[Math.min(stuecke, masse.length - 1)];
        const h1 = Math.max(mass.h, 6);
        const r1 = Math.max(mass.r, 4);
        const zoom = Math.min((hoehe * 0.72) / h1, (breite * 0.42) / r1);
        return { x: breite / 2, y: hoehe / 2 + h1 * zoom * 0.5, zoom };
    };

    const wachsDauer = anzahl =>
        BUEHNE_WAHL.minuten ? BUEHNE_WAHL.minuten * 60000 : Math.min(20000, 5000 + anzahl * 10);

    const bild = jetzt => {
        if (!offen) return;
        const liste = baum.linien();
        masseNachfuehren(liste);
        const gesamt = liste.length;
        const zeit = jetzt - abschnittStart;
        const schritt = jetzt - letztesBild;
        letztesBild = jetzt;
        let sichtbar = gesamt;
        // Wie weit das nächste Stück schon gezeichnet ist: Bei langem Zeitraffer wachsen die Linien so fliessend
        let teilStueck = 0;

        if (abschnitt === 'mitte') {
            const f = sanft(Math.min(1, zeit / DAUER_MITTE));
            const ziel = zielLage(gesamt);
            lage = {
                x: baum.start.x + (ziel.x - baum.start.x) * f,
                y: baum.start.y + (ziel.y - baum.start.y) * f,
                zoom: baum.start.zoom + (ziel.zoom - baum.start.zoom) * f
            };
            if (f >= 1) abschnittSetzen('zurueck');
        } else {
            if (abschnitt === 'zurueck') {
                const f = sanft(Math.min(1, zeit / DAUER_ZURUECK));
                sichtbar = Math.max(1, Math.round(gesamt * (1 - f)));
                if (f >= 1) abschnittSetzen('wachsen');
            } else if (abschnitt === 'wachsen') {
                const f = Math.min(1, zeit / wachsDauer(gesamt));
                // Der kurze Zeitraffer beginnt langsam, die langen laufen gleichmässig
                const genau = 1 + (gesamt - 1) * (BUEHNE_WAHL.minuten ? f : Math.pow(f, 1.5));
                sichtbar = Math.floor(genau);
                teilStueck = genau - sichtbar;
                if (f >= 1) abschnittSetzen('jetzt');
            }
            // Die Ansicht folgt dem Baum weich: Wächst er, zoomt sie von selbst heraus
            const ziel = zielLage(sichtbar);
            const folgen = 1 - Math.exp(-schritt / 350);
            lage = {
                x: lage.x + (ziel.x - lage.x) * folgen,
                y: lage.y + (ziel.y - lage.y) * folgen,
                zoom: lage.zoom + (ziel.zoom - lage.zoom) * folgen
            };
            if (!ziehen && !ruhig && BUEHNE_WAHL.drehen) drehung += schritt * 0.00004;
        }

        const cosD = Math.cos(drehung);
        const sinD = Math.sin(drehung);
        const cosN = Math.cos(neigung);
        const sinN = Math.sin(neigung);
        const abstand = Math.max(120, bodenRand * 3);
        const abbilden3d = ([i, j, k]) => {
            const quer = i * cosD - k * sinD;
            const tiefe = i * sinD + k * cosD;
            const nah = abstand / (abstand + tiefe);
            return [lage.x + quer * lage.zoom * nah, lage.y - (j * cosN + tiefe * sinN) * lage.zoom * nah, tiefe];
        };

        pinsel.setTransform(punktDichte, 0, 0, punktDichte, 0, 0);
        pinsel.clearRect(0, 0, breite, hoehe);
        pinsel.lineCap = 'round';

        // Boden: In drei Stufen, damit er nach aussen ausläuft
        pinsel.strokeStyle = farbeGitter;
        pinsel.lineWidth = 0.6;
        const bodenWege = [new Path2D(), new Path2D(), new Path2D()];
        bodenLinien.forEach(({ a, b, stufe }) => {
            const p = abbilden3d(a);
            const q = abbilden3d(b);
            bodenWege[stufe].moveTo(p[0], p[1]);
            bodenWege[stufe].lineTo(q[0], q[1]);
        });
        bodenWege.forEach((weg, stufe) => {
            pinsel.globalAlpha = [0.7, 0.4, 0.16][stufe];
            pinsel.stroke(weg);
        });

        // Baum: pro Stärke und Tiefe ein gemeinsamer Weg, das hält das Zeichnen schnell
        pinsel.strokeStyle = farbeBaum;
        const radius = Math.max(4, masse[Math.min(sichtbar, masse.length - 1)].r);
        const wege = new Map();
        const zeichnenBis = Math.min(gesamt, sichtbar + (teilStueck > 0 ? 1 : 0));
        for (let n = 0; n < zeichnenBis; n++) {
            const stueck = liste[n];
            const p = abbilden3d(stueck.a);
            let q = abbilden3d(stueck.b);
            // Das Stück, das gerade wächst, wird nur so weit gezeichnet, wie es schon ist
            let anteil = n === sichtbar ? teilStueck : 1;
            if (abschnitt === 'jetzt' && stueck.seit && jetzt - stueck.seit < baum.takt)
                anteil = (jetzt - stueck.seit) / baum.takt;
            if (anteil < 1) q = [p[0] + (q[0] - p[0]) * anteil, p[1] + (q[1] - p[1]) * anteil];
            const stufe = Math.max(0, Math.min(3, Math.floor(((p[2] + radius) / (2 * radius + 1)) * 4)));
            const schluessel = stueck.rang * 4 + stufe;
            if (!wege.has(schluessel)) wege.set(schluessel, new Path2D());
            const weg = wege.get(schluessel);
            weg.moveTo(p[0], p[1]);
            weg.lineTo(q[0], q[1]);
        }
        wege.forEach((weg, schluessel) => {
            pinsel.lineWidth = BUEHNE_BREITE[Math.floor(schluessel / 4)];
            pinsel.globalAlpha = BUEHNE_DECKKRAFT[schluessel % 4];
            pinsel.stroke(weg);
        });
        pinsel.globalAlpha = 1;

        // Zeit unten links: passt zur Stückzahl, die gerade sichtbar ist. Die Anzeige wird nur alle paar Bilder erneuert
        if (bildNummer++ % 4 === 0) {
            const tag = Math.max(1, Math.round(baum.tage * Math.pow(sichtbar / Math.max(1, gesamt), 1 / 0.66)));
            zeitGross.textContent = 'Tag ' + tag.toLocaleString('de-CH');
            zeitKlein.textContent = dauerText(tag);
            uhr.textContent = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        }
        requestAnimationFrame(bild);
    };

    // Mit der Maus oder dem Finger drehen
    leinwand.addEventListener('pointerdown', e => {
        ziehen = { x: e.clientX, y: e.clientY };
        leinwand.setPointerCapture(e.pointerId);
    });
    leinwand.addEventListener('pointermove', e => {
        if (!ziehen) return;
        drehung += (e.clientX - ziehen.x) * 0.008;
        neigung = Math.max(-0.05, Math.min(0.85, neigung + (e.clientY - ziehen.y) * 0.005));
        ziehen = { x: e.clientX, y: e.clientY };
    });
    const ziehenEnde = () => {
        ziehen = null;
    };
    leinwand.addEventListener('pointerup', ziehenEnde);
    leinwand.addEventListener('pointercancel', ziehenEnde);

    const tasteGedrueckt = e => {
        if (e.key === 'Escape') zu();
    };

    function zu() {
        if (!offen) return;
        offen = false;
        document.removeEventListener('keydown', tasteGedrueckt);
        window.removeEventListener('resize', groesseSetzen);
        document.body.style.overflow = '';
        buehne.classList.remove('offen');
        setTimeout(() => buehne.remove(), 500);
    }

    groesseSetzen();
    window.addEventListener('resize', groesseSetzen);
    document.addEventListener('keydown', tasteGedrueckt);
    document.body.style.overflow = 'hidden';
    document.body.append(buehne);
    requestAnimationFrame(() => {
        buehne.classList.add('offen');
        letztesBild = performance.now();
        requestAnimationFrame(bild);
    });
};
