// Karte «Benachrichtigungen» (Warn-Mails, 11.11.2026): reine Regeln ohne Browser,
// geprüft in tests/neuBenachrichtigung.test.mjs.
//
// Antwort von GET /api/billing/benachrichtigung:
//   { email, pendingEmail, muted: ['80','100','150','stufe'], mailEnabled, limitsEnforced }

// Die Mail-Arten, die man einzeln abbestellen kann (gleiche Namen wie im Backend)
export const ARTEN = Object.freeze([
    { id: '80', text: 'Bald voll (80 %)', erklaerung: 'Frühe Warnung, alles läuft noch normal.' },
    { id: '100', text: 'Grenze erreicht (100 %)', erklaerung: 'Ab jetzt Kulanz bis 150 %.' },
    { id: '150', text: 'Gebremst (über 150 %)', erklaerung: 'Server-Funktionen antworten Besuchern mit Fehlern.' },
    { id: 'stufe', text: 'Automatisch hochgestuft', erklaerung: 'Wenn dein Konto von selbst die Stufe wechselt.' }
]);

// In welchem Zustand ist die Karte?
//   aus      der Server kann keine Mails schicken
//   adresse  noch keine Adresse – Feld zum Eintragen
//   code     Code verschickt, wartet auf die Eingabe
//   aktiv    Adresse bestätigt – Haken zum Abbestellen
export const zustandVon = stand => {
    if (!stand || !stand.mailEnabled) return 'aus';
    if (stand.pendingEmail) return 'code';
    if (stand.email) return 'aktiv';
    return 'adresse';
};

// Die Haken: an = nicht abbestellt
export const artenAnsicht = stand => ARTEN.map(a => ({ ...a, an: !(stand?.muted || []).includes(a.id) }));

// Neue Liste der abbestellten Arten, wenn ein Haken umgestellt wird
export const stummNach = (muted, id, an) => {
    const liste = new Set(muted || []);
    if (an) liste.delete(id);
    else liste.add(id);
    return ARTEN.map(a => a.id).filter(x => liste.has(x));
};

// Ein Code hat genau 6 Ziffern (Leerzeichen beim Einfügen sind erlaubt)
export const codeAus = text => {
    const ziffern = String(text || '')
        .split('')
        .filter(z => z >= '0' && z <= '9')
        .join('');
    return ziffern.length === 6 ? ziffern : null;
};

// Hinweis im Reiter «Auslastung»: Warnungen wären möglich, aber es gibt noch keine Adresse
export const ohneAdresseHinweis = stand => Boolean(stand && stand.mailEnabled && !stand.email);
