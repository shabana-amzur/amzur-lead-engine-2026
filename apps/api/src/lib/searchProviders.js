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

// Serper sometimes returns Google redirect links (google.com/goto?url=...)
// instead of the real page. Follow them to get the actual URL.
async function resolveGoogleRedirect(url) {
  if (!/^https?:\/\/(www\.)?google\.[a-z.]+\/(goto|url)\?/i.test(url || '')) return url;
  try {
    const response = await axios.get(url, {
      maxRedirects: 0,
      timeout: 8000,
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' },
    });
    if (response.headers && response.headers.location) return response.headers.location;
    const html = String(response.data || '');
    const target =
      html.match(/http-equiv=["']refresh["'][^>]*url=([^"'>]+)/i) ||
      html.match(/href=["'](https?:\/\/(?!(?:www\.)?google\.)[^"']+)["']/i);
    return target ? target[1].replace(/&amp;/g, '&') : url;
  } catch {
    return url;
  }
}

// When a Google redirect can't be followed (it uses JavaScript), find the job
// on the company's public job board instead: Serper's display link names the
// board (e.g. "job-boards.greenhouse.io › addepar1 › jobs"), and the board's job
// list gives the real URL for the posting with the same title. Free.
const boardCache = new Map(); // board url -> Promise<[{ title, url }]>

const normalizeTitle = (title) =>
  (title || '')
    .toLowerCase()
    .replace(/^job application for\s+/, '')
    .replace(/\s+(at|@)\s+[^-|]+$/, '') // "... at Addepar"
    .replace(/^[^-|]{2,40}\s+[-|]\s+/, (prefix) => (/(engineer|developer|manager|analyst|architect)/i.test(prefix) ? prefix : '')) // "1inch - Senior ..." -> "Senior ..."
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function boardJobs(kind, board) {
  const key = `${kind}:${board}`;
  if (!boardCache.has(key)) {
    const request =
      kind === 'greenhouse'
        ? axios
            .get(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`, { timeout: 10000 })
            // Standard Greenhouse link (not the company's own careers-page URL) so job
            // details, posting date and open-status lookups recognise it.
            .then(({ data }) => (data.jobs || []).map((job) => ({ title: job.title, url: `https://job-boards.greenhouse.io/${board}/jobs/${job.id}` })))
        : axios
            .get(`https://api.lever.co/v0/postings/${board}?mode=json`, { timeout: 10000 })
            .then(({ data }) => (Array.isArray(data) ? data : []).map((job) => ({ title: job.text, url: job.hostedUrl })));
    boardCache.set(key, request.catch(() => []));
  }
  return boardCache.get(key);
}

async function findOnJobBoard(displayedLink, title) {
  const greenhouse = (displayedLink || '').match(/greenhouse\.io\s*›\s*([^\s›]+)/i);
  const lever = (displayedLink || '').match(/lever\.co\s*›\s*([^\s›]+)/i);
  if (!greenhouse && !lever) return null;
  const jobs = await boardJobs(greenhouse ? 'greenhouse' : 'lever', (greenhouse || lever)[1]);
  const wanted = normalizeTitle(title);
  if (!wanted) return null;
  const match =
    jobs.find((job) => normalizeTitle(job.title) === wanted) ||
    jobs.find((job) => wanted.includes(normalizeTitle(job.title)) && normalizeTitle(job.title).length > 8) ||
    jobs.find((job) => normalizeTitle(job.title).includes(wanted) && wanted.length > 8);
  return match ? match.url : null;
}

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
      const results = (data.organic || []).map((r) => ({
        title: r.title,
        url: r.link,
        content: r.snippet || '',
        published_date: r.date || null,
        displayedLink: r.displayedLink || '',
      }));
      return Promise.all(
        results.map(async ({ displayedLink, ...r }) => {
          let url = await resolveGoogleRedirect(r.url);
          if (/google\.[a-z.]+\/(goto|url)\?/i.test(url)) url = (await findOnJobBoard(displayedLink, r.title)) || url;
          return { ...r, url };
        })
      );
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
