/**
 * Feed Router Module
 * Maps detected topics to preconfigured, safe RSS feed sources.
 * Does NOT allow arbitrary crawling or unknown domains.
 */

// Preconfigured feed registry - only whitelisted, structured feeds
const FEED_REGISTRY = {
    // --- Technology & AI ---
    'ai': {
        label: 'Artificial Intelligence',
        feeds: [
            { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI' },
            { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', name: 'Ars Technica' },
            { url: 'https://www.wired.com/feed/tag/ai/latest/rss', name: 'Wired AI' }
        ]
    },
    'tech': {
        label: 'Technology',
        feeds: [
            { url: 'https://techcrunch.com/feed/', name: 'TechCrunch' },
            { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
            { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge' }
        ]
    },
    'funding': {
        label: 'Startup Funding',
        feeds: [
            { url: 'https://techcrunch.com/category/venture/feed/', name: 'TechCrunch Venture' },
            { url: 'https://news.crunchbase.com/feed/', name: 'Crunchbase News' }
        ]
    },
    // --- Science ---
    'science': {
        label: 'Science',
        feeds: [
            { url: 'https://www.sciencedaily.com/rss/all.xml', name: 'Science Daily' },
            { url: 'https://phys.org/rss-feed/breaking/', name: 'Phys.org' }
        ]
    },
    // --- Business ---
    'business': {
        label: 'Business',
        feeds: [
            { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', name: 'BBC Business' },
            { url: 'https://www.reuters.com/rssFeed/businessNews', name: 'Reuters Business' }
        ]
    },
    // --- World News ---
    'news': {
        label: 'World News',
        feeds: [
            { url: 'https://feeds.bbci.co.uk/news/rss.xml', name: 'BBC News' },
            { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', name: 'NY Times' }
        ]
    },
    // --- Jobs ---
    'jobs': {
        label: 'Jobs & Careers',
        feeds: [
            { url: 'https://stackoverflow.com/jobs/feed', name: 'Stack Overflow Jobs' }
        ]
    },
    // --- Security ---
    'security': {
        label: 'Cybersecurity',
        feeds: [
            { url: 'https://feeds.feedburner.com/TheHackersNews', name: 'The Hacker News' },
            { url: 'https://krebsonsecurity.com/feed/', name: 'Krebs on Security' }
        ]
    }
};

// Keywords that map to topics
const TOPIC_KEYWORDS = {
    'ai': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'gpt', 'neural', 'chatbot'],
    'tech': ['tech', 'technology', 'software', 'hardware', 'gadgets', 'computing'],
    'funding': ['funding', 'startup', 'venture', 'investment', 'series a', 'seed round', 'vc', 'raise'],
    'science': ['science', 'research', 'study', 'discovery', 'physics', 'biology', 'chemistry'],
    'business': ['business', 'economy', 'market', 'stocks', 'finance', 'trade'],
    'news': ['news', 'world', 'breaking', 'headlines', 'current events', 'politics'],
    'jobs': ['jobs', 'hiring', 'careers', 'employment', 'remote work', 'job opening'],
    'security': ['security', 'cyber', 'hacking', 'vulnerability', 'malware', 'breach', 'infosec']
};

// Time relevance keywords
const TIME_KEYWORDS = {
    'latest': ['latest', 'recent', 'newest', 'new', 'fresh', 'current'],
    'today': ['today', 'today\'s', 'this morning'],
    'week': ['this week', 'past week', 'weekly', 'last 7 days']
};

/**
 * Detect if a user query implies external feed retrieval.
 * @param {string} query - The user's Magic Bar input
 * @returns {{ isFeedIntent: boolean, topic: string|null, timeRelevance: string, dataType: string, feeds: Array }}
 */
export function detectFeedIntent(query) {
    const lowerQuery = query.toLowerCase().trim();

    // Must contain action words that imply fetching external data
    const feedActionWords = [
        'extract', 'get', 'fetch', 'find', 'show', 'list', 'pull',
        'search for', 'look for', 'give me', 'what are', 'what is',
        'latest', 'recent', 'trending', 'top', 'breaking'
    ];

    const hasActionWord = feedActionWords.some(w => lowerQuery.includes(w));
    if (!hasActionWord) {
        return { isFeedIntent: false, topic: null, timeRelevance: 'latest', dataType: 'general', feeds: [] };
    }

    // Detect topic
    let detectedTopic = null;
    let bestScore = 0;

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
        const matchCount = keywords.filter(kw => lowerQuery.includes(kw)).length;
        if (matchCount > bestScore) {
            bestScore = matchCount;
            detectedTopic = topic;
        }
    }

    // If no strong topic match, check if it looks like a feed query anyway
    if (!detectedTopic && hasActionWord) {
        // Default to 'news' for generic feed queries like "get latest news"
        if (lowerQuery.includes('news') || lowerQuery.includes('headline')) {
            detectedTopic = 'news';
        }
    }

    if (!detectedTopic) {
        return { isFeedIntent: false, topic: null, timeRelevance: 'latest', dataType: 'general', feeds: [] };
    }

    // Detect time relevance
    let timeRelevance = 'latest';
    for (const [timeKey, keywords] of Object.entries(TIME_KEYWORDS)) {
        if (keywords.some(kw => lowerQuery.includes(kw))) {
            timeRelevance = timeKey;
            break;
        }
    }

    const registryEntry = FEED_REGISTRY[detectedTopic];

    return {
        isFeedIntent: true,
        topic: detectedTopic,
        topicLabel: registryEntry.label,
        timeRelevance,
        dataType: registryEntry.label,
        feeds: registryEntry.feeds
    };
}

/**
 * Get all available topics for display
 */
export function getAvailableTopics() {
    return Object.entries(FEED_REGISTRY).map(([key, val]) => ({
        id: key,
        label: val.label,
        feedCount: val.feeds.length
    }));
}
