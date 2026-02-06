import { storage } from './modules/storage.js';
import { ExportManager } from './modules/export.js';
import { EnrichmentManager } from './modules/enrichment.js';
import { ValidationManager } from './modules/validation.js';
import { MappingManager } from './modules/mapping.js';
import { TemplateManager } from './modules/templates.js';
import { aiManager } from './modules/ai.js';

import { authManager } from './modules/auth.js';

let currentCollectionId = null;
let currentExtractionItem = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Storage
    await storage.open();

    // Initialize Theme
    const savedTheme = localStorage.getItem('sidepanel-theme') || 'theme-modern';
    document.body.className = savedTheme;
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = savedTheme;
        themeSelect.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            document.body.className = newTheme;
            localStorage.setItem('sidepanel-theme', newTheme);
        });
    }

    // Initialize Auth directly
    try {
        await authManager.init();
        // Subscribe to Auth Changes
        authManager.subscribe(updateUserProfileUI);
    } catch (error) {
        console.error('AuthManager initialization failed:', error);
    }

    // Load initial data
    await loadCollections();
    await updateDashboardStats();

    // Check for collectionId in URL
    const urlParams = new URLSearchParams(window.location.search);
    const colId = urlParams.get('collectionId');
    if (colId) {
        await selectCollection(colId);
    } else {
        await showDashboard(); // Default view
    }

    setupEventListeners();
});

// Auth UI Handling
function updateUserProfileUI(user) {
    const loggedInView = document.getElementById('user-logged-in');
    const loggedOutView = document.getElementById('user-logged-out');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    if (user) {
        // User is signed in
        loggedInView.style.display = 'flex';
        loggedOutView.style.display = 'none';

        if (userAvatar) userAvatar.src = user.picture || '';
        if (userName) userName.textContent = user.name || user.email || 'User';

        const welcomeName = document.getElementById('user-name-welcome');
        if (welcomeName && user.name) {
            welcomeName.textContent = user.name.split(' ')[0];
        } else if (welcomeName) {
            welcomeName.textContent = 'Collector';
        }
    } else {
        // User is signed out
        loggedInView.style.display = 'none';
        loggedOutView.style.display = 'flex';
    }
}

// Update dashboard statistics
async function updateDashboardStats() {
    const collections = await storage.getCollections();

    // Total items across all collections
    const totalItems = collections.reduce((sum, c) => sum + c.items.length, 0);
    document.getElementById('total-items').textContent = totalItems;

    // Count AI extracted items
    let aiExtractedCount = 0;
    collections.forEach(c => {
        c.items.forEach(item => {
            if (item.ai_extracted) {
                aiExtractedCount++;
            }
        });
    });
    document.getElementById('ai-extracted-count').textContent = aiExtractedCount;

    // Find last saved item (most recent by timestamp)
    let lastItem = null;
    let lastTimestamp = 0;
    collections.forEach(c => {
        c.items.forEach(item => {
            const timestamp = new Date(item.timestamp || item.source?.timestamp || 0).getTime();
            if (timestamp > lastTimestamp) {
                lastTimestamp = timestamp;
                lastItem = item;
            }
        });
    });

    // Update last saved from card
    const lastSavedSiteEl = document.getElementById('last-saved-site');
    const lastSavedSiteText = document.getElementById('last-saved-site-text');
    const lastSavedSiteIcon = document.getElementById('last-saved-site-icon');

    if (lastItem && lastItem.source) {
        try {
            const urlStr = lastItem.source.url;

            // Handle file:// URLs (local HTML files)
            if (urlStr.startsWith('file://')) {
                const filePath = urlStr.replace('file://', '');
                const fileName = filePath.split('/').pop() || filePath;
                lastSavedSiteText.textContent = fileName;
                lastSavedSiteEl.title = `Click to open: ${filePath}`;
                lastSavedSiteIcon.style.display = 'block';
                lastSavedSiteEl.onclick = () => {
                    chrome.tabs.create({ url: urlStr });
                };
            } else {
                // Handle regular http(s):// URLs
                const url = new URL(urlStr);
                const siteName = url.hostname.replace('www.', '');
                lastSavedSiteText.textContent = siteName;
                lastSavedSiteEl.title = `Click to visit: ${urlStr}`;
                lastSavedSiteIcon.style.display = 'block';
                lastSavedSiteEl.onclick = () => {
                    chrome.tabs.create({ url: urlStr });
                };
            }
        } catch (e) {
            lastSavedSiteText.textContent = lastItem.source.title || 'Unknown';
            lastSavedSiteEl.title = '';
            lastSavedSiteIcon.style.display = 'none';
            lastSavedSiteEl.onclick = null;
        }
    } else {
        lastSavedSiteText.textContent = '-';
        lastSavedSiteEl.title = '';
        lastSavedSiteIcon.style.display = 'none';
        lastSavedSiteEl.onclick = null;
    }
}

