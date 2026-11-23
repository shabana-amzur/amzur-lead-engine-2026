// Look up a short company profile for a lead: official website, LinkedIn
// company page, description, headquarters, headcount. Uses one basic Tavily
// search (1 credit) and parses Tavily company profiles and LinkedIn company
// snippets. CommonJS so the backfill script can require it too.
const { searchWeb, configuredProviders } = require('./searchProviders');

const TIMEOUT_MS = 12000;

function companyKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Labels used in Tavily company profiles and LinkedIn company snippets.
const LABELS =
  'ID|Website|Legal name|Headquarters|LinkedIn|Industry codes|Industry|Company type|Type|Founded|Business model|SaaS|Social profiles|Social Profiles|Phone|Description|Employees|Leadership|Products and services|Keywords|Specialties|Company size';

const field = (text, label) => {
  const match = text.match(new RegExp(`${label}:\\s*(.+?)(?=\\s+(?:${LABELS}):|\\s*##|\\s*\\[\\.\\.\\.\\]|$)`));
  return match ? match[1].trim().replace(/[,·]\s*$/, '') : null;
};

const toUrl = (value) => {
  if (!value) return null;
  const cleaned = value.split(/[\s·,]/)[0].replace(/\/$/, '');
  if (!/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}/i.test(cleaned)) return null;
  return cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
};

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Keep descriptions short: up to two sentences / ~300 characters.
function shorten(text) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').replace(/\[\.\.\.\].*$/, '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > 300) break;
    out += sentence;
    if (out.split(/[.!?]/).length > 2) break;
  }
  out = (out || clean.slice(0, 300)).trim();
  return out.length >= 30 ? out : null;
}

// Industry words to tell apart companies with the same name (e.g. "Eko").
const INDUSTRY_HINTS = {
  Healthcare: /health|medical|hospital|pharma|biotech|clinical|life science/i,
  Energy: /energy|oil|gas|utilit|power|nuclear|renewable|solar|electric/i,
  'Financial Services': /bank|financ|insurance|credit|payment|capital/i,
  Manufacturing: /manufactur|industrial|aerospace|automotive/i,
  'Retail & Consumer': /retail|consumer|apparel|food|nutrition/i,
  'Public Sector': /government|public|defense/i,
};

