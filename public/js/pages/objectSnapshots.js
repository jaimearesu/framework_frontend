// js/pages/objectSnapshots.js
// ---------------------------------------------------------------------
// REITER "ZEITMASCHINE" (Plan "R4", Etappe R4a) – nur bei der Wurzel einer Website
//
// Eine Sicherung packt die ganze Website (alle Teile, neuester Code, Datensätze, Dateien)
// in eine Datei. Hier siehst du die Liste und kannst "Jetzt sichern". Wiederherstellen
// (als neue Website) kommt in R4c, nachts automatisch in R4b.
// Code-Versionen speichert at0mic ohnehin immer – die Sicherung schützt vor allem Daten,
// gelöschte Teile und Dateien.
// Alle Texte vom Backend (Beschriftung, Hinweis) nur über h()/textContent.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { h, mount, card, spinner, busyButton, toast, badge, emptyState, resultLine, field } from '../core/ui.js';
import { formatDate, timeAgo, formatNumber } from '../core/format.js';
import { formatBytes } from '../core/site.js';

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

const snapshotRow = s =>
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
        s.note ? h('div', { class: 'small' }, '⚠️ ', s.note) : null
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
                    'Eine Sicherung enthält die ganze Website: alle Teile, den neuesten Code, die Datensätze und die Dateien – nie Tresor-Schlüssel oder Rechte. Code-Versionen speichert at0mic ohnehin immer.'
            },
            h(
                'div',
                { class: 'form-row' },
                field('Jetzt sichern', label, 'Mach das vor einem grossen Umbau. Der Platz zählt zu deinem Speicher.'),
                busyButton('Jetzt sichern', create, { className: 'btn primary', iconName: 'history' })
            ),
            list.length
                ? h('ul', { class: 'request-list' }, list.map(snapshotRow))
                : emptyState({
                      icon: 'history',
                      title: 'Noch keine Sicherung',
                      text: 'Mit „Jetzt sichern“ legst du die erste an.'
                  }),
            h(
                'p',
                { class: 'muted small' },
                'Wiederherstellen (als neue Website) und nächtliche Sicherungen folgen bald.'
            )
        )
    );
};
