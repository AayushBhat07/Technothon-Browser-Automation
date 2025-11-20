import { storage } from './modules/storage.js';
import { ExportManager } from './modules/export.js';
import { EnrichmentManager } from './modules/enrichment.js';
import { ValidationManager } from './modules/validation.js';
import { MappingManager } from './modules/mapping.js';
import { TemplateManager } from './modules/templates.js';
import { aiManager } from './modules/ai.js';


let currentCollectionId = null;
let currentExtractionItem = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCollections();
    setupEventListeners();
});

async function loadCollections() {
    const collections = await storage.getCollections();
    const list = document.getElementById('collections-list');
    list.innerHTML = '';

    collections.forEach(c => {
        const li = document.createElement('li');
        li.className = `collection-item ${c.id === currentCollectionId ? 'active' : ''}`;
        li.innerHTML = `
      <span class="collection-name">${c.name}</span>
      <span class="collection-count">${c.items.length}</span>
    `;
        li.onclick = () => selectCollection(c.id);
        list.appendChild(li);
    });

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

    // Enable enrich/template buttons if items exist
    const enrichBtn = document.getElementById('enrich-btn');
    const templateBtn = document.getElementById('template-btn');
    const hasItems = collection.items.length > 0;
    enrichBtn.disabled = !hasItems;
    templateBtn.disabled = !hasItems;
}

function renderItems(items) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No items in this collection</p></div>';
        return;
    }

    items.forEach((item, index) => {
        const validation = ValidationManager.validateItem(item);
        const card = document.createElement('div');
        card.className = `item-card ${validation.status}`;
        card.dataset.index = index; // Store the index for later reference

        // Check if item qualifies for AI extraction
        const qualifiesForExtraction = shouldShowExtractionButton(item);

        // Build enriched data display
        let enrichedHtml = '';
        if (item.enriched && Object.keys(item.enriched).length > 0) {
            enrichedHtml = '<div class="enriched-data">';
            Object.entries(item.enriched).forEach(([key, value]) => {
                enrichedHtml += `<div class="enriched-field"><strong>${key}:</strong> ${value}</div>`;
            });
            enrichedHtml += '</div>';
        }

        // Display structured data if item type is 'structured' or ai_extracted
        let structuredHtml = '';
        if (item.type === 'structured' || item.ai_extracted) {
            structuredHtml = '<div class="enriched-data" style="background-color: #faf5ff; border-color: #c084fc;">';
            Object.entries(item.data).forEach(([key, value]) => {
                if (key !== 'raw_text' && key !== 'content') {
                    structuredHtml += `<div class="enriched-field" style="color: #6b21a8;"><strong>${key}:</strong> ${value}</div>`;
                }
            });
            structuredHtml += '</div>';
        }

        card.innerHTML = `
      <div style="display: flex; align-items: start; gap: 8px;">
        <input type="checkbox" class="item-checkbox" data-index="${index}" style="margin-top: 4px;">
        <div style="flex: 1;" class="item-content-wrapper" data-item-index="${index}">
          <h4>${item.data.content}</h4>
          <p>${item.source.title}</p>
          ${item.enriched && Object.keys(item.enriched).length > 0 ?
                `<div class="enriched-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle;">
                <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275z"/>
              </svg>
              Enriched
            </div>` : ''}
          ${item.ai_extracted ? '<div class="ai-extracted-badge">✨ AI Extracted</div>' : ''}
          ${enrichedHtml}
          ${structuredHtml}
          ${validation.status !== 'valid' ?
                `<div class="validation-badge ${validation.status}">${validation.issues[0]}</div>` : ''}
          <div class="item-footer">
            <span>${item.type}</span>
            <span>${new Date(item.timestamp).toLocaleDateString()}</span>
          </div>
          ${qualifiesForExtraction && !item.ai_extracted ?
                `<button class="ai-extract-btn" data-item-index="${index}">
              🤖 Extract Structure with AI
            </button>` : ''}
        </div>
      </div>
    `;
        container.appendChild(card);
    });

    // Add click handlers for viewing details
    document.querySelectorAll('.item-content-wrapper').forEach(wrapper => {
        wrapper.style.cursor = 'pointer';
        wrapper.addEventListener('click', async (e) => {
            const index = parseInt(wrapper.dataset.itemIndex);
            await showItemDetail(items[index]);
        });
    });
}

async function showItemDetail(item) {
    const modal = document.getElementById('item-detail-modal');
    const detailBody = document.getElementById('detail-body');

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
        <div class="detail-content" style="background: #f1f5f9;">
          ${item.data.raw_text}
        </div>
      </div>
    `;
    }

    // Build enriched data section
    let enrichedSection = '';
    if (item.enriched && Object.keys(item.enriched).length > 0) {
        enrichedSection = `
      <div class="detail-section">
        <h4>Enriched Data</h4>
        <div class="detail-content">
          ${Object.entries(item.enriched).map(([key, value]) =>
            `<div style="margin-bottom: 8px;"><strong>${key}:</strong> ${value}</div>`
        ).join('')}
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

    detailBody.innerHTML = `
    ${aiExtractedSection}
    
    ${originalTextSection}
    
    ${!item.ai_extracted ? `
    <div class="detail-section">
      <h4>Content</h4>
      <div class="detail-content">${item.data.content || 'No content'}</div>
    </div>
    ` : ''}
    
    ${enrichedSection}
    
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

function setupEventListeners() {
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

    // Delete Collection Button
    document.getElementById('delete-collection-btn').onclick = async () => {
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

    // Export Button - Direct automatic export!
    document.getElementById('export-btn').onclick = async () => {
        if (currentCollectionId) {
            const collection = await storage.getCollection(currentCollectionId);
            if (collection.items.length === 0) {
                showToast('Collection is empty');
                return;
            }
            // Automatically export with smart field detection
            ExportManager.exportToCSV(collection);
            showToast('✓ Exported successfully!');
        } else {
            showToast('Please select a collection to export');
        }
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
            ...Object.keys(sampleItem.enriched || {}),
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

    // Enrich Button
    const enrichBtn = document.getElementById('enrich-btn');
    enrichBtn.onclick = async () => {
        if (!currentCollectionId) return;

        // Get selected checkboxes
        const checkboxes = document.querySelectorAll('.item-checkbox:checked');

        if (checkboxes.length === 0) {
            alert('Please select at least one item to enrich (use checkboxes).');
            return;
        }

        const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));

        enrichBtn.disabled = true;
        enrichBtn.textContent = 'Enriching...';

        try {
            const collection = await storage.getCollection(currentCollectionId);

            // Only enrich selected items
            const itemsToEnrich = selectedIndices.map(i => collection.items[i]);
            const enrichedItems = await EnrichmentManager.enrichItems(itemsToEnrich, (completed, total) => {
                enrichBtn.textContent = `Enriching ${completed}/${total}`;
            });

            // Update the selected items in the collection
            selectedIndices.forEach((originalIndex, i) => {
                collection.items[originalIndex] = enrichedItems[i];
            });

            await storage.saveCollection(collection);
            await selectCollection(currentCollectionId); // Refresh view
        } catch (error) {
            console.error('Enrichment failed:', error);
            alert('Enrichment failed. See console for details.');
        } finally {
            enrichBtn.disabled = false;
            enrichBtn.textContent = 'Enrich';
        }
    };

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
        const inputs = extractionFieldsContainer.querySelectorAll('input');
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

        // Store original text
        updatedItem.data.raw_text = updatedItem.data.content;

        // Replace data with extracted fields
        updatedItem.data = extractedFields;

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

