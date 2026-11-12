// Websites im Netzwerk teilen (Plan "N", Stufe 3, 12.11.2026):
// reine Funktionen ohne Browser, geprüft in tests/neuNetzwerk.test.mjs.

/**
 * Was zeigt die Karte «Im Netzwerk»?
 * status = Antwort von GET /api/netzwerk/websites/:uuid (oder null, solange sie lädt)
 * -> { zustand: 'laedt' | 'aus' | 'geteilt' | 'pausiert' | 'gesperrt', titel, text, knopf, profilLink }
 */
export const netzwerkZustand = status => {
    if (!status) return { zustand: 'laedt', titel: 'Im Netzwerk', text: '', knopf: null, profilLink: false };
    const s = status.share;
    const von = s && !s.byMe && s.handle ? ' Geteilt von @' + s.handle + '.' : '';
    if (s && s.visible) {
        return {
            zustand: 'geteilt',
            titel: 'Im Netzwerk',
            text: 'Geteilt als «' + s.title + '».' + von,
            knopf: 'Ändern',
            profilLink: false
        };
    }
    if (s) {
        return {
            zustand: 'pausiert',
            titel: 'Im Netzwerk – pausiert',
            text:
                'Geteilt als «' +
                s.title +
                '», gerade aber nicht sichtbar: ' +
                (status.reasonText || 'Die Website ist nicht öffentlich, oder es fehlen die Rechte.') +
                von,
            knopf: 'Ändern',
            profilLink: status.reason === 'NEEDS_HANDLE'
        };
    }
    if (status.canShare) {
        return {
            zustand: 'aus',
            titel: 'Im Netzwerk',
            text: 'Noch nicht geteilt. Zeig deine Website den anderen auf vindelis.',
            knopf: 'Teilen…',
            profilLink: false
        };
    }
    return {
        zustand: 'gesperrt',
        titel: 'Im Netzwerk',
        text: status.reasonText || 'Diese Website lässt sich nicht teilen.',
        knopf: null,
        profilLink: status.reason === 'NEEDS_HANDLE'
    };
};

// Was in PUT /api/netzwerk/websites/:uuid geht: Titel und Satz ohne Leerzeichen am Rand, leerer Satz = null
export const teilenAuftrag = (titel, satz) => {
    const t = String(titel || '').trim();
    const s = String(satz || '').trim();
    return { title: t, blurb: s || null };
};

// Noch so viele Zeichen frei (wie das Backend: Zeichen, nicht Bytes)
export const zeichenRest = (text, max) => max - [...String(text || '')].length;
