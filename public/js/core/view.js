// js/core/view.js
// ---------------------------------------------------------------------
// ZWEI ANSICHTEN (Punkt 5, D2, 28.10.2026)
//
//   besitzer  -> der Normalfall: Übersicht, Wartet auf mich, KI-Helfer und
//                die eigenen Websites als Baum. Keine Fachwörter.
//   technik   -> die bisherigen Seiten (Objekte, Code & DNA, SSF-Studio,
//                Daten, Rechte, Tresor, Systemcheck …) mit allen Details.
//
// Die Technik darunter ist dieselbe – es ändert sich nur, was man sieht.
// Der Browser merkt sich die Wahl (Entscheidung N1: Standard = besitzer).
// Die reinen Funktionen hier werden in tests/view.test.mjs geprüft.
// ---------------------------------------------------------------------
import { emit } from './events.js';
import { load, save } from './storage.js';

export const VIEWS = ['besitzer', 'technik'];
const DEFAULT_VIEW = 'besitzer';

// Gültige Ansicht aus einem gespeicherten Wert (Unsinn -> Standard)
export const normalizeView = v => (VIEWS.includes(v) ? v : DEFAULT_VIEW);

export const getView = () => normalizeView(load('view'));
export const isTechView = () => getView() === 'technik';

export const setView = v => {
    const next = normalizeView(v);
    save('view', next);
    document.body.dataset.view = next;
    emit('view', next);
};

// ------------------------------------------------------------------
// Menü der Besitzer-Ansicht (die Websites kommen separat als Baum dazu)
// ------------------------------------------------------------------
export const OWNER_NAV = [
    { id: '', title: 'Übersicht', icon: 'home' },
    { id: 'wartet', title: 'Wartet auf mich', icon: 'bell', badge: 'waiting' },
    { id: 'agenten', title: 'KI-Helfer', icon: 'robot' }
];

// Seiten, die in der Besitzer-Ansicht einen anderen Namen tragen
const OWNER_TITLES = { agenten: 'KI-Helfer' };
export const titleFor = (route, view) => (view === 'besitzer' && OWNER_TITLES[route.id]) || route.title;

// ------------------------------------------------------------------
// WEBSITES-BAUM aus der Objekt-Liste (GET /api/objects)
//
//   Wurzel (eigene Domain):  domain = 'shop', path = ['0']
//   direktes Kind:           domain_ref = 'shop', path = ['0', '3']  (zwei Stufen)
//
// Weggelassen werden (Entscheidung N2): das eigene Benutzer-Objekt und die
// Agenten (die stehen unter "KI-Helfer"). Seit D3 kommen Art, Zustand usw.
// aus GET /api/websites (mergeSites unten); dieser Baum liefert nur noch die Teile.
// Rückgabe: [{ uuid, name, visibility, children: [{ uuid, name }] }], nach Namen sortiert.
// ------------------------------------------------------------------
const byName = (a, b) => a.name.localeCompare(b.name, 'de');

export const websiteTree = (objects, { excludeUuids = [] } = {}) => {
    const list = Array.isArray(objects) ? objects : [];
    const skip = new Set(excludeUuids.filter(Boolean));
    const roots = list.filter(o => o && o.domain && !skip.has(o.uuid));
    return roots
        .map(root => ({
            uuid: root.uuid,
            name: String(root.domain),
            visibility: root.visibility || 'private',
            children: list
                .filter(c => c && !c.domain && c.domain_ref === root.domain && (c.path || []).length === 2)
                .map(c => ({
                    uuid: c.uuid,
                    // Name des Kindes steht in der DNA der Wurzel (Backend liefert ihn als identifier)
                    name: c.identifier ? String(c.identifier) : `Teil ${(c.path || [])[1] ?? '?'}`
                }))
                .sort(byName)
        }))
        .sort(byName);
};

// ------------------------------------------------------------------
// Fehler-Leiste: in der Besitzer-Ansicht in Alltagssprache (keine Befehle)
// kind: 'offline' | 'database'
// ------------------------------------------------------------------
export const ownerProblemText = kind =>
    kind === 'database'
        ? 'vindelis kann gerade nicht auf die Daten zugreifen. Versuch es in einer Minute nochmals.'
        : 'vindelis ist gerade nicht erreichbar. Versuch es in einer Minute nochmals.';

// Begrüssung nach Tageszeit (Stunde 0–23)
export const greetingFor = hour =>
    hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';

// Adresse einer Website zum Anzeigen: Vorlage "https://{name}.vindelis.site" -> "name.vindelis.site"
export const siteAddress = (template, name) => {
    if (!template || !name) return '';
    return String(template)
        .replace('{name}', name)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
};

