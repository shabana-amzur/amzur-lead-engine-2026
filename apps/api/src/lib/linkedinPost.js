// Read a public LinkedIn post page and turn it into a structured requirement:
// the ask, context, the specific requirement areas they list, what matters
// most to them, their closing question, hashtags, author and engagement.
// Public post pages carry the full post in schema.org data
// (SocialMediaPosting / DiscussionForumPosting), so no login is used. Free. CommonJS so scripts can use it.
const axios = require('axios');

const TIMEOUT_MS = 12000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

const counter = (stats, type) => {
  const found = (Array.isArray(stats) ? stats : [stats]).find((s) => s && String(s.interactionType || '').includes(type));
  return found ? Number(found.userInteractionCount) || 0 : null;
};

// "Lead & Sales Management: Lead distribution, ..." -> { title, detail }
function requirementLine(line) {
  const clean = line.replace(/^[\s•\-*–·▪●◦\d.)]+/, '').trim();
  const labelled = clean.match(/^([A-Z][^:]{2,60}):\s*(.{3,})$/);
  if (labelled) return { title: labelled[1].trim(), detail: labelled[2].trim().replace(/\.$/, '') };
  return clean.length >= 6 ? { title: null, detail: clean.replace(/\.$/, '') } : null;
}

/** Split a post's text into its parts. */
function structurePost(body) {
  const text = (body || '').replace(/\r/g, '').trim();
  const hashtags = [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1)))];
  const withoutTags = text.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
  let lines = withoutTags.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) {
    // A one-paragraph post: split it into sentences.
    lines = lines[0].split(/(?<=[.?!])\s+(?=[A-Z“"(])/).map((l) => l.trim()).filter(Boolean);
  }

  const ask = lines[0] || '';
  const requirements = [];
  const prose = [];
  for (const line of lines.slice(1)) {
    const isListItem = /^[•\-*–·▪●◦]|^\d+[.)]\s/.test(line) || /^[A-Z][^:]{2,60}:\s+\S/.test(line);
    if (isListItem) {
      const item = requirementLine(line);
      if (item) requirements.push(item);
    } else {
      prose.push(line);
    }
  }
  // The closing question ("Which CRM / ERP platforms work best ...?").
  const questionIndex = prose.map((p) => /\?\s*$/.test(p)).lastIndexOf(true);
  const question = questionIndex >= 0 ? prose[questionIndex] : null;
  const rest = prose.filter((_, i) => i !== questionIndex);
  // What matters most to them.
  const isListIntro = (p) => /\b(should cover|should include|should support|needs? to cover|requirements?)\s*:?\s*$/i.test(p);
  const priorities = rest.filter(
    (p) =>
      !isListIntro(p) &&
      /\b(particularly|especially|most important|key (requirement|priority)|must|need to|needs to|priority|looking for|important that|ideally)\b/i.test(p)
  );
  const context = rest
    .filter((p) => !priorities.includes(p) && !isListIntro(p))
    .filter((p) => !/^(would love|any (suggestions|recommendations)|thanks|thank you|please (share|suggest|comment|dm))/i.test(p));
  const listIntro = rest.find(isListIntro) || null;
  return { ask, context, requirements, listIntro, priorities, question, hashtags };
}

/**
 * @param {string} url Public LinkedIn post URL.
 * @returns {Promise<object|null>} null when the page can't be read.
 */
async function fetchLinkedInPost(url) {
  if (!/^https:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/posts\//i.test(url || '')) return null;
  const { data: html } = await axios.get(url, { timeout: TIMEOUT_MS, headers: HEADERS, responseType: 'text', maxRedirects: 3 });
  if (typeof html !== 'string') return null;
  let posting = null;
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      // LinkedIn labels posts as SocialMediaPosting or DiscussionForumPosting.
      posting = items.find((d) => d && ['SocialMediaPosting', 'DiscussionForumPosting', 'Article', 'BlogPosting'].includes(d['@type'])) || posting;
    } catch {
      // not JSON we can read
    }
  }
  if (!posting?.articleBody) return null;
  const author = posting.author || {};
  const stats = posting.interactionStatistic || [];
  return {
    ...structurePost(posting.articleBody),
    body: posting.articleBody.trim(),
    postedAt: posting.datePublished || null,
    author: author.name || null,
    authorUrl: author.url || null,
    authorFollowers: counter(author.interactionStatistic, 'Follow'),
    likes: counter(stats, 'Like'),
    comments: posting.commentCount != null ? Number(posting.commentCount) : counter(stats, 'Comment'),
    fetchedAt: new Date().toISOString(),
  };
}

/** The lead's requirement (shape used by the lead page) from a read post. */
function requirementFromPost(post) {
  const facts = [
    post.author && { label: 'Posted by', value: post.author },
    post.authorFollowers != null && { label: 'Followers', value: post.authorFollowers.toLocaleString('en-US') },
    post.likes != null && { label: 'Likes', value: post.likes.toLocaleString('en-US') },
    post.comments != null && { label: 'Comments', value: post.comments.toLocaleString('en-US') },
  ].filter(Boolean);
  const sections = [];
  if (post.requirements.length) {
    sections.push({
      title: post.listIntro ? post.listIntro.replace(/[:.]\s*$/, '') : 'What they want it to cover',
      bullets: post.requirements.map((r) => (r.title ? `${r.title}: ${r.detail}` : r.detail)),
    });
  }
  if (post.priorities.length) sections.push({ title: 'What matters most to them', bullets: post.priorities });
  if (post.question) sections.push({ title: 'Their question', bullets: [post.question] });
  return {
    kind: 'linkedin',
    headline: post.ask,
    facts,
    summary: post.context.join(' ') || null,
    sections,
    hashtags: post.hashtags,
    from: 'LinkedIn post (full text)',
  };
}

module.exports = { fetchLinkedInPost, requirementFromPost, structurePost };
