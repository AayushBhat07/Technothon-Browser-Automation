import { AnthropicProvider } from './ai/providers/anthropicProvider.js';

async function test() {
    const p = new AnthropicProvider();
    p.getApiKey = async () => process.env.ANTHROPIC_API_KEY; 
    try {
        await p.generateCompletion({ userPrompt: "test", systemPrompt: "test", temperature: 0 });
    } catch(e) {
        console.error("Caught error:", e.message);
    }
}
test();
