import { storage } from './modules/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
    await loadRecentSaves();
    setupEventListeners();
});

async function loadRecentSaves() {
    try {
        const collections = await storage.getCollections();
        const allItems = collections.flatMap(c => c.items).sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        updateTotalCount(allItems.length);
        renderRecentList(allItems.slice(0, 5));
    } catch (error) {
        console.error('Error loading recent saves:', error);
    }
}

function updateTotalCount(count) {
    const badge = document.getElementById('total-count');
    badge.textContent = `${count} item${count !== 1 ? 's' : ''}`;
}

function renderRecentList(items) {
    const list = document.getElementById('recent-list');
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<li class="empty-state">No items saved yet.</li>';
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');
        const date = new Date(item.timestamp).toLocaleDateString();

        li.innerHTML = `
      <span class="item-content" title="${item.data.content}">${item.data.content}</span>
      <div class="item-meta">
        <span class="item-type">${item.type}</span>
        <span class="item-date">${date}</span>
      </div>
    `;
        list.appendChild(li);
    });
}

function setupEventListeners() {
    document.getElementById('view-all-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
        window.close();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
        // Placeholder for export functionality
        alert('Export feature coming soon!');
    });

    document.getElementById('magic-btn').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                console.log('[Popup] Toggling Magic Bar on tab:', tab.id);
                try {
                    await chrome.tabs.sendMessage(tab.id, { action: 'toggleMagicBar' });
                    window.close();
                } catch (msgError) {
                    console.warn('[Popup] Magic Bar message failed, injecting script...', msgError);
                    // Inject script and try again
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['magic.js']
                    });
                    // Give it a moment to initialize
                    setTimeout(async () => {
                        try {
                            await chrome.tabs.sendMessage(tab.id, { action: 'toggleMagicBar' });
                            window.close();
                        } catch (retryError) {
                            console.error('[Popup] Retry failed:', retryError);
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('[Popup] Failed to toggle Magic Bar:', error);
        }
    });
}
