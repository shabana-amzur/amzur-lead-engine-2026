// Read the actual source of a lead and describe the requirement in plain
// terms: what role / project / request it is, key facts, a short summary and
// the key requirement bullets. Uses public job APIs (Greenhouse, Lever) and the
// press-release page itself, so it costs no search credits.
// CommonJS so backfill scripts can require it too.
const axios = require('axios');

const TIMEOUT_MS = 8000;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LeadEngine/1.0)' };
const MAX_BULLETS = 5;

// ---- text helpers ----

function decodeEntities(text) {
  return (text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '–')
    .replace(/&reg;|&trade;/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

const stripTags = (html) => decodeEntities((html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Up to `max` characters, cut at a sentence end where possible.
function clip(text, max = 380) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.trim()}…`;
}

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

// Headings that introduce what the role/project actually involves.
const ROLE_HEADING = /responsibilit|what you('|’)?ll do|what you will do|the role|your role|you will|day[- ]to[- ]day|duties|how you help|key (tasks|areas)/i;
const REQUIREMENTS_HEADING = /requirement|qualification|what you bring|you have|you('|’)?ll need|skills|experience|must have|who you are|about you/i;
const SUMMARY_HEADING = /the role|about the role|the opportunity|role overview|position overview|overview|about the position|job summary|summary/i;

// Legal / HR boilerplate that says nothing about the requirement.
const BOILERPLATE =
  /equal opportunity|without regard to|reasonable accommodation|e-verify|privacy (notice|policy)|applicant privacy|background check|pay range|salary range|compensation range|benefits include|we offer (a|competitive)/i;

// Turn job-posting HTML into [{ heading, paragraphs[], bullets[] }] in order.
function sectionsFromHtml(html) {
  const sections = [{ heading: '', paragraphs: [], bullets: [] }];
  const tokens = html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<li[^>]*>([\s\S]*?)<\/li>|<p[^>]*>([\s\S]*?)<\/p>|<(strong|b)>([\s\S]*?)<\/\5>/gi);
  for (const token of tokens) {
    const current = sections[sections.length - 1];
    if (token[1]) {
      sections.push({ heading: stripTags(token[2]), paragraphs: [], bullets: [] });
    } else if (token[3] !== undefined) {
      const text = stripTags(token[3]);
      if (text.length > 3) current.bullets.push(text);
    } else if (token[4] !== undefined) {
      const text = stripTags(token[4]);
      const inner = token[4].replace(/&nbsp;|\u00a0/g, ' ');
      const boldOnly = /^\s*<(strong|b)\b[^>]*>[\s\S]*<\/(strong|b)>\s*:?\s*$/i.test(inner);
      if (text && (boldOnly || (text.length < 60 && text.endsWith(':')))) {
        sections.push({ heading: text.replace(/:$/, ''), paragraphs: [], bullets: [] });
      } else if (text.length > 40 && !BOILERPLATE.test(text)) {
        current.paragraphs.push(text);
      }
    } else if (token[6] !== undefined) {
      const text = stripTags(token[6]);
      if (text.length > 2 && text.length < 60) sections.push({ heading: text.replace(/:$/, ''), paragraphs: [], bullets: [] });
    }
  }
  return sections.filter((section) => section.heading || section.paragraphs.length || section.bullets.length);
}

function pickJobContent(sections, companyName) {
  const company = (companyName || '').toLowerCase();
  const withBullets = (pattern) => sections.find((s) => pattern.test(s.heading) && s.bullets.length);
  const role = withBullets(ROLE_HEADING);
  const requirements = withBullets(REQUIREMENTS_HEADING);
  const fallback = sections.find((s) => s.bullets.length);

  const groups = [];
  if (role) groups.push({ title: 'What the role involves', bullets: role.bullets.slice(0, MAX_BULLETS) });
  if (requirements && requirements !== role) groups.push({ title: 'What they need', bullets: requirements.bullets.slice(0, MAX_BULLETS) });
  if (!groups.length && fallback) groups.push({ title: fallback.heading || 'Key points', bullets: fallback.bullets.slice(0, MAX_BULLETS) });

  // Summary: the role overview, not the "About <company>" boilerplate.
  const overview = sections.find((s) => SUMMARY_HEADING.test(s.heading) && s.paragraphs.length);
  const notAboutCompany = sections.find(
    (s) => s.paragraphs.length && !/^about\b/i.test(s.heading) && !(company && s.heading.toLowerCase().includes(company))
  );
  const summarySource = overview || notAboutCompany || sections.find((s) => s.paragraphs.length);
  const summary = summarySource ? clip(summarySource.paragraphs.join(' ')) : null;

  return { summary, sections: groups };
}

// ---- per-source extractors ----

async function fromLever(url, companyName) {
  const match = url.match(/jobs\.(?:eu\.)?lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (!match) return null;
  const host = url.includes('.eu.lever.co') ? 'api.eu.lever.co' : 'api.lever.co';
  const { data } = await axios.get(`https://${host}/v0/postings/${match[1]}/${match[2]}`, { timeout: TIMEOUT_MS, headers: HEADERS });

  const html = [
    data.description || '',
    ...(data.lists || []).map((list) => `<h3>${list.text}</h3><ul>${list.content}</ul>`),
    data.additional || '',
  ].join('\n');
  const { summary, sections } = pickJobContent(sectionsFromHtml(html), companyName);

  const categories = data.categories || {};
  const facts = [
    categories.location && { label: 'Location', value: categories.location },
    data.workplaceType && data.workplaceType !== 'unspecified' && { label: 'Workplace', value: capitalize(data.workplaceType) },
    categories.commitment && { label: 'Type', value: categories.commitment },
    categories.team && { label: 'Team', value: categories.team },
  ].filter(Boolean);

  return { kind: 'job', headline: data.text, facts, summary, sections, from: 'Lever job posting' };
}

async function fromGreenhouse(url, companyName) {
  const match = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)\/jobs\/(\d+)/);
  if (!match) return null;
  const { data } = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs/${match[2]}`, {
    timeout: TIMEOUT_MS,
    headers: HEADERS,
  });
  // Greenhouse content is HTML-escaped (sometimes twice).
  const { summary, sections } = pickJobContent(sectionsFromHtml(decodeEntities(decodeEntities(data.content || ''))), companyName);
  const department = (data.departments || [])[0]?.name;
  const facts = [
    data.location?.name && { label: 'Location', value: data.location.name },
    department && { label: 'Team', value: department },
  ].filter(Boolean);
  return { kind: 'job', headline: data.title, facts, summary, sections, from: 'Greenhouse job posting' };
}

// Press releases and other articles: headline plus the opening paragraph.
async function fromArticle(url, companyName) {
  const { data: html } = await axios.get(url, { timeout: TIMEOUT_MS, headers: HEADERS, responseType: 'text' });
  if (typeof html !== 'string') return null;
  const meta = (property) =>
    (html.match(new RegExp(`(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, 'i')) ||
      [])[1];
  const headline = stripTags(meta('og:title') || (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '')
    .replace(/\s*[|–-]\s*(PR Newswire|Business Wire|TechCrunch).*$/i, '');

  const company = (companyName || '').toLowerCase().split(/\s+/)[0];
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((text) => text.length > 120 && !/cookie|subscribe|javascript/i.test(text));
  const opening = paragraphs.find((text) => company && text.toLowerCase().includes(company)) || paragraphs[0];
  // Drop the dateline, e.g. "CALGARY, Alberta, Nov 25, 2019 /PRNewswire/ --".
  const summary = opening ? clip(opening.replace(/^.{0,140}?\/\s*(PRNewswire|Business Wire|BUSINESS WIRE)[^/]*\/\s*(--|—|–)?\s*/i, '')) : null;
  if (!headline && !summary) return null;
  return { kind: 'press', headline, facts: [], summary, sections: [], from: 'Press release' };
}

