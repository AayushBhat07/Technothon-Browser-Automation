/**
 * Deep Enrich Intelligence Expansion Module
 * Handles controlled parallel fetching, bot protection, clean extraction, and AI processing.
 */

import { aiManager } from './ai.js';

// --- Hard Limits (Non-Negotiable) ---
export const MAX_ENRICH_LINKS = 7;
export const MAX_CONCURRENT_FETCHES = 3;
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_ARTICLE_CHARACTERS = 8000;
export const TOTAL_ENRICH_TIME_CAP_MS = 20000;

// Cache to prevent duplicate fetching in the same session
const enrichedUrlCache = new Set();

/**
 * Intelligent Link Selection
 * @param {Array} entries - Raw RSS/Feed entries
 * @param {number} maxLinks - Maximum number to select
 * @returns {Array} Array of selected URLs and their metadata
 */
export function selectBestLinks(entries, maxLinks = MAX_ENRICH_LINKS) {
    if (!entries || !Array.isArray(entries)) return [];

    // Filter out entries without links
    const validEntries = entries.filter(e => e.link || e.source_url || e.sourceLink);

    // Sort by recency if dates are available (newest first)
    validEntries.sort((a, b) => {
        const dateA = new Date(a.pubDate || a.publishedDate || a.timestamp || 0);
        const dateB = new Date(b.pubDate || b.publishedDate || b.timestamp || 0);
        return dateB - dateA;
    });

    const selectedUrls = new Set();
    const uniqueDomains = new Set();
    const results = [];

    // Pass 1: Prefer unique domains first
    for (const entry of validEntries) {
        if (results.length >= maxLinks) break;

        const url = entry.link || entry.source_url || entry.sourceLink;
        if (!url) continue;

        try {
            const domain = new URL(url).hostname;
            if (!uniqueDomains.has(domain) && !selectedUrls.has(url) && !enrichedUrlCache.has(url)) {
                uniqueDomains.add(domain);
                selectedUrls.add(url);
                results.push({ url, title: entry.title || 'Untitled', sourceDomain: domain });
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }

    // Pass 2: Fill remaining slots with newest links regardless of domain
    for (const entry of validEntries) {
        if (results.length >= maxLinks) break;

        const url = entry.link || entry.source_url || entry.sourceLink;
        if (!url) continue;

        try {
            const domain = new URL(url).hostname;
            if (!selectedUrls.has(url) && !enrichedUrlCache.has(url)) {
                selectedUrls.add(url);
                results.push({ url, title: entry.title || 'Untitled', sourceDomain: domain });
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }

    return results;
}

/**
 * Clean Content Extraction from raw HTML
 * @param {string} html - Raw HTML source
 * @returns {string} Cleaned article text
 */
export function extractReadableText(html) {
    if (!html) return '';

    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. Remove unwanted tags
    const selectorsToRemove = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header', 'aside',
        '.nav', '.header', '.footer', '.sidebar', '.menu', '.cookie-banner', '#cookie-consent',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '.ads', '.advertisement'
    ];

    selectorsToRemove.forEach(selector => {
        try {
            doc.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) {
            // Ignore invalid selectors
        }
    });

    // 2. Try to find the main article content (heuristics)
    let mainContent = doc.querySelector('article, main, [role="main"], .article-body, .article-content, .post-content');

    // Fallback: finding the largest text block
    if (!mainContent) {
        const candidates = doc.querySelectorAll('div, section');
        let maxTextLength = 0;
        let bestCandidate = null;

        candidates.forEach(el => {
            const textLength = el.innerText.length;
            // Simple heuristic to avoid outer wrapper divs: penalize by depth or just ensure it has lots of text and p tags
            if (textLength > maxTextLength && el.querySelectorAll('p').length >= 2) {
                maxTextLength = textLength;
                bestCandidate = el;
            }
        });

        mainContent = bestCandidate || doc.body;
    }

    if (!mainContent) return '';

    // 3. Extract text
    // Replace <p>, <br>, and block elements with newlines for better readability
    const blocksMs = mainContent.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6');
    blocksMs.forEach(el => {
        el.appendChild(doc.createTextNode('\\n'));
    });

    let text = mainContent.innerText || mainContent.textContent || '';

    // 4. Clean up whitespace
    text = text.replace(/\\n/g, '\n')
        .replace(/\n\s*\n/g, '\n\n') // Collapse multiple newlines into two
        .replace(/[ \t]+/g, ' ')     // Collapse inline spaces
        .trim();

    // 5. Enforce max character limit
    if (text.length > MAX_ARTICLE_CHARACTERS) {
        text = text.substring(0, MAX_ARTICLE_CHARACTERS) + '... [Truncated due to length]';
    }

    return text;
}

/**
 * Fetch a single URL securely via Background Service Worker
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} {success, content, skippedReason}
 */
export async function fetchArticleContent(url) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'deepEnrichFetch', url: url }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                resolve({
                    success: false,
                    content: null,
                    skippedReason: response?.reason || chrome.runtime.lastError?.message || 'Unknown error'
                });
            } else {
                resolve({
                    success: true,
                    content: response.html,
                    skippedReason: null
                });
            }
        });
    });
}