// ------------------------------------------------------------------
// MEINE WEBSITES (D3): Liste aus GET /api/websites + die Teile aus dem Baum
// -> [{ uuid, name, art, visibility, address, customHost, lastChange,
//       problems24h, liveNow, rights, children }], nach Namen sortiert.
// Die Route lässt Benutzer-Objekte und Agenten schon weg.
// ------------------------------------------------------------------
export const mergeSites = (websites, objects) => {
    const children = new Map(websiteTree(objects).map(t => [t.uuid, t.children]));
    return (Array.isArray(websites) ? websites : [])
        .filter(w => w && w.uuid && w.name)
        .map(w => ({
            ...w,
            name: String(w.name),
            art: w.art || 'website',
            visibility: w.visibility || 'private',
            children: children.get(w.uuid) || []
        }))
        .sort(byName);
};

// Echte Websites zuerst, Speicher und Werkzeugkästen unter "Weitere" (Entscheidung W2)
export const splitByArt = sites => ({
    websites: sites.filter(s => s.art === 'website'),
    others: sites.filter(s => s.art !== 'website')
});

// Platzhalter-Bild der Kachel (W3): ruhige Farbe aus dem Namen berechnet, immer gleich
export const placeholderHue = name => {
    let hash = 0;
    for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return hash % 360;
};

// Adresse auf der Kachel: eigene Domain zuerst, sonst *.vindelis.site – ohne https://
export const displayAddress = site =>
    String(site?.customHost || site?.address || '')
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');

// Zeile "Probleme" auf der Kachel: null = darfst du nicht sehen -> nichts zeigen
export const problemsText = count =>
    count === null || count === undefined
        ? null
        : count === 0
          ? 'Keine Probleme'
          : count === 1
            ? '1 Problem heute'
            : `${count} Probleme heute`;

export const ART_TEXT = { website: 'Website', speicher: 'Speicher', werkzeugkasten: 'Werkzeugkasten' };

// ------------------------------------------------------------------
// WEBSITE-SEITE (D4) – Texte in Alltagssprache
// ------------------------------------------------------------------

// Sichtbarkeit als Satz ("Sichtbar für")
export const VISIBILITY_SENTENCE = {
    public: 'Alle – die Website ist online',
    members: 'Nur Angemeldete (mit vindelis-Konto)',
    private: 'Nur du und wer Zugriff hat'
};

// Höchstes Recht eines Mitglieds in Worten (blue > red > black)
export const roleText = roles => {
    const list = Array.isArray(roles) ? roles : [];
    if (list.includes('blue')) return 'verwaltet';
    if (list.includes('red')) return 'darf bauen';
    if (list.includes('black')) return 'darf ansehen';
    return '–';
};

// Wer ist das? Ich = "Du", andere Menschen ohne Namen (S3), Objekte/KI mit Namen
export const memberText = (member, myUuid) => {
    if (!member) return '–';
    if (myUuid && member.uuid === myUuid) return 'Du';
    if (member.kind === 'mensch') return 'Eine weitere Person';
    if (member.identifier) return `${member.name}/${member.identifier}`;
    return member.name || 'Ein Objekt';
};

// Was ist ein Teil? Aus seinen Code-Arten, Datei und Datensätzen
export const partKind = part => {
    const types = Array.isArray(part?.types) ? part.types : [];
    if (types.includes('werkzeug')) return 'Werkzeug';
    if (types.includes('ssf')) return 'Funktion';
    if (types.includes('library')) return 'Bibliothek';
    if (part?.hasFile) return 'Datei';
    if (types.some(t => ['html', 'css', 'javascript'].includes(t))) return 'Inhalt';
    if (part?.dataRows > 0) return 'Daten';
    return 'Leer';
};

// Art eines Problems in Worten (Arten aus dem Backend, problemService.KINDS)
const PROBLEM_TEXT = {
    ssf_fehler: 'Fehler in einer Funktion',
    nicht_gefunden: 'Teil nicht gefunden',
    server_voll: 'Server kurz ausgelastet',
    bremse: 'Zu viele Aufrufe',
    anfrage_ungueltig: 'Ungültige Anfrage',
    upload_abgelehnt: 'Upload abgelehnt',
    datei_fehlt: 'Bild oder Datei fehlt',
    dienst_weg: 'Dienst kurz weg',
    webhook_fehler: 'Fehler bei einem Webhook',
    live_abgewiesen: 'Live-Verbindung abgewiesen',
    auftrag_fehlgeschlagen: 'Hintergrund-Auftrag fehlgeschlagen',
    vektoren_pausiert: 'Vektoren pausiert (Kontingent)',
    zeitplan: 'Termin im Zeitplan ausgefallen',
    eigene_domain: 'Eigene Domain nicht aktiv'
};
export const problemKindText = kind => PROBLEM_TEXT[kind] || String(kind || '').replace(/_/g, ' ');

