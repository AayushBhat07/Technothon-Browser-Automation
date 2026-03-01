import { storage } from './modules/storage.js';
import { aiManager } from './modules/ai.js';
import { ExportManager } from './modules/export.js';
import { selectBestLinks, processLinksWithQueue, generateCombinedBrief } from './modules/deepEnrich.js';

let currentItem = null;
let currentCollection = null;
let lastChangeIntent = "Initial Save"; // Track the reason for the change (e.g. AI prompt)

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Storage
    await storage.open();

    // 2. Load Theme Preference
    const savedTheme = localStorage.getItem('notebook-theme') || 'theme-disco';
    document.body.className = savedTheme;
    document.getElementById('theme-select').value = savedTheme;

    // 3. Load Item Data
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');
    const collectionId = urlParams.get('collectionId');

    if (itemId && collectionId) {
        await loadItemData(collectionId, itemId);
    } else {
        // Fallback for testing/demo
        document.getElementById('item-title').textContent = "Demo Item";
        document.getElementById('item-content').innerHTML = "<p>No item selected. Go back to dashboard and click an item.</p>";
    }

    // 4. Setup Event Listeners
    setupEventListeners();
});

async function loadItemData(collectionId, itemId) {
    try {
        currentCollection = await storage.getCollection(collectionId);
        currentItem = currentCollection.items.find(i => i.id === itemId);

        if (currentItem) {
            // Populate UI
            document.getElementById('item-title').textContent = currentItem.title || 'Untitled';

            // Handle content (HTML, structured, or text)
            let contentHtml = '';

            // PRIORITY 1: Stored HTML (from our new persistence system)
            if (currentItem.data && currentItem.data.html) {
                contentHtml = currentItem.data.html;
            }
            // PRIORITY 2: Structured data (JSON)
            else if (currentItem.type === 'structured' && currentItem.data) {
                contentHtml = `<pre>${JSON.stringify(currentItem.data, null, 2)}</pre>`;
            }
            // PRIORITY 3: Legacy plain text
            else {
                const rawText = currentItem.data.text || currentItem.data.content || '';
                contentHtml = rawText
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => `<p>${line}</p>`)
                    .join('');
            }

            document.getElementById('item-content').innerHTML = contentHtml;

            // Metadata
            let domain = 'Unknown Source';
            try {
                if (currentItem.source_url) {
                    domain = new URL(currentItem.source_url).hostname.replace('www.', '');
                } else if (typeof currentItem.source === 'string') {
                    domain = currentItem.source;
                }
            } catch (e) {
                console.warn('Error parsing domain:', e);
            }

            document.getElementById('source-domain').textContent = domain;

            if (currentItem.source_url) {
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(currentItem.source_url).hostname}&sz=32`;
                const favIcon = document.getElementById('source-favicon');
                favIcon.src = faviconUrl;
                favIcon.style.display = 'inline-block';
            }

            document.getElementById('item-date').textContent = new Date(currentItem.timestamp).toLocaleDateString();

            // Breadcrumb
            document.querySelector('.collection-name').textContent = currentCollection.name;
            document.querySelector('.item-title-crumb').textContent = currentItem.title || 'Untitled';

            // Initialize History UI
            renderHistory();

            // Initialize Deep Enrich UI
            initDeepEnrich();
        }
    } catch (error) {
        console.error('Error loading item:', error);
    }
}

function setupEventListeners() {
    // Theme Switcher
    document.getElementById('theme-select').addEventListener('change', (e) => {
        const newTheme = e.target.value;
        document.body.className = newTheme;
        localStorage.setItem('notebook-theme', newTheme);
    });

    // Back Button
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = 'sidepanel.html';
    });

    // Close export dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#export-item-btn') && !e.target.closest('.export-dropdown')) {
            document.querySelectorAll('.export-dropdown').forEach(d => d.remove());
        }
    });

    // Item Export Button
    const itemExportBtn = document.getElementById('export-item-btn');
    if (itemExportBtn) {
        itemExportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.export-dropdown').forEach(d => d.remove());

            if (!currentItem || !currentCollection) {
                alert('No item loaded');
                return;
            }

            // Create a pseudo-collection for this single item
            const singleItemCollection = {
                name: `${currentCollection.name} - ${currentItem.title || 'Item'}`,
                items: [currentItem]
            };

            const dropdown = document.createElement('div');
            dropdown.className = 'export-dropdown';
            dropdown.style.cssText = `
                position: absolute; top: 100%; right: 0; z-index: 999; margin-top: 8px;
                background: white; border: 1px solid var(--glass-border); border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.12); padding: 6px; min-width: 150px;
                animation: fadeIn 0.15s ease;
            `;
            dropdown.innerHTML = `
                <button class="export-option" data-format="pdf" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--text-primary); text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Export PDF
                </button>
                <button class="export-option" data-format="csv" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--text-primary); text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                    Export CSV
                </button>
                <button class="export-option" data-format="txt" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--text-primary); text-align: left;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    Export TXT
                </button>
            `;

            // Add hover effect
            dropdown.querySelectorAll('.export-option').forEach(opt => {
                opt.onmouseover = () => opt.style.background = 'rgba(108, 71, 255, 0.05)';
                opt.onmouseout = () => opt.style.background = 'none';
            });

            // Handle option clicks
            dropdown.addEventListener('click', (ev) => {
                const option = ev.target.closest('.export-option');
                if (!option) return;
                ev.stopPropagation();
                const format = option.dataset.format;

                if (format === 'pdf') {
                    ExportManager.exportToPDF(singleItemCollection);
                } else if (format === 'csv') {
                    ExportManager.exportToCSV(singleItemCollection);
                } else if (format === 'txt') {
                    ExportManager.exportToTXT(singleItemCollection);
                }

                dropdown.remove();
            });

            document.getElementById('item-export-wrapper').appendChild(dropdown);
        });
    }

    // Close Button (Optional if exists)
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.location.href = 'sidepanel.html';
        });
    }

    // AI Summarize
    const summarizeBtns = document.querySelectorAll('#btn-summarize, #ninja-btn-summarize');
    summarizeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const content = document.getElementById('item-content').innerText;
            addChatMessage('user', 'Summarize this for me.');

            // Switch to AI tab if in History
            switchToTab('ai');

            addChatMessage('ai', 'Generating summary...');

            try {
                const prompt = `Provide a comprehensive, medium-length summary of the following text.\n\nRequirements: \n - Use bullet points for key concepts.\n - Bold important terms.\n - Ensure there is a blank line between each bullet point for better readability.\n - Do not be too brief; explain the context.\n\nText: \n${content} `;
                const response = await aiManager.callAI(prompt);
                addChatMessage('ai', response);
            } catch (error) {
                addChatMessage('ai', aiManager.getErrorMessage(error));
            }
        });
    });

    // Deep Enrich
    const btnEnrichAll = document.getElementById('btn-deep-enrich-all');
    if (btnEnrichAll) {
        btnEnrichAll.addEventListener('click', handleDeepEnrichAll);
    }

    const btnSaveEnrichment = document.getElementById('btn-save-enrichment');
    if (btnSaveEnrichment) {
        btnSaveEnrichment.addEventListener('click', handleSaveEnrichment);
    }

    // Tab Switcher
    document.getElementById('tab-ai').addEventListener('click', () => switchToTab('ai'));
    const tabInsights = document.getElementById('tab-insights');
    if (tabInsights) {
        tabInsights.addEventListener('click', () => {
            switchToTab('insights');
            renderInsights();
        });
    }
    document.getElementById('tab-history').addEventListener('click', () => {
        switchToTab('history');
        renderHistory();
    });

    // ... (rest of code)
}

async function renderInsights() {
    const container = document.getElementById('insights-content');
    container.innerHTML = '<div class="loading-state">Loading intelligence...</div>';

    if (!currentItem || (!currentItem.source || !currentItem.source.auditId)) {
        container.innerHTML = `
                < div class="empty-state" >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="color: var(--text-tertiary); margin-bottom: 12px;">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>No trace of AI origin found.</p>
                <span class="sub-text">This item might have been added manually or before audit logging was enabled.</span>
            </div >
                `;
        return;
    }

    try {
        // Fetch audits to find the matching one
        // Note: In a production app, we'd use getAudit(id), but here we scan the list
        const audits = await storage.getAudits();
        const audit = audits.find(a => a.id === currentItem.source.auditId);

        if (!audit) {
            container.innerHTML = `
                < div class="empty-state" >
                    <p>Audit record not found.</p>
                    <span class="sub-text">ID: ${currentItem.source.auditId}</span>
                </div >
                `;
            return;
        }

        // Render the Intelligence Card
        const date = new Date(audit.timestamp).toLocaleString();
        const vr = audit.verificationResult || {}; // Verification Report
        const statusClass = vr.verificationStatus === 'VERIFIED' ? 'status-verified' : (vr.verificationStatus === 'PARTIALLY_VERIFIED' ? 'status-partial' : 'status-review');

        // Flagged Fields HTML
        let flaggedHtml = '';
        if (vr.flaggedFields && vr.flaggedFields.length > 0) {
            flaggedHtml = `
                < div class="insight-section flagged-section" >
                    <label>⚠️ Flagged Fields</label>
                    <ul class="flagged-list">
                        ${vr.flaggedFields.map(f => `<li><strong>${f.field}:</strong> ${f.reason} ${f.value ? `(Value: "${String(f.value).substring(0, 50)}...")` : ''}</li>`).join('')}
                    </ul>
                </div >
                `;
        }

        container.innerHTML = `
                < div class="insight-card" >
                <div class="insight-section">
                    <label>Extraction Reasoning</label>
                    <p class="reasoning-text">"${audit.reasoning || audit.responseSummary || 'Data extracted based on user prompt.'}"</p>
                </div>

                <div class="insight-section verification-section">
                    <label>Pipeline Verification (Pass 2)</label>
                    <div class="verification-box">
                        <span class="status-badge ${statusClass}">
                            ${vr.verificationStatus === 'VERIFIED' ?
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' :
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            }
                            ${vr.verificationStatus || audit.verificationStatus || 'UNKNOWN'}
                        </span>
                        <p class="verification-notes">${vr.verificationNotes || 'No additional notes.'}</p>
                    </div>
                </div>

                ${flaggedHtml}

                <div class="insight-grid">
                    <div class="insight-item">
                        <label>AI Provider</label>
                        <span style="font-weight: 500;">${vr.providerName || 'Gemini'}</span>
                    </div>
                    <div class="insight-item">
                        <label>Model Used</label>
                        <span class="mono-text">${vr.modelName || (vr.providerName === 'OpenAI' ? 'gpt-4o' : 'gemini-2.0-flash')}</span>
                    </div>
                    <div class="insight-item">
                        <label>Tokens Used</label>
                        <span>${vr.tokensUsed ? vr.tokensUsed.toLocaleString() : 'N/A'}</span>
                    </div>
                    <div class="insight-item">
                        <label>Extraction Date</label>
                        <span>${date}</span>
                    </div>
                    <div class="insight-item">
                        <label>Source</label>
                        <div class="source-link">
                            <img src="https://www.google.com/s2/favicons?domain=${new URL(audit.sourceUrl).hostname}&sz=16" alt="">
                            <a href="${audit.sourceUrl}" target="_blank" title="${audit.sourceTitle}">${new URL(audit.sourceUrl).hostname}</a>
                        </div>
                    </div>
                    <div class="insight-item">
                        <label>Version ID</label>
                        <span class="mono-text" title="${audit.versionId || 'Not Snapshot'}">${audit.versionId ? audit.versionId.substring(0, 8) : 'N/A'}</span>
                    </div>
                </div>

                <div class="insight-section">
                    <label>Original Prompt</label>
                    <code class="prompt-code">${audit.prompt}</code>
                </div>

                 <div class="insight-section">
                    <label>Key Fields Detected (${(vr.verifiedFields || []).length} Verified)</label>
                    <p class="fields-text">${audit.extractedFields}</p>
                </div>
            </div >
                `;

    } catch (e) {
        console.error('Error rendering insights:', e);
        container.innerHTML = `< div class="error-state" > Failed to load insights: ${e.message}</div > `;
    }

    // --- Feed Intelligence Profile ---
    const feedProfile = document.getElementById('feed-intelligence-profile');
    if (feedProfile && currentItem?.source?.feedMetadata) {
        const fm = currentItem.source.feedMetadata;
        feedProfile.style.display = 'block';
        document.getElementById('feed-topic').textContent = fm.topic || '—';
        document.getElementById('feed-sources').textContent = (fm.sourcesUsed || []).map(s => s.name).join(', ') || '—';
        document.getElementById('feed-timestamp').textContent = fm.retrievedAt ? new Date(fm.retrievedAt).toLocaleString() : '—';
        document.getElementById('feed-entry-count').textContent = fm.totalFeedEntries || '—';
        document.getElementById('feed-verification').textContent = fm.verificationStatus || 'Verified via AI Pipeline';
    } else if (feedProfile) {
        feedProfile.style.display = 'none';
    }
}

// Ninja Chat Toggle
const ninjaChatBtn = document.getElementById('ninja-btn-chat');
const chatInterface = document.querySelector('.chat-interface');

if (ninjaChatBtn && chatInterface) {
    ninjaChatBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent immediate closing from click-outside listener

        const isVisible = chatInterface.classList.contains('visible');

        if (!isVisible) {
            // Opening: Ensure AI tab is active
            switchToTab('ai');
            chatInterface.classList.add('visible');
            document.getElementById('chat-input').focus();
        } else {
            // Closing
            chatInterface.classList.remove('visible');
        }
    });

    // Close on click outside (Ninja theme only)
    document.addEventListener('click', (e) => {
        if (document.body.classList.contains('theme-ninja')) {
            const isInsideChat = chatInterface.contains(e.target);
            const isNinjaBtn = ninjaChatBtn.contains(e.target);

            if (!isInsideChat && !isNinjaBtn && chatInterface.classList.contains('visible')) {
                chatInterface.classList.remove('visible');
            }
        }
    });
}

// AI Key Points
const extractBtn = document.getElementById('btn-extract');
if (extractBtn) {
    extractBtn.addEventListener('click', async () => {
        const content = document.getElementById('item-content').innerText;
        addChatMessage('user', 'Extract key points.');
        addChatMessage('ai', 'Extracting key points...');

        try {
            const prompt = `Extract the 5 most important key points from this text.Return them as a numbered list with a blank line between each item: \n\n${content} `;
            const response = await aiManager.callAI(prompt);
            addChatMessage('ai', response);
        } catch (error) {
            addChatMessage('ai', aiManager.getErrorMessage(error));
        }
    });
}

// Chat Input
document.getElementById('chat-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

// Content Editing
const contentDiv = document.getElementById('item-content');
const titleH1 = document.getElementById('item-title');
const saveBtn = document.getElementById('save-btn');

// Make editable
contentDiv.contentEditable = true;
titleH1.contentEditable = true;

// Detect changes
const markUnsaved = () => {
    saveBtn.style.display = 'flex';
    lastChangeIntent = "Manual Update";
};

contentDiv.addEventListener('input', markUnsaved);
titleH1.addEventListener('input', markUnsaved);

// Save Changes
saveBtn.addEventListener('click', async () => {
    if (!currentItem || !currentCollection) return;

    try {
        // 1. Create a "Commit" in history before saving new changes
        if (!currentItem.history) currentItem.history = [];

        // Capture existing state as a history record
        const historyRecord = {
            title: currentItem.title,
            html: currentItem.data.html || document.getElementById('item-content').innerHTML, // fallback to initial
            timestamp: new Date().toISOString(),
            label: lastChangeIntent || `Update(${new Date().toLocaleTimeString()})`
        };

        // Limit history to 20 entries
        currentItem.history.unshift(historyRecord);
        if (currentItem.history.length > 20) currentItem.history.pop();

        // 2. Update item data with new content
        currentItem.title = titleH1.innerText.trim();

        // CRITICAL FIX: Save as .innerHTML to preserve tables/formatting
        currentItem.data.html = contentDiv.innerHTML;
        currentItem.data.text = contentDiv.innerText; // Keep text for search/preview
        currentItem.type = 'html'; // Normalize type

        // Update last modified
        currentItem.timestamp = new Date().toISOString();

        // 3. Save to storage
        await storage.saveCollection(currentCollection);

        // UI Feedback
        saveBtn.textContent = 'Saved!';
        saveBtn.style.backgroundColor = '#059669'; // Darker green

        setTimeout(() => {
            saveBtn.style.display = 'none';
            saveBtn.style.backgroundColor = '';
            saveBtn.innerHTML = `< svg width = "16" height = "16" viewBox = "0 0 24 24" fill = "none" stroke = "currentColor" stroke - width="2" ><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg > Save Changes`;
        }, 1000);

        renderHistory();
    } catch (error) {
        console.error('Error saving changes:', error);
        alert('Failed to save changes');
    }
});

// --- New Ninja AI Input Logic ---
const chatInput = document.getElementById('chat-input');
const chipContainer = document.getElementById('suggestion-chips');
const tagContainer = document.getElementById('active-tag-container');
let activeAction = null;

const DEFAULT_ACTIONS = [
    { text: "Summary", icon: "Text", color: "#F97316", bg: "#FFF7ED", border: "#FFEDD5" },
    { text: "Fix Spelling", icon: "CheckCheck", color: "#10B981", bg: "#ECFDF5", border: "#D1FAE5" },
    { text: "Shorten", icon: "Minimize", color: "#8B5CF6", bg: "#F5F3FF", border: "#EDE9FE" },
    { text: "Professional Tone", icon: "Briefcase", color: "#3B82F6", bg: "#EFF6FF", border: "#DBEAFE" }
];

// Auto-resize textarea
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
});

// Render chips
function renderChips() {
    chipContainer.innerHTML = '';
    DEFAULT_ACTIONS.forEach(action => {
        if (activeAction?.text === action.text) return; // Hide if active

        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.borderColor = action.border;
        chip.innerHTML = `< span > ${action.text}</span > `;
        chip.addEventListener('click', () => setActiveAction(action));
        chipContainer.appendChild(chip);
    });
}

function setActiveAction(action) {
    activeAction = action;
    renderChips();
    renderActiveTag();
    chatInput.focus();
}

function renderActiveTag() {
    tagContainer.innerHTML = '';
    if (activeAction) {
        const tag = document.createElement('div');
        tag.className = 'active-tag';
        tag.style.backgroundColor = activeAction.bg;
        tag.style.borderColor = activeAction.border;
        tag.style.color = activeAction.color;
        tag.innerHTML = `
                < span > ${activeAction.text}</span >
                    <span style="margin-left: 4px; cursor: pointer;">×</span>
            `;
        tag.querySelector('span:last-child').addEventListener('click', (e) => {
            e.stopPropagation();
            activeAction = null;
            renderChips();
            renderActiveTag();
        });
        tagContainer.appendChild(tag);
    }
}

// Update send logic to include action
const originalSendHandler = sendChatMessage;
window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    let text = input.value.trim();
    if (text || activeAction) {
        // Prepend action if exists
        const fullPrompt = activeAction ? `[${activeAction.text}] ${text} ` : text;
        input.value = ''; // Clear earlier to allow height reset
        input.style.height = 'auto'; // Reset height

        // Temporary set for original handler to pick up
        const tempVal = input.value;
        input.value = fullPrompt;

        await originalSendHandler();

        activeAction = null;
        renderChips();
        renderActiveTag();
    }
};


renderChips();


function switchToTab(tabId) {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab - ${tabId} `).classList.add('active');

    // Content panels
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel - ${tabId} `).classList.add('active');
}

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (!currentItem || !currentItem.history || currentItem.history.length === 0) {
        list.innerHTML = '<div class="empty-state">No version history yet. Changes appear after you save.</div>';
        return;
    }

    currentItem.history.forEach((record, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
                < div class="history-meta" >
                <span>Version #${currentItem.history.length - index}</span>
                <span>${dateStr}</span>
            </div >
            <div class="history-title" style="font-weight: 600; color: var(--primary); margin-bottom: 4px;">${record.label || 'Untitled Version'}</div>
            <div class="history-title" style="font-size: 12px; opacity: 0.8;">${record.title}</div>
            <div class="history-actions">
                <button class="restore-btn" data-index="${index}">Restore This Version</button>
            </div>
            `;

        item.querySelector('.restore-btn').addEventListener('click', () => {
            restoreVersion(index);
        });

        list.appendChild(item);
    });
}

