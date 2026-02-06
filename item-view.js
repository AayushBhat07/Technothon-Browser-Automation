import { storage } from './modules/storage.js';
import { aiManager } from './modules/ai.js';

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
                const prompt = `Provide a comprehensive, medium-length summary of the following text. \n\nRequirements:\n- Use bullet points for key concepts.\n- Bold important terms.\n- Ensure there is a blank line between each bullet point for better readability.\n- Do not be too brief; explain the context.\n\nText:\n${content}`;
                const response = await aiManager.callGoogleAI(prompt);
                addChatMessage('ai', response);
            } catch (error) {
                addChatMessage('ai', `Error: ${aiManager.getErrorMessage(error)}`);
            }
        });
    });

    // Tab Switcher
    document.getElementById('tab-ai').addEventListener('click', () => switchToTab('ai'));
    document.getElementById('tab-history').addEventListener('click', () => {
        switchToTab('history');
        renderHistory();
    });

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
                const prompt = `Extract the 5 most important key points from this text. Return them as a numbered list with a blank line between each item:\n\n${content}`;
                const response = await aiManager.callGoogleAI(prompt);
                addChatMessage('ai', response);
            } catch (error) {
                addChatMessage('ai', `Error: ${aiManager.getErrorMessage(error)}`);
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
                label: lastChangeIntent || `Update (${new Date().toLocaleTimeString()})`
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
                saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes`;
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
            chip.innerHTML = `<span>${action.text}</span>`;
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
                <span>${activeAction.text}</span>
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
            const fullPrompt = activeAction ? `[${activeAction.text}] ${text}` : text;
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
}

function switchToTab(tabId) {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // Content panels
    document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${tabId}`).classList.add('active');
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
            <div class="history-meta">
                <span>Version #${currentItem.history.length - index}</span>
                <span>${dateStr}</span>
            </div>
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
    addChatMessage('ai', `📅 **Restored to version from ${new Date(record.timestamp).toLocaleString()}.** Don't forget to click "Save Changes" if you want to keep this restoration!`);
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

            const response = await aiManager.callGoogleAI(prompt);

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
            addChatMessage('ai', `Error: ${aiManager.getErrorMessage(error)}`);
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
