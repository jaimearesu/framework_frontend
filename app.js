// Auth0 Konfiguration
const auth0Config = {
    domain: "dev-oxr65uvwjslghwd1.eu.auth0.com", // z.B. dev-xyz.eu.auth0.com
    clientId: "Ya1hnlPgBDGZ69LzsEnavCR6GW1012Td", // Aus der Single Page Application!
    authorizationParams: {
        redirect_uri: window.location.origin,
        audience: "urn:atomic-api" // DEINE AUDIENCE AUS DER .ENV (WICHTIG!)
    }
};

let auth0Client = null;

// Wenn die Seite lädt, initialisieren wir Auth0
window.onload = async () => {
    auth0Client = await auth0.createAuth0Client(auth0Config);

    // Schauen, ob wir gerade vom Auth0-Login zurückkommen
    if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/"); // URL aufräumen
    }

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
    
    // 2. Ausweis an Backend schicken (genau wie wir es in PowerShell gemacht haben!)
    const response = await fetch("https://api.at0mic.ch/api/users", {
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