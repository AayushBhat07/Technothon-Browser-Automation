/**
 * Magic Input Bar Content Script
 * Injects a floating input bar for AI-powered data extraction.
 */

// PDF Extractor - uses global pdfjsLib loaded via manifest
class PDFExtractor {
    constructor() {
        this.isLoaded = false;
        this.pdfjsLib = null;
    }

    init() {
        if (this.isLoaded) return;

        try {
            // pdfjsLib should be available globally from manifest content_scripts
            if (typeof window.pdfjsLib !== 'undefined') {
                this.pdfjsLib = window.pdfjsLib;
                // Set the worker source to the local file in the extension
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
                this.isLoaded = true;
                console.log('[PDF Extractor] pdfjsLib initialized from global scope');
            } else {
                console.error('[PDF Extractor] pdfjsLib not found in global scope');
            }
        } catch (error) {
            console.error('[PDF Extractor] Initialization failed:', error);
        }
    }

    isPDFPage() {
        const url = window.location.href;
        return url.toLowerCase().endsWith('.pdf') ||
            document.querySelector('embed[type="application/pdf"]') !== null;
    }

    async checkFilePermission() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'checkFilePermission' }, (response) => {
                resolve(response && response.isAllowed);
            });
        });
    }

    async extractTextFromCurrentPDF(onProgress) {
        this.init();

        if (!this.isLoaded) {
            throw new Error('PDF extractor library not loaded. Please reload the extension.');
        }

        const pdfUrl = this.getPDFUrl();
        if (!pdfUrl) {
            throw new Error('Could not find PDF URL');
        }

        // Proactive check for local files
        if (pdfUrl.startsWith('file://')) {
            const isAllowed = await this.checkFilePermission();
            if (!isAllowed) {
                throw new Error('FILE_PERMISSION_MISSING');
            }
        }

        try {
            console.log('[PDF Extractor] Loading PDF as ArrayBuffer via XHR:', pdfUrl);

            // XMLHttpRequest is often more reliable than fetch for file:// URLs in extensions
            const uint8Array = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', pdfUrl, true);
                xhr.responseType = 'arraybuffer';

                xhr.onload = () => {
                    if (xhr.status === 200 || (pdfUrl.startsWith('file://') && xhr.status === 0)) {
                        if (xhr.response) {
                            resolve(new Uint8Array(xhr.response));
                        } else {
                            reject(new Error('Empty response received from local file'));
                        }
                    } else {
                        reject(new Error(`XHR failed with status ${xhr.status}`));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error('Network/Access error (XHR failed). Ensure local file permission is enabled.'));
                };

                xhr.send();
            });

            console.log('[PDF Extractor] Starting PDF.js extraction with', uint8Array.length, 'bytes');

            // Pass the data directly instead of the URL
            const loadingTask = this.pdfjsLib.getDocument({ data: uint8Array });
            const pdf = await loadingTask.promise;
            console.log('[PDF Extractor] PDF loaded successfully, pages:', pdf.numPages);

            let fullText = '';
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';

                if (onProgress) {
                    onProgress(pageNum, pdf.numPages);
                }
            }

            console.log('[PDF Extractor] Extraction complete:', fullText.length, 'characters');
            return fullText;
        } catch (error) {
            console.error('[PDF Extractor] Extraction failed:', error);

            if (error.message === 'FILE_PERMISSION_MISSING') {
                throw error;
            }

            // Special handling for local file access denials
            if (pdfUrl.startsWith('file://')) {
                throw new Error(
                    `Access Denied to local PDF.\n\n` +
                    `PERMISSION STATUS: Your browser is blocking direct file access.\n\n` +
                    `FIX:\n` +
                    `1. Go to chrome://extensions\n` +
                    `2. Find Smart Web Collector -> Details\n` +
                    `3. Ensure "Allow access to file URLs" is TOGGLED ON.\n` +
                    `4. RESTART CHROME (sometimes required for file permissions to take effect).\n` +
                    `5. Refresh this page.`
                );
            }
            throw error;
        }
    }

    getPDFUrl() {
        if (window.location.href.endsWith('.pdf')) return window.location.href;

        const embed = document.querySelector('embed[type="application/pdf"]');
        if (embed && embed.src) return embed.src;

        const object = document.querySelector('object[type="application/pdf"]');
        if (object && object.data) return object.data;

        return null;
    }
}

