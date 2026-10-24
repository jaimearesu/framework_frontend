// tests/visitorUploads.test.mjs
// ---------------------------------------------------------------------
// Karte "Wartet auf dich – neue Uploads" (Plan "R2", Etappe R2b): die Sätze dazu
// ---------------------------------------------------------------------
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { describeUpload, collectionHint } from '../public/js/pages/visitorUploads.js';

describe('neue Uploads: was steht auf der Karte?', () => {
    test('Foto/PDF/Datei mit Art, Grösse, Website und wer (nur angemeldet ja/nein)', () => {
        assert.equal(
            describeUpload({ kind: 'png', bytes: 12 * 1024, site: 'galerie', anonymous: true }),
            'Foto (png, 12.0 KB) über galerie – von einem Besucher ohne Anmeldung'
        );
        assert.equal(
            describeUpload({ kind: 'pdf', bytes: 2048, site: 'jobs', anonymous: false }),
            'PDF (pdf, 2.0 KB) über jobs – von einem angemeldeten Besucher'
        );
        assert.match(describeUpload({ kind: 'csv', site: 'x', anonymous: false }), /^Datei \(csv\)/);
    });

    test('Hinweis, wenn die Sammlung privat ist (sonst sieht niemand die Freigabe)', () => {
        assert.match(collectionHint({ collectionVisibility: 'private' }), /Sammlung ist privat/);
        assert.equal(collectionHint({ collectionVisibility: 'public' }), null);
    });
});
