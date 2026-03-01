import { AnthropicProvider } from './ai/providers/anthropicProvider.js';

async function test() {
    const p = new AnthropicProvider();
    p.getApiKey = async () => process.env.ANTHROPIC_API_KEY; // Mock key
    try {
        await p.generateCompletion({ userPrompt: "hello", systemPrompt: "test", temperature: 0 });
    } catch(e) {
        console.error(e);
    }
}
test();
