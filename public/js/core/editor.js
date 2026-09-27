// js/core/editor.js
// ---------------------------------------------------------------------
// CODE-EDITOR (CodeMirror 5)
//
// CodeMirror ist ein bewährter Editor mit Farben, Zeilennummern und
// Klammer-Hilfe. Er wird erst geladen, wenn eine Seite ihn braucht –
// aus dem öffentlichen CDN cdnjs (keine Installation nötig).
//
// Falls das CDN nicht erreichbar ist (offline), gibt es automatisch ein
// einfaches Textfeld. Die Seite merkt davon nichts: beide haben dieselben
// Funktionen getValue / setValue / onChange …
// ---------------------------------------------------------------------
import { h } from './ui.js';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18';
const FILES = [
    'codemirror.min.js',
    'mode/javascript/javascript.min.js',
    'mode/css/css.min.js',
    'mode/xml/xml.min.js',
    'mode/htmlmixed/htmlmixed.min.js',
    'addon/edit/matchbrackets.min.js',
    'addon/edit/closebrackets.min.js',
    'addon/selection/active-line.min.js',
    'addon/comment/comment.min.js'
];

// Code-Art -> Farb-Modus von CodeMirror
export const MODES = {
    html: 'htmlmixed',
    css: 'css',
    javascript: 'javascript',
    ssf: 'javascript',
    syntax: { name: 'javascript', json: true },
    data: { name: 'javascript', json: true }
};

let loading = null;

const loadScript = src =>
    new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Konnte ${src} nicht laden`));
        document.head.appendChild(s);
    });

// Lädt CodeMirror einmal (danach sofort da). Gibt null zurück, wenn es nicht geht.
export const loadCodeMirror = () => {
    if (window.CodeMirror) return Promise.resolve(window.CodeMirror);
    if (!loading) {
        loading = (async () => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = `${CDN}/codemirror.min.css`;
            document.head.appendChild(css);
            // Der Kern zuerst, danach die Erweiterungen (die brauchen den Kern)
            await loadScript(`${CDN}/${FILES[0]}`);
            await Promise.all(FILES.slice(1).map(f => loadScript(`${CDN}/${f}`)));
            return window.CodeMirror;
        })().catch(err => {
            console.warn('CodeMirror nicht verfügbar – benutze einfaches Textfeld.', err);
            return null;
        });
    }
    return loading;
};

// Einen Editor in "container" bauen.
// Rückgabe: { getValue, setValue, setMode, setReadOnly, focus, refresh, onChange, isFallback }
export const createEditor = async (
    container,
    { value = '', type = 'javascript', readOnly = false, minHeight } = {}
) => {
    const CM = await loadCodeMirror();
    const listeners = new Set();
    const notify = () => listeners.forEach(fn => fn());
    container.classList.add('editor');
    if (minHeight) container.style.setProperty('--editor-min', minHeight);

    if (!CM) {
        // Notlösung: einfaches Textfeld
        const ta = h('textarea', { class: 'editor-fallback', spellcheck: 'false', value });
        ta.readOnly = readOnly;
        ta.addEventListener('input', notify);
        // Tab-Taste fügt Einrückung ein, statt aus dem Feld zu springen
        ta.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;
            e.preventDefault();
            ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end');
            notify();
        });
        container.replaceChildren(ta);
        return {
            isFallback: true,
            getValue: () => ta.value,
            setValue: v => {
                ta.value = v ?? '';
            },
            setMode: () => {},
            setReadOnly: ro => {
                ta.readOnly = ro;
            },
            focus: () => ta.focus(),
            refresh: () => {},
            goToLine: () => {},
            // Text an der Cursor-Stelle einfügen
            insertText: text => {
                ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
                ta.focus();
                notify();
            },
            onChange: fn => listeners.add(fn)
        };
    }

    container.replaceChildren();
    const cm = CM(container, {
        value,
        mode: MODES[type] || 'javascript',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        lineWrapping: false,
        readOnly,
        extraKeys: {
            // Tab = 4 Leerzeichen, Strg+/ = Zeile auskommentieren
            Tab: c => c.execCommand(c.somethingSelected() ? 'indentMore' : 'insertSoftTab'),
            'Shift-Tab': c => c.execCommand('indentLess'),
            'Ctrl-/': 'toggleComment',
            'Cmd-/': 'toggleComment'
        }
    });
    cm.on('change', (_, change) => {
        if (change.origin !== 'setValue') notify();
    });

    return {
        isFallback: false,
        cm,
        getValue: () => cm.getValue(),
        setValue: v => cm.setValue(v ?? ''),
        setMode: t => cm.setOption('mode', MODES[t] || 'javascript'),
        setReadOnly: ro => cm.setOption('readOnly', ro),
        focus: () => cm.focus(),
        // Nach dem Sichtbarwerden (z.B. Tab-Wechsel) neu vermessen
        refresh: () => cm.refresh(),
        goToLine: line => {
            if (!line) return;
            cm.setCursor({ line: line - 1, ch: 0 });
            cm.scrollIntoView({ line: line - 1, ch: 0 }, 80);
            cm.focus();
        },
        // Text an der Cursor-Stelle einfügen (zählt als Änderung)
        insertText: text => {
            cm.replaceSelection(text);
            cm.focus();
        },
        onChange: fn => listeners.add(fn)
    };
};
