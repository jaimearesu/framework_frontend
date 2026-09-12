// Wir laden Faker.js direkt aus dem Netz (esm.sh) in den Browser!
import { faker } from 'https://esm.sh/@faker-js/faker';

// Automatische URL-Erkennung + manueller Override
const getBaseUrl = () => {
    const selectorVal = document.getElementById('backendUrl').value;
    if (selectorVal !== 'auto') return selectorVal;
    
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://api.at0mic.ch';
};

// Helper für die Konsolen-Ausgabe im Browser
const logToConsole = (data, isError = false) => {
    const consoleEl = document.getElementById('consoleOutput');
    consoleEl.style.color = isError ? 'var(--error)' : 'var(--success)';
    consoleEl.textContent = JSON.stringify(data, null, 2);
};

// Helper Funktion, um die Endpunkte anhand des Modus (UUID oder Path) zu bauen
const buildEndpoint = (base, mode, value) => {
    return mode === 'uuid' ? `${base}/${value}` : `${base}/path/${value}`;
};

// Faker.js Generator Logik für Core Data
document.getElementById('generateJsonBtn').addEventListener('click', () => {
    const countInput = document.getElementById('recordCount').value;
    const count = parseInt(countInput, 10) || 1;
    
    const dummyDataArray = [];

    // Wir generieren die gewünschte Anzahl an Datensätzen
    for (let i = 0; i < count; i++) {
        dummyDataArray.push({
            employee_id: faker.string.uuid(),
            first_name: faker.person.firstName(),
            last_name: faker.person.lastName(),
            email: faker.internet.email(),
            job_title: faker.person.jobTitle(),
            department: faker.commerce.department(),
            avatar: faker.image.avatar(),
            joined_at: faker.date.past({ years: 5 }).toISOString()
        });
    }

    // Wenn es nur 1 Datensatz ist, speichern wir es als Objekt, sonst als Array
    const finalData = count === 1 ? dummyDataArray[0] : dummyDataArray;
    
    document.getElementById('coreDataJson').value = JSON.stringify(finalData, null, 2);
    logToConsole({ message: `${count} Datensätze generiert. Bereit zum Senden!` });
});

// Zentrale Fetch-Funktion für alle API-Requests
const sendRequest = async (endpoint, method, body = null) => {
    const baseUrl = getBaseUrl();
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include' // Wichtig für Auth0 Cookies!
        };
        
        if (body) options.body = JSON.stringify(body);

        logToConsole({ message: `Sende Request an: ${baseUrl}${endpoint}...` });

        const response = await fetch(`${baseUrl}${endpoint}`, options);
        const data = await response.json();
        
        logToConsole(data, !response.ok);
    } catch (error) {
        logToConsole({ error: "Netzwerkfehler", details: error.message }, true);
    }
};

// 1. Core Data Senden (POST)
document.getElementById('sendCoreDataBtn').addEventListener('click', () => {
    const mode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    const jsonString = document.getElementById('coreDataJson').value.trim();
    
    if (!sourceVal || !jsonString) return alert('Quelle (Globaler Kontext) und JSON-Daten werden benötigt!');
    
    try {
        const jsonData = JSON.parse(jsonString);
        const endpoint = buildEndpoint('/api/core-data', mode, sourceVal);
        sendRequest(endpoint, 'POST', { data: jsonData });
    } catch (e) {
        alert('Das eingegebene JSON ist ungültig!');
    }
});

// 2. Relation Senden (POST)
document.getElementById('sendRelationBtn').addEventListener('click', () => {
    const sourceMode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    
    const targetMode = document.getElementById('targetMode').value;
    const targetVal = document.getElementById('targetValue').value.trim();
    const relationType = document.getElementById('relationType').value.trim();
    
    if (!sourceVal || !targetVal || !relationType) {
        return alert('Bitte alle Felder ausfüllen: Globale Quelle, Ziel-Objekt und Relation Type!');
    }

    const endpoint = buildEndpoint('/api/relations', sourceMode, sourceVal);
    
    // Unser Backend akzeptiert targetUuid ODER targetPath, je nach Modus
    const body = { relationType };
    if (targetMode === 'uuid') body.targetUuid = targetVal;
    if (targetMode === 'path') body.targetPath = targetVal;

    sendRequest(endpoint, 'POST', body);
});

// 3. GET Core Data (Abrufen)
document.getElementById('getCoreDataBtn').addEventListener('click', () => {
    const mode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    
    if (!sourceVal) return alert('Bitte eine Quelle (UUID oder Pfad) im Globalen Kontext angeben!');
    
    const endpoint = buildEndpoint('/api/core-data', mode, sourceVal);
    sendRequest(endpoint, 'GET');
});

// 4. GET Relationen (Abrufen)
document.getElementById('getRelationsBtn').addEventListener('click', () => {
    const mode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    
    if (!sourceVal) return alert('Bitte eine Quelle (UUID oder Pfad) im Globalen Kontext angeben!');
    
    const endpoint = buildEndpoint('/api/relations', mode, sourceVal);
    sendRequest(endpoint, 'GET');
});

