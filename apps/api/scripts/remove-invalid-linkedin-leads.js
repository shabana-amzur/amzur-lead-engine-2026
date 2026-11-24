// Re-check saved LinkedIn-post leads with the current rules
// (src/lib/linkedinFilters.js) and delete those that are job ads, recruiting
// or self-promotion (e.g. a freelancer or agency advertising) rather than
// someone asking to buy a service. Each post is judged on its full public
// text when it can be read (free), else on the search snippet.
// Safe to run repeatedly. DRY_RUN=1 lists what would be deleted.
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { classifyLinkedInPost } = require(path.join(__dirname, '..', 'src', 'lib', 'linkedinFilters.js'));
const { findRequirementDetails } = require(path.join(__dirname, '..', 'src', 'lib', 'requirementDetails.js'));
const { fetchLinkedInPost, requirementFromPost } = require(path.join(__dirname, '..', 'src', 'lib', 'linkedinPost.js'));

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    // The full public post when it can be read: snippets hide job ads and adverts.
    const post = await fetchLinkedInPost(lead.signals.tavilyUrl).catch(() => null);
    await pause(400);
    const verdict = classifyLinkedInPost(lead.signals.tavilyUrl, post ? post.body : lead.signals.searchContext || '');
    if (!verdict.ok) invalid.push({ ...lead, reason: `${verdict.reason}${post ? '' : ' (from the snippet)'}` });
    else valid.push({ ...lead, post });
  }

  // Refresh the requirement (the actual request, in full where readable) and
  // author name of the ones we keep.
  if (!dryRun) {
    for (const lead of valid) {
      const { post } = lead;
      const requirement = post
        ? requirementFromPost(post)
        : await findRequirementDetails(lead.signals.tavilyUrl, { text: lead.signals.searchContext });
      const author = (post && post.author) || authorFromText(lead.signals.searchContext);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...(author && author.includes(' ') ? { companyName: author } : {}),
          signals: {
            ...lead.signals,
            requirement,
            requirementChecked: true,
            ...(author ? { author } : {}),
            ...(post
              ? {
                  linkedinPost: {
                    author: post.author,
                    authorUrl: post.authorUrl,
                    authorFollowers: post.authorFollowers,
                    likes: post.likes,
                    comments: post.comments,
                    postedAt: post.postedAt,
                    hashtags: post.hashtags,
                    isRequest: true,
                    notRequestReason: null,
                    fetchedAt: post.fetchedAt,
                  },
                }
              : {}),
          },
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
