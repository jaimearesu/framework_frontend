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