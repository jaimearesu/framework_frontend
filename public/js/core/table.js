// js/core/table.js
// ---------------------------------------------------------------------
// DATENSÄTZE ALS TABELLE
//
// Datensätze sind frei (jeder kann andere Felder haben). Die Spalten sind
// darum alle Felder, die irgendwo vorkommen – die System-Felder (_sys_…)
// zuletzt. Verschachtelte Werte (Objekte, Listen, Joins) werden kurz als
// JSON gezeigt; ein Klick auf die Zeile zeigt den ganzen Datensatz.
// ---------------------------------------------------------------------
import { h, jsonView } from './ui.js';
import { icon } from './icons.js';
import { shortUuid, formatDate } from './format.js';

// Spalten bestimmen (reine Funktion, getestet)
export const tableColumns = (records, max = 12) => {
    const seen = new Map(); // Feld -> wie oft
    for (const r of records || []) {
        for (const key of Object.keys(r || {})) seen.set(key, (seen.get(key) || 0) + 1);
    }
    const own = [...seen.keys()].filter(k => !k.startsWith('_sys_'));
    const sys = [...seen.keys()].filter(k => k.startsWith('_sys_') && k !== '_sys_object_uuid');
    // Härtungs-Runde (28.10.2026): Schlüssel (_sys_key) und Version (_sys_version) bekommen
    // eigene Spalten – vorher sah man sie nur im ganzen Datensatz (Klick auf die Zeile).
    // Den Schlüssel nur, wenn ihn wenigstens ein Datensatz hat.
    return {
        columns: own.slice(0, max),
        hidden: Math.max(own.length - max, 0),
        sys,
        withKey: [...(records || [])].some(r => r?._sys_key !== undefined && r?._sys_key !== null),
        withVersion: seen.has('_sys_version')
    };
};

// Einen Wert kurz anzeigen (reine Funktion, getestet)
export const cellText = value => {
    if (value === undefined) return '';
    if (value === null) return 'null';
    if (typeof value === 'object') {
        // System-Felder (_sys_…) in verschachtelten Werten (z.B. Joins) weglassen –
        // die ganze Wahrheit zeigt der Klick auf die Zeile
        const strip = v =>
            Array.isArray(v)
                ? v.map(strip)
                : v && typeof v === 'object'
                  ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_sys_')))
                  : v;
        const text = JSON.stringify(strip(value));
        return text.length > 60 ? text.slice(0, 57) + '…' : text;
    }
    return String(value);
};

export const recordsTable = (records, { onDelete } = {}) => {
    const { columns, hidden, sys, withKey, withVersion } = tableColumns(records);
    const detailRow = (record, colspan) =>
        h('tr', { class: 'row-detail' }, h('td', { colspan }, jsonView(record, { maxHeight: '300px' })));

    const colCount = columns.length + 2 + (withKey ? 1 : 0) + (withVersion ? 1 : 0) + (onDelete ? 1 : 0);
    const body = h('tbody');
    for (const r of records) {
        const tr = h(
            'tr',
            { class: 'row-main', title: 'Klick: ganzer Datensatz' },
            columns.map(c =>
                h(
                    'td',
                    {
                        class: typeof r[c] === 'number' ? 'num' : typeof r[c] === 'object' && r[c] !== null ? 'obj' : ''
                    },
                    cellText(r[c])
                )
            ),
            withKey ? h('td', { class: 'mono small' }, r._sys_key ?? '') : null,
            withVersion ? h('td', { class: 'num muted small' }, r._sys_version ?? '') : null,
            h('td', { class: 'mono muted small', title: r._sys_id }, shortUuid(r._sys_id)),
            h('td', { class: 'muted small nowrap' }, r._sys_created_at ? formatDate(r._sys_created_at) : ''),
            onDelete
                ? h(
                      'td',
                      {},
                      h(
                          'button',
                          {
                              class: 'icon-btn small danger-icon',
                              type: 'button',
                              title: 'Datensatz löschen',
                              'aria-label': 'Datensatz löschen',
                              onclick: e => {
                                  e.stopPropagation();
                                  onDelete(r);
                              }
                          },
                          icon('x', { size: 15 })
                      )
                  )
                : null
        );
        tr.addEventListener('click', () => {
            const next = tr.nextElementSibling;
            if (next?.classList.contains('row-detail')) next.remove();
            else tr.after(detailRow(r, colCount));
        });
        body.append(tr);
    }

    return h(
        'div',
        { class: 'table-wrap' },
        h(
            'table',
            { class: 'data-table' },
            h(
                'thead',
                {},
                h(
                    'tr',
                    {},
                    columns.map(c => h('th', {}, c)),
                    withKey ? h('th', { title: '_sys_key – eindeutig pro Speicher' }, 'Schlüssel') : null,
                    withVersion
                        ? h('th', { title: '_sys_version – zählt jede Änderung (Konfliktschutz ifVersion)' }, 'Version')
                        : null,
                    h('th', { title: sys.join(', ') }, '_sys_id'),
                    h('th', {}, 'erstellt'),
                    onDelete ? h('th', {}) : null
                )
            ),
            body
        ),
        hidden ? h('p', { class: 'muted small pad' }, `+ ${hidden} weitere Felder (Zeile anklicken)`) : null
    );
};
