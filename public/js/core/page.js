// js/core/page.js
// ---------------------------------------------------------------------
// Gemeinsamer Kopf für jede Seite: Einleitungssatz + Knöpfe rechts.
// ---------------------------------------------------------------------
import { h } from './ui.js';

export const pageHeader = ({ intro, actions }) =>
    h(
        'div',
        { class: 'page-head' },
        h('p', { class: 'page-intro' }, intro || ''),
        actions ? h('div', { class: 'page-actions' }, actions) : null
    );
