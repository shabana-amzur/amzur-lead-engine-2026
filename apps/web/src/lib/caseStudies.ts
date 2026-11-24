// Amzur case studies, matched to each lead by industry, service and
// technology so reps can quote the closest proof point.
//
// The list starts EMPTY on purpose: add only real, approved Amzur case
// studies. Example entry (fields used for matching):
//
//   {
//     title: 'NetSuite rollout for a multi-entity distributor',
//     client: 'US distributor (name withheld)',
//     industry: 'Manufacturing',           // one of the dashboard industries
//     services: ['ERP'],                   // lead service lines (LOB values)
//     technologies: ['NetSuite', 'Salesforce'],
//     outcome: 'Went live in 14 weeks; month-end close cut from 10 days to 4.',
//     url: 'https://amzur.com/...',        // optional public link
//   },
export type CaseStudy = {
  title: string;
  client?: string;
  industry?: string;
  services: string[];
  technologies?: string[];
  outcome: string;
  url?: string;
};

export const CASE_STUDIES: CaseStudy[] = [];

/** The best-matching case studies for a lead, strongest first (up to 2). */
export function matchCaseStudies(lead: any, themes: string[]): { study: CaseStudy; reasons: string[] }[] {
  const text = [
    lead.signals?.requirement?.headline,
    lead.signals?.sourceTitle,
    lead.signals?.searchContext,
    ...(lead.signals?.apollo?.company?.relevantTech || []),
    ...themes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return CASE_STUDIES.map((study) => {
    const reasons: string[] = [];
    let score = 0;
    if (study.services.includes(lead.lob)) {
      score += 3;
      reasons.push('same service');
    }
    if (study.industry && study.industry === lead.industry) {
      score += 2;
      reasons.push(`same industry (${study.industry})`);
    }
    const tech = (study.technologies || []).filter((t) => text.includes(t.toLowerCase()));
    if (tech.length) {
      score += tech.length;
      reasons.push(`same technology (${tech.join(', ')})`);
    }
    return { study, reasons, score };
  })
    .filter((m) => m.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ study, reasons }) => ({ study, reasons }));
}
