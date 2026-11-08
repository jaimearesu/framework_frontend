// js/pages/objectEmailLogin.js
// ---------------------------------------------------------------------
// KARTE "ANMELDUNG PER E-MAIL" (Plan "Besucher-Login per E-Mail-Code", E4)
//
// Im Reiter "Website" der Wurzel. Hier schaltet ein Mensch mit blue den Login ein,
// wählt "nur Eingeladene" oder "offen" und verwaltet die Besucher.
//
// Adressen sind Text von Fremden: nur über h()/textContent, nie als HTML.
// Eine KI kommt hier nicht hin (das Backend lehnt jede dieser Anfragen ab).
// ---------------------------------------------------------------------
import { api } from '../core/api.js';
import {
    h,
    mount,
    card,
    field,
    badge,
    spinner,
    callout,
    busyButton,
    copyButton,
    toast,
    resultLine
} from '../core/ui.js';
import { timeAgo } from '../core/format.js';

/** Eingabe in Adressen zerlegen: getrennt durch Leerzeichen, Zeilen, Komma oder Strichpunkt */
export const parseAddressList = text =>
    String(text || '')
        .split(/[\s,;]+/)
        .filter(Boolean);

/** Was steht beim Besucher? */
export const visitorBadge = visitor => {
    if (visitor.blockedAt) return { text: 'gesperrt', tone: 'error' };
    if (visitor.lastLoginAt) return { text: 'schon angemeldet', tone: 'ok' };
    return { text: 'noch nie angemeldet', tone: 'neutral' };
};

/** Warum geht Einschalten gerade nicht? -> Text oder null */
export const cannotEnableReason = data => {
    if (!data.ready) return 'Auf diesem Server ist der Mail-Versand nicht eingerichtet.';
    if (!data.live)
        return 'Stelle die Website zuerst auf „angemeldet“ oder „öffentlich“. Private Websites können das nicht.';
    return null;
};

/** Rückmeldung nach dem Einladen */
export const inviteResultText = ({ added, already, invalid }) =>
    [
        added === 1 ? '1 Adresse hinzugefügt' : `${added} Adressen hinzugefügt`,
        already ? `${already} schon auf der Liste` : null,
        invalid ? `${invalid} ungültig` : null
    ]
        .filter(Boolean)
        .join(', ');

const visitorRow = (o, visitor, reload) => {
    const base = `/api/objects/${o.uuid}/email-login/besucher/${visitor.uuid}`;
    const state = visitorBadge(visitor);
    const act = (path, message) => async () => {
        const r = await api.post(`${base}/${path}`, {});
        if (!r.ok) return toast(r.error, 'error');
        toast(message, 'ok');
        await reload();
    };
    const remove = async () => {
        if (!confirm(`„${visitor.email}“ wirklich von der Liste streichen? Eine laufende Anmeldung endet sofort.`))
            return;
        const r = await api.del(base);
        if (!r.ok) return toast(r.error, 'error');
        toast('Von der Liste gestrichen.', 'ok');
        await reload();
    };
    return h(
        'div',
        { class: 'stack-s', style: 'border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.75rem;' },
        h(
            'div',
            { class: 'row gap-s wrap' },
            h('strong', { style: 'overflow-wrap: anywhere;' }, visitor.email),
            badge(state.text, state.tone),
            visitor.source === 'selbst' ? badge('selbst registriert', 'neutral') : null
        ),
        visitor.lastLoginAt
            ? h('p', { class: 'small muted' }, `Zuletzt angemeldet ${timeAgo(visitor.lastLoginAt)}`)
            : null,
        h(
            'div',
            { class: 'row gap-s wrap' },
            visitor.blockedAt
                ? busyButton('Entsperren', act('entsperren', 'Wieder freigegeben.'), { className: 'btn small' })
                : busyButton('Sperren', act('sperren', 'Gesperrt. Die Anmeldung ist beendet.'), {
                      className: 'btn small'
                  }),
            busyButton('Entfernen', remove, { className: 'btn small' }),
            // Mit dieser ID bekommt der Besucher im Reiter "Zugriff" Rechte auf einen Teil
            visitor.userUuid ? copyButton(() => visitor.userUuid, 'ID kopieren') : null
        )
    );
};

