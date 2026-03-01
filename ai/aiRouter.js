import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAIProvider } from './providers/openaiProvider.js';
import { AnthropicProvider } from './providers/anthropicProvider.js';

export class AIRouter {
    constructor() {
        this.providers = {
            gemini: new GeminiProvider(),
            openai: new OpenAIProvider(),
            anthropic: new AnthropicProvider()
        };
        this.defaultProviderId = 'gemini';
    }

    /**
     * Gets the active provider ID from storage.
     * @returns {Promise<string>}
     */
    async getActiveProviderId() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['ai_provider'], (result) => {
                resolve(result.ai_provider || this.defaultProviderId);
            });
        });
    }

    /**
     * Routes the request to the specified or active provider.
     * @param {Object} request - { taskType, systemPrompt, userPrompt, temperature, structuredOutput, providerId }
     * @returns {Promise<Object>}
     */
    async routeRequest(request) {
        console.log('[AIRouter] Incoming request:', request);
        const providerId = request.providerId || await this.getActiveProviderId();
        console.log(`[AIRouter] Determined providerId: ${providerId}`);
        const provider = this.providers[providerId];

        if (!provider) {
            throw new Error(`PROVIDER_NOT_FOUND: ${providerId}`);
        }

        // Standardize request for the provider
        const config = {
            userPrompt: request.userPrompt,
            systemPrompt: request.systemPrompt,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            structuredOutput: request.structuredOutput
        };

        console.log(`[AIRouter] Routing to provider: "${providerId}" (Provider Name: ${provider.name})`);
        return await provider.generateCompletion(config);
    }

    /**
     * Returns a list of all supported providers.
     * @returns {Array}
     */
    getProviders() {
        return Object.keys(this.providers).map(id => ({
            id,
            name: this.providers[id].name
        }));
    }
}

export const aiRouter = new AIRouter();
