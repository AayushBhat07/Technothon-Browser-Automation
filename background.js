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
