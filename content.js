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
        showCollectionPicker(request.suggestedCollection, request.detectedType)
            .then(collectionName => sendResponse({ collectionName }))
            .catch(() => sendResponse({ collectionName: null }));
        return true; // Will respond asynchronously
    }

    return true; // Important: indicates we will send response asynchronously
});

function showCollectionPicker(suggested, type) {
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
            max-width: 400px;
            width: 90%;
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #1e293b;">Save to Collection</h3>
            <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Type detected: <strong>${type}</strong></p>
            <input type="text" id="collection-name-input" value="${suggested}" 
                style="width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; box-sizing: border-box;" 
                placeholder="Collection name">
            <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;">
                <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #e2e8f0; background: white; border-radius: 6px; cursor: pointer; font-size: 13px;">Cancel</button>
                <button id="save-btn" style="padding: 8px 16px; border: none; background: #2563eb; color: white; border-radius: 6px; cursor: pointer; font-size: 13px;">Save</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector('#collection-name-input');
        const saveBtn = dialog.querySelector('#save-btn');
        const cancelBtn = dialog.querySelector('#cancel-btn');

        // Focus input and select text
        input.focus();
        input.select();

        const cleanup = () => document.body.removeChild(overlay);

        saveBtn.onclick = () => {
            const name = input.value.trim();
            if (name) {
                cleanup();
                resolve(name);
            }
        };

        cancelBtn.onclick = () => {
            cleanup();
            reject();
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') saveBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };
    });
}
