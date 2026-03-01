/**
 * AI Module - Provider-Agnostic Refactor
 * Orchestrates multiple AI providers via the AIRouter.
 */

import { storage } from './storage.js';
import { aiRouter } from '../ai/aiRouter.js';

// Legacy keys for backward compatibility
const AI_PROVIDER_KEY = 'ai_provider';

/**
 * Main AI Manager - Backward Compatibility Wrapper
 */
class AIManager {
    constructor() {
        this.router = aiRouter;
    }

    /**
     * Get the current active provider ID
     */
    async getActiveProvider() {
        return await this.router.getActiveProviderId();
    }

    /**
     * Get available providers with status
     */
    async getAvailableProviders() {
        const providers = this.router.getProviders();
        const results = [];
        for (const p of providers) {
            const apiKey = await this.router.providers[p.id].getApiKey();
            results.push({
                ...p,
                configured: !!apiKey
            });
        }
        return results;
    }

    /**
     * Interface for calling AI through the router
     */
    async callAI(prompt, options = {}) {
        const request = {
            userPrompt: prompt,
            systemPrompt: options.systemPrompt,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            structuredOutput: options.structuredOutput,
            providerId: options.provider
        };

        // If systemPromptType is provided, get the prompt (backward compatibility for Claude logic)
        if (options.systemPromptType) {
            request.systemPrompt = this.getSystemPrompt(options.systemPromptType);
        }

        const response = await this.router.routeRequest(request);

        // Return rawText for backward compatibility with existing callAI users
        return response.rawText;
    }

    /**
     * Backward compatibility shim for older calls
     */
    async callGoogleAI(prompt) {
        return this.callAI(prompt, { provider: 'gemini' });
    }

    /**
     * System prompts for various tasks
     */
    getSystemPrompt(type) {
        const prompts = {
            extraction: `You are a deterministic data extraction engine.

Your sole task is to extract structured information from the provided source content.

You are NOT a chatbot.
You are NOT allowed to speculate.
You are NOT allowed to infer missing data.
You are NOT allowed to fabricate.

You must only extract information that is explicitly present in the provided content.

Core Rules (Non-Negotiable):
1. Only use the provided source text.
2. Do not use external knowledge.
3. If a field is not explicitly present, return null.
4. If uncertain about a value, return null.
5. Do not guess.
6. Do not paraphrase extracted values.
7. Preserve exact formatting from source when possible.
8. Output strictly valid JSON.
9. Do not include explanations.
10. Do not include markdown.
11. Do not include commentary.
12. Do not wrap the JSON in code blocks.
13. Do not add any text before or after the JSON.

If the output is not valid JSON, the response is considered a failure.

Extraction Objective:
Extract structured data according to the schema provided in the user prompt.
Only populate fields that are clearly supported by the source text.

Additional Requirements:
- Each populated field must have a corresponding sourceSnippets entry showing the exact text used.
- If no structured data is found, return all fields as null.
- Confidence rules:
  - HIGH: value explicitly and clearly stated
  - MEDIUM: value present but slightly ambiguous
  - LOW: very limited structured data found

If hallucination is detected internally, set confidence to LOW and return null fields.

Failure Handling:
If the source text contains no extractable structured data, return:
- All fields = null
- extractionReasoning = "No structured data detected in provided content."
- confidence = LOW

Absolute Output Rule:
Your response must be:
- Valid JSON
- Schema-compliant
- No additional text
- No markdown
- No formatting wrappers

If any rule conflicts, prioritize returning valid JSON only.`,

            verification: `You are a deterministic verification engine.

Your sole responsibility is to verify previously extracted structured data against the provided source content.

You are NOT allowed to extract new fields.
You are NOT allowed to modify extracted values.
You are NOT allowed to improve formatting.
You are NOT allowed to guess missing values.
You are NOT allowed to fabricate corrections.

You only verify.

Core Verification Rules (Non-Negotiable):
1. Do not introduce new data.
2. Do not modify extracted values.
3. Only confirm or flag.
4. A value is VERIFIED only if it clearly appears in the source text.
5. If a value does not appear exactly or cannot be clearly supported, flag it.
6. If formatting differs but value is clearly present, mark as VERIFIED.
7. If ambiguous, mark as FLAGGED.
8. Do not use external knowledge.
9. Output strictly valid JSON.
10. No explanations outside JSON.
11. No markdown.
12. No extra commentary.

If output is not valid JSON, the verification is considered failed.

Verification Objective:
For each extracted field:
- Confirm whether it is explicitly supported by the source text.
- Identify hallucinated values.
- Identify unsupported inferences.
- Detect format inconsistencies.

Status Logic:
- VERIFIED: All non-null extracted fields are supported by the source text.
- PARTIALLY_VERIFIED: Some fields are supported, some are flagged.
- NEEDS_REVIEW: Major inconsistencies, hallucinations, or unsupported data detected.

Strict Output Rule:
Your output must be:
- Valid JSON
- Schema compliant
- No additional text
- No markdown
- No code block wrappers

If no extracted fields were provided, return:
- verificationStatus: NEEDS_REVIEW
- All verifiedFields: false
- flaggedFields: all fields
- verificationNotes: "No extracted data provided for verification."`,

            transformation: `You are a data transformation specialist. Transform input data according to user instructions while preserving all factual content.

TRANSFORMATION RULES:
1. Apply ONLY the transformations explicitly requested.
2. Never add commentary or conversational filler.
3. Preserve all data relationships and references.
4. If the transformation would lose information, note what was excluded.
5. Ensure output is formatted for direct use (no markdown code blocks unless requested).`,

            largeDataset: `You are a dataset formatting specialist optimized for processing large collections of structured data.

STRICT FORMATTING RULES:
1. Maintain consistent field naming across all entries.
2. Ensure every record has the same structure (use null for missing values, don't omit keys).
3. Escape special characters properly in JSON strings.
4. Use proper data types (strings in quotes, numbers without, booleans as true/false).
5. Preserve exact text content - do not paraphrase or summarize.
6. Verify no records are accidentally omitted.
7. Ensure no duplicate processing of the same record.`
        };
        return prompts[type] || null;
    }

