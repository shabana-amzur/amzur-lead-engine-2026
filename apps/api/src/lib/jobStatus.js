// Is a job posting still open? Greenhouse and Lever return 404 once a job is
// closed or removed. Returns true (open), false (closed) or null (can't tell:
// not a job board we can check, or a temporary error). Free, no search credits.
const axios = require('axios');

const TIMEOUT_MS = 8000;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' };

function jobApiUrl(url) {
  const greenhouse = (url || '').match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)\/jobs\/(\d+)/);
  if (greenhouse) return `https://boards-api.greenhouse.io/v1/boards/${greenhouse[1]}/jobs/${greenhouse[2]}`;
  const lever = (url || '').match(/jobs\.(eu\.)?lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (lever) return `https://${lever[1] ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${lever[2]}/${lever[3]}`;
  return null;
}

async function isJobOpen(url) {
  const api = jobApiUrl(url);
  if (!api) return null;
  try {
    await axios.get(api, { timeout: TIMEOUT_MS, headers: HEADERS });
    return true;
  } catch (error) {
    const status = error.response && error.response.status;
    if (status === 404 || status === 410) return false;
    return null; // network error, rate limit: unknown, check again later
  }
}

module.exports = { isJobOpen, jobApiUrl };
