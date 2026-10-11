// site/pages.js
// ---------------------------------------------------------------------
// SEITEN, DIE DER BAUARBEITER SELBST BAUT (Plan "Bauarbeiter + Bauplan-Format")
//
// 1. Neutrale at0mic-Seiten für Fehler (Website gibt es nicht, Seite nicht
//    gefunden, Fehler, gerade nicht erreichbar). Bewusst schlicht und ohne
//    Details: Fehlermeldungen aus dem Code der Website gehen nur ins Log,
//    nie an Besucher.
// 2. Der Rahmen für Markdown-Dateien (.md -> HTML): eine einfache Seite,
//    die das style.css der Website mitlädt, falls es eines gibt.
// ---------------------------------------------------------------------

const escapeHtml = text =>
    String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Die Texte der neutralen Seiten (Schlüssel = Art des Fehlers)
const MESSAGES = {
    noSite: {
        status: 404,
        title: 'Diese Website gibt es nicht',
        text: 'Unter dieser Adresse ist (noch) keine Website veröffentlicht.'
    },
    notFound: {
        status: 404,
        title: 'Seite nicht gefunden',
        text: 'Diese Seite gibt es auf dieser Website nicht.'
    },
    siteError: {
        status: 502,
        title: 'Diese Website hat gerade einen Fehler',
        text: 'Die Website konnte nicht zusammengesetzt werden. Bitte später nochmal versuchen.'
    },
    tooMany: {
        status: 429,
        title: 'Zu viele Aufrufe',
        text: 'Bitte einen Moment warten und dann die Seite neu laden.'
    },
    unavailable: {
        status: 503,
        title: 'Gerade nicht erreichbar',
        text: 'Die Website ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.'
    },
    methodNotAllowed: {
        status: 405,
        title: 'Nicht erlaubt',
        text: 'Websites können hier nur angesehen werden.'
    }
};

const neutralPage = kind => {
    const { title, text } = MESSAGES[kind];
    return [
        '<!doctype html>',
        '<html lang="de">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="robots" content="noindex">',
        `<title>${escapeHtml(title)}</title>`,
        '<style>',
        'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;',
        'background:#f6f7f9;color:#1d2340;padding:16px;box-sizing:border-box}',
        'main{max-width:420px;text-align:center}h1{font-size:1.4rem;margin:0 0 8px}',
        'p{margin:0 0 16px;color:#5b6273}small{color:#8a919d}',
        '@media (prefers-color-scheme:dark){body{background:#14161b;color:#e8eaf0}p{color:#a9afbd}}',
        '</style>',
        '</head>',
        '<body>',
        '<main>',
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>${escapeHtml(text)}</p>`,
        '<small>at0mic</small>',
        '</main>',
        '</body>',
        '</html>'
    ].join('\n');
};

/**
 * Rahmen für eine Markdown-Seite.
 * @param {string}  bodyHtml   das aus Markdown erzeugte HTML
 * @param {object}  options
 * @param {string}  options.title     Titel (erste Überschrift oder Name der Website)
 * @param {boolean} options.hasStyle  gibt es ein style.css im Bauplan?
 */
const markdownPage = (bodyHtml, { title, hasStyle }) =>
    [
        '<!doctype html>',
        '<html>',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeHtml(title)}</title>`,
        hasStyle ? '<link rel="stylesheet" href="/style.css">' : '',
        '</head>',
        '<body>',
        '<main class="markdown">',
        bodyHtml,
        '</main>',
        '</body>',
        '</html>'
    ]
        .filter(Boolean)
        .join('\n');

// Titel einer Markdown-Datei: die erste Überschrift "# …", sonst der Ersatz
const markdownTitle = (markdown, fallback) => {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(String(markdown || ''));
    return match ? match[1] : fallback;
};

module.exports = { MESSAGES, neutralPage, markdownPage, markdownTitle, escapeHtml };