// "KI bitten, es zu reparieren" (E5): fertiger Satz für den KI-Helfer – nur Name und Zeitraum,
// keine Fehlermeldungen (die liest die KI selbst mit site_problems, mit ihren eigenen Rechten)
export const repairPrompt = (siteName, hours = 24) =>
    `Bitte schau dir mit dem Werkzeug site_problems die Probleme der Website «${siteName}» der letzten ` +
    `${hours === 24 ? '24 Stunden' : `${Math.round(hours / 24)} Tage`} an, finde die Ursachen und behebe sie. ` +
    'Teste danach mit test_site und erkläre mir kurz, was du geändert hast.';

// ------------------------------------------------------------------
// KI-HELFER (D4b) – einfache Fassung der Agenten-Seite
// Daten aus GET /api/agents (agentService): connections, tokens, rights, lastActivityAt
// ------------------------------------------------------------------

// Mit wem ist die Verbindung? claude.ai / chatgpt.com statt technischer Namen
export const clientLabel = conn => {
    const host = String(conn?.clientHost || '').toLowerCase();
    if (host === 'claude.ai' || host.endsWith('.claude.ai')) return 'Claude';
    if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com')) return 'ChatGPT';
    return conn?.clientName || host || 'einer KI';
};

// Zustand eines KI-Helfers in einem Satz
// -> { tone: 'ok' | 'warn' | 'off', text }
export const helperStatus = agent => {
    const active = (agent?.connections || []).filter(c => c.status === 'active');
    if (active.length) {
        const names = [...new Set(active.map(clientLabel))];
        return { tone: 'ok', text: `Verbunden mit ${names.join(' und ')}` };
    }
    if (agent?.tokens?.active > 0) return { tone: 'ok', text: 'Verbunden mit einem Schlüssel' };
    return { tone: 'off', text: 'Nicht verbunden' };
};

// Woran arbeitet er? Websites mit Recht in Worten, Werkzeugkästen nur gezählt
export const helperWork = agent => {
    const rights = Array.isArray(agent?.rights) ? agent.rights : [];
    return {
        sites: rights
            .filter(r => !r.toolbox)
            .map(r => ({ name: String(r.domain), rootUuid: r.rootUuid, role: roleText(r.roles) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de')),
        toolboxes: rights.filter(r => r.toolbox).length,
        // Rechte auf Websites, die du selbst nicht siehst (nur die Zahl, nie welche)
        hidden: Number(agent?.hiddenRights) || 0
    };
};

// ------------------------------------------------------------------
// SUCHE «Strg K» (Punkt 5, D5) – reine Funktionen
// Einträge: { kind: 'website' | 'seite' | 'aktion', title, sub?, href?, action? }
// ------------------------------------------------------------------

// Für den Vergleich: klein, ohne Akzente/Umlaute-Punkte ("Übersicht" findet "uebersicht" und "ubersicht")
export const normalizeSearch = text =>
    String(text || '')
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

// Trefferliste: Anfang des Titels vor Wortanfang vor irgendwo; höchstens "max" Einträge.
// Leere Suche: die ersten Einträge in ihrer Reihenfolge (Websites zuerst).
export const searchItems = (items, query, max = 8) => {
    const list = Array.isArray(items) ? items : [];
    const q = normalizeSearch(query).trim();
    if (!q) return list.slice(0, max);
    const variants = [q, q.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')];
    const score = item => {
        const title = normalizeSearch(item.title);
        const plain = title.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
        const sub = normalizeSearch(item.sub);
        let best = 0;
        for (const v of variants) {
            for (const t of [title, plain]) {
                if (t.startsWith(v)) best = Math.max(best, 3);
                else if (t.split(/[\s\-_/.]+/).some(w => w.startsWith(v))) best = Math.max(best, 2);
                else if (t.includes(v)) best = Math.max(best, 1);
            }
            if (!best && sub.includes(v)) best = 0.5;
        }
        return best;
    };
    return list
        .map((item, index) => ({ item, index, s: score(item) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || a.index - b.index)
        .slice(0, max)
        .map(x => x.item);
};

// Satz für "KI fragen": die Frage, damit der KI-Helfer weiss, dass es um vindelis geht
export const askAiPrompt = question =>
    `Ich arbeite mit vindelis (meine Websites). Bitte hilf mir: ${String(question || '').trim()}`;
