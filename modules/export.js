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
     * Exports already mapped items to CSV
     * @param {Array} mappedItems - Array of objects with final column names as keys
     * @param {string} collectionName - Name for the file
     */
    exportMappedItems(mappedItems, collectionName) {
        if (!mappedItems || mappedItems.length === 0) return;

        const headers = Object.keys(mappedItems[0]);
        const csvContent = this.buildCSVFromMapped(mappedItems, headers);
        this.downloadCSV(csvContent, collectionName);
    },

    /**
     * Builds CSV content from already mapped items
     * @param {Array} items - The mapped items
     * @param {Array} headers - The column names
     * @returns {string} - CSV content
     */
    buildCSVFromMapped(items, headers) {
        const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

        const rows = items.map(item => {
            return headers.map(header => {
                const value = item[header] || '';
                return this.sanitizeCSVValue(value);
            }).join(',');
        });

        return [headerRow, ...rows].join('\n');
    },

    /**
     * Builds CSV content from raw items and field definitions
     */
    buildCSV(items, fields) {
        // Header row - escaped
        const headers = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(',');

        // Data rows
        const rows = items.map(item => {
            return fields.map(field => {
                let value = '';

                if (field.source === 'data') {
                    value = item.data?.[field.key] || '';
                } else if (field.source === 'enriched') {
                    value = item.enriched?.[field.key] || '';
                } else if (field.source === 'meta') {
                    if (field.fieldKey === 'type') value = item.type || '';
                    else if (field.fieldKey === 'source.title') value = item.source?.title || '';
                    else if (field.fieldKey === 'source.url') value = item.source?.url || '';
                    else if (field.fieldKey === 'timestamp') value = this.formatDate(item.timestamp);
                    else if (field.fieldKey === 'ai_extracted') value = item.ai_extracted ? 'Yes' : 'No';
                }

                return this.sanitizeCSVValue(value);
            }).join(',');
        });

        return [headers, ...rows].join('\n');
    },

    /**
     * Robust CSV value sanitization
     */
    sanitizeCSVValue(value) {
        if (value === null || value === undefined) return '""';

        let stringValue = '';

        if (Array.isArray(value)) {
            // Join arrays with newlines, but handle objects inside arrays if any
            stringValue = value.map(v =>
                (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v)
            ).join('\n');
        } else if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        // Escape quotes by doubling them
        const escaped = stringValue.replace(/"/g, '""');
        return `"${escaped}"`;
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
    },
    /**
     * Exports collection to a beautiful HTML report
     * @param {Object} collection - The collection to export
     */
    exportToHTML(collection) {
        if (!collection || !collection.items || collection.items.length === 0) {
            alert('Collection is empty or invalid.');
            return;
        }

        const allFields = this.detectAllFields(collection.items);
        const htmlContent = this.buildHTML(collection, allFields);
        this.downloadHTML(htmlContent, collection.name);
    },

    /**
     * Builds HTML content for the report
     */
    buildHTML(collection, fields) {
        const headers = fields.map(f => f.name);
        const date = new Date().toLocaleDateString();

        // Generate rows
        const rows = collection.items.map(item => {
            const cells = fields.map(field => {
                let value = '';
                if (field.source === 'data') {
                    value = item.data?.[field.key] || '';
                } else if (field.source === 'enriched') {
                    value = item.enriched?.[field.key] || '';
                } else if (field.source === 'meta') {
                    if (field.fieldKey === 'type') value = item.type || '';
                    else if (field.fieldKey === 'source.title') value = item.source?.title || '';
                    else if (field.fieldKey === 'source.url') value = item.source?.url ? `<a href="${item.source.url}" target="_blank">Link</a>` : '';
                    else if (field.fieldKey === 'timestamp') value = this.formatDate(item.timestamp);
                    else if (field.fieldKey === 'ai_extracted') value = item.ai_extracted ? '<span class="badge ai">AI Extracted</span>' : '';
                }

                // Handle arrays/lists
                if (Array.isArray(value)) {
                    value = `<ul class="cell-list">${value.map(v => `<li>${v}</li>`).join('')}</ul>`;
                } else if (typeof value === 'object' && value !== null) {
                    value = `<pre style="margin:0; font-size:11px;">${JSON.stringify(value, null, 2)}</pre>`;
                } else if (typeof value === 'string' && value.includes('\n')) {
                    value = value.replace(/\n/g, '<br>');
                }

                return `<td>${value}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${collection.name} - Smart Report</title>
    <style>
        :root {
            --primary: #2563eb;
            --bg: #f8fafc;
            --text: #1e293b;
            --border: #e2e8f0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 40px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        header {
            padding: 24px 32px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: white;
        }
        h1 { margin: 0; font-size: 24px; color: var(--primary); }
        .meta { color: #64748b; font-size: 14px; }
        
        .table-container {
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        th {
            background: #f1f5f9;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #475569;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
        }
        td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
            min-width: 150px;
            max-width: 400px;
        }
        tr:hover { background: #f8fafc; }
        
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .badge.ai { background: #ede9fe; color: #7c3aed; }
        
        .cell-list { margin: 0; padding-left: 20px; }
        a { color: var(--primary); text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>${collection.name}</h1>
                <div class="meta">${collection.items.length} items • Generated on ${date}</div>
            </div>
            <div style="text-align: right;">
                <strong style="color: #2563eb; font-size: 18px;">Smart Collector</strong>
            </div>
        </header>
        <div class="table-container">
            <table>
                <thead>
                    <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;
    },

    /**
     * Triggers HTML download
     */
    downloadHTML(htmlContent, collectionName) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${collectionName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.html`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
