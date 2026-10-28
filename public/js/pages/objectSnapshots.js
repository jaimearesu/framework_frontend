// js/pages/objectSnapshots.js
// ---------------------------------------------------------------------
// ZEITMASCHINE IM COCKPIT (Plan "R4")
//   - Reiter "Zeitmaschine" bei der Wurzel einer Website (R4a): Liste + "Jetzt sichern"
//   - "Wiederherstellen" bei jeder Sicherung (R4c): immer als NEUE Website – nie wird etwas
//     Bestehendes überschrieben. Nur echte Menschen mit blue (das Backend prüft es).
//   - Karte "Papierkorb" in der Übersicht (R4c): Sicherungen GELÖSCHTER Websites, 30 Tage lang
// Nachts sichert vindelis geänderte Websites selbst (R4b). Code-Versionen speichert vindelis ohnehin
// immer – die Sicherung schützt vor allem Daten, gelöschte Teile und Dateien.
// Alle Texte vom Backend (Beschriftung, Hinweis, Namen) nur über h()/textContent.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import { h, mount, card, spinner, busyButton, toast, badge, emptyState, resultLine, field } from '../core/ui.js';
import { formatDate, timeAgo, formatNumber } from '../core/format.js';
import { formatBytes } from '../core/site.js';
import { invalidateObjects } from '../core/objects.js';

const KIND_TEXT = { manual: 'von Hand', nightly: 'nachts' };

/** Eine Zeile zu einer Sicherung (reine Funktion, getestet) -> z.B. "5 Teile · 2 Datensätze · 1 Datei (14 B)" */
export const describeSnapshot = s => {
    const parts = [
        `${formatNumber(s.objects)} ${s.objects === 1 ? 'Teil' : 'Teile'}`,
        `${formatNumber(s.dataRows)} ${s.dataRows === 1 ? 'Datensatz' : 'Datensätze'}`,
        s.withFiles
            ? `${formatNumber(s.files)} ${s.files === 1 ? 'Datei' : 'Dateien'}${s.files ? ` (${formatBytes(s.fileBytes)})` : ''}`
            : 'ohne Dateien'
    ];
    return parts.join(' · ');
};

/**
 * Vorschlag für den Namen der neuen Website (reine Funktion, getestet):
 * "brot" + Sicherung vom 24.10.2026 -> "brot-20261024" (max. 100 Zeichen, wie Domain-Namen)
 */
export const suggestRestoreName = s => {
    const d = new Date(s.createdAt);
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `${String(s.domain).slice(0, 100 - stamp.length - 1)}-${stamp}`;
};

// "Wiederherstellen": nach dem Namen fragen, dann als neue Website aufbauen und hinspringen
const restoreButton = s =>
    busyButton(
        'Als neue Website wiederherstellen',
        async () => {
            const name = prompt(
                `Die Sicherung vom ${formatDate(s.createdAt)} wird als NEUE Website aufgebaut (privat, nur du hast Rechte). Nichts Bestehendes wird überschrieben.\n\nName der neuen Website:`,
                suggestRestoreName(s)
            );
            if (!name) return;
            const r = await api.post(`/api/snapshots/${s.uuid}/restore`, { domain: name.trim() });
            if (!r.ok) return toast(r.error || 'Wiederherstellen hat nicht geklappt.', 'error');
            toast(`Wiederhergestellt als „${r.data.data.domain}“.`, 'ok');
            // Härtungs-Runde (28.10.): ehrliche Hinweise – was pausiert, privat, neu einzutragen ist.
            // alert() zeigt reinen Text (kein HTML), darum sicher.
            const hints = Array.isArray(r.data.data.hinweise) ? r.data.data.hinweise : [];
            if (hints.length) alert(`Bitte beachten:\n\n• ${hints.map(String).join('\n• ')}`);
            invalidateObjects();
            location.hash = href('objekte', r.data.data.uuid);
        },
        { className: 'btn', iconName: 'history' }
    );

const snapshotRow = (s, { withRestore = true } = {}) =>
    h(
        'li',
        { class: 'request-item' },
        h(
            'div',
            { class: 'request-what' },
            h('strong', {}, formatDate(s.createdAt)),
            ' ',
            badge(KIND_TEXT[s.kind] || s.kind, s.kind === 'manual' ? 'info' : 'neutral'),
            s.label ? [' ', h('span', {}, `„${s.label}“`)] : null
        ),
        h(
            'div',
            { class: 'muted small' },
            `${describeSnapshot(s)} · gepackt ${formatBytes(s.bytes)} · ${timeAgo(s.createdAt)}`
        ),
        s.note ? h('div', { class: 'small' }, '⚠️ ', s.note) : null,
        withRestore ? h('div', { class: 'request-actions' }, restoreButton(s)) : null
    );

