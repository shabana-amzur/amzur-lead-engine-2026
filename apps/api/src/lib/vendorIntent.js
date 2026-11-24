// Decide what a press release / news item / RFP page actually says about a
// company's need for a technology provider, so only genuine open requirements
// become leads:
//
//   include  The company is inviting vendors (open RFP / RFQ / RFI / tender,
//            "seeking a partner", proposals due) or has an upcoming technology
//            project with no vendor chosen yet.
//   exclude  A vendor is already chosen, a contract awarded, a partnership or
//            agreement announced, a system already live, a case study, or the
//            item isn't a technology requirement at all (funding, acquisitions,
//            product launches, non-technology tenders).
//   review   A technology project is mentioned but whether a vendor has been
//            selected is unclear. Saved, but flagged "Review required" instead
//            of being qualified automatically.
//
// The headline is what the news is about, so a vendor-chosen headline is
// excluded even if the body mentions an RFP ("X selects Y after RFP").
// When OPENAI_API_KEY works, the model reads the item for intent and these
// rules are the fallback. CommonJS so scripts can require it.

// ---- vendor already chosen / engagement done ----
const SELECTED =
  /\b(selects?|selected|chooses|chose|chosen|picks|picked|taps|tapped|appoints?|appointed|engages|engaged|enlists|enlisted|retains|retained|turns to|opts for|onboards|onboarded|standardi[sz]es on|goes with|went with)\b/i;
const AWARDED =
  /\b(awards?|awarded|wins?|won|secures?|secured|lands?|landed|bags?|bagged|clinch(es|ed)?|nabs?|nabbed|receives?|received|grants?|granted)\b[^.]{0,60}\b(contract|deal|tender|bid|order|mandate|project|rfp|engagement|task order|idiq|framework)\b|\bcontract (award|awarded|win)\b|\b(awarded|given) to\b/i;
const PARTNERSHIP =
  /\b(partners? with|partnered with|partnering with|partnership (with|between)|in partnership with|strategic (partnership|alliance|collaboration)|collaborat\w* (with|on)|(keeps?|kept) [^.]{0,40}\bon\b|teams? up with|teamed up with|joins? forces|alliance with|signs?|signed|inks?|inked|enters? into (an? )?(agreement|partnership|contract)|expands? (its )?(partnership|relationship|collaboration|agreement)|renews?|renewed|extends? (its )?(contract|partnership|agreement)|(agreement|deal|contract) with|mou\b|memorandum of understanding)\b/i;
const DONE =
  /\b(goes live|went live|go-live|is now live|completes?|completed|successfully (implements?|implemented|deploys?|deployed|migrates?|migrated|launch(es|ed)?|rolls? out|rolled out|transitions?|transitioned)|implements|implemented|deploys|deployed|adopts|adopted|migrates to|migrated to|moves to|moved to|rolls out|rolled out|transitions to|powered by|leverages|leveraging|transforms? [^.]{0,60}\bwith\b|moderni[sz]es? [^.]{0,60}\bwith\b|expands? [^.]{0,40}\bwith\b|upgrades? to|switches to|replaces? [^.]{0,60}\bwith\b)/i;
const CASE_STUDY = /\b(case study|success story|customer story|customer spotlight|testimonial|how [^.]{0,60}\b(transformed|achieved|reduced|improved|cut|saved|boosted))\b/i;

