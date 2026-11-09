// Reine Funktionen für den Reiter «Einstellungen», ohne Browser.
// Geprüft in tests/neuEinstellungen.test.mjs.
import { formatNumber } from '../../js/core/format.js';
import { formatBytes } from '../../js/core/site.js';

// Die Übersicht, nach Thema gruppiert. recht: was man mindestens braucht (write = red, grant = blue)
const GRUPPEN = [
    [
        'Website',
        [
            ['domain', 'Eigene Domain', 'Die Website unter deiner eigenen Adresse zeigen.', 'grant'],
            ['sichtbarkeit', 'Sichtbarkeit', 'Wer welchen Teil der Website sehen kann.', 'grant']
        ]
    ],
    [
        'Sicherheit',
        [
            ['schluessel', 'Schlüssel', 'Zugangsdaten für fremde Dienste, sicher im Tresor.', 'write'],
            ['sicherungen', 'Sicherungen', 'Frühere Stände ansehen und wiederherstellen.', 'grant']
        ]
    ],
    [
        'Automatik',
        [
            ['auftraege', 'Aufträge und Zeitpläne', 'Was im Hintergrund oder regelmässig läuft.', 'write'],
            ['webhooks', 'Webhooks', 'Nachrichten von fremden Diensten empfangen.', 'write'],
            ['vektoren', 'Vektoren', 'Suche nach Bedeutung statt nach genauen Wörtern.', 'write']
        ]
    ],
    [
        'Website als Ganzes',
        [
            ['klonen', 'Klonen', 'Eine Kopie dieser Website anlegen.', 'write'],
            ['loeschen', 'Löschen', 'Die Website mit allen Daten entfernen.', 'grant', true]
        ]
    ]
];

const darf = (rights, recht) => Boolean(rights?.[recht]);

// Nur, was man mit seinen Rechten auch öffnen kann. Leere Gruppen fallen weg
export const einstellungenFuer = rights =>
    GRUPPEN.map(([gruppe, zeilen]) => [
        gruppe,
        zeilen
            .filter(z => darf(rights, z[3]))
            .map(([id, titel, text, , gefahr]) => ({ id, titel, text, gefahr: Boolean(gefahr) }))
    ]).filter(([, zeilen]) => zeilen.length);

export const bereichErlaubt = (rights, id) =>
    einstellungenFuer(rights).some(([, zeilen]) => zeilen.some(z => z.id === id));

// Für die Auswahl «welcher Teil?». mitWurzel: auch die Website selbst
export const teileFuer = (site, { nurSsf = false, mitWurzel = false } = {}) => {
    const teile = (site.parts || [])
        .filter(p => !nurSsf || (Array.isArray(p.types) && p.types.includes('ssf')))
        .map(p => ({ uuid: p.uuid, name: p.name || 'Teil' }));
    return mitWurzel ? [{ uuid: site.uuid, name: 'Ganze Website (Wurzel)' }, ...teile] : teile;
};

// Bleibt die gemerkte Wahl gültig? Sonst der erste Teil
export const teilGewaehlt = (teile, uuid) => teile.find(t => t.uuid === uuid) || teile[0] || null;

export const STUFEN = {
    private: { titel: 'Privat', text: 'Nur Menschen und KI-Helfer mit Rechten sehen sie.' },
    members: { titel: 'Nur Angemeldete', text: 'Wer angemeldet ist, sieht sie. Gäste nicht.' },
    public: { titel: 'Für alle', text: 'Jeder kann sie unter ihrer Adresse sehen.' }
};

export const stufeText = stufe => STUFEN[stufe]?.titel || String(stufe || '–');

export const ART_DER_SICHERUNG = { manual: 'Von Hand', nightly: 'Nachts' };

const mehrzahl = (n, eins, viele) => formatNumber(n) + ' ' + (n === 1 ? eins : viele);

export const sicherungText = s =>
    [
        mehrzahl(s.objects, 'Teil', 'Teile'),
        mehrzahl(s.dataRows, 'Datensatz', 'Datensätze'),
        s.withFiles
            ? mehrzahl(s.files, 'Datei', 'Dateien') + (s.files ? ' (' + formatBytes(s.fileBytes) + ')' : '')
            : 'ohne Dateien',
        'gepackt ' + formatBytes(s.bytes)
    ].join(', ');

// Vorschlag für den Namen beim Wiederherstellen, z.B. brot-20261024 (höchstens 100 Zeichen)
export const wiederherstellenName = s => {
    const d = new Date(s.createdAt);
    const zwei = n => String(n).padStart(2, '0');
    const stempel = '' + d.getFullYear() + zwei(d.getMonth() + 1) + zwei(d.getDate());
    return String(s.domain).slice(0, 100 - stempel.length - 1) + '-' + stempel;
};

// Mit welchen Feldern werden Datensätze zu Vektoren? Komma-getrennt
export const felderAus = text =>
    String(text || '')
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);

export const vektorZustand = info => {
    const datensaetze = (info.sources || []).find(s => s.name === 'datensaetze');
    return [
        info.rule
            ? 'Regel: ' + info.rule.felder.join(', ')
            : 'Keine Regel. Datensätze werden nicht automatisch erfasst.',
        datensaetze ? mehrzahl(datensaetze.records, 'Datensatz', 'Datensätze') : null,
        info.pending ? formatNumber(info.pending) + ' Stücke warten auf ihren Vektor' : null
    ]
        .filter(Boolean)
        .join(', ');
};

// Manche Hinweise des Backends richten sich an KI-Helfer (Werkzeug-Namen). Menschen sehen sie nicht
export const hinweiseFuerMenschen = hinweise =>
    (Array.isArray(hinweise) ? hinweise : []).map(String).filter(t => !/delete_object|dry_run/.test(t));

// Die Vorschau zählt die Website selbst mit
export const loeschUmfang = vorschau => {
    const teile = Math.max((Array.isArray(vorschau?.parts) ? vorschau.parts.length : 1) - 1, 0);
    if (teile === 0) return 'Die Website wird gelöscht.';
    if (teile === 1) return 'Die Website und ihr Teil werden gelöscht.';
    return 'Die Website und ihre ' + formatNumber(teile) + ' Teile werden gelöscht.';
};
