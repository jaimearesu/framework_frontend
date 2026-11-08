// site/emailLogin.js
// ---------------------------------------------------------------------
// FORMULAR FÜR DEN BESUCHER-LOGIN PER E-MAIL-CODE (Plan "Besucher-Login per E-Mail-Code", E3)
//
// Zwei schlichte Seiten: "Adresse eingeben" und "Code eingeben". Was dabei
// passiert, steht in bauarbeiter.js; hier sind nur reine Funktionen.
//
// Bewusst:
//   - KEIN JavaScript. Das Formular geht auch ohne, und die strenge Regel CSP
//     verbietet auf diesen zwei Seiten jedes Skript.
//   - KEINE Marke: Der Besucher sieht den Namen der Website, nie "vindelis".
//     Agenturen verkaufen diese Websites an ihre Kunden.
//   - Der Satz nach dem Abschicken sagt "falls ...": Er darf nie verraten, ob
//     eine Adresse auf der Gästeliste steht.
//   - Die Adresse steht nie in einer URL, nur im Formular.
// ---------------------------------------------------------------------
const { escapeHtml } = require('./pages');

const MAX_FORM_BYTES = 2048;
const MAX_EMAIL_CHARS = 320; // grosszügig; das Backend prüft genau

// Nur diese zwei Seiten: keine Skripte, Formulare nur an die eigene Adresse, nie eingebettet
const LOGIN_CSP =
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const TEXTS = {
    de: {
        emailTitle: site => `Bei ${site} anmelden`,
        emailIntro: 'Gib deine E-Mail-Adresse ein. Du bekommst dann einen Code, mit dem du dich anmeldest.',
        emailLabel: 'E-Mail-Adresse',
        emailButton: 'Code schicken',
        codeTitle: 'Code eingeben',
        codeIntro: email =>
            `Falls ${email} sich hier anmelden darf, ist jetzt eine Mail mit einem 6-stelligen Code unterwegs. Er gilt 10 Minuten.`,
        codeSpam: 'Keine Mail? Schau auch im Spam-Ordner nach.',
        codeLabel: 'Code',
        codeButton: 'Anmelden',
        restart: 'Andere Adresse oder neuer Code',
        invalidEmail: 'Bitte gib eine gültige E-Mail-Adresse ein.',
        wrongCode: 'Der Code stimmt nicht oder ist abgelaufen. Prüfe ihn oder fordere einen neuen an.',
        tooMany: 'Zu viele Versuche. Bitte versuche es später nochmals.',
        expired: 'Das hat zu lange gedauert. Bitte gib deine Adresse nochmals ein.'
    },
    en: {
        emailTitle: site => `Sign in to ${site}`,
        emailIntro: 'Enter your email address. We will send you a code to sign in.',
        emailLabel: 'Email address',
        emailButton: 'Send code',
        codeTitle: 'Enter your code',
        codeIntro: email =>
            `If ${email} is allowed to sign in here, an email with a 6-digit code is on its way. It is valid for 10 minutes.`,
        codeSpam: 'No email? Please check your spam folder too.',
        codeLabel: 'Code',
        codeButton: 'Sign in',
        restart: 'Use another address or get a new code',
        invalidEmail: 'Please enter a valid email address.',
        wrongCode: 'That code is wrong or has expired. Check it or request a new one.',
        tooMany: 'Too many attempts. Please try again later.',
        expired: 'That took too long. Please enter your address again.'
    }
};

/**
 * Sprache aus der Browser-Angabe, z.B. "fr-CH, en;q=0.8, de;q=0.7" -> "en".
 * Die erste Sprache, die wir können, gewinnt. Reihenfolge wie vom Browser geschickt.
 */
const pickLang = header => {
    for (const part of String(header || '').split(',')) {
        const lang = part.split(';')[0].trim().toLowerCase().split('-')[0];
        if (lang === 'de' || lang === 'en') return lang;
    }
    return 'de';
};

