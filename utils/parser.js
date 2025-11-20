/**
 * Helper utilities for data detection and parsing
 */

export const DataDetector = {
    /**
     * Detects the type of selected data and suggests a collection name
     * @param {string} text - The selected text
     * @returns {Object} - { type: string, suggestedCollection: string }
     */
    detectDataType(text) {
        const trimmed = text.trim();

        // Email detection
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
        if (emailRegex.test(trimmed)) {
            return { type: 'contact', suggestedCollection: 'Contacts' };
        }

        // Phone number detection
        const phoneRegex = /[\+\(]?[1-9][0-9 .\-\(\)]{8,}[0-9]/;
        if (phoneRegex.test(trimmed)) {
            return { type: 'contact', suggestedCollection: 'Contacts' };
        }

        // URL detection
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (urlRegex.test(trimmed)) {
            return { type: 'link', suggestedCollection: 'Links' };
        }

        // Price detection
        const priceRegex = /\$\s*\d+([.,]\d{2})?|€\s*\d+|£\s*\d+/;
        if (priceRegex.test(trimmed)) {
            return { type: 'product', suggestedCollection: 'Products' };
        }

        // Default to notes
        return { type: 'note', suggestedCollection: 'Notes' };
    }
};
