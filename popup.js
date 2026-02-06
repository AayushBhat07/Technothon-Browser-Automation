import { storage } from './modules/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
    setupEventListeners();
});

async function initializePopup() {
    try {
        const collections = await storage.getCollections();
        const allItems = collections.flatMap(c => c.items).sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        updateUI(allItems);
    } catch (error) {
        console.error('Error initializing popup:', error);
        setEmptyState();
    }
}

function updateUI(items) {
    // Update total count badge
    const countBadge = document.getElementById('total-count');
    if (countBadge) countBadge.textContent = items.length;

    // Update status text
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = items.length > 0 ? 'Last saved ' + getTimeAgo(items[0].timestamp) : 'Ready to save';
    }

    // Render latest item card
    renderLatestCard(items[0]);
}

function renderLatestCard(item) {
    const card = document.getElementById('recent-item-card');
    const previewText = document.getElementById('item-preview-text');
    const typeLabel = document.getElementById('item-preview-type');
    const dateLabel = document.getElementById('item-preview-date');

    if (!item) {
        setEmptyState();
        return;
    }

    card.classList.remove('empty');
    previewText.textContent = item.data.content;
    typeLabel.textContent = item.type.toUpperCase();
    dateLabel.textContent = new Date(item.timestamp).toLocaleDateString();
}

function setEmptyState() {
    const card = document.getElementById('recent-item-card');
    const previewText = document.getElementById('item-preview-text');
    if (card) card.classList.add('empty');
    if (previewText) previewText.textContent = 'No recent items captured. Use the Magic Bar to start collecting!';
}

function setupEventListeners() {
    // Dashboard / View All
    document.getElementById('view-all-btn').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.sidePanel.open({ windowId: tab.windowId });
            window.close();
        } catch (error) {
            console.error('Error opening side panel:', error);
            chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
        }
    });

    // Magic Bar Toggle
    // Magic Bar Toggle
    document.getElementById('magic-btn').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { action: 'toggleMagicBar' });
                    window.close();
                } catch (msgError) {
                    console.warn('Magic Bar message failed, injecting script...', msgError);
                    // Inject script and try again
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content-magic-bar.js']
                    });
                    // Give it a moment to initialize
                    setTimeout(async () => {
                        await chrome.tabs.sendMessage(tab.id, { action: 'toggleMagicBar' });
                        window.close();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Failed to toggle Magic Bar:', error);
        }
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
        alert('Exporting from popup is coming soon! Use the Dashboard for full export controls.');
    });

    // Settings
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        alert('Settings coming soon!');
    });
}

function getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return past.toLocaleDateString();
}
