// Apollo.io REST API: find ICP decision makers at a lead's company, reveal a
// contact's email, and look up company revenue / headcount for the ICP check.
// Needs APOLLO_API_KEY (a master key: People Search requires one).
//
// Credits: people search is free; revealing a person (people/match) and
// enriching a company (organizations/enrich) cost 1 credit each when found.
// Nothing here runs automatically: only when a user clicks in the lead page.
// CommonJS so scripts can require it too.
const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';
const TIMEOUT_MS = 20000;

const isConfigured = () => !!process.env.APOLLO_API_KEY;

class ApolloError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apollo(path, body, method = 'post') {
  if (!isConfigured()) throw new ApolloError('Apollo is not configured: set APOLLO_API_KEY on the API.', 503);
  try {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': process.env.APOLLO_API_KEY };
    const { data } =
      method === 'get'
        ? await axios.get(`${BASE_URL}/${path}`, { params: body, headers, timeout: TIMEOUT_MS })
        : await axios.post(`${BASE_URL}/${path}`, body, { headers, timeout: TIMEOUT_MS });
    return data;
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.error || error.response?.data?.message || error.message;
    if (status === 401) throw new ApolloError('Apollo rejected the API key.', 502);
    if (status === 403) throw new ApolloError(`Apollo refused the request (${detail}). People Search needs a master API key.`, 502);
    if (status === 422 && /credit/i.test(String(detail))) throw new ApolloError('Apollo credits are used up.', 402);
    if (status === 429) throw new ApolloError('Apollo rate limit reached. Try again in a minute.', 429);
    throw new ApolloError(`Apollo request failed: ${detail}`, 502);
  }
}

// ICP decision makers (Amzur research), most relevant first per line of business.
const ICP_TITLES = {
  Cloud: ['CTO', 'Chief Technology Officer', 'VP of Technology', 'VP Engineering', 'CIO', 'Head of Infrastructure'],
  ERP: ['CIO', 'Chief Information Officer', 'COO', 'Chief Operating Officer', 'Head of Digital Transformation', 'VP of IT', 'Director of Business Systems'],
  Solution: ['CTO', 'Chief Technology Officer', 'VP of Technology', 'VP Engineering', 'CIO'],
  'Application Development': ['CTO', 'Chief Technology Officer', 'VP of Technology', 'VP Engineering', 'Head of Digital Transformation'],
  'Legacy Modernization': ['CIO', 'Chief Information Officer', 'CTO', 'Head of Digital Transformation', 'VP of IT'],
  'Process Automation': ['COO', 'Chief Operating Officer', 'Head of Digital Transformation', 'CIO', 'VP Operations'],
  Offshore: ['CTO', 'Chief Technology Officer', 'VP of Technology', 'VP Engineering', 'COO'],
};
const ALL_ICP_TITLES = ['CTO', 'Chief Technology Officer', 'COO', 'Chief Operating Officer', 'CIO', 'Chief Information Officer', 'VP of Technology', 'Head of Digital Transformation'];

// How well a title fits the ICP roles: higher is better.
function icpRank(title) {
  const t = (title || '').toLowerCase();
  // Marketing, sales, HR, finance and legal leaders aren't technology / operations buyers.
  if (/\b(marketing|sales|revenue|brand|communications|talent|people|hr|human resources|finance|legal|policy|regulatory|counsel)\b/.test(t)) return /\b(ceo|founder)\b|(?<!vice )\bpresident\b/.test(t) ? 1 : 0;
  if (/\b(cto|cio|coo|chief (technology|technical|information|operating|operations|digital|transformation) officer)\b/.test(t)) return 4;
  if (/\b(head of digital|digital transformation)\b/.test(t)) return 3;
  if (/\b(svp|evp|senior vice president|executive vice president|vp|vice president)\b,?\s*(of\s+)?(technology|it|information|engineering|operations)\b/.test(t)) return 3;
  if (/\b(svp|evp|vp|vice president|head)\b/.test(t) && /\b(engineering|technology|it|operations|digital|infrastructure|systems|data)\b/.test(t)) return 2;
  if (/\b(ceo|founder|managing director|general manager)\b|(?<!vice )\bpresident\b/.test(t)) return 1;
  return 0;
}

