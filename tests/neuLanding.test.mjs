// Startseite und Übergang ins Cockpit (Plan U, nach U6)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    RECHTLICHES,
    TEXTE,
    SPRACHEN,
    fussVersatz,
    anmeldungHolen,
    anmeldungMerken,
    spracheWaehlen,
    spracheMerken,
    gemerkteSprache,
    zahlSchreiben,
    zahlAusAntwort,
    zwischenWert
} from '../public/neu/js/landing-werte.js';
import { filmPfade, sanft } from '../public/neu/js/baum-film.js';

const lies = datei => readFileSync(new URL('../public/neu/' + datei, import.meta.url), 'utf8');

const speicherAttrappe = () => {
    const werte = new Map();
    const speicher = {
        getItem: k => werte.get(k) ?? null,
        setItem: (k, v) => werte.set(k, v),
        removeItem: k => werte.delete(k)
    };
    return () => speicher;
};

test('Ohne Klick auf Anmelden gibt es keinen Übergang', () => {
    assert.equal(anmeldungHolen(speicherAttrappe()), false);
});

test('Der Übergang läuft nach dem Klick genau einmal', () => {
    const speicher = speicherAttrappe();
    anmeldungMerken(speicher);
    assert.equal(anmeldungHolen(speicher), true);
    assert.equal(anmeldungHolen(speicher), false);
});

test('Ohne Speicher geht nichts kaputt', () => {
    const kaputt = () => {
        throw new Error('gesperrt');
    };
    assert.doesNotThrow(() => anmeldungMerken(kaputt));
    assert.equal(anmeldungHolen(kaputt), false);
});

test('Beide Anmelde-Links der Startseite merken sich den Klick', () => {
    const code = lies('js/anmelden.js');
    assert.equal(code.match(/onclick: \(\) => anmeldungMerken\(\)/g).length, 2);
    assert.match(code, /id: 'als-gast'/);
});

test('Der Beispiel-Baum überschreibt nie den gemerkten eigenen Baum', () => {
    assert.match(lies('js/hintergrund.js'), /MUSTER\.kennung, true, MUSTER\.tage/);
});

const LINIEN = [
    { klasse: 'a', pa: [0, 0], pb: [0, 10] },
    { klasse: 'b', pa: [0, 10], pb: [10, 10] },
    { klasse: 'a', pa: [10, 10], pb: [10, 20] }
];

test('Der Baum wächst von der Wurzel aus, in seiner Reihenfolge', () => {
    assert.deepEqual(filmPfade(LINIEN, 0), {});
    assert.deepEqual(filmPfade(LINIEN, 1), { a: 'M0.0 0.0L0.0 10.0' });
    assert.deepEqual(filmPfade(LINIEN, 3), {
        a: 'M0.0 0.0L0.0 10.0M10.0 10.0L10.0 20.0',
        b: 'M0.0 10.0L10.0 10.0'
    });
});

test('Die letzte Linie darf halb gezeichnet sein, zu viel schadet nicht', () => {
    assert.deepEqual(filmPfade(LINIEN, 1.5), { a: 'M0.0 0.0L0.0 10.0', b: 'M0.0 10.0L5.0 10.0' });
    assert.deepEqual(filmPfade(LINIEN, 99), filmPfade(LINIEN, 3));
});

test('Dreht sich der Baum, zählt die neue Blickrichtung samt ihrer Tiefe', () => {
    const gedreht = linie => ({ klasse: 'tief', pa: [linie.pa[0] + 1, 0], pb: [linie.pb[0] + 1, 0] });
    assert.deepEqual(filmPfade(LINIEN.slice(0, 1), 1, gedreht), { tief: 'M1.0 0.0L1.0 0.0' });
    assert.deepEqual(filmPfade(LINIEN.slice(0, 1), 0.5, gedreht), { tief: 'M1.0 0.0L1.0 0.0' });
});

test('Das V sitzt am selben Ort wie das Logo im Cockpit', () => {
    const css = lies('css/cockpit.css');
    const block = css.slice(css.indexOf('.landing-kopf {'));
    assert.match(block, /top: 20px;[^}]*left: 20px;[^}]*height: 16px;/);
    assert.match(block, /max-width: 760px\)[^]*?left: 24px;/);
});

