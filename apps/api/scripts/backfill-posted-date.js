// Find when each existing lead's source was published online (job posting,
// press release, LinkedIn post) for leads saved before this was recorded.
// Each lead is looked up once (signals.postedAtChecked), so re-running on every
// deploy only processes new gaps. DRY_RUN=1 prints results without saving.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { findPublishedDate } = require(path.join(__dirname, '..', 'src', 'lib', 'publishedDate.js'));

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';
const CONCURRENCY = 8;

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, signals: true } });
  const pending = leads.filter((lead) => {
    const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    return !signals.postedAtChecked;
  });

  if (pending.length === 0) {
    console.log(`Posted-date backfill: nothing to do (${leads.length} leads checked).`);
    return;
  }

  let found = 0;
  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const lead = pending[index++];
      const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
      const published = await findPublishedDate(signals.tavilyUrl);
      if (published) found++;
      console.log(`- ${lead.companyName}: ${published ? `${published.date.slice(0, 10)} (${published.method})` : 'no date'}`);
      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            signals: {
              ...signals,
              postedAt: published ? published.date : null,
              postedAtSource: published ? published.method : null,
              postedAtChecked: true,
            },
          },
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  console.log(
    `Posted-date backfill: found dates for ${found} of ${pending.length} leads${dryRun ? ' (DRY RUN, nothing saved)' : ''}.`
  );
}

main()
  .catch((error) => {
    console.error('Posted-date backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
