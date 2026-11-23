// Classify the industry of leads saved before industry detection existed
// (they all defaulted to "Technology"). Priority industries (Healthcare,
// Energy) get the same score boost new leads get, so they sort to the top.
// Only touches leads whose industry is missing or "Technology", so it is safe
// to run on every deploy. DRY_RUN=1 lists changes without saving.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';
const industryConfig = require(path.join(__dirname, '..', 'src', 'config', 'industries.json'));
const priorityIndustries = new Set(industryConfig.industries.filter((i) => i.priority).map((i) => i.name));

// Must match classifyIndustry() in src/services/discoveryEngine.js.
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

async function main() {
  const leads = await prisma.lead.findMany({
    where: { OR: [{ industry: null }, { industry: 'Technology' }] },
    select: { id: true, companyName: true, industry: true, leadScore: true, signals: true },
  });

  const changes = [];
  for (const lead of leads) {
    const context = lead.signals && typeof lead.signals === 'object' ? lead.signals.searchContext || '' : '';
    const industry = classifyIndustry(`${lead.companyName} ${context}`, lead.companyName);
    if (industry === lead.industry) continue;
    const boost = priorityIndustries.has(industry) ? industryConfig.priorityBoost : 0;
    const leadScore = lead.leadScore == null ? lead.leadScore : Math.min(99, lead.leadScore + boost);
    changes.push({ id: lead.id, companyName: lead.companyName, industry, leadScore });
  }

  if (changes.length === 0) {
    console.log(`Industry backfill: nothing to update (${leads.length} leads checked).`);
    return;
  }

  const byIndustry = {};
  for (const change of changes) byIndustry[change.industry] = (byIndustry[change.industry] || 0) + 1;
  console.log(`Industry backfill: ${changes.length} leads -> ${JSON.stringify(byIndustry)}`);

  if (dryRun) {
    for (const change of changes) console.log(`- ${change.companyName}: ${change.industry} (score ${change.leadScore})`);
    console.log('DRY RUN: nothing saved.');
    return;
  }

  for (const change of changes) {
    await prisma.lead.update({
      where: { id: change.id },
      data: { industry: change.industry, leadScore: change.leadScore },
    });
  }
  console.log(`Industry backfill: updated ${changes.length} leads.`);
}

main()
  .catch((error) => {
    console.error('Industry backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
