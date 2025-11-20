/**
 * Export Module
 * Handles exporting collections to various formats (CSV, Clipboard).
 */

export const ExportManager = {
    /**
     * Automatically detects all fields from items and exports to CSV
     * @param {Object} collection - The collection to export.
     */
    exportToCSV(collection) {
        if (!collection || !collection.items || collection.items.length === 0) {
            alert('Collection is empty or invalid.');
            return;
        }

        // Auto-detect all unique fields across all items
        const allFields = this.detectAllFields(collection.items);

        // Build CSV with auto-detected fields
        const csvContent = this.buildCSV(collection.items, allFields);

        // Download the file
        this.downloadCSV(csvContent, collection.name);
    },

    /**
     * Detects all unique fields from all items including data, enriched, and AI-extracted fields
     * @param {Array} items - The items to analyze
     * @returns {Array} - Array of field objects with name and source
     */
    detectAllFields(items) {
        const fieldSet = new Set();
        const fieldInfo = {};

        items.forEach(item => {
            // Add fields from item.data (including AI-extracted fields)
            if (item.data) {
                Object.keys(item.data).forEach(key => {
                    // Skip raw_text and html as they're usually too long
                    if (key !== 'raw_text' && key !== 'html') {
                        const fieldKey = `data.${key}`;
                        fieldSet.add(fieldKey);
                        fieldInfo[fieldKey] = { name: this.formatFieldName(key), source: 'data', key };
                    }
                });
            }

            // Add fields from enriched data
            if (item.enriched && Object.keys(item.enriched).length > 0) {
                Object.keys(item.enriched).forEach(key => {
                    const fieldKey = `enriched.${key}`;
                    fieldSet.add(fieldKey);
                    fieldInfo[fieldKey] = { name: this.formatFieldName(key) + ' (Enriched)', source: 'enriched', key };
                });
            }
        });

        // Always include basic metadata
        const metadataFields = [
            { fieldKey: 'type', name: 'Type', source: 'meta' },
            { fieldKey: 'source.title', name: 'Source Title', source: 'meta' },
            { fieldKey: 'source.url', name: 'Source URL', source: 'meta' },
            { fieldKey: 'timestamp', name: 'Saved Date', source: 'meta' },
            { fieldKey: 'ai_extracted', name: 'AI Extracted', source: 'meta' }
        ];

        // Build final field list
        const fields = Array.from(fieldSet).map(key => ({
            fieldKey: key,
            ...fieldInfo[key]
        }));

        // Add metadata fields at the end
        return [...fields, ...metadataFields];
    },

    /**
     * Formats a field name to be human-readable
     * @param {string} key - The field key
     * @returns {string} - Formatted name
     */
    formatFieldName(key) {
        return key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },

    /**
     * Builds CSV content from items and fields
     * @param {Array} items - The items to export
     * @param {Array} fields - The field definitions
     * @returns {string} - CSV content
     */
    buildCSV(items, fields) {
        // Header row
        const headers = fields.map(f => f.name);

        // Data rows
        const rows = items.map(item => {
            return fields.map(field => {
                let value = '';

                if (field.source === 'data') {
                    value = item.data?.[field.key] || '';
                } else if (field.source === 'enriched') {
                    value = item.enriched?.[field.key] || '';
                } else if (field.source === 'meta') {
                    // Handle metadata fields
                    if (field.fieldKey === 'type') value = item.type || '';
                    else if (field.fieldKey === 'source.title') value = item.source?.title || '';
                    else if (field.fieldKey === 'source.url') value = item.source?.url || '';
                    else if (field.fieldKey === 'timestamp') value = this.formatDate(item.timestamp);
                    else if (field.fieldKey === 'ai_extracted') value = item.ai_extracted ? 'Yes' : 'No';
                }

                // Handle arrays by joining with semicolons
                if (Array.isArray(value)) {
                    value = value.join('; ');
                }

                // Convert to string and escape quotes
                return `"${String(value).replace(/"/g, '""')}"`;
            });
        });

        return [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
    },

    /**
     * Formats a timestamp to readable date
     * @param {string} timestamp - ISO timestamp
     * @returns {string} - Formatted date
     */
    formatDate(timestamp) {
        if (!timestamp) return '';
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return timestamp;
        }
    },

    /**
     * Triggers CSV download
     * @param {string} csvContent - The CSV content
     * @param {string} collectionName - Name of the collection
     */
    downloadCSV(csvContent, collectionName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
