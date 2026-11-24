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
  // Not a current decision maker there.
  if (/\b(former|ex-|retired|independent|freelance|advisor|adviser|consultant|board member|investor)\b/.test(t)) return 0;
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

// Company names compared loosely: case, accents, punctuation and legal
// suffixes ignored ("Azərbaycan Dəmir Yolları - ADY / Azerbaijan Railways"
// matches "Azerbaijan Railways").
const normalizeName = (name) =>
  (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|group|holdings|plc|gmbh|pvt|private)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const nameMatches = (orgName, companyName) => {
  const a = normalizeName(orgName);
  const b = normalizeName(companyName);
  // Whole words only: "Capco" must not match "Capcom".
  return !!a && !!b && (a === b || ` ${a} `.includes(` ${b} `) || (` ${b} `.includes(` ${a} `) && a.length >= 4));
};

// The company's name as Apollo would know it: no "UK's" prefix, no quoted
// headline fragment ("‘Absurd ambition’: Pulumi" -> "Pulumi").
const cleanCompanyName = (name) =>
  (name || '')
    .replace(/^.*?[:：]\s+/, '')
    .replace(/^(UK|US|U\.S\.|UAE|India|Indian|Dutch|German|French|Irish|British|European)['’]s\s+/i, '')
    .replace(/^[‘'"“]+|[’'"”]+$/g, '')
    .trim();

/**
 * Free: the company's real website, found without spending credits.
 * Candidate domains come from a public company-name lookup; each is kept only
 * if Apollo lists people at that domain working for a company of that name.
 */
async function resolveDomain(companyName) {
  const name = cleanCompanyName(companyName);
  let suggestions = [];
  try {
    const { data } = await axios.get('https://autocomplete.clearbit.com/v1/companies/suggest', {
      params: { query: name },
      timeout: 6000,
    });
    suggestions = Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
  const candidates = suggestions.filter((s) => s.domain && nameMatches(s.name, name)).slice(0, 3);
  for (const candidate of candidates) {
    const check = await apollo('mixed_people/api_search', { q_organization_domains_list: [candidate.domain], per_page: 3 }).catch(() => null);
    if ((check?.people || []).some((p) => nameMatches(p.organization?.name, name))) return candidate.domain;
  }
  return null;
}

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
 * Free: senior people at the company, ICP roles first. Searches by the
 * company's verified domain when known, otherwise by its name (only people
 * whose employer name matches are kept). Also returns the company's verified
 * domain when it can be found for free.
 * @param {{ website?: string|null, companyName: string, lob?: string }} lead  website must be verified, never guessed
 */
async function findDecisionMakers({ website, companyName, lob }) {
  const name = cleanCompanyName(companyName);
  let domain = domainOf(website);
  const titles = [...new Set([...(ICP_TITLES[lob] || []), ...ALL_ICP_TITLES])];
  const seniorities = ['c_suite', 'vp', 'head', 'founder', 'owner'];

  const search = async (where, matchName) => {
    const byTitle = await apollo('mixed_people/api_search', { ...where, person_titles: titles, per_page: 25 });
    let people = byTitle.people || [];
    if (people.length < 3) {
      const bySeniority = await apollo('mixed_people/api_search', { ...where, person_seniorities: seniorities, per_page: 25 });
      const seen = new Set(people.map((p) => p.id));
      people = [...people, ...(bySeniority.people || []).filter((p) => !seen.has(p.id))];
    }
    return matchName ? people.filter((p) => nameMatches(p.organization?.name, name)) : people;
  };

  let people = [];
  let matchedBy = null;
  if (domain) {
    people = await search({ q_organization_domains_list: [domain] }, false);
    matchedBy = `domain ${domain}`;
  }
  if (!people.length) {
    people = await search({ q_organization_name: name }, true);
    matchedBy = `company name "${name}"`;
  }
  if (!domain) domain = await resolveDomain(name);

  const ranked = people.map(candidateFrom).sort((a, b) => b.icpRank - a.icpRank);
  // Leave out marketing / HR / finance titles when there are enough real decision makers.
  const relevant = ranked.filter((c) => c.icpRank > 0);
  const candidates = (relevant.length >= 3 ? relevant : ranked).slice(0, 10);
  return { candidates, matchedBy, domain };
}

// Phone numbers from an Apollo person record, best first (mobile / direct before others).
function phonesFrom(person) {
  const rank = (p) => ({ mobile: 0, direct_dial: 1, work_direct: 1, work: 2 }[p.type_cd || p.type] ?? 3);
  return (person?.phone_numbers || [])
    .filter((p) => p && (p.sanitized_number || p.raw_number))
    .sort((a, b) => rank(a) - rank(b))
    .map((p) => ({ number: p.sanitized_number || p.raw_number, type: p.type_cd || p.type || null }));
}

/**
 * Reveal a person. Email: 1 credit when found. With `webhookUrl`, also asks
 * Apollo for their phone numbers (extra credits when found); Apollo sends
 * those to the webhook a little later.
 */
async function revealContact(personId, { webhookUrl } = {}) {
  const body = { id: personId, reveal_personal_emails: false };
  if (webhookUrl) Object.assign(body, { reveal_phone_number: true, webhook_url: webhookUrl });
  const data = await apollo('people/match', body);
  const person = data.person;
  if (!person) return null;
  const phones = phonesFrom(person);
  const phone = phones[0]?.number || person.organization?.primary_phone?.sanitized_number || null;
  return {
    id: person.id,
    name: person.name || [person.first_name, person.last_name].filter(Boolean).join(' '),
    title: person.title || null,
    email: person.email && !/^email_not_unlocked/i.test(person.email) ? person.email : null,
    emailStatus: person.email_status || null,
    linkedinUrl: person.linkedin_url || null,
    phone,
    phoneIsCompany: !phones.length && !!phone,
    phones,
    phoneStatus: webhookUrl ? (phones.length ? 'found' : 'pending') : undefined,
    location: [person.city, person.state, person.country].filter(Boolean).join(', ') || null,
    organization: person.organization?.name || null,
    organizationDomain: person.organization?.primary_domain || domainOf(person.organization?.website_url) || null,
    icpRank: icpRank(person.title),
    revealedAt: new Date().toISOString(),
  };
}

// Technologies worth calling out because they map to an Amzur service.
const AMZUR_RELEVANT_TECH =
  /\b(netsuite|sap|oracle|dynamics|business central|workday|sage|quickbooks|salesforce|hubspot|servicenow|aws|amazon web services|azure|google cloud|gcp|kubernetes|docker|terraform|jenkins|uipath|automation anywhere|blue prism|power automate|mainframe|cobol|as\/?400|snowflake|databricks|power bi|tableau|\.net|java|react|angular|node)\b/i;

const percent = (value) => (typeof value === 'number' ? Math.round(value * 1000) / 10 : null);

/**
 * 1 credit when found: the company's profile from Apollo: size, growth,
 * funding, team sizes, technology stack and description.
 */
async function enrichCompany(website) {
  const domain = domainOf(website);
  if (!domain) throw new ApolloError('No company website to look up.', 400);
  const data = await apollo('organizations/enrich', { domain }, 'get');
  const org = data.organization;
  if (!org) return null;

  const tech = (org.current_technologies || []).map((t) => ({ name: t.name, category: t.category || 'Other' }));
  const techNames = tech.length ? tech.map((t) => t.name) : org.technology_names || [];
  const departments = Object.entries(org.departmental_head_count || {})
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }));

  return {
    id: org.id || null,
    name: org.name || null,
    description: org.short_description || org.seo_description || null,
    industry: org.industry || null,
    keywords: (org.keywords || []).slice(0, 12),
    revenue: org.annual_revenue || null,
    revenuePrinted: org.annual_revenue_printed || null,
    employees: org.estimated_num_employees || null,
    growth: {
      sixMonths: percent(org.organization_headcount_six_month_growth),
      twelveMonths: percent(org.organization_headcount_twelve_month_growth),
      twentyFourMonths: percent(org.organization_headcount_twenty_four_month_growth),
    },
    departments: departments.slice(0, 8),
    founded: org.founded_year ? String(org.founded_year) : null,
    address: org.raw_address || [org.street_address, org.city, org.state, org.country].filter(Boolean).join(', ') || null,
    city: [org.city, org.state, org.country].filter(Boolean).join(', ') || null,
    phone: org.primary_phone?.sanitized_number || org.phone || null,
    website: org.website_url || null,
    linkedinUrl: org.linkedin_url || null,
    twitterUrl: org.twitter_url || null,
    funding: {
      total: org.total_funding || null,
      totalPrinted: org.total_funding_printed || null,
      latestStage: org.latest_funding_stage || null,
      latestDate: org.latest_funding_round_date || null,
    },
    publicSymbol: org.publicly_traded_symbol ? `${org.publicly_traded_exchange ? `${org.publicly_traded_exchange.toUpperCase()}: ` : ''}${org.publicly_traded_symbol}` : null,
    techStack: tech.length ? tech : techNames.map((name) => ({ name, category: 'Other' })),
    relevantTech: [...new Set(techNames.filter((name) => AMZUR_RELEVANT_TECH.test(name)))],
    checkedAt: new Date().toISOString(),
  };
}

// ---- sequences (outreach in Apollo) ----

/** The team's Apollo sequences and sending mailboxes, for the picker. Free. */
async function listSequencesAndMailboxes() {
  const [sequences, mailboxes] = await Promise.all([
    apollo('emailer_campaigns/search', { per_page: 100 }),
    apollo('email_accounts', {}, 'get'),
  ]);
  return {
    sequences: (sequences.emailer_campaigns || [])
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, name: c.name, active: !!c.active, steps: c.num_steps ?? null })),
    mailboxes: (mailboxes.email_accounts || [])
      .filter((m) => m.active !== false)
      .map((m) => ({ id: m.id, email: m.email, isDefault: !!m.default })),
  };
}

