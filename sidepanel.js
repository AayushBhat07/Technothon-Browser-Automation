import { storage } from './modules/storage.js';
import { ExportManager } from './modules/export.js';
import { EnrichmentManager } from './modules/enrichment.js';
import { ValidationManager } from './modules/validation.js';
import { MappingManager } from './modules/mapping.js';
import { TemplateManager } from './modules/templates.js';
import { aiManager } from './modules/ai.js';

let currentCollectionId = null;
let currentExtractionItem = null;

// Helper to wait for AuthManager to be available
async function waitForAuthManager(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        if (window.AuthManager) {
            console.log('AuthManager found:', window.AuthManager);
            console.log('AuthManager type:', typeof window.AuthManager);
            console.log('AuthManager.init type:', typeof window.AuthManager.init);
            if (typeof window.AuthManager.init === 'function') {
                return true;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Storage
    await storage.open();

    // Initialize Auth (Global from auth.js) - wait for it to be available
    const authAvailable = await waitForAuthManager();
    if (authAvailable) {
        try {
            await window.AuthManager.init();
            // Subscribe to Auth Changes
            window.AuthManager.subscribe(updateUserProfileUI);
        } catch (error) {
            console.error('AuthManager initialization failed:', error);
        }
    } else {
        console.warn('AuthManager not available after waiting');
    }

    // Load initial data
    await loadCollections();
    await updateDashboardStats();
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
        userAvatar.src = user.picture;
        userName.textContent = user.name;
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
    const list = document.getElementById('collections-list');
    list.innerHTML = '';

    collections.forEach(c => {
        const li = document.createElement('li');
        li.className = `collection-item ${c.id === currentCollectionId ? 'active' : ''}`;
        li.innerHTML = `
      <span class="collection-name">${c.name}</span>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="collection-count">${c.items.length}</span>
        <button class="collection-export-btn" data-collection-id="${c.id}" title="Export CSV" onclick="event.stopPropagation();">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
      </div>
    `;
        li.onclick = () => selectCollection(c.id);
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
    if (!currentCollectionId && collections.length > 0) {
        selectCollection(collections[0].id);
    }
}

async function selectCollection(id) {
    currentCollectionId = id;

    // Update UI active state
    document.querySelectorAll('.collection-item').forEach(el => el.classList.remove('active'));
    // Re-render list to update active class (simple way)
    await loadCollections();

    const collection = await storage.getCollection(id);
    renderItems(collection.items);

    // Enable template button if items exist
    const templateBtn = document.getElementById('template-btn');
    const hasItems = collection.items.length > 0;
    templateBtn.disabled = !hasItems;

    // Update dashboard stats
    await updateDashboardStats();
}

function renderItems(items) {
    const container = document.getElementById('items-container');

    // Keep the table header, clear only rows
    const existingRows = container.querySelectorAll('.table-row, .empty-state');
    existingRows.forEach(row => row.remove());

    if (items.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<p>No items in this collection</p>';
        container.appendChild(emptyState);
        return;
    }

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'table-row';
        row.dataset.index = index;

        const validation = ValidationManager.validateItem(item);
        const displayTitle = item.data.title || item.data.name || item.data.content || item.data.raw_text || 'Untitled Item';

        // Truncate title if too long
        const truncatedTitle = displayTitle.length > 40 ? displayTitle.substring(0, 40) + '...' : displayTitle;

        // Extract domain from URL
        let sourceDomain = 'Unknown';
        try {
            const url = new URL(item.source.url);
            sourceDomain = url.hostname.replace('www.', '');
        } catch (e) {
            sourceDomain = item.source.title || 'Unknown';
        }

        // Determine Label
        const label = item.label || 'Unlabeled';
        const labelClass = item.label ? `label-${item.label.toLowerCase().replace(/\s+/g, '')}` : '';

        // Determine Tags
        let tagsHtml = '';
        if (item.ai_extracted) {
            tagsHtml += '<span class="tag-pill purple">AI Extracted</span>';
        }
        if (item.type === 'structured') {
            tagsHtml += '<span class="tag-pill blue">Structured</span>';
        } else {
            tagsHtml += '<span class="tag-pill gray">Text</span>';
        }
        // Add domain as tag
        tagsHtml += `<span class="tag-pill gray">${sourceDomain.split('.')[0]}</span>`;

        // Format date
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateStr = `${formattedDate}, ${formattedTime}`;

        // Row click handling is now managed via event delegation in setupEventListeners


        row.innerHTML = `
            <div class="col-checkbox"><input type="checkbox" class="item-checkbox" data-id="${item.id}"></div>
            <div class="col-title">${item.data.title || item.data.name || item.data.content || item.data.raw_text || 'Untitled'}</div>
            <div class="col-status"><span class="status-badge ${labelClass}">${label}</span></div>
            <div class="col-tags">${tagsHtml}</div>
            <div class="col-date">${dateStr}</div>
            <div class="col-actions" style="position: relative;">
                <button class="action-btn view-btn" title="View Details">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="action-btn more-btn" data-index="${index}" title="More Actions">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                        <circle cx="5" cy="12" r="1"></circle>
                    </svg>
                </button>
                
                <!-- Dropdown Menu -->
                <div class="dropdown-menu" id="dropdown-${index}">
                    <div style="padding: 4px 12px; font-size: 11px; font-weight: 600; color: #9CA3AF; text-transform: uppercase;">Set Label</div>
                    <div class="dropdown-item label-btn" data-index="${index}" data-label="Work">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #1E40AF; display: inline-block;"></span>
                        Work
                    </div>
                    <div class="dropdown-item label-btn" data-index="${index}" data-label="Personal">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #6B21A8; display: inline-block;"></span>
                        Personal
                    </div>
                    <div class="dropdown-item label-btn" data-index="${index}" data-label="Important">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #991B1B; display: inline-block;"></span>
                        Important
                    </div>
                    <div class="dropdown-item label-btn" data-index="${index}" data-label="To Read">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #92400E; display: inline-block;"></span>
                        To Read
                    </div>
                    <div style="height: 1px; background: #E5E7EB; margin: 4px 0;"></div>
                    <div class="dropdown-item ai-extract-btn" data-item-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275z"/>
                        </svg>
                        Extract Structure
                    </div>
                    <div class="dropdown-item delete delete-btn" data-index="${index}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete
                    </div>
                </div>
            </div>
        `;

        container.appendChild(row);
    });

    // Event listeners are now handled by delegation in setupEventListeners
}

async function showItemDetail(item) {
    const modal = document.getElementById('item-detail-modal');
    const detailBody = document.getElementById('detail-body');

    // Get the item's index for AI extraction
    const collection = await storage.getCollection(currentCollectionId);
    const itemIndex = collection.items.findIndex(i => i.timestamp === item.timestamp && i.source.url === item.source.url);

    // Build AI extracted data section
    let aiExtractedSection = '';
    if (item.ai_extracted && item.type === 'structured') {
        const listFields = ['key_points', 'key_findings', 'action_items', 'decisions', 'topics', 'attendees', 'desired_solution', 'key_concepts', 'definitions'];

        aiExtractedSection = `
      <div class="detail-section">
        <h4>AI Extracted Fields</h4>
        <div class="detail-content" style="background: #faf5ff;">
          ${Object.entries(item.data).filter(([key]) => key !== 'raw_text' && key !== 'content').map(([key, value]) => {
            let displayValue = value;

            // Format arrays and list fields as bullet points
            if (Array.isArray(value)) {
                displayValue = '<ul style="margin: 4px 0; padding-left: 20px;">' +
                    value.map(v => `<li>${v}</li>`).join('') + '</ul>';
            } else if (listFields.includes(key) && typeof value === 'string' && value.includes('•')) {
                // If it contains bullets, convert to HTML list
                const points = value.split('•').filter(p => p.trim().length > 0);
                displayValue = '<ul style="margin: 4px 0; padding-left: 20px;">' +
                    points.map(p => `<li>${p.trim()}</li>`).join('') + '</ul>';
            } else if (listFields.includes(key) && typeof value === 'string' && value.length > 100) {
                // Long string in a list field - try to split and bulletize
                const points = value.split(/\.\s+(?=[A-Z])|;\s*|\n/).filter(p => p.trim().length > 10);
                if (points.length > 1) {
                    displayValue = '<ul style="margin: 4px 0; padding-left: 20px;">' +
                        points.map(p => `<li>${p.trim()}</li>`).join('') + '</ul>';
                }
            }

            return `<div style="margin-bottom: 12px;">
                <strong style="color: #7c3aed;">${key.replace(/_/g, ' ')}:</strong> 
                ${displayValue}
            </div>`;
        }).join('')}
        </div>
      </div>
    `;
    }

    // Show original text if available
    let originalTextSection = '';
    if (item.data.raw_text) {
        originalTextSection = `
      <div class="detail-section">
        <h4>Original Text</h4>
        <div class="detail-content" style="background: #f1f5f9; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word;">
          ${item.data.raw_text}
        </div>
      </div>
    `;
    }



    // Build validation section
    const validation = ValidationManager.validateItem(item);
    let validationSection = '';
    if (validation.status !== 'valid') {
        validationSection = `
      <div class="detail-section">
        <h4>Validation Issues</h4>
        <div class="detail-content" style="background: ${validation.status === 'error' ? '#fef2f2' : '#fffbeb'};">
          ${validation.issues.map(issue => `<div>⚠️ ${issue}</div>`).join('')}
        </div>
      </div>
    `;
    }

    // Optional AI extraction button for non-extracted items
    let aiExtractionButton = '';
    if (!item.ai_extracted && item.data.content && item.data.content.split(/\s+/).length > 50) {
        aiExtractionButton = `
      <button id="extract-ai-btn" data-item-index="${itemIndex}" style="
        margin-top: 16px;
        padding: 10px 16px;
        border: 1px solid #c084fc;
        background: #faf5ff;
        color: #7c3aed;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.15s;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
          <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275z"/>
        </svg>
        Extract Structure with AI (Optional)
      </button>
    `;
    }

    detailBody.innerHTML = `
    ${aiExtractedSection}
    
    ${originalTextSection}
    
    ${!item.ai_extracted ? `
    <div class="detail-section">
      <h4>Content</h4>
      <div class="detail-content" style="max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word;">${item.data.content || 'No content'}</div>
      ${aiExtractionButton}
    </div>
    ` : ''}
    
    <div class="detail-section">
      <h4>Source</h4>
      <div class="detail-meta">
        <div class="detail-meta-item">
          <strong>Page Title</strong>
          ${item.source.title}
        </div>
        <div class="detail-meta-item">
          <strong>URL</strong>
          <a href="${item.source.url}" target="_blank" style="color: #2563eb; text-decoration: none;">${item.source.url}</a>
        </div>
        <div class="detail-meta-item">
          <strong>Saved On</strong>
          ${new Date(item.source.timestamp).toLocaleString()}
        </div>
        <div class="detail-meta-item">
          <strong>Type</strong>
          ${item.type}
        </div>
      </div>
    </div>
    
    ${validationSection}
  `;

    modal.classList.remove('hidden');

    document.getElementById('close-detail-btn').onclick = () => {
        modal.classList.add('hidden');
    };

    // Handle AI extraction if button exists
    const extractBtn = document.getElementById('extract-ai-btn');
    if (extractBtn) {
        extractBtn.onmouseover = () => {
            extractBtn.style.background = '#f3e8ff';
            extractBtn.style.borderColor = '#a855f7';
        };
        extractBtn.onmouseout = () => {
            extractBtn.style.background = '#faf5ff';
            extractBtn.style.borderColor = '#c084fc';
        };
        extractBtn.onclick = async () => {
            modal.classList.add('hidden');
            await showExtractionModal(item, itemIndex);
        };
    }
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
                const dropdown = document.getElementById(`dropdown-${index}`);
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
                const dropdown = document.getElementById(`dropdown-${index}`);
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
                    if (menu.id !== `dropdown-${index}`) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown-${index}`);
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
                    if (menu.id !== `dropdown-${index}`) {
                        menu.classList.remove('visible');
                    }
                });

                // Toggle current
                const dropdown = document.getElementById(`dropdown-${index}`);
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
                // Title click
                index = parseInt(titleCol.closest('.table-row').dataset.index);
            }

            if (index !== -1 && !isNaN(index)) {
                const collection = await storage.getCollection(currentCollectionId);
                if (collection && collection.items[index]) {
                    const item = collection.items[index];
                    // Navigate to item-view.html for full editing capabilities
                    window.location.href = `item-view.html?collectionId=${currentCollectionId}&id=${item.id}`;
                }
            }
        });
    }

    // Auth Event Listeners
    const loggedOutBtn = document.getElementById('user-logged-out');
    if (loggedOutBtn && window.AuthManager) {
        loggedOutBtn.addEventListener('click', async () => {
            console.log('Sign in clicked');
            try {
                await window.AuthManager.login();
                showToast('Signed in successfully!');
            } catch (error) {
                console.error('Login failed', error);
                showToast('Sign in failed: ' + (error.message || 'Unknown error'));
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && window.AuthManager) {
        logoutBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await window.AuthManager.logout();
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

            row.innerHTML = `<span style="font-weight:500">${target}</span>`;
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

            // Create a temporary collection object for export
            const exportCollection = {
                name: collection.name,
                items: mappedItems.map(item => ({
                    data: item, // Hack to fit existing export structure
                    type: 'mapped',
                    source: {},
                    timestamp: new Date().toISOString()
                }))
            };

            // Override export to handle mapped items specially
            exportMappedCSV(exportCollection);
            mappingModal.classList.add('hidden');
        };
    }

    function exportMappedCSV(collection) {
        const items = collection.items.map(i => i.data);
        if (items.length === 0) return;

        const headers = Object.keys(items[0]);
        const csvContent = [
            headers.join(','),
            ...items.map(item => headers.map(h => `"${(item[h] || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${collection.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