async function loadCollections() {
    const collections = await storage.getCollections();
    const list = document.getElementById('collection-list');
    if (!list) return;
    list.innerHTML = '';

    // Add "Dashboard" link
    const dashboardItem = document.createElement('div');
    dashboardItem.className = `collection-item ${!currentCollectionId ? 'active' : ''}`;
    dashboardItem.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            <span>Overview</span>
        </div>
    `;
    dashboardItem.onclick = () => showDashboard();
    dashboardItem.ondblclick = () => {
        const url = chrome.runtime.getURL('sidepanel.html');
        chrome.tabs.create({ url });
    };
    list.appendChild(dashboardItem);

    collections.forEach(c => {
        const li = document.createElement('div');
        li.className = `collection-item ${c.id === currentCollectionId ? 'active' : ''}`;
        li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span class="collection-name">${c.name}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="collection-count">${c.items.length}</span>
      </div>
    `;
        li.onclick = () => {
            const url = chrome.runtime.getURL(`collection-view.html?id=${c.id}`);
            chrome.tabs.create({ url });
        };
        list.appendChild(li);
    });

    // Setup export button listeners
    document.querySelectorAll('.collection-export-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const collectionId = btn.dataset.collectionId;
            const collection = await storage.getCollection(collectionId);
            await exportCollectionToCSV(collection);
        };
    });

    // Update dashboard stats
    await updateDashboardStats();

    // Select first collection by default if none selected
    if (false) {
        selectCollection(collections[0].id);
    }
}

async function showDashboard() {
    currentCollectionId = null;

    // Update Sidebar Active State
    document.querySelectorAll('.collection-item').forEach(el => el.classList.remove('active'));
    const dashItem = document.querySelector('.collection-item:first-child');
    if (dashItem) dashItem.classList.add('active');

    // Update Header
    const welcomeTitle = document.querySelector('.welcome-title');
    if (welcomeTitle) welcomeTitle.textContent = 'Overview';

    // Get Recent Items across all collections
    const collections = await storage.getCollections();
    let allItems = [];
    collections.forEach(c => {
        c.items.forEach(item => {
            allItems.push({ ...item, collectionId: c.id });
        });
    });

    // Sort by timestamp desc
    allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Render the top 20 items
    renderItems(allItems.slice(0, 20));

    // Update dashboard stats
    await updateDashboardStats();
}

async function selectCollection(id) {
    currentCollectionId = id;

    // Update UI active state
    document.querySelectorAll('.collection-item').forEach(el => el.classList.remove('active'));

    const collection = await storage.getCollection(id);

    // Update Header
    const welcomeTitle = document.querySelector('.welcome-title');
    if (welcomeTitle) welcomeTitle.textContent = collection.name;

    renderItems(collection.items.map(i => ({ ...i, collectionId: id })));

    // Enable template button if items exist
    const templateBtn = document.getElementById('template-btn');
    const hasItems = collection.items.length > 0;
    templateBtn.disabled = !hasItems;

    // Update dashboard stats
    await updateDashboardStats();
}

