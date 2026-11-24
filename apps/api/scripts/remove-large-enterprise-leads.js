// Delete leads for very large enterprises Amzur can't realistically reach
// (src/config/large-enterprises.json, or more than MAX_COMPANY_EMPLOYEES
// employees in the company profile). Discovery skips these going forward;
// this removes ones saved before that filter existed.
// Safe to run repeatedly. DRY_RUN=1 lists what would be deleted.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { largeEnterpriseReason } = require('../src/lib/largeEnterprise');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, employees: true, signals: true } });
  const toDelete = leads
    .map((lead) => ({
      lead,
      reason: largeEnterpriseReason(lead.companyName, lead.employees ?? lead.signals?.company?.employees ?? null),
    }))
    .filter(({ reason }) => reason);

  if (toDelete.length === 0) {
    console.log(`No large-enterprise leads (${leads.length} leads checked).`);
    return;
  }
  for (const { lead, reason } of toDelete) console.log(`  ${lead.companyName} (${reason})`);

  if (dryRun) {
    console.log(`DRY RUN: would remove ${toDelete.length} of ${leads.length} leads.`);
    return;
  }
  const { count } = await prisma.lead.deleteMany({ where: { id: { in: toDelete.map(({ lead }) => lead.id) } } });
  console.log(`Removed ${count} large-enterprise leads; ${leads.length - count} remain.`);
}

main()
  .catch((error) => {
    console.error('Failed to remove large-enterprise leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
