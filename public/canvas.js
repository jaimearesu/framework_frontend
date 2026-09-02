// public/canvas.js

setTimeout(() => {
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

    document.getElementById("btn-reload-objects").addEventListener("click", () => setTimeout(populateCanvasDropdown, 500));
    populateCanvasDropdown();

    document.getElementById("btn-add-to-canvas").addEventListener("click", async () => {
        const uuid = document.getElementById("canvas-object-dropdown").value;
        if (!uuid) return;

        try {
            const response = await fetch(`${appConfig.apiUrl}/api/ast/${uuid}`, { credentials: 'include' });
            const result = await response.json();

            let syntaxAst = null;
            if (result.success && result.data && result.data.syntax) {
                syntaxAst = JSON.parse(result.data.syntax); 
            } else {
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

    let draggedElement = null;

    // 🔥 NEU: Hilfsfunktion zum Berechnen der Mausposition (Für das Sortieren!)
    const getDragAfterElement = (container, y) => {
        // Alle Blöcke in dieser Zone finden, AUßER dem, den wir gerade ziehen
        const draggableElements = [...container.querySelectorAll(':scope > .canvas-block:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // Mitte der Box berechnen
            const offset = y - box.top - box.height / 2;
            // Wenn die Maus ÜBER der Mitte ist (offset < 0), wollen wir das Element davor einfügen
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

    const attachDragAndDrop = (block, childrenZone) => {
        block.addEventListener("dragstart", (e) => {
            draggedElement = block;
            block.classList.add("dragging"); // WICHTIG fürs Sortieren
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => block.style.opacity = "0.4", 0);
            e.stopPropagation();
        });

        block.addEventListener("dragend", (e) => {
            block.style.opacity = "1";
            block.classList.remove("dragging"); // WICHTIG fürs Sortieren
            draggedElement = null;
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            e.stopPropagation();
        });

        childrenZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            childrenZone.classList.add("drag-over");
            
            // 🔥 NEU: Sortier-Logik direkt im drüberziehen!
            if (draggedElement && draggedElement !== block && !block.contains(draggedElement)) {
                const afterElement = getDragAfterElement(childrenZone, e.clientY);
                if (afterElement == null) {
                    childrenZone.appendChild(draggedElement); // Ganz ans Ende
                } else {
                    childrenZone.insertBefore(draggedElement, afterElement); // Vor das jeweilige Element schieben
                }
            }
            e.stopPropagation();
        });

        childrenZone.addEventListener("dragleave", (e) => {
            childrenZone.classList.remove("drag-over");
            e.stopPropagation();
        });

        childrenZone.addEventListener("drop", (e) => {
            e.preventDefault();
            childrenZone.classList.remove("drag-over");
            
            // Das Element wurde in 'dragover' schon verschoben, wir updaten hier nur noch die Farbe!
            if (draggedElement && draggedElement !== block && !block.contains(draggedElement)) {
                const header = draggedElement.querySelector(".block-header");
                if (header) header.style.background = "linear-gradient(135deg, #17a2b8, #117a8b)";
            }
            e.stopPropagation();
        });
    };

    const renderBlockOnCanvas = (uuid, ast) => {
        const block = document.createElement("div");
        block.className = "canvas-block";
        block.setAttribute("draggable", "true");
        block.dataset.uuid = uuid; 
        block.dataset.astBase = JSON.stringify(ast); 

        block.innerHTML = `
            <div class="block-header">
                <span>${ast.identifier || 'Unbenannt'}</span>
                <span style="font-size: 10px; opacity: 0.8;">${ast.domain}</span>
            </div>
            <div class="block-children dropzone"></div>
        `;

        const childrenZone = block.querySelector(".block-children");
        attachDragAndDrop(block, childrenZone);
        document.getElementById("syntax-canvas-area").appendChild(block);

        if (ast.children && ast.children.length > 0) {
            ast.children.forEach(childAst => {
                renderChildBlockInside(childrenZone, childAst);
            });
        }
    };

    const renderChildBlockInside = (parentZone, childAst) => {
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
        
        const childrenZone = block.querySelector(".block-children");
        attachDragAndDrop(block, childrenZone);
        parentZone.appendChild(block);

        if (childAst.children && childAst.children.length > 0) {
            childAst.children.forEach(grandChildAst => {
                renderChildBlockInside(childrenZone, grandChildAst);
            });
        }
    };

    const mainCanvas = document.getElementById("syntax-canvas-area");
    mainCanvas.addEventListener("dragover", (e) => { 
        e.preventDefault(); 
        
        // 🔥 NEU: Auch auf dem grauen Haupt-Canvas kann man nun umsortieren!
        if (draggedElement) {
            const afterElement = getDragAfterElement(mainCanvas, e.clientY);
            if (afterElement == null) {
                mainCanvas.appendChild(draggedElement);
            } else {
                mainCanvas.insertBefore(draggedElement, afterElement);
            }
        }
    });

    mainCanvas.addEventListener("drop", (e) => {
        e.preventDefault();
        if (draggedElement) {
            const header = draggedElement.querySelector(".block-header");
            if (header) header.style.background = ""; 
        }
    });

    document.getElementById("btn-save-canvas").addEventListener("click", async () => {
        const buildAstFromDOM = (blockElement) => {
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

        const rootBlocks = document.querySelectorAll("#syntax-canvas-area > .canvas-block");
        let updatesCount = 0;

        for (let block of rootBlocks) {
            const uuid = block.dataset.uuid;
            if (!uuid || uuid.startsWith("embedded-")) continue;

            const updatedAst = buildAstFromDOM(block);

            try {
                const response = await fetch(`${appConfig.apiUrl}/api/ast/parse`, {
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
}, 1000);