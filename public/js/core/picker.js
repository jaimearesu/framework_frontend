// js/core/picker.js
// ---------------------------------------------------------------------
// OBJEKT-AUSWAHL (Dropdown) – für alle Seiten gleich
//
// Zeigt alle sichtbaren Objekte eingerückt als Baum:
//   shop
//      └ produkte
//      └ lager
// onSelect(uuid) wird aufgerufen, wenn jemand ein anderes Objekt wählt.
// ---------------------------------------------------------------------
import { h } from './ui.js';
import { buildObjectForest, objectLabel } from './objects.js';

export const objectPicker = ({ objects, selected = null, onSelect, placeholder = '— Objekt wählen —', label }) => {
    const select = h('select', { class: 'input', 'aria-label': label || placeholder });
    select.append(h('option', { value: '' }, objects.length ? placeholder : '— keine Objekte —'));
    const add = (nodes, depth) =>
        nodes.forEach(n => {
            select.append(
                h(
                    'option',
                    { value: n.object.uuid, selected: n.object.uuid === selected },
                    `${'   '.repeat(depth)}${depth ? '└ ' : ''}${objectLabel(n.object)}`
                )
            );
            add(n.children, depth + 1);
        });
    add(buildObjectForest(objects), 0);
    if (onSelect) select.addEventListener('change', () => onSelect(select.value || null));
    return select;
};
