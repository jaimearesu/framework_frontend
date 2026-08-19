// public/app.js
let appConfig = null;

// Wenn die Seite lädt
window.onload = async () => {
    const configResponse = await fetch('/config.json');
    appConfig = await configResponse.json();
    await updateUI();
};

// UI aktualisieren (Buttons ein/ausblenden)
// public/app.js

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
            document.getElementById("object-manager").style.display = "block";
            document.getElementById("ast-playground-v2").style.display = "block";
            document.getElementById("tree-explorer-container").style.display = "block";
            
            // NEU: Canvas sichtbar machen, wenn eingeloggt!
            document.getElementById("visual-canvas-container").style.display = "block"; 
            
            document.getElementById("user-info").innerText = `Eingeloggt als: ${data.user.name || data.user.email}`;
        } else {
            document.getElementById("btn-login").style.display = "inline-block";
            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("btn-api").style.display = "none";
            document.getElementById("ast-playground").style.display = "none";
            document.getElementById("object-manager").style.display = "none";
            document.getElementById("ast-playground-v2").style.display = "none";
            document.getElementById("tree-explorer-container").style.display = "none";
            
            // NEU: Canvas verstecken, wenn ausgeloggt!
            document.getElementById("visual-canvas-container").style.display = "none"; 
            
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

document.getElementById("btn-create-hook").addEventListener("click", async () => {
    const parentUuid = document.getElementById("parent-object-dropdown").value;
    const pathStep = document.getElementById("path-selector-dropdown").value;
    // NEU: Identifier auslesen
    const identifier = document.getElementById("hook-identifier-input").value;
    
    if (!parentUuid) {
        alert("Bitte wähle ein Ziel-Objekt aus!");
        return;
    }

    const parentObj = allObjects.find(o => o.uuid === parentUuid);
    const refToSave = parentObj.domain || parentObj.domain_ref; 

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/objects/link`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                domainRef: refToSave,
                parentUuid: parentUuid,
                pathStep: pathStep,
                identifier: identifier // NEU: An das Backend mitschicken
            })
        });
        
        if (response.ok) {
            alert("Hook-Objekt erfolgreich angelegt (inklusive Initial-Syntax)!");
            document.getElementById("hook-identifier-input").value = ""; // Input wieder leeren
            await loadObjects();
        } else {
            const data = await response.json();
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
    }
});

document.getElementById("ast-v2-object-dropdown").addEventListener("change", async (e) => {
    const objectUuid = e.target.value;
    
    // Die Textfelder, die wir befüllen wollen
    const fields = [
        { type: 'html', id: 'ast-v2-html' },
        { type: 'css', id: 'ast-v2-css' },
        { type: 'javascript', id: 'ast-v2-js' },
        { type: 'ssf', id: 'ast-v2-ssf' },
        { type: 'data', id: 'ast-v2-data' },
        { type: 'syntax', id: 'ast-v2-syntax' }
    ];

    // 1. Bei jedem Wechsel zuerst alle Boxen sauber machen
    fields.forEach(f => document.getElementById(f.id).value = "");

    if (!objectUuid) return; // Wenn auf "Auswählen..." geklickt wird, abbrechen

    try {
        // 2. Daten vom neuen Endpunkt abrufen
        const response = await fetch(`${appConfig.apiUrl}/api/ast/${objectUuid}`, { 
            credentials: 'include' 
        });
        
        const result = await response.json();

        if (result.success && result.data) {
            // 3. Die empfangenen Strings in die passenden Boxen füllen
            fields.forEach(f => {
                if (result.data[f.type]) {
                    document.getElementById(f.id).value = result.data[f.type];
                }
            });
        }
    } catch (error) {
        console.error("Fehler beim Laden der Objekt-Daten:", error);
    }
});

document.getElementById("btn-parse-v2").addEventListener("click", async () => {
    const objectUuid = document.getElementById("ast-v2-object-dropdown").value;
    
    if (!objectUuid) {
        alert("Bitte wähle zuerst ein Ziel-Objekt aus dem Dropdown aus!");
        return;
    }

    // Wir sammeln alle Werte ein und mappen sie auf ihre Typen
    const snippets = [];
    const fields = [
        { type: 'html', id: 'ast-v2-html' },
        { type: 'css', id: 'ast-v2-css' },
        { type: 'javascript', id: 'ast-v2-js' },
        { type: 'ssf', id: 'ast-v2-ssf' },
        { type: 'data', id: 'ast-v2-data' },
        { type: 'syntax', id: 'ast-v2-syntax' }
    ];

    fields.forEach(field => {
        const codeValue = document.getElementById(field.id).value.trim();
        if (codeValue) { // Nur auswerten, wenn auch was drinsteht
            snippets.push({ type: field.type, code: codeValue });
        }
    });

    if (snippets.length === 0) {
        alert("Bitte gib mindestens einen Code (HTML, CSS, JS etc.) ein!");
        return;
    }

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/ast/parse-v2`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                objectUuid: objectUuid, 
                snippets: snippets // Array statt einzelnem Wert!
            }) 
        });

        const data = await response.json();
        
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
        
        if (response.ok) {
            // Nach Erfolg alle Textfelder wieder ausleeren, damit man clean weitermachen kann
            fields.forEach(f => document.getElementById(f.id).value = "");
            await loadObjects(); 
        }

    } catch (error) {
        console.error("Fehler beim AST generieren (V2):", error);
    }
});

