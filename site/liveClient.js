// site/liveClient.js
// ---------------------------------------------------------------------
// DAS LIVE-SKRIPT FÜR WEBSITES (Plan "W – Live-Verbindungen", W3)
//
// Eine Website bindet es so ein:
//   <script src="/_at0mic/live.js"></script>
// und hört dann zu:
//   const stopp = at0mic.live.listen('api', 'chat', nachricht => zeigeAn(nachricht), {
//       wiederDa: () => ladeNeueste(),     // nach einer Unterbrechung: Verpasstes über die SSF holen
//       fehler: text => console.warn(text) // z.B. "Kein Zugriff oder nicht gefunden."
//   });
//   stopp(); // nicht mehr zuhören
//
//   'api'  = Pfad des Objekts auf der Website (wie bei /_at0mic/run/api)
//   'chat' = Kanal (wie bei api.live.send('chat', …) in der SSF)
//
// Was das Skript selbst erledigt:
//   - EINE Verbindung pro Seite, egal wie viele listen()
//   - automatisch neu verbinden (Pause wächst bis 30 s, mit etwas Zufall,
//     damit nach einem Neustart nicht alle Browser gleichzeitig kommen)
//   - nach dem Neuverbinden wieder abonnieren und wiederDa() aufrufen
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

    var subs = {}; // "pfad|kanal" -> { pfad, kanal, handlers: [ { fn, options } ], ok }
    var ws = null;
    var retry = 0;
    var timer = null;
    var hadConnection = false;

    var live = {
        status: 'getrennt',
        listen: listen,
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

    function each(sub, name, arg) {
        sub.handlers.slice().forEach(function (h) {
            var fn = name === 'nachricht' ? h.fn : h.options && h.options[name];
            if (typeof fn !== 'function') return;
            try {
                fn(arg);
            } catch (e) {
                console.error(e);
            }
        });
    }

    function sendJson(obj) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
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
                sendJson({ typ: 'abo', pfad: subs[k].pfad, kanal: subs[k].kanal });
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
            var sub = msg && subs[msg.pfad + '|' + msg.kanal];
            if (msg.typ === 'nachricht' && sub) each(sub, 'nachricht', msg.daten);
            else if (msg.typ === 'abo-fehler' && sub) each(sub, 'fehler', msg.fehler);
            else if (msg.typ === 'wieder-da') {
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
            setStatus('getrennt');
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

    function listen(pfad, kanal, fn, options) {
        if (typeof pfad !== 'string' || typeof kanal !== 'string' || typeof fn !== 'function') {
            throw new Error('at0mic.live.listen(pfad, kanal, funktion) – z.B. listen("api", "chat", n => …)');
        }
        var key = pfad + '|' + kanal;
        var handler = { fn: fn, options: options || {} };
        var isNew = !subs[key];
        if (isNew) subs[key] = { pfad: pfad, kanal: kanal, handlers: [] };
        subs[key].handlers.push(handler);
        if (!ws) connect();
        else if (isNew) sendJson({ typ: 'abo', pfad: pfad, kanal: kanal });

        // Rückgabe: Funktion zum Aufhören
        return function stop() {
            var sub = subs[key];
            if (!sub) return;
            sub.handlers = sub.handlers.filter(function (h) {
                return h !== handler;
            });
            if (sub.handlers.length === 0) {
                delete subs[key];
                sendJson({ typ: 'ende', pfad: pfad, kanal: kanal });
                if (Object.keys(subs).length === 0 && ws) {
                    var s = ws;
                    ws = null;
                    s.close(1000);
                    setStatus('getrennt');
                }
            }
        };
    }
}

const LIVE_SCRIPT_PATH = '/_at0mic/live.js';
// Ausgeliefert als: (function at0micLiveClient() { … })();
const LIVE_SCRIPT = `// at0mic Live-Verbindungen – at0mic.live.listen(pfad, kanal, funktion)\n(${at0micLiveClient.toString()})();\n`;

module.exports = { LIVE_SCRIPT, LIVE_SCRIPT_PATH, at0micLiveClient };
