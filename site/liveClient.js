// site/liveClient.js
// ---------------------------------------------------------------------
// DAS LIVE-SKRIPT FÜR WEBSITES (Plan "W – Live-Verbindungen", W3; Plan "F", F-3c)
//
// Eine Website bindet es so ein:
//   <script src="/_at0mic/live.js"></script>
// und hört dann zu:
//   const stopp = at0mic.live.listen('api', 'chat', (nachricht, info) => zeigeAn(nachricht), {
//       wiederDa: () => ladeNeueste(),     // nach einer Unterbrechung: Verpasstes über die SSF holen
//       fehler: (text, code) => console.warn(text), // z.B. "Kein Zugriff …", code 'KEIN_ZUGRIFF' (F-3e)
//       ticket: t                           // Raum (Regel "ticket" in der DNA): Ticket der SSF
//   });
//   stopp(); // nicht mehr zuhören
//
//   'api'  = Pfad des Objekts auf der Website (wie bei /_at0mic/run/api)
//   'chat' = Kanal (wie bei api.live.send('chat', …) in der SSF)
//   info   = { von, fluechtig } – bei Nachrichten anderer Browser (von = deren Verbindungs-ID)
//
// NEU (Plan "F", F-3c) – nur, wo die DNA des Objekts es erlaubt (Regeln "live.kanaele"):
//   at0mic.live.publish('api', 'cursor', { x, y })   flüchtig an alle anderen (nach listen)
//   const ich = at0mic.live.presence('api', 'board-1', { name: 'Anna' }, {
//       liste: alle => zeichne(alle),   // [{ von, zustand }] – immer die ganze Liste (ohne mich)
//       join, update, leave,            // einzelne Ereignisse ({ von, zustand })
//       fehler, ticket
//   });
//   ich.update({ name: 'Anna', tippt: true }); ich.stopp();
//   at0mic.live.id   die eigene Verbindungs-ID (z.B. an die SSF schicken für { ausser }) – sie
//                    WECHSELT bei jedem Neuverbinden: immer erst beim Senden lesen
//   at0mic.live.ping() -> Promise mit der Laufzeit hin und zurück in ms (null = nicht verbunden)
//   fehler(text, code): code = KEIN_ZUGRIFF, TICKET, TAKT, NICHT_ERLAUBT, FELDER, ZU_GROSS, … (F-3e)
//
// Was das Skript selbst erledigt:
//   - EINE Verbindung pro Seite, egal wie viele listen()/presence()
//   - automatisch neu verbinden (Pause wächst bis 30 s, mit etwas Zufall,
//     damit nach einem Neustart nicht alle Browser gleichzeitig kommen)
//   - nach dem Neuverbinden wieder abonnieren (mit Ticket), wieder "da" sein,
//     und wiederDa() aufrufen
//   - at0mic.live.status: 'verbinde' | 'verbunden' | 'getrennt'
//
// Der Code unten läuft im BROWSER. Er steht als normale Funktion hier
// (damit Prettier und ESLint ihn prüfen) und wird als Text ausgeliefert.
// Darum: nichts aus Node.js benutzen.
// ---------------------------------------------------------------------

