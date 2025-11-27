/**
 * AI Module
 * Handles integration with Google AI Studio (Gemini) API for intelligent data extraction.
 */

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const API_KEY_STORAGE_KEY = 'google_ai_api_key';

class AIManager {
    /**
     * Retrieves the stored Google AI API key from chrome.storage.sync
     * @returns {Promise<string|null>} The API key or null if not set
     */
    async getApiKey() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([API_KEY_STORAGE_KEY], (result) => {
                resolve(result[API_KEY_STORAGE_KEY] || null);
            });
        });
    }

    /**
     * Stores the Google AI API key in chrome.storage.sync
     * @param {string} apiKey - The API key to store
     * @returns {Promise<void>}
     */
    async setApiKey(apiKey) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => {
                resolve();
            });
        });
    }

    /**
     * Calls the Google AI Studio (Gemini) API with the given prompt
     * @param {string} prompt - The prompt to send to the AI
     * @param {Object} options - Optional configuration
     * @param {number} options.temperature - Temperature for generation (0.0-1.0)
     * @param {number} options.maxTokens - Maximum tokens to generate
     * @returns {Promise<string>} The AI's response text
     */
    async callGoogleAI(prompt, options = {}) {
        const apiKey = await this.getApiKey();

        if (!apiKey) {
            throw new Error('API_KEY_NOT_SET');
        }

        const temperature = options.temperature || 0.1; // Low temperature for structured extraction
        const maxTokens = options.maxTokens || 1024;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            }
        };

        try {
            const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                // Handle specific error cases
                if (response.status === 429) {
                    throw new Error('RATE_LIMIT');
                } else if (response.status === 401 || response.status === 403) {
                    throw new Error('INVALID_API_KEY');
                } else if (response.status === 400) {
                    throw new Error('INVALID_REQUEST');
                } else {
                    throw new Error(`API_ERROR: ${errorData.error?.message || response.statusText}`);
                }
            }

            const data = await response.json();

            // Extract the text from the response
            if (data.candidates && data.candidates.length > 0) {
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    return candidate.content.parts[0].text;
                }
            }

            throw new Error('INVALID_RESPONSE');
        } catch (error) {
            if (error.message.startsWith('API_KEY_NOT_SET') ||
                error.message.startsWith('RATE_LIMIT') ||
                error.message.startsWith('INVALID_API_KEY') ||
                error.message.startsWith('INVALID_REQUEST') ||
                error.message.startsWith('API_ERROR') ||
                error.message.startsWith('INVALID_RESPONSE')) {
                throw error;
            }

            // Network or other errors
            throw new Error(`NETWORK_ERROR: ${error.message}`);
        }
    }

    /**
     * Extracts structured data from unstructured text using AI
     * @param {string} text - The text to extract data from
     * @returns {Promise<Object>} Extracted structured data as JSON object
     */
    async extractStructuredData(text) {
        const prompt = `Analyze this text and extract the most important structured information. Return ONLY valid JSON.

Text: "${text}"

Instructions:
- Identify what type of content this is (contact info, article, meeting notes, research, etc.)
- Extract the most relevant structured fields based on the content type
- For contacts: name, company, email, phone, location, title, website
- For articles/content: title, author, main_topic, key_points (array), summary, source, date
- For meetings: date, attendees (array), topics (array), action_items (array), decisions (array)
- For any other type: extract the most relevant fields you identify

Return format (adapt fields based on content):
{
  "content_type": "contact|article|meeting|research|note|other",
  "field1": "value1",
  "field2": "value2",
  ...
}

Rules:
- Only include fields that are actually present in the text
- If a field is not found, omit it completely from the JSON
- Return ONLY the JSON object, no explanation or markdown
- Be concise but capture all important information`;

        try {
            const response = await this.callGoogleAI(prompt, { temperature: 0.1 });

            // Try to extract JSON from the response
            // Sometimes AI wraps JSON in markdown code blocks
            let jsonString = response.trim();

            // Remove markdown code blocks if present
            if (jsonString.startsWith('```json')) {
                jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
            } else if (jsonString.startsWith('```')) {
                jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');
            }

            // Parse the JSON
            const extractedData = JSON.parse(jsonString);

            return extractedData;
        } catch (error) {
            // Re-throw AI-specific errors
            if (error.message.startsWith('API_KEY_NOT_SET') ||
                error.message.startsWith('RATE_LIMIT') ||
                error.message.startsWith('INVALID_API_KEY')) {
                throw error;
            }

            // If JSON parsing failed, throw specific error
            if (error instanceof SyntaxError) {
                throw new Error('INVALID_JSON_RESPONSE');
            }

            throw error;
        }
    }

    /**
     * Gets a user-friendly error message for an error
     * @param {Error} error - The error object
     * @returns {string} User-friendly error message
     */
    getErrorMessage(error) {
        const message = error.message;

        if (message === 'API_KEY_NOT_SET') {
            return 'Please add Google AI API key in Settings';
        } else if (message === 'RATE_LIMIT') {
            return 'Rate limit reached. Try again in a moment.';
        } else if (message === 'INVALID_API_KEY') {
            return 'Invalid API key. Please check your settings.';
        } else if (message === 'INVALID_JSON_RESPONSE') {
            return 'Could not extract structure. Try manual editing.';
        } else if (message.startsWith('API_ERROR')) {
            return `API Error: ${message.replace('API_ERROR: ', '')}`;
        } else if (message.startsWith('NETWORK_ERROR')) {
            return `Network Error: ${message.replace('NETWORK_ERROR: ', '')}`;
        } else {
            return 'An unexpected error occurred. Please try again.';
        }
    }
    /**
     * Extracts specific data based on a user query
     * @param {string} text - The page text content
     * @param {string} query - The user's natural language query
     * @returns {Promise<Array<Object>>} Extracted data as an array of objects
     */
    /**
     * Extracts specific data based on a user query (Step 1: Extraction)
     * @param {string} text - The page text content
     * @param {string} query - The user's natural language query
     * @returns {Promise<Array<Object>>} Extracted data as an array of objects
     */
    async extractData(text, query) {
        const prompt = `You are a precise data extraction assistant.
        
User Query: "${query}"

Context Text (from webpage):
"${text}"

Instructions:
1. Analyze the text to find data matching the User Query.
2. **IMPORTANT: Prioritize data that appears LATER in the text (chronologically more recent).**
3. **FORMATTING RULE:**
   - If the user asks for **Data Extraction/Table/List** (e.g., "extract names", "get all emails", "in table form", "find contacts"), return a JSON ARRAY of objects where each object represents one item.
   - If the user asks for a **Summary/Explanation** (e.g., "summarize", "what is the problem", "explain"), return a JSON ARRAY with a **SINGLE OBJECT**.
     - **CRITICAL:** Combine ALL relevant sections (Problem, Solution, Context, Bonus Points) into a **SINGLE STRING** value within that object.
     - Use newlines (\\n) to separate sections within the string.
     - Do NOT return multiple objects for different parts of the summary.
4. Each object should have consistent keys based on the data found.
5. Clean the data (remove extra whitespace).
6. **Return at MOST 50 results.**
7. Return ONLY the JSON array. No markdown, no explanation.

Example Output (List):
[{"Feature": "Save"}, {"Feature": "Export"}]

Example Output (Summary):
[{"Problem Statement": "The problem is X.\n\nDesired Solution:\nThe solution should be Y.\n\nBonus Points:\n- Point A\n- Point B"}]`;

        try {
            const response = await this.callGoogleAI(prompt, { temperature: 0.1 });

            console.log('Raw AI Extraction Response:', response);

            let jsonString = response.trim();
            // Clean markdown
            if (jsonString.startsWith('```json')) {
                jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
            } else if (jsonString.startsWith('```')) {
                jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');
            }

            try {
                const data = JSON.parse(jsonString);

                if (!Array.isArray(data)) {
                    return [data];
                }

                // Normalize: If array contains strings, convert to objects
                if (data.length > 0 && typeof data[0] === 'string') {
                    return data.map(item => ({ "Extracted Result": item }));
                }

                return data;
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error('Failed to parse AI response.');
            }
        } catch (error) {
            console.error('AI Extraction Error:', error);
            throw error;
        }
    }

    /**
     * Verifies extracted data against source text (Step 2: Verification)
     * @param {string} text - The original source text
     * @param {Array<Object>} data - The extracted data to verify
     * @param {string} query - The original user query
     * @returns {Promise<Array<Object>>} Verified and corrected data
     */
    async verifyExtractedData(text, data, query) {
        if (!data || data.length === 0) return data;

        // Limit text for verification context if needed, but try to keep as much as possible
        // We send the extracted JSON and ask AI to check if it's supported by the text
        const prompt = `You are a strict Data Verification Auditor.
        
User Query: "${query}"

Original Source Text:
"${text}"

Extracted Data (to verify):
${JSON.stringify(data, null, 2)}

Instructions:
1. Verify that EACH item in the "Extracted Data" is actually present in the "Original Source Text".
2. **REMOVE** any items that are hallucinations or not supported by the text.
3. **CORRECT** any values that are slightly wrong.
4. **KEEP** items that are correct.
5. Ensure the data matches the User Query intent.
6. **FORMATTING RULE:**
   - If the input is a **List**, return a verified List.
   - If the input is a **Summary/Text Block** (single object with long text), verify the facts within the text but **KEEP IT AS A TEXT BLOCK**. Do not split it into a list unless explicitly asked.
7. Return the CLEANED, VERIFIED JSON array.
8. Return ONLY the JSON array. No markdown, no explanation.

Example Output (List):
[{"Feature": "Right-click save"}, {"Feature": "Auto-capture"}]

Example Output (Summary):
[{"Summary": "The verified problem is that users..."}]`;

        try {
            const response = await this.callGoogleAI(prompt, { temperature: 0.0 }); // Zero temp for strict verification
            console.log('Raw AI Verification Response:', response);

            let jsonString = response.trim();
            if (jsonString.startsWith('```json')) {
                jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
            } else if (jsonString.startsWith('```')) {
                jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');
            }

            let verifiedData = JSON.parse(jsonString);

            if (!Array.isArray(verifiedData)) {
                verifiedData = [verifiedData];
            }

            // Normalize: If array contains strings, convert to objects
            if (verifiedData.length > 0 && typeof verifiedData[0] === 'string') {
                return verifiedData.map(item => ({ "Extracted Result": item }));
            }

            return verifiedData;
        } catch (error) {
            console.warn('Verification failed, returning original data:', error);
            return data; // Fallback to original data if verification fails
        }
    }

    /**
     * Orchestrates the Extraction -> Verification pipeline
     * @param {string} text - Page text
     * @param {string} query - User query
     * @returns {Promise<Array<Object>>} Final verified data
     */
    async extractAndVerify(text, query) {
        console.log('[AI Manager] Starting Step 1: Extraction...');
        const extractedData = await this.extractData(text, query);

        // Optimization: Only verify if text is large enough (> 15k chars)
        // Small pages don't usually need verification and it saves time/cost
        if (text.length > 15000) {
            console.log(`[AI Manager] Text length (${text.length}) exceeds threshold. Starting Step 2: Verification...`);
            const verifiedData = await this.verifyExtractedData(text, extractedData, query);
            console.log(`[AI Manager] Verification complete. Final count: ${verifiedData.length} items.`);
            return verifiedData;
        } else {
            console.log(`[AI Manager] Text length (${text.length}) below threshold. Skipping verification step.`);
            return extractedData;
        }
    }
}

export const aiManager = new AIManager();
