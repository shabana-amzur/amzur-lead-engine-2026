// Web search with automatic fallback: Tavily -> Serper (Google results) -> You.com.
// A provider is used when its API key is set; when one fails with a
// limit/auth error it is skipped for a while so a scan doesn't keep hitting it.
// All providers return the same shape:
//   { title, url, content, published_date, provider }
const axios = require('axios');

const TIMEOUT_MS = 15000;
const COOLDOWN_MS = 30 * 60 * 1000; // skip a failing provider for 30 minutes

// provider name -> { until: timestamp, error } (per server instance)
const disabled = new Map();

const PROVIDERS = [
  {
    name: 'tavily',
    key: () => process.env.TAVILY_API_KEY,
    async search(query, { depth = 'basic', maxResults = 10, recentDays } = {}) {
      const { data } = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: depth,
          max_results: maxResults,
          // Tavily supports day/week/month/year windows; results are filtered by exact age afterwards.
          ...(recentDays ? { time_range: recentDays <= 1 ? 'day' : recentDays <= 7 ? 'week' : 'month' } : {}),
        },
        { timeout: TIMEOUT_MS }
      );
      return (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        published_date: r.published_date || null,
      }));
    },
  },
  {
    name: 'serper',
    key: () => process.env.SERPER_API_KEY,
    async search(query, { maxResults = 10, recentDays } = {}) {
      const { data } = await axios.post(
        'https://google.serper.dev/search',
        {
          q: query,
          num: maxResults,
          // Google's "past day/week/month" filter; results are filtered by exact age afterwards.
          ...(recentDays ? { tbs: recentDays <= 1 ? 'qdr:d' : recentDays <= 7 ? 'qdr:w' : 'qdr:m' } : {}),
        },
        { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
      );
      return (data.organic || []).map((r) => ({
        title: r.title,
        url: r.link,
        content: r.snippet || '',
        published_date: r.date || null,
      }));
    },
  },
  {
    // You.com Search API: POST https://ydc-index.io/v1/search, key in X-API-Key.
    name: 'you',
    key: () => process.env.YOU_API_KEY,
    async search(query, { maxResults = 10, recentDays } = {}) {
      const { data } = await axios.post(
        'https://ydc-index.io/v1/search',
        {
          query,
          count: Math.min(maxResults, 100),
          // You.com supports day/week/month/year; results are filtered by exact age afterwards.
          ...(recentDays ? { freshness: recentDays <= 1 ? 'day' : recentDays <= 7 ? 'week' : 'month' } : {}),
        },
        { headers: { 'X-API-Key': process.env.YOU_API_KEY, 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
      );
      const web = (data.results && data.results.web) || [];
      return web.map((r) => ({
        title: r.title,
        url: r.url,
        content: [r.description, ...(r.snippets || [])].filter(Boolean).join(' '),
        published_date: r.page_age || null,
      }));
    },
  },
];

// Errors that mean "this provider can't serve us right now" (limits, bad key).
function isProviderUnavailable(error) {
  const status = error.response && error.response.status;
  return [401, 402, 403, 429, 432, 433].includes(status) || (status >= 500 && status < 600);
}

function describeError(error) {
  const status = error.response && error.response.status;
  const data = error.response && error.response.data;
  const detail = (data && (data.detail?.error || data.detail || data.message || data.error)) || error.message;
  return { status: status || null, message: typeof detail === 'string' ? detail : error.message };
}

/**
 * Search the web, falling back to the next configured provider on failure.
 * @returns {Promise<{ results: object[], provider: string|null, errors: object[] }>}
 */
async function searchWeb(query, options = {}) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key()) continue;
    const off = disabled.get(provider.name);
    if (off && off.until > Date.now()) {
      errors.push({ provider: provider.name, ...off.error, skipped: true });
      continue;
    }
    try {
      const results = await provider.search(query, options);
      return { results: results.map((r) => ({ ...r, provider: provider.name })), provider: provider.name, errors };
    } catch (error) {
      const info = describeError(error);
      errors.push({ provider: provider.name, ...info });
      if (isProviderUnavailable(error)) {
        disabled.set(provider.name, { until: Date.now() + COOLDOWN_MS, error: info });
        console.error(`Search provider ${provider.name} unavailable (${info.status}): ${info.message}. Trying the next one.`);
        continue;
      }
      // Other errors (timeout, bad query) are specific to this request: try the next provider too.
      console.error(`Search provider ${provider.name} error: ${info.message}`);
    }
  }
  return { results: [], provider: null, errors };
}

const configuredProviders = () => PROVIDERS.filter((p) => p.key()).map((p) => p.name);

module.exports = { searchWeb, configuredProviders };