    // ==================== Data Extraction Methods ====================

    /**
     * Orchestrates the Two-Pass Extraction -> Verification pipeline.
     */
    async extractAndVerify(text, query, context = {}, preferredProvider = null) {
        console.log('[SmartCollector] === PIPELINE START ===');

        const providerId = preferredProvider || await this.getActiveProvider();

        // Pass 1: Extraction
        console.log('[SmartCollector] Pass 1: Extracting Data...');
        const extractedData = await this.extractData(text, query, providerId);

        if (!extractedData || extractedData.length === 0) {
            return this._handleEmptyExtraction(query, context);
        }

        // Pass 2: Verification
        console.log('[SmartCollector] Pass 2: Running Verification Audit...');
        const verificationResult = await this.runVerificationPass(text, extractedData, query, providerId);

        // Audit Logging
        const auditId = await this._saveAuditLog(extractedData, verificationResult, query, context);

        extractedData.auditId = auditId;
        extractedData.providerInfo = {
            name: providerId,
            model: providerId === 'gemini' ? 'gemini-2.0-flash' : (providerId === 'openai' ? 'gpt-4o' : 'claude-3-sonnet')
        };

        console.log('[SmartCollector] === PIPELINE END ===');
        return extractedData;
    }

    async extractData(text, query, providerId) {
        const prompt = this._getExtractionPrompt(text, query);
        const response = await this.router.routeRequest({
            userPrompt: prompt,
            systemPrompt: this.getSystemPrompt('extraction'),
            structuredOutput: true,
            providerId: providerId
        });

        const data = response.structuredData;
        if (!data) return [];
        return Array.isArray(data) ? data : [data];
    }

    async runVerificationPass(sourceText, extractedData, query, providerId) {
        const prompt = this._getVerificationPrompt(sourceText, extractedData, query);
        const response = await this.router.routeRequest({
            userPrompt: prompt,
            systemPrompt: this.getSystemPrompt('verification'),
            structuredOutput: true,
            providerId: providerId
        });

        const result = response.structuredData || {};
        return {
            verificationStatus: result.verificationStatus || 'NEEDS_REVIEW',
            verificationNotes: result.verificationNotes || 'Verification completed.',
            verifiedFields: result.verifiedFields || [],
            flaggedFields: result.flaggedFields || [],
            pipelineComplete: true,
            tokensUsed: response.tokensUsed,
            modelName: response.modelName,
            providerName: response.providerName
        };
    }

    /**
     * Builds the extraction user prompt with full schema contract.
     */
    _getExtractionPrompt(text, query) {
        const sourceContent = text.substring(0, 15000);
        return `Extraction Objective: Extract structured data matching "${query}" from the source content below.

Only populate fields that are clearly supported by the source text.

Schema Contract — return JSON matching this exact structure:

{
  "extractedFields": {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "price": "string | null",
    "organization": "string | null",
    "location": "string | null",
    "date": "string | null"
  },
  "sourceSnippets": {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "price": "string | null",
    "organization": "string | null",
    "location": "string | null",
    "date": "string | null"
  },
  "extractionReasoning": "string",
  "confidence": "LOW | MEDIUM | HIGH"
}

Additional Requirements:
- Each populated field must have a corresponding sourceSnippets entry showing the exact text used.
- If no structured data is found, return all fields as null.
- Confidence rules: HIGH = value explicitly stated, MEDIUM = present but slightly ambiguous, LOW = very limited data found.
- If the source text contains no extractable structured data, return all fields as null with extractionReasoning = "No structured data detected in provided content." and confidence = LOW.

---SOURCE CONTENT START---
${sourceContent}
---SOURCE CONTENT END---`;
    }

