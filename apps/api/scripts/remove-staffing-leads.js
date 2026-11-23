// Staffing is no longer an Amzur line of business in the lead engine.
// Delete leads tagged with the Staffing LOB or a staffing service.
// Safe to run repeatedly; does nothing once they're gone.
// DRY_RUN=1 lists what would be deleted without deleting.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';

const STAFFING_LEADS = {
  OR: [
    { lob: { equals: 'Staffing', mode: 'insensitive' } },
    { recommendedService: { contains: 'staffing', mode: 'insensitive' } },
  ],
};

async function main() {
  const leads = await prisma.lead.findMany({
    where: STAFFING_LEADS,
    select: { companyName: true, lob: true, recommendedService: true },
  });

  if (leads.length === 0) {
    console.log('No staffing leads to remove.');
    return;
  }

  for (const lead of leads) {
    console.log(`- ${lead.companyName} (${lead.lob} / ${lead.recommendedService})`);
  }

  if (dryRun) {
    console.log(`DRY RUN: would remove ${leads.length} staffing leads.`);
    return;
  }

  const { count } = await prisma.lead.deleteMany({ where: STAFFING_LEADS });
  console.log(`Removed ${count} staffing leads.`);
}

main()
  .catch((error) => {
    console.error('Failed to remove staffing leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
