import { BaseAIProvider } from './baseProvider.js';

export class OpenAIProvider extends BaseAIProvider {
    constructor() {
        super('OpenAI', 'openai_api_key');
        this.model = 'gpt-4o'; // Default model
    }

    async generateCompletion(config) {
        const apiKey = await this.getApiKey();
        if (!apiKey) throw new Error('API_KEY_NOT_SET');

        const { userPrompt, systemPrompt, temperature, maxTokens } = config;

        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });

        const requestBody = {
            model: this.model,
            messages: messages,
            temperature: temperature ?? 0.1,
            max_tokens: maxTokens || 4096,
        };

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`[OpenAIProvider] API Error ${response.status}:`, errorData.error?.message || response.statusText);

                if (response.status === 429) throw new Error('RATE_LIMIT');
                if (response.status === 401) throw new Error('INVALID_API_KEY');
                throw new Error(`API_ERROR: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const rawText = data.choices?.[0]?.message?.content;

            if (!rawText) throw new Error('INVALID_RESPONSE');

            return {
                rawText,
                structuredData: config.structuredOutput ? this.extractJSON(rawText) : null,
                tokensUsed: data.usage?.total_tokens || 0,
                modelName: this.model,
                providerName: 'OpenAI'
            };
        } catch (error) {
            console.error('[SmartCollector] OpenAI API Error:', error);
            throw error;
        }
    }
}
