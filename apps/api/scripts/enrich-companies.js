// Look up a short company profile (description, official website, LinkedIn
// page, headquarters, headcount) for leads saved before this existed.
// Each lead is looked up once (signals.companyChecked); LinkedIn-post leads
// are skipped because their company is unknown. Costs 1 Tavily credit per
// lead. DRY_RUN=1 prints results without saving.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { findCompanyProfile } = require(path.join(__dirname, '..', 'src', 'lib', 'companyProfile.js'));

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';
const CONCURRENCY = 4;
const LIMIT = parseInt(process.env.ENRICH_LIMIT || '200', 10);

async function main() {
  if (!process.env.TAVILY_API_KEY) {
    console.log('Company enrichment skipped: TAVILY_API_KEY is not set.');
    return;
  }

  const leads = await prisma.lead.findMany({
    select: { id: true, companyName: true, industry: true, website: true, hq: true, employees: true, signals: true },
    orderBy: { leadScore: 'desc' },
  });
  const pending = leads
    .filter((lead) => {
      const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
      return !signals.companyChecked && signals.leadType !== 'linkedin_post';
    })
    .slice(0, LIMIT);

  if (pending.length === 0) {
    console.log(`Company enrichment: nothing to do (${leads.length} leads checked).`);
    return;
  }

  let found = 0;
  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const lead = pending[index++];
      const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
      let profile = null;
      try {
        profile = await findCompanyProfile(lead.companyName, { industry: lead.industry, sourceUrl: signals.tavilyUrl });
      } catch (error) {
        console.log(`- ${lead.companyName}: lookup failed (${error.message}); will retry next deploy`);
        continue;
      }
      if (profile) found++;
      console.log(`- ${lead.companyName}: ${profile ? `${profile.website || '-'} | ${profile.linkedinUrl || '-'}` : 'no reliable profile'}`);
      if (dryRun) continue;

      const website = profile?.website || lead.website;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          website,
          hq: profile?.headquarters || (lead.hq === 'USA' ? null : lead.hq),
          employees: profile?.employees ?? lead.employees,
          ...(profile?.website
            ? { outreachEmail: `contact@${profile.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')}` }
            : {}),
          signals: { ...signals, company: profile, companyChecked: true },
        },
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  console.log(`Company enrichment: profiles found for ${found} of ${pending.length} leads${dryRun ? ' (DRY RUN, nothing saved)' : ''}.`);
}

main()
  .catch((error) => {
    console.error('Company enrichment failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
