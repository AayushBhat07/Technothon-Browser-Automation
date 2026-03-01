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
            console.log('[SmartCollector v2.1] Magic Bar init() called, setting up message listener...');

            // Listen for messages from background script and sidepanel
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                console.log('[SmartCollector v2.1] Magic Bar received message:', request);
                if (request.action === 'toggleMagicBar') {
                    console.log('[SmartCollector v2.1] Toggling Magic Bar...');
                    this.toggle();
                    sendResponse({ success: true });
                }
                if (request.action === 'setMagicBarTriggerVisibility') {
                    this.setTriggerVisibility(request.visible);
                    sendResponse({ success: true });
                }
            });

            // Check preference and create floating trigger if enabled
            this.initFloatingTrigger();

            console.log('[SmartCollector v2.1] Magic Bar listener registered successfully');
        }

        /**
         * Checks preference and creates the floating trigger if enabled.
         */
        async initFloatingTrigger() {
            try {
                const result = await chrome.storage.sync.get(['magic_bar_enabled']);
                if (result.magic_bar_enabled === true) {
                    this.createFloatingTrigger();
                } else {
                    console.log('[SmartCollector] Magic Bar trigger disabled by preference.');
                }
            } catch (e) {
                // Fallback: show trigger if storage fails
                this.createFloatingTrigger();
            }
        }

        /**
         * Shows or hides the floating trigger.
         */
        setTriggerVisibility(visible) {
            const trigger = document.getElementById('smart-collector-floating-trigger');
            if (visible) {
                if (!trigger) {
                    this.createFloatingTrigger();
                } else {
                    trigger.style.display = 'flex';
                }
            } else {
                if (trigger) {
                    trigger.style.display = 'none';
                }
            }
        }

        /**
         * Creates a floating ✨ button in the bottom-right corner to toggle the Magic Bar.
         */
        createFloatingTrigger() {
            // Prevent duplicate
            if (document.getElementById('smart-collector-floating-trigger')) return;

            const trigger = document.createElement('div');
            trigger.id = 'smart-collector-floating-trigger';
            trigger.innerHTML = '✨';
            trigger.title = 'Smart Collector Magic Bar (Cmd+Z)';

            // Inline styles, max z-index, non-intrusive
            Object.assign(trigger.style, {
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                color: 'white',
                fontSize: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                zIndex: '2147483646',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                userSelect: 'none'
            });

            trigger.addEventListener('mouseenter', () => {
                trigger.style.transform = 'scale(1.1)';
                trigger.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.5)';
            });

            trigger.addEventListener('mouseleave', () => {
                trigger.style.transform = 'scale(1)';
                trigger.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.4)';
            });

            trigger.addEventListener('click', () => {
                this.toggle();
            });

            document.body.appendChild(trigger);
            console.log('[SmartCollector] Floating trigger button created.');
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
                this.collectionSelect = wrapper.querySelector('#collection-select');
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
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    pointer-events: none; /* Pass through clicks */
                }

                .magic-bar-container {
                    position: absolute; /* Changed from default flow */
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-20px); /* Centered + Offset for animation */
                    width: 600px;
                    max-width: 90vw;
                    
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: auto; /* Re-enable clicks */
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    max-height: 90vh;
                    overflow: hidden;
                }

                .magic-bar-container.visible {
                    opacity: 1 !important;
                    transform: translateX(-50%) translateY(0) !important;
                    display: flex !important;
                }

                /* Magic Trigger Button */
                .magic-trigger {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    width: 40px;
                    height: 40px;
                    background: white;
                    border-radius: 50%;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.05);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    pointer-events: auto;
                    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    opacity: 0.6;
                    color: #6366F1;
                }

                .magic-trigger:hover {
                    opacity: 1;
                    transform: scale(1.1);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
                }

                .magic-trigger svg {
                    width: 20px;
                    height: 20px;
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
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    border-top: 1px solid #E5E7EB;
                    padding-top: 12px;
                    display: none;
                }

                .results-area.has-results {
                    display: block !important;
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
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 8px;
                    display: none;
                }

                .footer-actions.visible {
                    display: flex !important;
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

                .collection-selector {
                    flex: 1;
                    padding: 6px 8px;
                    border: 1px solid #E5E7EB;
                    border-radius: 6px;
                    font-size: 13px;
                    color: #4B5563;
                    background: white;
                    outline: none;
                    cursor: pointer;
                    max-width: 200px;
                }

                .collection-selector:focus {
                    border-color: #6366F1;
                    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
                }

                .hidden {
                    display: none !important;
                }
                
                /* Mode Toggle Switch */
                .mode-toggle-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 4px;
                }
                .mode-toggle {
                    display: flex;
                    background: #F3F4F6;
                    border-radius: 8px;
                    padding: 4px;
                    position: relative;
                }
                .mode-btn {
                    padding: 6px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    color: #6B7280;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    z-index: 1;
                }
                .mode-btn.active {
                    color: #6366F1;
                }
                .mode-indicator {
                    position: absolute;
                    top: 4px;
                    bottom: 4px;
                    left: 4px;
                    width: calc(50% - 4px);
                    background: white;
                    border-radius: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    transition: transform 0.2s ease;
                    z-index: 0;
                }
            `;

            // HTML Structure
            const wrapper = document.createElement('div');
            wrapper.className = 'magic-bar-container';
            wrapper.innerHTML = `
                <div class="mode-toggle-wrapper">
                    <div class="mode-toggle">
                        <div class="mode-indicator"></div>
                        <div class="mode-btn active" data-mode="page">Page Data</div>
                        <div class="mode-btn" data-mode="rss">RSS Feeds</div>
                    </div>
                </div>
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

                <div class="feed-banner" style="display:none; padding: 10px 12px; background: linear-gradient(135deg, #dbeafe, #ede9fe); border-radius: 8px; margin-bottom: 4px; font-size: 12px; color: #4338ca;">
                    <div style="display:flex; align-items:center; gap:6px; font-weight:600; margin-bottom:4px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                        <span class="feed-banner-title">Feed Ingestion</span>
                    </div>
                    <span class="feed-banner-details"></span>
                </div>

                <div class="paste-area hidden">
                    <div style="padding: 12px; background: #FEF3C7; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400E" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span style="font-size: 13px; font-weight: 500; color: #92400E;">Document Detected</span>
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
                    <div style="flex: 1;"></div>
                    <select class="collection-selector" id="collection-select">
                        <option value="default">AI Extractions</option>
                    </select>
                    <button class="secondary-btn" id="save-new-btn">Extract to New Collection</button>
                    <button class="action-btn" id="save-btn">Save to Existing Collection</button>
                </div>
            `;

            // Trigger Button
            const trigger = document.createElement('div');
            trigger.className = 'magic-trigger';
            trigger.title = 'Open Smart Collector';
            trigger.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
            `;
            trigger.addEventListener('click', (e) => {
                // Prevent propagation to document
                e.stopPropagation();
                this.toggle();
            });

            this.shadowRoot.appendChild(style);
            this.shadowRoot.appendChild(wrapper);
            this.shadowRoot.appendChild(trigger);
            document.body.appendChild(this.container);

            // Bind events
            this.input = wrapper.querySelector('input');
            this.extractBtn = wrapper.querySelector('#extract-btn');
            this.resultsArea = wrapper.querySelector('.results-area');
            this.loadingIndicator = wrapper.querySelector('.loading-indicator');
            this.footerActions = wrapper.querySelector('.footer-actions');
            this.table = wrapper.querySelector('#results-table');
            this.collectionSelect = wrapper.querySelector('#collection-select');
            this.saveBtn = wrapper.querySelector('#save-btn');
            this.saveNewBtn = wrapper.querySelector('#save-new-btn');
            this.modeToggleBtns = wrapper.querySelectorAll('.mode-btn');
            this.modeIndicator = wrapper.querySelector('.mode-indicator');
            this.currentMode = 'page';

            this.modeToggleBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.modeToggleBtns.forEach(b => b.classList.remove('active'));
                    const target = e.target;
                    target.classList.add('active');
                    this.currentMode = target.dataset.mode;

                    // Move indicator
                    if (this.currentMode === 'rss') {
                        this.modeIndicator.style.transform = 'translateX(100%)';
                        this.input.placeholder = "Ask AI for news (e.g., 'Get latest AI funding news')...";
                    } else {
                        this.modeIndicator.style.transform = 'translateX(0)';
                        this.input.placeholder = "Ask AI to extract data (e.g., 'Get all job titles and salaries')...";
                    }
                });
            });

            this.extractBtn.addEventListener('click', () => this.handleExtraction());
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleExtraction();
                if (e.key === 'Escape') this.hide();
            });

            wrapper.querySelector('#copy-btn').addEventListener('click', () => this.copyResults());
            this.saveNewBtn.addEventListener('click', () => this.saveToNewCollection());

            // Close when clicking outside
            document.addEventListener('mousedown', (e) => {
                if (!this.isVisible) return;

                // If click is inside our container, do nothing
                if (this.container.contains(e.target)) return;

                // If click is inside shadow root (handled by composedPath)
                const path = e.composedPath();
                if (path.includes(this.container) || path.includes(wrapper) || path.includes(trigger)) return;

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
            if (container) {
                container.classList.remove('visible');
            }
        }

        async handleExtraction() {
            const query = this.input.value.trim();
            if (!query) return;

            const isFeedMode = this.currentMode === 'rss';

            if (isFeedMode) {
                // Feed queries don't require page text
                this.setLoading(true, true);
                this.clearResults();
                const loadingSpan = this.loadingIndicator.querySelector('span');
                if (loadingSpan) loadingSpan.textContent = 'Fetching external feeds & extracting data...';

                try {
                    const response = await chrome.runtime.sendMessage({
                        action: 'aiExtract',
                        text: '', // Feed queries don't need page text
                        query: query,
                        url: window.location.href,
                        title: document.title
                    });

                    if (response.success) {
                        console.log('[SmartCollector] Feed extraction successful');
                        this.renderResults(response.data);
                        // Show feed banner
                        if (response.data.feedMetadata) {
                            this.showFeedBanner(response.data.feedMetadata);
                        }
                    } else {
                        alert('Feed extraction failed: ' + response.error);
                    }
                } catch (error) {
                    console.error('[SmartCollector] Feed extraction error:', error);
                    alert('Feed extraction error: ' + error.message);
                } finally {
                    this.setLoading(false);
                    const loadingSpan2 = this.loadingIndicator.querySelector('span');
                    if (loadingSpan2) loadingSpan2.textContent = 'Analyzing page content...';
                }
                return;
            }

            // --- Standard Page Extraction (existing logic) ---
            const pasteArea = this.shadowRoot.querySelector('.paste-area');
            const pasteInput = this.shadowRoot.querySelector('#paste-input');

            // Try to get text: selected > PDF extraction > pasted > page
            const selectedText = window.getSelection().toString().trim();
            const pastedText = pasteInput ? pasteInput.value.trim() : '';

            let pageText;
            let source;

            if (selectedText && selectedText.length > 10) {
                // Priority 1: User selected text
                pageText = selectedText.substring(0, 100000);
                source = 'selected text';
                console.log('[SmartCollector] Using selected text:', pageText.length, 'characters');
            } else if (pastedText.length > 10) {
                // Priority 3: User pasted text (for non-PDF documents)
                pageText = pastedText.substring(0, 100000);
                source = 'pasted text';
                console.log('[SmartCollector] Using pasted text:', pageText.length, 'characters');
            } else {
                // Priority 4: Full page text
                const fullPageText = document.body.innerText;

                if (fullPageText.length > 0) {
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
                    // No text available - show paste area as last resort
                    if (pasteArea && pasteArea.classList.contains('hidden')) {
                        pasteArea.classList.remove('hidden');
                        pasteInput.focus();
                        return;
                    } else {
                        alert('No text detected. Please copy and paste the text you want to extract.');
                        this.setLoading(false);
                        return;
                    }
                }
            }

            console.log('[SmartCollector] Finalizing check - pageText length:', pageText?.length || 0);

            if (!pageText || pageText.length < 5) {
                alert('Insufficient text found for extraction.');
                this.setLoading(false);
                return;
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
                    query: query,
                    url: window.location.href, // Include URL for audit
                    title: document.title      // Include Title for audit
                });

                if (response.success) {
                    console.log(`[SmartCollector] Extraction successful from ${source}, found ${response.data.length} results`);
                    this.renderResults(response.data);
                    // Show feed banner if feed metadata is present
                    if (response.data.feedMetadata) {
                        this.showFeedBanner(response.data.feedMetadata);
                    }
                } else {
                    console.error('[SmartCollector] AI extraction failed:', response.error);

                    // Specific handle for parse errors
                    if (response.error.includes('parse') || response.error.includes('structure')) {
                        if (pasteArea && pasteArea.classList.contains('hidden')) {
                            pasteArea.classList.remove('hidden');
                            pasteInput.focus();
                            alert(
                                'AI Parsing Failed\n\n' +
                                'The AI found the data but couldn\'t format it into a table correctly.\n\n' +
                                'Workaround: I\'ve opened the box below. Please copy/paste the text manually and I will try once more with a simplified prompt.'
                            );
                            return;
                        }
                    }
                    alert('Extraction failed: ' + response.error);
                }
            } catch (error) {
                console.error('Extraction error:', error);

                // Fallback to paste area on general extraction error
                if (pasteArea && pasteArea.classList.contains('hidden')) {
                    pasteArea.classList.remove('hidden');
                    pasteInput.focus();
                }

                alert('An error occurred during extraction. Please try manually pasting some text below.');
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
            if (this.resultsArea) this.resultsArea.classList.remove('has-results');
            if (this.footerActions) this.footerActions.classList.remove('visible');
            const thead = this.table?.querySelector('thead');
            const tbody = this.table?.querySelector('tbody');
            if (thead) thead.innerHTML = '';
            if (tbody) tbody.innerHTML = '';
            this.currentData = null;
            // Hide feed banner
            const banner = this.shadowRoot?.querySelector('.feed-banner');
            if (banner) banner.style.display = 'none';
        }

        showFeedBanner(feedMetadata) {
            const banner = this.shadowRoot?.querySelector('.feed-banner');
            if (!banner) return;

            const title = banner.querySelector('.feed-banner-title');
            const details = banner.querySelector('.feed-banner-details');

            if (title) title.textContent = `Feed Ingestion — ${feedMetadata.topic}`;
            if (details) {
                const sources = feedMetadata.sourcesUsed.map(s => s.name).join(', ');
                const time = new Date(feedMetadata.retrievedAt).toLocaleTimeString();
                details.textContent = `${feedMetadata.totalFeedEntries} entries retrieved from ${feedMetadata.feedCount} feed(s), showing top ${feedMetadata.previewEntries}: ${sources} · Retrieved at ${time}`;
            }

            banner.style.display = 'block';
        }

        renderResults(data) {
            console.log('[SmartCollector v2.1] renderResults called with data:', data);

            // Normalize data
            if (!data) {
                alert('No data received from AI.');
                return;
            }

            // If data is not an array, wrap it
            if (!Array.isArray(data)) {
                data = [data];
            }

            // If empty array
            if (data.length === 0) {
                alert('No structured data found.');
                return;
            }

            // Normalize array items - convert strings to objects
            if (typeof data[0] === 'string') {
                data = data.map((item, idx) => ({ 'Result': item, 'Index': idx + 1 }));
            }

            // Validate that we now have objects
            if (typeof data[0] !== 'object' || data[0] === null || Array.isArray(data[0])) {
                console.error('[SmartCollector] Invalid data format after normalization:', data);
                alert('Could not format data. Please try a different query.');
                return;
            }

            this.currentData = data;
            if (this.resultsArea) this.resultsArea.classList.add('has-results');
            if (this.footerActions) this.footerActions.classList.add('visible');

            // Fetch collections to populate the selector
            this.loadCollections();

            const thead = this.table?.querySelector('thead');
            const tbody = this.table?.querySelector('tbody');

            if (!thead || !tbody) {
                console.error('[SmartCollector] Table elements not found');
                return;
            }

            // Clear existing content
            thead.innerHTML = '';
            tbody.innerHTML = '';

            // CHECK FOR PARAGRAPH MODE
            // If we have exactly 1 item, and it has keys like "Content", "Summary", "Full Text", "Text"
            // AND the value is long (> 50 chars), render as a text block
            const firstItem = data[0];
            const keys = Object.keys(firstItem);
            const isSingleItem = data.length === 1;
            const hasContentKey = keys.some(k => ['content', 'summary', 'full content', 'text', 'full_content', 'paragraph'].includes(k.toLowerCase()));

            if (isSingleItem && (hasContentKey || keys.length === 1)) {
                const contentKey = hasContentKey ? keys.find(k => ['content', 'summary', 'full content', 'text', 'full_content', 'paragraph'].includes(k.toLowerCase())) : keys[0];
                const contentText = firstItem[contentKey];

                if (typeof contentText === 'string' && contentText.length > 50) {
                    console.log('[SmartCollector] Detected Paragraph/Summary mode');

                    // Render as a single cell spanning full width with special styling
                    const row = document.createElement('tr');
                    const td = document.createElement('td');
                    td.colSpan = 1;
                    td.style.whiteSpace = 'pre-wrap';
                    td.style.lineHeight = '1.6';
                    td.style.fontSize = '14px';
                    td.style.color = '#1F2937';
                    td.style.padding = '16px';
                    td.style.backgroundColor = '#F9FAFB';
                    td.style.borderRadius = '8px';
                    td.textContent = contentText;

                    row.appendChild(td);
                    tbody.appendChild(row);

                    // Add a header just for context
                    const headerRow = document.createElement('tr');
                    const th = document.createElement('th');
                    th.textContent = contentKey.replace(/_/g, ' '); // e.g. "Full Content"
                    th.style.textAlign = 'left';
                    headerRow.appendChild(th);
                    thead.appendChild(headerRow);

                    return;
                }
            }

            // Render headers
            const headerRow = document.createElement('tr');
            keys.forEach(header => {
                const th = document.createElement('th');
                th.textContent = header.charAt(0).toUpperCase() + header.slice(1).replace(/_/g, ' ');
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            // Render rows
            data.forEach(item => {
                const row = document.createElement('tr');
                keys.forEach(header => {
                    const td = document.createElement('td');
                    const value = item[header];
                    // Handle long text values
                    if (typeof value === 'string' && value.length > 100) {
                        td.textContent = value.substring(0, 100) + '...';
                        td.title = value; // Show full text on hover
                    } else {
                        td.textContent = value || '-';
                    }
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });

            console.log(`[SmartCollector] Table rendered with ${data.length} rows`);
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

        async loadCollections() {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getCollections' });
                if (response.success && response.collections) {
                    const select = this.collectionSelect;
                    select.innerHTML = '';

                    // Default option
                    const defaultOpt = document.createElement('option');
                    defaultOpt.value = 'default';
                    defaultOpt.textContent = 'AI Extractions';
                    select.appendChild(defaultOpt);

                    // User collections
                    response.collections.forEach(col => {
                        if (col.name !== 'AI Extractions') {
                            const opt = document.createElement('option');
                            opt.value = col.id;
                            opt.textContent = col.name;
                            select.appendChild(opt);
                        }
                    });

                    // Add "Create New..." option
                    const newOpt = document.createElement('option');
                    newOpt.value = 'new';
                    newOpt.textContent = '+ Create New Collection';
                    select.appendChild(newOpt);
                }
            } catch (error) {
                console.warn('[SmartCollector] Failed to load collections:', error);
            }
        }

        saveToNewCollection() {
            if (!this.currentData) return;

            const name = prompt('Enter a name for the new collection:');
            if (!name) return; // Cancelled

            chrome.runtime.sendMessage({
                action: 'saveExtractedData',
                data: this.currentData,
                newCollectionName: name,
                source: {
                    url: window.location.href,
                    title: document.title
                },
                query: this.input.value
            });

            this.feedbackSaved(this.saveNewBtn);
        }

        saveResults() {
            if (!this.currentData) return;

            const collectionId = this.collectionSelect.value;

            // If user somehow triggers existing save but 'new' is selected in dropdown,
            // we'll handle it or just save to default.
            if (collectionId === 'new') {
                this.saveToNewCollection();
                return;
            }

            const targetCollectionId = collectionId === 'default' ? null : collectionId;

            chrome.runtime.sendMessage({
                action: 'saveExtractedData',
                data: this.currentData,
                collectionId: targetCollectionId,
                source: {
                    url: window.location.href,
                    title: document.title
                },
                query: this.input.value
            });

            this.feedbackSaved(this.saveBtn);
        }

        feedbackSaved(button) {
            const originalText = button.textContent;
            button.textContent = 'Saved!';
            button.disabled = true;
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                this.hide();
            }, 1500);
        }
    }

    // Initialize
    const magicBar = new SmartCollectorMagicBar();
    magicBar.init();

})();
