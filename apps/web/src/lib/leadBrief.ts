// Builds a lead-specific "Amzur fit & approach" brief from what the source
// actually says (requirement text, technologies, industry, region, size,
// signal type, vendor status), so two leads in the same service line get
// different, evidence-backed recommendations.
//
// AMZUR_CAPABILITIES describes what Amzur offers for each theme. Keep it in
// line with Amzur's real offerings; it is the only place the brief makes
// claims about Amzur.
import { lobLabel } from '@/lib/lobs';
import { isPriorityIndustry } from '@/lib/industries';
import { isInboundLead, isLinkedInLead } from '@/lib/sources';

// ---------------------------------------------------------------- themes ----

type Theme = {
  id: string;
  label: string; // what they need, in their terms
  short?: string; // the same, for use mid-sentence
  pattern: RegExp;
  capability: string; // how Amzur covers it
  service: string;
  question: string; // a discovery question for this theme
};

const AMZUR_CAPABILITIES: Theme[] = [
  {
    id: 'netsuite',
    short: 'NetSuite',
    label: 'NetSuite',
    pattern: /\b(netsuite|suitescript|suiteflow|suitetalk|suitecommerce)\b/i,
    capability: 'NetSuite implementation, SuiteScript / workflow customization, integrations and ongoing managed administration.',
    service: 'NetSuite & ERP Services',
    question: 'Which NetSuite modules are live today, and what is sitting in the customization / integration backlog?',
  },
  {
    id: 'erp',
    short: 'ERP',
    label: 'ERP platform',
    pattern: /\b(erp|sap|s\/4 ?hana|oracle (fusion|ebs|e-business|financials|cloud erp)|dynamics 365|business central|workday|financial system|accounting system)\b/i,
    capability: 'ERP selection support, implementation, data migration, integrations and post-go-live support.',
    service: 'NetSuite & ERP Services',
    question: 'Is this a replacement of an existing ERP, a first implementation, or an extension of a live system?',
  },
  {
    id: 'crm',
    short: 'CRM',
    label: 'CRM',
    pattern: /\b(crm|salesforce|hubspot|customer relationship)\b/i,
    capability: 'CRM implementation and integration with ERP, billing and customer-facing apps.',
    service: 'Application Development',
    question: 'Which systems does the CRM need to stay in sync with (ERP, billing, marketing, support)?',
  },
  {
    id: 'cloud',
    short: 'cloud infrastructure',
    label: 'Cloud infrastructure / migration',
    pattern: /\b(aws|azure|gcp|google cloud|cloud (migration|infrastructure|platform|services|native|engineer)|landing zone|data cent(er|re)|hosting|lift and shift|re-?platform)\b/i,
    capability: 'Cloud readiness assessment, migration (rehost / re-platform / refactor), landing zones and managed cloud operations with FinOps.',
    service: 'Cloud Migration Services',
    question: 'Which workloads are in scope first, and what is driving the timeline (data-centre exit, cost, scale)?',
  },
  {
    id: 'devops',
    short: 'DevOps',
    label: 'DevOps / platform engineering',
    pattern: /\b(devops|sre|site reliability|kubernetes|k8s|terraform|ansible|ci\/cd|pipelines?|infrastructure as code|observability|platform engineer\w*|docker|helm)\b/i,
    capability: 'Platform engineering pods: CI/CD, infrastructure as code, Kubernetes, observability and on-call support.',
    service: 'Solution Engineering',
    question: 'Where does delivery slow down today: environments, releases, reliability or cloud cost?',
  },
  {
    id: 'data',
    short: 'data engineering',
    label: 'Data engineering / analytics',
    pattern: /\b(data (pipeline|platform|warehouse|lake|engineer\w*|analytics|integration|migration|model\w*)|etl|elt|snowflake|databricks|bigquery|redshift|power bi|tableau|business intelligence|analytics|reporting)\b/i,
    capability: 'Data engineering: pipelines, warehouse / lakehouse build-out, reporting and BI dashboards.',
    service: 'Solution Engineering',
    question: 'What decisions are blocked by data today, and where does that data live?',
  },
  {
    id: 'ai',
    short: 'AI/ML',
    label: 'AI / ML',
    pattern: /\b(ai|artificial intelligence|machine learning|ml|llms?|gen ?ai|generative|agentic|ai agents?|nlp|computer vision|asr|conversational)\b/i,
    capability: 'Applied AI: use-case discovery, LLM and agent development, ML pipelines and putting models into production.',
    service: 'Process Automation',
    question: 'Which use case has a clear owner and measurable outcome, and what data can it use?',
  },
  {
    id: 'realtime',
    short: 'real-time distributed systems',
    label: 'Distributed / real-time systems',
    pattern: /\b(distributed systems?|grpc|streaming|real-?time|latency|low-latency|event-driven|kafka|microservices?|high availability|scal(e|ing) (our|the) infrastructure)\b/i,
    capability: 'Senior backend engineers experienced in microservices, event streaming and latency-sensitive systems.',
    service: 'Application Development',
    question: 'Which services are on the critical path, and what are the latency / uptime targets?',
  },
  {
    id: 'apps',
    short: 'software development',
    label: 'Software / application development',
    pattern: /\b(software (development|engineer\w*)|application development|full[- ]?stack|front[- ]?end|back[- ]?end|web (app|application|portal)|portal|react|angular|node\.?js|typescript|java\b|\.net|c#|python|apis?\b|saas product|new product)\b/i,
    capability: 'Dedicated product engineering squads (full-stack, API, QA) that ship alongside the in-house team.',
    service: 'Application Development',
    question: 'What is on the roadmap for the next two quarters that the current team can’t staff?',
  },
  {
    id: 'mobile',
    short: 'mobile apps',
    label: 'Mobile apps',
    pattern: /\b(mobile (app|application|engineer\w*|development)|ios|android|react native|flutter|swift|kotlin)\b/i,
    capability: 'Native and cross-platform mobile development, from design through app-store release and support.',
    service: 'Application Development',
    question: 'Is this a new app or an existing one, and which platforms and integrations are required?',
  },
  {
    id: 'legacy',
    short: 'legacy modernization',
    label: 'Legacy modernization',
    pattern: /\b(legacy|mainframe|cobol|as\/?400|rpg|modernis\w*|moderniz\w*|system replacement|replace (its|their|the) (system|platform)|core (system|platform|banking)|end[- ]of[- ]life|technical debt)\b/i,
    capability: 'Incremental modernization: portfolio assessment, API enablement, re-platforming and phased migration that keeps the business running.',
    service: 'Legacy Modernization',
    question: 'Which legacy systems carry the most risk (skills, support end dates, cost), and what must stay running during the move?',
  },
  {
    id: 'automation',
    short: 'process automation',
    label: 'Process / workflow automation',
    pattern: /\b(rpa|uipath|automation anywhere|blue prism|power automate|process automation|workflow automation|automat(e|ion) (of|the|their|our|manual)|intelligent automation|scada|plc|pump automation)\b/i,
    capability: 'Process discovery, RPA / workflow builds and AI-assisted automation, measured process by process.',
    service: 'Process Automation',
    question: 'Which processes are most manual today, and how are volumes and error rates measured?',
  },
  {
    id: 'integration',
    short: 'systems integration',
    label: 'Systems integration',
    pattern: /\b(integrat\w+|middleware|systems? integrator|interoperab\w+|hl7|fhir|edi|third-party (platforms?|systems?)|connectors?)\b/i,
    capability: 'Integration engineering across ERP, CRM, contact-centre and line-of-business systems (APIs, middleware, EDI / HL7 / FHIR).',
    service: 'Solution Engineering',
    question: 'Which systems need to talk to each other, and which integrations break most often?',
  },
  {
    id: 'security',
    short: 'cybersecurity',
    label: 'Cybersecurity',
    pattern: /\b(cyber ?security|security (assessment|operations|monitoring)|soc\b|siem|penetration test\w*|vulnerability|zero trust|iam|identity and access)\b/i,
    capability: 'Security assessments, cloud security hardening and secure-by-design engineering practices.',
    service: 'Solution Engineering',
    question: 'Is this driven by an audit or compliance deadline, and which frameworks apply?',
  },
  {
    id: 'managed',
    short: 'managed IT support',
    label: 'Managed IT services / service desk',
    pattern: /\b(managed services?|service desk|help ?desk|it support|it operations|itsm|servicenow|application support|l1|l2|l3)\b/i,
    capability: 'Managed application and IT support with defined SLAs, run from Amzur delivery teams.',
    service: 'Solution Engineering',
    question: 'What are the current SLAs, ticket volumes and support hours required?',
  },
  {
    id: 'offshore',
    short: 'offshore teams',
    label: 'Offshore / extended team',
    pattern: /\b(offshore|dedicated (team|developers)|extended team|global capability cent(er|re)|gcc|team in india|nearshore|staff augmentation)\b/i,
    capability: 'India-based dedicated teams that work as an extension of the in-house team, with overlap hours and a single delivery lead.',
    service: 'India Dedicated Teams',
    question: 'Which skills and how many people are needed, and how many hours of overlap does the team need?',
  },
];

// ---------------------------------------------------------------- context ---

const INDUSTRY_NOTES: Record<string, { angle: string; watch: string }> = {
  Healthcare: {
    angle: 'Healthcare buyers weigh patient-data handling and clinical integrations above speed. Lead with HIPAA-aware delivery and EHR / HL7 / FHIR integration experience.',
    watch: 'Expect security and compliance questionnaires (HIPAA, BAAs) before any engagement.',
  },
  Energy: {
    angle: 'Energy and utility buyers care about uptime, field operations and OT / IT boundaries. Frame the work around reliability and asset data.',
    watch: 'Regulated utilities often buy through formal procurement and approved-vendor lists.',
  },
  'Financial Services': {
    angle: 'Financial-services buyers prioritise risk, auditability and data security. Show controlled delivery, access management and audit trails.',
    watch: 'Vendor risk assessments (SOC 2, data residency) are usually required.',
  },
  'Food & Beverage Manufacturing': {
    angle: 'F&B manufacturers care about lot traceability, food safety (HACCP / FSMA), shelf life, recipe and BOM control, and plant-floor visibility. Lead with ERP / WMS and production-line integration that makes recalls and audits fast.',
    watch: 'Plant shutdown windows, seasonal peaks and food-safety audits drive timing; involve quality and operations, not only IT.',
  },
  Manufacturing: {
    angle: 'Manufacturers respond to plant-floor and supply-chain outcomes: inventory accuracy, production visibility, ERP-to-shop-floor integration.',
    watch: 'Projects are often tied to plant or fiscal-year schedules.',
  },
  'Retail & Consumer': {
    angle: 'Retail buyers think in seasons and customer experience. Tie the work to peak-season readiness and omnichannel data.',
    watch: 'Change freezes around peak trading periods can delay starts.',
  },
  'Public Sector': {
    angle: 'Public-sector buyers follow the procurement rules exactly. Compliance with the RFP format, eligibility criteria and deadlines matters as much as the solution.',
    watch: 'Check eligibility (registration, local presence, turnover, certifications) before investing in a response.',
  },
  Technology: {
    angle: 'Technology companies buy engineering capacity and speed. Lead with senior engineers who can join their stack and rituals quickly.',
    watch: 'They will compare you with hiring directly: be clear on ramp-up time and seniority.',
  },
};

const REGION_NOTES: Record<string, string> = {
  USA: 'US buyer: offer US-hours coverage with India-based delivery for cost efficiency.',
  UAE: 'UAE buyer: India delivery is only 1.5 hours ahead, so the team can work a nearly full shared day.',
  Europe: 'European buyer: India time gives a good working-day overlap. Address GDPR and data residency up front.',
  Kenya: 'Kenyan buyer: India is only 2.5 hours ahead of Nairobi, so most of the working day overlaps. Lead with NetSuite / ERP experience and local-currency (KES) and KRA eTIMS tax compliance.',
  India: 'India-based buyer: teams can be on-site and meet in person, which helps for public-sector and enterprise buyers.',
};

// ---------------------------------------------------------------- helpers ---

const clean = (text: string) => (text || '').replace(/\s+/g, ' ').trim();

// Sentences / bullets from the source, used as evidence, with a weight:
// the headline says most about the need, role bullets next, snippets least.
function weightedEvidence(lead: any): { text: string; weight: number }[] {
  const s = lead.signals || {};
  const req = s.requirement || {};
  const head = [req.headline, s.sourceTitle].filter(Boolean).map((text: string) => ({ text: clean(text), weight: 3 }));
  const bullets = (req.sections || []).flatMap((section: any) => section.bullets || []).map((text: string) => ({ text: clean(text), weight: 2 }));
  const rest = evidenceSnippets(lead).slice(head.length + bullets.length).map((text) => ({ text, weight: 1 }));
  return [...head, ...bullets, ...rest];
}

function evidenceSnippets(lead: any): string[] {
  const s = lead.signals || {};
  const req = s.requirement || {};
  const bullets: string[] = (req.sections || []).flatMap((section: any) => section.bullets || []);
  const sentences = clean([req.summary, s.searchContext].filter(Boolean).join(' '))
    .split(/(?<=[.!?])\s+|\s+\.\.\.\s*|…/)
    .map((part: string) => part.trim())
    .filter((part: string) => part.length > 25);
  return [req.headline, s.sourceTitle, ...bullets, ...sentences].filter(Boolean).map(clean);
}

const clip = (text: string, max = 180) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);

