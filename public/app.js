// public/app.js
let appConfig = null;
let allObjects = []; 

window.onload = async () => {
    const configResponse = await fetch('/config.json');
    appConfig = await configResponse.json();
    await updateUI();
    setTimeout(populateTreeDropdown, 1000);
};

// UI aktualisieren (Buttons ein/ausblenden)
const updateUI = async () => {
    try {
        // HINWEIS: Falls dein Auth-Endpoint auch zu /api/objects/me gewandert ist, hier anpassen!
        const response = await fetch(`${appConfig.apiUrl}/api/me`, {
            credentials: 'include' 
        });
        
        const data = await response.json();

        // 1. Alle Container IMMER einblenden
        document.getElementById("ast-playground").style.display = "block";
        document.getElementById("object-manager").style.display = "block";
        document.getElementById("ast-playground-v2").style.display = "block";
        document.getElementById("tree-explorer-container").style.display = "block";
        document.getElementById("visual-canvas-container").style.display = "block"; 
        document.getElementById("btn-api").style.display = "inline-block";

        // 2. Nur Login/Logout Buttons und Text dynamisch anpassen
        if (data.isAuthenticated) {
            document.getElementById("btn-login").style.display = "none";
            document.getElementById("btn-logout").style.display = "inline-block";
            document.getElementById("user-info").innerText = `Eingeloggt als: ${data.user.name || data.user.email}`;
        } else {
            document.getElementById("btn-login").style.display = "inline-block";
            document.getElementById("btn-logout").style.display = "none";
            document.getElementById("user-info").innerText = "Nicht eingeloggt (Gastmodus)";
        }
    } catch (error) {
        console.error("Fehler beim Prüfen des Auth-Status:", error);
        
        // Fallback:
        document.getElementById("ast-playground").style.display = "block";
        document.getElementById("object-manager").style.display = "block";
        document.getElementById("ast-playground-v2").style.display = "block";
        document.getElementById("tree-explorer-container").style.display = "block";
        document.getElementById("visual-canvas-container").style.display = "block";
        document.getElementById("btn-api").style.display = "inline-block";
    }
};

// Auth Buttons
document.getElementById("btn-login").addEventListener("click", () => window.location.href = `${appConfig.apiUrl}/login`);
document.getElementById("btn-logout").addEventListener("click", () => window.location.href = `${appConfig.apiUrl}/logout`);

