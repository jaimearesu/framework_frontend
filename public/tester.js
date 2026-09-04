document.getElementById('executeBtn').addEventListener('click', async () => {
    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    const targetInput = document.getElementById('targetInput').value.trim();
    const bodyInput = document.getElementById('bodyInput').value.trim();
    const authToken = document.getElementById('authToken').value.trim();
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

    // NEU: Basis URL auf 'functions' geändert
    const baseUrl = 'http://localhost:3000/api/functions';
    
    // NEU: '/executions' angehängt (Erstellen einer Ausführung)
    const endpoint = targetType === 'path' 
        ? `${baseUrl}/path/${targetInput}/executions` 
        : `${baseUrl}/${targetInput}/executions`;

    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (authToken) {
        headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    outputElement.textContent = `Lade Daten von ${endpoint}...\n`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            credentials: 'include'
        });

        const data = await response.json();
        outputElement.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        outputElement.textContent = `Netzwerkfehler: ${error.message}\n\nHinweis: Falls CORS-Fehler auftreten, stelle sicher, dass in deiner server.js 'cors' aktiviert ist (app.use(cors())).`;
    }
});