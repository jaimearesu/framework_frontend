// public/tester.js

// =====================================================
// Gemeinsame Helfer
// =====================================================

// Automatische Umgebungserkennung anhand der aktuellen Browser-URL
const getApiRoot = () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocalhost ? 'http://localhost:3000' : 'https://api.at0mic.ch'; // HTTPS für die Produktion!
};

// Auth-Header aus dem Token-Feld bauen (wird von beiden Triggern genutzt)
const buildAuthHeaders = (withJson = false) => {
    const headers = {};
    if (withJson) headers['Content-Type'] = 'application/json';

    const authToken = document.getElementById('authToken').value.trim();
    if (authToken) {
        headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }
    return headers;
};

// Pfad säubern und segmentweise encoden (Slashes bleiben erhalten)
const encodePath = (rawPath) => rawPath
    .trim()
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');


// =====================================================
// 1. Bestehender Trigger (POST /executions)
// =====================================================
document.getElementById('executeBtn').addEventListener('click', async () => {
    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    const targetInput = document.getElementById('targetInput').value.trim();
    const bodyInput = document.getElementById('bodyInput').value.trim();
    const outputElement = document.getElementById('output');

    if (!targetInput) {
        outputElement.textContent = "Fehler: Bitte eine UUID oder einen Pfad eingeben.";
        return;
    }

    let requestBody = {};
    if (bodyInput) {
        try {
            requestBody = JSON.parse(bodyInput);
        } catch (e) {
            outputElement.textContent = "Fehler: Ungültiges JSON im Body-Feld.";
            return;
        }
    }

    const baseUrl = `${getApiRoot()}/api/functions`;

    // '/executions' angehängt (Erstellen einer Ausführung)
    const endpoint = targetType === 'path'
        ? `${baseUrl}/path/${targetInput}/executions`
        : `${baseUrl}/${targetInput}/executions`;

    outputElement.textContent = `Lade Daten von ${endpoint}...\n`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: buildAuthHeaders(true),
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });

        const data = await response.json();
        outputElement.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        outputElement.textContent = `Netzwerkfehler: ${error.message}\n\nHinweis: Falls CORS-Fehler auftreten, stelle sicher, dass in deiner server.js 'cors' aktiviert ist (app.use(cors())).`;
    }
});


// =====================================================
// 2. Neuer Trigger mit Target (GET /target/...)
//    UUID: /api/functions/:uuid/target/:targetUuid
//    Pfad: /api/functions/path/*/target/path/*
// =====================================================
(() => {
    const $ = (id) => document.getElementById(id);
    const getMode = () => document.querySelector('input[name="ssfTargetMode"]:checked').value;

    // Relative Route aus Funktion + Target zusammenbauen
    const buildRoute = () => {
        const fn = $('ssf-fn-input').value.trim();
        const target = $('ssf-target-input').value.trim();
        if (!fn || !target) return null;

        let route;
        if (getMode() === 'uuid') {
            route = `/api/functions/${encodeURIComponent(fn)}/target/${encodeURIComponent(target)}`;
        } else {
            const fnPath = encodePath(fn);
            const targetPath = encodePath(target);
            if (!fnPath || !targetPath) return null;
            route = `/api/functions/path/${fnPath}/target/path/${targetPath}`;
        }

        const query = $('ssf-query-input').value.trim().replace(/^\?/, '');
        return query ? `${route}?${query}` : route;
    };

    const updatePreview = () => {
        $('ssf-url-preview').textContent = buildRoute() || '– Funktion und Target ausfüllen –';
    };

    // UUID/Pfad umschalten
    const applyMode = () => {
        const isUuid = getMode() === 'uuid';

        document.querySelectorAll('.ssf-uuid-only').forEach(el => {
            el.style.display = isUuid ? '' : 'none';
        });

        $('ssf-fn-input').placeholder = isUuid ? 'UUID der Funktion' : 'z.B. my-domain/my-parent/my-function';
        $('ssf-target-input').placeholder = isUuid ? 'UUID des Targets' : 'z.B. my-domain/my-parent/my-target';

        // Beim Wechsel leeren, damit keine UUID als Pfad (oder umgekehrt) verschickt wird
        $('ssf-fn-input').value = '';
        $('ssf-target-input').value = '';
        $('ssf-fn-select').value = '';
        $('ssf-target-select').value = '';

        updatePreview();
    };

    // Objekte für beide Dropdowns laden
    const loadObjectsIntoSelects = async () => {
        try {
            const response = await fetch(`${getApiRoot()}/api/objects`, {
                headers: buildAuthHeaders(),
                credentials: 'include'
            });
            const objects = await response.json();
            if (!Array.isArray(objects)) return;

            ['ssf-fn-select', 'ssf-target-select'].forEach(id => {
                const select = $(id);
                const previous = select.value;
                select.innerHTML = '<option value="">-- Objekt auswählen --</option>';

                objects.forEach(obj => {
                    const label = obj.domain ? `🟢 ${obj.domain}` : `🔗 ${obj.domain_ref}`;
                    select.add(new Option(`${label} [${obj.uuid.substring(0, 8)}]`, obj.uuid));
                });

                select.value = previous; // Auswahl nach Reload behalten
            });
        } catch (error) {
            console.error('[SSF Target] Fehler beim Laden der Objekte:', error);
        }
    };

    const showMeta = (text, isOk) => {
        const meta = $('ssf-target-meta');
        meta.style.display = 'block';
        meta.textContent = text;
        meta.classList.toggle('ssf-meta-ok', isOk);
        meta.classList.toggle('ssf-meta-error', !isOk);
    };

    // Ausführen
    const execute = async () => {
        const route = buildRoute();
        if (!route) return alert('Bitte Funktion und Target angeben!');

        const endpoint = `${getApiRoot()}${route}`;
        const output = $('ssf-target-output');
        const button = $('btn-ssf-execute-target');

        output.textContent = `Lade Daten von ${endpoint}...\n`;
        button.disabled = true;

        const start = performance.now();
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: buildAuthHeaders(),
                credentials: 'include'
            });
            const ms = (performance.now() - start).toFixed(0);

            // Antwort robust parsen (falls der Server mal kein JSON liefert)
            const raw = await response.text();
            let pretty;
            try {
                pretty = JSON.stringify(JSON.parse(raw), null, 2);
            } catch {
                pretty = raw;
            }

            showMeta(`HTTP ${response.status} ${response.statusText} · ${ms} ms`, response.ok);
            output.textContent = pretty;
        } catch (error) {
            showMeta('Netzwerkfehler', false);
            output.textContent = `Netzwerkfehler: ${error.message}`;
        } finally {
            button.disabled = false;
        }
    };

    // --- Events ---
    document.querySelectorAll('input[name="ssfTargetMode"]').forEach(radio => {
        radio.addEventListener('change', applyMode);
    });

    // Dropdown-Auswahl ins Textfeld übernehmen
    $('ssf-fn-select').addEventListener('change', (e) => {
        $('ssf-fn-input').value = e.target.value;
        updatePreview();
    });
    $('ssf-target-select').addEventListener('change', (e) => {
        $('ssf-target-input').value = e.target.value;
        updatePreview();
    });

    ['ssf-fn-input', 'ssf-target-input', 'ssf-query-input'].forEach(id => {
        $(id).addEventListener('input', updatePreview);
    });

    $('btn-ssf-reload').addEventListener('click', loadObjectsIntoSelects);
    $('btn-ssf-execute-target').addEventListener('click', execute);

    // Initial
    applyMode();
    loadObjectsIntoSelects();
})();