// Rechnet die Antworten des Backends in das um, was der Reiter «Personen» zeigt.
// Hier stehen nur reine Funktionen ohne Browser, darum sind sie in tests/neuPersonen.test.mjs geprüft.

// Die drei Stufen, die man im Cockpit wählen kann. red schliesst black im Backend NICHT ein,
// darum bekommt «ändern» immer beide Rollen
export const RECHTE = {
    ansehen: { titel: 'Ansehen', text: 'Sieht die Website, kann nichts ändern.', rollen: ['black'] },
    aendern: { titel: 'Ansehen und ändern', text: 'Kann Inhalte und Code ändern.', rollen: ['black', 'red'] },
    verwalten: {
        titel: 'Verwalten',
        text: 'Kann alles, auch anderen Zugriff geben und löschen.',
        rollen: ['black', 'red', 'blue']
    }
};

// Welche Stufe ergibt sich aus den Rollen?
export const darfAus = rollen => {
    const liste = Array.isArray(rollen) ? rollen : [];
    if (liste.includes('blue')) return 'verwalten';
    if (liste.includes('red')) return 'aendern';
    return 'ansehen';
};

export const kurzeId = uuid => String(uuid || '').slice(0, 8) + '…';

// Bei Menschen zeigt das Backend nie einen Namen. Dann bleibt nur die gekürzte ID
const anzeigeName = (mitglied, ichUuid) => {
    if (ichUuid && mitglied.uuid === ichUuid) return 'Du';
    if (mitglied.kind === 'mensch') return 'Mensch ' + kurzeId(mitglied.uuid);
    if (mitglied.identifier) return mitglied.name + '/' + mitglied.identifier;
    return mitglied.name || 'Objekt ' + kurzeId(mitglied.uuid);
};

const anzeigeArt = mitglied => {
    if (mitglied.kind === 'mensch') return 'Mensch';
    return String(mitglied.name || '').startsWith('agent-') ? 'KI-Helfer' : 'Objekt';
};

const RANG = { Du: 0, Mensch: 1, 'KI-Helfer': 2, Objekt: 3 };
const rangVon = person => (person.ich ? RANG.Du : RANG[person.art]);

// Eine Zeile der Liste. teil = null heisst: gilt für die ganze Website
export const personAus = (mitglied, ichUuid, teil = null) => ({
    id: mitglied.uuid,
    name: anzeigeName(mitglied, ichUuid),
    art: anzeigeArt(mitglied),
    rollen: Array.isArray(mitglied.roles) ? mitglied.roles : [],
    darf: darfAus(mitglied.roles),
    ich: Boolean(ichUuid && mitglied.uuid === ichUuid),
    teil
});

// Die Einträge der Teile selbst (family) sind ein technischer Schutz und niemand, der Zugriff bekam
const echteMitglieder = liste => (Array.isArray(liste) ? liste.filter(m => !m.family) : []);

// Wer Zugriff auf die ganze Website hat: du zuerst, dann Menschen, Helfer, Objekte
export const personenAus = (members, ichUuid) =>
    echteMitglieder(members)
        .map(m => personAus(m, ichUuid))
        .sort((a, b) => rangVon(a) - rangVon(b));

// Wer Zugriff auf nur diesen Teil hat. Geerbte Schlösser anderer Teile zählen hier nicht
export const teilPersonenAus = (locks, teil, ichUuid) => {
    const eigenes = (Array.isArray(locks) ? locks : []).find(l => l.own);
    return eigenes ? echteMitglieder(eigenes.members).map(m => personAus(m, ichUuid, teil)) : [];
};

export const darfText = person => RECHTE[person.darf].titel + (person.teil ? ', nur «' + person.teil.name + '»' : '');

// Was muss sich ändern, damit jemand genau diese Stufe hat? Geben zuerst, damit nie eine Lücke entsteht
export const rollenAenderung = (alt, darf) => {
    const soll = RECHTE[darf].rollen;
    return { geben: soll.filter(r => !alt.includes(r)), nehmen: alt.filter(r => !soll.includes(r)) };
};

// Wie lange etwas noch gilt, in Worten
export const nochText = (bis, jetzt = Date.now()) => {
    const stunden = Math.floor((Date.parse(bis) - jetzt) / 3600000);
    if (stunden < 1) return 'noch unter 1 Stunde';
    if (stunden < 24) return stunden === 1 ? 'noch 1 Stunde' : 'noch ' + stunden + ' Stunden';
    const tage = Math.floor(stunden / 24);
    return tage === 1 ? 'noch 1 Tag' : 'noch ' + tage + ' Tage';
};

