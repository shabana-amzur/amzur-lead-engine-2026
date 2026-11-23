import axios from 'axios';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import nonBuyers from '../config/non-buyers.json';
import industryConfig from '../config/industries.json';
import { findPublishedDate } from '../lib/publishedDate';
import { findCompanyProfile } from '../lib/companyProfile';
import { classifyLinkedInPost } from '../lib/linkedinFilters';
import { findRequirementDetails } from '../lib/requirementDetails';
import { searchWeb } from '../lib/searchProviders';
import { searchNews } from '../lib/freeSources';
import { LEAD_MAX_AGE_DAYS, isRecent } from '../config/recency';
import { classifyGeography, leadGeography } from '../lib/geography';
import { isJobOpen, jobApiUrl } from '../lib/jobStatus';

// OpenAI client for scoreWithOpenAI (not yet used by the scan). Created only
// when a key is configured: constructing it without one throws, which would
// break every scan even though discovery itself only needs Tavily.
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Searches targeting actual buying intent, tagged with the line of business
// (LOB) and Amzur service each one feeds. Every LOB on the dashboard needs at
// least one search here, or it can never receive leads.
function regionalNewsSearches(region, edition, queries) {
  return queries.map((query) => ({
    kind: 'news',
    edition,
    requireRegion: region,
    allowUnknownRegion: true,
    requireTechHeadline: true,
    query,
    lob: 'auto',
    intent: `Technology decision in ${region === 'Europe' ? 'Europe' : region === 'UAE' ? 'the UAE' : 'India'} (news)`,
  }));
}

// Technology terms a regional news headline must contain to count.
const TECH_HEADLINE =
  /\b(erp|sap|s\/4hana|oracle|netsuite|dynamics|workday|salesforce|crm|cloud|aws|azure|google cloud|data (platform|centre|center)|digital transformation|digitali[sz]ation|automation|ai|agentic|artificial intelligence|software|platform|core banking|modernis|moderniz|it services|analytics|capability cent(re|er))\b/i;

