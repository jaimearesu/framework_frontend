// js/core/icons.js
// ---------------------------------------------------------------------
// Symbole als kleine Vektor-Grafiken (SVG), alle im gleichen Strich-Stil.
// Benutzung:  icon('box')  -> <svg>…</svg>
// Im HTML:    <span data-icon="menu"></span>  (wird beim Start ersetzt)
// ---------------------------------------------------------------------
const PATHS = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    box: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
    code: 'm16 18 6-6-6-6 M8 6l-6 6 6 6',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
    check: 'M9 12l2 2 4-4 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l4 2',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
    theme: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    x: 'M18 6 6 18 M6 6l12 12',
    copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8 M21 3v5h-5',
    user: 'M20 21a8 8 0 0 0-16 0 M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    login: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
    database:
        'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    server: 'M3 4h18v6H3z M3 14h18v6H3z M7 7h.01 M7 17h.01',
    cpu: 'M6 6h12v12H6z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
    flask: 'M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3 M7 15h10',
    arrowRight: 'M5 12h14 M13 6l6 6-6 6',
    external: 'M14 3h7v7 M10 14 21 3 M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5',
    alert: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
    layers: 'M12 2 2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
    trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6'
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export const icon = (name, { size = 18, className = '' } = {}) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', ('icon ' + className).trim());
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', PATHS[name] || PATHS.info);
    svg.appendChild(path);
    return svg;
};

// Alle <span data-icon="…"> innerhalb von root durch das Symbol ersetzen
export const hydrateIcons = (root = document) => {
    for (const el of root.querySelectorAll('[data-icon]')) {
        if (el.firstChild) continue;
        el.appendChild(icon(el.dataset.icon));
    }
};
