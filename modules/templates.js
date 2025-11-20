/**
 * Template Module
 * Handles generating documents from collected data using templates.
 */

export const TemplateManager = {
    /**
     * Generates a document by replacing placeholders in a template with item data.
     * @param {string} template - The template string with placeholders like {name}.
     * @param {Object} item - The item data to populate.
     * @returns {string} - The generated document.
     */
    generate(template, item) {
        let result = template;

        // Flatten item data for easy access
        const flatData = {
            ...item.data,
            ...item.enriched,
            source_url: item.source.url,
            source_title: item.source.title,
            timestamp: new Date(item.timestamp).toLocaleDateString()
        };

        // Replace all placeholders {key}
        Object.keys(flatData).forEach(key => {
            const regex = new RegExp(`{${key}}`, 'gi');
            result = result.replace(regex, flatData[key] || '');
        });

        // Clean up remaining placeholders
        return result.replace(/{[a-z0-9_]+}/gi, '[MISSING]');
    }
};