// Formular-Text lesen: "email=a%40b.ch" -> Feld holen. Immer ein Text, nie etwas anderes.
const parseForm = buffer => {
    const fields = new URLSearchParams(buffer.toString('utf8'));
    const field = name => fields.get(name) || '';
    const email = field('email').trim();
    return {
        email: email.length > MAX_EMAIL_CHARS ? '' : email,
        // Wer "123 456" aus der Mail kopiert, soll nicht scheitern
        code: field('code').split(' ').join('').trim()
    };
};

const shell = ({ lang, title, body }) =>
    [
        '<!doctype html>',
        `<html lang="${lang}">`,
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        // Erkennungszeichen für Screenshots wie bei den anderen Seiten des Bauarbeiters
        '<meta name="at0mic-seite" content="emailLogin">',
        '<meta name="robots" content="noindex">',
        `<title>${escapeHtml(title)}</title>`,
        '<style>',
        'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;',
        'background:#f6f7f9;color:#1d2340;padding:16px;box-sizing:border-box}',
        'main{width:100%;max-width:380px}h1{font-size:1.4rem;margin:0 0 8px;overflow-wrap:anywhere}',
        'p{margin:0 0 16px;color:#5b6273;overflow-wrap:anywhere}label{display:block;font-weight:600;margin-bottom:6px}',
        'input{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid #c9ced9;border-radius:8px;',
        'background:#fff;color:inherit;margin-bottom:12px}',
        'input.code{font-size:1.5rem;letter-spacing:.3em;text-align:center}',
        'button{width:100%;font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:8px;background:#1d2340;color:#fff;cursor:pointer}',
        '.error{color:#b3261e;font-weight:600}.small{font-size:.9rem;margin-top:16px;text-align:center}a{color:inherit}',
        '@media (prefers-color-scheme:dark){body{background:#14161b;color:#e8eaf0}p{color:#a9afbd}',
        'input{background:#1d2028;border-color:#2c3142}button{background:#e8eaf0;color:#14161b}.error{color:#ff8a80}}',
        '</style>',
        '</head>',
        '<body>',
        '<main>',
        body,
        '</main>',
        '</body>',
        '</html>'
    ].join('\n');

const errorLine = message => (message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : '');

/** Seite 1: Adresse eingeben. error = Schlüssel in TEXTS oder null */
const emailPage = ({ site, lang, error = null, email = '' }) => {
    const t = TEXTS[lang];
    const title = t.emailTitle(site);
    return shell({
        lang,
        title,
        body: [
            `<h1>${escapeHtml(title)}</h1>`,
            `<p>${escapeHtml(t.emailIntro)}</p>`,
            errorLine(error ? t[error] : null),
            '<form method="post" action="/_vindelis/login-email">',
            `<label for="email">${escapeHtml(t.emailLabel)}</label>`,
            `<input id="email" name="email" type="email" autocomplete="email" required autofocus maxlength="254" value="${escapeHtml(email)}">`,
            `<button type="submit">${escapeHtml(t.emailButton)}</button>`,
            '</form>'
        ].join('\n')
    });
};

/** Seite 2: Code eingeben. restartHref baut immer der Bauarbeiter (safeReturnPath) */
const codePage = ({ lang, email, restartHref, error = null }) => {
    const t = TEXTS[lang];
    return shell({
        lang,
        title: t.codeTitle,
        body: [
            `<h1>${escapeHtml(t.codeTitle)}</h1>`,
            `<p>${escapeHtml(t.codeIntro(email))}</p>`,
            errorLine(error ? t[error] : null),
            '<form method="post" action="/_vindelis/login-code">',
            `<input type="hidden" name="email" value="${escapeHtml(email)}">`,
            `<label for="code">${escapeHtml(t.codeLabel)}</label>`,
            '<input id="code" class="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" required autofocus maxlength="7">',
            `<button type="submit">${escapeHtml(t.codeButton)}</button>`,
            '</form>',
            `<p class="small">${escapeHtml(t.codeSpam)}</p>`,
            `<p class="small"><a href="${escapeHtml(restartHref)}">${escapeHtml(t.restart)}</a></p>`
        ].join('\n')
    });
};

module.exports = { LOGIN_CSP, MAX_FORM_BYTES, pickLang, parseForm, emailPage, codePage };
