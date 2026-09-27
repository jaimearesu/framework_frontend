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
export const placeChildren = (parentBody, parts) => {
    let body = String(parentBody || '');
    const rest = [];
    for (const part of parts) {
        const id = String(part.identifier ?? '').replace(/[^\w-]/g, '');
        const slot = id
            ? new RegExp(`(<[a-z0-9-]+[^>]*\\sdata-slot=["']${id}["'][^>]*>)(\\s*)(</[a-z0-9-]+>)`, 'i')
            : null;
        if (slot && slot.test(body)) body = body.replace(slot, (m, open, _ws, close) => open + part.html + close);
        else rest.push(`<section data-at0mic="${id}">\n${part.html}\n</section>`);
    }
    return [body, ...rest].filter(Boolean).join('\n');
};

// Die fertige Vorschau-Seite (reine Funktion, getestet)
//   html   – HTML (ganzes Dokument oder Stück)
//   css    – eine oder mehrere CSS-Texte
//   js     – ein oder mehrere JS-Texte (jeder in eigenem <script>,
//            damit ein Fehler in einem die anderen nicht stoppt)
export const buildPreviewDocument = ({ html = '', css = [], js = [] } = {}) => {
    const { head, body } = splitHtmlDocument(html);
    const styles = [].concat(css).filter(s => s && s.trim());
    const scripts = [].concat(js).filter(s => s && s.trim());
    return [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        // Vorschau immer hell, egal ob das Cockpit dunkel ist
        '<meta name="color-scheme" content="light">',
        ERROR_BRIDGE,
        head,
        styles.map(s => `<style>${s.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n'),
        '</head><body>',
        body || EMPTY_NOTE,
        scripts.map(s => `<script>${safeScript(s)}<\/script>`).join('\n'),
        '</body></html>'
    ].join('\n');
};

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
