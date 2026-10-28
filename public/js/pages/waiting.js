// js/pages/waiting.js
// ---------------------------------------------------------------------
// WARTET AUF MICH (Besitzer-Ansicht, Punkt 5, D2)
//
// Alles, was ein Mensch entscheiden muss, an einem Ort:
//   1. Freigaben: eine KI bittet darum, etwas zu veröffentlichen
//   2. Neue Uploads von Besuchern der eigenen Websites
// Beide Karten gibt es schon auf der Technik-Übersicht – hier werden
// dieselben Bausteine benutzt (publishRequests.js, visitorUploads.js).
// ---------------------------------------------------------------------
import { on } from '../core/events.js';
import { h, mount, card, emptyState } from '../core/ui.js';
import { pageHeader } from '../core/page.js';
import { renderPendingRequests } from './publishRequests.js';
import { renderPendingUploads } from './visitorUploads.js';

export default {
    render(root, { session }) {
        const requestsBox = h('div');
        const requestsCard = card(
            {
                title: 'Freigaben',
                icon: 'bell',
                subtitle: 'Deine KI-Helfer möchten etwas veröffentlichen. Sie können das nie selbst – du entscheidest.'
            },
            requestsBox
        );
        const uploadsBox = h('div');
        const uploadsCard = card(
            {
                title: 'Neue Uploads',
                icon: 'upload',
                subtitle:
                    'Besucher deiner Websites haben Dateien hochgeladen. Sie bleiben privat, bis du sie freigibst.'
            },
            uploadsBox
        );
        const emptyBox = h('div');
        requestsCard.hidden = true;
        uploadsCard.hidden = true;

        const fill = async s => {
            if (!s.online || s.identity.kind === 'anon') {
                requestsCard.hidden = uploadsCard.hidden = true;
                return mount(
                    emptyBox,
                    emptyState({
                        icon: 'user',
                        title: s.online ? 'Bitte melde dich an' : 'Gerade keine Verbindung',
                        text: s.online
                            ? 'Dann siehst du hier, was auf deine Entscheidung wartet.'
                            : 'Versuch es in einer Minute nochmals.'
                    })
                );
            }
            await Promise.all([
                renderPendingRequests(requestsBox, requestsCard, s),
                renderPendingUploads(uploadsBox, uploadsCard, s)
            ]);
            // Beide Karten leer: freundlich sagen, dass nichts wartet
            if (requestsCard.hidden && uploadsCard.hidden) {
                mount(
                    emptyBox,
                    emptyState({
                        icon: 'check',
                        title: 'Alles erledigt',
                        text: 'Gerade wartet nichts auf dich.'
                    })
                );
            } else mount(emptyBox);
        };

        root.append(
            pageHeader({ intro: 'Was du entscheiden musst – an einem Ort.' }),
            requestsCard,
            uploadsCard,
            emptyBox
        );
        fill(session);
        return on('session', fill);
    }
};
