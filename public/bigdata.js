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

const logToConsole = (data, isError = false) => {
    const consoleEl = document.getElementById('consoleOutput');
    consoleEl.style.color = isError ? 'var(--error)' : 'var(--success)';
    consoleEl.textContent = JSON.stringify(data, null, 2);
};

// Faker.js Generator Logik
document.getElementById('generateJsonBtn').addEventListener('click', () => {
    const countInput = document.getElementById('recordCount').value;
    const count = parseInt(countInput, 10) || 1;
    
    const dummyDataArray = [];

    // Wir generieren die gewünschte Anzahl an Datensätzen
    for (let i = 0; i < count; i++) {
        dummyDataArray.push({
            // Faker zaubert uns realistische Daten!
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

// Helper Funktion für Requests
const sendRequest = async (endpoint, method, body = null) => {
    const baseUrl = getBaseUrl();
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`${baseUrl}${endpoint}`, options);
        const data = await response.json();
        logToConsole(data, !response.ok);
    } catch (error) {
        logToConsole({ error: "Netzwerkfehler", details: error.message }, true);
    }
};

// 1. Core Data Senden
document.getElementById('sendCoreDataBtn').addEventListener('click', () => {
    const uuid = document.getElementById('objectUuid').value.trim();
    const jsonString = document.getElementById('coreDataJson').value.trim();
    
    if (!uuid) return alert('Bitte Quell-Objekt UUID (oben) eingeben!');
    if (!jsonString) return alert('Bitte zuerst JSON-Daten generieren!');

    try {
        const jsonData = JSON.parse(jsonString);
        // Wir senden das riesige Array an unseren Endpoint
        sendRequest(`/api/core-data/${uuid}`, 'POST', { data: jsonData });
    } catch (e) {
        alert('Das JSON ist ungültig!');
    }
});

// 2. Relation Erstellen
document.getElementById('sendRelationBtn').addEventListener('click', () => {
    const sourceUuid = document.getElementById('objectUuid').value.trim();
    const targetUuid = document.getElementById('targetUuid').value.trim();
    const relationType = document.getElementById('relationType').value.trim();
    
    if (!sourceUuid || !targetUuid || !relationType) {
        return alert('Bitte Source, Target und Relation Type ausfüllen!');
    }

    sendRequest(`/api/relations/${sourceUuid}`, 'POST', { 
        targetUuid, 
        relationType 
    });
});

// 3. Core Data Abrufen (GET)
document.getElementById('getCoreDataBtn').addEventListener('click', () => {
    const mode = document.getElementById('searchMode').value;
    const searchValue = document.getElementById('searchValue').value.trim();
    
    if (!searchValue) return alert('Bitte UUID oder Pfad eingeben!');

    const endpoint = mode === 'uuid' 
        ? `/api/core-data/${searchValue}` 
        : `/api/core-data/path/${searchValue}`;

    sendRequest(endpoint, 'GET');
});