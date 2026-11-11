// Reine Funktionen für den Reiter «Auslastung» (Plan "T", T4), ohne Browser.
// Aus der Antwort von GET /api/billing/usage (und GET /api/billing) wird, was auf dem
// Bildschirm steht: Balken pro Bereich, «noch Platz», Anteile pro Website, die Stufen
// mit dem passenden Knopf. Geprüft in tests/neuAuslastung.test.mjs.

// Namen und Erklärung der vier Bereiche (Reihenfolge wie im Backend)
export const BEREICHE = {
    runs: ['Ausführungen', 'Wie oft Besucher, Webhooks und Aufträge deinen Server-Code starten – pro Monat.'],
    dataRows: ['Datensätze', 'Alle gespeicherten Datensätze deiner Websites zusammen.'],
    storageBytes: ['Dateien und Sicherungen', 'Bilder, Dokumente und die Sicherungen der Zeitmaschine.'],
    customDomains: ['Eigene Domains', 'Adressen wie www.meinladen.ch, die auf deine Websites zeigen.']
};

// 12'345 wie in der Schweiz üblich
export const zahl = n =>
    Number.isFinite(n)
        ? Math.round(n)
              .toString()
              .replace(/\B(?=(\d{3})+(?!\d))/g, "'")
        : '–';

// Bytes lesbar: 0 B, 812 KB, 4.2 MB, 1.5 GB
export const bytes = n => {
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const stufen = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let wert = n;
    while (wert >= 1000 && i < stufen.length - 1) {
        wert /= 1000;
        i++;
    }
    return (i === 0 || wert >= 100 ? Math.round(wert) : Math.round(wert * 10) / 10) + ' ' + stufen[i];
};

// Ein Wert im Format seines Bereichs; null = unbegrenzt
export const wertText = (bereich, n) => {
    if (n === null || n === undefined) return 'unbegrenzt';
    return bereich === 'storageBytes' ? bytes(n) : zahl(n);
};

// Zustand -> Farbe des Balkens und kurzes Wort
const ZUSTAENDE = {
    ok: ['ok', null],
    bald: ['warn', 'Bald voll'],
    voll: ['voll', 'Voll'],
    gesperrt: ['stop', 'Gebremst']
};

/**
 * Ein Bereich als Balken.
 * Der Balken geht bis 150 % (dort wird gebremst); die Marke bei 100 % zeigt die Grenze der Stufe.
 * -> { key, name, erklaerung, text, prozent, breite, marke, farbe, wort, platz, naechste }
 */
export const bereichAnsicht = (m, naechsteName) => {
    const [name, erklaerung] = BEREICHE[m.key] || [m.key, ''];
    const unbegrenzt = m.limit === null;
    const domains = m.key === 'customDomains';
    const [farbe, wort] = ZUSTAENDE[m.state] || ZUSTAENDE.ok;
    // Breite gegen die harte Grenze (150 %), damit «voll» noch Luft zeigt; Domains ohne Kulanz
    const bis = unbegrenzt ? null : domains ? m.limit : m.hardLimit;
    const breite = bis ? Math.min(100, Math.round((m.used / bis) * 1000) / 10) : 0;
    const marke = !unbegrenzt && !domains && m.hardLimit ? Math.round((m.limit / m.hardLimit) * 1000) / 10 : null;

    let platz;
    if (unbegrenzt) platz = 'Keine Grenze';
    else if (domains && m.limit === 0) platz = 'Ab der Stufe Klein';
    else if (m.used < m.limit) platz = 'Noch ' + wertText(m.key, m.limit - m.used) + ' frei';
    else if (domains) platz = 'Keine weitere möglich';
    else if (m.state === 'gesperrt') platz = 'Über 150 % – wird gebremst';
    else platz = 'Über der Grenze – läuft noch bis ' + wertText(m.key, m.hardLimit);

    return {
        key: m.key,
        name,
        erklaerung,
        text: wertText(m.key, m.used) + ' von ' + wertText(m.key, m.limit),
        prozent: m.percent === null || m.percent === undefined ? null : m.percent,
        breite,
        marke,
        farbe,
        wort,
        platz,
        naechste:
            naechsteName && m.nextLimit !== undefined && !unbegrenzt
                ? naechsteName + ': ' + wertText(m.key, m.nextLimit)
                : null
    };
};

const datum = wert => {
    const ms = Date.parse(wert);
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('de-CH') : null;
};

// Grosser Satz oben: wo stehe ich, habe ich noch Platz?
export const gesamtSatz = u => {
    if (u.tier.current === null)
        return ['ok', 'Gratis ohne Grenzen', 'Dein Konto hat keine Grenzen (von Hand freigeschaltet).'];
    const naechste = u.tiers.find(t => t.id === u.tier.next);
    const hoeher = naechste ? ' Mit der Stufe ' + naechste.name + ' hast du mehr Platz.' : '';
    switch (u.state) {
        case 'bald':
            return ['warn', 'Bald voll', 'Ein Bereich ist über 80 %.' + hoeher];
        case 'voll':
            return [
                'warn',
                'Über der Grenze',
                'Alles läuft noch weiter – bis 150 % der Stufe. Danach wird gebremst.' + hoeher
            ];
        case 'gesperrt':
            return [
                'gefahr',
                'Gebremst',
                'Ein Bereich ist über 150 %: Server-Code für Besucher antwortet «zu viel», neue Datensätze und Dateien werden abgelehnt. Deine Websites bleiben online.' +
                    hoeher
            ];
        default:
            return ['ok', 'Du hast noch Platz', 'Alle Bereiche sind unter 80 % deiner Stufe.'];
    }
};

