// public/canvas.js

// Warten, bis die Haupt-App geladen ist
setTimeout(() => {
    // Dropdown mit Objekten füllen (wir bedienen uns an den geladenen Daten aus app.js)
    const populateCanvasDropdown = () => {
        const dropdown = document.getElementById("canvas-object-dropdown");
        dropdown.innerHTML = '<option value="">-- Objekt zum Canvas hinzufügen --</option>';
        if (typeof allObjects !== 'undefined') {
            allObjects.forEach(obj => {
                let label = obj.domain ? `🟢 ${obj.domain}` : `🔗 ${obj.domain_ref}`;
                let name = obj.identifier ? ` [${obj.identifier}]` : ` [UUID: ${obj.uuid.substring(0,6)}]`;
                dropdown.add(new Option(`${label}${name}`, obj.uuid));
            });
        }
    };

    // Einen "Refresh" Listener einklinken, falls man neue Objekte anlegt
    document.getElementById("btn-reload-objects").addEventListener("click", () => setTimeout(populateCanvasDropdown, 500));
    populateCanvasDropdown();

    // 1. OBJEKT AUFS CANVAS LADEN
    document.getElementById("btn-add-to-canvas").addEventListener("click", async () => {
        const uuid = document.getElementById("canvas-object-dropdown").value;
        if (!uuid) return;

        try {
            // Wir holen uns den aktuellen AST dieses Objekts
            const response = await fetch(`${appConfig.apiUrl}/api/ast/${uuid}`, { credentials: 'include' });
            const result = await response.json();

            let syntaxAst = null;
            if (result.success && result.data && result.data.syntax) {
                syntaxAst = JSON.parse(result.data.syntax); // Den String wieder zu einem Objekt machen
            } else {
                // Falls das Objekt noch keine Syntax hat, machen wir eine Dummy-Syntax
                const objInfo = allObjects.find(o => o.uuid === uuid);
                syntaxAst = {
                    type: "instance",
                    identifier: "Neues Objekt",
                    domain: objInfo.domain || objInfo.domain_ref || "unknown",
                    source: objInfo.path || ["0"]
                };
            }

            renderBlockOnCanvas(uuid, syntaxAst);
        } catch (error) {
            console.error("Fehler beim Laden für Canvas:", error);
        }
    });

    // 2. BLOCK RENDERN & DRAG & DROP LOGIK
    let draggedElement = null;

    const renderBlockOnCanvas = (uuid, ast) => {
        const block = document.createElement("div");
        block.className = "canvas-block";
        block.setAttribute("draggable", "true");
        block.dataset.uuid = uuid; 
        block.dataset.astBase = JSON.stringify(ast); // Wir merken uns die Basis-Werte

        block.innerHTML = `
            <div class="block-header">
                <span>${ast.identifier || 'Unbenannt'}</span>
                <span style="font-size: 10px; opacity: 0.8;">${ast.domain}</span>
            </div>
            <div class="block-children dropzone"></div>
        `;

        // -- Drag Events --
        block.addEventListener("dragstart", (e) => {
            draggedElement = block;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => block.style.opacity = "0.4", 0); // Halbtransparent beim Ziehen
            e.stopPropagation(); // Verhindert dass Parent mitgezogen wird
        });

        block.addEventListener("dragend", (e) => {
            block.style.opacity = "1";
            draggedElement = null;
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            e.stopPropagation();
        });

        // -- Dropzone Events (Das Innere des Blocks) --
        const childrenZone = block.querySelector(".block-children");
        
        childrenZone.addEventListener("dragover", (e) => {
            e.preventDefault(); // Nötig, um drop zu erlauben!
            e.dataTransfer.dropEffect = "move";
            childrenZone.classList.add("drag-over");
            e.stopPropagation(); // Verhindert dass das Parent-Element auch getriggert wird
        });

        childrenZone.addEventListener("dragleave", (e) => {
            childrenZone.classList.remove("drag-over");
            e.stopPropagation();
        });

        childrenZone.addEventListener("drop", (e) => {
            e.preventDefault();
            childrenZone.classList.remove("drag-over");
            if (draggedElement && draggedElement !== block && !block.contains(draggedElement)) {
                // Hängt den gezogenen Block IN diesen Block um!
                childrenZone.appendChild(draggedElement);
            }
            e.stopPropagation();
        });

        // Aufs Canvas legen (oder, falls es schon Kinder hatte, diese rekursiv rendern)
        document.getElementById("syntax-canvas-area").appendChild(block);

        // EXTRA: Wenn das AST aus der DB schon children hat, bauen wir die direkt visuell auf!
        if (ast.children && ast.children.length > 0) {
            ast.children.forEach(childAst => {
                // Wir haben keine echte UUID für eingebettete Kinder, wir erzeugen eine Dummy ID fürs UI
                renderChildBlockInside(childrenZone, childAst);
            });
        }
    };

    // Hilfsfunktion: Rendert Kinder, die direkt aus dem JSON kommen
    const renderChildBlockInside = (parentZone, childAst) => {
        // Gleiche Logik wie oben, nur dass wir es direkt ins Parent hängen
        const fakeUuid = "embedded-" + Math.random().toString(36).substr(2, 9);
        const block = document.createElement("div");
        block.className = "canvas-block";
        block.setAttribute("draggable", "true");
        block.dataset.uuid = fakeUuid; 
        block.dataset.astBase = JSON.stringify(childAst);
        block.innerHTML = `
            <div class="block-header" style="background: linear-gradient(135deg, #17a2b8, #117a8b);">
                <span>${childAst.identifier || 'Eingebettet'}</span>
                <span style="font-size: 10px; opacity: 0.8;">${childAst.domain}</span>
            </div>
            <div class="block-children dropzone"></div>
        `;
        
        // ... (hier müssten wir der Vollständigkeit halber die gleichen Drag-Events anhängen wie oben. 
        // Für den MVP lassen wir die aus DB geladenen, eingebetteten Kinder erstmal "fest", 
        // man kann aber neue Blöcke reinziehen!)
        parentZone.appendChild(block);
    };

    // Das Haupt-Canvas selbst muss auch Drop-Zone sein (um Objekte aus anderen wieder herauszuziehen)
    const mainCanvas = document.getElementById("syntax-canvas-area");
    mainCanvas.addEventListener("dragover", (e) => { e.preventDefault(); });
    mainCanvas.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedElement) {
            mainCanvas.appendChild(draggedElement);
        }
    });

    document.getElementById("btn-save-canvas").addEventListener("click", async () => {
        
        const buildAstFromDOM = (blockElement) => {
            // ... (diese Funktion bleibt genau wie sie ist)
            const ast = JSON.parse(blockElement.dataset.astBase);
            const childrenZone = blockElement.querySelector(":scope > .block-children");
            const childBlocks = Array.from(childrenZone.querySelectorAll(":scope > .canvas-block"));
            
            if (childBlocks.length > 0) {
                ast.children = childBlocks.map(childEl => buildAstFromDOM(childEl));
            } else {
                delete ast.children;
            }
            return ast;
        };

        // 🔥 HIER IST DIE ÄNDERUNG: Wir nutzen den ">" Selektor (Nur direkte Kinder vom Canvas)
        const rootBlocks = document.querySelectorAll("#syntax-canvas-area > .canvas-block");
        let updatesCount = 0;

        for (let block of rootBlocks) {
            const uuid = block.dataset.uuid;
            if (!uuid || uuid.startsWith("embedded-")) continue;

            const updatedAst = buildAstFromDOM(block);

            try {
                const response = await fetch(`${appConfig.apiUrl}/api/ast/parse-v2`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        objectUuid: uuid, 
                        snippets: [{ type: 'syntax', code: JSON.stringify(updatedAst) }] 
                    })
                });
                
                if(response.ok) updatesCount++;
            } catch (err) {
                console.error("Fehler beim Speichern von Block", uuid, err);
            }
        }

        alert(`Speichern abgeschlossen! Es wurden ${updatesCount} Root-Objekte aktualisiert.`);
    });
}, 1000); // Kurz warten bis allObjects in app.js geladen ist