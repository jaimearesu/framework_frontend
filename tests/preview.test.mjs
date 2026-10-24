// tests/preview.test.mjs
// ---------------------------------------------------------------------
// Tests für die Vorschau (core/preview.js): HTML aus ganzen Dokumenten
// holen, Kinder an ihren Platz setzen, Vorschau-Seite bauen.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    splitHtmlDocument,
    placeChildren,
    buildPreviewDocument,
    htmlLang,
    childBodyWarning,
    tagAttributes
} from '../public/js/core/preview.js';

describe('preview: splitHtmlDocument', () => {
    test('holt body und head aus einem ganzen Dokument (so liefert es das Backend)', () => {
        const r = splitHtmlDocument('<html><head><title>T</title></head><body class="x"><p>Hallo</p></body></html>');
        assert.deepEqual(r, { head: '<title>T</title>', body: '<p>Hallo</p>' });
    });
    test('ein HTML-Stück bleibt, wie es ist', () => {
        assert.deepEqual(splitHtmlDocument('<p>Nur ein Stück</p>'), { head: '', body: '<p>Nur ein Stück</p>' });
    });
    test('leer', () => {
        assert.deepEqual(splitHtmlDocument(null), { head: '', body: '' });
        assert.deepEqual(splitHtmlDocument('<html><head></head><body></body></html>'), { head: '', body: '' });
    });
});

describe('preview: placeChildren', () => {
    test('Kind kommt in seinen Platz (data-slot)', () => {
        const html = placeChildren('<main><div data-slot="produkte"></div><footer>F</footer></main>', [
            { identifier: 'produkte', html: '<ul>P</ul>' }
        ]);
        assert.equal(html, '<main><div data-slot="produkte"><ul>P</ul></div><footer>F</footer></main>');
    });
    test('ohne Platz: als Abschnitt der Reihe nach darunter', () => {
        const html = placeChildren('<h1>Shop</h1>', [
            { identifier: 'a', html: '<p>A</p>' },
            { identifier: 'b', html: '<p>B</p>' }
        ]);
        assert.equal(
            html,
            '<h1>Shop</h1>\n<section data-at0mic="a">\n<p>A</p>\n</section>\n<section data-at0mic="b">\n<p>B</p>\n</section>'
        );
    });
    test('ein Platz mit Inhalt oder falschem Namen wird nicht benutzt', () => {
        const html = placeChildren('<div data-slot="x">schon voll</div>', [{ identifier: 'y', html: 'Y' }]);
        assert.match(html, /schon voll/);
        assert.match(html, /data-at0mic="y"/);
    });
    test('seltsame Zeichen im identifier können den Platz-Suchbegriff nicht verbiegen', () => {
        const html = placeChildren('<div data-slot="ab"></div>', [{ identifier: 'a.*b', html: 'X' }]);
        // "a.*b" wird zu "ab" bereinigt -> landet im Platz "ab", nicht irgendwo sonst
        assert.equal(html, '<div data-slot="ab">X</div>');
    });
    // Runde 3 (24.10.), E2: gleiche Regel wie im Backend
    test('Kind ohne Inhalt und ohne Platz: keine leere Hülle', () => {
        const unplaced = [];
        const html = placeChildren(
            '<h1>Shop</h1>',
            [
                { identifier: 'dateien', html: '' },
                { identifier: 'ordner', html: '<section data-at0mic="bild">\n\n</section>' }
            ],
            unplaced
        );
        assert.equal(html, '<h1>Shop</h1>');
        assert.deepEqual(unplaced, []);
    });
});

