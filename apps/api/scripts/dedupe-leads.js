// Remove duplicate leads: older scans re-added the same company on every run.
// Keeps the highest-scoring copy of each company (earliest discovered on a tie)
// and deletes the rest. Safe to run repeatedly; does nothing once clean.
// DRY_RUN=1 lists what would be deleted without deleting.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

// Must match companyKey() in src/services/discoveryEngine.js.
function companyKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const leads = await prisma.lead.findMany({
    select: { id: true, companyName: true, leadScore: true, discoveredAt: true },
  });

  const groups = new Map();
  for (const lead of leads) {
    const key = companyKey(lead.companyName);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lead);
  }

  const toDelete = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) =>
        (b.leadScore ?? 0) - (a.leadScore ?? 0) ||
        new Date(a.discoveredAt).getTime() - new Date(b.discoveredAt).getTime()
    );
    const [keep, ...duplicates] = group;
    console.log(`${keep.companyName}: keeping 1 (score ${keep.leadScore}), removing ${duplicates.length}`);
    toDelete.push(...duplicates.map((lead) => lead.id));
  }

  if (toDelete.length === 0) {
    console.log(`No duplicate leads (${leads.length} leads checked).`);
    return;
  }

  if (dryRun) {
    console.log(`DRY RUN: would remove ${toDelete.length} duplicate leads of ${leads.length}.`);
    return;
  }

  const { count } = await prisma.lead.deleteMany({ where: { id: { in: toDelete } } });
  console.log(`Removed ${count} duplicate leads; ${leads.length - count} remain.`);
}

main()
  .catch((error) => {
    console.error('Failed to remove duplicate leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