// ---- inviting vendors / open requirement ----
const OPEN_CALL =
  /\b((launch(es|ed)?|opens?|opened|announces?|starts?|begins?|kicks? off) (a |an |its |the )?.{0,50}?\b(tenders?|rfps?|rfqs?|rfis?|procurement|bidding)\b(?!\s+(tools?|software|platforms?|solutions?|discovery|process|processes|reform|rules|portal|market|experts?|teams?))|request for (proposals?|quotations?|quotes?|information|qualifications|tenders?|bids?)|rf[pqi]s?\b|rfx|invitation (to|for) (tender|bid)|itt\b|invites? (bids?|proposals?|tenders?|quotations?|vendors?|applications? from (vendors|firms|companies)|expressions? of interest|eois?)|calls? for (proposals?|bids?|tenders?|vendors?)|expressions? of interest|\beois?\b|floats? (a |an )?(tender|rfp|rfq|rfi|bid)|tenders? for|tendering for|puts? out (a |an )?(tender|rfp|rfq|rfi)|issues? (a |an )?(tender|rfp|rfq|rfi|solicitation)|releases? (a |an )?(tender|rfp|rfq|rfi|solicitation)|publishes? (a |an )?(tender|rfp|rfq|rfi)|solicitation|procurement (of|for|notice|process)|(proposals?|bids?|quotes?|responses?|submissions?) (are )?(due|invited|sought|requested|welcome)|submission deadline|bid (deadline|closing|due)|closing date|seeks? (bids?|proposals?|vendors?|suppliers?|providers?|partners?|a (technology|implementation|development|it|software|systems integration) (partner|vendor|provider|firm))|seeking (bids?|proposals?|vendors?|suppliers?|providers?|(an? )?[a-z ]{0,30}(partner|vendor|provider|integrator|firm|agency))|looking for (an? )?[a-z ]{0,30}(partner|vendor|provider|integrator|firm|agency|tools?|solutions?|software|system|platform)|requests? (contractor|vendor|industry|supplier) (support|input|proposals?|information|quotes?)|(wants?|eyes|eyeing|plans? to (hire|engage|select|appoint|procure)|to (select|appoint|procure|engage) (an? )?[a-z ]{0,30}(partner|vendor|provider|integrator|firm)))\b/i;

// The open call was cancelled or already closed.
const CLOSED_CALL = /\bno (open )?(tender|rfp|rfq|bid|bidding|procurement)\b|\b(tender|rfp|rfq|rfi|bid|procurement|solicitation)s? (cancel(l)?ed|scrapped|withdrawn|closed|awarded)\b|\bcancels? (the |its )?(tender|rfp|rfq|rfi|procurement)\b/i;

// An upcoming technology project, vendor not mentioned either way.
const PLANNED =
  /\b(plans? to|planning to|to (replace|modernize|modernise|migrate|implement|build|upgrade|overhaul|digiti[sz]e|automate|launch)|will (replace|modernize|modernise|migrate|implement|build|upgrade|overhaul|launch)|evaluating|exploring|considering|budget(s|ed)? (for|to)|allocates?|earmarks?|approves? (funding|budget|plan)|announces? (a |an |its )?(plan|program|programme|initiative|strategy|roadmap|investment)|launches (a |an |its )?(program|programme|initiative|transformation)|digital transformation (program|programme|initiative|plan|strategy)|moderni[sz]ation (program|programme|initiative|plan))\b/i;

// Must be about something Amzur delivers, not solar parks, flats or murals.
const TECHNOLOGY =
  /\b(erp|sap|s\/4 ?hana|oracle|netsuite|dynamics 365|workday|salesforce|crm|cloud|aws|azure|gcp|google cloud|saas|data (platform|centre|center|warehouse|lake|engineering|analytics|management|migration)|analytics|business intelligence|digital transformation|digiti[sz]ation|digital (platform|services|solution|system|portal|public infrastructure)|automation|rpa|ai|a\.i\.|agentic|artificial intelligence|machine learning|ml|gen ?ai|generative|llm|software|application|app|apps|platform|portal|website|web ?site|system integrat\w*|systems? integrator|it (services|systems?|modernization|modernisation|support|infrastructure|managed services|outsourcing|contract|consulting)|information technology|technology (services|partner|solution|modernization|modernisation)|tech|ict|cyber ?security|cyber|network|devops|core banking|core system|legacy|mainframe|moderni[sz]ation|managed services|helpdesk|help desk|service desk|integration|api|database|e-?governance|e-?procurement|ehr|emr|records management|case management|billing system|payroll system|hris|hrms|ecommerce|e-commerce|mobile)\b/i;

