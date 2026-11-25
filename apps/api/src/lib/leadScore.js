// Explainable lead score (0-100), recalculated every time leads are loaded so
// it follows the latest data (ICP checks, Apollo contacts, age). Every point
// has a reason the lead page can show.
//
//   Buying intent        up to 30  website enquiry / open RFP / LinkedIn ask 30, job post 20 with a
//                                  sign of outside help (contract, rollout, partners) else 10,
//                                  other announcement 10, review required 5
//   ICP                  up to 25  match 25, unverified 10
//   Fit with Amzur       up to 15  5 per Amzur service area named in the need
//   Recency              up to 15  15 when posted today, 0 at 20 days
//   Priority industry        5     priority industries in config/industries.json
//                                  (Healthcare, Energy, Retail, F&B manufacturing)
//   Target region            5     USA, UAE, Europe, India or Kenya confirmed
//   Contact found            5     a decision maker's email revealed
// CommonJS so scripts can require it too.
const { LEAD_MAX_AGE_DAYS } = require('../config/recency');
const { isTargetRegion } = require('./geography');
const { assessEnquiry } = require('./inbound');
const industryConfig = require('../config/industries.json');

const PRIORITY_INDUSTRIES = new Set(industryConfig.industries.filter((i) => i.priority).map((i) => i.name));

const SERVICE_AREAS = [
  ['ERP / NetSuite', /\b(netsuite|erp|sap|s\/4 ?hana|oracle|dynamics 365|workday|business central)\b/i],
  ['Cloud', /\b(cloud|aws|azure|gcp|google cloud|data cent(er|re)|migration)\b/i],
  ['Application development', /\b(software|application|app|portal|full[- ]?stack|front[- ]?end|back[- ]?end|mobile|api)\b/i],
  ['Legacy modernization', /\b(legacy|mainframe|cobol|moderni[sz]\w*|system replacement|core (system|banking))\b/i],
  ['Automation / AI', /\b(automation|rpa|uipath|ai|machine learning|llm|agentic|scada)\b/i],
  ['Data', /\b(data (platform|engineering|warehouse|analytics|pipeline)|analytics|business intelligence|snowflake|databricks)\b/i],
  ['DevOps / platform', /\b(devops|sre|kubernetes|terraform|ci\/cd|platform engineer\w*)\b/i],
  ['Integration / IT services', /\b(integrat\w+|managed services|service desk|it services|cyber ?security)\b/i],
];

// Job posts: a plain full-time hire is weak intent (they want an employee).
// These hints suggest outside help: a contract or interim role, a project with
// an end (a migration, an ERP rollout, a go-live), or working with partners.
const JOB_OUTSIDE_HELP = [
  [/\b(contract(-to-hire)?|contractor|fixed[- ]term|interim|temporary|freelance|\d+[- ]month (contract|assignment|project)|project[- ]based|statement of work)\b/i, 'contract or interim role'],
  [/\b((netsuite|sap|s\/4 ?hana|erp|salesforce|dynamics( 365)?|workday|oracle|crm) (implementation|rollout|roll-out|migration|go[- ]live|upgrade)|(implement|roll out|migrate to|move to) (a new |our new )?(netsuite|sap|erp|salesforce|dynamics|workday|crm))\b/i, 'system rollout or migration'],
  [/\b(migrat(e|ing|ion) (from|to|off|of)|moderni[sz](e|ing|ation) (of )?(our|the|a|legacy)|legacy (system|platform|application)s? (replacement|modernization|migration)|go[- ]live|greenfield)\b/i, 'modernization or migration project'],
  [/\b(implementation partners?|systems? integrators?|consultan(t|cy|cies) (partners?|firms?)|outsourc\w+|offshore (team|partner|vendor)s?|managed service providers?|third[- ]party (vendors?|partners?|consultants?))\b/i, 'works with outside partners'],
];

function jobOutsideHelp(lead, signals) {
  const req = signals.requirement || {};
  const text = [
    req.headline,
    req.summary,
    ...(req.sections || []).flatMap((s) => [s.title, ...(s.bullets || [])]),
    ...(req.facts || []).map((f) => `${f.label}: ${f.value}`),
    signals.sourceTitle,
    signals.searchContext,
  ]
    .filter(Boolean)
    .join(' ');
  const found = JOB_OUTSIDE_HELP.find(([pattern]) => pattern.test(text));
  return found ? found[1] : null;
}