const SEARCHES = [
  // Cloud
  {
    query: 'site:greenhouse.io OR site:lever.co "Cloud Engineer" OR "AWS Engineer" OR "Azure Engineer"',
    lob: 'Cloud',
    service: 'Cloud Migration Services',
    intent: 'Hiring cloud engineers',
  },
  {
    query: '"completes migration to AWS" OR "migrates to Microsoft Azure" OR "selects Google Cloud" OR "cloud migration milestone" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'Cloud',
    service: 'Cloud Migration Services',
    intent: 'Cloud migration initiative',
  },
  // ERP
  {
    query: 'site:greenhouse.io OR site:lever.co "NetSuite Administrator" OR "NetSuite Developer" OR "ERP Analyst"',
    lob: 'ERP',
    service: 'NetSuite & ERP Services',
    intent: 'Hiring for NetSuite / ERP',
  },
  {
    query: '"selects Oracle NetSuite" OR "chooses NetSuite" OR "goes live on NetSuite" OR "selects NetSuite" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'ERP',
    service: 'NetSuite & ERP Services',
    intent: 'ERP modernization',
  },
  // Application Development
  {
    query: 'site:greenhouse.io OR site:lever.co "Senior Software Engineer" OR "Full Stack Engineer" OR "Mobile Engineer" new product',
    lob: 'Application Development',
    service: 'Application Development',
    intent: 'Building new applications',
  },
  {
    query: '"announces" "investment in digital transformation" OR "digital transformation program" OR "modernize its customer experience" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'Application Development',
    service: 'Application Development',
    intent: 'New digital product initiative',
  },
  {
    query: '"Series B funding" "announces" 2026 site:techcrunch.com OR site:businesswire.com',
    lob: 'Application Development',
    service: 'Application Development',
    intent: 'Recent Series B funding',
  },
  // Legacy Modernization
  {
    query: '"selects" OR "chooses" partner "to modernize" "legacy systems" OR "core banking system" OR "mainframe" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'Legacy Modernization',
    service: 'Legacy Modernization',
    intent: 'Modernizing legacy systems',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "Mainframe Developer" OR "COBOL Developer" OR "Legacy Modernization"',
    lob: 'Legacy Modernization',
    service: 'Legacy Modernization',
    intent: 'Hiring for legacy modernization',
  },
  // Process Automation
  {
    query: '"selects UiPath" OR "deploys UiPath" OR "chooses Automation Anywhere" OR "expands automation program" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'Process Automation',
    service: 'Process Automation',
    intent: 'Process automation initiative',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co "RPA Developer" OR "UiPath Developer" OR "Automation Engineer"',
    lob: 'Process Automation',
    service: 'Process Automation',
    intent: 'Hiring for process automation',
  },
  // Solution Engineering
  {
    query: 'site:greenhouse.io OR site:lever.co "DevOps Engineer" OR "Platform Engineer" OR "Site Reliability Engineer"',
    lob: 'Solution',
    service: 'Solution Engineering',
    intent: 'Infrastructure needs',
  },
  // Offshore / India dedicated teams
  {
    query: '"opens" "technology center" OR "innovation center" OR "engineering center" OR "global capability center" India 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'Offshore',
    service: 'India Dedicated Teams',
    intent: 'Expanding offshore team',
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
    query: '"health system" OR hospital OR healthcare "selects" OR "migrates to" OR "modernizes" OR "automates" cloud OR NetSuite OR ERP OR "legacy systems" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'auto',
    requireIndustry: 'Healthcare',
    intent: 'Healthcare technology initiative',
  },
  {
    query: 'site:greenhouse.io OR site:lever.co energy OR utility OR "oil and gas" OR renewable "Cloud Engineer" OR "DevOps Engineer" OR "SAP" OR "NetSuite" OR "Automation Engineer"',
    lob: 'auto',
    requireIndustry: 'Energy',
    intent: 'Energy company hiring for technology',
  },
  {
    query: 'utility OR "energy company" OR "oil and gas" OR renewable "selects" OR "migrates to" OR "modernizes" OR "automates" cloud OR SAP OR ERP OR "legacy systems" 2026 site:businesswire.com OR site:prnewswire.com',
    lob: 'auto',
    requireIndustry: 'Energy',
    intent: 'Energy technology initiative',
  },
  // LinkedIn posts where someone publicly asks for a provider. Only public,
  // search-indexed posts are found (no LinkedIn login or scraping).
  // 'basic' depth costs half the Tavily credits of 'advanced'.
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "seeking recommendations" OR "looking for recommendations" OR "can anyone recommend" NetSuite OR ERP partner OR consultant -hiring -jobs',
    lob: 'ERP',
    intent: 'Asked on LinkedIn for a NetSuite / ERP partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "seeking recommendations" OR "looking for recommendations" OR "can anyone recommend" "cloud migration" OR AWS OR Azure partner OR consultant -hiring -jobs',
    lob: 'Cloud',
    intent: 'Asked on LinkedIn for a cloud partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" "software development company" OR "app development" OR "development partner" -hiring -jobs',
    lob: 'Application Development',
    intent: 'Asked on LinkedIn for a development partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" RPA OR UiPath OR "process automation" partner OR consultant -hiring -jobs',
    lob: 'Process Automation',
    intent: 'Asked on LinkedIn for an automation partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" mainframe OR "legacy modernization" OR "legacy system" partner OR consultant -hiring -jobs',
    lob: 'Legacy Modernization',
    intent: 'Asked on LinkedIn for a modernization partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" "offshore development" OR "dedicated development team" OR "development team in India" -hiring -jobs',
    lob: 'Offshore',
    intent: 'Asked on LinkedIn for an offshore team',
  },
  // ---- Free sources (no search credits) ----
  // Google News: recent announcements where the headline company is buying.
  {
    kind: 'news',
    query: '"selects NetSuite" OR "chooses NetSuite" OR "goes live on NetSuite" OR "implements NetSuite"',
    lob: 'ERP',
    intent: 'Chose NetSuite / ERP (news)',
  },
  {
    kind: 'news',
    query: '"migrates to AWS" OR "moves to Microsoft Azure" OR "selects Google Cloud" OR "completes cloud migration"',
    lob: 'Cloud',
    intent: 'Cloud migration announced (news)',
  },
  {
    kind: 'news',
    query: '(selects OR chooses) ("legacy modernization" OR "mainframe modernization" OR "core system replacement")',
    lob: 'Legacy Modernization',
    intent: 'Legacy modernization announced (news)',
  },
  {
    kind: 'news',
    query: '(selects OR chooses OR deploys) (UiPath OR "Automation Anywhere" OR "Blue Prism" OR "Power Automate")',
    lob: 'Process Automation',
    intent: 'Automation program announced (news)',
  },
  {
    kind: 'news',
    query: '(hospital OR "health system" OR "medical center") (selects OR chooses OR implements) (cloud OR ERP OR Workday OR Oracle OR automation OR "digital transformation")',
    lob: 'auto',
    requireIndustry: 'Healthcare',
    intent: 'Healthcare technology decision (news)',
  },
  {
    kind: 'news',
    query: '(utility OR "electric cooperative" OR "oil and gas" OR "energy company") (selects OR chooses OR implements) (SAP OR Oracle OR cloud OR ERP OR "digital transformation" OR automation)',
    lob: 'auto',
    requireIndustry: 'Energy',
    intent: 'Energy technology decision (news)',
  },
  {
    kind: 'news',
    query: '"global capability center" OR "technology center" OR "engineering center" opens India',
    headlineVerbs: 'expands|opens|inaugurates|launches|sets up',
    lob: 'Offshore',
    intent: 'Opening an India technology center (news)',
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
  // Regional news (free). Short "place + technology" queries: long OR-queries make
  // Google News ignore the date limit. Kept only if the headline has a buyer verb
  // and a technology term, and doesn't clearly name another region.
  ...regionalNewsSearches('UAE', 'AE', ['UAE ERP', 'UAE SAP', 'UAE Oracle', 'UAE cloud', 'Dubai digital transformation', 'Abu Dhabi digital transformation', 'UAE AI platform', 'UAE core banking']),
  ...regionalNewsSearches('Europe', 'GB', ['UK ERP', 'UK SAP', 'UK cloud migration', 'UK digital transformation', 'Germany SAP', 'Netherlands cloud', 'Ireland digital transformation', 'Europe ERP']),
  ...regionalNewsSearches('India', 'IN', ['India ERP', 'India SAP', 'India cloud migration', 'India digital transformation', 'Bengaluru global capability centre', 'Hyderabad global capability centre']),
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

const LINKEDIN_MAX_AGE_DAYS = LEAD_MAX_AGE_DAYS;

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
  return /^job application\b/i.test(name) || /\b(jobs|careers|job board|openings)\b/i.test(name) || /\b(engineer|developer|architect|administrator|analyst|consultant)s?$/i.test(name.trim());
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
async function searchWithTavily(query, depth = 'basic') {
  // Tries Tavily, then Serper, then You.com (whichever have API keys set).
  const { results, provider, errors } = await searchWeb(query, { depth, maxResults: 10, recentDays: LEAD_MAX_AGE_DAYS });
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

// Company that is acting in a news headline, e.g.
// "Rush University System for Health selects AGFA..." -> "Rush University System for Health".
// Verbs where the headline company is the buyer. "Expands"/"launches" usually
// mean a vendor talking about itself, so they're only used where a search asks.
const BUYER_VERBS = 'selects|select|chooses|choose|picks|taps|implements|implement|deploys|adopts|goes live|went live|migrates|moves|completes|awards';

function companyFromHeadline(title, extraVerbs) {
  const verbs = extraVerbs ? `${BUYER_VERBS}|${extraVerbs}` : BUYER_VERBS;
  const match = (title || '').match(new RegExp(`^(.{2,90}?)\\s+(${verbs})\\b`, 'i'));
  if (!match) return null;
  let name = match[1]
    .replace(/^.*?:\s+/, '') // "'Absurd ambition': Pulumi" -> "Pulumi"
    .replace(/^(UK|US|U\.S\.|UAE|India|Indian|Dutch|German|French|Irish|British|European)['’]s\s+/i, '') // "UK's AlRayan Bank" -> "AlRayan Bank"
    .replace(/^[A-Z][A-Za-z.\s-]{1,30}-based\s+/, '') // "New Jersey-based X" -> "X"
    .replace(/^.*\bparent company\s+/i, '') // "Royal Canin Parent Company Mars" -> "Mars"
    .replace(/\s+and\s+.*$/i, '') // "X and Y Select" -> "X"
    .replace(/['’]s$/, '')
    .trim();
  // Fragments, sentences and vendor self-descriptions are not company names.
  if (!name || name.includes(',') || name.split(/\s+/).length > 7) return null;
  if (/\b(provider|vendor|startup|firm|agency|report|study|survey|cancels|announces)\b/i.test(name)) return null;
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

async function fetchForSearch(search) {
  try {
    if (search.kind === 'news') return await searchNews(search.query, { days: LEAD_MAX_AGE_DAYS, edition: search.edition });
  } catch (error) {
    console.error(`Free source error for "${search.query}":`, error.message);
    return [];
  }
  return searchWithTavily(search.query, search.depth);
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

  const postedAt = linkedInPostDate(url);
  if (!postedAt || Date.now() - postedAt.getTime() > LINKEDIN_MAX_AGE_DAYS * 86400000) {
    console.log(`   ⏭️  Skipped LinkedIn post (older than ${LINKEDIN_MAX_AGE_DAYS} days): ${url}`);
    return false;
  }

  const author = linkedInAuthor(result);
  const key = companyKey(author);
  if (!author || !key || NON_BUYERS.has(key) || seenCompanies.has(key)) return false;
  seenCompanies.add(key);

  const lob = search.lob === 'auto' ? inferLob(text) : search.lob;
  const industry = classifyIndustry(text);
  const geo = classifyGeography({ text });
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
          authorProfileUrl: slug ? `https://www.linkedin.com/in/${slug}/` : null,
          postedAt: postedAt ? postedAt.toISOString() : null,
          postedAtSource: postedAt ? 'LinkedIn post ID' : null,
          postedAtChecked: true,
          whyThisLead: [search.intent, 'Publicly asked for a provider on LinkedIn', 'Company not yet identified'],
          searchContext: text.substring(0, 500),
          tavilyUrl: url,
          techStack: [],
          sourceTitle: result.title || null,
          requirement: await findRequirementDetails(url, { companyName: author, title: result.title, text }).catch(() => null),
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
      if (!isRecent(signals.postedAt)) return false;
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
export async function discoverLeads() {
  console.log('🔍 Starting lead discovery process...');

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
    SEARCHES.map(async (search) => ({ search, results: await fetchForSearch(search) }))
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

      const companyName =
        search.kind === 'news' ? companyFromHeadline(result.title, search.headlineVerbs) : extractCompanyName(result);
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
      const industry = classifyIndustry(sourceText, companyName);
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

      const score = scoreLead(industry, 60, 85);

      // Look up when the source was published and save the lead. Runs in
      // parallel with the rest of the scan; awaited after the loop.
      pendingSaves.push((async () => {
      try {
        const fromFeed = search.kind === 'news';
        const published = fromFeed
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
        if (search.requireTechHeadline && !TECH_HEADLINE.test(result.title || '')) {
          console.log(`   ⏭️  Skipped: ${companyName} (headline isn't about technology)`);
          return;
        }
        // Only recent needs: skip sources older than the window or without a date,
        // before spending a search credit on the company profile.
        if (!published || !isRecent(published.date)) {
          console.log(`   ⏭️  Skipped: ${companyName} (${published ? `posted ${published.date.slice(0, 10)}` : 'no posting date'}, older than ${LEAD_MAX_AGE_DAYS} days or unknown)`);
          return;
        }
        const [profile, requirement] = await Promise.all([
          findCompanyProfile(companyName, { industry, sourceUrl: result.url }).catch(() => null),
          fromFeed ? feedRequirement(result) : findRequirementDetails(result.url, { companyName, title: result.title, text: result.content }).catch(() => undefined),
        ]);
        const website = profile?.website || companyWebsite;
        const geo = leadGeography({ requirement, profile, text: `${result.title || ''} ${result.content || ''}` });
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
            revenue: null,
            hq: profile?.headquarters || geo.location || null,
            lob,
            intentSignal,
            recommendedService: search.service || LOB_SERVICES[lob],
            leadScore: score,
            source: `${query} (${{ news: 'Google News' }[result.provider] || result.provider || 'web search'})`,
            outreachEmail: `contact@${website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}`,
            signals: {
              techStack: [],
              whyThisLead: [
                intentSignal,
                `Found via ${lob} search`,
                `Source: ${domain}`,
              ],
              searchContext: result.content?.substring(0, 500),
              dataSource: { news: 'Google News', tavily: 'Tavily', serper: 'Serper (Google)', you: 'You.com' }[result.provider] || 'Web search',
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
        console.log(`      ✅ Saved ${companyName} (Score: ${score}, posted ${published ? published.date.slice(0, 10) : 'unknown'})`);
      } catch (error) {
        console.error(`      ❌ Error saving lead:`, error.message);
      }
      })());
    }
  }

  await Promise.all(pendingSaves);

  const jobStatus = await recheckJobPostings(25).catch((error) => {
    console.error('Re-checking job postings failed:', error.message);
    return { checked: 0, closed: 0 };
  });

  // Let older leads catch up on company profiles and posted dates.
  const enrichedExisting = await enrichExistingLeads(15).catch((error) => {
    console.error('Enriching older leads failed:', error.message);
    return 0;
  });

  await prisma.scanRun.update({
    where: { id: scanRun.id },
    data: {
      completedAt: new Date(),
      companiesScanned: totalCompaniesScanned,
      newLeadsFound,
      sources: sourcesBreakdown,
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
      SEARCHES.filter((s) => s.kind !== 'news').every((s) => !sourcesBreakdown[s.query])
        ? lastSearchError
        : null,
    sources: sourcesBreakdown,
    duration: new Date() - scanRun.startedAt,
  };

  console.log('\n✅ Lead discovery completed!');
  console.log(`📊 Summary: ${newLeadsFound} new leads from ${totalCompaniesScanned} results scanned`);

  return summary;
}

export default { discoverLeads };
