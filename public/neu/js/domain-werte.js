// Anleitung «Eigene Domain»: die Schritte und was jeder Anbieter wo nennt.
// Die Menü-Namen stammen aus den Hilfeseiten der Anbieter (Stand 09.11.2026). Ändert ein Anbieter
// sein Menü, wird es nur hier angepasst. Ohne Browser, darum in tests/neuZuordnen.test.mjs geprüft.

export const ANBIETER = [
    {
        id: 'hostpoint',
        name: 'Hostpoint',
        oeffnen: [
            'Melde dich im Hostpoint Control Panel an.',
            'Klicke im Menü auf «Domains» und dann auf «DNS-Zone bearbeiten».',
            'Klicke auf «Neuer Record hinzufügen».'
        ],
        felder: { typ: 'Record-Typ', name: 'Name', ziel: 'IP-Adresse' },
        hinweis: 'Das Feld heisst «IP-Adresse», hier gehört trotzdem der Name aus dem Feld «Ziel» hinein.',
        speichern: 'Klicke auf «Jetzt ausführen».'
    },
    {
        id: 'infomaniak',
        name: 'Infomaniak',
        oeffnen: [
            'Melde dich im Infomaniak Manager an (manager.infomaniak.com).',
            'Öffne die «Domainverwaltung» und klicke auf deine Domain.',
            'Klicke links auf «DNS-Zone» und dann auf «Eintrag hinzufügen».',
            'Wähle CNAME und klicke auf «Weiter».'
        ],
        felder: { typ: 'Typ', name: 'Quelle', ziel: 'Ziel' },
        hinweis: null,
        speichern: 'Klicke auf «Speichern».'
    },
    {
        id: 'cloudflare',
        name: 'Cloudflare',
        oeffnen: [
            'Melde dich bei dash.cloudflare.com an und öffne deine Domain.',
            'Klicke links auf «DNS» und dann auf «Records».',
            'Klicke auf «Add record».'
        ],
        felder: { typ: 'Type', name: 'Name', ziel: 'Target' },
        hinweis: 'Wichtig: Stelle «Proxy status» auf «DNS only» (graue Wolke). Sonst geht es nicht.',
        speichern: 'Klicke auf «Save».'
    },
    {
        id: 'anderer',
        name: 'Anderer Anbieter',
        oeffnen: [
            'Melde dich dort an, wo du die Domain gekauft hast.',
            'Suche in der Verwaltung deiner Domain nach «DNS», «DNS-Einträge» oder «Zone».',
            'Füge dort einen neuen Eintrag hinzu.'
        ],
        felder: { typ: 'Typ', name: 'Name oder Host', ziel: 'Ziel oder Wert' },
        hinweis: null,
        speichern: 'Speichere den Eintrag.'
    }
];

export const anbieterVon = id => ANBIETER.find(a => a.id === id) || ANBIETER[ANBIETER.length - 1];

// Reihenfolge der Schritte. «Ohne www» braucht nur, wer eine Adresse mit www verbindet
export const domainSchritte = hostname => [
    ['adresse', 'Adresse'],
    ['anbieter', 'Anbieter'],
    ['oeffnen', 'Öffnen'],
    ['eintragen', 'Eintragen'],
    ['pruefen', 'Prüfen'],
    ...(String(hostname || '').startsWith('www.') ? [['ohne-www', 'Ohne www']] : [])
];

// www.meinladen.ch -> meinladen.ch
export const ohneWww = hostname => String(hostname || '').replace(/^www\./, '');
