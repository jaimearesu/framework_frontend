let auth0Client = null;
let appConfig = null;

// Wenn die Seite lädt
window.onload = async () => {
    // 1. Config vom Express-Server holen
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
        window.history.replaceState({}, document.title, "/"); // URL aufräumen
    }

    // UI aktualisieren aufrufen
    updateUI();
};

// UI aktualisieren (Buttons ein/ausblenden)
const updateUI = async () => {
    const isAuthenticated = await auth0Client.isAuthenticated();
    
    if (isAuthenticated) {
        document.getElementById("btn-login").style.display = "none";
        document.getElementById("btn-logout").style.display = "inline-block";
        document.getElementById("btn-api").style.display = "inline-block";
        
        const user = await auth0Client.getUser();
        document.getElementById("user-info").innerText = `Eingeloggt als: ${user.name || user.email}`;
    }
};

// Klick auf Login
document.getElementById("btn-login").addEventListener("click", async () => {
    await auth0Client.loginWithRedirect();
});

// Klick auf Logout
document.getElementById("btn-logout").addEventListener("click", () => {
    auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
});

// Klick auf "Geheime Daten laden" -> Backend Aufruf!
document.getElementById("btn-api").addEventListener("click", async () => {
    // 1. Ausweis holen
    const token = await auth0Client.getTokenSilently();
    
    // 2. Ausweis ans Backend schicken mit der URL aus der Config
    const response = await fetch(`${appConfig.apiUrl}/api/users`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    // 3. Antwort anzeigen
    const data = await response.json();
    const resultContainer = document.getElementById("api-result");
    resultContainer.style.display = "block";
    resultContainer.innerText = JSON.stringify(data, null, 2);
});