// Not about a requirement at all. HARD wins over a planned-project mention
// ("raises $40m to build its data platform"); SOFT only applies when nothing
// suggests an upcoming project (a company launching or expanding its own thing).
const NOT_A_REQUIREMENT_HARD =
  /\b(raises|raised|funding|series [a-f]\b|seed round|investment from|acquires|acquired|acquisition|merger|merges|ipo|earnings|(quarter|q[1-4]|annual|half-year|full-year)[^.]{0,20}results|results for|appoints [^.]{0,30}(ceo|cto|cio|chief|president|director|head)|names [^.]{0,30}(ceo|cto|cio|chief|president|director|head)|wins [^.]{0,30}award|award(s|ed)? (for|at)|recogni[sz]ed|named (a|an|the) (leader|winner|finalist)|finalist|jobs|careers|summit|conference|webinar|expo|edition of|event)\b/i;

// Commentary about RFPs / procurement, or a vendor's product for bidders:
// mentions tenders but nobody is asking for a provider.
const COMMENTARY =
  /\b(challenge the|in the age of|best practices|tips|guide to|lessons|how to|red flags|opinion|op-ed|explainer|uses ai to|bets on|simplif(y|ies) [^.]{0,30}(tender|procurement|bidding|rfp))\b/i;
const NOT_A_REQUIREMENT_SOFT =
  /\b(launches|unveils|introduces|announces (new|the launch)|opens|inaugurates|expands|expansion|grows|enhancements|visitor restrictions)\b/i;

const REASONS = {
  selected: 'Vendor already selected',
  awarded: 'Contract already awarded',
  partnership: 'Announces a partnership or agreement',
  done: 'Technology already implemented / live',
  caseStudy: 'Case study of a completed engagement',
  closed: 'Tender cancelled or closed',
  notTech: 'Not a technology requirement',
  notRequirement: 'No technology requirement stated',
  open: 'Inviting vendors / open RFP',
  planned: 'Upcoming technology project, vendor not stated',
  unclear: 'Vendor selection status unclear',
};

function vendorChosen(text) {
  if (CASE_STUDY.test(text)) return 'caseStudy';
  if (AWARDED.test(text)) return 'awarded';
  if (SELECTED.test(text)) return 'selected';
  if (PARTNERSHIP.test(text)) return 'partnership';
  if (DONE.test(text)) return 'done';
  return null;
}

// Reason text when the headline itself announces a chosen vendor / done deal, else null.
function headlineShowsVendorChosen(title) {
  const key = vendorChosen((title || '').replace(/\s+/g, ' '));
  return key ? REASONS[key] : null;
}

const verdict = (decision, key, extra = {}) => ({ decision, status: key, reason: REASONS[key], method: 'rules', ...extra });

/**
 * Rule-based reading of a headline plus snippet.
 * @param {{ title?: string, text?: string }} item
 * @returns {{ decision: 'include'|'exclude'|'review', status: string, reason: string, method: 'rules' }}
 */
function ruleVendorIntent({ title = '', text = '' } = {}) {
  const headline = (title || '').replace(/\s+/g, ' ').trim();
  const body = (text || '').replace(/\s+/g, ' ').trim();
  const all = `${headline} ${body}`;

  // The headline is the news: a vendor choice there settles it.
  const headlineChosen = vendorChosen(headline);
  if (headlineChosen) return verdict('exclude', headlineChosen);
  if (CLOSED_CALL.test(all)) return verdict('exclude', 'closed');
  if (COMMENTARY.test(headline)) return verdict('exclude', 'notRequirement');

  const isTech = TECHNOLOGY.test(all);
  const openCall = OPEN_CALL.test(headline) || OPEN_CALL.test(body);
  const bodyChosen = vendorChosen(body);

  if (openCall) {
    if (!isTech) return verdict('exclude', 'notTech');
    // An open call in the headline with a vendor mentioned in the body (often an
    // earlier vendor, or a vendor commenting) is worth a human look.
    return bodyChosen ? verdict('review', 'unclear') : verdict('include', 'open');
  }
  if (NOT_A_REQUIREMENT_HARD.test(headline)) return verdict('exclude', 'notRequirement');
  if (bodyChosen) return verdict('exclude', bodyChosen);
  if (!isTech) return verdict('exclude', 'notTech');
  if (PLANNED.test(all)) return verdict('review', 'planned');
  if (NOT_A_REQUIREMENT_SOFT.test(headline)) return verdict('exclude', 'notRequirement');
  return verdict('review', 'unclear');
}

// ---- optional model check ----

let openai = null;
let modelDisabled = !process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_INTENT_MODEL || 'gpt-4o-mini';
const cache = new Map();

