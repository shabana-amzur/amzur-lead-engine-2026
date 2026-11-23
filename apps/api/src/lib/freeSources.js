// Free lead sources that need no search credits:
// - Google News RSS: recent news/press releases for a buyer-phrased query.
// - SAM.gov Opportunities API: US government tenders/RFPs (needs a free
//   SAM_GOV_API_KEY from sam.gov; skipped without one).
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
async function searchNews(query, { days = 45, max = 15 } = {}) {
  const q = `${query} when:${days}d`;
  const { data } = await axios.get('https://news.google.com/rss/search', {
    params: { q, hl: 'en-US', gl: 'US', ceid: 'US:en' },
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

const formatSamDate = (date) =>
  `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;

// "VETERANS AFFAIRS, DEPARTMENT OF.VETERANS HEALTH ADMINISTRATION" -> "Veterans Health Administration"
function agencyName(fullPath) {
  const parts = (fullPath || '').split('.').map((part) => part.trim()).filter(Boolean);
  const name = parts[parts.length - 1] || parts[0] || 'Government agency';
  const reordered = name.replace(/^(.+), (DEPARTMENT|OFFICE|BUREAU) OF$/i, '$2 of $1');
  return reordered
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Of|And|The|For)\b/g, (w) => w.toLowerCase());
}

/**
 * SAM.gov opportunities posted in the last `days` days for an IT NAICS code.
 * Returns [] when SAM_GOV_API_KEY is not set.
 */
async function searchTenders({ naics, days = 14, limit = 100 } = {}) {
  if (!process.env.SAM_GOV_API_KEY) return [];
  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const { data } = await axios.get('https://api.sam.gov/opportunities/v2/search', {
    params: {
      api_key: process.env.SAM_GOV_API_KEY,
      postedFrom: formatSamDate(from),
      postedTo: formatSamDate(to),
      ncode: naics,
      limit,
    },
    headers: HEADERS,
    timeout: TIMEOUT_MS,
  });
  return (data.opportunitiesData || [])
    .filter((o) => o.active !== 'No')
    .filter((o) => !o.responseDeadLine || new Date(o.responseDeadLine).getTime() > Date.now())
    .map((o) => ({
      title: o.title,
      url: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
      content: [o.title, agencyName(o.fullParentPathName), o.type].filter(Boolean).join(' · '),
      published_date: o.postedDate ? new Date(o.postedDate).toISOString() : null,
      provider: 'sam',
      agency: agencyName(o.fullParentPathName),
      solicitationNumber: o.solicitationNumber || null,
      noticeType: o.type || null,
      responseDeadline: o.responseDeadLine || null,
      naics: o.naicsCode || naics,
      placeOfPerformance: [o.placeOfPerformance?.city?.name, o.placeOfPerformance?.state?.code].filter(Boolean).join(', ') || null,
    }));
}

module.exports = { searchNews, searchTenders, agencyName };
