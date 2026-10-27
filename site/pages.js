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
    },
    // Login auf Websites (Plan "Login auf Websites", Etappe 3)
    loginRequired: {
        status: 401,
        title: 'Diese Website ist privat',
        text: 'Melde dich mit deinem vindelis-Konto an, um sie zu sehen.'
    },
    noAccess: {
        status: 403,
        title: 'Kein Zugriff',
        text: 'Du bist angemeldet, hast aber (noch) keinen Zugriff auf diese Website. Bitte frag die Person, der sie gehört – am einfachsten nach einem Einladungs-Link.'
    },
    loginFailed: {
        status: 400,
        title: 'Anmeldung hat nicht geklappt',
        text: 'Die Anmeldung ist abgelaufen oder ungültig. Bitte versuch es nochmals.'
    },
    loginUnavailable: {
        status: 503,
        title: 'Anmelden geht gerade nicht',
        text: 'Das Anmelden ist auf diesem Server nicht eingerichtet.'
    }
};

/**
 * @param {string} kind     Schlüssel in MESSAGES
 * @param {object} [options]
 * @param {Array<{href: string, label: string, primary?: boolean}>} [options.actions]
 *        Knöpfe unter dem Text (z.B. "Anmelden"). href baut immer der Bauarbeiter
 *        selbst – nie aus Eingaben des Besuchers ohne safeReturnPath.
 * @param {string} [options.note]  kleine Zusatzzeile (z.B. "Deine at0mic-ID: …"), maskiert
 */
const neutralPage = (kind, { actions = [], note = null } = {}) => {
    const { title, text } = MESSAGES[kind];
    const buttons = actions.length
        ? `<p class="actions">${actions
              .map(
                  a =>
                      `<a href="${escapeHtml(a.href)}"${a.primary ? ' class="primary"' : ''}>${escapeHtml(a.label)}</a>`
              )
              .join(' ')}</p>`
        : '';
    return [
        '<!doctype html>',
        '<html lang="de">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        // Erkennungszeichen für Screenshots (Plan "F", F-1b): Das Backend merkt so, dass Cloudflare
        // statt der Website eine Seite des Bauarbeiters fotografiert hat (z.B. "loginFailed").
        `<meta name="at0mic-seite" content="${kind}">`,
        '<meta name="robots" content="noindex">',
        `<title>${escapeHtml(title)}</title>`,
        '<style>',
        'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;',
        'background:#f6f7f9;color:#1d2340;padding:16px;box-sizing:border-box}',
        'main{max-width:420px;text-align:center}h1{font-size:1.4rem;margin:0 0 8px}',
        'p{margin:0 0 16px;color:#5b6273}small{color:#8a919d}.note code{font-size:.85rem;word-break:break-all;user-select:all}',
        '.actions a{display:inline-block;margin:4px;padding:10px 18px;border-radius:8px;border:1px solid #d5d9e2;',
        'color:#1d2340;text-decoration:none;font-weight:600}.actions a.primary{background:#5b4bdb;border-color:#5b4bdb;color:#fff}',
        '@media (prefers-color-scheme:dark){body{background:#14161b;color:#e8eaf0}p{color:#a9afbd}',
        '.actions a{color:#e8eaf0;border-color:#2c3142}.actions a.primary{background:#8b7cff;border-color:#8b7cff;color:#fff}}',
        '</style>',
        '</head>',
        '<body>',
        '<main>',
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>${escapeHtml(text)}</p>`,
        note ? `<p class="note"><code>${escapeHtml(note)}</code></p>` : '',
        buttons,
        '<small>vindelis</small>',
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
