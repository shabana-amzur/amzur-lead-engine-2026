'use client';

// Lead page panels for website enquiries (leads from the amzur.com form):
// the person who got in touch, and what they read before writing.
import useSWR from 'swr';
import { inboundAPI } from '@/lib/api';
import Icon from '@/components/SidebarIcon';

type Inbound = {
  name?: string | null;
  email: string;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  businessEmail?: boolean;
  message?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  submittedAt?: string;
  consentMarketing?: boolean;
  country?: string | null;
  city?: string | null;
  firstTouch?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    referrer?: string | null;
    landingPage?: string | null;
    firstSeenAt?: string | null;
  };
  submissions?: { at: string; message?: string | null; pageUrl?: string | null; pageTitle?: string | null }[];
};

const MEDIUM: Record<string, string> = {
  paid: 'paid ad',
  organic: 'search',
  ai: 'AI assistant',
  social: 'social',
  email: 'email',
  referral: 'link',
  direct: 'direct',
};

export function cameFromLabel(touch?: Inbound['firstTouch']) {
  if (!touch?.source) return 'Unknown';
  if (touch.medium === 'direct') return 'Direct (typed the address or a bookmark)';
  if (touch.medium === 'organic') return `${touch.source} search`;
  if (touch.medium === 'paid') return `${touch.source} (paid ad)`;
  return `${touch.source} (${MEDIUM[touch.medium || ''] || touch.medium})`;
}

const when = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

const duration = (seconds?: number | null) => {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const pathOf = (url?: string | null) => {
  try {
    return url ? new URL(url).pathname : '';
  } catch {
    return url || '';
  }
};

/** Who to contact: the person who filled in the form. */
export function InboundContact({ lead }: { lead: any }) {
  const inbound: Inbound | undefined = lead.signals?.inbound;
  if (!inbound) return null;
  const name = inbound.name || inbound.email;
  const linkedInSearch = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    [inbound.name, inbound.company || (inbound.businessEmail ? lead.companyName : '')].filter(Boolean).join(' ')
  )}`;
  return (
    <div className="mb-4 pb-4 border-b border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-gray-900">{name}</div>
          <div className="text-xs text-gray-500">
            {inbound.jobTitle || 'Title not given'}
            {inbound.company ? ` · ${inbound.company}` : ''}
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium whitespace-nowrap">
          Contacted us
        </span>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-gray-500 w-14 shrink-0">Email</dt>
          <dd>
            <a href={`mailto:${inbound.email}`} className="text-blue-600 hover:text-blue-800 break-all">
              {inbound.email}
            </a>
            {!inbound.businessEmail && <span className="ml-1 text-xs text-amber-700">(personal address)</span>}
          </dd>
        </div>
        {inbound.phone && (
          <div className="flex gap-2">
            <dt className="text-gray-500 w-14 shrink-0">Phone</dt>
            <dd>
              <a href={`tel:${inbound.phone.replace(/[^\d+]/g, '')}`} className="text-blue-600 hover:text-blue-800">
                {inbound.phone}
              </a>
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-gray-500 w-14 shrink-0">Updates</dt>
          <dd className="text-gray-700">
            {inbound.consentMarketing ? 'Agreed to receive communications from Amzur' : 'Did not opt in to marketing emails'}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`mailto:${inbound.email}?subject=${encodeURIComponent('Your enquiry to Amzur')}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Icon name="mail" className="w-3.5 h-3.5" /> Reply by email
        </a>
        {inbound.name && (
          <a
            href={linkedInSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Icon name="user" className="w-3.5 h-3.5" /> Find on LinkedIn
          </a>
        )}
      </div>
    </div>
  );
}

/** Where they came from and every amzur.com page they read, in order. */
export function InboundJourney({ lead }: { lead: any }) {
  const inbound: Inbound | undefined = lead.signals?.inbound;
  const { data, error } = useSWR(inbound ? `/api/inbound/leads/${lead.id}/journey` : null, () => inboundAPI.journey(lead.id));
  if (!inbound) return null;
  const visits: any[] = data?.visits || [];
  const sessions = new Set(visits.map((v) => v.sessionId)).size;
  const engaged = visits.reduce((sum, v) => sum + (v.engagedSec || 0), 0);
  const submissions = inbound.submissions || [];
  const touch = inbound.firstTouch;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Before they got in touch</h2>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
        <div>
          <dt className="text-xs text-gray-500">Came from</dt>
          <dd className="font-medium text-gray-900">{cameFromLabel(touch)}</dd>
          {touch?.campaign && <dd className="text-xs text-gray-500">Campaign: {touch.campaign}</dd>}
        </div>
        <div>
          <dt className="text-xs text-gray-500">First visit</dt>
          <dd className="font-medium text-gray-900">{when(touch?.firstSeenAt) || '–'}</dd>
          {touch?.landingPage && <dd className="text-xs text-gray-500 break-all">on {pathOf(touch.landingPage)}</dd>}
        </div>
        <div>
          <dt className="text-xs text-gray-500">Pages read</dt>
          <dd className="font-medium text-gray-900">
            {data ? `${visits.length} in ${sessions || 1} visit${sessions === 1 ? '' : 's'}` : '…'}
          </dd>
          {engaged > 0 && <dd className="text-xs text-gray-500">{duration(engaged)} reading</dd>}
        </div>
        <div>
          <dt className="text-xs text-gray-500">Form sent</dt>
          <dd className="font-medium text-gray-900">{when(inbound.submittedAt)}</dd>
          <dd className="text-xs text-gray-500 break-all">from {inbound.pageTitle || pathOf(inbound.pageUrl)}</dd>
        </div>
      </dl>

      {error && <p className="text-sm text-gray-500">The page history couldn’t be loaded right now.</p>}
      {data && visits.length === 0 && (
        <p className="text-sm text-gray-500">
          No page history: the visitor declined tracking, or the website tracker wasn’t running when they browsed.
        </p>
      )}
      {visits.length > 0 && (
        <ol className="border-l border-gray-200 ml-1.5 space-y-2">
          {visits.map((visit, index) => {
            const newSession = index === 0 || visits[index - 1].sessionId !== visit.sessionId;
            return (
              <li key={`${visit.at}-${index}`} className="relative pl-4">
                <span className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${newSession ? 'bg-blue-600' : 'bg-gray-300'}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <a href={visit.url} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-blue-700">
                    {visit.title?.replace(/\s*[|–-]\s*Amzur.*$/i, '') || visit.path}
                  </a>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {when(visit.at)}
                    {duration(visit.engagedSec) ? ` · ${duration(visit.engagedSec)}` : ''}
                    {visit.scrollPct ? ` · read ${visit.scrollPct}%` : ''}
                  </span>
                </div>
                {newSession && <div className="text-xs text-gray-500">New visit · from {visit.cameFrom}</div>}
              </li>
            );
          })}
        </ol>
      )}

      {submissions.length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            All enquiries ({submissions.length})
          </h3>
          <ul className="space-y-2 text-sm">
            {submissions
              .slice()
              .reverse()
              .map((sub) => (
                <li key={sub.at}>
                  <span className="text-xs text-gray-500">{when(sub.at)}:</span> {sub.message || '(no message)'}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