    _getVerificationPrompt(sourceText, extractedData, query) {
        const sourceContent = sourceText.substring(0, 10000);
        return `Verification Objective: Verify the previously extracted data for query "${query}" against the original source content.

You will receive:
1. The original source content.
2. The previously extracted structured JSON.

Compare the extracted values strictly against the source text.

Required Output Schema — return JSON matching this exact structure:

{
  "verificationStatus": "VERIFIED | PARTIALLY_VERIFIED | NEEDS_REVIEW",
  "verifiedFields": {
    "name": true | false,
    "email": true | false,
    "phone": true | false,
    "price": true | false,
    "organization": true | false,
    "location": true | false,
    "date": true | false
  },
  "flaggedFields": [
    "field_name_if_flagged"
  ],
  "verificationNotes": "string"
}

Status Logic:
- VERIFIED: All non-null extracted fields are supported by the source text.
- PARTIALLY_VERIFIED: Some fields are supported, some are flagged.
- NEEDS_REVIEW: Major inconsistencies, hallucinations, or unsupported data detected.

Verification Notes Requirements:
- Briefly explain why fields were flagged.
- Not exceed 3 sentences.
- Not restate all data.
- Not modify original extracted values.

If no extracted fields were provided, return verificationStatus: NEEDS_REVIEW, all verifiedFields: false, flaggedFields: all fields, verificationNotes: "No extracted data provided for verification."

---PREVIOUSLY EXTRACTED DATA---
${JSON.stringify(extractedData, null, 2)}
---END EXTRACTED DATA---

---SOURCE CONTENT START---
${sourceContent}
---SOURCE CONTENT END---`;
    }

    async _handleEmptyExtraction(query, context) {
        const auditId = await storage.saveAudit({
            sourceUrl: context.url || 'N/A',
            sourceTitle: context.title || 'N/A',
            prompt: `Extraction Query: ${query}`,
            extractedFields: 'None',
            responseSummary: 'No data found.',
            verificationStatus: 'NEEDS_REVIEW',
            reasoning: 'No data found.',
            verificationResult: { verificationStatus: 'NEEDS_REVIEW', pipelineComplete: false },
            versionId: null
        });
        const empty = [];
        empty.auditId = auditId;
        return empty;
    }

    async _saveAuditLog(extractedData, verificationResult, query, context) {
        const fieldSummary = Object.keys(extractedData[0] || {}).join(', ');
        const reasoning = `Extracted ${extractedData.length} item(s). ${verificationResult.verificationNotes}`;
        return await storage.saveAudit({
            sourceUrl: context.url || 'N/A',
            sourceTitle: context.title || 'N/A',
            prompt: `Extraction Query: ${query}`,
            extractedFields: fieldSummary,
            responseSummary: reasoning,
            verificationStatus: verificationResult.verificationStatus,
            reasoning: reasoning,
            verificationResult: verificationResult,
            versionId: null
        });
    }

    // Unified error handling
    getErrorMessage(error) {
        if (error.message === 'API_KEY_NOT_SET') return 'Please add API key in Settings';
        if (error.message === 'RATE_LIMIT') return 'Rate limit reached. Try again.';
        if (error.message === 'INVALID_API_KEY') return 'Invalid API key format. Check Settings.';
        if (error.message === 'CURSOR_KEY_INVALID') return '⚠️ Detected a Cursor IDE Key. These only work inside Cursor. Please use a standard API Key from Anthropic Console.';
        if (error.message.startsWith('REGION_OR_ACCOUNT_RESTRICTED')) return 'Account Restricted: ' + error.message.split(': ')[1];

        return 'AI Error: ' + error.message.replace('API_ERROR: ', '');
    }

    // Compatibility shim for extraction in popup/sidepanel
    extractJSON(text) {
        return this.router.providers.gemini.extractJSON(text);
    }

    /**
     * Get API key for a specific provider
     */
    async getProviderApiKey(providerId) {
        const id = providerId === 'claude' ? 'anthropic' : providerId;
        if (!this.router.providers[id]) return null;
        return await this.router.providers[id].getApiKey();
    }

    /**
     * Set API key for a specific provider
     */
    async setProviderApiKey(providerId, apiKey) {
        const id = providerId === 'claude' ? 'anthropic' : providerId;
        const provider = this.router.providers[id];
        if (!provider) throw new Error(`Unknown provider: ${id}`);

        console.log(`[SmartCollector] Saving API key for ${id}...`);
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [provider.apiKeyStorageKey]: apiKey }, resolve);
        });
    }

    /**
     * Set the active provider
     */
    async setActiveProvider(providerId) {
        const id = providerId === 'claude' ? 'anthropic' : providerId;
        if (!this.router.providers[id]) throw new Error(`Unknown provider: ${id}`);

        return new Promise((resolve) => {
            chrome.storage.sync.set({ [AI_PROVIDER_KEY]: id }, resolve);
        });
    }
}

export const aiManager = new AIManager();