// ---------------------------------------------------------------- the brief -

export type FitRow = { need: string; evidence: string | null; amzur: string };
export type Brief = {
  fit: { level: 'Strong fit' | 'Good fit' | 'Needs qualification'; reasons: string[] };
  summary: string;
  primaryService: string;
  rows: FitRow[];
  angles: string[];
  steps: { title: string; detail: string; when: string }[];
  questions: string[];
  risks: string[];
  contacts: { role: string; why: string }[];
  message: { subject: string; body: string };
  sequence: SequenceStep[];
  incumbent: string | null;
  context: BriefContext;
};

export type SequenceStep = { day: number; channel: 'Email' | 'LinkedIn' | 'Call'; title: string; subject?: string; body: string };
export type BriefContext = {
  kind: SignalKind;
  company: string;
  need: string;
  themes: string[];
  service: string;
  role: string | null;
  hook: string;
};

type SignalKind = 'inbound' | 'rfp' | 'job' | 'linkedin' | 'announcement';

function signalKind(lead: any): SignalKind {
  const s = lead.signals || {};
  if (isInboundLead(lead)) return 'inbound';
  if (isLinkedInLead(lead)) return 'linkedin';
  if (/greenhouse\.io|lever\.co|\/\/jobs\./i.test(s.tavilyUrl || '') || s.requirement?.kind === 'job') return 'job';
  const text = `${lead.intentSignal || ''} ${s.sourceTitle || ''} ${s.requirement?.headline || ''}`;
  if (s.vendorStatus === 'open' || /\b(rfp|rfq|rfi|tender|bids?|proposals?|procurement|solicitation|eoi)\b/i.test(text)) return 'rfp';
  return 'announcement';
}