// Api Button (Alt)
document.getElementById("btn-api").addEventListener("click", async () => {
    try {
        // NEU: Zeigt jetzt REST-konform ALLE Objekte
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

// AST Generator V1
document.getElementById("btn-parse").addEventListener("click", async () => {
    const code = document.getElementById("code-input").value;
    const type = document.getElementById("code-type").value; 
    const targetObject = document.getElementById("target-object").value;
    const currentObject = document.getElementById("current-object").value;
    
    if (!code.trim() || !targetObject.trim() || !currentObject.trim()) {
        alert("Bitte fülle Code, Target Object und Current Object aus!");
        return;
    }

    try {
        // NEU: UUID im URL-Pfad, Payload als 'snippets' Array formatiert
        const response = await fetch(`${appConfig.apiUrl}/api/ast/${targetObject}`, {
            method: 'POST',
            credentials: 'include', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippets: [{ type: type, code: code }] }) 
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
const loadObjects = async () => {
    try {
        // NEU: /all wurde zu /
        const response = await fetch(`${appConfig.apiUrl}/api/objects`, { credentials: 'include' });
        allObjects = await response.json();
        
        const dropdownView = document.getElementById("object-dropdown");
        const dropdownParent = document.getElementById("parent-object-dropdown");
        const dropdownAstV2 = document.getElementById("ast-v2-object-dropdown");
        
        dropdownAstV2.innerHTML = '<option value="">-- Wähle ein Ziel-Objekt --</option>';
        dropdownView.innerHTML = '<option value="">-- Wähle ein Objekt zum Ansehen --</option>';
        dropdownParent.innerHTML = '<option value="">-- Wähle das Basis-Objekt --</option>';
        
        allObjects.forEach(obj => {
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

document.getElementById("btn-reload-objects").addEventListener("click", () => {
    loadObjects();
    setTimeout(populateTreeDropdown, 500);
});

document.getElementById("btn-create-domain").addEventListener("click", async () => {
    const domainInput = document.getElementById("new-domain-input").value;
    if (!domainInput.trim()) return alert("Bitte eine Domain eingeben!");

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
            document.getElementById("new-domain-input").value = ""; 
            await loadObjects(); 
        } else {
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
    }
});

// Radio Buttons umschalten
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
    pathDropdown.innerHTML = ""; 

    if (!selectedUuid) {
        pathDropdown.add(new Option("Wähle zuerst ein Ziel-Objekt...", ""));
        return;
    }

    const parentObj = allObjects.find(o => o.uuid === selectedUuid);
    
    if (parentObj && parentObj.path_directory && parentObj.path_directory.length > 0) {
        parentObj.path_directory.forEach((stepObj) => {
            pathDropdown.add(new Option(`Schritt ${stepObj.step} (${new Date(stepObj.timestamp).toLocaleString()})`, stepObj.step));
        });
    } else {
        pathDropdown.add(new Option("Basis (Noch keine AST-Schritte vorhanden)", "base"));
    }
});

document.getElementById("btn-create-hook").addEventListener("click", async () => {
    const parentUuid = document.getElementById("parent-object-dropdown").value;
    const pathStep = document.getElementById("path-selector-dropdown").value;
    const identifier = document.getElementById("hook-identifier-input").value;
    
    if (!parentUuid) return alert("Bitte wähle ein Ziel-Objekt aus!");

    const parentObj = allObjects.find(o => o.uuid === parentUuid);
    const refToSave = parentObj.domain || parentObj.domain_ref; 

    try {
        // NEU: parentUuid ist jetzt in der URL
        const response = await fetch(`${appConfig.apiUrl}/api/objects/${parentUuid}/links`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                domainRef: refToSave,
                pathStep: pathStep,
                identifier: identifier 
            })
        });
        
        if (response.ok) {
            alert("Hook-Objekt erfolgreich angelegt!");
            document.getElementById("hook-identifier-input").value = ""; 
            await loadObjects();
        } else {
            const data = await response.json();
            alert(`Fehler: ${data.error}`);
        }
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
    }
});

// --- AST V2 LOGIK ---
document.getElementById("ast-v2-object-dropdown").addEventListener("change", async (e) => {
    const objectUuid = e.target.value;
    
    const fields = [
        { type: 'html', id: 'ast-v2-html' },
        { type: 'css', id: 'ast-v2-css' },
        { type: 'javascript', id: 'ast-v2-js' },
        { type: 'ssf', id: 'ast-v2-ssf' },
        { type: 'data', id: 'ast-v2-data' },
        { type: 'syntax', id: 'ast-v2-syntax' }
    ];

    fields.forEach(f => document.getElementById(f.id).value = "");
    if (!objectUuid) return; 

    try {
        const response = await fetch(`${appConfig.apiUrl}/api/ast/${objectUuid}`, { credentials: 'include' });
        const result = await response.json();

        if (result.success && result.data) {
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
    if (!objectUuid) return alert("Bitte wähle zuerst ein Ziel-Objekt aus dem Dropdown aus!");

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
        if (codeValue) snippets.push({ type: field.type, code: codeValue });
    });

    if (snippets.length === 0) return alert("Bitte gib mindestens einen Code ein!");

    try {
        // NEU: objectUuid ist jetzt im Pfad
        const response = await fetch(`${appConfig.apiUrl}/api/ast/${objectUuid}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippets }) 
        });

        const data = await response.json();
        const resultContainer = document.getElementById("api-result");
        resultContainer.style.display = "block";
        resultContainer.innerText = JSON.stringify(data, null, 2);
        
        if (response.ok) {
            fields.forEach(f => document.getElementById(f.id).value = "");
            await loadObjects(); 
        }
    } catch (error) {
        console.error("Fehler beim AST generieren (V2):", error);
    }
});

// --- TREE EXPLORER LOGIK ---
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

document.getElementById("btn-resolve-tree").addEventListener("click", async () => {
    const uuid = document.getElementById("tree-object-dropdown").value;
    if (!uuid) return alert("Bitte wähle ein Objekt aus!");

    try {
        // NEU: /tree ist nun ein Sub-Ressourcen Pfad
        const response = await fetch(`${appConfig.apiUrl}/api/ast/${uuid}/tree`, { credentials: 'include' });
        const data = await response.json();

        if (data.success) {
            document.getElementById("tree-performance").style.display = "block";
            document.getElementById("tree-ms").innerText = data.executionTimeMs;
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
    const pathValue = document.getElementById("tree-path-input").value.trim();
    if (!pathValue) return alert("Bitte gib einen Pfad ein!");

    try {
        // Bleibt gleich, ist konform
        const response = await fetch(`${appConfig.apiUrl}/api/ast/tree/path/${encodeURIComponent(pathValue)}`, { 
            credentials: 'include' 
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById("tree-performance").style.display = "block";
            document.getElementById("tree-ms").innerText = data.executionTimeMs;
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

// --- STRESSTEST LOGIK ---
document.getElementById("btn-stress-test").addEventListener("click", async () => {
    const count = parseInt(document.getElementById("stress-count-input").value) || 10;
    const dropdown = document.getElementById("tree-object-dropdown");
    const options = Array.from(dropdown.options).filter(opt => opt.value !== "");
    
    if (options.length === 0) return alert("Keine Objekte zum Testen gefunden!");

    const resultBox = document.getElementById("stress-result");
    resultBox.style.display = "block";
    resultBox.innerText = `Sende ${count} parallele Anfragen an Node.js...\n`;
    document.getElementById("stress-performance").style.display = "none";

    const promises = [];
    for(let i = 0; i < count; i++) {
        const randomUuid = options[Math.floor(Math.random() * options.length)].value;
        promises.push(
            // NEU: Angepasster Pfad
            fetch(`${appConfig.apiUrl}/api/ast/${randomUuid}/tree`, { credentials: 'include' })
                .then(res => res.json())
        );
    }

    const startTotal = performance.now();
    try {
        const results = await Promise.all(promises);
        const endTotal = performance.now();
        const totalTime = (endTotal - startTotal).toFixed(2);
        
        document.getElementById("stress-performance").style.display = "block";
        document.getElementById("stress-count").innerText = count;
        document.getElementById("stress-ms").innerText = totalTime;

        let summary = `✅ ${count} Abfragen beendet.\n\n`;
        results.forEach((res, index) => {
            const time = res.executionTimeMs ? `${res.executionTimeMs} ms` : 'Fehler';
            summary += `Request ${index + 1}: ${res.success ? 'Erfolg' : 'Fehlgeschlagen'} (Backend-Dauer: ${time})\n`;
        });
        resultBox.innerText = summary;
    } catch (error) {
        resultBox.innerText = "Ein Fehler ist aufgetreten: " + error.message;
    }
});