// Globale State-Variablen für die Cursor
let currentCursors = { first: null, last: null };

// Eigene Fetch-Funktion für paginiertes Core Data
const fetchPaginatedCoreData = async (direction = null) => {
    const mode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    const limit = document.getElementById('pageLimit').value || 10;
    
    if (!sourceVal) return alert('Bitte eine Quelle angeben!');
    
    // 1. NEU: Wir holen das JSON aus der neuen DSL-Such-Box (falls vorhanden)
    let queryData = {};
    const dslString = document.getElementById('dslSearchQuery')?.value.trim();
    if (dslString) {
        try {
            queryData = JSON.parse(dslString);
        } catch (e) {
            return alert('Das eingegebene Such-JSON ist ungültig! Bitte überprüfe die Syntax.');
        }
    }

    // 2. NEU: Endpunkt auf die POST-Search-Route ändern
    let endpoint = buildEndpoint('/api/core-data/search', mode, sourceVal);
    let queryParams = `?limit=${limit}`;

    // Cursors berechnen (Bleibt gleich)
    if (direction === 'next' && currentCursors.last) {
        queryParams += `&direction=next&cursorId=${currentCursors.last.id}&cursorDate=${encodeURIComponent(currentCursors.last.date)}`;
    } else if (direction === 'prev' && currentCursors.first) {
        queryParams += `&direction=prev&cursorId=${currentCursors.first.id}&cursorDate=${encodeURIComponent(currentCursors.first.date)}`;
    }

    try {
        const baseUrl = getBaseUrl();
        const response = await fetch(`${baseUrl}${endpoint}${queryParams}`, {
            method: 'POST', // 3. NEU: Methode von GET auf POST ändern!
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(queryData) // 4. NEU: Das DSL-JSON an den Server schicken
        });
        
        const resData = await response.json();
        logToConsole(resData, !response.ok);

        // State updaten anhand des neuen META-Blocks
        if (resData.success && resData.meta) {
            const meta = resData.meta;
            
            // Cursors ganz bequem übernehmen
            currentCursors.first = meta.cursors.first;
            currentCursors.last = meta.cursors.last;
            
            // Berechne Seiten (rein fürs Display)
            const totalPages = Math.ceil(meta.total_count / meta.limit) || 1;
            
            if (meta.returned_count > 0) {
                document.getElementById('nextPageBtn').disabled = false;
                document.getElementById('prevPageBtn').disabled = (direction === null && !currentCursors.first);
                
                document.getElementById('pageInfo').textContent = 
                    `Zeige ${meta.returned_count} von ${meta.total_count} Datensätzen (ca. ${totalPages} Seiten).`;
            } else {
                document.getElementById('pageInfo').textContent = `Keine weiteren Daten gefunden. (Gesamt: ${meta.total_count})`;
                if (direction === 'next') document.getElementById('nextPageBtn').disabled = true;
                if (direction === 'prev') document.getElementById('prevPageBtn').disabled = true;
            }
        }

    } catch (error) {
        logToConsole({ error: "Fehler beim Laden", details: error.message }, true);
    }
};

// ==========================================
// EVENT LISTENERS FÜR SUCHE & PAGINATION
// ==========================================

// Initiales Laden (Reset der Cursors) - für "Suche ausführen" UND "Core Data abrufen"
const triggerNewSearch = () => {
    currentCursors = { first: null, last: null }; 
    fetchPaginatedCoreData(null);
};

// Beide Buttons machen jetzt exakt das Gleiche: Sie starten eine frische Suche inkl. Pagination
document.getElementById('getCoreDataBtn').addEventListener('click', triggerNewSearch);
document.getElementById('searchCoreDataBtn').addEventListener('click', triggerNewSearch);

// Pagination Buttons
document.getElementById('nextPageBtn').addEventListener('click', () => fetchPaginatedCoreData('next'));
document.getElementById('prevPageBtn').addEventListener('click', () => fetchPaginatedCoreData('prev'));


// ==========================================
// 6. DATENSATZ LÖSCHEN (DELETE)
// ==========================================
document.getElementById('deleteRecordBtn').addEventListener('click', () => {
    const mode = document.getElementById('globalMode').value;
    const sourceVal = document.getElementById('globalSource').value.trim();
    const recordUuid = document.getElementById('recordToDelete').value.trim();
    
    if (!sourceVal) return alert('Bitte eine Quelle (UUID oder Pfad) im Globalen Kontext angeben!');
    if (!recordUuid) return alert('Bitte die _sys_id des zu löschenden Datensatzes eingeben!');
    
    const basePath = '/api/core-data';
    const endpoint = mode === 'uuid' 
        ? `${basePath}/${sourceVal}/record/${recordUuid}` 
        : `${basePath}/path/${sourceVal}/record/${recordUuid}`;
    
    if (confirm(`Möchtest du den Datensatz ${recordUuid} wirklich löschen?`)) {
        sendRequest(endpoint, 'DELETE').then(() => {
            // Optional: Nach dem Löschen die aktuelle Seite automatisch neu laden
            fetchPaginatedCoreData(null);
        });
    }
});