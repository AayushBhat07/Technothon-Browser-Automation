// Content script for Smart Web Collector

let lastSelection = null;

document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection.toString().length > 0) {
        lastSelection = {
            text: selection.toString(),
            html: getSelectionHtml(selection),
            type: detectSelectionType(selection)
        };
    }
});

function getSelectionHtml(selection) {
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const clonedSelection = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(clonedSelection);
        return div.innerHTML;
    }
    return '';
}

function detectSelectionType(selection) {
    const text = selection.toString().trim();
    if (text.includes('@') && text.includes('.')) return 'contact'; // Simple heuristic
    if (text.match(/^\$?\d+(,\d{3})*(\.\d{2})?$/)) return 'price';
    return 'text';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    if (request.action === 'getSelection') {
        const response = {
            selection: lastSelection,
            page: {
                url: window.location.href,
                title: document.title,
                timestamp: new Date().toISOString()
            }
        };
        console.log("Content script sending response:", response);
        sendResponse(response);
    }

    if (request.action === 'showCollectionPicker') {
        showCollectionPicker(request.suggestedCollection, request.detectedType, request.existingCollections)
            .then(collectionName => sendResponse({ collectionName }))
            .catch(() => sendResponse({ collectionName: null }));
        return true; // Will respond asynchronously
    }

    // Do not return true unconditionally, otherwise other listeners (like Magic Bar) cannot respond
    // return true; 
});

function showCollectionPicker(suggested, type, existingCollections = []) {
    return new Promise((resolve, reject) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 450px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;

        let collectionsHTML = '';
        if (existingCollections.length > 0) {
            collectionsHTML = `
                <div style="margin-bottom: 16px;">
                    <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 500; color: #475569;">Select existing collection:</p>
                    <div id="collection-list" style="display: flex; flex-direction: column; gap: 6px;">
                        ${existingCollections.map((col, idx) => `
                            <button data-collection-name="${col.name}" class="collection-btn" style="
                                padding: 10px 14px;
                                border: 1px solid #e2e8f0;
                                background: white;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                text-align: left;
                                transition: all 0.15s;
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <span style="font-weight: 500; color: #1e293b;">${col.name}</span>
                                <span style="font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 12px;">${col.itemCount} items</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="margin: 12px 0; text-align: center; color: #94a3b8; font-size: 12px;">OR</div>
                </div>
            `;
        }

        dialog.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #1e293b;">Save to Collection</h3>
            <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Type detected: <strong>${type}</strong></p>
            ${collectionsHTML}
            <div id="new-collection-section">
                <button id="show-new-input-btn" style="
                    width: 100%;
                    padding: 10px 14px;
                    border: 2px dashed #cbd5e1;
                    background: #f8fafc;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    color: #475569;
                    font-weight: 500;
                    transition: all 0.15s;
                ">
                    + Create New Collection
                </button>
                <div id="new-input-container" style="display: none; margin-top: 12px;">
                    <input type="text" id="collection-name-input" value="${suggested}" 
                        style="width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; box-sizing: border-box;" 
                        placeholder="Enter collection name">
                    <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
                        <button id="cancel-new-btn" style="padding: 8px 16px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; cursor: pointer; font-size: 13px;">Cancel</button>
                        <button id="save-new-btn" style="padding: 8px 16px; border: none; background: #2563eb; color: white; border-radius: 6px; cursor: pointer; font-size: 13px;">Create & Save</button>
                    </div>
                </div>
            </div>
            <div style="margin-top: 16px; text-align: right;">
                <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; cursor: pointer; font-size: 13px;">Cancel</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cleanup = () => document.body.removeChild(overlay);

        // Handle existing collection selection
        const collectionBtns = dialog.querySelectorAll('.collection-btn');
        collectionBtns.forEach(btn => {
            btn.onmouseover = () => {
                btn.style.borderColor = '#2563eb';
                btn.style.background = '#eff6ff';
            };
            btn.onmouseout = () => {
                btn.style.borderColor = '#e2e8f0';
                btn.style.background = 'white';
            };
            btn.onclick = () => {
                const name = btn.dataset.collectionName;
                cleanup();
                resolve(name);
            };
        });

        // Handle new collection creation
        const showNewBtn = dialog.querySelector('#show-new-input-btn');
        const newInputContainer = dialog.querySelector('#new-input-container');
        const newInput = dialog.querySelector('#collection-name-input');
        const saveNewBtn = dialog.querySelector('#save-new-btn');
        const cancelNewBtn = dialog.querySelector('#cancel-new-btn');
        const cancelBtn = dialog.querySelector('#cancel-btn');

        showNewBtn.onmouseover = () => {
            showNewBtn.style.borderColor = '#2563eb';
            showNewBtn.style.background = '#eff6ff';
            showNewBtn.style.color = '#2563eb';
        };
        showNewBtn.onmouseout = () => {
            showNewBtn.style.borderColor = '#cbd5e1';
            showNewBtn.style.background = '#f8fafc';
            showNewBtn.style.color = '#475569';
        };

        showNewBtn.onclick = () => {
            showNewBtn.style.display = 'none';
            newInputContainer.style.display = 'block';
            newInput.focus();
            newInput.select();
        };

        saveNewBtn.onclick = () => {
            const name = newInput.value.trim();
            if (name) {
                cleanup();
                resolve(name);
            }
        };

        cancelNewBtn.onclick = () => {
            showNewBtn.style.display = 'block';
            newInputContainer.style.display = 'none';
        };

        cancelBtn.onclick = () => {
            cleanup();
            reject();
        };

        if (newInput) {
            newInput.onkeydown = (e) => {
                if (e.key === 'Enter') saveNewBtn.click();
                if (e.key === 'Escape') cancelNewBtn.click();
            };
        }
    });
}
