import { isInboundLead, isLinkedInLead, leadSource } from '@/lib/sources';

// What kind of buying signal a lead is, for the "Signal type" filter.
export const SIGNAL_TYPES = [
  { value: 'Website enquiry', label: 'Website enquiry' },
  { value: 'Asked for a provider', label: 'Asked for a provider' },
  { value: 'Hiring', label: 'Hiring' },
  { value: 'Funding', label: 'Funding' },
  { value: 'Tender / RFP', label: 'Tender / RFP' },
  { value: 'Project / initiative', label: 'Project / initiative' },
];

export function signalType(lead: any): string {
  const intent = (lead?.intentSignal || '').toLowerCase();
  if (isInboundLead(lead)) return 'Website enquiry';
  if (isLinkedInLead(lead)) return 'Asked for a provider';
  if (intent.includes('tender') || intent.includes('rfp')) return 'Tender / RFP';
  if (intent.includes('funding')) return 'Funding';
  if (intent.includes('hiring') || intent.includes('roles')) return 'Hiring';
  if (leadSource(lead).type === 'Job posting') return 'Hiring';
  return 'Project / initiative';
}

// Where a lead was found, for the "Source" filter.
export const SOURCE_TYPES = ['Website form', 'LinkedIn post', 'Job posting', 'Press release', 'Government RFP', 'Web page'];

export const sourceType = (lead: any): string => leadSource(lead).type;

// Whether the buyer is still choosing a provider (signals.vendorStatus from the
// API, set for press / news / RFP leads). Leads whose vendor status is unclear
// are flagged "Review required" rather than treated as qualified.
export const VENDOR_STATUS_OPTIONS = [
  { value: 'open', label: 'Open requirement' },
  { value: 'review', label: 'Review required' },
  { value: 'other', label: 'Hiring / asked on LinkedIn' },
];

export function vendorStatus(lead: any): 'open' | 'review' | 'other' {
  const status = lead?.signals?.vendorStatus;
  return status === 'open' || status === 'review' ? status : 'other';
}

export const needsReview = (lead: any) => vendorStatus(lead) === 'review';

export const vendorStatusReason = (lead: any): string | null => lead?.signals?.vendorCheck?.reason || null;

// Ideal customer profile check from the API (lead.icp): $10M–$200M revenue,
// established business, CTO / COO / CIO-level contact. Leads clearly outside
// it are hidden by the API; the rest are 'match' or 'unverified'.
export const ICP_OPTIONS = [
  { value: 'match', label: 'Matches ICP' },
  { value: 'unverified', label: 'ICP unverified' },
];

export const icpStatus = (lead: any): string => lead?.icp?.status || 'unverified';
