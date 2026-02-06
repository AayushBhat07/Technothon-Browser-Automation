/**
 * Validation Module
 * Handles data quality checks for collected items.
 */

export const ValidationManager = {
    /**
     * Validates an item based on its type and content.
     * @param {Object} item - The item to validate.
     * @returns {Object} - Validation result { status: 'valid'|'warning'|'error', issues: [] }
     */
    validateItem(item) {
        const issues = [];

        // Skip content validation for structured and AI-extracted items
        // They have field-based data instead of a single content field
        if (item.type !== 'structured' && !item.ai_extracted) {
            // Check for empty content
            if (!item.data.content || item.data.content.trim() === '') {
                issues.push('Content is empty');
            }
        }

        // Validate email format if present
        // Assuming isValidEmail is another method in ValidationManager or a utility function
        // For this example, we'll just check for a basic pattern if item.data.email exists
        if (item.data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.data.email)) {
            issues.push('Potential invalid email format');
        }

        // Check for missing source information
        if (!item.source || !item.source.url) {
            issues.push('Missing source URL');
        }

        // Re-adding price validation based on the original structure,
        // assuming it should still be part of the validation logic
        if (item.type === 'price') {
            if (!item.data.content || !item.data.content.match(/^\$?\d+(,\d{3})*(\.\d{2})?$/)) {
                issues.push('Invalid price format');
            }
        }

        return { status, issues };
    }
};