/* eslint-env browser */
function at0micLiveClient() {
    'use strict';
    var root = (window.at0mic = window.at0mic || {});
    if (root.live) return; // schon geladen (Skript doppelt eingebunden)

    // "pfad|kanal" -> { pfad, kanal, handlers: [ { fn, options } ], ok, ticket, presence }
    // presence = { zustand, options, liste: { von: zustand } } – nur bei presence()
    var subs = {};
    var ws = null;
    var retry = 0;
    var timer = null;
    var hadConnection = false;

    var live = {
        status: 'getrennt',
        id: null,
        listen: listen,
        publish: publish,
        presence: presence,
        ping: ping,
        // Für Website-Code, der wissen will, ob die Verbindung steht
        onStatus: null
    };
    root.live = live;

    function setStatus(s) {
        live.status = s;
        if (typeof live.onStatus === 'function') {
            try {
                live.onStatus(s);
            } catch (e) {
                console.error(e);
            }
        }
    }

    function call(fn, a, b) {
        if (typeof fn !== 'function') return;
        try {
            fn(a, b);
        } catch (e) {
            console.error(e);
        }
    }

    function each(sub, name, arg, arg2) {
        sub.handlers.slice().forEach(function (h) {
            call(name === 'nachricht' ? h.fn : h.options && h.options[name], arg, arg2);
        });
        if (sub.presence && name !== 'nachricht') call(sub.presence.options[name], arg, arg2);
    }

    function sendJson(obj) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    }

    function aboMessage(sub) {
        var msg = { typ: 'abo', pfad: sub.pfad, kanal: sub.kanal };
        if (sub.ticket) msg.ticket = sub.ticket;
        return msg;
    }

    // Presence: die ganze Liste (ohne mich) an liste() geben
    function presenceList(sub) {
        var p = sub.presence;
        if (!p) return;
        var alle = Object.keys(p.liste).map(function (von) {
            return { von: von, zustand: p.liste[von] };
        });
        call(p.options.liste, alle);
    }

    function onPresenceMessage(sub, msg) {
        var p = sub.presence;
        if (!p) return;
        if (msg.typ === 'anwesend') {
            p.liste = {};
            (msg.liste || []).forEach(function (e) {
                p.liste[e.von] = e.zustand;
            });
        } else if (msg.typ === 'leave') {
            delete p.liste[msg.von];
            call(p.options.leave, { von: msg.von });
        } else {
            p.liste[msg.von] = msg.zustand;
            call(p.options[msg.typ], { von: msg.von, zustand: msg.zustand });
        }
        presenceList(sub);
    }

    function connect() {
        clearTimeout(timer);
        if (ws || Object.keys(subs).length === 0) return;
        setStatus('verbinde');
        var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/_at0mic/live';
        var socket = new WebSocket(url);
        ws = socket;
        socket.onopen = function () {
            retry = 0;
            setStatus('verbunden');
            Object.keys(subs).forEach(function (k) {
                subs[k].ok = false;
                sendJson(aboMessage(subs[k]));
            });
            // Neu verbunden nach einer Unterbrechung: Verpasstes nachholen lassen
            if (hadConnection) {
                Object.keys(subs).forEach(function (k) {
                    each(subs[k], 'wiederDa');
                });
            }
            hadConnection = true;
        };
        socket.onmessage = function (event) {
            var msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (!msg) return;
            if (msg.typ === 'hallo') {
                live.id = msg.id || null;
                return;
            }
            var sub = subs[msg.pfad + '|' + msg.kanal];
            if (msg.typ === 'nachricht' && sub) {
                each(sub, 'nachricht', msg.daten, msg.von ? { von: msg.von, fluechtig: msg.fluechtig === true } : {});
            } else if (msg.typ === 'abo-ok' && sub) {
                sub.ok = true;
                // Anwesend sein (auch nach dem Neuverbinden): erst, wenn das Abo steht
                if (sub.presence)
                    sendJson({ typ: 'da', pfad: sub.pfad, kanal: sub.kanal, zustand: sub.presence.zustand });
            } else if (msg.typ === 'abo-fehler' && sub) {
                each(sub, 'fehler', msg.fehler, msg.code || null);
            } else if (msg.typ === 'fehler' && sub) {
                each(sub, 'fehler', msg.fehler, msg.code || null);
            } else if (msg.typ === 'pong') {
                pongArrived();
            } else if (
                (msg.typ === 'anwesend' || msg.typ === 'join' || msg.typ === 'update' || msg.typ === 'leave') &&
                sub
            ) {
                onPresenceMessage(sub, msg);
            } else if (msg.typ === 'wieder-da') {
                Object.keys(subs).forEach(function (k) {
                    each(subs[k], 'wiederDa');
                });
            } else if (msg.typ === 'fehler' && msg.code === 'VOLL') {
                retry = Math.max(retry, 5); // länger warten, die Website ist gerade voll
            }
        };
        socket.onclose = function (event) {
            if (ws !== socket) return;
            ws = null;
            live.id = null;
            setStatus('getrennt');
            // Die Anwesenden von vorher gelten nicht mehr (beim Neuverbinden kommt die Liste neu)
            Object.keys(subs).forEach(function (k) {
                if (subs[k].presence) {
                    subs[k].presence.liste = {};
                    presenceList(subs[k]);
                }
            });
            if (Object.keys(subs).length === 0) return;
            // Pause: 1, 2, 4, 8, 16, 30 s (+ bis 1 s Zufall); abgemeldet (4401): gleich wieder
            var base = event.code === 4401 ? 0 : Math.min(30000, 1000 * Math.pow(2, retry));
            retry++;
            timer = setTimeout(connect, base + Math.floor(Math.random() * 1000));
        };
        socket.onerror = function () {
            // onclose kommt danach von selbst
        };
    }

    // Laufzeit messen (F-3e): ping hin, pong zurück. Es läuft immer nur EIN ping gleichzeitig;
    // wer während eines laufenden fragt, bekommt dieselbe Antwort.
    var pending = null; // { start, waiting: [resolve], timer }
    function pongArrived() {
        if (!pending) return;
        var p = pending;
        pending = null;
        clearTimeout(p.timer);
        var ms = Date.now() - p.start;
        p.waiting.forEach(function (r) {
            r(ms);
        });
    }
    function ping() {
        return new Promise(function (resolve) {
            if (!ws || ws.readyState !== 1) return resolve(null);
            if (pending) return pending.waiting.push(resolve);
            pending = { start: Date.now(), waiting: [resolve], timer: null };
            pending.timer = setTimeout(function () {
                var p = pending;
                pending = null;
                if (p)
                    p.waiting.forEach(function (r) {
                        r(null);
                    });
            }, 10000);
            sendJson({ typ: 'ping' });
        });
    }

    // Abo anlegen bzw. finden (gemeinsam für listen und presence)
    function ensureSub(pfad, kanal, ticket) {
        var key = pfad + '|' + kanal;
        var isNew = !subs[key];
        if (isNew) subs[key] = { pfad: pfad, kanal: kanal, handlers: [], ok: false, ticket: null, presence: null };
        if (ticket) subs[key].ticket = ticket;
        if (!ws) connect();
        else if (isNew) sendJson(aboMessage(subs[key]));
        return subs[key];
    }

    // Abo beenden, wenn niemand mehr zuhört oder anwesend ist
    function maybeEnd(sub) {
        var key = sub.pfad + '|' + sub.kanal;
        if (subs[key] !== sub || sub.handlers.length > 0 || sub.presence) return;
        delete subs[key];
        sendJson({ typ: 'ende', pfad: sub.pfad, kanal: sub.kanal });
        if (Object.keys(subs).length === 0 && ws) {
            var s = ws;
            ws = null;
            live.id = null;
            s.close(1000);
            setStatus('getrennt');
        }
    }

    function listen(pfad, kanal, fn, options) {
        if (typeof pfad !== 'string' || typeof kanal !== 'string' || typeof fn !== 'function') {
            throw new Error('at0mic.live.listen(pfad, kanal, funktion) – z.B. listen("api", "chat", n => …)');
        }
        var handler = { fn: fn, options: options || {} };
        var sub = ensureSub(pfad, kanal, handler.options.ticket);
        sub.handlers.push(handler);

        // Rückgabe: Funktion zum Aufhören
        return function stop() {
            sub.handlers = sub.handlers.filter(function (h) {
                return h !== handler;
            });
            maybeEnd(sub);
        };
    }

    // Flüchtig an alle anderen senden (Regel "browser" in der DNA). true = abgeschickt.
    // Vorher braucht es listen() bzw. presence() auf diesem Kanal (dort ist der Zutritt geprüft).
    function publish(pfad, kanal, daten) {
        var sub = subs[pfad + '|' + kanal];
        if (!sub) {
            throw new Error('at0mic.live.publish: zuerst at0mic.live.listen("' + pfad + '", "' + kanal + '", …)');
        }
        if (!sub.ok || !ws || ws.readyState !== 1) return false; // noch nicht verbunden: weglassen (flüchtig)
        sendJson({ typ: 'senden', pfad: pfad, kanal: kanal, daten: daten });
        return true;
    }

    // Anwesend sein (Regel "presence" in der DNA)
    function presence(pfad, kanal, zustand, options) {
        if (typeof pfad !== 'string' || typeof kanal !== 'string') {
            throw new Error(
                'at0mic.live.presence(pfad, kanal, zustand, { liste }) – z.B. presence("api", "raum", { name: "Anna" })'
            );
        }
        var opts = options || {};
        var sub = ensureSub(pfad, kanal, opts.ticket);
        sub.presence = { zustand: zustand || {}, options: opts, liste: {} };
        if (sub.ok) sendJson({ typ: 'da', pfad: pfad, kanal: kanal, zustand: sub.presence.zustand });
        return {
            update: function (neu) {
                if (!sub.presence) return;
                sub.presence.zustand = neu || {};
                if (sub.ok) sendJson({ typ: 'da', pfad: pfad, kanal: kanal, zustand: sub.presence.zustand });
            },
            stopp: function () {
                if (!sub.presence) return;
                sub.presence = null;
                sendJson({ typ: 'weg', pfad: pfad, kanal: kanal });
                maybeEnd(sub);
            }
        };
    }
}

const LIVE_SCRIPT_PATH = '/_at0mic/live.js';
// Ausgeliefert als: (function at0micLiveClient() { … })();
const LIVE_SCRIPT = `// at0mic Live-Verbindungen – at0mic.live.listen / publish / presence\n(${at0micLiveClient.toString()})();\n`;

module.exports = { LIVE_SCRIPT, LIVE_SCRIPT_PATH, at0micLiveClient };
