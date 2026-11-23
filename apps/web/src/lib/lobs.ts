// Lines of business. `value` is what the API stores on each lead (lead.lob);
// keep in sync with SEARCHES in apps/api/src/services/discoveryEngine.js.
export const LOB_OPTIONS = [
  { value: 'Cloud', label: 'Cloud', icon: '☁️', badge: 'bg-blue-100 text-blue-800' },
  { value: 'ERP', label: 'ERP', icon: '📊', badge: 'bg-purple-100 text-purple-800' },
  { value: 'Solution', label: 'Solution Engineering', icon: '💡', badge: 'bg-orange-100 text-orange-800' },
  { value: 'Application Development', label: 'Application Development', icon: '🧩', badge: 'bg-teal-100 text-teal-800' },
  { value: 'Legacy Modernization', label: 'Legacy Modernization', icon: '🏛️', badge: 'bg-amber-100 text-amber-800' },
  { value: 'Process Automation', label: 'Process Automation', icon: '⚙️', badge: 'bg-indigo-100 text-indigo-800' },
  { value: 'Offshore', label: 'Offshore', icon: '🌍', badge: 'bg-pink-100 text-pink-800' },
];

export const LOBS = LOB_OPTIONS.map((option) => option.value);

export const lobLabel = (lob: string) => LOB_OPTIONS.find((option) => option.value === lob)?.label ?? lob;

export const lobBadge = (lob: string) =>
  LOB_OPTIONS.find((option) => option.value === lob)?.badge ?? 'bg-gray-100 text-gray-800';
