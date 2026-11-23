// Web search with automatic fallback: Tavily -> Serper (Google results) ->
// Brave. A provider is used when its API key is set; when one fails with a
// limit/auth error it is skipped for a while so a scan doesn't keep hitting it.
// All providers return the same shape:
//   { title, url, content, published_date, provider }
const axios = require('axios');

const TIMEOUT_MS = 15000;
const COOLDOWN_MS = 30 * 60 * 1000; // skip a failing provider for 30 minutes

// provider name -> { until: timestamp, error } (per server instance)
const disabled = new Map();

const stripTags = (text) => (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const PROVIDERS = [
  {
    name: 'tavily',
    key: () => process.env.TAVILY_API_KEY,
    async search(query, { depth = 'basic', maxResults = 10 } = {}) {
      const { data } = await axios.post(
        'https://api.tavily.com/search',
        { api_key: process.env.TAVILY_API_KEY, query, search_depth: depth, max_results: maxResults },
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
    async search(query, { maxResults = 10 } = {}) {
      const { data } = await axios.post(
        'https://google.serper.dev/search',
        { q: query, num: maxResults },
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
    name: 'brave',
    key: () => process.env.BRAVE_API_KEY,
    async search(query, { maxResults = 10 } = {}) {
      const { data } = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query, count: Math.min(maxResults, 20) },
        headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, Accept: 'application/json' },
        timeout: TIMEOUT_MS,
      });
      return ((data.web && data.web.results) || []).map((r) => ({
        title: stripTags(r.title),
        url: r.url,
        content: stripTags([r.description, ...(r.extra_snippets || [])].join(' ')),
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
