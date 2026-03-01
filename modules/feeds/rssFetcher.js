/**
 * RSS Fetcher Module
 * Fetches and safely parses RSS/XML/JSON feeds.
 * Uses regex-based parsing (no DOMParser — unavailable in MV3 service workers).
 */

/**
 * Fetch and parse an RSS/XML feed from a whitelisted URL.
 * @param {string} feedUrl - The whitelisted RSS feed URL
 * @returns {Promise<Array<{title, link, pubDate, description}>>}
 */
export async function fetchFeed(feedUrl) {
    try {
        console.log(`[FeedFetcher] Fetching: ${feedUrl}`);
        const response = await fetch(feedUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
                'User-Agent': 'ZappoFeedReader/1.0'
            }
        });

        if (!response.ok) {
            console.warn(`[FeedFetcher] HTTP ${response.status} for ${feedUrl}`);
            return [];
        }

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        console.log(`[FeedFetcher] Got ${text.length} bytes from ${feedUrl} (${contentType})`);

        // Try JSON first (some feeds serve JSON)
        if (contentType.includes('json')) {
            return parseJSONFeed(text, feedUrl);
        }

        // Parse as XML/RSS/Atom using regex (no DOMParser in service workers)
        return parseXMLFeedRegex(text, feedUrl);
    } catch (error) {
        console.error(`[FeedFetcher] Network error for ${feedUrl}:`, error.message);
        return [];
    }
}

/**
 * Fetch multiple feeds concurrently with error isolation.
 * @param {Array<{url: string, name: string}>} feeds
 * @returns {Promise<Array<{entries: Array, source: string, url: string}>>}
 */
export async function fetchMultipleFeeds(feeds) {
    console.log(`[FeedFetcher] Fetching ${feeds.length} feeds...`);

    const results = await Promise.allSettled(
        feeds.map(async (feed) => {
            const entries = await fetchFeed(feed.url);
            console.log(`[FeedFetcher] ${feed.name}: ${entries.length} entries`);
            return {
                entries,
                source: feed.name,
                url: feed.url
            };
        })
    );

    const successful = results
        .filter(r => r.status === 'fulfilled' && r.value.entries.length > 0)
        .map(r => r.value);

    console.log(`[FeedFetcher] ${successful.length}/${feeds.length} feeds returned data`);
    return successful;
}

/**
 * Parse XML/RSS/Atom content using regex (service-worker safe, no DOM needed).
 */
function parseXMLFeedRegex(xmlText, sourceUrl) {
    try {
        const entries = [];

        // Try RSS 2.0 format: extract <item>...</item> blocks
        const rssItemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
        let match;

        while ((match = rssItemRegex.exec(xmlText)) !== null && entries.length < 15) {
            const itemXml = match[1];
            entries.push({
                title: sanitizeText(extractTag(itemXml, 'title')),
                link: sanitizeText(extractTag(itemXml, 'link')),
                pubDate: sanitizeText(extractTag(itemXml, 'pubDate')),
                description: sanitizeText(truncate(extractTag(itemXml, 'description'), 500))
            });
        }

        if (entries.length > 0) {
            console.log(`[FeedFetcher] Parsed ${entries.length} RSS items from ${sourceUrl}`);
            return entries;
        }

        // Try Atom format: extract <entry>...</entry> blocks
        const atomEntryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;

        while ((match = atomEntryRegex.exec(xmlText)) !== null && entries.length < 15) {
            const entryXml = match[1];
            // Atom links use <link href="..." /> attribute
            const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
            entries.push({
                title: sanitizeText(extractTag(entryXml, 'title')),
                link: linkMatch ? sanitizeText(linkMatch[1]) : '',
                pubDate: sanitizeText(extractTag(entryXml, 'published') || extractTag(entryXml, 'updated')),
                description: sanitizeText(truncate(extractTag(entryXml, 'summary') || extractTag(entryXml, 'content'), 500))
            });
        }

        if (entries.length > 0) {
            console.log(`[FeedFetcher] Parsed ${entries.length} Atom entries from ${sourceUrl}`);
            return entries;
        }

        console.warn(`[FeedFetcher] No items found in feed: ${sourceUrl}`);
        return [];
    } catch (error) {
        console.error(`[FeedFetcher] Parse error:`, error.message);
        return [];
    }
}

/**
 * Parse a JSON feed (JSON Feed spec v1).
 */
function parseJSONFeed(jsonText, sourceUrl) {
    try {
        const data = JSON.parse(jsonText);
        const items = data.items || data.entries || [];

        return items.slice(0, 15).map(item => ({
            title: sanitizeText(item.title || ''),
            link: sanitizeText(item.url || item.link || ''),
            pubDate: sanitizeText(item.date_published || item.date_modified || ''),
            description: sanitizeText(truncate(item.summary || item.content_text || '', 500))
        }));
    } catch (error) {
        console.warn(`[FeedFetcher] JSON parse error for ${sourceUrl}:`, error.message);
        return [];
    }
}

// --- Utility Helpers ---

/**
 * Extract text content from an XML tag using regex.
 * Handles both regular text and CDATA sections.
 */
function extractTag(xml, tagName) {
    // Try CDATA first: <tag><![CDATA[content]]></tag>
    const cdataRegex = new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`, 'i');
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1];

    // Try regular text content: <tag>content</tag>
    const textRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const textMatch = xml.match(textRegex);
    if (textMatch) return textMatch[1];

    return '';
}

function sanitizeText(text) {
    if (!text) return '';
    // Strip HTML tags and decode entities
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
