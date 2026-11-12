// Websites im Netzwerk teilen (Plan "N", Stufe 3, 12.11.2026):
// reine Funktionen ohne Browser, geprüft in tests/neuNetzwerk.test.mjs.

/**
 * Was zeigt die Karte «Im Netzwerk»?
 * status = Antwort von GET /api/netzwerk/websites/:uuid (oder null, solange sie lädt)
 * -> { zustand: 'laedt' | 'aus' | 'geteilt' | 'pausiert' | 'gesperrt' | 'herausgenommen', titel, text, knopf, profilLink, feedLink }
 */
export const netzwerkZustand = status => {
    if (!status)
        return { zustand: 'laedt', titel: 'Im Netzwerk', text: '', knopf: null, profilLink: false, feedLink: false };
    const s = status.share;
    const von = s && !s.byMe && s.handle ? ' Geteilt von @' + s.handle + '.' : '';
    // Stufe 4: vom Team aus dem Feed genommen – ändern oder neu teilen geht nicht mehr
    if (s && s.hidden) {
        return {
            zustand: 'herausgenommen',
            titel: 'Im Netzwerk – herausgenommen',
            text:
                'Das vindelis-Team hat «' +
                s.title +
                '» aus dem Feed genommen' +
                (s.hiddenReason ? ': ' + s.hiddenReason : '.') +
                ' Die Website selbst bleibt online.',
            knopf: null,
            profilLink: false,
            feedLink: false
        };
    }
    if (s && s.visible) {
        return {
            zustand: 'geteilt',
            titel: 'Im Netzwerk',
            text: 'Geteilt als «' + s.title + '».' + von,
            knopf: 'Ändern',
            profilLink: false,
            feedLink: true
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
            profilLink: status.reason === 'NEEDS_HANDLE',
            feedLink: false
        };
    }
    if (status.canShare) {
        return {
            zustand: 'aus',
            titel: 'Im Netzwerk',
            text: 'Noch nicht geteilt. Zeig deine Website den anderen auf vindelis.',
            knopf: 'Teilen…',
            profilLink: false,
            feedLink: false
        };
    }
    return {
        zustand: 'gesperrt',
        titel: 'Im Netzwerk',
        text: status.reasonText || 'Diese Website lässt sich nicht teilen.',
        knopf: null,
        profilLink: status.reason === 'NEEDS_HANDLE',
        feedLink: false
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
