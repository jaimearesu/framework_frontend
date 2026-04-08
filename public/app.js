let auth0Client = null;
let appConfig = null;

// Wenn die Seite lädt
window.onload = async () => {
    // 1. Config vom Express-Server holen!
    const configResponse = await fetch('/config.json');
    appConfig = await configResponse.json();

    // 2. Auth0 mit der geladenen Config initialisieren
    auth0Client = await auth0.createAuth0Client({
        domain: appConfig.domain,
        clientId: appConfig.clientId,
        authorizationParams: {
            redirect_uri: window.location.origin,
            audience: appConfig.audience
        }
    });

    // Schauen, ob wir gerade vom Auth0-Login zurückkommen
    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/");
    }

    updateUI();
};

// ... (updateUI, btn-login, btn-logout bleiben exakt gleich) ...

// Klick auf "Geheime Daten laden" -> Backend Aufruf!
document.getElementById("btn-api").addEventListener("click", async () => {
    const token = await auth0Client.getTokenSilently();
    
    // 3. Hier nutzen wir jetzt die dynamische API URL aus der Config!
    const response = await fetch(`${appConfig.apiUrl}/api/users`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();
    const resultContainer = document.getElementById("api-result");
    resultContainer.style.display = "block";
    resultContainer.innerText = JSON.stringify(data, null, 2);
});