test('Text und Baum stehen als ein Block in der Mitte, auch auf breiten Bildschirmen', () => {
    const css = lies('css/cockpit.css');
    const baum = css.slice(css.indexOf('body.landing-baum .hintergrund {'));
    assert.match(baum.slice(0, 200), /var\(--landing-versatz\) - 50vw/);
    assert.match(css, /calc\(50vw - var\(--landing-versatz\) - var\(--landing-breite\) \* 0\.41/);
});

test('Unter dem Baum steht zuerst, wie man Claude und ChatGPT verbindet', () => {
    for (const sprache of SPRACHEN) {
        const verbinden = TEXTE[sprache].verbinden;
        assert.deepEqual(
            verbinden.map(k => k.name),
            ['Claude', 'ChatGPT']
        );
        // Die Seite «Erlauben» ist nur Deutsch, also muss das Wort auch im Englischen stehen
        for (const k of verbinden) assert.match(k.schritte.at(-1), /Erlauben/);
    }
    const code = lies('js/landing-inhalt.js');
    assert.ok(code.indexOf('abschnittVerbinden(t),') < code.indexOf('abschnittAufbau(t), fussBauen(t)'));
});

test('Rechtliche Seiten ohne Adresse sind keine toten Links', () => {
    for (const eintrag of RECHTLICHES) assert.equal(eintrag.href, null);
    for (const sprache of SPRACHEN) assert.equal(TEXTE[sprache].rechtliches.length, RECHTLICHES.length);
    assert.match(
        lies('js/landing-inhalt.js'),
        /href \? h\('a', \{ href \}, text\) : h\('span', \{\}, text, h\('small'/
    );
});

test('Deutsch nur für einen deutschen Browser, sonst Englisch', () => {
    assert.equal(spracheWaehlen(['de-CH', 'en']), 'de');
    assert.equal(spracheWaehlen(['DE']), 'de');
    assert.equal(spracheWaehlen(['en-US', 'de']), 'en');
    assert.equal(spracheWaehlen(['fr-CH', 'de-CH']), 'de');
    assert.equal(spracheWaehlen(['fr', 'it']), 'en');
    assert.equal(spracheWaehlen([]), 'en');
    assert.equal(spracheWaehlen([undefined]), 'en');
});

test('Eine gemerkte Wahl gilt vor dem Browser, eine kaputte nicht', () => {
    assert.equal(spracheWaehlen(['de-CH'], 'en'), 'en');
    assert.equal(spracheWaehlen(['en'], 'de'), 'de');
    assert.equal(spracheWaehlen(['de-CH'], 'xx'), 'de');
    assert.equal(spracheWaehlen(['en'], null), 'en');
});

test('Die Wahl der Sprache bleibt gemerkt, ohne Speicher geht nichts kaputt', () => {
    const speicher = speicherAttrappe();
    assert.equal(gemerkteSprache(speicher), null);
    spracheMerken('en', speicher);
    assert.equal(gemerkteSprache(speicher), 'en');
    const kaputt = () => {
        throw new Error('gesperrt');
    };
    assert.doesNotThrow(() => spracheMerken('de', kaputt));
    assert.equal(gemerkteSprache(kaputt), null);
});

test('Beide Sprachen haben dieselben Texte, keiner fehlt', () => {
    const form = wert =>
        Array.isArray(wert)
            ? wert.map(form)
            : wert && typeof wert === 'object'
              ? Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, form(v)]))
              : typeof wert;
    assert.deepEqual(form(TEXTE.en), form(TEXTE.de));
    for (const sprache of SPRACHEN) {
        assert.equal(TEXTE[sprache].verbinden[0].schritte.length, TEXTE.de.verbinden[0].schritte.length);
        assert.equal(TEXTE[sprache].aufbau.length, TEXTE.de.aufbau.length);
    }
});

test('Unter dem Titel steht kurz, was vindelis ist, und dass gebaut wird über MCP', () => {
    for (const sprache of SPRACHEN) {
        const lead = TEXTE[sprache].lead;
        assert.match(lead, /MCP/);
        assert.ok(lead.length < 200, sprache + ': ' + lead.length);
    }
    const seite = lies('js/anmelden.js');
    assert.match(seite, /h\('p', \{ class: 'landing-lead' \}, t\.lead\)/);
    assert.doesNotMatch(seite, /Deine KI baut die Website/);
});