// A few at a time: a scan can classify dozens of items at once.
const MAX_CONCURRENT = 4;
let running = 0;
const queue = [];
async function limited(task) {
  if (running >= MAX_CONCURRENT) await new Promise((resolve) => queue.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    queue.shift()?.();
  }
}

const MODEL_STATUSES = {
  open_requirement: ['include', 'open'],
  upcoming_project: ['include', 'planned'],
  vendor_selected: ['exclude', 'selected'],
  contract_awarded: ['exclude', 'awarded'],
  existing_partnership: ['exclude', 'partnership'],
  completed_engagement: ['exclude', 'done'],
  case_study: ['exclude', 'caseStudy'],
  not_technology: ['exclude', 'notTech'],
  not_a_requirement: ['exclude', 'notRequirement'],
  unclear: ['review', 'unclear'],
};

const PROMPT = `You qualify sales leads for Amzur Technologies, a technology services firm (software and application development, cloud, ERP/NetSuite, AI/ML, data engineering, process automation, legacy modernization, cybersecurity, IT services, offshore teams).

Read the news item / press release / procurement notice and decide the buyer's actual intent, not keywords.

status (exactly one):
- open_requirement: the organization is inviting vendors: an open RFP, RFQ, RFI, tender, EOI, call for proposals, or it says it is seeking a provider/partner and has not chosen one.
- upcoming_project: a specific upcoming technology project where the text indicates the vendor is not yet finalized (e.g. "will issue an RFP", "plans to select a partner").
- vendor_selected: the organization has already selected/chosen/appointed a vendor or platform.
- contract_awarded: a contract, tender or bid has been awarded or won.
- existing_partnership: announces a partnership, alliance, agreement, MoU, collaboration or renewal with a provider.
- completed_engagement: the system/project is already implemented, deployed, live or migrated.
- case_study: a case study or success story about a past engagement.
- not_technology: the requirement is not for technology services (construction, energy assets, real estate, goods, events...).
- not_a_requirement: no buying need at all (funding, acquisition, earnings, product launch, hires, awards, opening an office).
- unclear: technology need is mentioned but whether a vendor has been selected cannot be told from the text.

Return only JSON: {"status": "...", "buyer": "<organization that needs the service, or null>", "reason": "<one short sentence>"}`;

async function modelVendorIntent({ title, text }) {
  if (modelDisabled) return null;
  if (!openai) {
    const OpenAI = require('openai');
    openai = new (OpenAI.default || OpenAI)({ apiKey: process.env.OPENAI_API_KEY });
  }
  try {
    const completion = await limited(() =>
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Headline: ${title || '(none)'}\n\nText: ${(text || '').slice(0, 2500) || '(none)'}` },
        ],
      })
    );
    const parsed = JSON.parse(completion.choices[0].message.content || '{}');
    const mapped = MODEL_STATUSES[parsed.status];
    if (!mapped) return null;
    return {
      decision: mapped[0],
      status: mapped[1],
      reason: parsed.reason || REASONS[mapped[1]],
      buyer: parsed.buyer || null,
      method: 'model',
    };
  } catch (error) {
    // Bad key or no access: stop trying for this process and use the rules.
    if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
      modelDisabled = true;
      console.warn(`Vendor-intent model unavailable (${error.status}); using rules.`);
    } else {
      console.warn('Vendor-intent model check failed; using rules:', error.message);
    }
    return null;
  }
}

/**
 * Classify an item. Uses the model when available, otherwise the rules. A
 * vendor-chosen headline is excluded either way.
 * @param {{ title?: string, text?: string, url?: string }} item
 */
async function classifyVendorIntent(item = {}) {
  const key = item.url || `${item.title}|${(item.text || '').slice(0, 200)}`;
  if (cache.has(key)) return cache.get(key);
  const rules = ruleVendorIntent(item);
  let result = rules;
  if (!(rules.decision === 'exclude' && vendorChosen(item.title || ''))) {
    result = (await modelVendorIntent(item)) || rules;
  }
  cache.set(key, result);
  return result;
}

module.exports = { classifyVendorIntent, ruleVendorIntent, headlineShowsVendorChosen };