const pdfExtractor = new PDFExtractor();

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

            // Listen for messages from background script
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                console.log('[SmartCollector v2.1] Magic Bar received message:', request);
                if (request.action === 'toggleMagicBar') {
                    console.log('[SmartCollector v2.1] Toggling Magic Bar...');
                    this.toggle();
                    sendResponse({ success: true }); // Acknowledge message
                }
            });

            console.log('[SmartCollector v2.1] Magic Bar listener registered successfully');
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
                    max-height: 90vh;
                    overflow: hidden;
                }

                .magic-bar-container.visible {
                    opacity: 1 !important;
                    transform: translateY(0) !important;
                    display: flex !important;
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

                .permission-banner {
                    background: #FEF2F2;
                    border: 1px solid #FCA5A5;
                    border-radius: 8px;
                    padding: 12px;
                    display: none;
                    flex-direction: column;
                    gap: 8px;
                }

                .permission-banner.active {
                    display: flex;
                }

                .permission-banner h4 {
                    margin: 0;
                    color: #991B1B;
                    font-size: 14px;
                    font-weight: 600;
                }

                .permission-banner p {
                    margin: 0;
                    color: #7F1D1D;
                    font-size: 13px;
                    line-height: 1.4;
                }

                .permission-banner .steps {
                    margin: 4px 0;
                    padding-left: 20px;
                    color: #B91C1C;
                    font-size: 12px;
                }

                .hidden {
                    display: none !important;
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

                <div class="permission-banner" id="permission-banner">
                    <h4>Local File Access Required</h4>
                    <p>Chrome blocks extension access to local PDFs by default. To enable automatic extraction:</p>
                    <ol class="steps">
                        <li>Go to <b>chrome://extensions</b></li>
                        <li>Find <b>Smart Web Collector</b> &rarr; <b>Details</b></li>
                        <li>Toggle <b>ON</b> "Allow access to file URLs"</li>
                        <li>Refresh this page</li>
                    </ol>
                    <button class="secondary-btn" style="align-self: flex-start; margin-top: 4px;" id="refresh-instruction-btn">I've enabled it, refresh page</button>
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
                    <div style="flex: 1;"></div>
                    <select class="collection-selector" id="collection-select">
                        <option value="default">AI Extractions</option>
                    </select>
                    <button class="secondary-btn" id="save-new-btn">Extract to New Collection</button>
                    <button class="action-btn" id="save-btn">Save to Existing Collection</button>
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
            this.collectionSelect = wrapper.querySelector('#collection-select');
            this.saveBtn = wrapper.querySelector('#save-btn');
            this.saveNewBtn = wrapper.querySelector('#save-new-btn');

            this.extractBtn.addEventListener('click', () => this.handleExtraction());
            this.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.handleExtraction();
                if (e.key === 'Escape') this.hide();
            });

            wrapper.querySelector('#copy-btn').addEventListener('click', () => this.copyResults());
            this.saveBtn.addEventListener('click', () => this.saveResults());
            this.saveNewBtn.addEventListener('click', () => this.saveToNewCollection());

            const refreshBtn = wrapper.querySelector('#refresh-instruction-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => window.location.reload());
            }

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
            // Reset permission banner when hiding
            const banner = this.shadowRoot.querySelector('#permission-banner');
            if (banner) banner.classList.remove('active');
        }

        showPermissionBanner() {
            const banner = this.shadowRoot.querySelector('#permission-banner');
            if (banner) {
                banner.classList.add('active');
                this.resultsArea.classList.remove('has-results');
                this.footerActions.classList.remove('visible');
                this.loadingIndicator.classList.remove('active');
            }
        }

        async handleExtraction() {
            const query = this.input.value.trim();
            if (!query) return;

            // Check if we're in paste mode (for fallback)
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
            } else if (pdfExtractor.isPDFPage()) {
                // Priority 2: Automatic PDF extraction
                try {
                    this.setLoading(true, false);
                    const loadingSpan = this.loadingIndicator.querySelector('span');
                    loadingSpan.textContent = 'Extracting PDF content...';
                    console.log('[SmartCollector] PDF detected, extracting text automatically...');

                    pageText = await pdfExtractor.extractTextFromCurrentPDF((current, total) => {
                        // Update progress
                        loadingSpan.textContent = `Extracting PDF: page ${current}/${total}...`;
                    });

                    if (!pageText) {
                        throw new Error('No text content could be extracted from this PDF.');
                    }

                    source = 'PDF extraction';

                    // Reset loading text
                    loadingSpan.textContent = 'Analyzing page content...';
                    console.log('[SmartCollector] PDF extraction complete:', pageText.length, 'characters');
                } catch (error) {
                    console.error('[SmartCollector] PDF extraction failed:', error);
                    this.setLoading(false); // ALWAYS reset loading on error

                    if (error.message === 'FILE_PERMISSION_MISSING') {
                        this.showPermissionBanner();
                        return;
                    }

                    // Fallback to paste mode on PDF extraction failure
                    if (pasteArea && pasteArea.classList.contains('hidden')) {
                        pasteArea.classList.remove('hidden');
                        pasteInput.focus();
                        alert(
                            'PDF Extraction Failed\n\n' +
                            'Error: ' + error.message + '\n\n' +
                            'Chrome\'s PDF viewer has security restrictions that prevent automatic extraction.\n\n' +
                            'Workaround: Please copy the text from the PDF and paste it below.'
                        );
                        this.setLoading(false); // Reset loading if user cancels or we show fallback
                        return;
                    }
                    this.setLoading(false); // Reset loading if we returned early
                    return;
                }
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
                    query: query
                });

                if (response.success) {
                    console.log(`[SmartCollector] Extraction successful from ${source}, found ${response.data.length} results`);
                    this.renderResults(response.data);
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

            // Get headers from first object
            const headers = Object.keys(data[0]);
            console.log('[SmartCollector] Table headers:', headers);
            const thead = this.table?.querySelector('thead');
            const tbody = this.table?.querySelector('tbody');

            if (!thead || !tbody) {
                console.error('[SmartCollector] Table elements not found');
                return;
            }

            // Clear existing content
            thead.innerHTML = '';
            tbody.innerHTML = '';

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
