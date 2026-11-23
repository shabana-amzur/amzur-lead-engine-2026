// Industries detected by the API (lead.industry). Keep names in sync with
// apps/api/src/config/industries.json. Priority industries are listed first.
export const INDUSTRY_OPTIONS = [
  { value: 'Healthcare', label: 'Healthcare', icon: '🏥', priority: true, badge: 'bg-rose-100 text-rose-800' },
  { value: 'Energy', label: 'Energy', icon: '⚡', priority: true, badge: 'bg-yellow-100 text-yellow-800' },
  { value: 'Financial Services', label: 'Financial Services', icon: '🏦', priority: false, badge: 'bg-gray-100 text-gray-700' },
  { value: 'Manufacturing', label: 'Manufacturing', icon: '🏭', priority: false, badge: 'bg-gray-100 text-gray-700' },
  { value: 'Retail & Consumer', label: 'Retail & Consumer', icon: '🛍️', priority: false, badge: 'bg-gray-100 text-gray-700' },
  { value: 'Public Sector', label: 'Public Sector', icon: '🏛️', priority: false, badge: 'bg-gray-100 text-gray-700' },
  { value: 'Technology', label: 'Technology', icon: '💻', priority: false, badge: 'bg-gray-100 text-gray-700' },
  { value: 'Other', label: 'Other', icon: '•', priority: false, badge: 'bg-gray-50 text-gray-500' },
];

export const PRIORITY_INDUSTRIES = INDUSTRY_OPTIONS.filter((option) => option.priority);

export const industryBadge = (industry: string) =>
  INDUSTRY_OPTIONS.find((option) => option.value === industry)?.badge ?? 'bg-gray-50 text-gray-500';

export const isPriorityIndustry = (industry: string) =>
  INDUSTRY_OPTIONS.some((option) => option.value === industry && option.priority);
