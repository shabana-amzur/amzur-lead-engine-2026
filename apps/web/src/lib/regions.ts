// Target regions for leads (lead.signals.geography from the API).
export const REGION_OPTIONS = [
  { value: 'USA', label: 'USA', flag: '🇺🇸' },
  { value: 'UAE', label: 'UAE', flag: '🇦🇪' },
  { value: 'Europe', label: 'Europe', flag: '🇪🇺' },
  { value: 'India', label: 'India', flag: '🇮🇳' },
  { value: 'Unknown', label: 'Location unknown', flag: '' },
];

export const leadRegion = (lead: any): string => lead?.signals?.geography || 'Unknown';

export const regionLabel = (region: string) => {
  const option = REGION_OPTIONS.find((o) => o.value === region);
  return option ? `${option.flag ? `${option.flag} ` : ''}${option.label}` : region;
};
