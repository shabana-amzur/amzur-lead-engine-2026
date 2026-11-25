// Describe where a lead came from, based on the URL of the original result.

const JOB_BOARDS: Record<string, string> = {
  'greenhouse.io': 'Greenhouse',
  'lever.co': 'Lever',
};

const NEWS_SITES: Record<string, string> = {
  'businesswire.com': 'Business Wire',
  'prnewswire.com': 'PR Newswire',
  'techcrunch.com': 'TechCrunch',
};

export function hostname(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export type LeadSource = {
  type: 'Job posting' | 'Press release' | 'Government RFP' | 'LinkedIn post' | 'Website form' | 'Web page';
  where: string;
  meaning: string;
};

export function describeSource(url?: string): LeadSource {
  const host = hostname(url);
  const match = (sites: Record<string, string>) =>
    Object.entries(sites).find(([domain]) => host.endsWith(domain))?.[1];

  if (host.endsWith('linkedin.com')) {
    return {
      type: 'LinkedIn post',
      where: 'LinkedIn',
      meaning: 'This person publicly asked for a provider of this service. Their company is not identified yet.',
    };
  }
  const board = match(JOB_BOARDS);
  if (board) return { type: 'Job posting', where: board, meaning: 'The company is hiring for this skill: they have the need now.' };
  if (host.startsWith('jobs.') || host.startsWith('careers.')) {
    return { type: 'Job posting', where: host, meaning: 'The company is hiring for this skill: they have the need now.' };
  }
  const news = match(NEWS_SITES);
  if (news) {
    return { type: 'Press release', where: news, meaning: 'Announced in the news. Check that the company is the one buying, not selling.' };
  }
  if (host.endsWith('contractsfinder.service.gov.uk')) {
    return { type: 'Government RFP', where: 'UK Contracts Finder', meaning: 'An official open call for tender from a UK public buyer.' };
  }
  if (host.endsWith('ted.europa.eu')) {
    return { type: 'Government RFP', where: 'EU TED', meaning: 'An official open call for tender from an EU public buyer.' };
  }
  if (host.endsWith('sam.gov')) {
    return { type: 'Government RFP', where: 'SAM.gov', meaning: 'A public request for proposals: an open buying opportunity.' };
  }
  return { type: 'Web page', where: host || 'Unknown', meaning: 'Found on the web. Verify the signal before outreach.' };
}

export const isLinkedInLead = (lead: any) => lead?.signals?.leadType === 'linkedin_post';

// Someone who contacted Amzur through the form on amzur.com.
export const isInboundLead = (lead: any) => lead?.signals?.leadType === 'inbound_form';

export const INBOUND_SOURCE: LeadSource = {
  type: 'Website form',
  where: 'amzur.com',
  meaning: 'This person contacted Amzur through the website. Reply quickly: they reached out first.',
};

/** Where a lead came from: the website form, or the URL of the original result. */
export const leadSource = (lead: any): LeadSource =>
  isInboundLead(lead) ? INBOUND_SOURCE : describeSource(lead?.signals?.tavilyUrl);
