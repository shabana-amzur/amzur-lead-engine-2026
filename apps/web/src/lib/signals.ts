import { describeSource, isLinkedInLead } from '@/lib/sources';

// What kind of buying signal a lead is, for the "Signal type" filter.
export const SIGNAL_TYPES = [
  { value: 'Asked for a provider', label: 'Asked for a provider' },
  { value: 'Hiring', label: 'Hiring' },
  { value: 'Funding', label: 'Funding' },
  { value: 'Tender / RFP', label: 'Tender / RFP' },
  { value: 'Project / initiative', label: 'Project / initiative' },
];

export function signalType(lead: any): string {
  const intent = (lead?.intentSignal || '').toLowerCase();
  if (isLinkedInLead(lead)) return 'Asked for a provider';
  if (intent.includes('tender') || intent.includes('rfp')) return 'Tender / RFP';
  if (intent.includes('funding')) return 'Funding';
  if (intent.includes('hiring') || intent.includes('roles')) return 'Hiring';
  if (describeSource(lead?.signals?.tavilyUrl).type === 'Job posting') return 'Hiring';
  return 'Project / initiative';
}

// Where a lead was found, for the "Source" filter.
export const SOURCE_TYPES = ['LinkedIn post', 'Job posting', 'Press release', 'Government RFP', 'Web page'];

export const sourceType = (lead: any): string => describeSource(lead?.signals?.tavilyUrl).type;