export const renderEmailLoginCard = async (box, o) => {
    const body = h('div');
    const addresses = h('textarea', { rows: 3, placeholder: 'anna@beispiel.ch, ben@beispiel.ch', autocomplete: 'off' });

    const setMode = async (enabled, open) => {
        const r = await api.put(`/api/objects/${o.uuid}/email-login`, { enabled, open });
        if (!r.ok) return toast(r.error, 'error');
        toast(enabled ? 'Gespeichert.' : 'Ausgeschaltet. Alle E-Mail-Anmeldungen sind beendet.', 'ok');
        await load();
    };

    const modeControl = data => {
        const select = h(
            'select',
            {
                onchange: async () => {
                    const open = select.value === 'offen';
                    if (
                        open &&
                        !confirm(
                            'Dann kann sich jede beliebige E-Mail-Adresse auf dieser Website anmelden. Einverstanden?'
                        )
                    ) {
                        select.value = 'eingeladen';
                        return;
                    }
                    await setMode(true, open);
                }
            },
            h('option', { value: 'eingeladen' }, 'Nur Eingeladene'),
            h('option', { value: 'offen' }, 'Offen: jede E-Mail-Adresse')
        );
        select.value = data.openSignup ? 'offen' : 'eingeladen';
        return field('Wer darf sich anmelden?', select);
    };

    const inviteForm = () =>
        h(
            'div',
            { class: 'stack-s' },
            field(
                'Besucher einladen',
                addresses,
                'Eine oder mehrere Adressen. Es geht dabei keine Mail raus: Sag den Leuten einfach die Adresse der Website, dort bekommen sie ihren Code.'
            ),
            busyButton(
                'Auf die Liste setzen',
                async () => {
                    const emails = parseAddressList(addresses.value);
                    if (!emails.length) return toast('Bitte mindestens eine Adresse eingeben.', 'error');
                    const r = await api.post(`/api/objects/${o.uuid}/email-login/besucher`, { emails });
                    if (!r.ok) return toast(r.error, 'error');
                    addresses.value = '';
                    toast(inviteResultText(r.data.data), 'ok');
                    await load();
                },
                { className: 'btn primary' }
            )
        );

    const load = async () => {
        mount(body, spinner('Lade Besucher …'));
        const res = await api.get(`/api/objects/${o.uuid}/email-login`);
        if (!res.ok) {
            return mount(
                body,
                [400, 403, 404].includes(res.status)
                    ? h(
                          'p',
                          { class: 'small muted' },
                          'Das sehen nur eingeloggte Menschen mit blue auf dieser Website.'
                      )
                    : resultLine(res)
            );
        }
        const data = res.data.data;
        const reason = cannotEnableReason(data);
        mount(
            body,
            reason && !data.enabled ? callout('warn', 'Noch nicht möglich: ', reason) : null,
            reason && data.enabled ? callout('warn', 'Gerade ohne Wirkung: ', reason) : null,
            h(
                'div',
                { class: 'row gap-s wrap' },
                badge(data.enabled ? 'eingeschaltet' : 'ausgeschaltet', data.enabled ? 'ok' : 'neutral'),
                data.enabled
                    ? busyButton(
                          'Ausschalten',
                          async () => {
                              if (
                                  !confirm(
                                      'Wirklich ausschalten? Alle Besucher mit E-Mail-Anmeldung werden abgemeldet.'
                                  )
                              )
                                  return;
                              await setMode(false);
                          },
                          { className: 'btn small' }
                      )
                    : reason
                      ? null
                      : busyButton('Einschalten', () => setMode(true), { className: 'btn primary small' })
            ),
            data.enabled ? modeControl(data) : null,
            data.enabled
                ? h('p', { class: 'small muted' }, `Mails diesen Monat: ${data.mails.used} von ${data.mails.max}`)
                : null,
            inviteForm(),
            h('h4', {}, `Besucher (${data.visitorCount})`),
            data.visitors.length === 0
                ? h('p', { class: 'small muted' }, 'Noch niemand auf der Liste.')
                : data.visitors.map(v => visitorRow(o, v, load)),
            data.visitorCount > data.visitors.length
                ? h('p', { class: 'small muted' }, `Es werden die neusten ${data.visitors.length} angezeigt.`)
                : null
        );
    };

    mount(
        box,
        card(
            { title: 'Anmeldung per E-Mail', icon: 'user' },
            h(
                'p',
                { class: 'small muted' },
                'Besucher melden sich ohne vindelis-Konto mit einem Code aus einer Mail an und sehen nirgends den Namen vindelis. Du selbst kommst weiterhin mit deinem Konto hinein: /_vindelis/login?mit=vindelis'
            ),
            body
        )
    );
    await load();
};
