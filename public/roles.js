const API_BASE_URL = 'http://localhost:3000/api';

const fetchConfig = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' 
};

document.addEventListener('DOMContentLoaded', () => {
    const objectSelect = document.getElementById('object-select');
    const rolesContainer = document.getElementById('roles-container');
    const createTripletBtn = document.getElementById('btn-create-triplet');
    const newDomainInput = document.getElementById('new-domain-input');

    // 1. Objekte laden
    async function loadObjects() {
        try {
            const res = await fetch(`${API_BASE_URL}/objects/all`, fetchConfig);
            if (!res.ok) throw new Error('Fehler beim Laden');
            const objects = await res.json();
            
            objectSelect.innerHTML = '<option value="">-- Objekt wählen --</option>';
            objects.forEach(obj => {
                const label = obj.domain ? `${obj.domain} (${obj.uuid.substring(0,8)}...)` : `Objekt: ${obj.uuid.substring(0,8)}...`;
                objectSelect.innerHTML += `<option value="${obj.uuid}">${label}</option>`;
            });
        } catch (error) {
            objectSelect.innerHTML = '<option value="">Login erforderlich</option>';
        }
    }

    // 2. Rollen laden & gruppieren
    async function loadRolesForObject(uuid) {
        rolesContainer.innerHTML = '<p>Lade Triplets...</p>';
        try {
            const res = await fetch(`${API_BASE_URL}/objects/${uuid}/roles`, fetchConfig);
            if (!res.ok) throw new Error('Zugriff verweigert (Fehlende Black-Rolle?)');
            
            // FIX: Direkt zuweisen, nicht destrukturieren!
            const bundles = await res.json(); 
            
            renderTriplets(bundles, uuid);
        } catch (error) {
            rolesContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    // 3. UI Rendern
    function renderTriplets(bundles, targetUuid) {
        // FIX: Sicherheits-Check hinzugefügt falls 'bundles' mal null oder undefined ist
        if (!bundles || Object.keys(bundles).length === 0) {
            rolesContainer.innerHTML = '<p>Dieses Objekt hat noch keine Rollen.</p>';
            return;
        }

        rolesContainer.innerHTML = '';

        for (const [domain, roles] of Object.entries(bundles)) {
            // Gruppiere die Rollen dieser Domain nach Triplet UUID
            const triplets = {};
            roles.forEach(r => {
                if (!triplets[r.triplet_uuid]) {
                    triplets[r.triplet_uuid] = { black: false, red: false, blue: false };
                }
                triplets[r.triplet_uuid][r.type] = true;
            });

            const bundleDiv = document.createElement('div');
            bundleDiv.className = 'domain-bundle';
            bundleDiv.innerHTML = `<h3 class="domain-title">Domain: ${domain}</h3>`;

            for (const [tripletUuid, colors] of Object.entries(triplets)) {
                bundleDiv.innerHTML += `
                    <div class="triplet-card">
                        <div class="triplet-header">Triplet ID: ${tripletUuid}</div>
                        <div class="roles-grid">
                            ${createCheckbox('black', 'Black (Lesen)', colors.black, targetUuid, tripletUuid)}
                            ${createCheckbox('red', 'Red (Schreiben)', colors.red, targetUuid, tripletUuid)}
                            ${createCheckbox('blue', 'Blue (Admin)', colors.blue, targetUuid, tripletUuid)}
                        </div>
                    </div>
                `;
            }
            rolesContainer.appendChild(bundleDiv);
        }

        // Event Listener an alle generierten Checkboxen hängen
        document.querySelectorAll('.role-checkbox input').forEach(box => {
            box.addEventListener('change', handleRoleToggle);
        });
    }

    // Hilfsfunktion für sauberes HTML
    function createCheckbox(type, label, isChecked, targetUuid, tripletUuid) {
        const checkedStr = isChecked ? 'checked' : '';
        return `
            <label class="role-checkbox role-${type}">
                <input type="checkbox" 
                       data-target="${targetUuid}" 
                       data-triplet="${tripletUuid}" 
                       data-type="${type}" 
                       ${checkedStr}>
                ${label}
            </label>
        `;
    }

    // 4. API Calls für Grant / Revoke
    async function handleRoleToggle(e) {
        const checkbox = e.target;
        const targetObjectUuid = checkbox.dataset.target;
        const tripletUuid = checkbox.dataset.triplet;
        const roleType = checkbox.dataset.type;
        const isChecked = checkbox.checked;

        // Welcher Endpunkt? (Abhängig von deinen Routen aus dem vorherigen Schritt)
        const endpoint = isChecked ? '/roles/grant' : '/roles/revoke';
        
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...fetchConfig,
                method: 'POST',
                body: JSON.stringify({ targetObjectUuid, tripletUuid, roleType })
            });

            const result = await res.json();

            if (!res.ok) {
                // Fehler! Checkbox wieder zurücksetzen
                checkbox.checked = !isChecked;
                showToast(`Fehler: ${result.error || 'Aktion fehlgeschlagen'}`);
            } else {
                showToast(`Rolle ${roleType} erfolgreich ${isChecked ? 'zugewiesen' : 'entfernt'}.`);
            }
        } catch (error) {
            checkbox.checked = !isChecked;
            showToast('Netzwerkfehler');
        }
    }

    // 5. Neues Triplet erschaffen
    createTripletBtn.addEventListener('click', async (e) => {
        e.preventDefault(); 
        
        try {
            // Wir schicken einfach einen leeren Body mit, das Backend weiß dank Cookie, wer wir sind
            const res = await fetch(`${API_BASE_URL}/roles/triplet`, {
                ...fetchConfig,
                method: 'POST',
                body: JSON.stringify({}) 
            });
            
            const result = await res.json();
            
            if (!res.ok) throw new Error(result.error || 'Unbekannter Serverfehler');
            
            showToast("Triplet erfolgreich für deine Domain erstellt!");
            
            // UI aktualisieren, falls du gerade dich selbst ausgewählt hast
            if (objectSelect.value) {
                loadRolesForObject(objectSelect.value);
            }
            
        } catch (error) {
            showToast(`Fehler: ${error.message}`);
        }
    });

    // Event Listener
    objectSelect.addEventListener('change', (e) => {
        if (e.target.value) loadRolesForObject(e.target.value);
        else rolesContainer.innerHTML = '<p>Bitte wähle ein Objekt aus.</p>';
    });

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 3000);
    }

    loadObjects();
});