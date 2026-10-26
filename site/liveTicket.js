// site/liveTicket.js
// ---------------------------------------------------------------------
// TICKETS FÜR LIVE-RÄUME PRÜFEN (Plan "F", F-3b)
//
// Die SSF stellt mit api.live.ticket('board-123') ein Ticket aus (Backend:
// framework/src/services/liveTicket.js). Der Bauarbeiter prüft es hier SELBST,
// ohne das Backend zu fragen – mit derselben Regel:
//
//   "lt1.<inhalt>.<unterschrift>"
//   inhalt       = base64url(JSON { o: Objekt-UUID, k: Kanal, e: Ablauf in Sekunden seit 1970 })
//   unterschrift = HMAC-SHA256 mit sha256("at0mic-live-ticket\n" + BAUARBEITER_KEY)
//
// WICHTIG: Ändert sich die Regel im Backend, muss sie hier gleich mitändern.
// tests/live.test.mjs prüft ein festes Ticket, das das Backend erzeugt hat.
// ---------------------------------------------------------------------
const crypto = require('crypto');

const PREFIX = 'lt1';
const ticketKey = baseKey => crypto.createHash('sha256').update(`at0mic-live-ticket\n${baseKey}`).digest();

/**
 * @param {{ ticket: any, objectUuid: string, kanal: string, baseKey: string, now?: number }} args
 * @returns {boolean} gültig für genau dieses Objekt und diesen Kanal und noch nicht abgelaufen
 */
const verifyTicket = ({ ticket, objectUuid, kanal, baseKey, now = Date.now() }) => {
    if (typeof ticket !== 'string' || ticket.length > 600 || !baseKey) return false;
    const parts = ticket.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return false;
    const expected = crypto.createHmac('sha256', ticketKey(baseKey)).update(`${PREFIX}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
    let data;
    try {
        data = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
        return false;
    }
    return Boolean(
        data && data.o === objectUuid && data.k === kanal && Number.isInteger(data.e) && data.e > Math.floor(now / 1000)
    );
};

module.exports = { verifyTicket };
