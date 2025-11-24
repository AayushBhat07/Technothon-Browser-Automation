import { storage } from './modules/storage.js';
import { aiManager } from './modules/ai.js';

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
        const collection = await storage.getCollection(collectionId);
        const item = collection.items.find(i => i.id === itemId);

        if (item) {
            // Populate UI
            document.getElementById('item-title').textContent = item.title || 'Untitled';

            // Handle content (text or structured)
            let contentHtml = '';
            if (item.type === 'structured' && item.data) {
                contentHtml = `<pre>${JSON.stringify(item.data, null, 2)}</pre>`;
            } else {
                // Simple text to paragraphs
                contentHtml = (item.data.text || item.data.content || '')
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => `<p>${line}</p>`)
                    .join('');
            }
            document.getElementById('item-content').innerHTML = contentHtml;

            // Metadata
            let domain = 'Unknown Source';
            try {
                if (item.source_url) {
                    domain = new URL(item.source_url).hostname.replace('www.', '');
                } else if (typeof item.source === 'string') {
                    domain = item.source;
                }
            } catch (e) {
                console.warn('Error parsing domain:', e);
            }

            document.getElementById('source-domain').textContent = domain;

            if (item.source_url) {
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(item.source_url).hostname}&sz=32`;
                const favIcon = document.getElementById('source-favicon');
                favIcon.src = faviconUrl;
                favIcon.style.display = 'inline-block';
            }

            document.getElementById('item-date').textContent = new Date(item.timestamp).toLocaleDateString();

            // Breadcrumb
            document.querySelector('.collection-name').textContent = collection.name;
            document.querySelector('.item-title-crumb').textContent = item.title || 'Untitled';
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

    // Close Button
    document.getElementById('close-btn').addEventListener('click', () => {
        window.location.href = 'sidepanel.html';
    });

    // AI Summarize
    const summarizeBtns = document.querySelectorAll('#btn-summarize, #ninja-btn-summarize');
    summarizeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const content = document.getElementById('item-content').innerText;
            addChatMessage('user', 'Summarize this for me.');
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

    // Ninja Chat Toggle
    const ninjaChatBtn = document.getElementById('ninja-btn-chat');
    if (ninjaChatBtn) {
        ninjaChatBtn.addEventListener('click', () => {
            document.querySelector('.chat-interface').classList.toggle('visible');
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
    };

    contentDiv.addEventListener('input', markUnsaved);
    titleH1.addEventListener('input', markUnsaved);

    // Save Changes
    saveBtn.addEventListener('click', async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('id');
        const collectionId = urlParams.get('collectionId');

        if (itemId && collectionId) {
            try {
                const collection = await storage.getCollection(collectionId);
                const item = collection.items.find(i => i.id === itemId);

                if (item) {
                    // Update item data
                    item.title = titleH1.innerText.trim();

                    // Update content based on structure
                    if (item.type === 'structured' && item.data) {
                        item.data.text = contentDiv.innerText;
                    } else {
                        item.data.text = contentDiv.innerText;
                        item.data.content = contentDiv.innerText; // Update both common fields
                    }

                    // Save to storage
                    await storage.saveCollection(collection);

                    // UI Feedback
                    saveBtn.textContent = 'Saved!';
                    setTimeout(() => {
                        saveBtn.style.display = 'none';
                        saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes`;
                    }, 1500);
                }
            } catch (error) {
                console.error('Error saving changes:', error);
                alert('Failed to save changes');
            }
        }
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (text) {
        addChatMessage('user', text);
        input.value = '';

        const content = document.getElementById('item-content').innerText;
        addChatMessage('ai', 'Thinking...');

        try {
            const prompt = `Context: The user is viewing a document with the following content:\n"${content.substring(0, 2000)}..."\n\nUser Request: "${text}"\n\nProvide a helpful response or perform the requested action on the text.`;
            const response = await aiManager.callGoogleAI(prompt);
            addChatMessage('ai', response);
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
