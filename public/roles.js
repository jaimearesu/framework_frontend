const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = isLocalhost ? 'http://localhost:3000/api' : 'https://api.at0mic.ch/api';

const fetchConfig = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' 
};

document.addEventListener('DOMContentLoaded', () => {
    const objectSelect = document.getElementById('object-select');
    const targetUuidInput = document.getElementById('target-uuid-input');
    const loadTargetBtn = document.getElementById('btn-load-target');
    const rolesContainer = document.getElementById('roles-container');
    const createTripletBtn = document.getElementById('btn-create-triplet');

    let myTriplets = []; 

    // 1. Objekte laden
    async function loadObjects() {
        try {
            // NEU: /all -> /
            const res = await fetch(`${API_BASE_URL}/objects`, fetchConfig);
            if (!res.ok) return;
            const objects = await res.json();
            
            objectSelect.innerHTML = '<option value="">-- Objekt wählen --</option>';
            objects.forEach(obj => {
                const label = obj.domain ? `${obj.domain} (${obj.uuid.substring(0,8)}...)` : `Objekt: ${obj.uuid.substring(0,8)}...`;
                objectSelect.innerHTML += `<option value="${obj.uuid}">${label}</option>`;
            });
        } catch (error) {
            console.error("Fehler beim Laden der Dropdown-Objekte");
        }
    }

    // 2. Deine administrierten Triplets laden
    async function loadMyTriplets() {
        try {
            // NEU: /my-triplets -> /triplets/me
            const res = await fetch(`${API_BASE_URL}/roles/triplets/me`, fetchConfig);
            if (res.ok) myTriplets = await res.json();
        } catch (error) {
            showToast("Fehler beim Laden deiner Triplets");
        }
    }

    objectSelect.addEventListener('change', (e) => {
        if (e.target.value) targetUuidInput.value = e.target.value;
    });

    // 3. Ziel-Objekt laden und abgleichen
    loadTargetBtn.addEventListener('click', async () => {
        const targetUuid = targetUuidInput.value.trim();
        if (!targetUuid) {
            showToast("Bitte zuerst eine UUID eingeben oder auswählen!");
            return;
        }

        rolesContainer.innerHTML = '<p>Lade Berechtigungen...</p>';

        try {
            const res = await fetch(`${API_BASE_URL}/objects/${targetUuid}/roles`, fetchConfig);
            if (!res.ok) throw new Error('Konnte Rollen des Ziels nicht laden');
            
            const targetBundles = await res.json(); 
            
            const targetActiveRoles = new Set();
            if (targetBundles) {
                Object.values(targetBundles).forEach(rolesArray => {
                    rolesArray.forEach(r => {
                        targetActiveRoles.add(`${r.triplet_uuid}-${r.type}`);
                    });
                });
            }

            renderAdminTriplets(targetUuid, targetActiveRoles);
        } catch (error) {
            rolesContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    });

    // 4. UI Rendern
    function renderAdminTriplets(targetUuid, targetActiveRoles) {
        if (myTriplets.length === 0) {
            rolesContainer.innerHTML = '<p>Du administrierst noch keine Triplets. Erschaffe zuerst eins!</p>';
            return;
        }

        rolesContainer.innerHTML = `<h3>Verteile Rollen für Objekt: ${targetUuid.substring(0,8)}...</h3>`;

        myTriplets.forEach(triplet => {
            const hasBlack = targetActiveRoles.has(`${triplet.triplet_uuid}-black`);
            const hasRed = targetActiveRoles.has(`${triplet.triplet_uuid}-red`);
            const hasBlue = targetActiveRoles.has(`${triplet.triplet_uuid}-blue`);

            rolesContainer.innerHTML += `
                <div class="triplet-card mt-3" style="border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
                    <div class="triplet-header"><strong>Domain: ${triplet.domain}</strong> (ID: ${triplet.triplet_uuid.substring(0,8)})</div>
                    <div class="roles-grid mt-2" style="display: flex; gap: 15px;">
                        ${createCheckbox('black', 'Black (Lesen)', hasBlack, targetUuid, triplet.triplet_uuid)}
                        ${createCheckbox('red', 'Red (Schreiben)', hasRed, targetUuid, triplet.triplet_uuid)}
                        ${createCheckbox('blue', 'Blue (Admin)', hasBlue, targetUuid, triplet.triplet_uuid)}
                    </div>
                </div>
            `;
        });

        document.querySelectorAll('.role-checkbox input').forEach(box => {
            box.addEventListener('change', handleRoleToggle);
        });
    }

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

    // 5. API Calls für Grant (PUT) / Revoke (DELETE)
    async function handleRoleToggle(e) {
        const checkbox = e.target;
        const targetObjectUuid = checkbox.dataset.target;
        const tripletUuid = checkbox.dataset.triplet;
        const roleType = checkbox.dataset.type;
        const isChecked = checkbox.checked;

        // NEU: RESTful URL und Methode zusammenbauen
        let url = `${API_BASE_URL}/roles/${targetObjectUuid}/triplets/${tripletUuid}`;
        let method = '';
        let bodyPayload = null;

        if (isChecked) {
            method = 'PUT';
            bodyPayload = JSON.stringify({ roleType });
        } else {
            method = 'DELETE';
            url += `/${roleType}`; // DELETE hängt den roleType an die URL an
        }
        
        try {
            const res = await fetch(url, {
                ...fetchConfig,
                method: method,
                body: bodyPayload
            });

            const result = await res.json();
            if (!res.ok) {
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

    // 6. Neues Triplet erschaffen
    createTripletBtn.addEventListener('click', async (e) => {
        e.preventDefault(); 
        try {
            // NEU: /triplet -> /triplets
            const res = await fetch(`${API_BASE_URL}/roles/triplets`, {
                ...fetchConfig,
                method: 'POST',
                body: JSON.stringify({}) 
            });
            
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Unbekannter Serverfehler');
            
            showToast("Triplet erfolgreich für deine Domain erstellt!");
            
            await loadMyTriplets();
            if (targetUuidInput.value) loadTargetBtn.click();
            
        } catch (error) {
            showToast(`Fehler: ${error.message}`);
        }
    });

    function showToast(msg) {
        console.log("TOAST:", msg);
    }

    // Init
    loadObjects();
    loadMyTriplets();
});