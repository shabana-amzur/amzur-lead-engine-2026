// Re-check saved LinkedIn-post leads with the current rules
// (src/lib/linkedinFilters.js) and delete those that are job ads, recruiting
// or self-promotion rather than someone asking to buy a service.
// Safe to run repeatedly. DRY_RUN=1 lists what would be deleted.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { classifyLinkedInPost } = require(path.join(__dirname, '..', 'src', 'lib', 'linkedinFilters.js'));

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, signals: true } });
  const linkedInLeads = leads.filter((lead) => lead.signals && lead.signals.leadType === 'linkedin_post');

  const invalid = [];
  for (const lead of linkedInLeads) {
    const verdict = classifyLinkedInPost(lead.signals.tavilyUrl, lead.signals.searchContext || '');
    if (!verdict.ok) invalid.push({ ...lead, reason: verdict.reason });
  }

  if (invalid.length === 0) {
    console.log(`LinkedIn lead check: all ${linkedInLeads.length} LinkedIn leads are valid requests.`);
    return;
  }

  for (const lead of invalid) console.log(`- ${lead.companyName}: ${lead.reason}`);

  if (dryRun) {
    console.log(`DRY RUN: would remove ${invalid.length} of ${linkedInLeads.length} LinkedIn leads.`);
    return;
  }

  const { count } = await prisma.lead.deleteMany({ where: { id: { in: invalid.map((lead) => lead.id) } } });
  console.log(`LinkedIn lead check: removed ${count} leads that were not requests to buy.`);
}

main()
  .catch((error) => {
    console.error('LinkedIn lead check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
