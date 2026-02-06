import { storage } from './modules/storage.js';
import { aiManager } from './modules/ai.js';

let currentCollection = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Storage
    await storage.open();

    // 2. Load Collection Data
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (id) {
        await loadCollection(id);
    } else {
        document.getElementById('collection-title').textContent = "No Collection Selected";
        document.getElementById('content-area').innerHTML = '<div class="item-block"><div class="item-title">Error</div><p>Please go back to the dashboard and select a collection.</p></div>';
    }

    // 3. Setup Events
    setupEventListeners();
});

async function loadCollection(id) {
    try {
        currentCollection = await storage.getCollection(id);
        if (!currentCollection) throw new Error('Collection not found');

        // Update UI
        document.getElementById('collection-title').textContent = currentCollection.name;
        document.getElementById('breadcrumb-current').textContent = currentCollection.name;
        document.title = `${currentCollection.name} - Smart Collector`;

        renderItems(currentCollection.items);
    } catch (error) {
        console.error('Failed to load collection:', error);
        document.getElementById('collection-title').textContent = "Error Loading Collection";
    }
}

function renderItems(items) {
    const container = document.getElementById('content-area');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="item-block"><div class="item-title">Empty Collection</div><p>Start collecting items to see them here.</p></div>';
        return;
    }

    items.forEach(item => {
        const source = item.source || {};
        const block = document.createElement('div');
        block.className = 'item-block';

        let contentHtml = '';
        if (item.type === 'structured' && item.data) {
            contentHtml = `
                <div style="font-size: 15px; background: #f8fafc; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                    ${Object.entries(item.data).map(([key, value]) => `
                        <div style="margin-bottom: 8px;">
                            <strong style="text-transform: capitalize; color: #64748b; font-size: 12px;">${key.replace(/_/g, ' ')}</strong>
                            <div>${Array.isArray(value) ? value.join(', ') : value}</div>
                        </div>
                    `).join('')}
                </div>
             `;
        } else {
            contentHtml = `<p>${(item.data?.raw_text || item.data?.content || 'No content').substring(0, 500)}...</p>`;
        }

        block.innerHTML = `
            <div class="item-meta">
                <span>${new Date(item.timestamp).toLocaleDateString()}</span>
                ${source.url ? `<span>•</span> <a href="${source.url}" target="_blank" style="color: inherit; text-decoration: none;">${new URL(source.url).hostname}</a>` : ''}
            </div>
            <div class="item-title">${item.title || source.title || 'Untitled'}</div>
            <div class="item-content">${contentHtml}</div>
        `;
        container.appendChild(block);
    });
}

function setupEventListeners() {
    const backBtn = document.getElementById('back-btn');
    backBtn.onclick = () => {
        window.location.href = 'sidepanel.html';
    };

    const aiInput = document.getElementById('ai-input');
    const aiBtn = document.getElementById('ai-send-btn');

    aiBtn.onclick = async () => {
        const instruction = aiInput.value.trim();
        if (!instruction || !currentCollection) return;

        // Visual feedback
        aiBtn.disabled = true;
        const previousContent = document.getElementById('content-area').innerHTML;
        document.getElementById('content-area').innerHTML = `
            <div class="item-block pulse">
                <div class="item-title">AI is thinking...</div>
                <p>Processing ${currentCollection.items.length} items according to your instructions.</p>
            </div>
        `;

        try {
            const transformedContent = await aiManager.transformCollection(currentCollection.items, instruction);

            // Render AI Result
            const container = document.getElementById('content-area');
            container.innerHTML = `
                <div class="ai-result">
                    <div class="ai-badge">AI Transformed</div>
                    <div class="ai-markdown-content">${marked.parse(transformedContent)}</div>
                </div>
                <div style="margin-top: 40px; text-align: center;">
                    <button id="reset-view-btn" style="background: none; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 8px; cursor: pointer; color: #64748b; font-size: 14px;">Reset to Original View</button>
                </div>
            `;

            document.getElementById('reset-view-btn').onclick = () => renderItems(currentCollection.items);
            aiInput.value = '';

        } catch (error) {
            console.error('AI Transformation failed:', error);
            alert('AI was unable to process this request. Check your API key in settings.');
            document.getElementById('content-area').innerHTML = previousContent;
        } finally {
            aiBtn.disabled = false;
        }
    };

    aiInput.onkeypress = (e) => {
        if (e.key === 'Enter') aiBtn.click();
    };

    // Google Workspace Export
    const sheetsBtn = document.getElementById('export-sheets-btn');
    const docsBtn = document.getElementById('export-docs-btn');

    sheetsBtn.onclick = () => exportToWorkspace('sheets');
    docsBtn.onclick = () => exportToWorkspace('docs');
}

async function exportToWorkspace(type) {
    if (!currentCollection || currentCollection.items.length === 0) {
        alert('No items to export.');
        return;
    }

    const btn = document.getElementById(`export-${type}-btn`);
    const originalText = btn.innerHTML;
    btn.disabled = true;

    try {
        let content = '';
        let url = '';

        if (type === 'sheets') {
            // Convert to CSV
            const items = currentCollection.items;
            const headers = ['Title', 'URL', 'Date', 'Content'];
            const rows = items.map(item => [
                item.title || item.source?.title || 'Untitled',
                item.source?.url || 'N/A',
                new Date(item.timestamp).toLocaleDateString(),
                JSON.stringify(item.data || {}).replace(/"/g, '""')
            ]);
            content = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
            url = 'https://docs.google.com/spreadsheets/create';
        } else {
            // Convert to Markdown
            content = `# ${currentCollection.name}\n\n`;
            currentCollection.items.forEach((item, index) => {
                content += `## ${index + 1}. ${item.title || item.source?.title || 'Untitled'}\n`;
                content += `**Source**: ${item.source?.url || 'N/A'}\n\n`;
                if (item.type === 'structured' && item.data) {
                    Object.entries(item.data).forEach(([key, value]) => {
                        content += `- **${key.replace(/_/g, ' ')}**: ${Array.isArray(value) ? value.join(', ') : value}\n`;
                    });
                } else {
                    content += `${item.data?.raw_text || item.data?.content || ''}\n`;
                }
                content += '\n---\n\n';
            });
            url = 'https://docs.google.com/document/create';
        }

        // Copy to clipboard
        await navigator.clipboard.writeText(content);

        // Visual feedback
        btn.innerHTML = 'Copied & Opening...';

        // Open Google Workspace
        chrome.tabs.create({ url });

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed. Please try again.');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
