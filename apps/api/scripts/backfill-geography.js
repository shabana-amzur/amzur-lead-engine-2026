// Tag every lead with its region (USA, UAE, Europe, India, Other, Unknown)
// using the rules in src/lib/geography.js. Uses only stored data (no network),
// so it re-runs on every deploy and picks up rule changes. DRY_RUN=1 prints counts.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { leadGeography } = require(path.join(__dirname, '..', 'src', 'lib', 'geography.js'));

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, hq: true, signals: true } });
  const counts = {};
  let changed = 0;
  for (const lead of leads) {
    const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    const geo = leadGeography({
      requirement: signals.requirement,
      profile: signals.company,
      hq: lead.hq,
      text: `${lead.companyName} ${signals.sourceTitle || ''} ${signals.searchContext || ''}`,
    });
    counts[geo.region] = (counts[geo.region] || 0) + 1;
    if (signals.geography === geo.region && signals.location === geo.location) continue;
    changed++;
    if (!dryRun) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { signals: { ...signals, geography: geo.region, location: geo.location } },
      });
    }
  }
  console.log(`Geography backfill: ${JSON.stringify(counts)}; ${changed} updated${dryRun ? ' (DRY RUN)' : ''}.`);
}

main()
  .catch((error) => {
    console.error('Geography backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