function restoreVersion(index) {
    if (!currentItem || !currentItem.history || !currentItem.history[index]) return;

    const record = currentItem.history[index];

    // Confirm with user
    if (!confirm('Are you sure you want to restore this previous version? Your current unsaved changes will be replaced.')) {
        return;
    }

    // Update UI
    document.getElementById('item-title').textContent = record.title;
    document.getElementById('item-content').innerHTML = record.html;

    // Show save button
    document.getElementById('save-btn').style.display = 'flex';

    // Trigger highlight
    const contentDiv = document.getElementById('item-content');
    contentDiv.classList.remove('highlight-update');
    void contentDiv.offsetWidth;
    contentDiv.classList.add('highlight-update');

    // Switch to AI tab to tell them
    switchToTab('ai');
    addChatMessage('ai', `📅 ** Restored to version from ${new Date(record.timestamp).toLocaleString()}.** Don't forget to click "Save Changes" if you want to keep this restoration!`);
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text) {
        addChatMessage('user', text);
        input.value = '';

        // Determine context: Include HTML if tables are present to preserve them
        const contentDiv = document.getElementById('item-content');
        const hasTable = contentDiv.querySelector('table') !== null;
        const contentContext = hasTable ? contentDiv.innerHTML : contentDiv.innerText;

        addChatMessage('ai', 'Thinking...');

        try {
            const prompt = `Context: The user is viewing a document. Here is the current content (including HTML structure if applicable):\n\n---START CONTENT---\n${contentContext.substring(0, 8000)}\n---END CONTENT---\n\nUser Request: "${text}"\n\nInstructions:\n1. Provide a helpful response.\n2. **CRITICAL:** If the user asks to "reformat", "neatly format", "update", "change", or "rewrite" the document, include the new content between <UPDATE_CONTENT> and </UPDATE_CONTENT> tags.\n3. **TABLE PRESERVATION:** If the document already contains a table, MAINTAIN that table structure in your response unless asked to remove it. Do not revert tables to plain text.\n4. **FORMATTING:** For tables, use standard semantic HTML (<table>, <thead>, <tbody>, <tr>, <th>, <td>). Aim for a clean "Excel-style" layout.\n5. **NO MARKDOWN:** Inside <UPDATE_CONTENT>, return ONLY raw HTML. Do NOT wrap it in markdown code blocks like \`\`\`html.\n6. Everything outside those tags will be shown as a normal chat message.`;

            const response = await aiManager.callAI(prompt);

            // Handle content updates
            if (response.includes('<UPDATE_CONTENT>')) {
                const match = response.match(/<UPDATE_CONTENT>([\s\S]*?)<\/UPDATE_CONTENT>/);
                if (match && match[1]) {
                    let newContent = match[1].trim();

                    // Robustly strip any markdown code blocks if the AI ignored instructions
                    newContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/g, '');

                    const contentDiv = document.getElementById('item-content');
                    contentDiv.innerHTML = newContent;

                    // Update intent for history label
                    lastChangeIntent = `AI: ${text.substring(0, 50).trim()}${text.length > 50 ? '...' : ''}`;

                    // Trigger highlight animation
                    contentDiv.classList.remove('highlight-update');
                    void contentDiv.offsetWidth; // Force reflow
                    contentDiv.classList.add('highlight-update');

                    // Show save button
                    document.getElementById('save-btn').style.display = 'flex';

                    // Add success message to chat
                    const cleanResponse = response.replace(/<UPDATE_CONTENT>[\s\S]*?<\/UPDATE_CONTENT>/g, '').trim();
                    addChatMessage('ai', (cleanResponse ? cleanResponse + '\n\n' : '') + '✨ **Document updated with Excel-style formatting!** Click "Save Changes" at the top to keep these updates.');
                } else {
                    addChatMessage('ai', response);
                }
            } else {
                addChatMessage('ai', response);
            }
        } catch (error) {
            addChatMessage('ai', aiManager.getErrorMessage(error));
        }
    }
}