function renderItems(items) {
    const container = document.getElementById('items-container');
    if (!container) return;

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                <p>No items found. Start collecting everything!</p>
            </div>
        `;
        return;
    }

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.index = index;
        row.dataset.id = item.id;

        const displayTitle = item.data.title || item.data.name || item.data.content || 'Untitled Item';
        const truncatedTitle = displayTitle.length > 60 ? displayTitle.substring(0, 60) + '...' : displayTitle;

        // Extract domain
        let sourceDomain = 'Local';
        try {
            if (item.source && item.source.url) {
                const url = new URL(item.source.url);
                sourceDomain = url.hostname.replace('www.', '');
            }
        } catch (e) { }

        const label = item.label || 'Unlabeled';
        const labelClass = `label-${label.toLowerCase().replace(/\s+/g, '')}`;

        const date = new Date(item.timestamp || (item.source && item.source.timestamp));
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        row.innerHTML = `
            <div class="col-checkbox"><input type="checkbox" class="item-checkbox" data-id="${item.id}" onclick="event.stopPropagation()"></div>
            <div class="col-title">${truncatedTitle}</div>
            <div class="col-status"><span class="status-badge ${labelClass}">${label}</span></div>
            <div class="col-tags">
                <span class="tag-pill">${sourceDomain.split('.')[0]}</span>
                ${item.ai_extracted ? '<span class="tag-pill" style="background: var(--primary-glow); color: var(--primary);">AI</span>' : ''}
            </div>
            <div class="col-date">${dateStr}</div>
            <div class="col-actions">
                <button class="action-btn view-btn" title="View Details">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>
                </button>
            </div>
        `;

        row.onclick = () => openItemDetail(index);
        container.appendChild(row);
    });
}

// Item Detail View - Open in new tab
function openItemDetail(index) {
    getCurrentItems().then(items => {
        const item = items[index];
        if (item) {
            const url = chrome.runtime.getURL(`item-view.html?id=${item.id}&collectionId=${item.collectionId || currentCollectionId}`);
            chrome.tabs.create({ url });
        }
    });
}

// Helper function to determine if item should show AI extraction button
function shouldShowExtractionButton(item) {
    // Don't show if already AI extracted
    if (item.ai_extracted) return false;

    // Don't show if already structured
    if (item.type === 'structured') return false;

    // Must have content to extract from
    if (!item.data.content) return false;

    const content = item.data.content;
    const wordCount = content.split(/\s+/).length;

    // Must be more than 50 words to be worth extracting
    if (wordCount <= 50) return false;

    // Check if appears unstructured (no clear key-value pairs)
    // If it has many colons or equals signs, it might already be structured
    const colonCount = (content.match(/:/g) || []).length;
    const equalsCount = (content.match(/=/g) || []).length;

    // If it has lots of key-value patterns relative to content length, skip it
    if (colonCount > wordCount / 10 || equalsCount > wordCount / 10) {
        return false;
    }

    return true;
}

// Helper function to show toast notifications
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    toastMessage.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// New function to handle collection export
async function exportCollectionToCSV(collection) {
    if (collection.items.length === 0) {
        showToast('Collection is empty');
        return;
    }
    // Automatically export with smart field detection
    ExportManager.exportToCSV(collection);
    showToast('✓ Exported CSV successfully!');
}

function setupEventListeners() {
    // Global click listener to close dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn.more-btn') && !e.target.closest('.dropdown-menu')) {
            document.querySelectorAll('.dropdown-menu.visible').forEach(menu => {
                menu.classList.remove('visible');
            });
        }
    });

    // Event Delegation for Items Container
    const itemsContainer = document.getElementById('items-container');
    if (itemsContainer) {
        itemsContainer.addEventListener('click', async (e) => {
            const target = e.target;

            // 1. Handle Label Buttons
            const labelBtn = target.closest('.label-btn');
            if (labelBtn) {
                console.log('=== LABEL BUTTON CLICKED ===');
                e.stopPropagation();
                const index = parseInt(labelBtn.dataset.index);
                const label = labelBtn.dataset.label;
                console.log('Index:', index, 'Label:', label);

                // Close dropdown
                const dropdown = document.getElementById(`dropdown - ${index} `);
                console.log('Dropdown found:', dropdown);
                if (dropdown) dropdown.classList.remove('visible');

                try {
                    // Update item
                    console.log('Fetching collection:', currentCollectionId);
                    const collection = await storage.getCollection(currentCollectionId);
                    console.log('Collection:', collection);
                    console.log('Item before update:', collection.items[index]);

                    collection.items[index].label = label;
                    console.log('Item after update:', collection.items[index]);

                    console.log('Saving to storage...');
                    await storage.saveCollection(collection);
                    console.log('Saved successfully');

                    // Refresh view
                    console.log('Refreshing view...');
                    await selectCollection(currentCollectionId);
                    console.log('View refreshed');
                } catch (err) {
                    console.error('ERROR updating label:', err);
                }
                return;
            }

            // 2. Handle AI Extract Buttons
            const aiExtractBtn = target.closest('.ai-extract-btn');
            if (aiExtractBtn) {
                e.stopPropagation();
                const index = parseInt(aiExtractBtn.dataset.itemIndex);

                // Close dropdown
                const dropdown = document.getElementById(`dropdown - ${index} `);
                if (dropdown) dropdown.classList.remove('visible');

                const collection = await storage.getCollection(currentCollectionId);
                const item = collection.items[index];
                await showExtractionModal(item, index);
                return;
            }

            // 3. Handle Delete Buttons
            const deleteBtn = target.closest('.delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const index = parseInt(deleteBtn.dataset.index);
                if (confirm('Are you sure you want to delete this item?')) {
                    const collection = await storage.getCollection(currentCollectionId);
                    collection.items.splice(index, 1);
                    await storage.saveCollection(collection);
                    await selectCollection(currentCollectionId);
                }
                return;
            }

            // 4. Handle More Buttons (Dropdown Toggle)
            const moreBtn = target.closest('.more-btn');
            if (moreBtn) {
                e.stopPropagation();
                const index = moreBtn.dataset.index;

                // Close all other dropdowns
                document.querySelectorAll('.dropdown-menu').forEach(menu => {
                    if (menu.id !== `dropdown - ${index} `) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown - ${index} `);
                if (dropdown) {
                    dropdown.classList.toggle('visible');
                }
                return;
            }

            // 5. Handle Label Badge Click (Toggle Dropdown)
            const statusCol = target.closest('.col-status');
            if (statusCol) {
                e.stopPropagation();
                const row = statusCol.closest('.table-row');
                const index = row.dataset.index;

                // Close all other dropdowns
                document.querySelectorAll('.dropdown-menu').forEach(menu => {
                    if (menu.id !== `dropdown - ${index} `) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown - ${index} `);
                if (dropdown) {
                    dropdown.classList.toggle('visible');
                }
                return;
            }

            // 6. Handle View Details (Title or View Button ONLY)
            const viewBtn = target.closest('.view-btn');
            const titleCol = target.closest('.col-title');

            // Prevent if clicking checkbox
            if (target.closest('.item-checkbox')) return;
            // Prevent if clicking dropdown
            if (target.closest('.dropdown-menu')) return;

            let index = -1;
            if (viewBtn) {
                e.stopPropagation();
                index = parseInt(viewBtn.closest('.table-row').dataset.index);
            } else if (titleCol) {
                index = parseInt(titleCol.closest('.table-row').dataset.index);
            }

            if (index !== -1 && !isNaN(index)) {
                openItemDetail(index);
            }
        });
    }

    // Auth Event Listeners
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn && authManager) {
        signInBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Emergency Sign in clicked');
            try {
                await authManager.login();
                showToast('Signed in successfully!');
            } catch (error) {
                console.error('Login failed', error);
                showToast('Sign in failed: ' + (error.message || 'Unknown error'));
            }
        });
    }

    const signOutBtn = document.getElementById('sign-out-btn') || document.getElementById('logout-btn');
    if (signOutBtn && authManager) {
        signOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await authManager.logout();
            showToast('Signed out');
        });
    }

    // New Collection Modal
    const modal = document.getElementById('new-collection-modal');
    const newBtn = document.getElementById('new-collection-btn');
    const cancelBtn = document.getElementById('cancel-collection-btn');
    const saveBtn = document.getElementById('save-collection-btn');
    const nameInput = document.getElementById('collection-name-input');

    newBtn.onclick = () => modal.classList.remove('hidden');
    cancelBtn.onclick = () => modal.classList.add('hidden');

    saveBtn.onclick = async () => {
        const name = nameInput.value.trim();
        if (name) {
            await storage.saveCollection({ name, items: [] });
            nameInput.value = '';
            modal.classList.add('hidden');
            await loadCollections();
        }
    };

    // Delete Collection Button (if it exists)
    const deleteBtn = document.getElementById('delete-collection-btn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!currentCollectionId) {
                alert('No collection selected.');
                return;
            }

            if (confirm('Are you sure you want to delete this collection?')) {
                await storage.deleteCollection(currentCollectionId);
                currentCollectionId = null;
                await loadCollections();
                renderItems([]); // Clear view
            }
        };
    }

    // Refresh Button
    document.getElementById('refresh-btn').onclick = async () => {
        await loadCollections();
        if (currentCollectionId) {
            await selectCollection(currentCollectionId);
        }
    };

    // Select All Checkbox
    document.getElementById('select-all-checkbox').onchange = (e) => {
        const checkboxes = document.querySelectorAll('.item-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    };

    // Mapping Modal Logic
    const mappingModal = document.getElementById('mapping-modal');
    const mappingContainer = document.getElementById('mapping-container');

    function showMappingModal(collection) {
        if (collection.items.length === 0) {
            alert('Collection is empty.');
            return;
        }

        mappingModal.classList.remove('hidden');

        // Default target columns
        const targetColumns = ['Name', 'Email', 'Company', 'Role', 'Phone', 'Website', 'Source URL'];
        const autoMapping = MappingManager.autoMap(collection.items, targetColumns);

        // Get all available source fields
        const sampleItem = collection.items[0];
        const sourceFields = [
            ...Object.keys(sampleItem.data),
            ...Object.keys(sampleItem.source || {}),
            'source_url', 'source_title', 'timestamp'
        ];

        mappingContainer.innerHTML = '';

        targetColumns.forEach(target => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '8px';
            row.style.alignItems = 'center';

            const select = document.createElement('select');
            select.innerHTML = '<option value="">(Skip)</option>';

            sourceFields.forEach(source => {
                const option = document.createElement('option');
                option.value = source;
                option.textContent = source;
                if (autoMapping[source] === target) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            row.innerHTML = `<span style = "font-weight:500" > ${target}</span > `;
            row.appendChild(select);
            mappingContainer.appendChild(row);
        });

        document.getElementById('cancel-mapping-btn').onclick = () => {
            mappingModal.classList.add('hidden');
        };

        document.getElementById('confirm-mapping-btn').onclick = () => {
            const finalMapping = {};
            const rows = mappingContainer.children;

            Array.from(rows).forEach(row => {
                const target = row.querySelector('span').textContent;
                const source = row.querySelector('select').value;
                if (source) {
                    finalMapping[source] = target;
                }
            });

            const mappedItems = MappingManager.applyMapping(collection.items, finalMapping);

            // Use ExportManager to handle mapped items export
            ExportManager.exportMappedItems(mappedItems, collection.name);
            mappingModal.classList.add('hidden');
        };
    }




    // Template Button & Modal
    const templateModal = document.getElementById('template-modal');
    const templateInput = document.getElementById('template-input');
    const previewContainer = document.getElementById('preview-container');

    document.getElementById('template-btn').onclick = () => {
        if (!currentCollectionId) return;
        templateModal.classList.remove('hidden');
        updatePreview();
    };

    document.getElementById('cancel-template-btn').onclick = () => {
        templateModal.classList.add('hidden');
    };

    templateInput.addEventListener('input', updatePreview);

    async function updatePreview() {
        if (!currentCollectionId) return;
        const collection = await storage.getCollection(currentCollectionId);
        if (collection.items.length > 0) {
            const sample = collection.items[0];
            const generated = TemplateManager.generate(templateInput.value, sample);
            previewContainer.textContent = `Preview (1 of ${collection.items.length}):\n\n${generated}`;
        }
    }

    document.getElementById('generate-btn').onclick = async () => {
        if (!currentCollectionId) return;
        const collection = await storage.getCollection(currentCollectionId);

        const allGenerated = collection.items.map(item =>
            TemplateManager.generate(templateInput.value, item)
        ).join('\n\n---\n\n');

        await navigator.clipboard.writeText(allGenerated);
        alert(`Generated ${collection.items.length} documents and copied to clipboard!`);
        templateModal.classList.add('hidden');
    };

    // Settings Modal Logic
    const settingsModal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const apiKeyInput = document.getElementById('api-key-input');

    settingsBtn.onclick = async () => {
        // Load current API key
        const currentKey = await aiManager.getApiKey();
        if (currentKey) {
            apiKeyInput.value = currentKey;
        }
        settingsModal.classList.remove('hidden');
    };

    document.getElementById('cancel-settings-btn').onclick = () => {
        settingsModal.classList.add('hidden');
        apiKeyInput.value = '';
    };

    document.getElementById('save-settings-btn').onclick = async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            await aiManager.setApiKey(apiKey);
            showToast('\u2713 API key saved successfully');
            settingsModal.classList.add('hidden');
            apiKeyInput.value = '';
        } else {
            showToast('Please enter a valid API key');
        }
    };

    // AI Extraction Modal Logic
    const extractionModal = document.getElementById('ai-extraction-modal');
    const extractionOriginalText = document.getElementById('extraction-original-text');
    const extractionLoading = document.getElementById('extraction-loading');
    const extractionFieldsSection = document.getElementById('extraction-fields-section');
    const extractionFieldsContainer = document.getElementById('extraction-fields-container');

    // Delegate event listener for AI extract buttons
    document.getElementById('items-container').addEventListener('click', async (e) => {
        if (e.target.classList.contains('ai-extract-btn') || e.target.closest('.ai-extract-btn')) {
            const btn = e.target.classList.contains('ai-extract-btn') ? e.target : e.target.closest('.ai-extract-btn');
            const itemIndex = parseInt(btn.dataset.itemIndex);

            const collection = await storage.getCollection(currentCollectionId);
            const item = collection.items[itemIndex];

            await showExtractionModal(item, itemIndex);
        }
    });

    async function showExtractionModal(item, itemIndex) {
        currentExtractionItem = { item, itemIndex };

        // Show modal
        extractionModal.classList.remove('hidden');

        // Display original text
        extractionOriginalText.textContent = item.data.content;

        // Show loading
        extractionLoading.style.display = 'block';
        extractionFieldsSection.style.display = 'none';

        try {
            // Call AI to extract data
            const extractedData = await aiManager.extractStructuredData(item.data.content);

            // Hide loading
            extractionLoading.style.display = 'none';
            extractionFieldsSection.style.display = 'block';

            // Build editable form
            extractionFieldsContainer.innerHTML = '';
            Object.entries(extractedData).forEach(([key, value]) => {
                const row = document.createElement('div');
                row.className = 'extraction-field-row';

                // Check if this field should be displayed as a list
                const listFields = ['key_points', 'key_findings', 'action_items', 'decisions', 'topics', 'attendees', 'desired_solution', 'key_concepts', 'definitions'];
                const isListField = listFields.includes(key);

                // If value is an array, format as bullet points
                let displayValue = value;
                if (Array.isArray(value)) {
                    displayValue = value.join('\n• ');
                    if (displayValue) displayValue = '• ' + displayValue;
                } else if (isListField && typeof value === 'string' && value.length > 100) {
                    // If it's a list field but came as a long string, try to split it intelligently
                    // Split on periods followed by spaces, or semicolons, or newlines
                    const points = value.split(/\.\s+(?=[A-Z])|;\s*|\n/).filter(p => p.trim().length > 0);
                    if (points.length > 1) {
                        displayValue = '• ' + points.map(p => p.trim().replace(/^[•\-\*]\s*/, '')).join('\n• ');
                    }
                }

                row.innerHTML = `
                    <label>${key.replace(/_/g, ' ')}</label>
                    ${isListField || displayValue.includes('\n') ?
                        `<textarea rows="4" data-field-name="${key}" style="flex: 1; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 13px; font-family: inherit; resize: vertical;">${displayValue}</textarea>` :
                        `<input type="text" value="${displayValue}" data-field-name="${key}">`
                    }
                `;
                extractionFieldsContainer.appendChild(row);
            });

        } catch (error) {
            console.error('AI Extraction error:', error);
            extractionModal.classList.add('hidden');
            showToast(aiManager.getErrorMessage(error), 4000);
        }
    }

    document.getElementById('cancel-extraction-btn').onclick = () => {
        extractionModal.classList.add('hidden');
        currentExtractionItem = null;
    };

    document.getElementById('apply-extraction-btn').onclick = async () => {
        if (!currentExtractionItem) return;

        const { item, itemIndex } = currentExtractionItem;

        // Gather edited fields
        const inputs = extractionFieldsContainer.querySelectorAll('input, textarea');
        const extractedFields = {};
        inputs.forEach(input => {
            const fieldName = input.dataset.fieldName;
            const value = input.value.trim();
            if (value) {
                extractedFields[fieldName] = value;
            }
        });

        // Update item
        const collection = await storage.getCollection(currentCollectionId);
        const updatedItem = collection.items[itemIndex];

        // Store original text - CRITICAL FIX: Ensure we don't lose the original content
        const originalText = updatedItem.data.content || updatedItem.data.raw_text || '';

        // Replace data with extracted fields but KEEP original text
        updatedItem.data = {
            ...extractedFields,
            raw_text: originalText,
            // If we have a title in extracted fields, great. If not, maybe keep original content as fallback for display?
            // But for 'structured' type, we usually rely on specific fields.
            // Let's ensure 'content' is also there if needed for backward compatibility, 
            // but 'raw_text' is the main one for "Original Text" view.
            content: extractedFields.title || extractedFields.name || originalText.substring(0, 100) // Fallback for list view
        };

        // Update type and flag
        updatedItem.type = 'structured';
        updatedItem.ai_extracted = true;

        // Save to storage
        await storage.saveCollection(collection);

        // Close modal and refresh
        extractionModal.classList.add('hidden');
        currentExtractionItem = null;

        showToast('\u2713 Structure extracted successfully');

        // Refresh items view
        await selectCollection(currentCollectionId);
    };
}



async function getCurrentItems() {
    if (currentCollectionId) {
        const collection = await storage.getCollection(currentCollectionId);
        return collection.items;
    } else {
        const collections = await storage.getCollections();
        let allItems = [];
        collections.forEach(c => {
            c.items.forEach(item => {
                allItems.push({ ...item, collectionId: c.id });
            });
        });
        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return allItems.slice(0, 20);
    }
}