/**
 * Save a revealed person as an Apollo contact (deduplicated by Apollo) and add
 * them to a sequence. Apollo then sends that sequence's emails from the mailbox.
 */
async function addContactToSequence({ contact, companyName, sequenceId, mailboxId }) {
  const [firstName, ...rest] = (contact.name || '').split(' ');
  const created = await apollo('contacts', {
    first_name: firstName,
    last_name: rest.join(' '),
    email: contact.email,
    title: contact.title || undefined,
    organization_name: contact.organization || companyName,
    linkedin_url: contact.linkedinUrl || undefined,
    run_dedupe: true,
  });
  const contactId = created.contact?.id;
  if (!contactId) throw new ApolloError('Apollo did not create the contact.', 502);
  await apollo(`emailer_campaigns/${sequenceId}/add_contact_ids`, {
    emailer_campaign_id: sequenceId,
    contact_ids: [contactId],
    send_email_from_email_account_id: mailboxId,
    sequence_no_email: false,
    sequence_active_in_other_campaigns: false,
  });
  return contactId;
}

module.exports = {
  isConfigured,
  findDecisionMakers,
  revealContact,
  enrichCompany,
  phonesFrom,
  listSequencesAndMailboxes,
  addContactToSequence,
  ApolloError,
  icpRank,
};
