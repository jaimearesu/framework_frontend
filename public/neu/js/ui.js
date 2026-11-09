// Kleine Bausteine, die alle Seiten des neuen Cockpits benutzen.
// Text läuft immer über textContent, nie über innerHTML (Schutz vor eingeschleustem Code).

// Pfade der Logos relativ zu /neu/
export const LOGOS = { hell: 'marke/logos/logo.svg', dunkel: 'marke/logos/logo-dunkel.svg' };

// Die Hülle (app.js) trägt hier ihre Zeichnen-Funktion ein, damit Seiten neu zeichnen können
export const huelle = { neu() {} };

// Erstellt ein HTML-Element mit Angaben und Kindern
export const h = (tag, angaben, ...kinder) => {
    const el = document.createElement(tag);
    for (const [name, wert] of Object.entries(angaben || {})) {
        if (wert === null || wert === undefined || wert === false) continue;
        if (name.startsWith('on')) el.addEventListener(name.slice(2), wert);
        else if (name === 'class') el.className = wert;
        else if (name === 'value') el.value = wert;
        else if (wert === true) el.setAttribute(name, '');
        else el.setAttribute(name, wert);
    }
    for (const kind of kinder.flat(Infinity)) {
        if (kind === null || kind === undefined || kind === false) continue;
        el.append(kind.nodeType ? kind : String(kind));
    }
    return el;
};

// Linien der Symbole, alle im gleichen Stil wie die Beispiele der Marke
const IKONEN = {
    start: 'M3 11l9-8 9 8M5 9.5V20h14V9.5',
    wartet: 'M4 13l3-8h10l3 8v6H4zM4 13h5l1 3h4l1-3h5',
    helfer: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
    verlauf: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    konto: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    werkstatt: 'M15 4a5 5 0 0 0-4.6 7L4 17.4 6.6 20l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-3 3-3a5 5 0 0 0-2-2z',
    suche: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
    plus: 'M12 5v14M5 12h14',
    mond: 'M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z',
    sonne: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    pfeil: 'M5 12h14M13 6l6 6-6 6',
    zurueck: 'M19 12H5M11 6l-6 6 6 6',
    aussen: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    kopie: 'M9 9h11v11H9zM5 15H4V4h11v1',
    haken: 'M5 12l5 5 9-10',
    kreuz: 'M6 6l12 12M18 6L6 18',
    datei: 'M6 3h8l4 4v14H6zM14 3v4h4',
    kugel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    tabelle: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    nachricht: 'M4 5h16v11H9l-5 4z',
    brief: 'M3 6h18v12H3zM3 7l9 7 9-7'
};

// Zeichnet ein Symbol
export const ikon = name => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'bp-ic');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const pfad = document.createElementNS(NS, 'path');
    pfad.setAttribute('d', IKONEN[name] || '');
    svg.append(pfad);
    return svg;
};

// Zustand einer Website als Plakette
export const zustandPlakette = zustand => {
    const arten = {
        online: ['bp-st bp-st-ok', 'Online'],
        wartet: ['bp-st bp-st-warn', 'Wartet auf Freigabe'],
        problem: ['bp-st bp-st-stop', 'Problem'],
        entwurf: ['bp-badge bp-badge-s', 'Entwurf'],
        mitglieder: ['bp-badge bp-badge-s', 'Nur Angemeldete'],
        leer: ['bp-badge bp-badge-s', 'Noch leer']
    };
    const [klasse, text] = arten[zustand] || arten.entwurf;
    return h('span', { class: klasse }, text);
};

// Kurze Meldung unten rechts, verschwindet von selbst
export const meldung = (titel, text, symbol = 'haken') => {
    let ablage = document.querySelector('.toasts');
    if (!ablage) {
        ablage = h('div', { class: 'toasts', role: 'status' });
        document.body.append(ablage);
    }
    const eintrag = h(
        'div',
        { class: 'bp-toast' },
        h('i', { class: 'bp-toast-ik' }, ikon(symbol)),
        h('div', {}, h('b', {}, titel), text ? h('span', {}, text) : null)
    );
    ablage.append(eintrag);
    setTimeout(() => eintrag.remove(), 4000);
};

// Dialog über der Seite. zeichne() liefert den Inhalt und kann neu() aufrufen.
// kreuz: false lässt das Kreuz oben rechts weg (die Suche hat dort ihr Eingabefeld).
export const dialog = (zeichne, { kreuz = true } = {}) => {
    const box = h('div', { class: 'bp-dialog dlg-box', role: 'dialog', 'aria-modal': 'true' });
    const grund = h('div', { class: 'dlg-grund' }, box);
    // Solange der Dialog offen ist, bewegt sich die Seite dahinter nicht
    document.body.style.overflow = 'hidden';
    const zu = () => {
        grund.remove();
        // Erst wenn kein anderer Dialog mehr offen ist, darf die Seite wieder rollen
        if (!document.querySelector('.dlg-grund')) document.body.style.overflow = '';
        document.removeEventListener('keydown', taste);
    };
    const taste = e => {
        if (e.key === 'Escape') zu();
    };
    // Auf Geräten ohne Maus nicht von selbst ins Feld springen: Die Tastatur würde sofort
    // aufklappen und die Ansicht verschieben. Man tippt das Feld selbst an.
    const mitMaus = window.matchMedia('(hover: hover)').matches;
    const neu = () => {
        const kreuzKnopf = kreuz
            ? h(
                  'button',
                  { class: 'bp-ikonknopf dlg-zu', type: 'button', 'aria-label': 'Schliessen', onclick: zu },
                  ikon('kreuz')
              )
            : null;
        box.replaceChildren(...[kreuzKnopf, zeichne({ zu, neu })].flat(Infinity).filter(Boolean));
        grund.scrollTop = 0;
        const feld = box.querySelector('[data-fokus]');
        if (feld && mitMaus) feld.focus();
    };
    // Klick neben den Dialog schliesst ihn
    grund.addEventListener('mousedown', e => {
        if (e.target === grund) zu();
    });
    document.addEventListener('keydown', taste);
    document.body.append(grund);
    neu();
    return { zu, neu };
};

// Knopf, der einen Wert in die Zwischenablage legt
export const kopierKnopf = wert =>
    h(
        'button',
        {
            class: 'bp-ikonknopf',
            type: 'button',
            'aria-label': 'Kopieren',
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(wert);
                    meldung('Kopiert');
                } catch {
                    meldung('Kopieren ging nicht', 'Bitte von Hand markieren.');
                }
            }
        },
        ikon('kopie')
    );

// Zeile mit einem Wert zum Kopieren
export const kopierZeile = wert =>
    h('div', { class: 'kopier-zeile' }, h('code', { class: 'mono' }, wert), kopierKnopf(wert));

// Leerer Zustand: sagt, was hier hingehört
export const leer = (symbol, titel, text, knopf) =>
    h('div', { class: 'bp-leer' }, ikon(symbol), h('b', {}, titel), h('span', {}, text), knopf || null);

// Macht aus einem Namen eine gültige Adresse (nur a-z, 0-9 und -)
export const zuAdresse = name =>
    [...name.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').normalize('NFD')]
        // Akzente fallen weg, aus «é» wird «e» (Zeichen 0x300 bis 0x36f sind die Akzente)
        .filter(z => z.charCodeAt(0) < 0x300 || z.charCodeAt(0) > 0x36f)
        .join('')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);
