import { storage } from './modules/storage.js';
import { ExportManager } from './modules/export.js';
import { EnrichmentManager } from './modules/enrichment.js';
import { ValidationManager } from './modules/validation.js';
import { MappingManager } from './modules/mapping.js';
import { TemplateManager } from './modules/templates.js';
import { aiManager } from './modules/ai.js';

// Auth disabled: module not present
let currentCollectionId = null;
let currentExtractionItem = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Storage
    await storage.open();

    // Force Minimalist Theme for redesign
    localStorage.setItem('sidepanel-theme', 'theme-minimalist');
    const savedTheme = 'theme-minimalist';
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



// Update dashboard statistics
async function updateDashboardStats() {
    const collections = await storage.getCollections();

    // Total items across all collections
    const totalItems = collections.reduce((sum, c) => sum + c.items.length, 0);
    document.getElementById('total-items').textContent = totalItems;

    // AI Extracted block removed per Minimalist redesign

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

    // Enable template button if items exist (deprecated UI button removed)
    // Legacy support logic removed

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
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        // Minimalist SaaS Specific Styling Logic
        let styleClass = '';
        let statusText = 'Completed';
        if (label === 'Work' || label === 'Important' || index % 3 === 0) {
            styleClass = 'background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block;';
            statusText = 'Active';
        } else {
            styleClass = 'background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; display: inline-block;';
            statusText = 'Completed';
        }

        // Make progress bar
        const progressPercent = item.ai_extracted ? '100%' : '50%';
        const progressBg = item.ai_extracted ? '#2563eb' : '#3b82f6';

        // Author
        const authorImg = `https://ui-avatars.com/api/?name=${encodeURIComponent(sourceDomain)}&background=random&color=fff&size=24`;
        const authorName = sourceDomain.substring(0, 10);

        row.style.cssText = "display: grid; grid-template-columns: 32px minmax(100px, 2fr) auto auto minmax(80px, 1fr) auto auto auto; align-items: center; gap: 12px;";

        row.innerHTML = `
            <div class="col-checkbox"><input type="checkbox" class="item-checkbox" data-id="${item.id}" onclick="event.stopPropagation()"></div>
            <div class="col-title" style="font-weight: 500; color: #1e293b; display: flex; align-items: center; gap: 8px; overflow: hidden;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="flex-shrink: 0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${truncatedTitle}</span>
            </div>
            <div class="col-status"><span style="${styleClass}">${statusText}</span></div>
            <div class="col-responses" style="font-size: 12px; color: #64748b; font-weight: 500; white-space: nowrap;">12,455 / 15,000</div>
            <div class="col-progress" style="display: flex; align-items: center;">
                <div style="flex: 1; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;"><div style="width: ${progressPercent}; height: 100%; background: ${progressBg}; border-radius: 2px;"></div></div>
            </div>
            <div class="col-author" style="display: flex; align-items: center; gap: 6px;">
                <img src="${authorImg}" style="width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;">
                <span style="font-size: 12px; color: #4b5563; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">${authorName}</span>
            </div>
            <div class="col-date" style="font-size: 11px; color: #64748b; white-space: nowrap;">${dateStr}</div>
            <div class="col-actions" style="display: flex; gap: 2px; align-items: center; position: relative;">
                <button class="action-btn edit-btn" title="Edit" style="padding: 4px; background: none; border: none; cursor: pointer; color: #94a3b8;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="action-btn export-btn" title="Export" data-index="${index}" style="padding: 4px; background: none; border: none; cursor: pointer; color: #94a3b8;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
                <button class="action-btn more-btn" title="More" data-index="${index}" style="padding: 4px; background: none; border: none; cursor: pointer; color: #94a3b8;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg></button>
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
        // Close export dropdowns when clicking outside
        if (!e.target.closest('.action-btn.export-btn') && !e.target.closest('#export-collection-global-btn') && !e.target.closest('.export-dropdown')) {
            document.querySelectorAll('.export-dropdown').forEach(d => d.remove());
        }
    });

    // Global Export Collection Button
    const globalExportBtn = document.getElementById('export-collection-global-btn');
    if (globalExportBtn) {
        globalExportBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            document.querySelectorAll('.export-dropdown').forEach(d => d.remove());

            if (!currentCollectionId) {
                showToast('No collection selected');
                return;
            }

            const collection = await storage.getCollection(currentCollectionId);
            if (!collection || !collection.items || collection.items.length === 0) {
                showToast('Collection is empty');
                return;
            }

            const dropdown = document.createElement('div');
            dropdown.className = 'export-dropdown';
            dropdown.style.cssText = `
                position: absolute; top: 100%; right: 0; z-index: 999; margin-top: 8px;
                background: white; border: 1px solid #e2e8f0; border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.12); padding: 6px; min-width: 150px;
                animation: fadeIn 0.15s ease;
            `;
            dropdown.innerHTML = `
                <button class="export-option" data-format="pdf" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Export PDF
                </button>
                <button class="export-option" data-format="csv" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                    Export CSV
                </button>
                <button class="export-option" data-format="txt" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    Export TXT
                </button>
            `;

            // Add hover effect
            dropdown.querySelectorAll('.export-option').forEach(opt => {
                opt.onmouseover = () => opt.style.background = '#f1f5f9';
                opt.onmouseout = () => opt.style.background = 'none';
            });

            // Handle option clicks
            dropdown.addEventListener('click', (ev) => {
                const option = ev.target.closest('.export-option');
                if (!option) return;
                ev.stopPropagation();
                const format = option.dataset.format;

                if (format === 'pdf') {
                    ExportManager.exportToPDF(collection);
                    showToast('📄 Opening PDF export...');
                } else if (format === 'csv') {
                    ExportManager.exportToCSV(collection);
                    showToast('✅ CSV exported!');
                } else if (format === 'txt') {
                    ExportManager.exportToTXT(collection);
                    showToast('📝 TXT exported!');
                }

                dropdown.remove();
            });

            document.getElementById('global-export-wrapper').appendChild(dropdown);
        });
    }

    // Delegate row export button clicks

    document.getElementById('items-container').addEventListener('click', async (e) => {
        const exportBtn = e.target.closest('.export-btn');
        if (!exportBtn) return;
        e.stopPropagation();

        // Remove any existing dropdown
        document.querySelectorAll('.export-dropdown').forEach(d => d.remove());

        const index = parseInt(exportBtn.dataset.index);
        const items = await getCurrentItems();
        const item = items[index];
        if (!item) return;

        // Find the parent collection
        const collectionId = item.collectionId || currentCollectionId;
        const collection = await storage.getCollection(collectionId);
        if (!collection) { showToast('Collection not found'); return; }

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'export-dropdown';
        dropdown.style.cssText = `
            position: absolute; top: 100%; right: 0; z-index: 999;
            background: white; border: 1px solid #e2e8f0; border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.12); padding: 6px; min-width: 150px;
            animation: fadeIn 0.15s ease;
        `;
        dropdown.innerHTML = `
            <button class="export-option" data-format="pdf" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Export PDF
            </button>
            <button class="export-option" data-format="csv" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                Export CSV
            </button>
            <button class="export-option" data-format="txt" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: #1e293b; text-align: left;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                Export TXT
            </button>
        `;

        // Add hover effect
        dropdown.querySelectorAll('.export-option').forEach(opt => {
            opt.onmouseover = () => opt.style.background = '#f1f5f9';
            opt.onmouseout = () => opt.style.background = 'none';
        });

        // Handle option clicks
        dropdown.addEventListener('click', (ev) => {
            const option = ev.target.closest('.export-option');
            if (!option) return;
            ev.stopPropagation();
            const format = option.dataset.format;

            if (format === 'pdf') {
                ExportManager.exportToPDF(collection);
                showToast('📄 Opening PDF export...');
            } else if (format === 'csv') {
                ExportManager.exportToCSV(collection);
                showToast('✅ CSV exported!');
            } else if (format === 'txt') {
                ExportManager.exportToTXT(collection);
                showToast('📝 TXT exported!');
            }

            dropdown.remove();
        });

        exportBtn.closest('.col-actions').appendChild(dropdown);
    });

    const versionModal = document.getElementById('version-control-modal');
    const versionBtn = document.getElementById('version-control-btn');
    const closeVersionsBtn = document.getElementById('close-versions-btn');

    // Removed snapshot buttons since they are no longer in UI

    if (versionBtn) {
        versionBtn.onclick = async () => {
            await loadVersions();
            if (versionModal) versionModal.classList.remove('hidden');
        };
    }

    if (closeVersionsBtn && versionModal) {
        closeVersionsBtn.onclick = () => versionModal.classList.add('hidden');
    }

    async function loadVersions() {
        const collections = await storage.getCollections();
        const container = document.getElementById('versions-container');
        if (!container) return;

        if (collections.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">No activity logged yet.</div>';
            return;
        }

        // Gather all collections and sort by recently edited (using last item timestamp or collection creation)
        const collectionLogs = collections.map(c => {
            let lastEdited = 0;
            if (c.items.length > 0) {
                lastEdited = Math.max(...c.items.map(i => new Date(i.timestamp || 0).getTime()));
            } else {
                lastEdited = Date.now(); // Fallback if no items but collection exists
            }
            return {
                id: c.id,
                name: c.name,
                itemCount: c.items.length,
                lastEdited
            };
        }).sort((a, b) => b.lastEdited - a.lastEdited);

        container.innerHTML = '';
        collectionLogs.forEach((log) => {
            const div = document.createElement('div');
            div.style.padding = '12px 16px';
            div.style.borderBottom = '1px solid #e2e8f0';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.cursor = 'pointer';

            div.onmouseover = () => div.style.background = '#f8fafc';
            div.onmouseout = () => div.style.background = 'transparent';

            const dateStr = new Date(log.lastEdited).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            div.innerHTML = `
                <div style="flex: 1; overflow: hidden; margin-right: 12px;">
                    <div style="font-weight: 600; font-size: 14px; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${log.name}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 4px; display: flex; gap: 12px;">
                        <span>Edited: ${dateStr}</span>
                        <span>Items: ${log.itemCount}</span>
                    </div>
                </div>
                <div style="color: #2563eb; font-size: 13px; font-weight: 500;">
                    Open &rarr;
                </div>
            `;

            div.onclick = async () => {
                const versionModal = document.getElementById('version-control-modal');
                if (versionModal) versionModal.classList.add('hidden');

                // Open the collection data
                const url = chrome.runtime.getURL(`collection-view.html?id=${log.id}`);
                chrome.tabs.create({ url });
            };

            container.appendChild(div);
        });
    }

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
                const dropdown = document.getElementById(`dropdown - ${index}`);
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
                const dropdown = document.getElementById(`dropdown - ${index}`);
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
                    if (menu.id !== `dropdown - ${index}`) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown - ${index}`);
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
                    if (menu.id !== `dropdown - ${index}`) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown - ${index}`);
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

    // Auth Event Listeners removed as module is missing


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

            row.innerHTML = `< span style = "font-weight:500" > ${target}</span > `;
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




    // Template Modal functionality removed from minimalist redesign

    // Settings Modal Logic
    const settingsModal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
    const openaiApiKeyInput = document.getElementById('openai-api-key-input');
    const claudeApiKeyInput = document.getElementById('claude-api-key-input');

    // Provider buttons
    const providerGeminiBtn = document.getElementById('provider-gemini-btn');
    const providerOpenaiBtn = document.getElementById('provider-openai-btn');
    const providerClaudeBtn = document.getElementById('provider-claude-btn');

    const providerDescription = document.getElementById('provider-description');

    // Key sections
    const geminiKeySection = document.getElementById('gemini-key-section');
    const openaiKeySection = document.getElementById('openai-key-section');
    const claudeKeySection = document.getElementById('claude-key-section');

    let selectedProvider = 'gemini';

    // Provider selection handlers
    function selectProvider(provider) {
        selectedProvider = provider;

        // Reset all buttons
        [providerGeminiBtn, providerOpenaiBtn, providerClaudeBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('active');
                btn.style.borderColor = '#e2e8f0';
                btn.style.background = 'white';
            }
        });

        // Hide all key sections
        [geminiKeySection, openaiKeySection, claudeKeySection].forEach(section => {
            if (section) section.classList.add('hidden');
        });

        // Update active button and show corresponding section
        if (provider === 'gemini') {
            providerGeminiBtn.classList.add('active');
            providerGeminiBtn.style.borderColor = '#4285f4';
            providerGeminiBtn.style.background = '#eff6ff';
            geminiKeySection.classList.remove('hidden');
            providerDescription.textContent = 'Gemini is fast and cost-effective for most tasks.';
        } else if (provider === 'openai') {
            providerOpenaiBtn.classList.add('active');
            providerOpenaiBtn.style.borderColor = '#10a37f';
            providerOpenaiBtn.style.background = '#f0fdf4';
            openaiKeySection.classList.remove('hidden');
            providerDescription.textContent = 'OpenAI GPT-4o provides industry-leading reasoning and instruction following.';
        } else if (provider === 'claude' || provider === 'anthropic') {
            providerClaudeBtn.classList.add('active');
            providerClaudeBtn.style.borderColor = '#d97757';
            providerClaudeBtn.style.background = '#fff7ed';
            claudeKeySection.classList.remove('hidden');
            providerDescription.textContent = 'Claude excels at large dataset formatting with strict accuracy guardrails.';
        }
    }

    if (providerGeminiBtn) providerGeminiBtn.onclick = () => selectProvider('gemini');
    if (providerOpenaiBtn) providerOpenaiBtn.onclick = () => selectProvider('openai');
    if (providerClaudeBtn) providerClaudeBtn.onclick = () => selectProvider('claude');

    settingsBtn.onclick = async () => {
        // Load current provider and API keys
        const activeProvider = await aiManager.getActiveProvider();
        selectProvider(activeProvider);

        const geminiKey = await aiManager.getProviderApiKey('gemini');
        const openaiKey = await aiManager.getProviderApiKey('openai');
        const claudeKey = await aiManager.getProviderApiKey('claude');

        if (geminiKey) geminiApiKeyInput.value = geminiKey;
        if (openaiKey) openaiApiKeyInput.value = openaiKey;
        if (claudeKey) claudeApiKeyInput.value = claudeKey;

        settingsModal.classList.remove('hidden');
    };

    document.getElementById('cancel-settings-btn').onclick = () => {
        settingsModal.classList.add('hidden');
    };

    document.getElementById('save-settings-btn').onclick = async () => {
        const geminiApiKey = geminiApiKeyInput.value.trim();
        const openaiApiKey = openaiApiKeyInput.value.trim();
        const claudeApiKey = claudeApiKeyInput.value.trim();

        // Save active provider
        await aiManager.setActiveProvider(selectedProvider);

        // Save API keys (always call to allow clearing)
        await aiManager.setProviderApiKey('gemini', geminiApiKey);
        await aiManager.setProviderApiKey('openai', openaiApiKey);
        await aiManager.setProviderApiKey('claude', claudeApiKey);

        showToast('\u2713 Settings saved successfully');
        settingsModal.classList.add('hidden');
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
                < label > ${key.replace(/_/g, ' ')}</label >
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

// === MAGIC BAR TOGGLE LOGIC ===
(function initMagicBarToggle() {
    const toggleBtn = document.getElementById('magic-bar-toggle-btn');
    const statusBadge = document.getElementById('magic-bar-status');

    if (!toggleBtn || !statusBadge) return;

    // Load saved preference
    chrome.storage.sync.get(['magic_bar_enabled'], (result) => {
        const isEnabled = result.magic_bar_enabled === true;
        updateToggleUI(isEnabled);
    });

    toggleBtn.addEventListener('click', async () => {
        // Get current state and toggle
        const result = await chrome.storage.sync.get(['magic_bar_enabled']);
        const newState = !result.magic_bar_enabled;

        await chrome.storage.sync.set({ magic_bar_enabled: newState });
        updateToggleUI(newState);

        // Send message to active tab to show/hide trigger
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'setMagicBarTriggerVisibility',
                    visible: newState
                }).catch(() => {
                    // Content script may not be loaded, that's OK
                });
            }
        });

        showToast(newState ? '✨ Magic Bar enabled on pages' : 'Magic Bar disabled');
    });

    function updateToggleUI(isEnabled) {
        if (isEnabled) {
            statusBadge.textContent = 'ON';
            statusBadge.classList.remove('off');
            statusBadge.classList.add('on');
        } else {
            statusBadge.textContent = 'OFF';
            statusBadge.classList.remove('on');
            statusBadge.classList.add('off');
        }
    }
})();
