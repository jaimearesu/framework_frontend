const API_BASE_URL = 'http://localhost:3000/api';

// WICHTIG: credentials: 'include' sorgt dafür, dass das Auth0 Session-Cookie mitgesendet wird!
const fetchConfig = {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' 
};

document.addEventListener('DOMContentLoaded', () => {
    const objectSelect = document.getElementById('object-select');
    const rolesContainer = document.getElementById('roles-container');

    // 1. Alle Objekte für das Dropdown laden
    async function loadObjects() {
        try {
            const response = await fetch(`${API_BASE_URL}/objects/all`, fetchConfig);
            if (!response.ok) throw new Error('Fehler beim Laden der Objekte');
            
            const objects = await response.json();
            
            objectSelect.innerHTML = '<option value="">-- Wähle ein Objekt --</option>';
            objects.forEach(obj => {
                const label = obj.domain ? `${obj.domain} (${obj.uuid})` : `User: ${obj.uuid}`;
                objectSelect.innerHTML += `<option value="${obj.uuid}">${label}</option>`;
            });
        } catch (error) {
            console.error(error);
            objectSelect.innerHTML = '<option value="">Fehler beim Laden (Bist du eingeloggt?)</option>';
        }
    }

    // 2. Rollen für ein ausgewähltes Objekt laden und rendern
    async function loadRolesForObject(uuid) {
        rolesContainer.innerHTML = '<p class="placeholder">Lade Rollen...</p>';
        try {
            const response = await fetch(`${API_BASE_URL}/objects/${uuid}/roles`, fetchConfig);
            if (!response.ok) throw new Error('Fehler beim Laden der Rollen');
            
            const bundles = await response.json();
            renderBundles(bundles);
        } catch (error) {
            console.error(error);
            rolesContainer.innerHTML = '<p class="placeholder" style="color: red;">Fehler beim Laden der Rollen.</p>';
        }
    }

    // 3. HTML für die Bundles generieren
    function renderBundles(bundles) {
        if (Object.keys(bundles).length === 0) {
            rolesContainer.innerHTML = '<p class="placeholder">Dieses Objekt hat noch keine Rollen.</p>';
            return;
        }

        rolesContainer.innerHTML = ''; // Container leeren

        for (const [domain, roles] of Object.entries(bundles)) {
            const bundleDiv = document.createElement('div');
            bundleDiv.className = 'domain-bundle';
            
            let html = `<h3>Domain: <strong>${domain}</strong></h3><div class="roles-grid">`;
            
            roles.forEach(role => {
                // role.type ist z.B. 'black', was exakt auf unsere CSS-Klassen passt
                html += `<div class="role-box ${role.type}" title="Role UUID: ${role.role_uuid}">
                            ${role.type.toUpperCase()}
                         </div>`;
            });
            
            html += '</div>';
            bundleDiv.innerHTML = html;
            rolesContainer.appendChild(bundleDiv);
        }
    }

    // Event Listener für das Dropdown
    objectSelect.addEventListener('change', (e) => {
        const uuid = e.target.value;
        if (uuid) {
            loadRolesForObject(uuid);
        } else {
            rolesContainer.innerHTML = '<p class="placeholder">Bitte wähle ein Objekt aus, um seine Rollen-Bundles zu sehen.</p>';
        }
    });

    // Start!
    loadObjects();
});