// Decide whether a LinkedIn post is someone asking to BUY a service Amzur
// provides, as opposed to hiring a person, recruiting, self-promotion,
// rhetorical posts, or asking for things Amzur doesn't sell.
// Shared by discovery, lead details and scripts/remove-invalid-linkedin-leads.js.

// The ask itself: recommendation requests or looking for a firm/partner.
// "Consultant" alone is excluded: "looking for an experienced FinOps
// Consultant" is a job ad for a person, not a request for a firm.
const ASK =
  /\b(seeking recommendations?|looking for (some )?recommendations?|any recommendations|does anyone have (any )?recommendations?|can anyone recommend|could anyone recommend|can you recommend|who (would|do) you recommend|recommend (a|an) (good|reliable|trusted|solid)?\s*[^.?!]{0,40}(partner|vendor|agency|firm|company|provider|consultancy)|looking for (a |an )?(good|reliable|trusted|solid|experienced)?\s*[^.?!]{0,40}(implementation partner|consulting (firm|partner|company)|consultancy|partner|vendor|agency|firm|provider|development (company|shop|team))|need (a|an) [^.?!]{0,40}(partner|vendor|agency|firm|consultancy)|looking for (some )?(help|support|assistance) (with|for|on)|looking for (an? )?([\w/.+-]+ ){0,3}(app|application|software|web|website|mobile|android|ios|flutter|react native) (development|modernization|modernisation)|looking for (an? )?([\w-]+ ){0,2}(nearshore|offshore) (partner|team|support|resources?|help|vendor|company)|looking for (an? )?(hyper ?automation|automation) (partner|vendor|company|expert|experts|solution|help))\b/i;

// The ask must be about something Amzur sells (checked in the text right after the ask).
const AMZUR_SERVICE =
  /\b(netsuite|erp|sap|s\/?4 ?hana|oracle|dynamics|crm|salesforce|cloud|aws|azure|gcp|google cloud|devops|kubernetes|software|app developers?|app development|mobile app|web app|web development|website development|android|ios app|flutter|react native|application|development (partner|company|team|agency|firm)|developers?|\.net|full[- ]stack|automation|hyper ?automation|rpa|uipath|modernization|modernisation|legacy|mainframe|migration|data (platform|engineering|warehouse|analytics)|ai|machine learning|offshore|nearshore|dedicated (team|developers)|implementation|integration|it (partner|services|consultant|support|provider)|technology (partner|consultant|provider)|tech partner|iot)\b/i;

