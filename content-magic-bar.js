/**
 * Magic Input Bar Content Script
 * Injects a floating input bar for AI-powered data extraction.
 */

console.log('[SmartCollector] Magic Bar v3.0 (SmartCollectorMagicBar class) - TESTING IIFE EXECUTION...');

(function () {
    console.log('[SmartCollector] IIFE started, checking for existing instance...');
    console.log('[SmartCollector] window.hasSmartCollectorMagicBar =', window.hasSmartCollectorMagicBar);

    // Prevent multiple injections
    if (window.hasSmartCollectorMagicBar) {
        console.log('[SmartCollector] Already loaded, exiting IIFE');
        return;
    }
    window.hasSmartCollectorMagicBar = true;
    console.log('[SmartCollector] Setting flag, continuing with class definition...');

    class SmartCollectorMagicBar {
        constructor() {
            this.shadowRoot = null;
            this.container = null;
            this.isVisible = false;
        }

        init() {
            console.log('[SmartCollector] Magic Bar init() called, setting up message listener...');

            // Listen for messages from background script
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                console.log('[SmartCollector] Magic Bar received message:', request);
                if (request.action === 'toggleMagicBar') {
                    console.log('[SmartCollector] Toggling Magic Bar...');
                    this.toggle();
                }
            });

            console.log('[SmartCollector] Magic Bar listener registered successfully');
        }

        createUI() {
            if (this.container) return;

            // Check if element already exists in DOM
            const existing = document.getElementById('smart-collector-magic-bar-root');
            if (existing) {
                this.container = existing;
                this.shadowRoot = existing.shadowRoot;
                // Re-bind references
                const wrapper = this.shadowRoot.querySelector('.magic-bar-container');
                this.input = wrapper.querySelector('input');
                this.extractBtn = wrapper.querySelector('#extract-btn');
                this.resultsArea = wrapper.querySelector('.results-area');
                this.loadingIndicator = wrapper.querySelector('.loading-indicator');
                this.footerActions = wrapper.querySelector('.footer-actions');
                this.table = wrapper.querySelector('#results-table');
                return;
            }

            this.container = document.createElement('div');
            this.container.id = 'smart-collector-magic-bar-root';
            this.shadowRoot = this.container.attachShadow({ mode: 'open' });

            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                :host {
                    all: initial;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    z-index: 2147483647; /* Max z-index */
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 600px;
                    max-width: 90vw;
                    pointer-events: none; /* Let clicks pass through when hidden/transparent */
                }

                .magic-bar-container {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: auto; /* Re-enable clicks */
                    opacity: 0;
                    transform: translateY(-20px);
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .magic-bar-container.visible {
                    opacity: 1;
                    transform: translateY(0);
                }

                .input-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: #F3F4F6;
                    border-radius: 8px;
                    padding: 8px 12px;
                    border: 2px solid transparent;
                    transition: all 0.2s;
                }

                .input-wrapper:focus-within {
                    background: white;
                    border-color: #6366F1;
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                }

                .magic-icon {
                    color: #6366F1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 16px;
                    color: #1F2937;
                    outline: none;
                    padding: 4px 0;
                }

                input::placeholder {
                    color: #9CA3AF;
                }

                button.action-btn {
                    background: #6366F1;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                button.action-btn:hover {
                    background: #4F46E5;
                }

                button.action-btn:disabled {
                    background: #E5E7EB;
                    color: #9CA3AF;
                    cursor: not-allowed;
                }

                /* Results Table */
                .results-area {
                    max-height: 400px;
                    overflow-y: auto;
                    border-top: 1px solid #E5E7EB;
                    padding-top: 12px;
                    display: none;
                }

                .results-area.has-results {
                    display: block;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }

                th {
                    text-align: left;
                    padding: 8px;
                    background: #F9FAFB;
                    color: #6B7280;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                }

                td {
                    padding: 8px;
                    border-bottom: 1px solid #E5E7EB;
                    color: #374151;
                    white-space: pre-wrap; /* Preserve newlines for paragraphs */
                    line-height: 1.5;
                    vertical-align: top;
                }

                tr:last-child td {
                    border-bottom: none;
                }

                /* Loading State */
                .loading-indicator {
                    display: none;
                    align-items: center;
                    gap: 8px;
                    color: #6B7280;
                    font-size: 13px;
                    padding: 8px;
                }

                .loading-indicator.active {
                    display: flex;
                }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #E5E7EB;
                    border-top-color: #6366F1;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .footer-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 8px;
                    display: none;
                }

                .footer-actions.visible {
                    display: flex;
                }

                .secondary-btn {
                    background: white;
                    border: 1px solid #E5E7EB;
                    color: #374151;
                    border-radius: 6px;
                    padding: 6px 12px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                }

                .secondary-btn:hover {
                    background: #F9FAFB;
                }
            `;

            // HTML Structure
            const wrapper = document.createElement('div');
            wrapper.className = 'magic-bar-container';
            wrapper.innerHTML = `
                <div class="input-wrapper">
                    <div class="magic-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                    </div>
                    <input type="text" placeholder="Ask AI to extract data (e.g., 'Get all job titles and salaries')..." />
                    <button class="action-btn" id="extract-btn">Extract</button>
                </div>

                <div class="loading-indicator">
                    <div class="spinner"></div>
                    <span>Analyzing page content...</span>
                </div>

                <div class="paste-area hidden">
                    <div style="padding: 12px; background: #FEF3C7; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span style="font-size: 13px; font-weight: 500; color: #92400E;">PDF/Document Detected</span>
                        </div>
                        <p style="font-size: 12px; color: #78350F; margin: 0;">Copy the text you want to extract, then paste it below:</p>
                    </div>
                    <textarea id="paste-input" placeholder="Paste your copied text here..." 
                        style="width: 100%; min-height: 120px; padding: 8px; border: 2px solid #E5E7EB; border-radius: 6px; font-size: 13px; font-family: inherit; resize: vertical; box-sizing: border-box;"></textarea>
                </div>

                <div class="results-area">
                    <table id="results-table">
                        <thead></thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="footer-actions">
                    <button class="secondary-btn" id="copy-btn">Copy to Clipboard</button>
                    <button class="action-btn" id="save-btn">Save to Collection</button>
                </div>
            `;

            this.shadowRoot.appendChild(style);
            this.shadowRoot.appendChild(wrapper);
            document.body.appendChild(this.container);

            // Bind events
            this.input = wrapper.querySelector('input');
            this.extractBtn = wrapper.querySelector('#extract-btn');
            this.resultsArea = wrapper.querySelector('.results-area');
            this.loadingIndicator = wrapper.querySelector('.loading-indicator');
            this.footerActions = wrapper.querySelector('.footer-actions');
            this.table = wrapper.querySelector('#results-table');

            this.extractBtn.addEventListener('click', () => this.handleExtraction());
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleExtraction();
                if (e.key === 'Escape') this.hide();
            });

            wrapper.querySelector('#copy-btn').addEventListener('click', () => this.copyResults());
            wrapper.querySelector('#save-btn').addEventListener('click', () => this.saveResults());

            // Close when clicking outside
            document.addEventListener('mousedown', (e) => {
                if (!this.isVisible) return;

                // If click is inside our container, do nothing
                if (this.container.contains(e.target)) return;

                // If click is inside shadow root (handled by composedPath)
                const path = e.composedPath();
                if (path.includes(this.container) || path.includes(wrapper)) return;

                this.hide();
            });
        }

        toggle() {
            console.log('[SmartCollector] toggle() called, isVisible:', this.isVisible, 'container:', this.container);

            if (!this.container) {
                console.log('[SmartCollector] Container not created yet, calling createUI()...');
                this.createUI();
            }

            if (this.isVisible) {
                console.log('[SmartCollector] Bar is visible, hiding...');
                this.hide();
            } else {
                console.log('[SmartCollector] Bar is hidden, showing...');
                this.show();
            }
        }

        show() {
            console.log('[SmartCollector] show() called');
            this.isVisible = true;
            const container = this.shadowRoot.querySelector('.magic-bar-container');
            console.log('[SmartCollector] Container element:', container);
            if (container) {
                container.classList.add('visible');
                console.log('[SmartCollector] Added "visible" class, attempting to focus input...');
                setTimeout(() => {
                    console.log('[SmartCollector] Focusing input:', this.input);
                    this.input.focus();
                }, 50);
            } else {
                console.error('[SmartCollector] ERROR: Container not found in shadow root!');
            }
        }
        hide() {
            this.isVisible = false;
            const container = this.shadowRoot.querySelector('.magic-bar-container');
            container.classList.remove('visible');
        }

        async handleExtraction() {
            const query = this.input.value.trim();
            if (!query) return;

            // Check if we're in paste mode (PDF/document detected)
            const pasteArea = this.shadowRoot.querySelector('.paste-area');
            const pasteInput = this.shadowRoot.querySelector('#paste-input');

            // Try to get text: selected > pasted > page
            const selectedText = window.getSelection().toString().trim();
            const fullPageText = document.body.innerText;
            const pastedText = pasteInput ? pasteInput.value.trim() : '';

            let pageText;
            let source;

            if (selectedText && selectedText.length > 10) {
                // Priority 1: User selected text
                pageText = selectedText.substring(0, 100000);
                source = 'selected text';
                console.log('[SmartCollector] Using selected text:', pageText.length, 'characters');
            } else if (pastedText.length > 10) {
                // Priority 2: User pasted text (for PDFs/docs)
                pageText = pastedText.substring(0, 100000);
                source = 'pasted text';
                console.log('[SmartCollector] Using pasted text:', pageText.length, 'characters');
            } else if (fullPageText.length > 0) {
                // Priority 3: Full page text
                pageText = fullPageText.substring(0, 100000);
                source = 'full page';

                // Warn user if page is very large (over 100k)
                if (fullPageText.length > 100000) {
                    const continueExtraction = confirm(
                        `⚠️ Large Page Warning\n\n` +
                        `Extracting from large pages may:\n` +
                        `• Take longer to process\n` +
                        `• Use more AI tokens (costs)\n` +
                        `• Only analyze first 100k characters\n\n` +
                        `TIP: Select specific text before extracting to be more precise.\n\n` +
                        `Continue with extraction?`
                    );

                    if (!continueExtraction) {
                        return;
                    }
                }

                console.log('[SmartCollector] Using full page text:', pageText.length, 'characters');
            } else {
                // No text available - show paste area
                if (pasteArea && pasteArea.classList.contains('hidden')) {
                    pasteArea.classList.remove('hidden');
                    pasteInput.focus();
                    return;
                } else {
                    alert('No text detected. Please copy and paste the text you want to extract.');
                    return;
                }
            }

            const isVerificationActive = pageText.length > 15000;
            this.setLoading(true, isVerificationActive);
            this.clearResults();

            console.log('[SmartCollector] Sending to AI - Text length:', pageText.length);
            console.log('[SmartCollector] First 500 chars:', pageText.substring(0, 500));

            try {
                // Send to background for AI processing
                const response = await chrome.runtime.sendMessage({
                    action: 'aiExtract',
                    text: pageText,
                    query: query
                });

                if (response.success) {
                    console.log(`[SmartCollector] Extraction successful from ${source}, found ${response.data.length} results`);
                    this.renderResults(response.data);
                } else {
                    alert('Extraction failed: ' + response.error);
                }
            } catch (error) {
                console.error('Extraction error:', error);
                alert('An error occurred during extraction.');
            } finally {
                this.setLoading(false);
            }
        }

        setLoading(isLoading, isVerificationActive = false) {
            if (isLoading) {
                this.loadingIndicator.classList.add('active');
                this.extractBtn.disabled = true;
                if (isVerificationActive) {
                    this.extractBtn.textContent = 'Extracting & Verifying...';
                } else {
                    this.extractBtn.textContent = 'Extracting...';
                }
            } else {
                this.loadingIndicator.classList.remove('active');
                this.extractBtn.disabled = false;
                this.extractBtn.textContent = 'Extract';
            }
        }

        clearResults() {
            this.resultsArea.classList.remove('has-results');
            this.footerActions.classList.remove('visible');
            this.table.querySelector('thead').innerHTML = '';
            this.table.querySelector('tbody').innerHTML = '';
            this.currentData = null;
        }

        renderResults(data) {
            console.log('[SmartCollector] renderResults called with data:', data);
            console.log('[SmartCollector] data type:', typeof data, 'isArray:', Array.isArray(data));

            if (!data || !Array.isArray(data) || data.length === 0) {
                console.error('[SmartCollector] Invalid data received:', data);
                alert('No structured data found. The AI returned: ' + (data ? JSON.stringify(data).substring(0, 200) : 'null'));
                return;
            }

            // Validate that array contains objects, not strings
            if (typeof data[0] !== 'object' || data[0] === null || Array.isArray(data[0])) {
                console.error('[SmartCollector] Invalid data format. Expected array of objects, got:', data);
                alert('AI returned invalid format. First item: ' + JSON.stringify(data[0]).substring(0, 200));
                return;
            }

            this.currentData = data;
            this.resultsArea.classList.add('has-results');
            this.footerActions.classList.add('visible');

            // Get headers from first object
            const headers = Object.keys(data[0]);
            console.log('[SmartCollector] Table headers:', headers);
            const thead = this.table.querySelector('thead');
            const tbody = this.table.querySelector('tbody');

            // Render headers
            const headerRow = document.createElement('tr');
            headers.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header.charAt(0).toUpperCase() + header.slice(1).replace(/_/g, ' ');
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            // Render rows
            data.forEach(item => {
                const row = document.createElement('tr');
                headers.forEach(header => {
                    const td = document.createElement('td');
                    td.textContent = item[header] || '-';
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
        }

        copyResults() {
            if (!this.currentData) return;

            // Convert to CSV-like string for clipboard
            const headers = Object.keys(this.currentData[0]);
            const csv = [
                headers.join('\t'),
                ...this.currentData.map(row => headers.map(h => row[h]).join('\t'))
            ].join('\n');

            navigator.clipboard.writeText(csv);
            const btn = this.shadowRoot.querySelector('#copy-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        }

        saveResults() {
            if (!this.currentData) return;

            chrome.runtime.sendMessage({
                action: 'saveExtractedData',
                data: this.currentData,
                source: {
                    url: window.location.href,
                    title: document.title
                },
                query: this.input.value
            });

            const btn = this.shadowRoot.querySelector('#save-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Saved!';
            setTimeout(() => {
                btn.textContent = originalText;
                this.hide();
            }, 1500);
        }
    }

    // Initialize
    const magicBar = new SmartCollectorMagicBar();
    magicBar.init();

})();
