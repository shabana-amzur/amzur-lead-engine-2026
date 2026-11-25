import axios from 'axios';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import nonBuyers from '../config/non-buyers.json';
import industryConfig from '../config/industries.json';
import { findPublishedDate } from '../lib/publishedDate';
import { findCompanyProfile } from '../lib/companyProfile';
import { classifyLinkedInPost } from '../lib/linkedinFilters';
import { readLinkedInPost, requirementFromPost } from '../lib/linkedinPost';
import { findRequirementDetails } from '../lib/requirementDetails';
import { searchWeb } from '../lib/searchProviders';
import { searchNews } from '../lib/freeSources';
import { fetchContractsFinder, fetchTed } from '../lib/tenderFeeds';
import { LEAD_MAX_AGE_DAYS, LEAD_ARCHIVE_DAYS, isRecent } from '../config/recency';
import { classifyGeography, leadGeography } from '../lib/geography';
import { isJobOpen, jobApiUrl } from '../lib/jobStatus';
import { classifyVendorIntent, headlineShowsVendorChosen } from '../lib/vendorIntent';
import { largeEnterpriseReason } from '../lib/largeEnterprise';
import { checkIcp } from '../lib/icp';

// OpenAI client for scoreWithOpenAI (not yet used by the scan). Created only
// when a key is configured: constructing it without one throws, which would
// break every scan even though discovery itself only needs Tavily.
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Searches for genuine buying intent, tagged with the line of business (LOB)
// and Amzur service each one feeds. Every LOB on the dashboard needs at least
// one search here, or it can never receive leads.
//
// Press / news / RFP results only count when the buyer is still looking for a
// provider (open RFP / RFQ / RFI / tender, seeking a partner). Announcements of
// a vendor already selected, contracts awarded, partnerships, go-lives and case
// studies are dropped by lib/vendorIntent.js; unclear ones are saved as
// "Review required". So these searches ask for open calls, not "selects X".
function regionalNewsSearches(region, edition, queries) {
  return queries.map((query) => ({
    kind: 'news',
    edition,
    requireRegion: region,
    allowUnknownRegion: true,
    query,
    lob: 'auto',
    intent: `Open technology tender / RFP in ${region === 'Europe' ? 'Europe' : region === 'UAE' ? 'the UAE' : 'India'}`,
  }));
}

// The open-call phrases every RFP search is combined with.
const OPEN_CALL_TERMS = '(RFP OR RFQ OR RFI OR tender OR "request for proposals" OR "seeks proposals" OR "invites bids")';

// Words that mark a LinkedIn post as not a buying request.
const LINKEDIN_EXCLUDE = ' -hiring -jobs -"we are hiring" -"we\'re hiring" -webinar -"register now" -"excited to announce" -"proud to announce" -"we help"';