describe('preview: buildPreviewDocument', () => {
    const doc = buildPreviewDocument({
        html: '<html><head></head><body><p>Hi</p></body></html>',
        css: ['p{color:red}', '', 'h1{}'],
        js: ['console.log(1)', 'var s = "</script>";']
    });
    test('kein Dokument im Dokument', () => {
        assert.equal((doc.match(/<body>/g) || []).length, 1);
        assert.match(doc, /<p>Hi<\/p>/);
    });
    test('jedes CSS/JS separat, leere weggelassen', () => {
        assert.equal((doc.match(/<style>/g) || []).length, 2);
        // 2 Kunden-Scripts + 1 Fehler-Melder
        assert.equal((doc.match(/<script>/g) || []).length, 3);
    });
    test('"</script>" im Code beendet den Script-Block nicht', () => {
        assert.match(doc, /var s = "<\\\/script>";/);
    });
    test('ohne HTML gibt es einen Hinweis statt einer weissen Fläche', () => {
        assert.match(buildPreviewDocument({}), /Kein HTML vorhanden/);
    });
    test('meldet Fehler ans Cockpit (Fehler-Melder ist eingebaut)', () => {
        assert.match(doc, /at0micPreview/);
    });
});

// Gleiche Regel wie das Backend (Finale 12.10.): lang übernehmen, nichts doppelt
describe('preview: Kopf der Seite', () => {
    test('lang aus dem HTML, charset/viewport genau einmal', () => {
        const doc = buildPreviewDocument({
            html: '<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>x</body></html>'
        });
        assert.match(doc, /^<!doctype html><html lang="de"><head>/);
        assert.equal(doc.match(/<meta charset/gi).length, 1);
        assert.equal(doc.match(/name="viewport"/gi).length, 1);
    });

    test('ohne Angaben: Standard-Kopf, ungültiges lang wird ignoriert', () => {
        // Seit E1 (22.10.) bleiben die übrigen Angaben an <html> (hier onload) – nur lang wird geprüft
        const doc = buildPreviewDocument({ html: '<html lang="x" onload="y"><body>x</body></html>' });
        assert.match(doc, /^<!doctype html><html onload="y"><head>\n<meta charset="utf-8">/);
        assert.equal(htmlLang('<html lang="fr-CH">'), 'fr-CH');
    });
});

// Plan "Lehren aus dem Restaurant-Test", E1 (22.10.): gleiche Regeln wie beim Ausliefern
describe('preview: nichts geht still verloren (E1)', () => {
    const ROOT =
        '<html lang="de" class="hell"><head><title>R</title><link rel="preconnect" href="https://fonts.gstatic.com"></head><body class="dunkel"><main>x</main></body></html>';

    test('Kopf der Wurzel und der Kinder, Angaben an <html>/<body> der Wurzel', () => {
        const warnings = [];
        const doc = buildPreviewDocument({
            html: ROOT,
            body: '<main>zusammengesetzt</main>',
            childHeads: [
                {
                    identifier: 'kueche',
                    head: '<title>K</title><link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="https://fonts.example/a.css">'
                }
            ],
            warnings
        });
        assert.match(doc, /<html lang="de" class="hell">/);
        assert.match(doc, /<\/head><body class="dunkel">/);
        assert.match(doc, /<title>R<\/title>/);
        assert.match(doc, /fonts\.example\/a\.css/);
        assert.doesNotMatch(doc, /<title>K<\/title>/);
        assert.equal(doc.match(/fonts\.gstatic\.com/g).length, 1);
        assert.match(doc, /<main>zusammengesetzt<\/main>/);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /"kueche": <title>/);
    });

    test('ohne body: wie bisher der eigene <body>-Inhalt', () => {
        assert.match(buildPreviewDocument({ html: ROOT }), /<body class="dunkel">\n<main>x<\/main>/);
    });

    test('childBodyWarning und Plätze', () => {
        assert.match(childBodyWarning('k', '<body id="x">'), /\(id\)/);
        const unplaced = [];
        placeChildren('<div data-slot="a"></div>', [{ identifier: 'b', html: 'B' }], unplaced);
        assert.deepEqual(unplaced, ['b']);
        assert.deepEqual(tagAttributes('<html lang="de" data-x>', 'html'), [
            { name: 'lang', value: 'de' },
            { name: 'data-x', value: null }
        ]);
    });
});