// Nur offene Einladungen. teil = null heisst: ganze Website
export const einladungenAus = (liste, ziel, teil = null, jetzt = Date.now()) =>
    (Array.isArray(liste) ? liste : [])
        .filter(e => e.open)
        .map(e => ({
            id: e.uuid,
            ziel,
            worauf: teil ? teil.name : 'Ganze Website',
            darf: RECHTE[darfAus(e.roles)].titel,
            gueltig: nochText(e.expiresAt, jetzt),
            benutzt: e.usedCount + ' von ' + e.maxUses
        }));

// Bei welchen Teilen muss man überhaupt nachfragen? So bleibt es bei wenigen Anfragen
export const teileZumFragen = site =>
    (site.parts || []).filter(p => p.hasLock || p.openInvitations > 0).map(p => ({ ...p, name: p.name || 'Teil' }));

// Eingabe in Adressen zerlegen: getrennt durch Leerzeichen, Zeilen, Komma oder Strichpunkt
export const adressenAus = text =>
    String(text || '')
        .split(/[\s,;]+/)
        .filter(Boolean);

export const einladenText = ({ added, already, invalid }) =>
    [
        added === 1 ? '1 Adresse hinzugefügt' : added + ' Adressen hinzugefügt',
        already ? already + ' schon auf der Liste' : null,
        invalid ? invalid + ' ungültig' : null
    ]
        .filter(Boolean)
        .join(', ');

export const besucherZustand = v => {
    if (v.blockedAt) return { text: 'Gesperrt', art: 'stop' };
    if (v.lastLoginAt) return { text: 'Schon angemeldet', art: 'ok' };
    return { text: 'Noch nie angemeldet', art: 'leer' };
};

// Warum geht Einschalten gerade nicht? Text oder nichts
export const anmeldungGrund = daten => {
    if (!daten.ready) return 'Auf diesem Server ist der Mail-Versand noch nicht eingerichtet.';
    if (!daten.live) return 'Das geht erst, wenn die Website für Angemeldete oder für alle online ist.';
    return null;
};

// Welche Wege gibt es? Einladen und Besucher verwalten geht nur mit einem Konto
export const wegeFuer = gast => (gast ? ['id'] : ['link', 'email', 'id']);

// Was man wählen kann, hängt von Weg und Umfang ab: «Verwalten» nie per Link und nie nur auf einem Teil
export const rechteFuer = (weg, worauf) =>
    weg === 'id' && worauf === 'alles' ? ['ansehen', 'aendern', 'verwalten'] : ['ansehen', 'aendern'];

const STUNDEN = { '1 Tag': 24, '7 Tage': 168, '30 Tage': 720 };
export const GUELTIG = Object.keys(STUNDEN);

// Prüft die Eingaben im Dialog. Gibt einen Fehlertext oder nichts zurück
export const eingabeFehler = stand => {
    if (stand.weg === 'email')
        return adressenAus(stand.email).length === 1 && stand.email.includes('@')
            ? ''
            : 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (stand.worauf === 'teil' && !stand.teil) return 'Bitte wähle einen Teil.';
    if (stand.weg === 'id' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stand.id.trim()))
        return 'Das sieht nicht wie eine vindelis-ID aus.';
    const anzahl = Number(stand.anzahl);
    if (stand.weg === 'link' && !(Number.isInteger(anzahl) && anzahl >= 1 && anzahl <= 100))
        return 'Die Anzahl Personen muss zwischen 1 und 100 liegen.';
    return '';
};

// Worauf das Recht liegt: auf der Website oder auf genau einem Teil
export const zielAus = (stand, siteUuid) =>
    stand.worauf === 'teil' ? { uuid: stand.teil, scope: 'teil' } : { uuid: siteUuid, scope: 'familie' };

// Der Inhalt für POST …/invitations
export const einladungKoerper = stand => ({
    roles: RECHTE[stand.darf].rollen,
    scope: stand.worauf === 'teil' ? 'teil' : 'familie',
    hours: STUNDEN[stand.gueltig],
    maxUses: Number(stand.anzahl)
});
