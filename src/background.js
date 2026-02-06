// Background service worker
import { storage } from './modules/storage.js';
import { DataDetector } from './utils/parser.js';

console.log("Smart Web Collector: Background service worker started.");

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-to-collection",
        title: "Save to Smart Collector",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "save-to-collection") {
        try {
            console.log("Context menu clicked, sending message to tab:", tab.id);

            // Try to send message, if it fails, inject the content script first
            let response;
            try {
                response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
            } catch (error) {
                // Content script not loaded, inject it now
                console.log("Content script not loaded, injecting now...");
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // Wait a moment for script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                // Try again
                response = await chrome.tabs.sendMessage(tab.id, { action: "getSelection" });
            }

            console.log("Received response from content script:", response);

            if (response && response.selection) {
                await handleSaveSelection(response, tab.id);
                console.log("Successfully saved item");
            } else {
                console.error("No selection data received");
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'assets/icons/icon48.png',
                    title: 'Error',
                    message: 'Could not capture selection. Try selecting text again.'
                });
            }
        } catch (error) {
            console.error("Error saving selection:", error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/icon48.png',
                title: 'Error',
                message: `Failed to save: ${error.message}`
            });
        }
    }
});

async function handleSaveSelection(data, tabId) {
    // Auto-detect data type and suggest collection
    const detection = DataDetector.detectDataType(data.selection.text);

    // Get existing collections
    const allCollections = await storage.getCollections();
    const existingCollections = allCollections.map(c => ({
        name: c.name,
        itemCount: c.items.length
    }));

    // Ask content script to show collection picker
    const pickerResponse = await chrome.tabs.sendMessage(tabId, {
        action: 'showCollectionPicker',
        suggestedCollection: detection.suggestedCollection,
        detectedType: detection.type,
        existingCollections: existingCollections
    });

    const collectionName = pickerResponse.collectionName;

    // User cancelled
    if (!collectionName) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Cancelled',
            message: 'Item not saved'
        });
        return;
    }

    // Find or create collection
    let collections = await storage.getCollections();
    let targetCollection = collections.find(c => c.name === collectionName.trim());

    if (!targetCollection) {
        const newId = await storage.saveCollection({
            name: collectionName.trim(),
            items: []
        });
        targetCollection = await storage.getCollection(newId);
    }

    const newItem = {
        type: detection.type,
        data: {
            content: data.selection.text,
            html: data.selection.html
        },
        source: data.page,
        enriched: {},
        validation: { status: 'valid', issues: [] },
        tags: []
    };

    await storage.addItemToCollection(targetCollection.id, newItem);
    console.log(`Item saved to ${collectionName} collection`);

    // Show notification to user
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon48.png',
        title: 'Saved to Smart Collector',
        message: "Added to \"" + collectionName + "\" (" + detection.type + ")"
    });
}

// Magic Bar Command Handler
chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-magic-bar') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // Script is already loaded via manifest, just send the message
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleMagicBar' })
                    .catch((err) => {
                        console.warn('Failed to toggle Magic Bar:', err);
                    });
            }
        });
    }
});

import { aiManager } from './modules/ai.js';

// Magic Bar Message Handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkFilePermission') {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
            sendResponse({ isAllowed });
        });
        return true;
    }

    if (request.action === 'aiExtract') {
        aiManager.extractAndVerify(request.text, request.query)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Async response
    }

    if (request.action === 'getCollections') {
        storage.getCollections()
            .then(collections => sendResponse({ success: true, collections }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'saveExtractedData') {
        handleSaveExtractedData(request)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function handleSaveExtractedData(request) {
    try {
        let targetCollection = null;

        // If a specific collectionId is provided, use it.
        if (request.collectionId) {
            targetCollection = await storage.getCollection(request.collectionId);
        } else if (request.newCollectionName) {
            // Create a new collection on the fly
            const newId = await storage.saveCollection({
                name: request.newCollectionName,
                items: []
            });
            targetCollection = await storage.getCollection(newId);
        }

        // Fallback or default to "AI Extractions"
        if (!targetCollection) {
            const collectionName = "AI Extractions";
            let collections = await storage.getCollections();
            targetCollection = collections.find(c => c.name === collectionName);

            if (!targetCollection) {
                const newId = await storage.saveCollection({
                    name: collectionName,
                    items: []
                });
                targetCollection = await storage.getCollection(newId);
            }
        }

        // Format the data for better display
        let formattedContent = '';
        if (request.data.length === 1 && Object.keys(request.data[0]).length === 1) {
            // Single summary/paragraph - extract the text directly
            const key = Object.keys(request.data[0])[0];
            formattedContent = `${key}:\n\n${request.data[0][key]}`;
        } else {
            // List of items - format as readable text
            const headers = Object.keys(request.data[0]);
            formattedContent = request.data.map((item, index) => {
                const fields = headers.map(h => `${h}: ${item[h]}`).join('\n');
                return `Item ${index + 1}:\n${fields}`;
            }).join('\n\n');
        }

        const newItem = {
            type: 'ai_extraction',
            data: {
                content: formattedContent,
                structured: request.data,
                query: request.query
            },
            source: request.source,
            enriched: {},
            validation: { status: 'valid', issues: [] },
            tags: ['ai-extracted']
        };

        await storage.addItemToCollection(targetCollection.id, newItem);

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Data Saved',
            message: `Saved ${request.data.length} items to "AI Extractions"`
        });
    } catch (error) {
        console.error('Error saving extracted data:', error);
    }
}
