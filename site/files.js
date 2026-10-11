// site/files.js
// ---------------------------------------------------------------------
// ADRESSE -> DATEI IM BAUPLAN (Plan "Bauarbeiter + Bauplan-Format", Etappe 3)
//
//   /                    -> index.html   (oder index.md)
//   /blog/erster-post    -> blog/erster-post.html, .md oder blog/erster-post/index.html …
//   /style.css           -> style.css   (genau so, wie es im Bauplan steht)
//   /blog/               -> blog/index.html (oder .md)
//
// Markdown (.md) wird nie roh ausgeliefert, sondern als HTML-Seite
// (siehe pages.js). Was es nicht gibt, ergibt null (-> 404).
// ---------------------------------------------------------------------

// Welcher Inhaltstyp pro Endung (die Endungen, die das Backend erlaubt)
const CONTENT_TYPES = {
    html: 'text/html; charset=utf-8',
    md: 'text/html; charset=utf-8', // wird zu HTML
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    svg: 'image/svg+xml; charset=utf-8'
};

const extensionOf = path => {
    const match = /\.([a-z0-9]+)$/.exec(path);
    return match ? match[1] : '';
};

const contentTypeFor = path => CONTENT_TYPES[extensionOf(path)] || 'application/octet-stream';

const has = (files, path) => Object.prototype.hasOwnProperty.call(files, path);

/**
 * @param {string} urlPath  req.path, z.B. "/blog/erster-post" (ohne ?…)
 * @param {object} files    bauplan.files
 * @returns {string|null}   der Pfad im Bauplan oder null
 */
const resolveFile = (urlPath, files) => {
    let path;
    try {
        path = decodeURIComponent(String(urlPath || '/'));
    } catch {
        return null; // kaputte %-Zeichen
    }
    path = path.replace(/^\/+/, '');
    // ".." und "." gibt es im Bauplan nie (das Backend lehnt sie ab) – trotzdem sicher ist sicher
    if (path.split('/').some(part => part === '..' || part === '.')) return null;

    let candidates;
    if (path === '') candidates = ['index.html', 'index.md'];
    else if (path.endsWith('/')) candidates = [path + 'index.html', path + 'index.md'];
    else candidates = [path, path + '.html', path + '.md', path + '/index.html', path + '/index.md'];

    return candidates.find(candidate => has(files, candidate)) || null;
};

module.exports = { resolveFile, contentTypeFor, extensionOf, CONTENT_TYPES };
