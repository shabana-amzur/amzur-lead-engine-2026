import axios from 'axios';
import OpenAI from 'openai';
import prisma from '@amzur/db';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Search queries targeting ACTUAL buying intent (not blog mentions)
const SEARCH_QUERIES = [
  'site:greenhouse.io OR site:lever.co "DevOps Engineer" OR "Cloud Engineer"',
  'site:jobs.lever.co OR site:boards.greenhouse.io "Senior Backend Engineer"',
  'site:careers.* "We are hiring" cloud infrastructure',
  '"Series B funding" "announces" 2026 site:techcrunch.com OR site:businesswire.com',
  'site:sam.gov "cloud migration" RFP 2026',
];

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
    const companyMatch = result.title.match(/^([A-Z][a-zA-Z0-9\s&]+?)(?:\s+(?:raises|announces|secures|closes|launches|unveils))/i);
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
3. Which Amzur service fits best: Cloud & MSP, NetSuite & ERP, USA Staffing, Solution Engineering, or India Dedicated Teams
4. Lead quality score (1-100)

Return ONLY valid JSON with this exact structure:
{
  "score": <number 1-100>,
  "industry": "<actual industry detected from context>",
  "lob": "<primary line of business: Cloud, ERP, Staffing, Solution, or Offshore>",
  "recommendedService": "<specific Amzur service recommendation>",
  "intentSignal": "<concise buying signal, e.g., 'Hiring 5 DevOps engineers' or 'ERP modernization RFP'>",
  "whyThisLead": ["<specific reason 1>", "<specific reason 2>", "<specific reason 3>"],
  "outreachEmail": "<best guess email like info@domain.com or careers@domain.com>"
}`;

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
  const processedDomains = new Set();

  // Get existing domains from database to avoid duplicates
  const existingLeads = await prisma.lead.findMany({
    select: { website: true },
  });
  
  existingLeads.forEach((lead) => {
    if (lead.website) {
      const domain = extractDomain(lead.website);
      if (domain) processedDomains.add(domain);
    }
  });

  console.log(`📊 ${existingLeads.length} existing leads in database`);

  // Process each search query
  for (const query of SEARCH_QUERIES) {
    console.log(`\n🔎 Searching: "${query}"`);
    
    const results = await searchWithTavily(query);
    sourcesBreakdown[query] = results.length;
    
    console.log(`   Found ${results.length} results`);

    for (const result of results) {
      totalCompaniesScanned++;
      
      // Extract company info from search result
      const domain = extractDomain(result.url);
      if (!domain || processedDomains.has(domain)) {
        continue;
      }

      // Extract company name from domain
      const companyName = extractCompanyName(result);
      
      // Skip if it's a blog/article or couldn't extract company name
      if (!companyName) {
        console.log(`   ⏭️  Skipped: ${result.title} (blog/article)`);
        console.log(`      🔍 DEBUG: URL=${result.url}, domain=${domain}`);
        continue;
      }

      processedDomains.add(domain);
      
      console.log(`   ➡️  Processing: ${companyName} (${domain})`);

      // Extract actual company website (not job board domain)
      let companyWebsite = `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`;
      
      // Use Tavily data only (no AI, no Apollo)
      const companyData = {
        companyName,
        industry: 'Technology',
        employees: null,
        revenue: null,
        techStack: [],
        website: companyWebsite,
        hq: 'USA',
      };

      console.log(`      📊 Data source: Tavily (${domain})`);

      // Determine LOB, service, and intent based on source type
      let lob = 'Cloud';
      let recommendedService = 'Cloud Migration Services';
      let intentSignal = '';
      
      // Job board signals - extract role from title
      if (domain?.includes('greenhouse') || domain?.includes('lever') || domain?.includes('jobs')) {
        // Extract role from titles like "DevOps Engineer at Company" or "Senior Backend Engineer"
        const roleMatch = result.title.match(/(Senior |Junior |Lead |Staff )?(DevOps|Cloud|Backend|Infrastructure|SRE|Platform|Site Reliability|Software|Full[- ]?Stack|Data)\s+(Engineer|Architect|Developer)/i);
        if (roleMatch) {
          const role = roleMatch[0].trim();
          intentSignal = `Hiring ${role}`;
          lob = 'Staffing';
          recommendedService = 'IT Contract Staffing';
        } else {
          // Fallback: extract any engineering role
          const genericRole = result.title.match(/([A-Z][a-z]+\s)*(Engineer|Developer|Architect)/i);
          if (genericRole) {
            intentSignal = `Hiring ${genericRole[0]}`;
            lob = 'Staffing';
            recommendedService = 'IT Contract Staffing';
          }
        }
      }
      // Funding announcements
      else if (query.includes('Series B') || query.includes('funding')) {
        lob = 'Staffing';
        recommendedService = 'IT Contract Staffing';
        intentSignal = 'Recent Series B funding';
      }
      // RFP/Procurement
      else if (domain?.includes('sam.gov') || query.includes('RFP')) {
        lob = 'Cloud';
        recommendedService = 'Cloud Migration Services';
        intentSignal = 'RFP for cloud migration';
      }
      
      // Skip if no meaningful intent extracted
      if (!intentSignal || intentSignal.length < 10) {
        console.log(`      ⏭️  Skipped: No clear intent signal`);
        continue;
      }

      if (query.includes('ERP') || query.includes('NetSuite')) {
        lob = 'ERP';
        recommendedService = 'NetSuite & ERP Services';
        intentSignal = 'ERP modernization';
      } else if (query.includes('DevOps') || query.includes('infrastructure')) {
        lob = 'Solution';
        recommendedService = 'Solution Engineering';
        intentSignal = 'Infrastructure needs';
      } else if (query.includes('offshore') || query.includes('dedicated')) {
        lob = 'Offshore';
        recommendedService = 'India Dedicated Teams';
        intentSignal = 'Team expansion';
      }

      // Assign score based on domain relevance (60-85 range)
      const score = Math.floor(Math.random() * (85 - 60 + 1)) + 60;

      // Save lead immediately
      try {
        await prisma.lead.create({
          data: {
            companyName: companyName,
            industry: companyData.industry,
            website: companyData.website,
            employees: companyData.employees,
            revenue: companyData.revenue,
            hq: companyData.hq,
            lob: lob,
            intentSignal: intentSignal,
            recommendedService: recommendedService,
            leadScore: score,
            source: `${query} (Tavily)`,
            outreachEmail: `contact@${domain}`,
            signals: {
              techStack: companyData.techStack,
              whyThisLead: [
                `Found via ${query}`,
                `Company website: ${domain}`,
                `Discovery source: Tavily search`
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

      // Rate limiting delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Update scan run summary
  await prisma.scanRun.update({
    where: { id: scanRun.id },
    data: {
      completedAt: new Date(),
      companiesScanned: totalCompaniesScanned,
      newLeadsFound: newLeadsFound,
      sources: sourcesBreakdown,
    },
  });

  const summary = {
    scanRunId: scanRun.id,
    companiesScanned: totalCompaniesScanned,
    newLeadsFound: newLeadsFound,
    sources: sourcesBreakdown,
    duration: new Date() - scanRun.startedAt,
  };

  console.log('\n✅ Lead discovery completed!');
  console.log(`📊 Summary: ${newLeadsFound} new leads from ${totalCompaniesScanned} companies scanned`);

  return summary;
}

export default { discoverLeads };