function addChatMessage(role, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;

    // Convert newlines to breaks for AI responses and parse bold markdown
    if (role === 'ai') {
        let formattedText = text
            .replace(/\n/g, '<br>') // Handle newlines
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold: **text**
            .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic: *text*

        div.innerHTML = formattedText;
    } else {
        div.textContent = text;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// DEEP ENRICH INTELLIGENCE FEATURE
// ==========================================

let deepEnrichLinks = [];
let deepEnrichedResults = [];

/**
 * Initialize Deep Enrich Section
 * Checks if the current item is feed-derived and has source links
 */
function initDeepEnrich() {
    const section = document.getElementById('deep-enrich-section');
    if (!section || !currentItem) return;

    // Check if it's a feed-derived item (either structured data array or has feedMetadata)
    const isFeedItem = currentItem.tags?.includes('feed-ingestion') ||
        currentItem.source?.feedMetadata ||
        (currentItem.type === 'ai_extraction' && Array.isArray(currentItem.data?.structured));

    if (!isFeedItem) {
        section.style.display = 'none';
        return;
    }

    // Try to find raw entries to extract links from
    let entries = [];
    if (currentItem.data && Array.isArray(currentItem.data.structured)) {
        entries = currentItem.data.structured;
    }

    deepEnrichLinks = selectBestLinks(entries);

    if (deepEnrichLinks.length > 0) {
        section.style.display = 'block';
        document.getElementById('btn-deep-enrich-all').textContent = `Deep Enrich All (Found ${deepEnrichLinks.length})`;
    } else {
        section.style.display = 'none';
    }
}

/**
 * Handle "Deep Enrich All" button click
 */
async function handleDeepEnrichAll() {
    const btn = document.getElementById('btn-deep-enrich-all');
    const progressDiv = document.getElementById('deep-enrich-progress');
    const resultsDiv = document.getElementById('deep-enrich-results');

    btn.disabled = true;
    btn.textContent = 'Enriching...';
    progressDiv.style.display = 'block';
    resultsDiv.style.display = 'flex';
    resultsDiv.innerHTML = '';
    deepEnrichedResults = [];

    try {
        const results = await processLinksWithQueue(deepEnrichLinks, updateDeepEnrichProgress);
        deepEnrichedResults = results;

        if (results.length > 0) {
            // Generate combined brief
            const combined = await generateCombinedBrief(results);
            if (combined) {
                renderCombinedBrief(combined);
            }

            // Show save button
            document.getElementById('btn-save-enrichment').style.display = 'block';
            btn.textContent = 'Enrichment Complete';
        } else {
            btn.textContent = 'No data extracted';
            resultsDiv.innerHTML = '<div class="empty-state">Failed to extract intelligence from these links. They may be protected or incompatible.</div>';
        }
    } catch (error) {
        console.error("Deep enrich failed:", error);
        btn.textContent = 'Enrichment Failed';
        btn.disabled = false;
    }
}

/**
 * Update progress bar and render intermediate results
 */
function updateDeepEnrichProgress(stats) {
    const fill = document.querySelector('.progress-fill');
    const text = document.querySelector('.progress-text');

    if (fill && text) {
        const percent = Math.round((stats.completed / Math.max(stats.total, 1)) * 100);
        fill.style.width = `${percent}%`;
        text.innerHTML = `<span>Processing: ${stats.completed} / ${stats.total}</span> <span style="color:#6B7280; font-size:10px;">(Success: ${stats.successful}, Skipped: ${stats.skipped})</span>`;
    }

    // If there's a new result, we don't have direct access to it from stats,
    // so we'd normally pass it through the callback. For now, we wait till the end.
    // However, if we modified processLinksWithQueue to emit individual results, we could render here.
}

/**
 * Render all individual article results and the combined brief
 */
function renderCombinedBrief(combined) {
    const resultsDiv = document.getElementById('deep-enrich-results');

    // 1. Render Combined Brief Card
    let patternsHtml = '';
    if (combined.patternsObserved && combined.patternsObserved.length > 0) {
        patternsHtml = `
            <div class="brief-patterns">
                <h4>Strategic Patterns</h4>
                <ul>
                    ${combined.patternsObserved.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    const briefHtml = `
        <div class="combined-brief-card" style="margin-bottom: 20px;">
            <div class="brief-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Combined Intelligence Brief
            </div>
            <div class="brief-summary">${combined.consolidatedSummary}</div>
            ${patternsHtml}
        </div>
    `;

    // 2. Render Individual Cards
    let individualHtml = combined.metricsTable.map(result => {
        const metrics = result.structuredData || {};
        const isSuccess = !!metrics.companyName || !!metrics.fundingAmount || !!metrics.revenue;
        const confidenceClass = `confidence-${result.confidence || 'LOW'}`;

        let metricsHtml = Object.entries(metrics)
            .filter(([k, v]) => v !== null && v !== '' && typeof v !== 'object')
            .map(([k, v]) => `
                <div class="enrich-metric-item">
                    <span class="enrich-metric-label">${k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span class="enrich-metric-val">${v}</span>
                </div>
            `).join('');

        let signalsHtml = '';
        if (result.strategicSignals && result.strategicSignals.length > 0) {
            signalsHtml = `
                <div class="enrich-signals">
                    <h4>Strategic Signals</h4>
                    <ul>
                        ${result.strategicSignals.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        return `
            <div class="enrich-result-card ${isSuccess ? 'success' : 'error'}">
                <div class="enrich-domain">
                    <img src="https://www.google.com/s2/favicons?domain=${result.sourceDomain}&sz=16" style="width:14px; height:14px;" />
                    <a href="${result.sourceUrl}" target="_blank" style="color:inherit; text-decoration:none;">${result.sourceDomain}</a>
                    <span style="flex:1"></span>
                    <span class="enrich-confidence ${confidenceClass}">${result.confidence || 'LOW'} CONFIDENCE</span>
                </div>
                <div class="enrich-summary">${result.executiveSummary}</div>
                ${metricsHtml ? `<div class="enrich-metrics-grid">${metricsHtml}</div>` : ''}
                ${signalsHtml}
            </div>
        `;
    }).join('');

    resultsDiv.innerHTML = briefHtml + individualHtml;
}

/**
 * Handle "Save Enriched Intelligence" button click
 * Creates a version snapshot without auto-committing the entire collection to github
 */
async function handleSaveEnrichment() {
    if (!currentItem || deepEnrichedResults.length === 0) return;

    const btn = document.getElementById('btn-save-enrichment');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // 1. Create a deep copy of the item to avoid mutating immediately if save fails
        const updatedItem = JSON.parse(JSON.stringify(currentItem));

        // 2. Attach enriched data
        if (!updatedItem.enriched) updatedItem.enriched = {};
        updatedItem.enriched.deepIntelligence = {
            timestamp: Date.now(),
            results: deepEnrichedResults
        };

        // 3. Create a snapshot history entry
        if (!updatedItem.history) updatedItem.history = [];

        const historyEntry = {
            id: 'v_' + Date.now().toString(36),
            timestamp: Date.now(),
            intent: 'Deep Enrich Intelligence Expansion',
            contentHtml: updatedItem.data.html || updatedItem.data.content,
            structuredData: updatedItem.data.structured,
            enriched: updatedItem.enriched
        };

        updatedItem.history.push(historyEntry);

        // 4. Update the item in the collection
        const itemIndex = currentCollection.items.findIndex(i => i.id === updatedItem.id);
        if (itemIndex !== -1) {
            currentCollection.items[itemIndex] = updatedItem;
            await storage.saveCollection(currentCollection);

            // 5. Update local state
            currentItem = updatedItem;

            // 6. Update UI
            btn.textContent = 'Saved Successfully ✓';
            btn.style.background = '#059669'; // Darker green

            // Re-render history to show new snapshot
            renderHistory();

            setTimeout(() => {
                btn.style.display = 'none';
            }, 3000);
        }
    } catch (error) {
        console.error("Failed to save enrichment:", error);
        btn.textContent = 'Save Failed - Try Again';
        btn.disabled = false;
        btn.style.background = '#EF4444'; // Red
    }
}
            .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic: *text*

div.innerHTML = formattedText;
    } else {
    div.textContent = text;
}

container.appendChild(div);
container.scrollTop = container.scrollHeight;
}
