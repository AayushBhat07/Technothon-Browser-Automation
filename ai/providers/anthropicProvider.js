import { BaseAIProvider } from './baseProvider.js';

export class AnthropicProvider extends BaseAIProvider {
    constructor() {
        super('Anthropic', 'anthropic_api_key');
        this.models = [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-20240620',
            'claude-3-5-haiku-20241022',
            'claude-3-haiku-20240307'
        ];
        this.apiEndpoint = 'https://api.anthropic.com/v1/messages';
    }

    async generateCompletion(config) {
        const apiKey = await this.getApiKey();
        if (!apiKey) throw new Error('API_KEY_NOT_SET');

        const { userPrompt, systemPrompt, temperature, maxTokens } = config;

        // Diagnostic check: Cursor API keys are not valid for direct Anthropic API
        if (apiKey.startsWith('sk-cursor-')) {
            console.error('[AnthropicProvider] Detected Cursor API key. These are only for use within Cursor IDE and do not work with the direct Anthropic API.');
            throw new Error('CURSOR_KEY_INVALID');
        }

        let lastError = null;
        for (const modelId of this.models) {
            try {
                console.log(`[AnthropicProvider] Attempting with model: ${modelId}`);
                const requestBody = {
                    model: modelId,
                    max_tokens: maxTokens || 4096,
                    temperature: temperature ?? 0.1,
                    system: systemPrompt || undefined,
                    messages: [
                        { role: 'user', content: userPrompt }
                    ]
                };

                const response = await fetch(this.apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error(`[AnthropicProvider] API Error with ${modelId} (${response.status}):`, errorData.error?.message || response.statusText);

                    if (response.status === 429) throw new Error('RATE_LIMIT');
                    if (response.status === 401 || response.status === 403) {
                        const detail = errorData.error?.message || '';
                        if (response.status === 403) {
                            console.warn('[AnthropicProvider] 403 Forbidden:', detail);
                            throw new Error(`REGION_OR_ACCOUNT_RESTRICTED: ${detail}`);
                        }
                        throw new Error('INVALID_API_KEY');
                    }

                    // If model not found, try the next one
                    if (response.status === 404) {
                        console.warn(`[AnthropicProvider] Model ${modelId} not found, trying fallback...`);
                        continue;
                    }

                    throw new Error(`API_ERROR: ${errorData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                const rawText = data.content?.[0]?.text;

                if (!rawText) throw new Error('INVALID_RESPONSE');

                return {
                    rawText,
                    structuredData: config.structuredOutput ? this.extractJSON(rawText) : null,
                    tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                    modelName: modelId,
                    providerName: 'Anthropic'
                };
            } catch (error) {
                lastError = error;
                // Don't retry on fatal errors
                if (error.message === 'RATE_LIMIT' || error.message === 'INVALID_API_KEY' || error.message === 'CURSOR_KEY_INVALID' || error.message.startsWith('REGION_OR_ACCOUNT_RESTRICTED')) {
                    throw error;
                }
                console.warn(`[AnthropicProvider] Failed with ${modelId}:`, error.message);
            }
        }
        throw lastError || new Error('ALL_ANTHROPIC_MODELS_FAILED');
    }
}
