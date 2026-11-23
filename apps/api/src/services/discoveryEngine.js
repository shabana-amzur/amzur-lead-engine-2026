import axios from 'axios';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import nonBuyers from '../config/non-buyers.json';
import industryConfig from '../config/industries.json';
import { findPublishedDate } from '../lib/publishedDate';

// OpenAI client for scoreWithOpenAI (not yet used by the scan). Created only
// when a key is configured: constructing it without one throws, which would
// break every scan even though discovery itself only needs Tavily.
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Searches targeting actual buying intent, tagged with the line of business
// (LOB) and Amzur service each one feeds. Every LOB on the dashboard needs at
// least one search here, or it can never receive leads.
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
  {
    query: 'site:sam.gov "cloud migration" RFP 2026',
    lob: 'Cloud',
    service: 'Cloud Migration Services',
    intent: 'RFP for cloud migration',
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
    query: 'site:linkedin.com/posts "seeking recommendations" OR "looking for recommendations" OR "can anyone recommend" NetSuite OR ERP partner OR consultant',
    lob: 'ERP',
    intent: 'Asked on LinkedIn for a NetSuite / ERP partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "seeking recommendations" OR "looking for recommendations" OR "can anyone recommend" "cloud migration" OR AWS OR Azure partner OR consultant',
    lob: 'Cloud',
    intent: 'Asked on LinkedIn for a cloud partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" "software development company" OR "app development" OR "development partner"',
    lob: 'Application Development',
    intent: 'Asked on LinkedIn for a development partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" RPA OR UiPath OR "process automation" partner OR consultant',
    lob: 'Process Automation',
    intent: 'Asked on LinkedIn for an automation partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" mainframe OR "legacy modernization" OR "legacy system" partner OR consultant',
    lob: 'Legacy Modernization',
    intent: 'Asked on LinkedIn for a modernization partner',
  },
  {
    kind: 'linkedin',
    depth: 'basic',
    query: 'site:linkedin.com/posts "can anyone recommend" OR "looking for recommendations" OR "seeking recommendations" "offshore development" OR "dedicated development team" OR "development team in India"',
    lob: 'Offshore',
    intent: 'Asked on LinkedIn for an offshore team',
  },
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
  ['Legacy Modernization', /\b(mainframe|cobol|legacy|core banking)\b/gi],
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

const LINKEDIN_MAX_AGE_DAYS = 180;

// The post asks for a provider, e.g. "I'm seeking recommendations for NetSuite partners".
const LINKEDIN_REQUEST =
  /\b(seeking recommendations?|looking for recommendations?|any recommendations|does anyone have (any )?recommendations?|can anyone recommend|could anyone recommend|can you recommend|who (would|do) you recommend|looking for (a|an) [^.?!]{0,50}(partner|consultant|consultancy|vendor|agency|firm|company|provider|team)|need (a|an) [^.?!]{0,40}(partner|consultant|vendor|agency|firm))\b/i;

// Recruiting or self-promotion rather than a request to buy.
const LINKEDIN_NOT_A_REQUEST =
  /\b(we('| a)re hiring|#hiring|join our team|apply now|job opening|open role|years of experience|we help|our (team|clients|services|consultants|experts)|contact us|dm me|book a (call|demo)|reach out to us|we('| a)re a|we offer|as a (leading|certified)|partner of the year|we are looking for a passionate)\b/i;

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
    /\|\s*([^|]{2,60}?)\s+posted on the topic/i,
    /^([^:|]{2,60}?)\s+on LinkedIn:/i,
    /^([^|]{2,60}?)['’]s Post/i,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return match[1].replace(/,.*$/, '').trim();
  }
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
  return /^job application\b/i.test(name) || /\b(engineer|developer|architect|administrator|analyst|consultant)s?$/i.test(name.trim());
}

function isJobBoard(domain) {
  return !!domain && (domain.includes('greenhouse.io') || domain.includes('lever.co') || domain.startsWith('jobs.'));
}