test('Die Objekt-Zahl ist in der Sprache der Seite geschrieben', () => {
    assert.equal(TEXTE.de.zahl(zahlSchreiben(2307, 'de')), "Schon 2'307 Objekte gebaut.");
    assert.equal(TEXTE.en.zahl(zahlSchreiben(2307, 'en')), '2,307 objects built so far.');
    assert.equal(zahlSchreiben(999.6, 'de'), "1'000");
    assert.equal(zahlSchreiben(1234567, 'de'), "1'234'567");
});

test('Nur eine echte Zahl vom Backend wird gezeigt, alles andere nicht', () => {
    assert.equal(zahlAusAntwort({ ok: true, data: { data: { objects: 2307 } } }), 2307);
    assert.equal(zahlAusAntwort({ ok: true, data: { data: { objects: null } } }), null);
    assert.equal(zahlAusAntwort({ ok: false, status: 0, data: null }), null);
    assert.equal(zahlAusAntwort({ ok: true, data: { data: { objects: '2307' } } }), null);
    assert.equal(zahlAusAntwort({ ok: true, data: { data: { objects: -5 } } }), null);
    assert.equal(zahlAusAntwort(undefined), null);
});

test('Die Zahl zählt von 0 hoch und hört genau beim Ziel auf', () => {
    assert.equal(zwischenWert(2307, 0), 0);
    assert.equal(zwischenWert(2307, 1), 2307);
    assert.equal(zwischenWert(2307, 5), 2307);
    assert.equal(zwischenWert(2307, -1), 0);
    assert.ok(zwischenWert(2307, 0.5) > 2307 / 2, 'am Anfang schnell, am Ende langsam');
});

test('Die Objekt-Zahl steht unter den Knöpfen und ruht ohne Bewegung', () => {
    const seite = lies('js/anmelden.js');
    assert.ok(seite.indexOf("'landing-knoepfe'") < seite.indexOf('objektZahl(sprache, t)'));
    const zahl = lies('js/landing-zahl.js');
    assert.match(zahl, /'\/api\/stats', \{ anonymous: true \}/);
    assert.match(zahl, /prefers-reduced-motion/);
    assert.match(zahl, /textContent/);
});

test('Das Cockpit stellt die Sprache der Seite wieder auf Deutsch', () => {
    assert.match(lies('js/anmelden.js'), /document\.documentElement\.lang = t\.lang/);
    assert.match(lies('js/app.js'), /document\.documentElement\.lang = 'de-CH'/);
});

test('Der Inhalt des Footers steigt auf, solange der Footer erst teilweise zu sehen ist', () => {
    assert.equal(fussVersatz(0, 400, 120), 120);
    assert.equal(fussVersatz(200, 400, 120), 60);
    assert.equal(fussVersatz(400, 400, 120), 0);
    assert.equal(fussVersatz(900, 400, 120), 0);
    assert.equal(fussVersatz(-50, 400, 120), 120);
    assert.equal(fussVersatz(10, 0, 120), 0);
});

test('Der Footer zeigt nur den Schriftzug, ohne Zeichen', () => {
    assert.match(lies('js/landing-inhalt.js'), /wortmarke.svg/);
    assert.equal(lies('bilder/wortmarke.svg').match(/<polygon/g), null);
});

test('Oben auf der Startseite steht nur das V', () => {
    assert.match(lies('js/anmelden.js'), /h\('img', \{ src: LOGOS\.v, alt: 'vindelis' \}\)/);
});

test('Der Zeitraffer beginnt und endet genau', () => {
    assert.equal(sanft(0), 0);
    assert.equal(sanft(1), 1);
    assert.equal(sanft(0.5), 0.5);
});

test('Nach dem Login steht derselbe Baum sofort da, ohne Warten aufs Backend', () => {
    const app = lies('js/app.js');
    assert.ok(app.indexOf('startseitenBaum({ fertig: true })') < app.indexOf('await sitzungLaden()'));
});

test('Der eigene Baum übernimmt das Gitter des Beispiel-Baums', () => {
    assert.match(lies('js/verwandlung.js'), /hintergrundStarten\(\{ vorgaenger: beispielBaum \}\)/);
});

test('Wer keine Bewegung will, bekommt keine', () => {
    assert.match(lies('js/verwandlung.js'), /prefers-reduced-motion/);
    const css = lies('css/cockpit.css');
    const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const klasse of ['.hintergrund', '.landing', '#app.cockpit-kommt']) assert.ok(block.includes(klasse), klasse);
});
