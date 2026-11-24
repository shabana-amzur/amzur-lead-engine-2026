// Read a company's own description from its website: the About page first
// (/about-us, /about, ...), then the homepage. Free (plain page requests).
// Only for websites already confirmed for the lead; LinkedIn pages are not
// read directly (they need a login and block automated access).
// CommonJS so scripts can require it too.
const axios = require('axios');

const TIMEOUT_MS = 8000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AmzurLeadEngine/1.0)',
  Accept: 'text/html,application/xhtml+xml',
};
const ABOUT_PATHS = ['/about-us', '/about', '/company/about-us', '/company', '/who-we-are', '/our-story', ''];

const decode = (text) =>
  (text || '')
    .replace(/&nbsp;| /g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&[a-z]+;/g, ' ');

const strip = (html) => decode((html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Text that is site chrome, not a description.
const CHROME = /\b(cookie|cookies|javascript|subscribe|newsletter|sign in|log in|privacy policy|all rights reserved|copyright|accept|enable)\b/i;

// Only public websites: no localhost or private network addresses.
function isPublicHttpUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (!/^https?:$/.test(protocol)) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(hostname)) return false;
    return /\.[a-z]{2,}$/i.test(hostname);
  } catch {
    return false;
  }
}

// Up to ~3 sentences / 450 characters, cut at a sentence end.
function clip(text, max = 450) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

function describe(html, companyName) {
  const meta = (name) =>
    (html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i')) ||
      [])[1];
  const metaText = strip(meta('og:description') || meta('description') || '');

  // Substantial paragraphs in the page body, skipping nav/header/footer text.
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ');
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => strip(m[1]))
    .filter((p) => p.length >= 80 && !CHROME.test(p));

  // Prefer text that says what the company does, naming the company; avoid
  // culture, careers and values copy.
  const firstWord = (companyName || '').toLowerCase().split(/\s+/)[0];
  const score = (text, isMeta) => {
    let points = isMeta ? 1 : 0;
    if (firstWord && text.toLowerCase().includes(firstWord)) points += 2;
    if (/\b(is an?|are an?|provides?|helps?|delivers?|builds?|develops?|offers?|specializ\w+|leading|founded|headquartered|our mission|platform|solutions?|services?)\b/i.test(text)) points += 2;
    if (/\b(culture|inclusion|inclusive|diversity|careers?|join (our|the) team|benefits|our values|employees|hiring|respect)\b/i.test(text)) points -= 3;
    return points;
  };
  const candidates = [
    ...(metaText.length >= 60 && !CHROME.test(metaText) ? [{ text: metaText, points: score(metaText, true) }] : []),
    ...paragraphs.slice(0, 15).map((p) => ({ text: p, points: score(p, false) })),
  ]
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points);
  return candidates.length ? clip(candidates[0].text) : null;
}

/**
 * @param {string} website Confirmed company website.
 * @param {string} [companyName]
 * @returns {Promise<{ description: string, source: string } | null>}
 */
async function findAboutDescription(website, companyName) {
  if (!isPublicHttpUrl(website)) return null;
  const origin = new URL(website).origin;
  for (const path of ABOUT_PATHS) {
    const url = `${origin}${path}`;
    try {
      const { data, request } = await axios.get(url, {
        timeout: TIMEOUT_MS,
        headers: HEADERS,
        responseType: 'text',
        maxContentLength: 3_000_000,
        maxRedirects: 3,
        decompress: true,
      });
      // Redirected to another site (e.g. a parked domain): skip.
      const finalHost = request?.res?.responseUrl ? new URL(request.res.responseUrl).hostname.replace(/^www\./, '') : null;
      if (finalHost && finalHost !== new URL(origin).hostname.replace(/^www\./, '')) continue;
      if (typeof data !== 'string') continue;
      const description = describe(data, companyName);
      if (description) return { description, source: url };
    } catch {
      // Page missing or blocked: try the next one.
    }
  }
  return null;
}

module.exports = { findAboutDescription };
