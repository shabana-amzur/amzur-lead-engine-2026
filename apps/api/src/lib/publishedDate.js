// Find when the source of a lead was actually published online (the job
// posting, press release or LinkedIn post), not when we discovered it.
// Returns { date: ISO string, method: string } or null when the source
// doesn't publish a date. CommonJS so the backfill script can require it too.
const axios = require('axios');

const TIMEOUT_MS = 8000;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' };

function validDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 2000 || date.getTime() > Date.now() + 86400000) return null;
  return date;
}

function result(date, method) {
  const valid = validDate(date);
  return valid ? { date: valid.toISOString(), method } : null;
}

// LinkedIn activity IDs embed the post time: the top bits are a millisecond timestamp.
function fromLinkedInActivityId(url) {
  const match = url.match(/activity-(\d{19})/);
  if (!match) return null;
  try {
    return result(Number(BigInt(match[1]) >> 22n), 'LinkedIn post ID');
  } catch {
    return null;
  }
}

// Dates in the URL: Business Wire /news/home/20260226773189/, TechCrunch /2026/11/05/.
function fromUrl(url) {
  const businessWire = url.match(/businesswire\.com\/news\/home\/(\d{4})(\d{2})(\d{2})\d+/);
  if (businessWire) return result(`${businessWire[1]}-${businessWire[2]}-${businessWire[3]}T00:00:00Z`, 'Business Wire URL');
  const dated = url.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  if (dated) return result(`${dated[1]}-${dated[2]}-${dated[3]}T00:00:00Z`, 'Article URL');
  return null;
}

async function fromGreenhouse(url) {
  const match = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)\/jobs\/(\d+)/);
  if (!match) return null;
  const { data } = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}`, {
    timeout: TIMEOUT_MS,
    headers: HEADERS,
  });
  return result(data.first_published || data.updated_at, 'Greenhouse job API');
}

async function fromLever(url) {
  const match = url.match(/jobs\.(?:eu\.)?lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (!match) return null;
  const host = url.includes('.eu.lever.co') ? 'api.eu.lever.co' : 'api.lever.co';
  const { data } = await axios.get(`https://${host}/v0/postings/${match[1]}/${match[2]}`, {
    timeout: TIMEOUT_MS,
    headers: HEADERS,
  });
  return result(data.createdAt, 'Lever job API');
}

// Published-date metadata in the page itself (PR Newswire and most news sites).
async function fromPageMetadata(url) {
  const { data: html } = await axios.get(url, { timeout: TIMEOUT_MS, headers: HEADERS, responseType: 'text' });
  if (typeof html !== 'string') return null;
  const patterns = [
    /property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /name=["']date["'][^>]*content=["']([^"']+)["']/i,
    /<time[^>]*datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const found = match && result(match[1], 'Page metadata');
    if (found) return found;
  }
  return null;
}

/**
 * @param {string} url Source URL of the lead.
 * @param {string} [searchPublishedDate] published_date from the search API, if any.
 */
async function findPublishedDate(url, searchPublishedDate) {
  if (!url) return null;
  const quick = fromLinkedInActivityId(url) || fromUrl(url) || result(searchPublishedDate, 'Search result');
  if (quick) return quick;

  const lookups = [];
  if (url.includes('greenhouse.io')) lookups.push(fromGreenhouse);
  if (url.includes('lever.co')) lookups.push(fromLever);
  if (!url.includes('linkedin.com') && !url.includes('sam.gov')) lookups.push(fromPageMetadata);

  for (const lookup of lookups) {
    try {
      const found = await lookup(url);
      if (found) return found;
    } catch {
      // Source unavailable (removed posting, blocked, timeout): try the next method.
    }
  }
  return null;
}

module.exports = { findPublishedDate };
