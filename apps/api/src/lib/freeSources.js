// Free lead source that needs no search credits:
// Google News RSS: recent news/press releases for a buyer-phrased query.
// Results use the same shape as web search results plus extra fields.
const axios = require('axios');

const TIMEOUT_MS = 12000;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' };

function decode(text) {
  return (text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Google News RSS search. `days` limits to recent articles.
 * Returns [{ title, url, content, published_date, publisher, publisherUrl, provider: 'news' }]
 */
// Google News editions (English) by country code.
const EDITIONS = {
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  IN: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  AE: { hl: 'en-AE', gl: 'AE', ceid: 'AE:en' },
  GB: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  IE: { hl: 'en-IE', gl: 'IE', ceid: 'IE:en' },
  KE: { hl: 'en-KE', gl: 'KE', ceid: 'KE:en' },
};

async function searchNews(query, { days = 45, max = 15, edition = 'US' } = {}) {
  const q = `${query} when:${days}d`;
  const { data } = await axios.get('https://news.google.com/rss/search', {
    params: { q, ...(EDITIONS[edition] || EDITIONS.US) },
    headers: HEADERS,
    timeout: TIMEOUT_MS,
    responseType: 'text',
  });
  const items = [...String(data).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, max);
  return items.map((match) => {
    const item = match[1];
    const field = (tag) => decode((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]);
    const publisher = field('source');
    const publisherUrl = (item.match(/<source url="([^"]+)"/) || [])[1] || null;
    // Google appends " - Publisher" to the headline.
    const rawTitle = field('title');
    const title = publisher && rawTitle.endsWith(` - ${publisher}`) ? rawTitle.slice(0, -(publisher.length + 3)) : rawTitle;
    const pubDate = field('pubDate');
    return {
      title,
      url: field('link'),
      content: title,
      published_date: pubDate ? new Date(pubDate).toISOString() : null,
      publisher: publisher || null,
      publisherUrl,
      provider: 'news',
    };
  });
}

module.exports = { searchNews };
