// Re-read press / news / RFP leads for intent (see src/lib/vendorIntent.js):
// - delete those announcing a vendor already selected, a contract awarded, a
//   partnership, a go-live or a case study, or with no technology requirement;
// - flag unclear ones as "Review required" (signals.vendorStatus = 'review');
// - mark genuine open requirements (signals.vendorStatus = 'open').
// Job postings and LinkedIn posts are left alone. Discovery applies the same
// check going forward; this handles leads saved before it existed.
// Safe to run repeatedly (already-checked leads are skipped unless RECHECK=1).
// DRY_RUN=1 lists what would change.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { classifyVendorIntent } = require('../src/lib/vendorIntent');

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === '1';
const recheck = process.env.RECHECK === '1';

const isJobPosting = (url) => /greenhouse\.io|lever\.co|\/\/jobs\./i.test(url || '');

async function main() {
  const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, leadScore: true, signals: true } });
  const candidates = leads.filter((lead) => {
    const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    if (signals.leadType === 'linkedin_post' || isJobPosting(signals.tavilyUrl)) return false;
    return recheck || !signals.vendorCheck;
  });

  const toDelete = [];
  const updates = [];
  for (const lead of candidates) {
    const signals = lead.signals || {};
    const title = signals.sourceTitle || signals.requirement?.headline || '';
    const text = [signals.searchContext, signals.requirement?.summary].filter(Boolean).join(' ');
    const check = await classifyVendorIntent({ title, text, url: signals.tavilyUrl });
    const label = `${lead.companyName} | ${title.slice(0, 90)} -> ${check.decision} (${check.reason})`;
    if (check.decision === 'exclude') {
      toDelete.push(lead.id);
      console.log(`  delete  ${label}`);
      continue;
    }
    const needsReview = check.decision === 'review';
    console.log(`  ${needsReview ? 'review' : 'open  '}  ${label}`);
    updates.push({
      id: lead.id,
      data: {
        // Unclear leads aren't qualified automatically: keep them out of "high intent".
        ...(needsReview && lead.leadScore > 64 ? { leadScore: 64 } : {}),
        signals: {
          ...signals,
          vendorStatus: needsReview ? 'review' : 'open',
          vendorCheck: { status: check.status, reason: check.reason, method: check.method, checkedAt: new Date().toISOString() },
        },
      },
    });
  }

  console.log(
    `${candidates.length} press/news leads checked: ${toDelete.length} to delete, ` +
      `${updates.filter((u) => u.data.signals.vendorStatus === 'review').length} review required, ` +
      `${updates.filter((u) => u.data.signals.vendorStatus === 'open').length} open.`
  );
  if (dryRun) {
    console.log('DRY RUN: nothing changed.');
    return;
  }

  if (toDelete.length) await prisma.lead.deleteMany({ where: { id: { in: toDelete } } });
  for (const update of updates) await prisma.lead.update({ where: { id: update.id }, data: update.data });
  console.log(`Removed ${toDelete.length} leads; updated ${updates.length}.`);
}

main()
  .catch((error) => {
    console.error('Failed to check vendor-selected leads:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
