// js/core/preview.js
// ---------------------------------------------------------------------
// VORSCHAU – aus HTML, CSS und JS eine anzeigbare Seite bauen
//
// Wird benutzt von:
//   - Code & DNA  -> Live-Vorschau beim Tippen (nur dieses Objekt)
//   - Objekte     -> Reiter "Vorschau" (das Objekt MIT seinen Kindern)
//
// Wichtige Punkte:
//   1. Das Backend gibt HTML immer als ganzes Dokument zurück
//      ("<html><head></head><body>…</body></html>"), weil es beim
//      Speichern in einen Baum (AST) umgewandelt wird. Wir holen darum
//      nur den Inhalt von <body> (und <head>) heraus.
//   2. Die Seite läuft in einem abgeschotteten Rahmen (iframe sandbox):
//      Scripts laufen, kommen aber nicht an das Cockpit, deine Cookies
//      oder das Backend heran. Anfragen ans Backend (fetch) scheitern
//      darum in der Vorschau – das ist Absicht.
//   3. Fehler im JavaScript werden abgefangen und ans Cockpit gemeldet,
//      damit die Vorschau nicht einfach "weiss" bleibt.
//
// Wie die Kinder eingesetzt werden, ist eine VORSCHAU-Regel des Cockpits
// (die Engine selbst rendert noch kein HTML): Jedes Kind kommt in der
// Reihenfolge der DNA als eigener Abschnitt nach dem HTML des Eltern-
// Objekts. Hat das Eltern-HTML eine Stelle <div data-slot="name"></div>,
// kommt das Kind mit diesem identifier genau dorthin.
// ---------------------------------------------------------------------
import { h } from './ui.js';

// Inhalt von <body> bzw. <head> aus einem ganzen Dokument holen (reine Funktion, getestet)
export const splitHtmlDocument = html => {
    const text = String(html || '');
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text);
    const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(text);
    if (!body && !head) return { head: '', body: text.trim() };
    return { head: head ? head[1].trim() : '', body: body ? body[1].trim() : '' };
};

// Verhindert, dass "</script>" im Code den Script-Block vorzeitig beendet
const safeScript = code => String(code || '').replace(/<\/script/gi, '<\\/script');

// Kleines Script, das Fehler aus der Vorschau ans Cockpit meldet
const ERROR_BRIDGE = `<script>
(function () {
  function send(kind, message) {
    try { parent.postMessage({ at0micPreview: true, kind: kind, message: String(message) }, '*'); } catch (e) {}
  }
  window.addEventListener('error', function (e) { send('error', e.message + (e.lineno ? ' (Zeile ' + e.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (e) { send('error', (e.reason && e.reason.message) || e.reason); });
  var log = console.log;
  console.log = function () { send('log', Array.prototype.join.call(arguments, ' ')); log.apply(console, arguments); };
  window.addEventListener('load', function () { send('ready', document.body ? document.body.innerText.trim().length : 0); });
})();
<\/script>`;

const EMPTY_NOTE =
    '<p style="font:14px system-ui,sans-serif;color:#8a919d;text-align:center;margin-top:40px">Kein HTML vorhanden – hier gibt es nichts anzuzeigen.</p>';

// Kinder in ihre Plätze (data-slot) setzen oder hinten anhängen (reine Funktion, getestet)
// parts = [{ identifier, html }]
// unplaced (freiwillig): hier kommen die identifier der Kinder hinein, die keinen Platz fanden
// Hat ein Teil sichtbaren Inhalt? Leere Hüllen (<section data-at0mic="…"></section> für
// Kinder ohne HTML, auch verschachtelt) zählen nicht (Plan "Brotzeit-Test", B7)
const EMPTY_SECTION = /<section data-at0mic="[\w-]*">\s*<\/section>/g;
export const hasContent = html => {
    let text = String(html || '');
    for (let before = ''; before !== text;) {
        before = text;
        text = text.replace(EMPTY_SECTION, '');
    }
    return text.trim().length > 0;
};

export const placeChildren = (parentBody, parts, unplaced = []) => {
    let body = String(parentBody || '');
    const rest = [];
    for (const part of parts) {
        const id = String(part.identifier ?? '').replace(/[^\w-]/g, '');
        const slot = id
            ? new RegExp(`(<[a-z0-9-]+[^>]*\\sdata-slot=["']${id}["'][^>]*>)(\\s*)(</[a-z0-9-]+>)`, 'i')
            : null;
        if (slot && slot.test(body)) body = body.replace(slot, (m, open, _ws, close) => open + part.html + close);
        else if (!hasContent(part.html)) {
            // Kein Platz und nichts zu zeigen (z.B. ein Ordner nur für Bilder): gar keine
            // Hülle anhängen – gleiche Regel wie im Backend (Runde 3, E2)
            continue;
        } else {
            rest.push(`<section data-at0mic="${id}">\n${part.html}\n</section>`);
            unplaced.push(id);
        }
    }
    return [body, ...rest].filter(Boolean).join('\n');
};

