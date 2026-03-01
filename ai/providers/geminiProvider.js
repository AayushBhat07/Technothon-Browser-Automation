import { BaseAIProvider } from './baseProvider.js';

export class GeminiProvider extends BaseAIProvider {
    constructor() {
        super('Gemini', 'google_ai_api_key');
        this.models = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash'
        ];
    }

    async generateCompletion(config) {
        const apiKey = await this.getApiKey();
        if (!apiKey) throw new Error('API_KEY_NOT_SET');

        const { userPrompt, systemPrompt, temperature, maxTokens } = config;

        // Gemini handles system prompts best within the main contents or via a systemContent field in newer APIs
        // For simplicity and consistency with existing logic, we combine them if needed, 
        // but here we follow the existing pattern in smart-web-collector.

        const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

        const requestBody = {
            contents: [{
                parts: [{ text: combinedPrompt }]
            }],
            generationConfig: {
                temperature: temperature ?? 0.1,
                maxOutputTokens: maxTokens || 4096,
            }
        };

        let lastError = null;
        for (const model of this.models) {
            try {
                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const response = await fetch(`${endpoint}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error(`[GeminiProvider] API Error ${response.status}:`, errorData.error?.message || response.statusText);

                    if (response.status === 429) throw new Error('RATE_LIMIT');
                    if (response.status === 401 || response.status === 403) {
                        // Log a more descriptive warning for 403 (could be region restriction)
                        if (response.status === 403) {
                            console.warn('[GeminiProvider] 403 Forbidden: This often means the API key is valid but the Service/Region is restricted or the Generative Language API is not enabled in Google Cloud Console.');
                        }
                        throw new Error('INVALID_API_KEY');
                    }
                    if (response.status === 404) continue;
                    throw new Error(`API_ERROR: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!rawText) throw new Error('INVALID_RESPONSE');

                return {
                    rawText,
                    structuredData: config.structuredOutput ? this.extractJSON(rawText) : null,
                    tokensUsed: 0, // Gemini v1beta doesn't always return this easily in the common response
                    modelName: model,
                    providerName: 'Gemini'
                };
            } catch (err) {
                lastError = err;
                if (err.message === 'RATE_LIMIT' || err.message === 'INVALID_API_KEY') throw err;
            }
        }
        throw lastError || new Error('ALL_MODELS_FAILED');
    }
}
