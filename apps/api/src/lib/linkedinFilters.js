// Decide whether a LinkedIn post is someone asking to BUY a service from a
// provider, as opposed to hiring a person, recruiting, or self-promotion.
// Shared by discovery and scripts/remove-invalid-linkedin-leads.js.

// Asking for a provider: recommendation requests, or looking for a firm/partner.
// "Consultant" alone is deliberately excluded: "looking for an experienced
// FinOps Consultant" is a job ad for a person, not a request for a firm.
const REQUEST =
  /\b(seeking recommendations?|looking for recommendations?|any recommendations|does anyone have (any )?recommendations?|can anyone recommend|could anyone recommend|can you recommend|who (would|do) you recommend|recommend (a|an) (good|reliable|trusted|solid)?\s*[^.?!]{0,40}(partner|vendor|agency|firm|company|provider|consultancy)|looking for (a|an) (good|reliable|trusted|solid|experienced)?\s*[^.?!]{0,40}(implementation partner|consulting (firm|partner|company)|consultancy|partner|vendor|agency|firm|provider|development (company|shop|team))|need (a|an) [^.?!]{0,40}(partner|vendor|agency|firm|consultancy))\b/i;

// Hiring / recruiting language anywhere in the post text.
const HIRING =
  /(#hiring|#nowhiring|#jobs?\b|\bwe('| a)re hiring\b|\bnow hiring\b|\bhiring (for|a|an)\b|\bjob (type|opening|description|title)\b|\bopen (role|position)\b|\bposition:|\blocation:|\bjob type:|\bstart date\b|\b(contract|full[- ]time|part[- ]time|permanent|w2|c2c|onsite|on-site|hybrid|remote) (role|position|opportunity|job)\b|\b(share|send) (your )?(updated )?(resume|cv)\b|\bresumes?\b|\bcandidates?\b|\bapply (now|here|today)\b|\bjoin our team\b|\byears of experience\b|\b(we are|we're|i am|i'm) looking for (an? )?(experienced|skilled|talented|senior|junior|strong|passionate|seasoned)\b|\bwith (strong |deep )?(expertise|experience) in\b|\btalent acquisition\b|\brecruit(er|ers|ing|ment)\b)/i;

// Selling / self-promotion.
const SELF_PROMOTION =
  /(\b(we help|our (team|clients|services|consultants|experts|ai|platform|solution|solutions|product|products|app|tool)|contact us|dm me|book a (call|demo)|reach out to us|we offer|we (build|provide|deliver)|as a (leading|certified)|partner of the year|introducing|top \d+ [^.]{0,40}(companies|firms|partners|providers))\b|looking for recommendations\?)/i;

// Words in the post URL slug that mark a job ad, e.g. /posts/name_hiring-nowhiring-finops-...
const HIRING_URL = /linkedin\.com\/posts\/[^/]*?[_-](hiring|nowhiring|wearehiring|jobs?|jobopening|vacancy|vacancies|recruiting|recruitment|careers?|opening|openings)[-_]/i;

/**
 * @returns {{ ok: boolean, reason?: string }}
 */
function classifyLinkedInPost(url, text) {
  if (HIRING_URL.test(url || '')) return { ok: false, reason: 'job ad (hiring in post URL)' };
  if (HIRING.test(text || '')) return { ok: false, reason: 'job ad / recruiting' };
  if (SELF_PROMOTION.test(text || '')) return { ok: false, reason: 'self-promotion' };
  if (!REQUEST.test(text || '')) return { ok: false, reason: 'not asking for a provider' };
  return { ok: true };
}

module.exports = { classifyLinkedInPost };
