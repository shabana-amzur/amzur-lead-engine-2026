import axios from 'axios';
import OpenAI from 'openai';
import prisma from '../lib/prisma';
import nonBuyers from '../config/non-buyers.json';

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
];

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
]);

// Companies that sell rather than buy (IT services firms, vendors, job sites).
const NON_BUYERS = new Set(nonBuyers.companies);

// The source text describes the company itself as a seller, e.g.
// "NEORIS ... is a Digital Accelerator that helps companies" or
// "Alliance, a national consulting firm". Also catches recruiter posts.
function describesItselfAsSeller(companyName, text) {
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
async function searchWithTavily(query) {
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: 'advanced',
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

  // Run all searches in parallel; Tavily latency dominates scan time.
  const searchResults = await Promise.all(
    SEARCHES.map(async (search) => ({ search, results: await searchWithTavily(search.query) }))
  );

  for (const { search, results } of searchResults) {
    const { query } = search;
    sourcesBreakdown[query] = results.length;
    console.log(`\n🔎 [${search.lob}] "${query}": ${results.length} results`);

    for (const result of results) {
      totalCompaniesScanned++;

      const domain = extractDomain(result.url);
      if (!domain) continue;

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

      seenCompanies.add(key);
      console.log(`   ➡️  ${companyName} (${search.lob}): ${intentSignal}`);

      const careerDomain =
        domain.startsWith('careers.') || domain.startsWith('jobs.') ? domain.replace(/^(careers|jobs)\./, '') : null;
      const companyWebsite =
        careerDomain && !isJobBoard(domain)
          ? `https://${careerDomain}`
          : `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;

      // Placeholder score until OpenAI scoring is enabled.
      const score = Math.floor(Math.random() * (85 - 60 + 1)) + 60;

      try {
        await prisma.lead.create({
          data: {
            companyName,
            industry: 'Technology',
            website: companyWebsite,
            employees: null,
            revenue: null,
            hq: 'USA',
            lob: search.lob,
            intentSignal,
            recommendedService: search.service,
            leadScore: score,
            source: `${query} (Tavily)`,
            outreachEmail: `contact@${companyWebsite.replace(/^https?:\/\//, '')}`,
            signals: {
              techStack: [],
              whyThisLead: [
                intentSignal,
                `Found via ${search.lob} search`,
                `Source: ${domain}`,
              ],
              searchContext: result.content?.substring(0, 500),
              dataSource: 'Tavily',
              tavilyUrl: result.url,
            },
          },
        });

        newLeadsFound++;
        console.log(`      ✅ Saved lead (Score: ${score})`);
      } catch (error) {
        console.error(`      ❌ Error saving lead:`, error.message);
      }
    }
  }

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