const domainOf = (website) =>
  (website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#].*$/, '').toLowerCase() || null;

const candidateFrom = (person) => ({
  id: person.id,
  firstName: person.first_name || null,
  lastName: person.last_name || person.last_name_obfuscated || null,
  name: [person.first_name, person.last_name || person.last_name_obfuscated].filter(Boolean).join(' '),
  title: person.title || null,
  hasEmail: !!person.has_email,
  hasPhone: person.has_direct_phone === 'Yes' || person.has_direct_phone === true,
  organization: person.organization?.name || null,
  icpRank: icpRank(person.title),
});

/**
 * Free: senior people at the company, ICP roles first.
 * @param {{ website?: string, companyName: string, lob?: string }} lead
 */
async function findDecisionMakers({ website, companyName, lob }) {
  const domain = domainOf(website);
  const where = domain ? { q_organization_domains_list: [domain] } : { q_keywords: companyName };
  const titles = [...new Set([...(ICP_TITLES[lob] || []), ...ALL_ICP_TITLES])];

  // ICP titles first; if the company uses other titles, fall back to seniority.
  const byTitle = await apollo('mixed_people/api_search', { ...where, person_titles: titles, per_page: 25 });
  let people = byTitle.people || [];
  if (people.length < 3) {
    const bySeniority = await apollo('mixed_people/api_search', {
      ...where,
      person_seniorities: ['c_suite', 'vp', 'head', 'founder', 'owner'],
      per_page: 25,
    });
    const seen = new Set(people.map((p) => p.id));
    people = [...people, ...(bySeniority.people || []).filter((p) => !seen.has(p.id))];
  }
  const ranked = people.map(candidateFrom).sort((a, b) => b.icpRank - a.icpRank);
  // Leave out marketing / HR / finance titles when there are enough real decision makers.
  const relevant = ranked.filter((c) => c.icpRank > 0);
  const candidates = (relevant.length >= 3 ? relevant : ranked).slice(0, 10);
  return { candidates, matchedBy: domain ? `domain ${domain}` : `company name "${companyName}"` };
}

/** 1 credit when found: the person's work email and profile. */
async function revealContact(personId) {
  const data = await apollo('people/match', { id: personId, reveal_personal_emails: false });
  const person = data.person;
  if (!person) return null;
  const phone = (person.phone_numbers || [])[0]?.sanitized_number || person.organization?.primary_phone?.sanitized_number || null;
  return {
    id: person.id,
    name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
    title: person.title || null,
    email: person.email && !/^email_not_unlocked/i.test(person.email) ? person.email : null,
    emailStatus: person.email_status || null,
    linkedinUrl: person.linkedin_url || null,
    phone,
    phoneIsCompany: !(person.phone_numbers || []).length && !!phone,
    location: [person.city, person.state, person.country].filter(Boolean).join(', ') || null,
    organization: person.organization?.name || null,
    icpRank: icpRank(person.title),
    revealedAt: new Date().toISOString(),
  };
}

/** 1 credit when found: company revenue, headcount and founding year. */
async function enrichCompany(website) {
  const domain = domainOf(website);
  if (!domain) throw new ApolloError('No company website to look up.', 400);
  const data = await apollo('organizations/enrich', { domain }, 'get');
  const org = data.organization;
  if (!org) return null;
  return {
    name: org.name || null,
    revenue: org.annual_revenue || null,
    revenuePrinted: org.annual_revenue_printed || null,
    employees: org.estimated_num_employees || null,
    founded: org.founded_year ? String(org.founded_year) : null,
    industry: org.industry || null,
    linkedinUrl: org.linkedin_url || null,
    phone: org.primary_phone?.sanitized_number || org.phone || null,
    city: [org.city, org.state, org.country].filter(Boolean).join(', ') || null,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { isConfigured, findDecisionMakers, revealContact, enrichCompany, ApolloError, icpRank };
