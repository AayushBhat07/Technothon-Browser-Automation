/**
 * Feed Normalizer Module
 * Converts parsed feed entries into structured text blocks
 * suitable for the AI extraction pipeline.
 */

/**
 * Normalize aggregated feed results into a single text block
 * for AI extraction, plus structured metadata for explainability.
 * 
 * @param {Array<{entries: Array, source: string, url: string}>} feedResults
 * @param {string} topic - Detected topic label
 * @returns {{ textBlock: string, metadata: object, entryCount: number }}
 */
export function normalizeFeedResults(feedResults, topic) {
    const allEntries = [];
    const sourcesUsed = [];
    const seenUrls = new Set();
    const seenTitles = new Set();

    for (const result of feedResults) {
        sourcesUsed.push({ name: result.source, url: result.url });
        for (const entry of result.entries) {
            const normalizedUrl = (entry.link || '').trim().split('?')[0]; // Base URL without query params
            const normalizedTitle = (entry.title || '').trim().toLowerCase();

            // Deduplication by URL or Title
            if (normalizedUrl && seenUrls.has(normalizedUrl)) continue;
            if (normalizedTitle && seenTitles.has(normalizedTitle)) continue;

            if (normalizedUrl) seenUrls.add(normalizedUrl);
            if (normalizedTitle) seenTitles.add(normalizedTitle);

            allEntries.push({
                ...entry,
                feedSource: result.source
            });
        }
    }

    // Sort by publication date (newest first)
    allEntries.sort((a, b) => {
        const dateA = new Date(a.pubDate || 0);
        const dateB = new Date(b.pubDate || 0);
        return dateB - dateA;
    });

    const totalBeforeSlice = allEntries.length;
    const topEntries = allEntries.slice(0, 10);

    // Build structured text block for AI extraction
    const textBlock = topEntries.map((entry, idx) => {
        const parts = [`[Entry ${idx + 1}]`];
        if (entry.title) parts.push(`Title: ${entry.title}`);
        if (entry.description) parts.push(`Summary: ${entry.description}`);
        if (entry.pubDate) parts.push(`Published: ${entry.pubDate}`);
        if (entry.link) parts.push(`Source: ${entry.link}`);
        if (entry.feedSource) parts.push(`Feed: ${entry.feedSource}`);
        return parts.join('\n');
    }).join('\n\n---\n\n');

    const metadata = {
        topic,
        sourcesUsed,
        retrievedAt: new Date().toISOString(),
        totalEntries: totalBeforeSlice,
        previewEntries: topEntries.length,
        feedCount: feedResults.length
    };

    return {
        textBlock,
        metadata,
        entryCount: topEntries.length,
        entries: topEntries
    };
}

/**
 * Convert a normalized entry into a minimal storage-friendly object.
 * Only stores structured results, not raw XML.
 * 
 * @param {object} entry
 * @returns {object}
 */
export function toStorageEntry(entry) {
    return {
        title: entry.title || '',
        summary: entry.description || '',
        publishedDate: entry.pubDate || '',
        sourceLink: entry.link || '',
        feedSource: entry.feedSource || ''
    };
}
