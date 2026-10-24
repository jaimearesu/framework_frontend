// js/pages/visitorUploads.js
// ---------------------------------------------------------------------
// "WARTET AUF DICH – NEUE UPLOADS" (Plan "R2", Etappe R2b, Entscheidung 5)
//
// Lädt ein Besucher über eine Website in eine Sammlung hoch (Galerie, Bewerbungen …),
// ist die Datei zuerst PRIVAT. Hier entscheidest du pro Upload:
//   Freigeben        -> öffentlich (Besucher sehen ihn, wenn auch die Sammlung sichtbar ist)
//   Privat behalten  -> bleibt privat, verschwindet aus dieser Liste
//   Löschen          -> endgültig weg (normales Löschen, braucht blue)
//
// SICHERHEIT: Die Datei kommt von einem FREMDEN. Die Vorschau holt die Bytes mit deinen
// Rechten und zeigt sie als blob:-Adresse in einem <img> – nie als Seite, darum kann
// darin nichts ausgeführt werden. Namen sind Text vom Besucher: nur über h()/textContent.
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import { href } from '../core/routes.js';
import { h, mount, badge, busyButton, toast, callout } from '../core/ui.js';
import { icon } from '../core/icons.js';
import { timeAgo } from '../core/format.js';
import { formatBytes } from '../core/site.js';

const IMAGE_KINDS = ['png', 'jpg', 'gif', 'webp', 'avif'];
let objectUrls = []; // blob:-Adressen der letzten Vorschau – beim Neuzeichnen freigeben

/**
 * Ein Satz zum Upload (reine Funktion, getestet)
 * -> z.B. "Foto (png, 12.0 KB) über upload-seite – von einem Besucher ohne Anmeldung"
 */
export const describeUpload = item => {
    const what = IMAGE_KINDS.includes(item.kind) ? 'Foto' : item.kind === 'pdf' ? 'PDF' : 'Datei';
    const size = typeof item.bytes === 'number' ? `, ${formatBytes(item.bytes)}` : '';
    const who = item.anonymous ? 'von einem Besucher ohne Anmeldung' : 'von einem angemeldeten Besucher';
    return `${what} (${item.kind || '?'}${size}) über ${item.site} – ${who}`;
};

/** Sieht ein Besucher die Datei nach dem Freigeben? Nur, wenn auch die Sammlung sichtbar ist. */
export const collectionHint = item =>
    item.collectionVisibility === 'private'
        ? 'Die Sammlung ist privat – freigegebene Dateien sehen Besucher erst, wenn du auch die Sammlung veröffentlichst.'
        : null;

// Kleine Vorschau (nur Bilder) – mit deinen Rechten geholt, als blob:-Adresse
const thumb = item => {
    const box = h(
        'div',
        { class: 'upload-thumb' },
        icon(IMAGE_KINDS.includes(item.kind) ? 'image' : 'box', { size: 22 })
    );
    if (IMAGE_KINDS.includes(item.kind)) {
        api.blob(`/api/objects/${item.uuid}/file/content`).then(res => {
            if (!res.ok) return;
            const url = URL.createObjectURL(res.blob);
            objectUrls.push(url);
            mount(box, h('img', { src: url, alt: item.name || 'Upload', class: 'upload-thumb-img' }));
        });
    }
    return box;
};

const uploadItem = (item, reload) => {
    const decide = async (action, body) => {
        const res = await api.post(`/api/uploads/${item.uuid}/${action}`, body);
        if (!res.ok) return toast(res.error || 'Hat nicht geklappt.', 'error');
        toast(action === 'approve' ? 'Freigegeben.' : 'Bleibt privat.', 'ok');
        return reload();
    };
    const remove = async () => {
        if (!confirm(`Diesen Upload endgültig löschen?\n\n${describeUpload(item)}`)) return;
        const res = await api.del(`/api/objects/${item.uuid}`);
        if (!res.ok) return toast(res.error || 'Löschen hat nicht geklappt.', 'error');
        toast('Gelöscht.', 'ok');
        return reload();
    };
    const hint = collectionHint(item);
    return h(
        'li',
        { class: 'request-item upload-item' },
        thumb(item),
        h(
            'div',
            { class: 'upload-body' },
            h('div', { class: 'request-what' }, h('strong', {}, describeUpload(item))),
            h(
                'div',
                { class: 'muted small' },
                item.name ? ['Name: ', h('code', {}, item.name), ' · '] : null,
                timeAgo(item.createdAt)
            ),
            hint ? h('div', { class: 'small' }, '🔒 ', hint) : null,
            h(
                'div',
                { class: 'request-actions' },
                h('a', { class: 'btn ghost', href: href('objekte', item.uuid) }, 'Ansehen'),
                busyButton('Freigeben', () => decide('approve', { visibility: 'public' }), {
                    className: 'btn primary',
                    iconName: 'check'
                }),
                busyButton('Privat behalten', () => decide('keep', {}), { className: 'btn' }),
                busyButton('Löschen', remove, { className: 'btn danger', iconName: 'trash' })
            )
        )
    );
};

/**
 * Die Karte füllen. Gibt es nichts zu entscheiden, bleibt sie versteckt.
 * @param {HTMLElement} box      Inhalt der Karte
 * @param {HTMLElement} cardEl   die ganze Karte (wird ein-/ausgeblendet)
 */
export const renderPendingUploads = async (box, cardEl, s) => {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
    if (!s.online || s.identity.kind === 'anon') {
        cardEl.hidden = true;
        return;
    }
    const res = await api.get('/api/uploads/pending');
    if (!res.ok) {
        // Älteres Backend ohne diese Route (oder KI): Karte einfach nicht zeigen
        cardEl.hidden = res.status === 404 || res.status === 403;
        if (!cardEl.hidden) mount(box, callout('error', 'Konnte die Uploads nicht laden:', ' ', res.error));
        return;
    }
    const list = res.data?.data || [];
    cardEl.hidden = list.length === 0;
    if (!list.length) return mount(box);
    const reload = () => renderPendingUploads(box, cardEl, s);
    mount(
        box,
        s.identity.kind === 'guest'
            ? callout('warn', 'Als Gast kannst du nicht freigeben.', ' Zum Freigeben bitte einloggen.')
            : null,
        h(
            'ul',
            { class: 'request-list' },
            list.map(item => uploadItem(item, reload))
        ),
        h('p', { class: 'muted small' }, badge(String(list.length), 'warn'), ' neue(r) Upload(s) warten auf dich.')
    );
};
