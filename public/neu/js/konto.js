// Seite «Konto» (12.11.2026, Wunsch von Jaime «aufgeräumter, wie bei Stripe»):
// Oben ein Raster aus Kacheln – Titel, Symbol und eine Zeile Stand. Ein Klick öffnet den
// Bereich als eigene Ansicht unter #/konto/<bereich>, zurück mit «← Konto» oder dem Browser.
// Die Inhalte der Bereiche sind die gleichen Karten wie vorher (Abrechnung, Benachrichtigungen …).
import { h, ikon, kopierZeile } from './ui.js';
import { api } from '../../js/core/api.js';
import { DATEN } from './daten.js';
import { abmeldeAdresse } from './sitzung.js';
import { abrechnungKarte } from './abrechnung.js';
import { benachrichtigungKarte } from './benachrichtigung.js';
import { abrechnungKurz, rueckkehrAus } from './abrechnung-werte.js';
import { kontoBereiche, bereichAusAdresse, idKurz, benachrichtigungKurz } from './konto-werte.js';
import { profilKopf, profilBereich } from './profil.js';
import { profilKurz } from './profil-werte.js';

const angemeldet = () => DATEN.mensch.art === 'user';
const bereiche = () =>
    kontoBereiche({ angemeldet: angemeldet(), mitId: Boolean(DATEN.mensch.id), mitGrenzen: DATEN.konto.length > 0 });

// Nach der Rückkehr von Stripe (?abrechnung=danke#/konto) gleich die Abrechnung öffnen
const offenerBereich = () => {
    const offen = bereichAusAdresse(location.hash, bereiche());
    if (!offen && rueckkehrAus(location.search) && bereiche().some(b => b.id === 'abrechnung')) {
        history.replaceState(null, '', location.search + '#/konto/abrechnung');
        return 'abrechnung';
    }
    return offen;
};

// Die Zeile Stand auf einer Kachel. Was das Backend erst liefern muss, kommt nach
const STAND_SOFORT = {
    profil: () => profilKurz(DATEN.profil),
    ausweis: () => idKurz(DATEN.mensch.id),
    grenzen: () => (DATEN.konto[0] ? DATEN.konto[0].name + ' ' + DATEN.konto[0].wert : null),
    anmeldung: () => DATEN.mensch.email || 'Angemeldet'
};
const STAND_SPAETER = {
    abrechnung: () => api.get('/api/billing').then(a => (a.ok ? abrechnungKurz(a.data.data) : null)),
    benachrichtigungen: () =>
        api.get('/api/billing/benachrichtigung').then(a => (a.ok ? benachrichtigungKurz(a.data.data) : null))
};

const kachel = b => {
    const stand = h('span', { class: 'konto-stand' }, STAND_SOFORT[b.id] ? STAND_SOFORT[b.id]() : '');
    if (STAND_SPAETER[b.id]) {
        stand.classList.add('laedt');
        STAND_SPAETER[b.id]()
            .catch(() => null)
            .then(text => {
                stand.classList.remove('laedt');
                stand.textContent = text || '';
            });
    }
    return h(
        'a',
        { class: 'bp-karte konto-kachel', id: 'konto-' + b.id, href: '#/konto/' + b.id },
        h('span', { class: 'konto-symbol', 'aria-hidden': 'true' }, ikon(b.symbol)),
        h('span', { class: 'konto-text' }, h('b', {}, b.titel), h('span', { class: 'leise' }, b.text), stand),
        h('span', { class: 'konto-pfeil', 'aria-hidden': 'true' }, ikon('pfeil'))
    );
};

// Die Inhalte der Bereiche (wie vorher die Karten untereinander)
const INHALT = {
    // Plan "N": Name und Bild
    profil: () => profilBereich(),
    ausweis: () =>
        h(
            'div',
            { class: 'bp-karte stapel' },
            h('span', { class: 'leise' }, 'Schick sie jemandem, der dir Zugriff auf seine Website geben möchte.'),
            kopierZeile(DATEN.mensch.id)
        ),
    grenzen: () =>
        h(
            'div',
            { class: 'bp-karte stapel', id: 'konto-grenzen' },
            DATEN.konto.map(k =>
                h(
                    'div',
                    { class: 'mass' },
                    h('div', { class: 'kennzahl' }, h('span', {}, k.name), h('span', { class: 'leise' }, k.wert)),
                    h('div', { class: 'balken' }, h('i', { style: 'width:' + k.anteil + '%' }))
                )
            ),
            angemeldet()
                ? h(
                      'span',
                      { class: 'leise' },
                      'Verbrauch pro Monat und Stufen stehen unter ',
                      h('a', { href: '#/auslastung' }, 'Auslastung'),
                      '.'
                  )
                : null
        ),
    // Abrechnung (Plan "P", P2) und Warn-Mails (11.11.2026): die bestehenden Karten
    abrechnung: () => abrechnungKarte(),
    benachrichtigungen: () => benachrichtigungKarte(),
    anmeldung: () =>
        h(
            'div',
            { class: 'bp-karte stapel' },
            DATEN.mensch.email ? h('span', { class: 'leise' }, 'Angemeldet als ' + DATEN.mensch.email) : null,
            h('div', {}, h('a', { class: 'bp-btn bp-btn-o', id: 'abmelden', href: abmeldeAdresse() }, 'Abmelden'))
        )
};

export const seiteKonto = () => {
    const offen = offenerBereich();
    if (offen) {
        return h(
            'div',
            { class: 'stapel konto-bereich', id: 'konto-bereich-' + offen },
            h('a', { class: 'zurueck', href: '#/konto' }, ikon('zurueck'), 'Konto'),
            INHALT[offen]()
        );
    }
    // Oben das Profil (Plan "N", «das übliche Profildesign»), darunter die Kacheln
    return h(
        'div',
        { class: 'stapel' },
        [profilKopf(), h('div', { class: 'konto-kacheln', id: 'konto-kacheln' }, bereiche().map(kachel))].filter(
            Boolean
        )
    );
};
// Im Kopf steht der Name des offenen Bereichs, sonst «Konto»
seiteKonto.titel = () => {
    const offen = bereichAusAdresse(location.hash, bereiche());
    return offen ? bereiche().find(b => b.id === offen).titel : 'Konto';
};