export const renderSnapshotsTab = async (box, o) => {
    mount(box, spinner('Lade Sicherungen …'));
    const res = await api.get(`/api/objects/${o.uuid}/snapshots`);
    if (!res.ok) {
        return mount(
            box,
            card(
                { title: 'Zeitmaschine', icon: 'history' },
                resultLine(res),
                res.status === 403
                    ? h('p', { class: 'small muted' }, 'Sicherungen sieht und macht nur, wer blue auf der Website hat.')
                    : null
            )
        );
    }
    const list = res.data?.data || [];
    const label = h('input', {
        type: 'text',
        class: 'input',
        maxlength: 200,
        placeholder: 'Beschriftung (freiwillig), z.B. „vor dem Umbau“'
    });
    const create = async () => {
        const r = await api.post(`/api/objects/${o.uuid}/snapshots`, label.value ? { label: label.value } : {});
        if (!r.ok) return toast(r.error || 'Sichern hat nicht geklappt.', 'error');
        toast('Gesichert.', 'ok');
        return renderSnapshotsTab(box, o);
    };
    return mount(
        box,
        card(
            {
                title: 'Zeitmaschine',
                icon: 'history',
                subtitle:
                    'Eine Sicherung enthält die ganze Website: alle Teile, den neuesten Code, die Datensätze und die Dateien – nie Tresor-Schlüssel oder Rechte. Nachts sichert vindelis geänderte Websites selbst (7 Nächte + 4 Sonntage bleiben, dazu 10 von Hand).'
            },
            h(
                'div',
                { class: 'form-row' },
                field('Jetzt sichern', label, 'Mach das vor einem grossen Umbau. Der Platz zählt zu deinem Speicher.'),
                busyButton('Jetzt sichern', create, { className: 'btn primary', iconName: 'history' })
            ),
            list.length
                ? h(
                      'ul',
                      { class: 'request-list' },
                      list.map(s => snapshotRow(s))
                  )
                : emptyState({
                      icon: 'history',
                      title: 'Noch keine Sicherung',
                      text: 'Mit „Jetzt sichern“ legst du die erste an.'
                  }),
            h(
                'p',
                { class: 'muted small' },
                'Wiederherstellen baut immer eine NEUE Website auf (privat, nur du hast Rechte) – Tresor-Schlüssel trägst du dort neu ein.'
            )
        )
    );
};

/**
 * Karte "Papierkorb" in der Übersicht: Sicherungen gelöschter Websites (30 Tage).
 * Gibt es keine (oder ist niemand eingeloggt), bleibt die Karte versteckt.
 */
export const renderDeletedSites = async (box, cardEl, s) => {
    if (!s.online || s.identity.kind !== 'user') {
        cardEl.hidden = true;
        return;
    }
    const res = await api.get('/api/snapshots/deleted');
    if (!res.ok) {
        cardEl.hidden = true; // älteres Backend ohne diese Route: nichts zeigen
        return;
    }
    const list = res.data?.data || [];
    cardEl.hidden = list.length === 0;
    if (!list.length) return mount(box);
    // Pro gelöschter Website nur die neueste Sicherung zeigen (die anderen sind älter)
    const newest = [];
    const seen = new Set();
    for (const snap of list) {
        if (seen.has(snap.domain)) continue;
        seen.add(snap.domain);
        newest.push(snap);
    }
    return mount(
        box,
        h(
            'ul',
            { class: 'request-list' },
            newest.map(snap =>
                h(
                    'li',
                    { class: 'request-item' },
                    h(
                        'div',
                        { class: 'request-what' },
                        h('strong', {}, snap.domain),
                        ' – gelöscht ',
                        timeAgo(snap.domainDeletedAt)
                    ),
                    h(
                        'div',
                        { class: 'muted small' },
                        `Letzte Sicherung ${formatDate(snap.createdAt)} · ${describeSnapshot(snap)}`
                    ),
                    h('div', { class: 'request-actions' }, restoreButton(snap))
                )
            )
        ),
        h(
            'p',
            { class: 'muted small' },
            'Sicherungen gelöschter Websites bleiben 30 Tage, danach sind sie endgültig weg.'
        )
    );
};