/**
 * Kopf der Seite: Stufe, Monat, Hinweis ob die Grenzen schon gelten.
 */
export const kopfAnsicht = u => {
    const stufe = u.tiers.find(t => t.id === u.tier.current);
    const [farbe, titel, text] = gesamtSatz(u);
    return {
        stufe: u.tier.current === null ? 'Gratis live' : stufe ? stufe.name : u.tier.current,
        farbe,
        titel,
        text,
        neuAb: datum(u.month.resetsAt)
            ? 'Ausführungen zählen ab ' + datum(u.month.resetsAt) + ' wieder von null.'
            : null,
        // Solange BILLING_ENFORCE aus ist, wird nichts gebremst – nur angezeigt
        nurAnzeige: u.enforced !== true,
        braucht:
            u.needed === null
                ? 'Dein Verbrauch ist grösser als die Stufe Plattform – schreib uns.'
                : u.tier.current !== null && u.needed !== u.tier.current && rang(u, u.needed) > rang(u, u.tier.current)
                  ? 'Dein Verbrauch passt in die Stufe ' + (u.tiers.find(t => t.id === u.needed) || {}).name + '.'
                  : null
    };
};

const rang = (u, id) => u.tiers.findIndex(t => t.id === id);

// Preis in Rappen -> «5.–» / «Gratis»
export const preisText = (rappen, waehrung = 'chf') =>
    rappen === 0
        ? 'Kostet nichts'
        : (rappen % 100 === 0 ? rappen / 100 + '.–' : (rappen / 100).toFixed(2)) +
          ' ' +
          waehrung.toUpperCase() +
          ' / Monat';

const LAUFEND = ['active', 'past_due', 'paused'];

/**
 * Die Stufen als Liste mit dem passenden Knopf.
 * stand = GET /api/billing (Abo-Stand), u = GET /api/billing/usage.
 * knopf: null | { art: 'kaufen' | 'wechseln' | 'portal' | 'zuruecknehmen', text }
 */
export const stufenAnsicht = (u, stand) => {
    const laeuft = LAUFEND.includes(stand.status);
    const gebucht = laeuft ? stand.tier : 'gratis';
    const gebuchtRang = rang(u, gebucht);
    const neededRang = u.needed === null ? Infinity : rang(u, u.needed);
    return u.tiers.map((t, i) => {
        let knopf = null;
        let notiz = null;
        if (stand.stripeEnabled === true && !stand.freeLive) {
            if (t.id === gebucht) {
                notiz = stand.tierWanted ? 'Wechselt am Ende des Monats' : null;
                if (stand.tierWanted) knopf = { art: 'zuruecknehmen', text: 'Wechsel zurücknehmen' };
            } else if (!laeuft && t.id !== 'gratis') {
                knopf = { art: 'kaufen', text: t.name + ' buchen' };
            } else if (laeuft && t.id === 'gratis') {
                knopf = { art: 'portal', text: 'Abo kündigen' };
            } else if (laeuft && i > gebuchtRang) {
                knopf = { art: 'wechseln', text: 'Auf ' + t.name + ' wechseln' };
            } else if (laeuft && i < gebuchtRang) {
                if (i < neededRang) notiz = 'Dein Verbrauch passt nicht hinein';
                else if (stand.tierWanted === t.id) notiz = 'Vorgemerkt ab Ende des Monats';
                else knopf = { art: 'wechseln', text: 'Ab nächstem Monat ' + t.name };
            }
        }
        return {
            id: t.id,
            name: t.name,
            preis: preisText(t.price, stand.currency || 'chf'),
            jetzt: t.id === gebucht && !stand.freeLive,
            passt: i === neededRang,
            zeilen: [
                zahl(t.runs) + ' Ausführungen / Monat',
                zahl(t.dataRows) + ' Datensätze',
                bytes(t.storageBytes) + ' Dateien',
                t.customDomains === null
                    ? 'Eigene Domains unbegrenzt'
                    : t.customDomains === 0
                      ? 'Keine eigene Domain'
                      : t.customDomains + ' eigene Domains'
            ],
            knopf,
            notiz
        };
    });
};

// Kostendach für «automatisch hochstufen»: nur Stufen über der gebuchten
export const kostendachWahl = (u, stand) => {
    if (!LAUFEND.includes(stand.status) || stand.stripeEnabled !== true || stand.freeLive) return null;
    const ab = rang(u, stand.tier);
    return {
        wert: stand.autoUpgradeMax || '',
        optionen: [['', 'Aus – nie automatisch']].concat(
            u.tiers
                .filter((t, i) => i > ab)
                .map(t => [t.id, 'Bis höchstens ' + t.name + ' (' + preisText(t.price, stand.currency || 'chf') + ')'])
        )
    };
};

/**
 * Pro Website: Name, Anteil an den Ausführungen (für den kleinen Balken) und die Zahlen.
 * Sortiert: wer am meisten verbraucht, zuoberst.
 */
export const websitesAnsicht = u =>
    [...(u.sites || [])]
        .sort((a, b) => b.runs - a.runs || b.dataRows - a.dataRows || b.fileBytes - a.fileBytes)
        .map(s => ({
            uuid: s.uuid,
            name: s.domain,
            anteil: s.share ? s.share.runs : 0,
            zeilen: [
                ['Ausführungen', zahl(s.runs), s.share ? s.share.runs : 0],
                ['Datensätze', zahl(s.dataRows), s.share ? s.share.dataRows : 0],
                ['Dateien', bytes(s.fileBytes), s.share ? s.share.storageBytes : 0]
            ],
            domains: s.customDomains || 0
        }));
