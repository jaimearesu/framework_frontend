// tests/preview.test.mjs
// ---------------------------------------------------------------------
// Tests für die Vorschau (core/preview.js): HTML aus ganzen Dokumenten
// holen, Kinder an ihren Platz setzen, Vorschau-Seite bauen.
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitHtmlDocument, placeChildren, buildPreviewDocument } from '../public/js/core/preview.js';

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
