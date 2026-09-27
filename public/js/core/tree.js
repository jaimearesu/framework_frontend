// js/core/tree.js
// ---------------------------------------------------------------------
// DNA-BAUM ANZEIGEN
//
// Zeichnet eine Syntax-DNA als aufklappbaren Baum:
//   ▾ shop            instance · shop · [0]
//     ├ produkte      instance · shop · [0, 1,1]   → öffnen
//     └ kontakt       …
//
// findObject(domain, source) darf ein passendes Objekt aus deiner Liste
// liefern – dann wird der Knoten anklickbar (öffnet das Objekt).
// ---------------------------------------------------------------------
import { h, badge } from './ui.js';
import { icon } from './icons.js';
import { href } from './routes.js';

const nodeRow = (node, findObject) => {
    const obj = findObject ? findObject(node.domain, node.source) : null;
    return h(
        'span',
        { class: 'tree-row' },
        h('span', { class: 'tree-id' }, node.identifier ?? '(ohne identifier)'),
        badge(node.type || 'instance', node.type === 'iteration' ? 'warn' : 'accent'),
        h('span', { class: 'muted small' }, node.domain ?? '– keine domain –'),
        h('code', { class: 'tree-source' }, JSON.stringify(node.source ?? [])),
        obj
            ? h(
                  'a',
                  { class: 'tree-open', href: href('objekte', obj.uuid), title: 'Objekt öffnen' },
                  icon('arrowRight', { size: 14 })
              )
            : null
    );
};

const renderNode = (node, findObject, depth) => {
    if (!node || typeof node !== 'object') return h('li', { class: 'tree-leaf muted' }, '(ungültiger Knoten)');
    const children = Array.isArray(node.children) ? node.children : [];
    if (!children.length) return h('li', { class: 'tree-leaf' }, nodeRow(node, findObject));
    return h(
        'li',
        {},
        h(
            'details',
            { open: depth < 4 },
            h('summary', {}, nodeRow(node, findObject), h('span', { class: 'tree-count' }, String(children.length))),
            h(
                'ul',
                { class: 'tree' },
                children.map(c => renderNode(c, findObject, depth + 1))
            )
        )
    );
};

export const renderDnaTree = (root, { findObject } = {}) =>
    h('ul', { class: 'tree tree-root' }, renderNode(root, findObject, 0));