function parseTavilyProfile(result) {
  const text = (result.content || '').replace(/\s+/g, ' ');
  const name = (text.match(/^#\s*(.+?)\s+(?:ID|Website|Legal name|Headquarters|Description):/) || [])[1];
  const linkedIn = field(text, 'LinkedIn');
  return {
    name: name || null,
    website: toUrl(field(text, 'Website')),
    linkedinUrl: linkedIn && /linkedin\.com\/company\//.test(linkedIn) ? toUrl(linkedIn) : null,
    headquarters: field(text, 'Headquarters'),
    linkedinIndustry: field(text, 'Industry'),
    founded: (field(text, 'Founded') || '').match(/\d{4}/)?.[0] || null,
    description: shorten(field(text, 'Description')),
  };
}

function parseLinkedInCompany(result) {
  const text = (result.content || '').replace(/\s+/g, ' ');
  const name = (text.match(/^#\s*(.+?)\s+Description:/) || [])[1];
  const employees = text.match(/Employees\s*-\s*Now:\s*([\d,]+)/);
  return {
    name: name || null,
    linkedinUrl: result.url.replace(/^https?:\/\/[a-z]{2}\./, 'https://www.').replace(/\/$/, ''),
    headquarters: field(text, 'Headquarters'),
    linkedinIndustry: field(text, 'Industry'),
    employees: employees ? parseInt(employees[1].replace(/,/g, ''), 10) : null,
    description: shorten(field(text, 'Description')),
  };
}

// Sites that are never a company's own website.
const NOT_OFFICIAL = /(linkedin|wikipedia|crunchbase|glassdoor|indeed|lever\.co|greenhouse|prnewswire|businesswire|bloomberg|zoominfo|facebook|twitter|x\.com|youtube|instagram|builtin|wellfound|pitchbook|cbinsights|dnb\.com|apollo|leadiq|rocketreach|tavily|yahoo|reuters|forbes|craft\.co|owler|comparably|tracxn|signalhire|salezshark|globaldata)/i;

// LinkedIn company result from Google (Serper): "RapidAI | LinkedIn" / "25,253 followers on LinkedIn. RapidAI delivers..."
function parseGenericLinkedIn(result) {
  const title = (result.title || '').split(/\s+[|\-–]\s+/)[0].trim();
  const content = (result.content || '').replace(/\s+/g, ' ');
  const description = content.replace(/^.*?followers on LinkedIn\.?\s*/i, '').replace(/^[^.]{0,60}\|\s*/, '');
  const employees = content.match(/([\d,]+)\s+employees/i);
  return {
    name: title || null,
    linkedinUrl: result.url.replace(/^https?:\/\/[a-z]{2}\./, 'https://www.').replace(/[?#].*$/, '').replace(/\/$/, ''),
    description: shorten(description),
    employees: employees ? parseInt(employees[1].replace(/,/g, ''), 10) : null,
  };
}

// The company's own site from a search result.
function parseOfficialSite(result) {
  let origin = null;
  try {
    origin = new URL(result.url).origin;
  } catch {
    return null;
  }
  return {
    name: (result.title || '').split(/\s+[|\-–:]\s+/)[0].trim() || null,
    website: origin,
    description: shorten(result.content),
  };
}

// How likely a parsed profile is the lead's company.
function matchScore(profile, key, hints) {
  let score = 0;
  if (profile.name && companyKey(profile.name) === key) score += 3;
  else if (profile.name && companyKey(profile.name).startsWith(key)) score += 1;
  const slug = (profile.linkedinUrl || '').split('/company/')[1]?.replace(/[^a-z0-9]/gi, '').toLowerCase() || '';
  const site = host(profile.website || '').split('.')[0].replace(/[^a-z0-9]/g, '');
  for (const candidate of [key, hints.boardSlug].filter(Boolean)) {
    if (slug && (slug === candidate || slug.startsWith(candidate))) score += 2;
    if (site && (site === candidate || candidate.startsWith(site))) score += 2;
  }
  const industryHint = INDUSTRY_HINTS[hints.industry];
  if (industryHint && industryHint.test(`${profile.linkedinIndustry || ''} ${profile.description || ''}`)) score += 2;
  return score;
}

/**
 * @param {string} companyName
 * @param {{ industry?: string, sourceUrl?: string }} [hints]
 * @returns {Promise<object|null>} profile or null when nothing reliable was found.
 */
async function findCompanyProfile(companyName, hints = {}) {
  const key = companyKey(companyName);
  if (!key || configuredProviders().length === 0) return null;

  // Job-board account name, e.g. jobs.lever.co/eko-health -> "ekohealth".
  const board = (hints.sourceUrl || '').match(/(?:lever\.co|greenhouse\.io)\/([^/?#]+)/);
  const boardSlug = board ? board[1].replace(/[^a-z0-9]/gi, '').toLowerCase() : null;
  const industryWord = hints.industry && INDUSTRY_HINTS[hints.industry] ? hints.industry.toLowerCase() : '';

  const { results, provider, errors } = await searchWeb(
    `"${companyName}" ${industryWord} company official website LinkedIn`,
    { depth: 'basic', maxResults: 8 }
  );
  // Every provider failed (limits, outage): throw so the caller retries later.
  if (!provider && errors.length) throw new Error(`Search unavailable: ${errors.map((e) => e.message).join('; ')}`);

  const profiles = [
    ...results.filter((r) => /tavily\.com\/knowledge\/company\//.test(r.url)).map(parseTavilyProfile),
    ...results
      .filter((r) => /linkedin\.com\/company\/[^/?#]+\/?$/.test(r.url))
      .map((r) => (/^#\s/.test(r.content || '') ? parseLinkedInCompany(r) : parseGenericLinkedIn(r))),
    ...results
      .filter((r) => !NOT_OFFICIAL.test(host(r.url)))
      .map(parseOfficialSite)
      .filter(Boolean),
  ];
  const ranked = profiles
    .map((profile) => ({ profile, score: matchScore(profile, key, { boardSlug, industry: hints.industry }) }))
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;

  // Merge: best match first, filling gaps from other matches for the same company.
  const best = ranked[0].profile;
  // Matches that don't point to a different LinkedIn company are the same company
  // (e.g. its own website result plus its LinkedIn page).
  const linkedInPath = (url) => (url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  const sameCompany = ranked
    .map((entry) => entry.profile)
    .filter(
      (profile) =>
        profile === best ||
        !profile.linkedinUrl ||
        !best.linkedinUrl ||
        linkedInPath(best.linkedinUrl) === linkedInPath(profile.linkedinUrl)
    );
  const pick = (name) => sameCompany.map((profile) => profile[name]).find(Boolean) || null;

  const profile = {
    description: pick('description'),
    website: pick('website'),
    linkedinUrl: pick('linkedinUrl'),
    headquarters: pick('headquarters'),
    linkedinIndustry: pick('linkedinIndustry'),
    employees: pick('employees'),
    founded: pick('founded'),
  };
  if (!profile.website && !profile.linkedinUrl && !profile.description) return null;
  return { ...profile, source: `Public company profile / LinkedIn (via ${provider})` };
}

module.exports = { findCompanyProfile };