const SEARCHES = [
  // ---- Job postings (paid web search): hiring for the skills Amzur provides ----
  {
    query: 'site:greenhouse.io OR site:lever.co "Cloud Engineer" OR "AWS Engineer" OR "Azure Engineer"',
    lob: 'Cloud',
    service: 'Cloud Migration Services',
    intent: 'Hiring cloud engineers',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "NetSuite Administrator" OR "NetSuite Developer" OR "ERP Analyst"',
    lob: 'ERP',
    service: 'NetSuite & ERP Services',
    intent: 'Hiring for NetSuite / ERP',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "Senior Software Engineer" OR "Full Stack Engineer" OR "Mobile Engineer" new product',
    lob: 'Application Development',
    service: 'Application Development',
    intent: 'Building new applications',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "Mainframe Developer" OR "COBOL Developer" OR "Legacy Modernization"',
    lob: 'Legacy Modernization',
    service: 'Legacy Modernization',
    intent: 'Hiring for legacy modernization',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "RPA Developer" OR "UiPath Developer" OR "Automation Engineer"',
    lob: 'Process Automation',
    service: 'Process Automation',
    intent: 'Hiring for process automation',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "DevOps Engineer" OR "Platform Engineer" OR "Site Reliability Engineer"',
    lob: 'Solution',
    service: 'Solution Engineering',
    intent: 'Infrastructure needs',
  },
  // Priority industries: Healthcare and Energy. These span every service, so
  // the line of business is inferred from the result text (lob: 'auto').
  {
    query: 'site:greenhouse.io OR site:lever.co healthcare OR hospital OR "health system" "Cloud Engineer" OR "DevOps Engineer" OR "NetSuite" OR "Automation Engineer" OR "Software Engineer"',
    lob: 'auto',
    requireIndustry: 'Healthcare',
    intent: 'Healthcare company hiring for technology',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co energy OR utility OR "oil and gas" OR renewable "Cloud Engineer" OR "DevOps Engineer" OR "SAP" OR "NetSuite" OR "Automation Engineer"',
    lob: 'auto',
    requireIndustry: 'Energy',
    intent: 'Energy company hiring for technology',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co retail OR retailer OR "e-commerce" OR omnichannel "NetSuite" OR "Shopify" OR "ERP" OR "Software Engineer" OR "Data Engineer"',
    lob: 'auto',
    requireIndustry: 'Retail & Consumer',
    intent: 'Retailer hiring for technology',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "food manufacturing" OR "food and beverage" OR beverage OR dairy OR bakery "ERP" OR "NetSuite" OR "SAP" OR "Automation Engineer" OR "Software Engineer"',
    lob: 'auto',
    requireIndustry: 'Food & Beverage Manufacturing',
    intent: 'F&B manufacturer hiring for technology',
  },
  // ---- Open RFPs / RFQs / RFIs on the web (paid web search) ----
  {
    query: '"request for proposals" OR RFP OR RFQ ERP OR NetSuite OR "Dynamics 365" OR SAP implementation 2026 proposals due -awarded',
    lob: 'ERP',
    service: 'NetSuite & ERP Services',
    intent: 'Open RFP for ERP / NetSuite',
  },
  {
    query: '"request for proposals" OR RFP OR RFQ "cloud migration" OR "cloud services" OR "managed services" OR AWS OR Azure 2026 proposals due -awarded',
    lob: 'Cloud',
    service: 'Cloud Migration Services',
    intent: 'Open RFP for cloud services',
  },
  {
    query: '"request for proposals" OR RFP OR RFQ "software development" OR "application development" OR "mobile app" OR "web portal" 2026 proposals due -awarded',
    lob: 'Application Development',
    service: 'Application Development',
    intent: 'Open RFP for software development',
  },
  {
    query: '"request for proposals" OR RFP OR RFI "legacy system" OR modernization OR "system replacement" OR mainframe 2026 proposals due -awarded',
    lob: 'Legacy Modernization',
    service: 'Legacy Modernization',
    intent: 'Open RFP for legacy modernization',
  },
  {
    query: '"request for proposals" OR RFP OR RFI "process automation" OR RPA OR "AI solution" OR "machine learning" OR "data analytics" 2026 proposals due -awarded',
    lob: 'auto',
    intent: 'Open RFP for automation / AI / data',
  },
  // LinkedIn posts where someone has a requirement and asks for a provider:
  // buying language ("can anyone recommend", "looking for a vendor", "looking
  // for a team to build", "seeking proposals") together with an Amzur service,
  // excluding job ads, events, announcements and vendors talking about
  // themselves. Only public, search-indexed posts are found (no LinkedIn login).
  // Run on Google (Serper) first, which honours the quotes, ORs and exclusions;
  // every post is still checked on its full text before it becomes a lead.
  {
    kind: 'linkedin',
    depth: 'basic',
    // NetSuite / ERP recommendations
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" OR "any recommendations for") (NetSuite OR ERP OR "Dynamics 365" OR "Business Central")' + LINKEDIN_EXCLUDE,
    lob: 'ERP',
    intent: 'Asked on LinkedIn for a NetSuite / ERP partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // ERP selection
    query: 'site:linkedin.com/posts ("looking for an ERP" OR "evaluating ERP" OR "selecting an ERP" OR "choosing an ERP" OR "ERP implementation partner" OR "NetSuite implementation partner")' + LINKEDIN_EXCLUDE,
    lob: 'ERP',
    intent: 'Choosing an ERP and asking on LinkedIn',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // CRM implementation
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "any recommendations for") (CRM OR Salesforce OR HubSpot) (implementation OR integration OR partner OR consultant)' + LINKEDIN_EXCLUDE,
    lob: 'ERP',
    intent: 'Asked on LinkedIn for a CRM implementation partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Cloud migration
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" OR "looking for a partner" OR "need help") ("cloud migration" OR "migrate to AWS" OR "migrate to Azure" OR "AWS partner" OR "Azure partner")' + LINKEDIN_EXCLUDE,
    lob: 'Cloud',
    intent: 'Asked on LinkedIn for a cloud partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Development firm
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" OR "any recommendations for") ("software development company" OR "app development company" OR "development agency" OR "development partner" OR "dev shop")' + LINKEDIN_EXCLUDE,
    lob: 'Application Development',
    intent: 'Asked on LinkedIn for a development partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Build a product
    query: 'site:linkedin.com/posts ("looking for a team to build" OR "looking for an agency to build" OR "looking for a developer to build" OR "need someone to build" OR "looking for a tech partner to")' + LINKEDIN_EXCLUDE,
    lob: 'Application Development',
    intent: 'Looking on LinkedIn for a team to build a product',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Automation / AI
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "looking for a partner to" OR "need help") ("automate our" OR "process automation" OR RPA OR "implement AI in our" OR "AI agent for our")' + LINKEDIN_EXCLUDE,
    lob: 'Process Automation',
    intent: 'Asked on LinkedIn for an automation / AI partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Data / analytics
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for recommendations" OR "looking for a consultant") ("Power BI" OR "data warehouse" OR "data analytics" OR "data engineering")' + LINKEDIN_EXCLUDE,
    lob: 'Solution',
    intent: 'Asked on LinkedIn for a data / analytics partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Legacy modernization
    query: 'site:linkedin.com/posts ("can anyone recommend" OR "looking for a partner" OR "looking for recommendations" OR "need help") ("legacy system" OR "modernize our" OR mainframe OR "replace our system" OR "outdated system")' + LINKEDIN_EXCLUDE,
    lob: 'Legacy Modernization',
    intent: 'Asked on LinkedIn for a modernization partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    // Vendors / RFP / offshore
    query: 'site:linkedin.com/posts ("looking for a vendor" OR "seeking proposals" OR "request for proposal" OR "outsource our development" OR "looking for an offshore" OR "dedicated development team" OR "offshore development partner")' + LINKEDIN_EXCLUDE,
    lob: 'Offshore',
    intent: 'Looking on LinkedIn for a vendor or offshore team',
  },
  // ---- Free sources (no search credits) ----
  // Google News: open RFPs, RFIs and tenders where the organization is still
  // choosing a provider.
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} (ERP OR NetSuite OR SAP OR Oracle OR "Dynamics 365" OR Workday)`,
    lob: 'ERP',
    intent: 'Open RFP / tender for ERP',
  },
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} ("cloud migration" OR "cloud services" OR AWS OR Azure OR "managed services" OR "data center")`,
    lob: 'Cloud',
    intent: 'Open RFP / tender for cloud services',
  },
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} ("software development" OR "application development" OR "mobile app" OR "web portal" OR software)`,
    lob: 'Application Development',
    intent: 'Open RFP / tender for software development',
  },
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} (modernization OR "legacy system" OR mainframe OR "core banking" OR "system replacement")`,
    lob: 'Legacy Modernization',
    intent: 'Open RFP / tender for modernization',
  },
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} (automation OR RPA OR "artificial intelligence" OR "AI platform" OR "AI solution")`,
    lob: 'Process Automation',
    intent: 'Open RFP / tender for automation / AI',
  },
  {
    kind: 'news',
    query: `${OPEN_CALL_TERMS} (cybersecurity OR "data analytics" OR "data platform" OR "IT services" OR "systems integrator" OR DevOps)`,
    lob: 'auto',
    intent: 'Open RFP / tender for IT services',
  },
  {
    kind: 'news',
    query: '"seeking a technology partner" OR "seeking an implementation partner" OR "looking for a technology partner" OR "expressions of interest" software OR IT OR digital',
    lob: 'auto',
    intent: 'Seeking a technology partner',
  },
  {
    kind: 'news',
    query: `(hospital OR "health system" OR "health department" OR "medical center") ${OPEN_CALL_TERMS} (software OR EHR OR IT OR cloud OR ERP OR digital)`,
    lob: 'auto',
    requireIndustry: 'Healthcare',
    intent: 'Healthcare open RFP / tender for technology',
  },
  {
    kind: 'news',
    query: `(utility OR "electric cooperative" OR "energy company" OR "oil and gas") ${OPEN_CALL_TERMS} (software OR IT OR ERP OR SAP OR "customer information system" OR digital)`,
    lob: 'auto',
    requireIndustry: 'Energy',
    intent: 'Energy open RFP / tender for technology',
  },
  {
    kind: 'news',
    query: `(retailer OR "retail chain" OR grocery OR "e-commerce") ${OPEN_CALL_TERMS} (ERP OR "point of sale" OR POS OR software OR omnichannel OR digital)`,
    lob: 'auto',
    requireIndustry: 'Retail & Consumer',
    intent: 'Retail open RFP / tender for technology',
  },
  {
    kind: 'news',
    query: `("food manufacturer" OR "food processing" OR "beverage company" OR dairy OR brewery) ${OPEN_CALL_TERMS} (ERP OR software OR automation OR traceability OR digital)`,
    lob: 'auto',
    requireIndustry: 'Food & Beverage Manufacturing',
    intent: 'F&B manufacturer open RFP / tender for technology',
  },
  // Official public-tender feeds (free): open calls for IT services and software.
  {
    kind: 'tender',
    feed: 'contracts-finder',
    query: 'UK Contracts Finder: open IT and software tenders',
    lob: 'auto',
    intent: 'Open public tender (UK Contracts Finder)',
  },
  {
    kind: 'tender',
    feed: 'ted',
    query: 'EU TED: open IT and software tenders',
    lob: 'auto',
    intent: 'Open public tender (EU TED)',
  },
  // Regional job posts (paid web search): roles that signal Amzur services in
  // European and UAE cities. The job's own location must be in that region.
  {
    query: 'site:greenhouse.io OR site:lever.co (London OR Dublin OR Berlin OR Amsterdam) Cloud OR DevOps OR NetSuite OR SAP engineer',
    lob: 'auto',
    requireRegion: 'Europe',
    allowUnknownRegion: true,
    requireTechRole: true,
    intent: 'Hiring for technology in Europe',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co (London OR Dublin OR Berlin OR Amsterdam) software OR automation OR data engineer',
    lob: 'auto',
    requireRegion: 'Europe',
    allowUnknownRegion: true,
    requireTechRole: true,
    intent: 'Hiring for technology in Europe',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co (Dubai OR "Abu Dhabi" OR UAE) "NetSuite" OR "SAP" OR "Cloud Engineer" OR "DevOps Engineer" OR "ERP"',
    lob: 'auto',
    requireRegion: 'UAE',
    allowUnknownRegion: true,
    requireTechRole: true,
    intent: 'Hiring for technology in the UAE',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co (Dubai OR "Abu Dhabi" OR UAE) "Software Engineer" OR "Automation Engineer" OR "Data Engineer"',
    lob: 'auto',
    requireRegion: 'UAE',
    allowUnknownRegion: true,
    requireTechRole: true,
    intent: 'Hiring for technology in the UAE',
  },
  // Regional news (free). Short "place + tender + technology" queries: long
  // OR-queries make Google News ignore the date limit. Kept only when the item
  // is an open call for technology and doesn't clearly name another region.
  ...regionalNewsSearches('UAE', 'AE', ['UAE tender software', 'UAE tender IT services', 'UAE RFP technology', 'Dubai tender digital', 'Abu Dhabi tender digital', 'UAE tender ERP', 'UAE tender AI']),
  ...regionalNewsSearches('Europe', 'GB', ['UK tender software', 'UK council tender IT', 'NHS tender digital', 'UK procurement ERP', 'Ireland tender IT services', 'Germany tender software', 'Europe tender cloud']),
  ...regionalNewsSearches('India', 'IN', ['India tender software', 'India RFP IT services', 'floats tender ERP', 'invites bids software', 'RFP digital transformation India', 'tender AI platform India']),
];

// Amzur service recommended for each line of business.
const LOB_SERVICES = {
  Cloud: 'Cloud Migration Services',
  ERP: 'NetSuite & ERP Services',
  Solution: 'Solution Engineering',
  'Application Development': 'Application Development',
  'Legacy Modernization': 'Legacy Modernization',
  'Process Automation': 'Process Automation',
  Offshore: 'India Dedicated Teams',
};

// Keywords used to infer the line of business for 'auto' searches.
// Order breaks ties (more specific services first).
const LOB_KEYWORDS = [
  ['ERP', /\b(netsuite|erp|sap|oracle financials|dynamics 365)\b/gi],
  ['Legacy Modernization', /\b(mainframe|cobol|legacy|core banking|core system|ehr|emr|meditech|expanse|epic|cerner|oracle health)\b/gi],
  ['Process Automation', /\b(rpa|uipath|automation anywhere|process automation|workflow automation|power automate|automation engineer)\b/gi],
  ['Solution', /\b(devops|sre|site reliability|platform engineer|kubernetes|terraform|ci\/cd)\b/gi],
  ['Cloud', /\b(cloud|aws|azure|gcp|google cloud|migration)\b/gi],
  ['Application Development', /\b(software engineer|full[- ]stack|mobile app|application development|product engineer|digital transformation)\b/gi],
  ['Offshore', /\b(offshore|india|global capability)\b/gi],
];

function inferLob(text) {
  let best = 'Cloud';
  let bestCount = 0;
  for (const [lob, pattern] of LOB_KEYWORDS) {
    const count = (text.match(pattern) || []).length;
    if (count > bestCount) {
      best = lob;
      bestCount = count;
    }
  }
  return best;
}

// Industry with the most keyword hits; hits in the company name count double.
// Ties go to the earlier (priority) industry.
// Must match classifyIndustry() in scripts/backfill-industry.js.
function classifyIndustry(text, companyName = '') {
  const haystack = ` ${(text || '').toLowerCase()} `;
  const name = ` ${(companyName || '').toLowerCase()} `;
  let best = industryConfig.fallback;
  let bestCount = 0;
  for (const industry of industryConfig.industries) {
    let count = 0;
    for (const keyword of industry.keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`[^a-z0-9]${escaped}[^a-z0-9]`);
      if (pattern.test(haystack)) count++;
      if (pattern.test(name)) count++;
    }
    if (count > bestCount) {
      best = industry.name;
      bestCount = count;
    }
  }
  return best;
}

const PRIORITY_INDUSTRIES = new Set(industryConfig.industries.filter((i) => i.priority).map((i) => i.name));

// Random placeholder score (until OpenAI scoring is enabled), boosted for
// priority industries so they sort to the top.
function scoreLead(industry, min, max) {
  const base = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.min(99, base + (PRIORITY_INDUSTRIES.has(industry) ? industryConfig.priorityBoost : 0));
}

// ---- LinkedIn posts ----

// LinkedIn posts up to the archive age are kept (20-30 days: the Older leads tab).
const LINKEDIN_MAX_AGE_DAYS = LEAD_ARCHIVE_DAYS;

// LinkedIn activity IDs embed the post time: the top bits are a millisecond timestamp.
function linkedInPostDate(url) {
  const match = url.match(/activity-(\d{19})/);
  if (!match) return null;
  try {
    const ms = Number(BigInt(match[1]) >> 22n);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function linkedInSlug(url) {
  const match = url.match(/linkedin\.com\/posts\/([^_/?]+)_/);
  return match ? match[1] : null;
}

function linkedInAuthor(result) {
  const title = result.title || '';
  const patterns = [
    /^([^|]{2,60}?)\s*\|\s*\d+ comments/i, // "Mehul Patel | 37 comments"
    /\|\s*([^|]{2,60}?)\s+posted on the topic/i,
    /^([^:|]{2,60}?)\s+on LinkedIn:/i,
    /^([^|]{2,60}?)['’]s Post/i,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1].replace(/,.*$/, '').trim();
  }
  const content = result.content || '';
  const fromText = content.match(/^([^|]{2,60}?)\s*\|\s*\d+ comments/i) || content.match(/^([^|]{2,60}?)['’]s Post/i);
  if (fromText) return fromText[1].replace(/,.*$/, '').trim();
  const slug = linkedInSlug(result.url || '');
  if (!slug) return null;
  return slug
    .replace(/-?[0-9a-f]{6,}$/i, '')
    .replace(/\d+$/, '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Job titles worth turning into a "Hiring <role>" signal.
const ROLE_PATTERN =
  /(Senior |Junior |Lead |Staff |Principal )?(DevOps|Cloud|AWS|Azure|GCP|Backend|Infrastructure|SRE|Platform|Site Reliability|Software|Full[- ]?Stack|Mobile|Data|NetSuite|ERP|Salesforce|RPA|UiPath|Automation|Mainframe|COBOL)\s+(Engineer|Architect|Developer|Administrator|Analyst|Consultant)/i;

// Key used to recognise the same company across scans, e.g. "CaseGuard, Inc." -> "caseguard".
function companyKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Names that are really the job board or news site, not a prospect.
const NOT_COMPANIES = new Set([
  'lever', 'greenhouse', 'jobs', 'careers', 'techcrunch', 'businesswire', 'prnewswire', 'samgov', 'sam',
  // Job aggregators / recruiters that post other companies' roles.
  'jobgether', 'recruitis',
  // Fragments of job-board titles picked up as names.
  'full', 'alljobs', 'jobs', 'careers', 'remote', 'hybrid', 'onsite',
]);

// Companies that sell rather than buy (IT services firms, vendors, job sites).
const NON_BUYERS = new Set(nonBuyers.companies);

// The source text describes the company itself as a seller, e.g.
// "NEORIS ... is a Digital Accelerator that helps companies" or
// "Alliance, a national consulting firm". Also catches recruiter posts.
function describesItselfAsSeller(companyName, text) {
  // Consultancies by name, e.g. "CSCI Consulting", "Greenlight Consultants".
  if (/\b(consulting|consultants|consultancy)\b/i.test(companyName)) return true;
  if (!text) return false;
  if (/\b(on behalf of a partner|on behalf of our client|listed on behalf of)\b/i.test(text)) return true;
  const name = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selfDescription = new RegExp(
    `${name}[^.]{0,60}?(\\bis\\b|,)\\s+(a|an|the|one of the)\\b[^.]{0,80}?(consult|IT services|technology services|services company|services firm|services provider|systems integrator|digital accelerator|solutions provider|provider of|automation platform|modernization platform|software development platform|staffing|outsourcing|design and technology services)`,
    'i'
  );
  return selfDescription.test(text);
}

// A job title or page label picked up instead of a company name,
// e.g. "Senior Software Engineer" or "Job Application for UiPath".
function looksLikeJobTitle(name) {
  return (
    /^job application\b/i.test(name) ||
    /\b(jobs|careers|job board|openings)\b/i.test(name) ||
    /\b(engineer|developer|architect|administrator|analyst|consultant|manager|specialist|scientist)s?(\s+(i{1,3}|iv|v|\d|senior|junior|lead|staff|principal))?$/i.test(name.trim())
  );
}

function isJobBoard(domain) {
  return !!domain && (domain.includes('greenhouse.io') || domain.includes('lever.co') || domain.startsWith('jobs.'));
}

/**
 * Search for companies using Tavily API
 */
// Last search error from Tavily in this process (e.g. usage limit reached),
// reported in the scan summary so the dashboard can explain an empty scan.
let lastSearchError = null;

// 'basic' depth costs 1 credit per search vs 2 for 'advanced'; snippets are
// shorter but enough to identify the company and signal.
async function searchWithTavily(query, depth = 'basic', { maxResults = 10, recentDays = LEAD_MAX_AGE_DAYS, prefer } = {}) {
  // Tries Tavily, then Serper, then You.com (whichever have API keys set);
  // `prefer` moves one provider to the front.
  const { results, provider, errors } = await searchWeb(query, { depth, maxResults, recentDays, prefer });
  if (!provider && errors.length) {
    const last = errors[errors.length - 1];
    lastSearchError = { status: last.status, message: last.message, provider: last.provider };
  }
  return results;
}

/**
 * Extract company domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Extract company name from Tavily result
 */
function extractCompanyName(result) {
  const domain = extractDomain(result.url);
  
  // For job boards, extract company name from title
  if (domain?.includes('greenhouse.io') || domain?.includes('lever.co') || domain?.includes('jobs.')) {
    // Title format: "DevOps Engineer at Stripe" or "Stripe - DevOps Engineer"
    const atMatch = result.title.match(/at\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s*[-|]|$)/);
    if (atMatch) return atMatch[1].trim();
    
    const dashMatch = result.title.match(/^([A-Z][a-zA-Z0-9\s&]+?)\s+[-–|]\s+/);
    if (dashMatch) return dashMatch[1].trim();
  }
  
  // For press releases, extract from title
  if (domain?.includes('techcrunch') || domain?.includes('businesswire') || domain?.includes('prnewswire')) {
    // Title format: "Stripe raises $600M Series H" or "Acme Corp announces..."
    const companyMatch = result.title.match(/^([A-Z][a-zA-Z0-9\s&.]+?)(?:\s+(?:raises|announces|secures|closes|launches|unveils|selects|chooses|implements|completes|migrates|moves|opens|expands|establishes|partners|deploys|goes live))/i);
    if (companyMatch) return companyMatch[1].replace(/^[A-Z][A-Za-z.\s-]{1,30}?[- ]based\s+/i, '').trim();
  }
  
  // For career pages
  if (domain?.includes('careers') || domain?.includes('jobs')) {
    // Extract from domain: careers.stripe.com -> Stripe
    const careerDomain = domain.replace(/^(careers|jobs)\./, '');
    let name = careerDomain.replace(/\.(com|io|ai|co|net|org)$/, '');
    name = name.split(/[-._]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return name;
  }
  
  // For RFP sites (sam.gov), extract from content/title
  if (domain?.includes('sam.gov')) {
    const orgMatch = result.title.match(/(?:for|by)\s+([A-Z][a-zA-Z0-9\s&]+?)(?:\s*[-|]|$)/);
    if (orgMatch) return orgMatch[1].trim();
  }
  
  return null;
}

/**
 * Score and analyze lead using OpenAI GPT-4
 */
async function scoreWithOpenAI(companyData, searchContext) {
  try {
    const prompt = `Analyze this company as a potential lead for Amzur Technologies, a cloud infrastructure and DevOps consulting company.