/**
 * Step 1/2 of AI Pipeline: Single Article Extraction + Verification
 */
export async function enrichArticle(articleText, urlInfo) {
    try {
        const query = "financial metrics, funding, valuation, revenue, user numbers and strategic implications";
        // Extract
        const extractedData = await aiManager.extractData(articleText, query, await aiManager.getActiveProvider());
        if (!extractedData || extractedData.length === 0) return null;

        // Verify
        const verificationResult = await aiManager.runVerificationPass(
            articleText,
            extractedData,
            query,
            await aiManager.getActiveProvider()
        );

        // Extract Executive Summary separately for targeted 3-5 sentences
        const summaryPrompt = `Provide a brief executive summary (3-5 sentences strictly) of the primary business or strategic developments in this article. Do not include financial metrics formatting, just prose.\n\nArticle text:\n${articleText.substring(0, 3000)}`;
        const summaryResponse = await aiManager.callAI(summaryPrompt, { systemPromptType: 'transformation' });

        return {
            sourceTitle: urlInfo.title,
            sourceUrl: urlInfo.url,
            sourceDomain: urlInfo.sourceDomain,
            executiveSummary: summaryResponse,
            structuredData: extractedData[0], // Taking the first array item
            verification: verificationResult
        };

    } catch (e) {
        console.warn(\`[DeepEnrich] AI processing failed for \${urlInfo.url}\`, e);
        return null;
    }
}

/**
 * Controlled Parallel Fetching and Processing Queue
 * @param {Array} linksToProcess - List of link objects from selectBestLinks
 * @param {Function} onProgress - Callback(stats) for UI updates
 * @returns {Promise<Array>} Array of successful enrichment results
 */
export async function processLinksWithQueue(linksToProcess, onProgress) {
    return new Promise((resolve) => {
        const stats = {
            total: linksToProcess.length,
            completed: 0,
            successful: 0,
            skipped: 0,
            startTime: Date.now()
        };

        const queue = [...linksToProcess];
        const results = [];
        let activeWorkers = 0;
        let isTimeCapped = false;

        const checkCompletion = () => {
            if (activeWorkers === 0 && (queue.length === 0 || isTimeCapped)) {
                if (onProgress) onProgress({ ...stats, finished: true });
                resolve(results);
            }
        };

        const runWorker = async () => {
            if (queue.length === 0 || isTimeCapped) return;

            // Check global time cap
            if (Date.now() - stats.startTime > TOTAL_ENRICH_TIME_CAP_MS) {
                isTimeCapped = true;
                console.warn('[DeepEnrich] Processing stopped: Total runtime cap reached.');
                checkCompletion();
                return;
            }

            activeWorkers++;
            const currentItem = queue.shift();

            try {
                // 1. Fetch
                const fetchStart = Date.now();
                const fetchResult = await fetchArticleContent(currentItem.url);
                
                // Add to session cache regardless of outcome to prevent immediate refetching
                enrichedUrlCache.add(currentItem.url);

                if (!fetchResult.success || !fetchResult.content) {
                    stats.skipped++;
                    console.log(`[DeepEnrich] Skipped ${ currentItem.sourceDomain } - Reason: ${ fetchResult.skippedReason }`);
                } else {
                    // 2. Extract Text
                    const readableText = extractReadableText(fetchResult.content);
                    
                    if (readableText && readableText.length > 200) { // arbitrary minimum length for a valid article
                        // 3. AI Enrich
                        const enrichment = await enrichArticle(readableText, currentItem);
                        if (enrichment) {
                            results.push(enrichment);
                            stats.successful++;
                        } else {
                            stats.skipped++;
                        }
                    } else {
                        stats.skipped++; // Not enough text structure found
                    }
                }
            } catch (error) {
                // Failsafe catch, failures are silent
                stats.skipped++;
                console.warn(`[DeepEnrich] Unhandled error processing ${ currentItem.url }`, error);
            } finally {
                stats.completed++;
                activeWorkers--;
                if (onProgress) onProgress({ ...stats });
                
                // Start next item if available and not time capped
                if (queue.length > 0 && !isTimeCapped) {
                    runWorker();
                } else {
                    checkCompletion();
                }
            }
        };

        // Start initial workers up to max concurrent
        const initialWorkers = Math.min(queue.length, MAX_CONCURRENT_FETCHES);
        if (initialWorkers === 0) {
            checkCompletion();
        } else {
            for (let i = 0; i < initialWorkers; i++) {
                runWorker();
            }
        }
    });
}

/**
 * Step 3 of AI Pipeline: Aggregate Results
 * @param {Array} enrichedResults - Array of results from enrichArticle
 * @returns {Promise<Object>} Combined intelligence brief
 */
export async function generateCombinedBrief(enrichedResults) {
    if (!enrichedResults || enrichedResults.length === 0) return null;

    if (enrichedResults.length === 1) {
        return {
            consolidatedSummary: enrichedResults[0].executiveSummary,
            patternsObserved: ["Insights derived from a single primary source."],
            metricsTable: [enrichedResults[0]]
        };
    }

    try {
        const summaries = enrichedResults.map(r => `Source: ${ r.sourceDomain }\nSummary: ${ r.executiveSummary }`).join('\n\n');
        
        const aggregationPrompt = `You are an intelligence analyst.Review the following executive summaries from multiple sources covering a specific topic.
Provide a concise, unified Consolidate Executive Summary(1 - 2 paragraphs) that synthesizes the most important developments without repeating the same info.
Also identify 2 - 3 strategic patterns or trends observed across these sources(bullet points).

SOURCE SUMMARIES:
            ${ summaries }

Return ONLY this JSON strictly:
            {
                "consolidatedSummary": "string",
                "patternsObserved": ["string", "string"]
            }`;

        const response = await aiManager.router.routeRequest({
            userPrompt: aggregationPrompt,
            systemPrompt: aiManager.getSystemPrompt('transformation'),
            structuredOutput: true,
            providerId: await aiManager.getActiveProvider()
        });

        const unified = response.structuredData || {};

        return {
            consolidatedSummary: unified.consolidatedSummary || "Failed to generate unified summary.",
            patternsObserved: unified.patternsObserved || [],
            metricsTable: enrichedResults // Use raw structured data for UI table rendering
        };
    } catch (e) {
        console.warn(`[DeepEnrich] Failed to generate combined brief`, e);
        return {
            consolidatedSummary: "Multiple sources successfully enriched. See individual cards for details.",
            patternsObserved: [],
            metricsTable: enrichedResults
        };
    }
}
