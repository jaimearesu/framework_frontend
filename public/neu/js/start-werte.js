// Startseite (12.11.2026, Wunsch von Jaime: «weniger vollgestopft, etwas Sinnvolles»):
// Unter der Begrüssung steht eine ruhige Zeile mit dem Stand – was wartet, was online ist,
// wie voll das Konto ist. Dazu der Knopf «Filter» statt drei Reihen Umschalter.
// Reine Funktionen ohne Browser, geprüft in tests/neuStart.test.mjs.

const istWebsite = w => !w.art || w.art === 'website';

// Wie voll das Konto ist: der höchste Bereich (ohne eigene Domains, die sind bei Gratis immer «voll»)
// u = Antwort von GET /api/billing/usage. null = nichts zeigen
export const auslastungKurz = u => {
    if (!u || !Array.isArray(u.metrics)) return null;
    // Ohne Grenzen (gratis live): keine Prozentzahl, die nichts bedeutet
    if (!u.tier || !u.tier.current) return { text: 'Auslastung ohne Grenzen', warnung: false };
    const prozente = u.metrics.filter(m => m.key !== 'customDomains' && Number.isFinite(m.percent)).map(m => m.percent);
    const hoechste = prozente.length ? Math.max(...prozente) : 0;
    const stufe = (u.tiers || []).find(t => t.id === u.tier.current);
    return {
        text: 'Auslastung ' + Math.round(hoechste) + ' %' + (stufe ? ' (' + stufe.name + ')' : ''),
        warnung: u.state !== 'ok' && u.state !== undefined
    };
};

/**
 * Die Stücke der Stand-Zeile. Jedes führt irgendwohin.
 * art: 'ruhig' (grüner Punkt) | 'achtung' (etwas zu tun) | 'normal'
 */
export const standTeile = ({ wartet = 0, websites = [], auslastung = null }) => {
    const teile = [];
    const mitProblem = websites.filter(w => istWebsite(w) && w.probleme > 0).length;
    if (wartet > 0)
        teile.push({
            text: wartet === 1 ? '1 Sache wartet auf dich' : wartet + ' Sachen warten auf dich',
            href: '#/wartet',
            art: 'achtung'
        });
    if (mitProblem > 0)
        teile.push({
            text: mitProblem === 1 ? '1 Website mit Problemen' : mitProblem + ' Websites mit Problemen',
            href: '#/websites',
            art: 'achtung'
        });
    if (teile.length === 0) teile.push({ text: 'Alles ruhig', href: null, art: 'ruhig' });
    const online = websites.filter(w => istWebsite(w) && w.sichtbarkeit === 'public').length;
    if (websites.some(istWebsite))
        teile.push({
            text: online === 1 ? '1 Website online' : online + ' Websites online',
            href: '#/websites',
            art: 'normal'
        });
    if (auslastung)
        teile.push({ text: auslastung.text, href: '#/auslastung', art: auslastung.warnung ? 'achtung' : 'normal' });
    return teile;
};

// Was der Knopf «Filter» zeigt: die Zahl der gewählten Filter (Herkunft steht eigens daneben)
export const FILTER_STANDARD = { sichtbarkeit: 'alle', sortierung: 'geaendert' };
export const filterAnzahl = ansicht => (ansicht.sichtbarkeit !== FILTER_STANDARD.sichtbarkeit ? 1 : 0);