Company Information:
- Name: ${companyData.companyName}
- Website: ${companyData.website}
- Search Context: ${searchContext?.substring(0, 800)}

Based on the search context, determine:
1. The company's actual industry (FinTech, Healthcare, SaaS, E-commerce, etc.)
2. Intent signals (hiring, funding, RFP, modernization, cloud migration)
3. Which Amzur service fits best: Cloud & MSP, NetSuite & ERP, Solution Engineering, Application Development, Legacy Modernization, Process Automation, or India Dedicated Teams
4. Lead quality score (1-100)

Return ONLY valid JSON with this exact structure:
{
  "score": <number 1-100>,
  "industry": "<actual industry detected from context>",
  "lob": "<primary line of business: Cloud, ERP, Solution, Application Development, Legacy Modernization, Process Automation, or Offshore>",
  "recommendedService": "<specific Amzur service recommendation>",
  "intentSignal": "<concise buying signal, e.g., 'Hiring 5 DevOps engineers' or 'ERP modernization RFP'>",
  "whyThisLead": ["<specific reason 1>", "<specific reason 2>", "<specific reason 3>"],
  "outreachEmail": "<best guess email like info@domain.com or careers@domain.com>"
}`;

    if (!openai) throw new Error("OPENAI_API_KEY is not set");
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a B2B lead qualification expert. Analyze the search context to extract real company signals. Return only valid JSON, no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error(`OpenAI scoring error:`, error.message);
    return {
      score: 50,
      industry: 'Technology',
      lob: 'Cloud',
      recommendedService: 'Cloud Migration Services',
      intentSignal: 'Discovery scan',
      whyThisLead: ['Found via search'],
      outreachEmail: `contact@${companyData.website.replace('https://', '')}`,
    };
  }
}

// Organization that is asking for a provider in a headline, e.g.
// "VA Issues RFI for Enterprise IT Systems Integrator" -> "VA" or
// "National Park Service Request for Proposals for ..." -> "National Park Service".
// Verbs where the headline organization is the one buying. Vendor-selection
// verbs ("selects", "goes live") are not here: those leads are excluded.
const REQUIREMENT_VERBS =
  'issues|issued|releases|released|publishes|published|floats|floated|launches|launched|opens|opened|invites|invited|seeks|is seeking|seeking|requests|calls for|wants|eyes|plans|tenders|puts out|announces|is looking for|looking for|kicks off|starts|begins';

const HEADLINE_NAME_CONNECTORS = new Set(['of', 'for', 'and', 'the', 'de', 'du', 'la', 'le', 'van', 'von', 'at', 'in', 'on', '&']);
const GENERIC_NAMES = new Set(['government', 'govt', 'state', 'city', 'county', 'council', 'ministry', 'department', 'authority', 'no', 'the', 'it', 'this', 'exclusive', 'icymi', 'report', 'breaking']);

function companyFromHeadline(title, extraVerbs) {
  const verbs = extraVerbs ? `${REQUIREMENT_VERBS}|${extraVerbs}` : REQUIREMENT_VERBS;
  const match =
    (title || '').match(new RegExp(`^(.{2,90}?)\\s+(${verbs})\\b`, 'i')) ||
    (title || '').match(/^(.{2,90}?)\s+(request for (proposals?|quotations?|information|qualifications)|invitation to (tender|bid))\b/i);
  if (!match) return null;
  let name = match[1]
    .replace(/^.*?:\s+/, '') // "Deadline Intel: Pasadena" -> "Pasadena"
    .replace(/^(UK|US|U\.S\.|UAE|India|Indian|Dutch|German|French|Irish|British|European)['’]s\s+/i, '') // "UK's AlRayan Bank" -> "AlRayan Bank"
    .replace(/^[A-Z][A-Za-z.\s-]{1,30}-based\s+/, '') // "New Jersey-based X" -> "X"
    .replace(/^.*\bparent company\s+/i, '') // "Royal Canin Parent Company Mars" -> "Mars"
    .replace(/\s+and\s+.*$/i, '') // "X and Y issue" -> "X"
    .replace(/['’]s$/, '')
    .replace(/(\s+(rfp|rfq|rfi|rfx|eoi|tender|bid|bids|procurement))+$/i, '') // "VA RFI" -> "VA"
    .trim();
  // Fragments, sentences and vendor self-descriptions are not company names:
  // names start with a capital and are mostly capitalised words
  // ("Central Bank of Azerbaijan", not "Zelmier bets on AI to simplify government").
  if (!name || name.includes(',') || name.split(/\s+/).length > 7) return null;
  if (!/^[A-Z0-9]/.test(name)) return null;
  const lowercaseWords = name.split(/\s+/).filter((word) => /^[a-z]/.test(word) && !HEADLINE_NAME_CONNECTORS.has(word));
  if (lowercaseWords.length >= 2) return null;
  if (GENERIC_NAMES.has(name.toLowerCase())) return null;
  if (/\b(provider|vendor|startup|firm|agency|report|study|survey|cancels|announces|public notice|notice|deadline|how|why|what)\b/i.test(name)) return null;
  return name;
}

// Requirement details straight from a news item (no page fetch).
function feedRequirement(result) {
  return {
    kind: 'press',
    headline: result.title,
    facts: result.publisher ? [{ label: 'Published by', value: result.publisher }] : [],
    summary: null,
    sections: [],
    from: 'News',
  };
}

// LinkedIn: more results per search over the recency window (posts older than
// LEAD_MAX_AGE_DAYS are dropped anyway), on Google (Serper) first.
const LINKEDIN_RESULTS = 20;
const LINKEDIN_RECENT_DAYS = LEAD_ARCHIVE_DAYS;

async function fetchForSearch(search) {
  try {
    if (search.kind === 'news') return await searchNews(search.query, { days: LEAD_ARCHIVE_DAYS, edition: search.edition });
    if (search.kind === 'tender') return search.feed === 'ted' ? await fetchTed() : await fetchContractsFinder();
  } catch (error) {
    console.error(`Free source error for "${search.query}":`, error.message);
    return [];
  }
  return search.kind === 'linkedin'
    ? searchWithTavily(search.query, search.depth, { maxResults: LINKEDIN_RESULTS, recentDays: LINKEDIN_RECENT_DAYS, prefer: 'serper' })
    : searchWithTavily(search.query, search.depth);
}

/**
 * Save a LinkedIn post as a lead when someone is asking for a provider.
 * The lead is the post's author: LinkedIn posts rarely name the employer.
 * Returns true when a lead was saved.
 */
async function saveLinkedInLead(search, result, seenCompanies) {
  const url = result.url || '';
  const text = `${result.title || ''} ${result.content || ''}`;

  if (!url.includes('linkedin.com/posts/')) return false;
  const verdict = classifyLinkedInPost(url, text);
  if (!verdict.ok) {
    console.log(`   ⏭️  Skipped LinkedIn post (${verdict.reason}): ${url}`);
    return false;
  }

  // The search snippet passed: now confirm the post on LinkedIn itself (its
  // public page, free, no login). Search engines keep listing deleted posts for
  // weeks and their snippets can mix in replies from vendors, so a lead is only
  // saved from the full post as LinkedIn shows it. A post that can't be read
  // right now (rate limit, block) is skipped; the next scan finds it again.
  const { post, removed } = await readLinkedInPost(url);
  if (removed) {
    console.log(`   ⏭️  Skipped LinkedIn post (deleted on LinkedIn): ${url}`);
    return false;
  }
  if (!post) {
    console.log(`   ⏭️  Skipped LinkedIn post (not confirmed on LinkedIn yet, retried next scan): ${url}`);
    return false;
  }
  const full = classifyLinkedInPost(url, post.body);
  if (!full.ok) {
    console.log(`   ⏭️  Skipped LinkedIn post (${full.reason}, full post): ${url}`);
    return false;
  }

  const postedAt = linkedInPostDate(url);
  if (!postedAt || Date.now() - postedAt.getTime() > LINKEDIN_MAX_AGE_DAYS * 86400000) {
    console.log(`   ⏭️  Skipped LinkedIn post (older than ${LINKEDIN_MAX_AGE_DAYS} days): ${url}`);
    return false;
  }

  // Name as LinkedIn shows it (credentials like ", MBA" dropped), else from the search result.
  const author = (post.author && post.author.replace(/,.*$/, '').trim()) || linkedInAuthor(result);
  const key = companyKey(author);
  if (!author || !key || NON_BUYERS.has(key) || seenCompanies.has(key)) return false;
  seenCompanies.add(key);

  // Classify on the post as written, not on the search snippet.
  const postText = `${result.title || ''} ${post.body}`;
  const lob = search.lob === 'auto' ? inferLob(postText) : search.lob;
  const industry = classifyIndustry(postText);
  const geo = classifyGeography({ text: postText });
  if (geo.region === 'Other') {
    console.log(`   ⏭️  Skipped LinkedIn post (outside target regions): ${url}`);
    return false;
  }
  const slug = linkedInSlug(url);
  // An explicit request for a provider is a strong signal: score higher.
  const score = scoreLead(industry, 80, 90);

  try {
    await prisma.lead.create({
      data: {
        companyName: author,
        industry,
        website: null,
        employees: null,
        revenue: null,
        hq: null,
        lob,
        intentSignal: search.intent,
        recommendedService: LOB_SERVICES[lob],
        leadScore: score,
        source: `${search.query} (${result.provider || 'web search'} · LinkedIn)`,
        outreachEmail: null,
        signals: {
          leadType: 'linkedin_post',
          dataSource: 'LinkedIn',
          author,
          authorProfileUrl: post.authorUrl || (slug ? `https://www.linkedin.com/in/${slug}/` : null),
          postedAt: postedAt ? postedAt.toISOString() : null,
          postedAtSource: postedAt ? 'LinkedIn post ID' : null,
          postedAtChecked: true,
          whyThisLead: [search.intent, 'Publicly asked for a provider on LinkedIn', 'Company not yet identified'],
          searchContext: text.substring(0, 500),
          tavilyUrl: url,
          techStack: [],
          sourceTitle: result.title || null,
          requirement: requirementFromPost(post),
          linkedinPost: {
            author: post.author,
            authorUrl: post.authorUrl,
            authorFollowers: post.authorFollowers,
            likes: post.likes,
            comments: post.comments,
            postedAt: post.postedAt,
            hashtags: post.hashtags,
            isRequest: true,
            notRequestReason: null,
            fetchedAt: post.fetchedAt,
          },
          requirementChecked: true,
          geography: geo.region,
          location: geo.location,
        },
      },
    });
    console.log(`   ✅ LinkedIn lead: ${author} (${lob}, ${industry})`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error saving LinkedIn lead:`, error.message);
    return false;
  }
}

/**
 * Fill in the company profile and posted date for up to `limit` existing
 * leads that don't have them yet (saved before these lookups existed, or when
 * a lookup failed). Runs at the end of every scan so older leads catch up a
 * few at a time without depending on the deploy build. ~1 Tavily credit each.
 */
export async function enrichExistingLeads(limit = 15) {
  const leads = await prisma.lead.findMany({
    select: { id: true, companyName: true, industry: true, website: true, hq: true, employees: true, signals: true },
    orderBy: { leadScore: 'desc' },
  });
  const needs = (lead) => {
    const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    return {
      date: !signals.postedAtChecked,
      requirement: !signals.requirementChecked,
      // Profiles cost a search credit: only for leads recent enough to be shown.
      profile: signals.leadType !== 'linkedin_post' && !signals.companyChecked && isRecent(signals.postedAt),
      geography: !signals.geography,
    };
  };
  const pending = leads.filter((lead) => Object.values(needs(lead)).some(Boolean)).slice(0, limit);

  let updated = 0;
  await Promise.all(
    pending.map(async (lead) => {
      const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
      const todo = needs(lead);
      const url = signals.tavilyUrl;
      // Each lookup is independent: a failure (e.g. search provider down)
      // leaves only that part unchecked so a later scan retries it.
      const attempt = (run) => run().then((value) => ({ ok: true, value }), () => ({ ok: false }));
      const [date, requirement, profile] = await Promise.all([
        todo.date ? attempt(() => findPublishedDate(url)) : null,
        todo.requirement
          ? attempt(() => findRequirementDetails(url, { companyName: lead.companyName, title: signals.sourceTitle, text: signals.searchContext }))
          : null,
        todo.profile
          ? attempt(() => findCompanyProfile(lead.companyName, { industry: lead.industry, sourceUrl: url }))
          : null,
      ]);

      const nextSignals = { ...signals };
      const data = {};
      if (date?.ok) {
        nextSignals.postedAt = date.value ? date.value.date : null;
        nextSignals.postedAtSource = date.value ? date.value.method : null;
        nextSignals.postedAtChecked = true;
      }
      if (requirement?.ok) {
        nextSignals.requirement = requirement.value || null;
        nextSignals.requirementChecked = true;
      }
      if (profile?.ok) {
        const found = profile.value;
        nextSignals.company = found;
        nextSignals.companyChecked = true;
        if (found?.website) {
          data.website = found.website;
          data.outreachEmail = `contact@${found.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}`;
        }
        if (found?.headquarters) data.hq = found.headquarters;
        else if (lead.hq === 'USA') data.hq = null; // old placeholder, not real data
        if (found?.employees) data.employees = found.employees;
        if (found?.revenue) data.revenue = found.revenue;
      }
      if (!date?.ok && !requirement?.ok && !profile?.ok && !todo.geography) return;

      const geo = leadGeography({
        requirement: nextSignals.requirement,
        profile: nextSignals.company,
        hq: data.hq ?? lead.hq,
        text: `${lead.companyName} ${nextSignals.sourceTitle || ''} ${nextSignals.searchContext || ''}`,
      });
      nextSignals.geography = geo.region;
      nextSignals.location = geo.location;

      try {
        await prisma.lead.update({ where: { id: lead.id }, data: { ...data, signals: nextSignals } });
        updated++;
      } catch (error) {
        console.error(`   ⚠️  Could not update ${lead.companyName}:`, error.message);
      }
    })
  );
  if (pending.length) console.log(`🧩 Enriched ${updated} of ${pending.length} older leads`);
  return updated;
}

/**
 * Re-check whether job-posting leads are still open (Greenhouse/Lever return
 * 404 once closed). Checks leads inside the recency window that weren't
 * checked in the last 12 hours, up to `limit` per scan. Free.
 */
export async function recheckJobPostings(limit = 25) {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, signals: true } });
  const due = leads
    .filter((lead) => {
      const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
      if (!jobApiUrl(signals.tavilyUrl) || signals.jobOpen === false) return false;
      if (!isRecent(signals.postedAt, LEAD_ARCHIVE_DAYS)) return false;
      const last = signals.jobCheckedAt ? new Date(signals.jobCheckedAt).getTime() : 0;
      return Date.now() - last > 12 * 3600000;
    })
    .slice(0, limit);

  let closed = 0;
  await Promise.all(
    due.map(async (lead) => {
      const open = await isJobOpen(lead.signals.tavilyUrl);
      if (open === null) return; // couldn't tell: try again next scan
      if (!open) closed++;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          signals: {
            ...lead.signals,
            jobOpen: open,
            jobCheckedAt: new Date().toISOString(),
            ...(open ? {} : { jobClosedAt: new Date().toISOString() }),
          },
        },
      });
    })
  );
  if (due.length) console.log(`📋 Re-checked ${due.length} job postings: ${closed} closed`);
  return { checked: due.length, closed };
}

/**
 * Main lead discovery engine
 */
/**
 * @param {{ mode?: 'full' | 'linkedin', only?: string[] | null }} [options] 'linkedin'
 * runs only the LinkedIn searches (the afternoon refresh) and skips the paid
 * follow-ups; `only` runs just the given search kinds (manual runs and tests).
 */
export async function discoverLeads({ mode = 'full', only = null } = {}) {
  // `only`: a list of search kinds to run (manual runs and tests, e.g. ['tender']).
  const activeSearches = only
    ? SEARCHES.filter((s) => only.includes(s.kind || 'web'))
    : mode === 'linkedin'
      ? SEARCHES.filter((s) => s.kind === 'linkedin')
      : SEARCHES;
  console.log(`🔍 Starting lead discovery (${mode === 'linkedin' ? 'LinkedIn only' : 'full scan'})...`);

  const scanRun = await prisma.scanRun.create({
    data: {
      startedAt: new Date(),
      companiesScanned: 0,
      newLeadsFound: 0,
      sources: {},
    },
  });

  let totalCompaniesScanned = 0;
  let newLeadsFound = 0;
  const sourcesBreakdown = {};

  // Skip companies we already have. Compare by company name: job-board results
  // all share a domain (jobs.lever.co), so domains can't identify a company.
  const existingLeads = await prisma.lead.findMany({ select: { companyName: true } });
  const seenCompanies = new Set(existingLeads.map((lead) => companyKey(lead.companyName)));

  console.log(`📊 ${existingLeads.length} existing leads in database`);

  const pendingSaves = [];
  lastSearchError = null;

  // Run all searches in parallel; Tavily latency dominates scan time.
  const searchResults = await Promise.all(
    activeSearches.map(async (search) => ({ search, results: await fetchForSearch(search) }))
  );

  for (const { search, results: fetched } of searchResults) {
    const { query } = search;
    const results = fetched || [];
    sourcesBreakdown[query] = results.length;
    console.log(`\n🔎 [${search.kind || search.lob}] "${query}": ${results.length} results`);

    for (const result of results) {
      totalCompaniesScanned++;

      const domain = extractDomain(result.url);
      if (!domain) continue;

      if (search.kind === 'linkedin') {
        if (await saveLinkedInLead(search, result, seenCompanies)) newLeadsFound++;
        continue;
      }

      // Press, news and RFP pages are read for intent; job postings aren't.
      const isRequirementItem = !isJobBoard(domain);
      // A headline announcing a vendor already chosen, a contract awarded, a
      // partnership or a go-live is not a lead, whoever the company is.
      const chosen = isRequirementItem ? headlineShowsVendorChosen(result.title) : null;
      if (chosen) {
        console.log(`   ⏭️  Skipped: ${result.title} (${chosen})`);
        continue;
      }

      const fromTender = search.kind === 'tender';
      const companyName = fromTender
        ? result.buyer
        : search.kind === 'news'
          ? companyFromHeadline(result.title)
          : extractCompanyName(result) || (isRequirementItem ? companyFromHeadline(result.title) : null);
      if (!companyName) {
        console.log(`   ⏭️  Skipped: ${result.title} (no company name)`);
        continue;
      }

      const key = companyKey(companyName);
      if (!key || NOT_COMPANIES.has(key) || looksLikeJobTitle(companyName) || seenCompanies.has(key)) {
        continue;
      }

      if (NON_BUYERS.has(key) || describesItselfAsSeller(companyName, `${result.title} ${result.content || ''}`)) {
        console.log(`   ⏭️  Skipped: ${companyName} (sells services/products, not a buyer)`);
        seenCompanies.add(key);
        continue;
      }

      // Very large enterprises (Google, Microsoft, global banks...) aren't reachable prospects.
      const tooLarge = largeEnterpriseReason(companyName);
      if (tooLarge) {
        console.log(`   ⏭️  Skipped: ${companyName} (${tooLarge})`);
        seenCompanies.add(key);
        continue;
      }

      // Regional job searches: only technical roles (not sales, finance, admin).
      if (search.requireTechRole && !ROLE_PATTERN.test(result.title || '')) {
        console.log(`   ⏭️  Skipped: ${result.title} (not a technical role)`);
        continue;
      }

      // Hiring posts: name the role; otherwise use the search's signal.
      let intentSignal = search.intent;
      if (isJobBoard(domain)) {
        const role = result.title.match(ROLE_PATTERN);
        if (role) intentSignal = `Hiring ${role[0].trim()}`;
      }

      const sourceText = `${companyName} ${result.title || ''} ${result.content || ''}`;
      const classified = classifyIndustry(sourceText, companyName);
      // Tender buyers are public bodies unless the text says otherwise.
      const industry = fromTender && classified === 'Other' ? 'Public Sector' : classified;
      // Industry-targeted searches match loosely; keep only results really in that industry.
      if (search.requireIndustry && industry !== search.requireIndustry) {
        console.log(`   ⏭️  Skipped: ${companyName} (${industry}, not ${search.requireIndustry})`);
        continue;
      }
      seenCompanies.add(key);
      const lob = search.lob === 'auto' ? inferLob(sourceText) : search.lob;
      console.log(`   ➡️  ${companyName} (${lob}, ${industry}): ${intentSignal}`);

      const careerDomain =
        domain.startsWith('careers.') || domain.startsWith('jobs.') ? domain.replace(/^(careers|jobs)\./, '') : null;
      const companyWebsite =
        careerDomain && !isJobBoard(domain)
          ? `https://${careerDomain}`
          : `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      // Look up when the source was published and save the lead. Runs in
      // parallel with the rest of the scan; awaited after the loop.
      pendingSaves.push((async () => {
      try {
        const fromFeed = search.kind === 'news';
        const published = fromTender
          ? result.published_date
            ? { date: result.published_date, method: result.provider === 'ted' ? 'EU TED notice' : 'UK Contracts Finder notice' }
            : null
          : fromFeed
            ? result.published_date
              ? { date: result.published_date, method: `News feed (${result.publisher || 'Google News'})` }
              : null
            : await findPublishedDate(result.url, result.published_date);
        // Region-targeted searches: must be in that region (or, for regional news
        // editions, at least not clearly somewhere else).
        if (search.requireRegion) {
          const textRegion = classifyGeography({ text: `${result.title || ''} ${result.content || ''}` }).region;
          const okRegion = textRegion === search.requireRegion || (search.allowUnknownRegion && textRegion === 'Unknown');
          if (!okRegion) {
            console.log(`   ⏭️  Skipped: ${companyName} (${textRegion}, not ${search.requireRegion})`);
            return;
          }
        }
        // Only recent needs: skip sources older than the window or without a date,
        // before spending a search credit on the company profile.
        // Up to LEAD_ARCHIVE_DAYS old: 20-30 day old finds go to the Older leads tab.
        if (!published || !isRecent(published.date, LEAD_ARCHIVE_DAYS)) {
          console.log(`   ⏭️  Skipped: ${companyName} (${published ? `posted ${published.date.slice(0, 10)}` : 'no posting date'}, older than ${LEAD_ARCHIVE_DAYS} days or unknown)`);
          return;
        }
        // Only genuine open requirements: vendor not yet chosen. Unclear ones
        // are kept but flagged for review instead of being qualified.
        // Official open calls for tender need no reading for intent.
        const vendorCheck = fromTender
          ? { decision: 'include', status: 'open', reason: 'Official open call for tender', method: 'tender feed' }
          : isRequirementItem
            ? await classifyVendorIntent({ title: result.title, text: result.content, url: result.url })
            : null;
        if (vendorCheck?.decision === 'exclude') {
          console.log(`   ⏭️  Skipped: ${companyName} (${vendorCheck.reason})`);
          return;
        }
        const needsReview = vendorCheck?.decision === 'review';
        const score = needsReview
          ? scoreLead(industry, 50, 64)
          : vendorCheck?.status === 'open'
            ? scoreLead(industry, 80, 92)
            : scoreLead(industry, 60, 85);
        // Tender buyers are public bodies: no paid company-profile lookup.
        const [profile, requirement] = fromTender
          ? [null, result.requirement]
          : await Promise.all([
              findCompanyProfile(companyName, { industry, sourceUrl: result.url }).catch(() => null),
              fromFeed ? feedRequirement(result) : findRequirementDetails(result.url, { companyName, title: result.title, text: result.content }).catch(() => undefined),
            ]);
        const tooLargeByProfile = largeEnterpriseReason(companyName, profile?.employees);
        if (tooLargeByProfile) {
          console.log(`   ⏭️  Skipped: ${companyName} (${tooLargeByProfile})`);
          return;
        }
        // Ideal customer profile: $10M–$200M revenue, established business.
        const icp = checkIcp({
          companyName,
          industry,
          revenue: profile?.revenue ?? null,
          employees: profile?.employees ?? null,
          signals: { company: profile, sourceTitle: result.title, searchContext: result.content },
        });
        if (icp.status === 'outside') {
          console.log(`   ⏭️  Skipped: ${companyName} (outside ICP: ${icp.summary})`);
          return;
        }
        const website = fromTender ? null : profile?.website || companyWebsite;
        const geo = fromTender
          ? { region: 'Europe', location: result.location || result.country }
          : leadGeography({ requirement, profile, text: `${result.title || ''} ${result.content || ''}` });
        if (search.requireRegion && geo.region === 'Unknown') geo.region = search.requireRegion;
        // Regional searches: the job location / HQ must confirm the region.
        if (search.requireRegion && geo.region !== search.requireRegion) {
          console.log(`   ⏭️  Skipped: ${companyName} (${geo.location || geo.region}, not ${search.requireRegion})`);
          return;
        }
        // Only target regions (USA, UAE, Europe, India); unknown locations are kept.
        if (geo.region === 'Other') {
          console.log(`   ⏭️  Skipped: ${companyName} (outside target regions: ${geo.location || 'location in text'})`);
          return;
        }
        await prisma.lead.create({
          data: {
            companyName,
            industry,
            website,
            employees: profile?.employees ?? null,
            revenue: profile?.revenue ?? null,
            hq: profile?.headquarters || geo.location || null,
            lob,
            intentSignal,
            recommendedService: search.service || LOB_SERVICES[lob],
            leadScore: score,
            source: `${query} (${{ news: 'Google News', 'contracts-finder': 'Contracts Finder', ted: 'TED' }[result.provider] || result.provider || 'web search'})`,
            outreachEmail: website ? `contact@${website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}` : null,
            signals: {
              techStack: [],
              whyThisLead: [
                intentSignal,
                ...(vendorCheck ? [needsReview ? `Review required: ${vendorCheck.reason}` : vendorCheck.reason] : []),
                `Found via ${lob} search`,
                `Source: ${domain}`,
              ],
              // 'open': inviting vendors / no vendor chosen. 'review': unclear.
              vendorStatus: vendorCheck ? (needsReview ? 'review' : 'open') : null,
              vendorCheck: vendorCheck
                ? { status: vendorCheck.status, reason: vendorCheck.reason, method: vendorCheck.method, checkedAt: new Date().toISOString() }
                : null,
              searchContext: result.content?.substring(0, 500),
              dataSource:
                { news: 'Google News', tavily: 'Tavily', serper: 'Serper (Google)', you: 'You.com', 'contracts-finder': 'UK Contracts Finder', ted: 'EU TED' }[
                  result.provider
                ] || 'Web search',
              // Official tenders: the deadline feeds the lead page's RFP panel.
              ...(fromTender ? { rfp: { deadline: result.deadline ? String(result.deadline).slice(0, 10) : null }, tender: { feed: result.provider, value: result.value, country: result.country } } : {}),
              tavilyUrl: result.url,
              postedAt: published ? published.date : null,
              postedAtSource: published ? published.method : null,
              postedAtChecked: true,
              company: profile,
              companyChecked: true,
              sourceTitle: result.title || null,
              requirement: requirement || null,
              requirementChecked: requirement !== undefined,
              geography: geo.region,
              location: geo.location,
              // Just found on the job board, so the posting is open now.
              ...(jobApiUrl(result.url) ? { jobOpen: true, jobCheckedAt: new Date().toISOString() } : {}),
            },
          },
        });

        newLeadsFound++;
        console.log(`      ✅ Saved ${companyName}${needsReview ? ' [review required]' : ''} (Score: ${score}, posted ${published ? published.date.slice(0, 10) : 'unknown'})`);
      } catch (error) {
        console.error(`      ❌ Error saving lead:`, error.message);
      }
      })());
    }
  }

  await Promise.all(pendingSaves);

  const jobStatus =
    mode === 'linkedin'
      ? { checked: 0, closed: 0 }
      : await recheckJobPostings(25).catch((error) => {
          console.error('Re-checking job postings failed:', error.message);
          return { checked: 0, closed: 0 };
        });

  // Let older leads catch up on company profiles and posted dates (paid; full scans only).
  const enrichedExisting =
    mode === 'linkedin'
      ? 0
      : await enrichExistingLeads(15).catch((error) => {
          console.error('Enriching older leads failed:', error.message);
          return 0;
        });

  await prisma.scanRun.update({
    where: { id: scanRun.id },
    data: {
      completedAt: new Date(),
      companiesScanned: totalCompaniesScanned,
      newLeadsFound,
      // The scan's mode is recorded so the daily limits can tell scans apart.
      sources: { ...sourcesBreakdown, __mode: mode },
    },
  });

  const summary = {
    scanRunId: scanRun.id,
    companiesScanned: totalCompaniesScanned,
    newLeadsFound,
    enrichedExisting,
    jobsRechecked: jobStatus.checked,
    jobsClosed: jobStatus.closed,
    // Every search failed: the search provider is unavailable (e.g. usage limit).
    searchUnavailable: Object.values(sourcesBreakdown).every((count) => count === 0) && lastSearchError ? lastSearchError : null,
    // Paid web search failed but free sources still ran: report it without
    // treating the whole scan as failed.
    webSearchUnavailable:
      lastSearchError &&
      activeSearches.filter((s) => s.kind !== 'news' && s.kind !== 'tender').every((s) => !sourcesBreakdown[s.query])
        ? lastSearchError
        : null,
    sources: sourcesBreakdown,
    mode,
    duration: new Date() - scanRun.startedAt,
  };

  console.log('\n✅ Lead discovery completed!');
  console.log(`📊 Summary: ${newLeadsFound} new leads from ${totalCompaniesScanned} results scanned`);

  return summary;
}

export default { discoverLeads };
