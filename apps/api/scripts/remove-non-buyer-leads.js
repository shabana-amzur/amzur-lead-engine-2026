// Delete leads for companies that sell rather than buy (IT services firms,
// vendors, job aggregators, career sites), as listed in
// src/config/non-buyers.json. Discovery skips these companies going forward;
// this removes ones saved before that filter existed.
// Safe to run repeatedly. DRY_RUN=1 lists what would be deleted.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';
const nonBuyers = new Set(require(path.join(__dirname, '..', 'src', 'config', 'non-buyers.json')).companies);

// Must match companyKey() in src/services/discoveryEngine.js.
function companyKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true } });
  const toDelete = leads.filter((lead) => nonBuyers.has(companyKey(lead.companyName)));

  if (toDelete.length === 0) {
    console.log(`No non-buyer leads (${leads.length} leads checked).`);
    return;
  }

  console.log(`Non-buyer leads: ${toDelete.map((lead) => lead.companyName).join(', ')}`);

  if (dryRun) {
    console.log(`DRY RUN: would remove ${toDelete.length} of ${leads.length} leads.`);
    return;
  }

  const { count } = await prisma.lead.deleteMany({ where: { id: { in: toDelete.map((lead) => lead.id) } } });
  console.log(`Removed ${count} non-buyer leads; ${leads.length - count} remain.`);
}

main()
  .catch((error) => {
    console.error('Failed to remove non-buyer leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