function roleFromJob(lead: any): string | null {
  const headline = clean(lead.signals?.requirement?.headline || '');
  if (headline) return headline.replace(/\s*[-–|(].*$/, '').trim() || headline;
  const match = (lead.intentSignal || '').match(/^Hiring (.+)$/i);
  return match ? match[1] : null;
}

const sizeLabel = (employees?: number | null) =>
  !employees ? null : employees < 50 ? 'small' : employees < 500 ? 'mid-sized' : employees < 5000 ? 'large' : 'enterprise-scale';

// ICP decision makers (Amzur research): CTO, COO, CIO, VP of Technology, Head
// of Digital Transformation or a senior operational leader delivering change.
// Ordered by who usually owns each kind of work.
const CTO = { role: 'CTO', why: 'Owns the technology roadmap and engineering capacity.' };
const CIO = { role: 'CIO', why: 'Owns business systems, IT budget and vendor decisions.' };
const COO = { role: 'COO', why: 'Owns the operations the change has to improve.' };
const VP_TECH = { role: 'VP of Technology', why: 'Runs delivery day to day and feels the capacity gap.' };
const HEAD_DT = { role: 'Head of Digital Transformation', why: 'Accountable for delivering the change programme.' };
const ICP_CONTACTS: Record<string, { role: string; why: string }[]> = {
  Cloud: [CTO, VP_TECH, CIO],
  ERP: [CIO, COO, HEAD_DT],
  Solution: [CTO, VP_TECH, CIO],
  'Application Development': [CTO, VP_TECH, HEAD_DT],
  'Legacy Modernization': [CIO, CTO, HEAD_DT],
  'Process Automation': [COO, HEAD_DT, CIO],
  Offshore: [CTO, VP_TECH, COO],
};
const ALL_ICP_CONTACTS = [CTO, CIO, COO, VP_TECH, HEAD_DT];

export function buildBrief(lead: any, options: { possibleVendor?: boolean } = {}): Brief {
  const s = lead.signals || {};
  const company: string = lead.companyName;
  const kind = signalKind(lead);
  const evidence = evidenceSnippets(lead);
  const allText = evidence.join(' ');
  const need = clean(s.requirement?.headline || s.sourceTitle || lead.intentSignal || 'a technology need');
  const profile = s.company || {};
  const employees: number | null = lead.employees ?? profile.employees ?? null;
  const size = sizeLabel(employees);
  const region: string = s.geography || 'Unknown';
  const location: string | null = s.location || lead.hq || profile.headquarters || null;
  const industry: string = lead.industry && lead.industry !== 'Other' ? lead.industry : '';
  const postedDays = s.postedAt ? Math.floor((Date.now() - new Date(s.postedAt).getTime()) / 86400000) : null;
  const role = kind === 'job' ? roleFromJob(lead) : null;
  const inboundFirstName: string = kind === 'inbound' ? String(s.inbound?.name || '').trim().split(/\s+/)[0] || '' : '';
  const review = s.vendorStatus === 'review';

  // Themes found in the source, ranked by how strongly the source shows them,
  // each with its strongest line as evidence.
  const weighted = weightedEvidence(lead);
  const themes = AMZUR_CAPABILITIES.map((theme, order) => {
    const hits = weighted.filter((line) => theme.pattern.test(line.text));
    return {
      theme,
      order,
      score: hits.reduce((sum, line) => sum + line.weight, 0),
      quote: hits.sort((a, b) => b.weight - a.weight)[0]?.text || null,
    };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 5);
  const rows: FitRow[] = themes.map(({ theme, quote }) => ({
    need: theme.label,
    evidence: quote ? clip(quote) : null,
    amzur: theme.capability,
  }));
  if (!rows.length) {
    rows.push({
      need: lobLabel(lead.lob),
      evidence: need ? clip(need) : null,
      amzur: `${lead.recommendedService || lobLabel(lead.lob)}: scope the need on a first call, then propose a fixed-scope first phase.`,
    });
  }
  const themeLabels = themes.map((t) => t.theme.short || t.theme.label);
  // The service the source actually asks for: the lead's own service line,
  // unless nothing in the source supports it (e.g. a SCADA tender filed under Cloud).
  const leadService: string = lead.recommendedService || lobLabel(lead.lob);
  const service = themes.length && !themes.some((t) => t.theme.service === leadService) ? themes[0].theme.service : leadService;
  const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
  const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);
  const quoted = (text: string, max: number) => `“${clip(text, max).replace(/[.。]+$/, '')}”`;

  // ---- summary ----
  const descriptor = [size, industry.toLowerCase()].filter(Boolean).join(' ');
  const where = location ? `based in ${location}` : region !== 'Unknown' && region !== 'Other' ? `in ${region}` : '';
  const aside = [descriptor ? `${article(descriptor)} ${descriptor} organization` : '', where].filter(Boolean).join(' ');
  const who = aside ? `, ${aside},` : '';
  const what =
    kind === 'inbound'
      ? `contacted Amzur through amzur.com: ${quoted(need, 140)}`
      : kind === 'rfp'
      ? `has an open call for vendors: ${quoted(need, 140)}`
      : kind === 'job'
        ? `is hiring ${role ? `a ${role}` : 'technical staff'}${themeLabels.length ? `, with the role covering ${themeLabels.slice(0, 3).join(', ')}` : ''}`
        : kind === 'linkedin'
          ? `publicly asked for a provider: ${quoted(need, 140)}`
          : `announced: ${quoted(need, 140)}`;
  const fitLine =
    kind === 'inbound'
      ? `They came to Amzur first, so speed matters most: reply within a few hours, before they contact other providers.`
      : kind === 'job'
      ? `A hire means capacity they don’t have yet. Amzur can supply that capacity faster than recruiting, as ${article(service)} ${service} team rather than one person.`
      : kind === 'rfp'
        ? `The scope matches Amzur’s ${service} offering${themeLabels.length ? ` (${themeLabels.slice(0, 3).join(', ')})` : ''}, and an open call means the vendor isn’t chosen yet.`
        : kind === 'linkedin'
          ? `They are still choosing, so a helpful, specific reply now can make Amzur one of the first options they consider.`
          : `It points to a need for ${service}. Confirm scope and whether a provider is already involved before pitching.`;
  const summary = `${company}${who} ${what}. ${fitLine}`;

  // ---- fit level ----
  const reasons: string[] = [];
  let points = 0;
  if (kind === 'rfp' && !review) { points += 2; reasons.push('Open call for vendors: no provider chosen yet'); }
  if (kind === 'inbound') { points += 3; reasons.push('Contacted Amzur directly through the website'); }
  if (kind === 'linkedin') { points += 2; reasons.push('Asked publicly for a provider'); }
  if (kind === 'job') { points += 1; reasons.push(`Hiring for ${role || 'a technical role'}: capacity gap Amzur can fill`); }
  if (themes.length >= 2) { points += 1; reasons.push(`Need covers ${themes.length} Amzur capabilities (${themeLabels.slice(0, 3).join(', ')})`); }
  else if (themes.length === 1) reasons.push(`Need maps to Amzur’s ${themeLabels[0]} capability`);
  if (region !== 'Unknown' && region !== 'Other') { points += 1; reasons.push(`In a target region (${region})`); }
  if (postedDays !== null && postedDays <= 10) { points += 1; reasons.push(`Fresh: posted ${postedDays === 0 ? 'today' : `${postedDays} day${postedDays === 1 ? '' : 's'} ago`}`); }
  if (isPriorityIndustry(industry)) reasons.push(`${industry === 'Retail & Consumer' ? 'Retail' : industry} is a priority industry for Amzur`);
  if (review) { points -= 2; reasons.push('Vendor status unclear: needs confirming'); }
  const icp = lead.icp;
  if (icp?.status === 'match') { points += 1; reasons.push('Matches ICP ($10M–$200M revenue, established business)'); }
  else if (icp) { points -= 1; reasons.push('ICP not verified yet'); }
  if (options.possibleVendor) { points -= 2; reasons.push('Source reads like a vendor, not a buyer'); }
  const level: Brief['fit']['level'] = points >= 4 ? 'Strong fit' : points >= 2 ? 'Good fit' : 'Needs qualification';

  // ---- angles (why they should pick Amzur) ----
  const angles: string[] = [];
  if (kind === 'job') {
    angles.push(
      `Instead of waiting months to hire${role ? ` a ${role}` : ''}, Amzur can start a vetted engineer or small pod within weeks and scale up or down as the roadmap changes.`
    );
  }
  if (kind === 'rfp') angles.push('Respond with a solution mapped line by line to their stated requirements, plus a phased plan that lowers delivery risk.');
  if (kind === 'inbound') angles.push('They chose to contact Amzur: answer their exact question, refer to the pages they read before getting in touch, and offer a call quickly.');
  if (kind === 'linkedin') angles.push('Be useful first: answer their question with specific options and trade-offs before offering Amzur’s help.');
  if (industry && INDUSTRY_NOTES[industry]) angles.push(INDUSTRY_NOTES[industry].angle);
  if (REGION_NOTES[region]) angles.push(REGION_NOTES[region]);
  // Company intelligence (Apollo profile, recent news), when it has been looked up.
  const intel = s.apollo?.company;
  const relevantTech: string[] = intel?.relevantTech || [];
  if (relevantTech.length) {
    angles.push(
      `Their stack already includes ${relevantTech.slice(0, 4).join(', ')}. Open with Amzur's experience on those platforms (optimization, integration, support) rather than a replacement pitch.`
    );
  }
  const growth12 = intel?.growth?.twelveMonths;
  if (typeof growth12 === 'number' && growth12 >= 10) {
    angles.push(`Headcount grew ${growth12}% in 12 months: systems and teams are likely stretched, so speed and extra capacity resonate.`);
  } else if (typeof growth12 === 'number' && growth12 <= -5) {
    angles.push(`Headcount fell ${Math.abs(growth12)}% in 12 months: lead with cost efficiency and automation rather than headcount-heavy delivery.`);
  }
  if (intel?.funding?.latestDate && Date.now() - new Date(intel.funding.latestDate).getTime() < 365 * 86400000) {
    angles.push(`They raised ${intel.funding.latestStage || 'funding'} in the last year: there is budget, and investors will expect delivery to scale.`);
  }
  const headline = (s.companyNews?.items || [])[0];
  if (headline?.title) {
    angles.push(`Recent news to reference in outreach: “${clip(headline.title, 120)}”.`);
  }
  if (size === 'small' || size === 'mid-sized') angles.push(`As a ${size} company, they benefit from a team that brings its own delivery lead and QA, not just individual contractors.`);

  // ---- steps ----
  const topThemes = themeLabels.slice(0, 2).join(' and ') || service.toLowerCase();
  const steps: Brief['steps'] = [];
  if (review) {
    steps.push({
      title: 'Confirm the vendor is still open',
      detail: `Read the original source and recent news on ${company} to check that no provider has been selected for this work.`,
      when: 'Before outreach',
    });
  }
  if (kind === 'inbound') {
    steps.push(
      {
        title: 'Reply personally',
        detail: `Thank ${inboundFirstName || 'them'} for getting in touch, answer what they asked about ${quoted(need, 80)}, and offer two times for a 20-minute call.`,
        when: 'Within a few hours',
      },
      {
        title: 'Prepare for the call',
        detail: `Check which Amzur pages they read before writing (below), the company profile and the ICP check, so the call starts from what they already looked at.`,
        when: 'Before the call',
      },
      {
        title: 'Discovery call',
        detail: `Confirm scope, timeline, budget and who decides${themeLabels.length ? `, focusing on ${themeLabels.slice(0, 2).join(' and ')}` : ''}.`,
        when: 'Within 2–3 days',
      },
      {
        title: 'Short proposal',
        detail: `Send a scoped first phase with an indicative cost for ${service}, and a relevant case study.`,
        when: 'Within a week of the call',
      }
    );
  } else if (kind === 'rfp') {
    const facts: { label: string; value: string }[] = s.requirement?.facts || [];
    const deadline = facts.find((f) => /due|deadline|closing|submission/i.test(f.label))?.value;
    steps.push(
      {
        title: 'Get the solicitation documents',
        detail: `Download the full RFP / tender from the issuing portal${facts.find((f) => /published by/i.test(f.label)) ? ` (reported by ${facts.find((f) => /published by/i.test(f.label))!.value})` : ''}. Note the submission deadline${deadline ? ` (${deadline})` : ''}, eligibility rules and evaluation criteria.`,
        when: 'Day 1–2',
      },
      {
        title: 'Go / no-go review',
        detail: `Check Amzur meets the eligibility rules and has relevant ${topThemes} references. Decide quickly so the response team has time.`,
        when: 'Day 2–3',
      },
      {
        title: 'Clarifications and pre-bid',
        detail: 'Submit clarification questions before the cut-off and attend any pre-bid meeting. It is the only sanctioned way to talk to the buyer.',
        when: 'Before the question deadline',
      },
      {
        title: 'Proposal',
        detail: `A compliance matrix against every requirement, a solution for ${topThemes}, a phased delivery plan, the named team and relevant case studies${industry ? ` from ${industry.toLowerCase()}` : ''}.`,
        when: 'By the submission deadline',
      }
    );
  } else if (kind === 'job') {
    steps.push(
      {
        title: 'Reach the technology leader, not HR',
        detail: `Contact the CTO or VP of Technology who owns the team${s.requirement?.facts?.find((f: any) => f.label === 'Team') ? ` (${s.requirement.facts.find((f: any) => f.label === 'Team').value})` : ''} about the${role ? ` ${role}` : ''} opening.`,
        when: 'This week',
      },
      {
        title: 'Offer capacity now',
        detail: `Propose 1–3 Amzur engineers with ${topThemes} experience, profiles shared within days, as a bridge or alternative to the hire.`,
        when: 'First call',
      },
      {
        title: 'Start small, then expand',
        detail: 'Run a 4–6 week pilot on one backlog item, then move to a dedicated pod or managed service if it works.',
        when: 'Weeks 2–8',
      }
    );
  } else if (kind === 'linkedin') {
    steps.push(
      {
        title: 'Reply on the post',
        detail: `Comment with 2–3 concrete options for ${quoted(need, 80)} and what to watch for. Don’t pitch.`,
        when: 'Within 24 hours',
      },
      {
        title: 'Direct message',
        detail: `Offer a 20-minute call to understand their requirements${themeLabels.length ? ` (${themeLabels.slice(0, 2).join(', ')})` : ''} and share how similar teams solved it.`,
        when: 'Same day',
      },
      {
        title: 'Find the company',
        detail: 'Check the author’s profile for their employer, size and location before the call.',
        when: 'Before the call',
      },
      {
        title: 'Short proposal',
        detail: `Follow up with a scoped first phase and indicative cost for ${service}.`,
        when: 'Within a week of the call',
      }
    );
  } else {
    steps.push(
      {
        title: 'Validate the initiative',
        detail: `Confirm what ${company} is planning, the timeline and whether a provider is already engaged.`,
        when: 'This week',
      },
      {
        title: 'Point of view',
        detail: `Send a one-page note on how Amzur would approach ${topThemes} for them, with one relevant example.`,
        when: 'Week 1',
      },
      {
        title: 'Assessment offer',
        detail: `Propose a short, fixed-price ${service} assessment as a low-risk first engagement.`,
        when: 'Week 2–3',
      }
    );
  }

  // ---- questions ----
  const questions = [
    ...themes.slice(0, 4).map((t) => t.theme.question),
    kind === 'rfp' ? 'What is the budget range and contract type (fixed price, time & materials, framework)?' : 'What does success look like in the first 90 days, and who signs off?',
    kind === 'job' ? 'Would a contract team that starts in two weeks help while you keep recruiting?' : 'Who else is involved in choosing a provider, and when do you want to decide?',
  ].filter((q, i, all) => all.indexOf(q) === i);

  // ---- risks ----
  const risks: string[] = [];
  if (lead.icp && lead.icp.status !== 'match') risks.push(`ICP not confirmed: ${lead.icp.summary}.`);
  if (review) risks.push(`Vendor status unclear: ${s.vendorCheck?.reason || 'confirm no provider has been selected'}.`);
  if (options.possibleVendor) risks.push('The source text reads like a vendor announcement. They may be a competitor or partner, not a buyer.');
  if (kind === 'job' && postedDays !== null && postedDays > 30) risks.push('Job posted over a month ago: the role may be filled.');
  if (kind === 'job') risks.push('Some teams prefer employees over contractors. Lead with flexibility and speed rather than cost.');
  if (kind === 'rfp') risks.push('Public tenders are often price-driven with strict eligibility. Confirm Amzur qualifies before committing effort.');
  if (kind === 'inbound' && s.inbound && !s.inbound.businessEmail) {
    risks.push('They used a personal email address: confirm their company and role on the first reply or call.');
  }
  if (kind === 'linkedin') {
    const comments = s.linkedinPost?.comments;
    risks.push(
      typeof comments === 'number' && comments >= 30
        ? `A busy post (${comments.toLocaleString('en-US')} comments): many vendors have likely replied already. Stand out with a specific answer to their listed needs, then message them directly.`
        : 'The company isn’t identified yet, and other vendors will reply to the same post. Speed and relevance matter.'
    );
  }
  if (region === 'Unknown') risks.push('Location unknown: confirm the buyer is in a region Amzur serves.');
  if (industry && INDUSTRY_NOTES[industry]) risks.push(INDUSTRY_NOTES[industry].watch);
  if (!profile.website && kind !== 'linkedin' && kind !== 'inbound') risks.push('No verified company website or profile yet. Check the company before outreach.');

  // ---- contacts: ICP decision makers ----
  const contacts: Brief['contacts'] = [];
  for (const contact of [...(ICP_CONTACTS[lead.lob] || []), ...ALL_ICP_CONTACTS]) {
    if (contacts.length >= 4) break;
    if (!contacts.some((c) => c.role === contact.role)) contacts.push(contact);
  }
  if (kind === 'rfp') {
    contacts.push({ role: 'Procurement / contracting officer', why: 'Process contact named in the solicitation. Route clarification questions through them.' });
  }

  // ---- message ----
  const greeting =
    kind === 'inbound'
      ? `Hi ${inboundFirstName || 'there'},`
      : kind === 'linkedin'
        ? `Hi ${company.split(' ')[0]},`
        : `Hi [Name, ${contacts[0]?.role || 'CTO'}],`;
  const hook =
    kind === 'inbound'
      ? `Thank you for contacting Amzur about ${clip(need, 90).replace(/[.]+$/, '')}.`
      : kind === 'rfp'
      ? `I saw ${possessive(company)} call for proposals: ${quoted(need, 110)}.`
      : kind === 'job'
        ? `I noticed ${company} is hiring ${role ? `a ${role}` : 'engineers'}${themeLabels.length ? ` to work on ${themeLabels.slice(0, 2).join(' and ')}` : ''}.`
        : kind === 'linkedin'
          ? `I saw your post asking about ${clip(need.replace(/^(i'?m |we'?re )?(looking for|seeking) (some )?recommendations? (for|on) /i, ''), 90).replace(/[.]+$/, '')}.`
          : `I read about ${company}: ${quoted(need, 110)}.`;
  const offer =
    kind === 'inbound'
      ? `I'd be glad to help. Amzur Technologies works with teams on ${service}${themeLabels.length ? ` (${themeLabels.slice(0, 2).join(', ')})` : ''}, and I can share how similar companies approached it.`
      : kind === 'rfp'
      ? `Amzur Technologies delivers ${service}${themeLabels.length ? `, including ${themeLabels.slice(0, 3).join(', ')}` : ''}, and we're preparing to respond. Could you confirm the right contact for clarification questions?`
      : kind === 'job'
        ? `While you recruit, Amzur Technologies can provide engineers with exactly this experience, usually within a couple of weeks, as a bridge or as a dedicated team.`
        : kind === 'linkedin'
          ? `At Amzur Technologies we help teams with exactly this. Happy to share what has worked for similar companies, with no obligation.`
          : `Amzur Technologies helps organizations with ${service}${themeLabels.length ? ` (${themeLabels.slice(0, 2).join(', ')})` : ''}, and I'd like to understand where you are with it.`;
  const close = kind === 'rfp' ? 'Thank you,' : 'Would a 20-minute call next week be useful?\n\nBest regards,';
  const message = {
    subject:
      kind === 'inbound'
        ? `Your enquiry to Amzur: ${clip(need, 60)}`
        : kind === 'rfp'
        ? `${company}: ${clip(need, 60)}`
        : kind === 'job'
          ? `${role ? `${role} capacity` : 'Engineering capacity'} for ${company}`
          : `${service} for ${company}`,
    body: `${greeting}\n\n${hook} ${offer}\n\n${close}\n[Your name]\nAmzur Technologies`,
  };

  // ---- current vendor / partner mentioned in the source ----
  const incumbent = incumbentSignal(allText, kind);

  // ---- multi-step sequence ----
  const context: BriefContext = { kind, company, need, themes: themeLabels, service, role, hook };
  const sequence = buildSequence(context, message, incumbent);

  return {
    fit: { level, reasons },
    summary,
    primaryService: service,
    rows,
    angles,
    steps,
    questions,
    risks,
    contacts,
    message,
    sequence,
    incumbent,
    context,
  };
}

// ------------------------------------------------------- current vendor ----

// What the source says about providers they already use. Phrases, not
// names: snippets rarely name the incumbent reliably.
function incumbentSignal(text: string, kind: string): string | null {
  const t = text || '';
  if (/\b(manage|managing|oversee|overseeing|coordinate|work with|working with)\b[^.]{0,60}\b(implementation partners?|msps?|managed service providers?|vendors?|outsourc\w+|third[- ]party (partners?|providers?))\b/i.test(t)) {
    return 'The role manages existing implementation partners / managed service providers. Position Amzur as extra capacity or a better-value partner, not a first vendor.';
  }
  if (/\b(incumbent|current (vendor|provider|partner|contract)|existing (vendor|provider|contract|partner)|contract (expires|ends|renewal))\b/i.test(t)) {
    return 'The source mentions a current vendor or contract. Find out when it ends and what isn’t working: lead with a transition plan.';
  }
  if (/\b(replace|replacing|migrat\w+ (from|off)|sunset|end[- ]of[- ]life|moving away from)\b/i.test(t)) {
    return 'They are moving off an existing system or provider. Lead with migration experience and a low-risk cutover plan.';
  }
  if (kind === 'rfp') return 'Public tenders often have an incumbent. Ask in clarifications whether one exists and why the work is being re-tendered.';
  return null;
}

// ------------------------------------------------------------- sequence ----

function buildSequence(ctx: BriefContext, first: { subject: string; body: string }, incumbent: string | null): SequenceStep[] {
  const topics = ctx.themes.slice(0, 2).join(' and ') || ctx.service;
  if (ctx.kind === 'inbound') {
    // They wrote to Amzur: reply the same day, then follow up briefly.
    return [
      { day: 1, channel: 'Email', title: 'Reply (within a few hours)', subject: first.subject, body: first.body },
      {
        day: 1,
        channel: 'Call',
        title: 'Call, if they gave a phone number',
        body: `Thank them for getting in touch about ${quote(ctx.need, 80)}. Ask: what prompted it now, what they use today, the timeline, and who else is involved. Agree a time for a fuller conversation.`,
      },
      {
        day: 3,
        channel: 'Email',
        title: 'Follow-up with something useful',
        subject: `Re: ${first.subject}`,
        body: `Hi [Name],\n\nFollowing up on your enquiry. In case it helps while you plan, teams in a similar position usually start with ${topics}, and the main decisions are scope, timeline and how much to change at once.\n\nWould a 20-minute call this week work?\n\nBest regards,\n[Your name]\nAmzur Technologies`,
      },
      {
        day: 7,
        channel: 'Email',
        title: 'Last check-in',
        subject: `Re: ${first.subject}`,
        body: `Hi [Name],\n\nI didn't want your enquiry to slip through. If the timing has changed, just let me know when suits, and I'll follow up then.\n\nBest regards,\n[Your name]\nAmzur Technologies`,
      },
    ];
  }
  if (ctx.kind === 'rfp') {
    return [
      { day: 1, channel: 'Email', title: 'Clarification contact', subject: first.subject, body: first.body },
      {
        day: 3,
        channel: 'Email',
        title: 'Clarification questions',
        subject: `Questions on ${ctx.company}'s solicitation`,
        body: `Hi [Name],\n\nAhead of our response to ${quote(ctx.need, 90)}, a few questions:\n\n1. Is there an incumbent provider, and why is the work being tendered now?\n2. What budget range and contract type are expected?\n3. Which systems must the solution integrate with?\n\nThank you,\n[Your name]\nAmzur Technologies`,
      },
      {
        day: 10,
        channel: 'Email',
        title: 'Submission confirmation',
        subject: `${ctx.company}: Amzur Technologies response submitted`,
        body: `Hi [Name],\n\nWe've submitted our response for ${quote(ctx.need, 90)}. Happy to present the approach or answer evaluation questions at any point.\n\nThank you,\n[Your name]\nAmzur Technologies`,
      },
    ];
  }
  const hookShort = ctx.hook.replace(/\s+/g, ' ');
  return [
    { day: 1, channel: 'Email', title: 'Intro email', subject: first.subject, body: first.body },
    {
      day: 2,
      channel: 'LinkedIn',
      title: 'Connection note (under 300 characters)',
      body: clip(`Hi [Name]. ${hookShort} Amzur helps teams with ${topics}. Would be glad to connect.`, 290),
    },
    {
      day: 5,
      channel: 'Email',
      title: 'Follow-up with value',
      subject: `Re: ${first.subject}`,
      body: `Hi [Name],\n\nFollowing up with something useful: teams in this position usually get stuck on ${topics}. ${
        incumbent ? 'Where a partner is already in place, we often start with a focused piece of work alongside them. ' : ''
      }We typically start with a short, fixed-scope first phase so you can judge the fit before committing.\n\nWorth a 20-minute call?\n\n[Your name]\nAmzur Technologies`,
    },
    {
      day: 8,
      channel: 'Call',
      title: 'Call script',
      body: `Opener: "${ctx.hook}"\nWhy call: Amzur delivers ${ctx.service}${ctx.themes.length ? ` (${ctx.themes.slice(0, 3).join(', ')})` : ''}.\nAsk: "What's the biggest blocker on this right now, and how are you staffing it?"\nIf interested: offer a 20-minute scoping call with an Amzur solution lead.\nIf not now: ask when to check back and who else owns it.`,
    },
    {
      day: 14,
      channel: 'Email',
      title: 'Close the loop',
      subject: `Closing the loop: ${ctx.company}`,
      body: `Hi [Name],\n\nI haven't heard back, so I'll assume the timing isn't right. If ${topics} becomes a priority, I'm one reply away.\n\nBest regards,\n[Your name]\nAmzur Technologies`,
    },
  ];
}

const quote = (text: string, max: number) => `“${clip(text, max).replace(/[.]+$/, '')}”`;

// ------------------------------------------------- per-person messaging ----

// "a" or "an" by sound, including acronyms ("an SVP", "a VP", "an MD").
function articleFor(text: string): string {
  const word = (text || '').trim().split(/[\s,]+/)[0] || '';
  if (/^[A-Z]{2,5}$/.test(word)) return /^[AEFHILMNORSX]/.test(word) ? 'an' : 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export type Persona = 'technology' | 'it' | 'operations' | 'transformation' | 'executive';

export function personaOf(title: string | null | undefined): Persona {
  const t = (title || '').toLowerCase();
  if (/\b(digital|transformation|innovation)\b/.test(t)) return 'transformation';
  if (/\b(cio|information|it\b|systems|infrastructure)\b/.test(t)) return 'it';
  if (/\b(coo|operat\w+|supply chain|logistics)\b/.test(t)) return 'operations';
  if (/\b(cto|technology|technical|engineering|product|platform|software|data|ai)\b/.test(t)) return 'technology';
  return 'executive';
}

const PERSONA_ANGLE: Record<Persona, string> = {
  technology: 'add senior engineering capacity quickly, without slowing your roadmap or lowering the bar',
  it: 'keep core systems reliable and integrated while the change happens, with clear SLAs and security',
  operations: 'cut manual effort and cost in the processes your teams run every day',
  transformation: 'deliver the programme on time with a partner that owns outcomes, not just hours',
  executive: 'get this done faster and at lower risk than building the team from scratch',
};

/** Email and LinkedIn note for one named contact, angled to their role. */
export function personaOutreach(brief: Brief, contact: { name?: string | null; title?: string | null }) {
  const ctx = brief.context;
  const firstName = (contact.name || '').split(' ')[0] || '[Name]';
  const persona = personaOf(contact.title);
  const angle = PERSONA_ANGLE[persona];
  const topics = ctx.themes.slice(0, 2).join(' and ') || ctx.service;
  const email = {
    subject: brief.message.subject,
    body: `Hi ${firstName},\n\n${ctx.hook} As ${contact.title ? `${articleFor(contact.title)} ${contact.title}` : 'a leader there'}, you're probably weighing how to ${angle}.\n\nAmzur Technologies helps teams with ${topics}${ctx.kind === 'job' ? ', and can add experienced people within a couple of weeks' : ''}. Would a 20-minute call next week be useful?\n\nBest regards,\n[Your name]\nAmzur Technologies`,
  };
  const linkedin = clip(`Hi ${firstName}. ${ctx.hook} Amzur helps ${persona === 'operations' ? 'operations' : 'technology'} leaders ${angle.split(',')[0]}. Glad to connect.`, 290);
  return { persona, email, linkedin };
}

// ------------------------------------------------------- RFP deadline ----

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
/** A submission deadline stated in the source text, as YYYY-MM-DD, or null. */
export function findDeadline(text: string, postedAt?: string | null): string | null {
  const m = (text || '').match(
    new RegExp(`\\b(?:due|deadline|closing date|closes|submission[^.]{0,20}by|submit[^.]{0,20}by|bids?[^.]{0,20}by|proposals?[^.]{0,20}by)\\b[^.]{0,20}?\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i')
  );
  if (!m) return null;
  const base = postedAt ? new Date(postedAt) : new Date();
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase().slice(0, 3));
  let year = m[3] ? parseInt(m[3], 10) : base.getFullYear();
  const date = new Date(Date.UTC(year, month, parseInt(m[2], 10)));
  if (!m[3] && date.getTime() < base.getTime() - 7 * 86400000) date.setUTCFullYear(++year);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// ------------------------------------------------------- why-now events ----

export type TimelineEvent = { date: string; label: string; detail?: string; url?: string; kind: 'source' | 'news' | 'funding' | 'found' | 'contact' | 'workflow' };

/** Dated signals about this company, newest first. */
export function buildTimeline(lead: any): TimelineEvent[] {
  const s = lead.signals || {};
  const events: TimelineEvent[] = [];
  if (s.postedAt) {
    events.push({ date: s.postedAt, kind: 'source', label: lead.intentSignal || 'Requirement posted', detail: s.requirement?.headline || s.sourceTitle, url: s.tavilyUrl });
  }
  for (const item of s.companyNews?.items || []) {
    if (item.date) events.push({ date: item.date, kind: 'news', label: 'In the news', detail: item.title, url: item.url });
  }
  const funding = s.apollo?.company?.funding;
  if (funding?.latestDate) events.push({ date: funding.latestDate, kind: 'funding', label: `Raised ${funding.latestStage || 'funding'}` });
  if (lead.discoveredAt) events.push({ date: lead.discoveredAt, kind: 'found', label: 'Found by the Lead Discovery Engine' });
  for (const c of s.apollo?.contacts || []) {
    if (c.revealedAt) events.push({ date: c.revealedAt, kind: 'contact', label: `Contact revealed: ${c.name}`, detail: c.title || undefined });
  }
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