function fromLinkedInPost(text) {
  const body = (text || '')
    .replace(/^[^|]{0,80}?['’]s Post\s*-\s*LinkedIn\s*\/?\s*/i, '')
    .replace(/^[A-Z][a-z]+ \d{1,2}, \d{4}\.\s*/, '')
    .split(/\s\|\s|Report this comment|\d+ Comments/)[0]
    .trim();
  if (!body) return null;
  const sentence = body.match(/^.{20,160}?[.?!](\s|$)/);
  const firstSentence = sentence ? sentence[0].trim() : clip(body, 120).replace(/\s+\S*…?$/, '') + '…';
  return { kind: 'linkedin', headline: firstSentence, facts: [], summary: clip(body, 500), sections: [], from: 'LinkedIn post' };
}

// Fallback from the search result itself (title + snippet).
function fromSearchResult(title, text) {
  const headline = stripTags(title || '');
  const summary = text ? clip(stripTags(text)) : null;
  if (!headline && !summary) return null;
  return { kind: 'web', headline: headline || null, facts: [], summary, sections: [], from: 'Search result' };
}

/**
 * @param {string} url Source URL of the lead.
 * @param {{ companyName?: string, title?: string, text?: string }} [context]
 * @returns {Promise<object|null>} null when nothing useful was found.
 * Throws on network errors so callers can retry later.
 */
async function findRequirementDetails(url, context = {}) {
  if (!url) return fromSearchResult(context.title, context.text);
  if (url.includes('linkedin.com/posts/')) return fromLinkedInPost(context.text);

  let details = null;
  if (url.includes('lever.co')) details = await fromLever(url, context.companyName);
  else if (url.includes('greenhouse.io')) details = await fromGreenhouse(url, context.companyName);
  else if (!url.includes('sam.gov')) {
    try {
      details = await fromArticle(url, context.companyName);
    } catch (error) {
      // Some sites (e.g. Business Wire) block automated requests: use the search result instead.
      if (error.response && error.response.status >= 400 && error.response.status < 500) details = null;
      else throw error;
    }
  }
  return details || fromSearchResult(context.title, context.text);
}

module.exports = { findRequirementDetails };