/**
 * Search for companies using Tavily API
 */
async function searchWithTavily(query, depth = 'advanced') {
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: depth,
        max_results: 10,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return response.data.results || [];
  } catch (error) {
    console.error(`Tavily search error for "${query}":`, error.message);
    return [];
  }
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
    
    const dashMatch = result.title.match(/^([A-Z][a-zA-Z0-9\s&]+?)\s*[-–]/);
    if (dashMatch) return dashMatch[1].trim();
  }
  
  // For press releases, extract from title
  if (domain?.includes('techcrunch') || domain?.includes('businesswire') || domain?.includes('prnewswire')) {
    // Title format: "Stripe raises $600M Series H" or "Acme Corp announces..."
    const companyMatch = result.title.match(/^([A-Z][a-zA-Z0-9\s&.]+?)(?:\s+(?:raises|announces|secures|closes|launches|unveils|selects|chooses|implements|completes|migrates|moves|opens|expands|establishes|partners|deploys|goes live))/i);
    if (companyMatch) return companyMatch[1].trim();
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

/**
 * Save a LinkedIn post as a lead when someone is asking for a provider.
 * The lead is the post's author: LinkedIn posts rarely name the employer.
 * Returns true when a lead was saved.
 */
async function saveLinkedInLead(search, result, seenCompanies) {
  const url = result.url || '';
  const text = `${result.title || ''} ${result.content || ''}`;

  if (!url.includes('linkedin.com/posts/')) return false;
  if (!LINKEDIN_REQUEST.test(text) || LINKEDIN_NOT_A_REQUEST.test(text)) {
    console.log(`   ⏭️  Skipped LinkedIn post (not a request to buy): ${url}`);
    return false;
  }

  const postedAt = linkedInPostDate(url);
  if (postedAt && Date.now() - postedAt.getTime() > LINKEDIN_MAX_AGE_DAYS * 86400000) {
    console.log(`   ⏭️  Skipped LinkedIn post (older than ${LINKEDIN_MAX_AGE_DAYS} days): ${url}`);
    return false;
  }

  const author = linkedInAuthor(result);
  const key = companyKey(author);
  if (!author || !key || NON_BUYERS.has(key) || seenCompanies.has(key)) return false;
  seenCompanies.add(key);

  const lob = search.lob === 'auto' ? inferLob(text) : search.lob;
  const industry = classifyIndustry(text);
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
        source: `${search.query} (Tavily · LinkedIn)`,
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

  // Run all searches in parallel; Tavily latency dominates scan time.
  const searchResults = await Promise.all(
    SEARCHES.map(async (search) => ({ search, results: await searchWithTavily(search.query, search.depth) }))
  );

  for (const { search, results } of searchResults) {
    const { query } = search;
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

      const companyName = extractCompanyName(result);
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
        const published = await findPublishedDate(result.url, result.published_date);
        await prisma.lead.create({
          data: {
            companyName,
            industry,
            website: companyWebsite,
            employees: null,
            revenue: null,
            hq: 'USA',
            lob,
            intentSignal,
            recommendedService: search.service || LOB_SERVICES[lob],
            leadScore: score,
            source: `${query} (Tavily)`,
            outreachEmail: `contact@${companyWebsite.replace(/^https?:\/\//, '')}`,
            signals: {
              techStack: [],
              whyThisLead: [
                intentSignal,
                `Found via ${lob} search`,
                `Source: ${domain}`,
              ],
              searchContext: result.content?.substring(0, 500),
              dataSource: 'Tavily',
              tavilyUrl: result.url,
              postedAt: published ? published.date : null,
              postedAtSource: published ? published.method : null,
              postedAtChecked: true,
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
    sources: sourcesBreakdown,
    duration: new Date() - scanRun.startedAt,
  };

  console.log('\n✅ Lead discovery completed!');
  console.log(`📊 Summary: ${newLeadsFound} new leads from ${totalCompaniesScanned} results scanned`);

  return summary;
}

export default { discoverLeads };