// Gleiche Regeln wie das Backend (siteService.js, gefunden beim Finale 12.10.):
// <html lang="…"> übernehmen, charset/viewport nicht doppelt
export const htmlLang = html => {
    const match = /<html\b[^>]*\slang=["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)["'\s>]/i.exec(String(html || ''));
    return match ? match[1] : null;
};
export const missingHeadDefaults = head => {
    const text = String(head || '');
    return [
        /<meta\b[^>]*\bcharset\s*=/i.test(text) ? '' : '<meta charset="utf-8">',
        /<meta\b[^>]*\bname=["']?viewport/i.test(text)
            ? ''
            : '<meta name="viewport" content="width=device-width, initial-scale=1">'
    ].filter(Boolean);
};

// ---------------------------------------------------------------------
// NICHTS GEHT STILL VERLOREN (Plan "Lehren aus dem Restaurant-Test", E1)
// Gefunden beim Restaurant-Test (22.10.): Ein Kind band in seinem <head>
// Schriften ein (<link … fonts …>). Beim Zusammensetzen zählte aber nur
// der Kopf der Wurzel – die Schriften fehlten, ohne dass es jemand merkte.
// Ebenso gingen Angaben an <html> und <body> verloren (z.B. class="dunkel").
// Jetzt gilt:
//   - Der Kopf jedes Kindes kommt dazu (nach dem Kopf der Wurzel, in der
//     Reihenfolge der DNA). Was schon dasteht, kommt nicht doppelt.
//   - <title> und <base> wirken nur in der Wurzel. Im Kopf eines Kindes
//     fallen sie weg – mit Warnung. charset/viewport eines Kindes fallen
//     still weg (die stehen sowieso genau einmal im Kopf).
//   - Die Angaben an <html> und <body> der WURZEL bleiben. Angaben am
//     <body> eines Kindes können nicht wirken (es gibt nur einen <body>) –
//     Warnung.
// Gleiche Regeln wie beim Ausliefern (Backend: src/services/siteService.js) –
// bei Änderungen beide anpassen.
// ---------------------------------------------------------------------

// Die Angaben (Attribute) eines Start-Tags: name, name="…", name='…' oder name=wert
const START_TAG_ATTRS = `((?:\\s+[^\\s"'<>\\/=]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?)*)\\s*\\/?>`;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const ATTRIBUTE_NAME = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;

// Text -> [{ name, value }] (value null = ohne Wert, z.B. "hidden").
// Ein " im Wert wird zu &quot; – so kann kein Wert aus seinen Anführungszeichen ausbrechen.
const parseAttributes = text => {
    const out = [];
    for (const m of String(text || '').matchAll(ATTRIBUTE)) {
        if (!ATTRIBUTE_NAME.test(m[1])) continue;
        const value = m[2] ?? m[3] ?? m[4];
        out.push({ name: m[1].toLowerCase(), value: value === undefined ? null : value.replace(/"/g, '&quot;') });
    }
    return out;
};

// [{ name, value }] -> ' class="dunkel" hidden'
const attributesText = list => list.map(a => (a.value === null ? ` ${a.name}` : ` ${a.name}="${a.value}"`)).join('');

// Die Angaben am ersten <html …> bzw. <body …> eines Dokuments (oder [])
export const tagAttributes = (html, tag) => {
    const match = new RegExp(`<${tag}${START_TAG_ATTRS}`, 'i').exec(String(html || ''));
    return match ? parseAttributes(match[1]) : [];
};

// Die einzelnen Angaben eines Kopfes: <meta>, <link>, <base> (ohne Ende) und
// <title>, <style>, <script>, <noscript>, <template> (mit Inhalt). Kommentare fallen weg.
const HEAD_ELEMENT_SOURCE = `<!--[\\s\\S]*?-->|<(meta|link|base)${START_TAG_ATTRS}|<(title|style|script|noscript|template)(?=[\\s>/])[\\s\\S]*?<\\/\\3\\s*>`;
export const headElements = head => {
    const text = String(head || '');
    const elements = [];
    for (const m of text.matchAll(new RegExp(HEAD_ELEMENT_SOURCE, 'gi'))) {
        if (m[0].startsWith('<!--')) continue;
        elements.push({
            tag: (m[1] || m[3]).toLowerCase(),
            html: m[0].trim(),
            attrs: m[1] ? parseAttributes(m[2]) : []
        });
    }
    // Bleibt danach noch etwas übrig, verstehen wir es nicht (z.B. Text oder ein <div>)
    const leftover = text.replace(new RegExp(HEAD_ELEMENT_SOURCE, 'gi'), '').trim().length > 0;
    return { elements, leftover };
};

// Was im Kopf eines KINDES nicht hingehört:
//   'warn'   -> weglassen und warnen (<title>, <base>)
//   'silent' -> still weglassen (charset, viewport – stehen sowieso einmal da)
//   null     -> übernehmen
const childHeadRule = element => {
    if (element.tag === 'title' || element.tag === 'base') return 'warn';
    if (element.tag !== 'meta') return null;
    const attr = name => element.attrs.find(a => a.name === name);
    if (attr('charset')) return 'silent';
    if ((attr('name')?.value || '').toLowerCase() === 'viewport') return 'silent';
    if ((attr('http-equiv')?.value || '').toLowerCase() === 'content-type') return 'silent';
    return null;
};

// Zwei Angaben sind gleich, wenn sie bis auf Leerzeichen gleich sind
const sameKey = html => html.replace(/\s+/g, ' ').trim();

/**
 * Köpfe zusammenführen: Der Kopf der Wurzel bleibt, wie er ist; aus den Köpfen
 * der Kinder kommt dazu, was noch fehlt.
 * @param {string} rootHead
 * @param {Array}  childHeads  [{ identifier, head }] in DNA-Reihenfolge
 * @param {Array}  warnings    hier kommen die Warnungen hinein (Text)
 * @returns {string} der ganze Kopf
 */
export const mergeHeads = (rootHead, childHeads, warnings = []) => {
    const seen = new Set(headElements(rootHead).elements.map(e => sameKey(e.html)));
    const added = [];
    for (const { identifier, head } of childHeads) {
        if (!String(head || '').trim()) continue;
        const label = `Kind "${identifier}"`;
        const { elements, leftover } = headElements(head);
        for (const element of elements) {
            const rule = childHeadRule(element);
            if (rule === 'warn') {
                warnings.push(`${label}: <${element.tag}> im <head> wirkt nur in der Wurzel – weggelassen.`);
                continue;
            }
            if (rule === 'silent') continue;
            const key = sameKey(element.html);
            if (seen.has(key)) continue;
            seen.add(key);
            added.push(element.html);
        }
        if (leftover) {
            warnings.push(
                `${label}: Unbekannter Inhalt im <head> weggelassen (übernommen werden meta, link, style, script, noscript, template).`
            );
        }
    }
    return [String(rootHead || '').trim(), ...added].filter(Boolean).join('\n');
};

// Angaben am <body> eines Kindes wirken nicht -> Warnung (oder null)
export const childBodyWarning = (identifier, html) => {
    const attrs = tagAttributes(html, 'body');
    if (attrs.length === 0) return null;
    const names = attrs.map(a => a.name).join(', ');
    return `Kind "${identifier}": Angaben am <body> (${names}) wirken nur in der Wurzel – setz sie dort oder auf ein Element des Kindes.`;
};

// Die Start-Tags <html …> und <body …> der fertigen Seite aus dem HTML der Wurzel.
// lang nur, wenn es ein gültiger Sprach-Code ist (htmlLang).
export const rootTags = rootHtml => {
    const lang = htmlLang(rootHtml);
    const htmlAttrs = tagAttributes(rootHtml, 'html').filter(a => a.name !== 'lang');
    return {
        html: `<html${lang ? ` lang="${lang}"` : ''}${attributesText(htmlAttrs)}>`,
        body: `<body${attributesText(tagAttributes(rootHtml, 'body'))}>`
    };
};

// Höchstens so viele Warnungen (gleiche nur einmal)
const MAX_WARNINGS = 50;
export const tidyWarnings = warnings => [...new Set(warnings)].slice(0, MAX_WARNINGS);

// Die fertige Vorschau-Seite (reine Funktion, getestet)
//   html   – HTML (ganzes Dokument oder Stück)
//   css    – eine oder mehrere CSS-Texte
//   js     – ein oder mehrere JS-Texte (jeder in eigenem <script>,
//            damit ein Fehler in einem die anderen nicht stoppt)
//   body   – (freiwillig) der fertig zusammengesetzte Inhalt von <body>;
//            dann ist html das HTML der WURZEL (für Kopf, <html> und <body>)
//   childHeads – (freiwillig) [{ identifier, head }] der Kinder (Plan E1)
//   warnings   – (freiwillig) hier kommen die Warnungen hinein
export const buildPreviewDocument = ({ html = '', css = [], js = [], body, childHeads = [], warnings = [] } = {}) => {
    const own = splitHtmlDocument(html);
    const head = mergeHeads(own.head, childHeads, warnings);
    const content = body === undefined ? own.body : body;
    const tags = rootTags(html);
    const styles = [].concat(css).filter(s => s && s.trim());
    const scripts = [].concat(js).filter(s => s && s.trim());
    return [
        `<!doctype html>${tags.html}<head>`,
        ...missingHeadDefaults(head),
        // Vorschau immer hell, egal ob das Cockpit dunkel ist
        '<meta name="color-scheme" content="light">',
        ERROR_BRIDGE,
        head,
        styles.map(s => `<style>${s.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n'),
        `</head>${tags.body}`,
        content || EMPTY_NOTE,
        scripts.map(s => `<script>${safeScript(s)}<\/script>`).join('\n'),
        '</body></html>'
    ].join('\n');
};

// ---------------------------------------------------------------------
// DATEIEN IN DER VORSCHAU (Plan "Dateien mit R2", D3)
// Auf der Website steht z.B. <img src="/_at0mic/datei/bilder/logo.png">. Die Vorschau
// läuft aber in einem abgeschotteten Rahmen ohne eigene Adresse und ohne Cookies –
// dort zeigt /_at0mic/… ins Leere. Darum holt das Cockpit die Dateien selbst (mit
// deinen Rechten, auch Private) und setzt sie als data:-Adresse ein.
// ---------------------------------------------------------------------
const FILE_REF = /\/_at0mic\/datei\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9]{2,5})?)(?:\?v=\d{1,9})?/g;
export const MAX_PREVIEW_FILES = 30;

// Alle verschiedenen Datei-Pfade in einem Text (reine Funktion, getestet)
export const findFileRefs = text => {
    const seen = new Set();
    for (const m of String(text || '').matchAll(FILE_REF)) seen.add(m[1]);
    return [...seen].slice(0, MAX_PREVIEW_FILES);
};

// Pfade durch Adressen ersetzen: { "bilder/logo.png": "data:image/png;base64,…" }.
// Unbekannte bleiben stehen (reine Funktion, getestet)
export const replaceFileRefs = (text, urls) =>
    String(text || '').replace(FILE_REF, (whole, path) =>
        Object.prototype.hasOwnProperty.call(urls, path) ? urls[path] : whole
    );

// Den abgeschotteten Rahmen bauen + Meldungen (Fehler/Logs) empfangen.
// onMessage({ kind: 'error' | 'log' | 'ready', message })
export const createPreviewFrame = ({ onMessage, height = '420px' } = {}) => {
    const frame = document.createElement('iframe');
    frame.className = 'preview-frame';
    frame.title = 'Vorschau';
    frame.style.height = height;
    // allow-scripts OHNE allow-same-origin: der Code läuft, kommt aber nicht ans Cockpit heran
    frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms');
    const listener = e => {
        if (e.source !== frame.contentWindow || !e.data?.at0micPreview) return;
        onMessage?.({ kind: e.data.kind, message: e.data.message });
    };
    window.addEventListener('message', listener);
    return {
        frame,
        show: doc => {
            frame.srcdoc = doc;
        },
        // Beim Verlassen der Seite aufrufen
        destroy: () => window.removeEventListener('message', listener)
    };
};

// Kasten unter der Vorschau: zeigt Fehler und console.log-Ausgaben der Seite
export const previewConsole = () => {
    const el = h('div', { class: 'preview-console', hidden: true });
    const MAX = 30;
    return {
        el,
        clear: () => {
            el.replaceChildren();
            el.hidden = true;
        },
        add: ({ kind, message }) => {
            if (kind === 'ready') {
                // Seite geladen, aber ohne sichtbaren Text -> Hinweis statt "weiss"
                if (Number(message) === 0)
                    el.append(
                        h(
                            'div',
                            { class: 'pc-line warn' },
                            'Die Seite zeigt keinen Text an (leer, nur Bilder oder Inhalt kommt erst per JavaScript).'
                        )
                    );
                else return;
            } else {
                el.append(
                    h(
                        'div',
                        { class: `pc-line ${kind}` },
                        h('span', { class: 'pc-kind' }, kind === 'error' ? 'Fehler' : 'Log'),
                        String(message)
                    )
                );
            }
            while (el.children.length > MAX) el.firstChild.remove();
            el.hidden = false;
        }
    };
};
