// Background service worker
import { storage } from './modules/storage.js';
import { DataDetector } from './modules/parser.js';
import { aiManager } from './modules/ai.js';
import { detectFeedIntent } from './modules/feeds/feedRouter.js';
import { fetchMultipleFeeds } from './modules/feeds/rssFetcher.js';
import { normalizeFeedResults } from './modules/feeds/feedNormalizer.js';

console.log("Zappo: Background service worker started.");

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
    console.log('Command received:', command);
    if (command === 'toggle-magic-bar') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                // Prevent injection on restricted Chrome pages
                if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://') || tabs[0].url.startsWith('edge://')) {
                    console.warn('Cannot inject Magic Bar on restricted browser pages.');
                    return;
                }

                console.log('Toggling Magic Bar in tab:', tabs[0].id);
                // Script is already loaded via manifest, just send the message
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleMagicBar' })
                    .then(() => console.log('Message sent successfully'))
                    .catch((err) => {
                        console.warn('Failed to toggle Magic Bar:', err);
                        // Try injecting if it failed (maybe content script isn't running?)
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            files: ['content-magic-bar.js']
                        }).then(() => {
                            console.log('Injected content-magic-bar.js, retrying toggle...');
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleMagicBar' });
                            }, 100);
                        }).catch(e => console.error('Injection failed:', e));
                    });
            }
        });
    }
});


// Magic Bar Message Handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkFilePermission') {
        chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
            sendResponse({ isAllowed });
        });
        return true;
    }

    if (request.action === 'aiExtract') {
        console.log(`[Background] aiExtract request: "${request.query}" for URL: ${request.url}`);
        const context = {
            url: request.url,
            title: request.title
        };

        // Check for external feed intent
        const feedIntent = detectFeedIntent(request.query);

        if (feedIntent.isFeedIntent) {
            // Route to Feed Ingestion Pipeline
            handleFeedExtraction(feedIntent, request.query, context)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
        } else {
            // Standard page extraction
            aiManager.extractAndVerify(request.text, request.query, context)
                .then(data => sendResponse({ success: true, data: data }))
                .catch(error => sendResponse({ success: false, error: error.message }));
        }
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

    if (request.action === 'deepEnrichFetch') {
        fetch(request.url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(5000)
        })
            .then(async (res) => {
                if (res.status === 401 || res.status === 403) {
                    return sendResponse({ success: false, reason: `HTTP ${res.status} (Protected)` });
                }
                if (!res.ok) {
                    return sendResponse({ success: false, reason: `HTTP ${res.status}` });
                }
                const html = await res.text();

                // Basic bot protection checks
                if (!html || html.trim().length === 0) {
                    return sendResponse({ success: false, reason: 'Empty body response' });
                }
                if (html.toLowerCase().includes('cloudflare') && (html.toLowerCase().includes('challenge') || html.toLowerCase().includes('ray id'))) {
                    return sendResponse({ success: false, reason: 'Cloudflare challenge detected' });
                }
                if (html.toLowerCase().includes('captcha') && html.toLowerCase().includes('verify')) {
                    return sendResponse({ success: false, reason: 'CAPTCHA detected' });
                }

                sendResponse({ success: true, html: html });
            })
            .catch(error => {
                sendResponse({ success: false, reason: error.name === 'TimeoutError' ? 'Fetch timeout' : error.message });
            });
        return true;
    }
});

/**
 * Handle Feed-Based Extraction Pipeline
 * 1. Fetch feeds -> 2. Normalize -> 3. AI Extract+Verify -> 4. Return preview
 */
async function handleFeedExtraction(feedIntent, query, context) {
    console.log('[FeedIngestion] Starting feed extraction for topic:', feedIntent.topic);

    // Step 1: Fetch all feeds for the detected topic
    const feedResults = await fetchMultipleFeeds(feedIntent.feeds);

    if (feedResults.length === 0 || feedResults.every(r => r.entries.length === 0)) {
        return {
            success: false,
            error: `No feed data retrieved for topic "${feedIntent.topicLabel}". The feeds may be temporarily unavailable.`
        };
    }

    // Step 2: Normalize feed entries into a text block
    const normalized = normalizeFeedResults(feedResults, feedIntent.topicLabel);
    console.log(`[FeedIngestion] Normalized ${normalized.entryCount} entries from ${feedResults.length} feeds`);

    // Step 3: Run through AI extraction + verification pipeline
    const feedContext = {
        url: `feed://${feedIntent.topic}`,
        title: `Feed Ingestion: ${feedIntent.topicLabel}`
    };

    const extractedData = await aiManager.extractAndVerify(
        normalized.textBlock,
        query,
        feedContext
    );

    // Step 4: Attach feed metadata to the response
    if (extractedData) {
        extractedData.feedMetadata = {
            topic: feedIntent.topicLabel,
            topicId: feedIntent.topic,
            timeRelevance: feedIntent.timeRelevance,
            sourcesUsed: normalized.metadata.sourcesUsed,
            retrievedAt: normalized.metadata.retrievedAt,
            totalFeedEntries: normalized.metadata.totalEntries,
            previewEntries: normalized.metadata.previewEntries,
            feedCount: normalized.metadata.feedCount,
            isFeedData: true
        };
    }

    return { success: true, data: extractedData };
}

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
            source: {
                ...request.source,
                auditId: request.data.auditId || null, // Link to the Audit Log
                feedMetadata: request.data.feedMetadata || null // Feed Intelligence metadata
            },
            enriched: {},
            validation: { status: 'valid', issues: [] },
            tags: request.data.feedMetadata ? ['ai-extracted', 'feed-ingestion'] : ['ai-extracted']
        };

        await storage.addItemToCollection(targetCollection.id, newItem);

        // Removed Self-Audit & GitHub Commit as per user request

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icons/icon48.png',
            title: 'Data Saved',
            message: `Saved ${request.data.length} items to "${targetCollection.name}"`
        });
    } catch (error) {
        console.error('Error saving extracted data:', error);
    }
}

// Expose storage globally for debugging/console access
// globalThis.storage = storage;