function intentPoints(lead, signals) {
  if (signals.vendorStatus === 'review') return [5, 'Vendor status unclear (review required)'];
  if (signals.leadType === 'inbound_form') {
    const { status, reason } = assessEnquiry(signals);
    if (status !== 'genuine') return [0, reason];
    return SERVICE_AREAS.some(([, pattern]) => pattern.test(signals.inbound?.message || ''))
      ? [30, 'Contacted Amzur about a service Amzur sells']
      : [20, 'Contacted Amzur (no specific service named)'];
  }
  if (signals.leadType === 'linkedin_post') return [30, 'Asked publicly for a provider'];
  const text = `${lead.intentSignal || ''} ${signals.sourceTitle || ''}`;
  if (signals.vendorStatus === 'open' || /\b(rfp|rfq|rfi|tender|bids?|proposals?)\b/i.test(text)) return [30, 'Open RFP / tender: vendor not chosen'];
  if (/greenhouse\.io|lever\.co|\/\/jobs\./i.test(signals.tavilyUrl || '') || /^hiring\b/i.test(lead.intentSignal || '')) {
    const hint = jobOutsideHelp(lead, signals);
    return hint ? [20, `Hiring with a sign of outside help (${hint})`] : [10, 'Hiring an employee (no sign they want outside help)'];
  }
  return [10, 'Technology announcement'];
}

/**
 * @param {object} lead Lead row; `icp` (from checkIcp) when already computed.
 * @returns {{ score: number, breakdown: { label: string, points: number, max: number }[] }}
 */
function scoreLead(lead, icp) {
  const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
  const breakdown = [];

  // Internal tests, junk and sales pitches sent through the website form score 0.
  if (signals.leadType === 'inbound_form') {
    const { status, reason } = assessEnquiry(signals);
    if (status !== 'genuine') return { score: 0, breakdown: [{ label: reason, points: 0, max: 100 }] };
  }

  const [intent, intentLabel] = intentPoints(lead, signals);
  breakdown.push({ label: intentLabel, points: intent, max: 30 });

  const icpStatus = icp?.status || 'unverified';
  breakdown.push({
    label: icpStatus === 'match' ? 'Matches the ICP' : icpStatus === 'outside' ? 'Outside the ICP' : 'ICP not verified yet',
    points: icpStatus === 'match' ? 25 : icpStatus === 'outside' ? 0 : 10,
    max: 25,
  });

  const req = signals.requirement || {};
  // A website enquiry is judged on the person's own message, not the page they sent it from.
  const needText =
    signals.leadType === 'inbound_form'
      ? signals.inbound?.message || ''
      : [req.headline, req.summary, ...(req.sections || []).flatMap((s) => s.bullets || []), signals.sourceTitle, signals.searchContext]
          .filter(Boolean)
          .join(' ');
  const areas = SERVICE_AREAS.filter(([, pattern]) => pattern.test(needText)).map(([name]) => name);
  breakdown.push({
    label: areas.length ? `Need matches Amzur services: ${areas.slice(0, 3).join(', ')}` : 'No specific Amzur service named',
    points: Math.min(15, areas.length * 5),
    max: 15,
  });

  const days = signals.postedAt ? (Date.now() - new Date(signals.postedAt).getTime()) / 86400000 : null;
  const recency = days === null ? 0 : Math.max(0, Math.round(15 * (1 - Math.max(0, days) / LEAD_MAX_AGE_DAYS)));
  breakdown.push({
    label: days === null ? 'Posting date unknown' : `Posted ${Math.max(0, Math.floor(days))} day${Math.floor(days) === 1 ? '' : 's'} ago`,
    points: recency,
    max: 15,
  });

  const priority = PRIORITY_INDUSTRIES.has(lead.industry);
  breakdown.push({ label: priority ? `${lead.industry}: priority industry` : 'Not a priority industry', points: priority ? 5 : 0, max: 5 });

  const region = signals.geography;
  const inRegion = isTargetRegion(region);
  breakdown.push({ label: inRegion ? `In a target region (${region})` : 'Region not confirmed', points: inRegion ? 5 : 0, max: 5 });

  const contact = (signals.apollo?.contacts || []).some((c) => c.email);
  breakdown.push({ label: contact ? 'Decision maker’s email revealed' : 'No contact revealed yet', points: contact ? 5 : 0, max: 5 });

  const score = Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0));
  return { score, breakdown };
}

module.exports = { scoreLead, jobOutsideHelp };