// Rhetorical or second-hand phrasing around the ask.
const NOT_A_REAL_ASK =
  /\b(how (can|could|do|would) (anyone|you|i) recommend|why (would|do) (anyone|you) recommend|better off looking for recommendations|instead of looking for recommendations|recommendations from [^.?!]{0,40}(customers|users|peers)|posts like|(noticed|seeing|seen) a (growing |new )?trend|i('ve| have) (noticed|seen) (a lot of|many|more)|a lot of (companies|founders|people) (are|keep)|here'?s (why|how|what)|lessons? (learned|from))\b/i;

// Awareness / thought-leadership posts that quote a request as an example
// ("Posts like: 'We're looking for a software development partner'") and then
// give advice. Checked over the whole post: the giveaway is often far below
// the quoted ask.
const AWARENESS =
  /\b(posts like|(noticed|seeing|seen|spotted) (a|this) (growing |new |recent )?(trend|pattern)|at first glance|here are (some |a few |\d+ )?(signals|signs|tips|ways|reasons|red flags|lessons)|don'?t confuse|not every (engagement|post|lead|inquiry|enquiry)|as someone (involved|working|who works) in (outbound |b2b )?(sales|prospecting|business development|marketing)|engagement bait)\b/i;

// Hiring / recruiting language anywhere in the post text.
const HIRING =
  /(#hiring|#nowhiring|#jobs?\b|\bwe('| a)re hiring\b|\bnow hiring\b|\bhiring (for|a|an)\b|\bjob (type|opening|description|title)\b|\bopen (role|position)\b|\bposition:|\blocation:|\bjob type:|\bstart date\b|\b(contract|full[- ]time|part[- ]time|permanent|w2|c2c|onsite|on-site|hybrid|remote) (role|position|opportunity|job)\b|\b(share|send) (your )?(updated )?(resume|cv)\b|\bresumes?\b|\bcandidates?\b|\bapply (now|here|today)\b|\bjoin our team\b|\byears of experience\b|\b(we are|we're|i am|i'm) looking for (an? )?(experienced|skilled|talented|senior|junior|strong|passionate|seasoned)\b|\bwith (strong |deep )?(expertise|experience) in\b|\btalent acquisition\b|\brecruit(er|ers|ing|ment)\b|\bscrum master\b|\bcontract(or)? (role|position)\b)/i;

// Job seekers: "looking for a Flutter developer role", "#opentowork".
const JOB_SEEKER =
  /(#opentowork|#open_to_work|\bopen to work\b|\bopen to (new )?(roles|opportunities|positions)\b|\blooking for (a |an )?(new )?([\w/.+-]+ ){0,4}(job|jobs|role|roles|position|positions|opportunity|opportunities|internship|employment)\b|\bseeking (a |an )?(new )?([\w/.+-]+ ){0,3}(job|role|position|employment)\b)/i;

// Selling / self-promotion.
const SELF_PROMOTION =
  /(\b(we help|our (team|clients|services|consultants|experts|ai|platform|solution|solutions|product|products|app|tool)|contact us|dm me|book a (call|demo)|reach out to us|we offer|we (build|provide|deliver)|we have a|as a (leading|certified)|partner of the year|introducing|\d+\+ (products|projects|clients|apps) (shipped|delivered|built)|top \d+\+? [^.]{0,40}(companies|firms|partners|providers|agencies))\b|looking for recommendations\?)/i;

// A question aimed at the reader ("Need an elite development partner?",
// "Looking for a reliable app developer?") is how agencies advertise, unlike a
// genuine "Can anyone recommend ...?".
const READER_QUESTION = /^(need|looking for|searching for|want|struggling (with|to find))\b[^.?!]{0,90}\?/i;
// Sales copy anywhere in the post.
const SALES_COPY =
  /\b(\d+\+?\s*(years|clients|customers|projects|products|apps|engineers|developers)\b|years of (engineering |industry )?(experience|excellence)|track record|our (portfolio|clients|team of|services|expertise)|we (build|provide|deliver|offer|specialize|help)|book a (call|demo|consultation)|dm (me|us)|get in touch|contact us|visit (our|us)|free consultation|let'?s (talk|connect|build)|(top|best) \d+\+?\s|\d+\+? (companies|firms|agencies|partners|vendors) (worth|to consider|you should|in [A-Z])|worth considering|put together a list|list of (the )?(top|best)|compare their)\b/i;

// Words in the post URL slug that mark a job ad, e.g. /posts/name_hiring-nowhiring-finops-...
const HIRING_URL = /linkedin\.com\/posts\/[^/]*?[_-](hiring|nowhiring|wearehiring|jobs?|jobopening|vacancy|vacancies|recruiting|recruitment|careers?|opening|openings)[-_]/i;

// Page chrome from LinkedIn pages and search snippets.
function cleanPostText(text) {
  return (text || '')
    .replace(/^[^|]{0,80}?['’]s Post\s*-?\s*(LinkedIn)?\s*\/?\s*/i, '')
    .replace(/^[^|]{2,60}\|\s*\d+ comments\s*/i, '') // "Mehul Patel | 37 comments ..."
    .replace(/^[^.|]{0,80}? posted (this|on the)[^.]*?(\.\.\.|\.|…)\s*/i, '')
    .replace(/^[^|]{0,120}\|\s*[^|]{0,60} posted on the( topic)?\s*(\.\.\.|…)?\s*/i, '')
    .replace(/\b(Close menu|Report this (post|comment);?|Like Comment|\d+mo\.?)\b\.?/gi, ' ')
    .replace(/^[A-Z][a-z]+ \d{1,2}, \d{4}\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the ask in the post: the request phrase plus what follows it.
 * Returns { text, index } or null.
 */
function findAsk(text) {
  const clean = cleanPostText(text);
  const match = ASK.exec(clean);
  if (!match) return null;
  // Include a leading "I'm"/"We're"/"Hi network" and up to ~160 chars after the phrase.
  const start = Math.max(0, clean.lastIndexOf(' ', Math.max(0, match.index - 25)));
  const lead = clean.slice(start, match.index);
  const prefix = /\b(i'?m|i am|we'?re|we are|hi|hello|network|friends|everyone)\b/i.test(lead) ? lead.trim() + ' ' : '';
  const after = clean.slice(match.index, match.index + match[0].length + 160);
  const end = after.search(/[.?!](\s|$)/);
  const ask = (prefix + (end > match[0].length ? after.slice(0, end + 1) : after)).trim();
  // The ask up to where the snippet is cut ("..." / "…") or the sentence ends.
  const cut = clean.slice(match.index).search(/(\.\.\.|…|[.?!](\s|$))/);
  const askOnly = cut > 0 ? clean.slice(match.index, match.index + cut) : after;
  return {
    text: ask,
    askOnly,
    before: clean.slice(0, match.index + match[0].length),
    fromAsk: clean.slice(match.index),
    around: clean.slice(Math.max(0, match.index - 60), match.index + match[0].length + 200),
  };
}

/**
 * @returns {{ ok: boolean, reason?: string, ask?: string }}
 */
function classifyLinkedInPost(url, text) {
  if (HIRING_URL.test(url || '')) return { ok: false, reason: 'job ad (hiring in post URL)' };
  if (HIRING.test(text || '')) return { ok: false, reason: 'job ad / recruiting' };
  if (JOB_SEEKER.test(cleanPostText(text))) return { ok: false, reason: 'job seeker' };
  const ask = findAsk(text);
  if (!ask) return { ok: false, reason: SELF_PROMOTION.test(text || '') ? 'self-promotion' : 'not asking for a provider' };
  // Only the author's own text up to the ask: replies from vendors come after it.
  if (SELF_PROMOTION.test(ask.before)) return { ok: false, reason: 'self-promotion' };
  if (NOT_A_REAL_ASK.test(ask.around) || AWARENESS.test(cleanPostText(text))) {
    return { ok: false, reason: 'rhetorical or second-hand' };
  }
  // A question to the reader followed by a sales pitch is an advert.
  if (READER_QUESTION.test(ask.fromAsk) && SALES_COPY.test(cleanPostText(text))) return { ok: false, reason: 'self-promotion' };
  // The service being asked for must be in the ask itself, not elsewhere on the page.
  if (!AMZUR_SERVICE.test(ask.askOnly)) return { ok: false, reason: 'not asking for an Amzur service' };
  return { ok: true, ask: ask.text };
}

module.exports = { classifyLinkedInPost, findAsk, cleanPostText };
