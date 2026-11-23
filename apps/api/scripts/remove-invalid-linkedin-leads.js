// Re-check saved LinkedIn-post leads with the current rules
// (src/lib/linkedinFilters.js) and delete those that are job ads, recruiting
// or self-promotion rather than someone asking to buy a service.
// Safe to run repeatedly. DRY_RUN=1 lists what would be deleted.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { classifyLinkedInPost } = require(path.join(__dirname, '..', 'src', 'lib', 'linkedinFilters.js'));
const { findRequirementDetails } = require(path.join(__dirname, '..', 'src', 'lib', 'requirementDetails.js'));

// Author name from the post text, e.g. "Mehul Patel | 37 comments ..." or "Mehul Patel's Post ...".
function authorFromText(text) {
  const match = (text || '').match(/^([^|]{2,60}?)\s*\|\s*\d+ comments/i) || (text || '').match(/^([^|]{2,60}?)['’]s Post/i);
  return match ? match[1].replace(/,.*$/, '').trim() : null;
}

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, signals: true } });
  const linkedInLeads = leads.filter((lead) => lead.signals && lead.signals.leadType === 'linkedin_post');

  const invalid = [];
  const valid = [];
  for (const lead of linkedInLeads) {
    const verdict = classifyLinkedInPost(lead.signals.tavilyUrl, lead.signals.searchContext || '');
    if (!verdict.ok) invalid.push({ ...lead, reason: verdict.reason });
    else valid.push(lead);
  }

  // Refresh the headline (the actual request) and author name of the ones we keep.
  if (!dryRun) {
    for (const lead of valid) {
      const requirement = await findRequirementDetails(lead.signals.tavilyUrl, { text: lead.signals.searchContext });
      const author = authorFromText(lead.signals.searchContext);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...(author && author.includes(' ') ? { companyName: author } : {}),
          signals: { ...lead.signals, requirement, requirementChecked: true, ...(author ? { author } : {}) },
        },
      });
    }
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
