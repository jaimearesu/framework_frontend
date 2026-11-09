// Suche (Strg K): Websites, KI-Helfer und Seiten, alles direkt im Browser.
// Eine Suche durch Code, Daten und Personen braucht eine neue Abfrage im Backend (eigener Plan nach der Umstellung).
import { h, ikon, dialog } from './ui.js';
import { DATEN } from './daten.js';
import { WERKZEUGE } from './werkstatt-werte.js';

// Gross/klein und Akzente zählen nicht. Pro Zeichen genau ein Zeichen, damit die Fundstelle stimmt.
const einfach = text =>
    String(text)
        .split('')
        .map(z => z.toLowerCase().normalize('NFD')[0] || z)
        .join('');

// Ein Suchwort in Varianten: «mueller» findet auch «Müller»
const varianten = wort => {
    const w = einfach(wort);
    return [...new Set([w, w.replaceAll('ae', 'a').replaceAll('oe', 'o').replaceAll('ue', 'u')])];
};

// Erste Fundstelle eines Worts im Text, oder null
const fundstelle = (text, wort) => {
    const t = einfach(text);
    for (const v of varianten(wort)) {
        const stelle = t.indexOf(v);
        if (stelle >= 0) return { stelle, laenge: v.length };
    }
    return null;
};

// Alles, was durchsucht wird: die Namen, die der Browser schon kennt
const allesDurchsuchbare = seiten => [
    ...DATEN.websites.map(w => ({
        art: 'Websites',
        symbol: 'kugel',
        titel: w.titel,
        texte: [w.beschreibung, w.adresse],
        pfad: '#/website/' + w.id
    })),
    ...DATEN.helfer.map(x => ({
        art: 'KI-Helfer',
        symbol: 'helfer',
        titel: x.name,
        texte: x.websites,
        pfad: '#/helfer'
    })),
    ...seiten.map(m => ({ art: 'Seiten', symbol: m.symbol, titel: m.text, texte: [], pfad: m.pfad })),
    ...WERKZEUGE.map(w => ({ art: 'Werkstatt', symbol: 'werkstatt', titel: w.titel, texte: [w.text], pfad: w.adresse }))
];

// Alle Wörter müssen vorkommen. Treffer im Namen zählen mehr als Treffer im Text.
const bewerten = (eintrag, woerter) => {
    let punkte = 0;
    for (const wort of woerter) {
        const imTitel = fundstelle(eintrag.titel, wort);
        if (imTitel) {
            punkte += imTitel.stelle === 0 ? 4 : 3;
            continue;
        }
        if (!eintrag.texte.some(t => fundstelle(t, wort))) return 0;
        punkte += 1;
    }
    return punkte;
};

// Baut einen Text mit markierten Fundstellen
const markiert = (text, woerter) => {
    const stellen = woerter
        .map(w => fundstelle(text, w))
        .filter(Boolean)
        .sort((a, b) => a.stelle - b.stelle);
    const teile = [];
    let pos = 0;
    for (const { stelle, laenge } of stellen) {
        if (stelle < pos) continue;
        teile.push(text.slice(pos, stelle), h('mark', {}, text.slice(stelle, stelle + laenge)));
        pos = stelle + laenge;
    }
    teile.push(text.slice(pos));
    return teile;
};

// Der Ausschnitt rund um die erste Fundstelle
const ausschnitt = (eintrag, woerter) => {
    for (const text of eintrag.texte) {
        const f = woerter.map(w => fundstelle(text, w)).find(Boolean);
        if (!f) continue;
        const beginn = Math.max(0, f.stelle - 32);
        const roh = text.trim() === text ? text : text.trim();
        const stueck = beginn > 0 && roh === text ? '…' + text.slice(beginn) : roh;
        return markiert(stueck, woerter);
    }
    return null;
};

export const sucheOeffnen = seiten => {
    if (document.querySelector('.dlg-such')) return;
    let begriff = '';
    let aktiv = 0;
    let gefunden = [];

    dialog(
        ({ zu }) => {
            const liste = h('div', { class: 'such-treffer', id: 'such-liste' });

            const suchen = () => {
                const woerter = begriff.trim().split(/\s+/).filter(Boolean);
                const alle = allesDurchsuchbare(seiten);
                if (!woerter.length) return { woerter, treffer: alle.filter(e => e.art === 'Seiten') };
                const treffer = alle
                    .map(eintrag => ({ eintrag, punkte: bewerten(eintrag, woerter) }))
                    .filter(x => x.punkte > 0)
                    .sort((a, b) => b.punkte - a.punkte)
                    .slice(0, 20)
                    .map(x => x.eintrag);
                return { woerter, treffer };
            };

            // Zeichnet die Treffer, nach Art gruppiert
            const fuellen = () => {
                const { woerter, treffer } = suchen();
                const arten = [...new Set(treffer.map(t => t.art))];
                gefunden = arten.flatMap(art => treffer.filter(t => t.art === art));
                aktiv = Math.min(aktiv, Math.max(0, gefunden.length - 1));
                if (!gefunden.length) {
                    liste.replaceChildren(h('span', { class: 'leise' }, 'Nichts gefunden.'));
                    return;
                }
                let nr = -1;
                liste.replaceChildren(
                    ...arten.flatMap(art => [
                        h('div', { class: 'such-gruppe' }, art),
                        ...gefunden
                            .filter(t => t.art === art)
                            .map(t => {
                                nr += 1;
                                const zweite = woerter.length ? ausschnitt(t, woerter) : null;
                                return h(
                                    'a',
                                    { class: 'treffer' + (nr === aktiv ? ' aktiv' : ''), href: t.pfad, onclick: zu },
                                    ikon(t.symbol),
                                    h(
                                        'div',
                                        { class: 'treffer-text' },
                                        h(
                                            'span',
                                            {},
                                            woerter.length ? markiert(t.titel, woerter) : t.titel,
                                            t.zusatz ? h('span', { class: 'leise' }, '  ' + t.zusatz) : null
                                        ),
                                        zweite ? h('span', { class: 'leise' + (t.code ? ' mono' : '') }, zweite) : null
                                    )
                                );
                            })
                    ])
                );
                liste.querySelector('.treffer.aktiv')?.scrollIntoView({ block: 'nearest' });
            };
            fuellen();

            return [
                h(
                    'div',
                    { class: 'bp-mit-ik dlg-such' },
                    ikon('suche'),
                    h('input', {
                        id: 'such-feld',
                        class: 'bp-in',
                        placeholder: 'Websites, KI-Helfer, Seiten…',
                        'aria-label': 'Suchen',
                        'data-fokus': true,
                        autocomplete: 'off',
                        oninput: e => {
                            begriff = e.target.value;
                            aktiv = 0;
                            fuellen();
                        },
                        onkeydown: e => {
                            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                e.preventDefault();
                                const schritt = e.key === 'ArrowDown' ? 1 : -1;
                                aktiv = (aktiv + schritt + gefunden.length) % Math.max(1, gefunden.length);
                                fuellen();
                            }
                            if (e.key === 'Enter' && gefunden[aktiv]) {
                                location.assign(gefunden[aktiv].pfad);
                                zu();
                            }
                        }
                    })
                ),
                liste
            ];
        },
        { kreuz: false }
    );
};
