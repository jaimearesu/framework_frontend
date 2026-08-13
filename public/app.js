// public/app.js
let appConfig = null;

// Wenn die Seite lädt
window.onload = async () => {
    const configResponse = await fetch('/config.json');
    appConfig = await configResponse.json();
    await updateUI();
};

// UI aktualisieren (Buttons ein/ausblenden)
const updateUI = async () => {
    try {
        const response = await fetch(`${appConfig.apiUrl}/api/me`, {
            credentials: 'include' 
        });
        
        const data = await response.json();

        if (data.isAuthenticated) {
            document.getElementById("btn-login").style.display = "none";
            document.getElementById("btn-logout").style.display = "inline-block";
            document.getElementById("btn-api").style.display = "inline-block";
            document.getElementById("ast-playground").style.display = "block";
            document.getElementById("object-manager").style.display = "block"; // NEU
            document.getElementById("ast-playground-v2").style.display = "block";
            document.getElementById("user-info").innerText = `Eingeloggt als: ${data.user.name || data.user.email}`;
        } else {
            document.getElementById("btn-login").style.display = "inline-block";
            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("btn-api").style.display = "none";
            document.getElementById("ast-playground").style.display = "none";
            document.getElementById("object-manager").style.display = "none";
            document.getElementById("ast-playground-v2").style.display = "none";
            document.getElementById("user-info").innerText = "";
        }
    } catch (error) {
        console.error("Fehler beim Prüfen des Auth-Status:", error);
    }
};

// Login & Logout
document.getElementById("btn-login").addEventListener("click", () => {
    window.location.href = `${appConfig.apiUrl}/login`;
});

document.getElementById("btn-logout").addEventListener("click", () => {
    window.location.href = `${appConfig.apiUrl}/logout`;
});