// public/app.js (Ganz unten anhängen)

// Füllt das Dropdown für den Tree Explorer auf, wenn Objekte geladen werden
const populateTreeDropdown = () => {
    const dropdown = document.getElementById("tree-object-dropdown");
    if (!dropdown) return;
    dropdown.innerHTML = '<option value="">-- Root-Objekt auswählen --</option>';
    if (typeof allObjects !== 'undefined') {
        allObjects.forEach(obj => {
            let label = obj.domain ? `🟢 ${obj.domain}` : `🔗 ${obj.domain_ref}`;
            dropdown.add(new Option(`${label} [${obj.uuid.substring(0,8)}]`, obj.uuid));
        });
    }
};

document.getElementById("btn-reload-objects").addEventListener("click", () => setTimeout(populateTreeDropdown, 500));
// Initialer Aufruf
setTimeout(populateTreeDropdown, 1000);

// Der Klick-Listener für den "Baum analysieren" Button
document.getElementById("btn-resolve-tree").addEventListener("click", async () => {
    const uuid = document.getElementById("tree-object-dropdown").value;
    if (!uuid) return alert("Bitte wähle ein Objekt aus!");

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/ast/tree/${uuid}`, { credentials: 'include' });
        const data = await response.json();

        if (data.success) {
            // Performance anzeigen
            document.getElementById("tree-performance").style.display = "block";
            document.getElementById("tree-ms").innerText = data.executionTimeMs;

            // Resultat anzeigen
            const resultBox = document.getElementById("tree-result");
            resultBox.style.display = "block";
            resultBox.innerText = JSON.stringify(data.tree, null, 2);
        } else {
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Tree Resolve:", error);
    }
});

document.getElementById("btn-resolve-path").addEventListener("click", async () => {
    // Pfad auslesen und eventuelle Leerzeichen am Anfang/Ende entfernen
    const pathValue = document.getElementById("tree-path-input").value.trim();
    
    if (!pathValue) {
        return alert("Bitte gib einen Pfad ein (z.B. app/home/home2)!");
    }

    try {
        // Wir schicken den String exakt so ans Backend
        const response = await fetch(`${appConfig.apiUrl}/api/ast/tree/path/${pathValue}`, { 
            credentials: 'include' 
        });
        
        const data = await response.json();

        if (data.success) {
            // Performance anzeigen
            document.getElementById("tree-performance").style.display = "block";
            document.getElementById("tree-ms").innerText = data.executionTimeMs;

            // Resultat in die bestehende Box schreiben
            const resultBox = document.getElementById("tree-result");
            resultBox.style.display = "block";
            resultBox.innerText = JSON.stringify(data.tree, null, 2);
        } else {
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Tree Resolve per Pfad:", error);
    }
});