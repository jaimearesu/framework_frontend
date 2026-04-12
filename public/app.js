// public/app.js
let appConfig = null;

// Wenn die Seite lädt
window.onload = async () => {
    // 1. Config (nur noch die API URL) vom Frontend-Server holen
    const configResponse = await fetch('/config.json');
    appConfig = await configResponse.json();

    // 2. UI aktualisieren (schauen, ob wir ein gültiges Session-Cookie haben)
    await updateUI();
};

// UI aktualisieren (Buttons ein/ausblenden)
const updateUI = async () => {
    try {
        // Wir fragen unser Backend, ob wir eingeloggt sind. 
        // Das Cookie wird durch 'include' automatisch mitgesendet!
        const response = await fetch(`${appConfig.apiUrl}/api/me`, {
            credentials: 'include' 
        });
        
        const data = await response.json();

        if (data.isAuthenticated) {
            document.getElementById("btn-login").style.display = "none";
            document.getElementById("btn-logout").style.display = "inline-block";
            document.getElementById("btn-api").style.display = "inline-block";
            
            // Name aus dem Backend anzeigen
            document.getElementById("user-info").innerText = `Eingeloggt als: ${data.user.name || data.user.email}`;
        } else {
            document.getElementById("btn-login").style.display = "inline-block";
            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("btn-api").style.display = "none";
            document.getElementById("user-info").innerText = "";
        }
    } catch (error) {
        console.error("Fehler beim Prüfen des Auth-Status:", error);
    }
};

// Klick auf Login -> Wir schicken den User einfach auf die Backend-Login-Route!
document.getElementById("btn-login").addEventListener("click", () => {
    window.location.href = `${appConfig.apiUrl}/login`;
});

// Klick auf Logout -> Wir rufen die Backend-Logout-Route auf!
document.getElementById("btn-logout").addEventListener("click", () => {
    window.location.href = `${appConfig.apiUrl}/logout`;
});

// Klick auf "Geheime Daten laden"
document.getElementById("btn-api").addEventListener("click", async () => {
    try {
        // KEIN Token mehr extrahieren! Das Cookie macht die ganze Arbeit im Hintergrund.
        // Wichtig: 'credentials: include' muss dabei sein!
        const response = await fetch(`${appConfig.apiUrl}/api/objects`, {
            method: 'GET',
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
    } catch (error) {
        console.error("Fehler beim API Aufruf:", error);
    }
});