// Geheime Daten laden (alter Test-Button)
document.getElementById("btn-api").addEventListener("click", async () => {
    try {
        const response = await fetch(`${appConfig.apiUrl}/api/objects`, {
            method: 'GET',
            credentials: 'include', 
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
    } catch (error) {
        console.error("Fehler beim API Aufruf:", error);
    }
});

document.getElementById("btn-parse").addEventListener("click", async () => {
    const code = document.getElementById("code-input").value;
    const type = document.getElementById("code-type").value; 
    const targetObject = document.getElementById("target-object").value;
    const currentObject = document.getElementById("current-object").value;
    
    // Frontend-Check: Ist alles ausgefüllt?
    if (!code.trim() || !targetObject.trim() || !currentObject.trim()) {
        alert("Bitte fülle Code, Target Object und Current Object aus!");
        return;
    }

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/ast/parse`, {
            method: 'POST',
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json'
            },
            // Wir schicken genau diese 4 Felder los!
            body: JSON.stringify({ 
                code: code, 
                type: type,
                targetObject: targetObject,
                currentObject: currentObject
            }) 
        });

        const data = await response.json();
        
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
    } catch (error) {
        console.error("Fehler beim AST generieren:", error);
    }
});

// --- OBJEKT MANAGER LOGIK ---

// Globale Variable, um die geladenen Objekte zu speichern
let allObjects = []; 

// Objekte aus dem Backend laden und in Dropdown packen
const loadObjects = async () => {
    try {
        const response = await fetch(`${appConfig.apiUrl}/api/objects/all`, { credentials: 'include' });
        allObjects = await response.json();
        
        const dropdownView = document.getElementById("object-dropdown");
        const dropdownParent = document.getElementById("parent-object-dropdown");

        const dropdownAstV2 = document.getElementById("ast-v2-object-dropdown");
        dropdownAstV2.innerHTML = '<option value="">-- Wähle ein Ziel-Objekt --</option>';
        
        dropdownView.innerHTML = '<option value="">-- Wähle ein Objekt zum Ansehen --</option>';
        dropdownParent.innerHTML = '<option value="">-- Wähle das Basis-Objekt --</option>';
        
        allObjects.forEach(obj => {
            // Label bauen: Ist es Root (domain) oder ein Hook (domain_ref)?
            let label = obj.domain ? `🟢 Root: ${obj.domain}` : `🔗 Hook: ref(${obj.domain_ref}) [${obj.uuid.substring(0,8)}]`;
            let pathString = obj.path ? ` [Path: ${obj.path.join(',')}]` : " [Path: leer]";
            dropdownAstV2.add(new Option(`${label}${pathString}`, obj.uuid));
            dropdownView.add(new Option(label, obj.uuid));
            dropdownParent.add(new Option(label, obj.uuid));
        });
    } catch (error) {
        console.error("Fehler beim Laden:", error);
    }
};

// Wenn man im Dropdown etwas auswählt -> Details als JSON anzeigen
document.getElementById("object-dropdown").addEventListener("change", (e) => {
    const selectedUuid = e.target.value;
    const detailsContainer = document.getElementById("object-details");
    
    if (!selectedUuid) {
        detailsContainer.style.display = "none";
        return;
    }

    const selectedObj = allObjects.find(o => o.uuid === selectedUuid);
    detailsContainer.innerText = JSON.stringify(selectedObj, null, 2);
    detailsContainer.style.display = "block";
});

// Reload Button
document.getElementById("btn-reload-objects").addEventListener("click", loadObjects);

// Neues Objekt (Domain) erstellen
document.getElementById("btn-create-domain").addEventListener("click", async () => {
    const domainInput = document.getElementById("new-domain-input").value;
    
    if (!domainInput.trim()) {
        alert("Bitte eine Domain eingeben!");
        return;
    }

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/objects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: domainInput })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("Objekt erfolgreich angelegt!");
            document.getElementById("new-domain-input").value = ""; // Input leeren
            await loadObjects(); // Dropdown sofort aktualisieren!
        } else {
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
    }
});


document.querySelectorAll('input[name="creationType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(e.target.value === 'root') {
            document.getElementById('form-root').style.display = 'block';
            document.getElementById('form-hook').style.display = 'none';
        } else {
            document.getElementById('form-root').style.display = 'none';
            document.getElementById('form-hook').style.display = 'block';
        }
    });
});

document.getElementById("parent-object-dropdown").addEventListener("change", (e) => {
    const selectedUuid = e.target.value;
    const pathDropdown = document.getElementById("path-selector-dropdown");
    pathDropdown.innerHTML = ""; // Reset

    if (!selectedUuid) {
        pathDropdown.add(new Option("Wähle zuerst ein Ziel-Objekt...", ""));
        return;
    }

    const parentObj = allObjects.find(o => o.uuid === selectedUuid);
    
    // Prüfen ob es schon ein path_directory gibt
    if (parentObj && parentObj.path_directory && parentObj.path_directory.length > 0) {
        parentObj.path_directory.forEach((stepObj, index) => {
            pathDropdown.add(new Option(`Schritt ${stepObj.step} (${new Date(stepObj.timestamp).toLocaleString()})`, stepObj.step));
        });
    } else {
        pathDropdown.add(new Option("Basis (Noch keine AST-Schritte vorhanden)", "base"));
    }
});

// Hook erstellen Button
document.getElementById("btn-create-hook").addEventListener("click", async () => {
    const parentUuid = document.getElementById("parent-object-dropdown").value;
    const pathStep = document.getElementById("path-selector-dropdown").value;
    
    if (!parentUuid) {
        alert("Bitte wähle ein Ziel-Objekt aus!");
        return;
    }

    // Wir suchen das Objekt, um die domain oder domain_ref herauszufinden
    const parentObj = allObjects.find(o => o.uuid === parentUuid);
    // Wenn das Parent eine eigene Domain hat, nehmen wir die. Wenn es selbst ein Hook ist, nehmen wir seine Referenz.
    const refToSave = parentObj.domain || parentObj.domain_ref; 

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/objects/link`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                domainRef: refToSave,
                // parentUuid und pathStep senden wir schon mal mit fürs Backend (auch wenn wir es im Model aktuell noch nicht in eine Spalte speichern)
                parentUuid: parentUuid,
                pathStep: pathStep 
            })
        });
        
        if (response.ok) {
            alert("Hook-Objekt erfolgreich angelegt!");
            await loadObjects();
        } else {
            const data = await response.json();
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
    }
});

// AST Generator V2 Button Logik
document.getElementById("btn-parse-v2").addEventListener("click", async () => {
    const objectUuid = document.getElementById("ast-v2-object-dropdown").value;
    const type = document.getElementById("ast-v2-type").value;
    const code = document.getElementById("ast-v2-code").value;
    
    if (!objectUuid) {
        alert("Bitte wähle zuerst ein Ziel-Objekt aus dem Dropdown aus!");
        return;
    }
    
    if (!code.trim()) {
        alert("Bitte gib Code zum Parsen ein!");
        return;
    }

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/ast/parse-v2`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                objectUuid: objectUuid, 
                type: type,
                code: code
            }) 
        });

        const data = await response.json();
        
        // Wir nutzen einfach dein altes api-result Feld zur Anzeige
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
        
        if (response.ok) {
            // Dropdowns neu laden, damit der geupdatete Path (z.B. neues Directory) sofort sichtbar wird
            await loadObjects(); 
        }

    } catch (error) {
        console.error("Fehler beim AST generieren (V2):", error);
    }
});