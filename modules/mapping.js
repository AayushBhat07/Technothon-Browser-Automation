/**
 * Mapping Module
 * Handles mapping collected data fields to target columns.
 */

export const MappingManager = {
    /**
     * Auto-detects mapping based on item fields and target columns.
     * @param {Array} items - The items to map.
     * @param {Array} targetColumns - The target columns (e.g., ['Name', 'Email', 'Company']).
     * @returns {Object} - The mapping configuration { sourceField: targetColumn }.
     */
    autoMap(items, targetColumns) {
        const mapping = {};
        const sampleItem = items[0];

        if (!sampleItem) return mapping;

        // Flatten item data for analysis
        const flatData = {
            ...sampleItem.data,
            ...sampleItem.enriched,
            source_url: sampleItem.source.url,
            source_title: sampleItem.source.title
        };

        const sourceFields = Object.keys(flatData);

        sourceFields.forEach(source => {
            const match = targetColumns.find(target =>
                source.toLowerCase().includes(target.toLowerCase()) ||
                target.toLowerCase().includes(source.toLowerCase())
            );

            if (match) {
                mapping[source] = match;
            }
        });

        return mapping;
    },

    /**
     * Applies mapping to a list of items.
     * @param {Array} items 
     * @param {Object} mapping 
     * @returns {Array} - Array of objects with mapped keys.
     */
    applyMapping(items, mapping) {
        return items.map(item => {
            const flatData = {
                ...item.data,
                ...item.enriched,
                source_url: item.source.url,
                source_title: item.source.title,
                timestamp: item.timestamp
            };

            const mappedItem = {};
            Object.entries(mapping).forEach(([source, target]) => {
                if (target) {
                    mappedItem[target] = flatData[source];
                }
            });

            return mappedItem;
        });
    }
};
