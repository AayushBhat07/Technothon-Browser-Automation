/**
 * Base AI Provider
 * Defines the contract all AI providers must follow.
 */
export class BaseAIProvider {
    constructor(name, apiKeyStorageKey) {
        this.name = name;
        this.apiKeyStorageKey = apiKeyStorageKey;
    }

    /**
     * Retrieves the API key for this provider from storage.
     * @returns {Promise<string|null>}
     */
    async getApiKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([this.apiKeyStorageKey], (result) => {
                resolve(result[this.apiKeyStorageKey] || null);
            });
        });
    }

    /**
     * Standardized method to generate completions.
     * @param {Object} config - Request configuration
     * @returns {Promise<Object>} Formatted response
     */
    async generateCompletion(config) {
        throw new Error('generateCompletion must be implemented by subclass');
    }

    /**
     * Normalizes a JSON string into a structured object.
     * @param {string} text - Response text containing JSON
     * @returns {Object|null}
     */
    extractJSON(text) {
        if (!text) return null;
        let cleaned = text.trim();
        const mdMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/) || cleaned.match(/```\s*([\s\S]*?)\s*```/);
        if (mdMatch) cleaned = mdMatch[1].trim();

        const firstBracket = cleaned.indexOf('[');
        const firstBrace = cleaned.indexOf('{');
        let start = -1;
        let endChar = '';

        if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            start = firstBracket;
            endChar = ']';
        } else if (firstBrace !== -1) {
            start = firstBrace;
            endChar = '}';
        }

        if (start !== -1) {
            const lastEndChar = cleaned.lastIndexOf(endChar);
            if (lastEndChar > start) {
                try {
                    return JSON.parse(cleaned.substring(start, lastEndChar + 1));
                } catch (e) {
                    return null;
                }
            }
        }
        return null;
    }
}
