'use client';

// Lead page panels for website enquiries (leads from the amzur.com form):
// the person who got in touch, and what they read before writing.
import useSWR from 'swr';
import { useState } from 'react';
import { apolloAPI, inboundAPI } from '@/lib/api';
import CompanyIntelligence from '@/components/CompanyIntelligence';
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

export const deviceLabel = (d?: { device?: string | null; os?: string | null; browser?: string | null } | null) => {
  if (!d || (!d.device && !d.os && !d.browser)) return null;
  const software = [d.browser, d.os].filter(Boolean).join(' on ');
  return [d.device, software].filter(Boolean).join(' · ');
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
        {deviceLabel((inbound as any).device) && (
          <div className="flex gap-2">
            <dt className="text-gray-500 w-14 shrink-0">Device</dt>
            <dd className="text-gray-700">{deviceLabel((inbound as any).device)}</dd>
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
                {newSession && (
                  <div className="text-xs text-gray-500">
                    {['New visit', `from ${visit.cameFrom}`, deviceLabel(visit), [visit.city, visit.country].filter(Boolean).join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
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


/**
 * The lead page for a website enquiry: who wrote and what they asked, how they
 * found Amzur (source, device, every page read), their contact details and
 * their company.
 */
export function InboundSummary({
  lead,
  reply,
  onShowFull,
  onChange,
}: {
  lead: any;
  reply: { subject: string; body: string };
  onShowFull: () => void;
  onChange: () => void;
}) {
  const inbound: (Inbound & { device?: any }) | undefined = lead.signals?.inbound;
  const { data } = useSWR(inbound ? `/api/inbound/leads/${lead.id}/journey` : null, () => inboundAPI.journey(lead.id));
  if (!inbound) return null;
  const visits: any[] = data?.visits || [];
  const engaged = visits.reduce((sum, v) => sum + (v.engagedSec || 0), 0);
  const sessions = new Set(visits.map((v) => v.sessionId)).size;
  const location = [inbound.city, inbound.country].filter(Boolean).join(', ');
  const device = deviceLabel(inbound.device) || deviceLabel(visits[visits.length - 1]);
  const enquirer = lead.signals?.apollo?.enquirer;
  const company = inbound.company || (inbound.businessEmail ? lead.companyName : null);
  const companyKnown = !!company;
  const issue = lead.enquiry && lead.enquiry.status !== 'genuine' ? lead.enquiry : null;
  const mailto = `mailto:${inbound.email}?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}`;
  const button = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50';
  const linkedIn =
    enquirer?.linkedinUrl ||
    (inbound.name
      ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([inbound.name, company].filter(Boolean).join(' '))}`
      : null);

  return (
    <div className="space-y-4">
      {/* Who wrote and what they asked */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Website enquiry</div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">
              {inbound.name || inbound.email}
              {company && <span className="text-gray-500 font-normal"> · {company}</span>}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {[when(inbound.submittedAt), `from ${cameFromLabel(inbound.firstTouch)}`, device, location].filter(Boolean).join(' · ')}
            </p>
          </div>
          {issue ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
              {{ internal: 'Internal test', junk: 'Looks like a test or spam', pitch: 'Sales pitch' }[issue.status as string] || 'Check first'}
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-medium">Reply within a few hours</span>
          )}
        </div>

        {issue && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-medium">Not a real enquiry?</span> {issue.reason}. It scores 0
            {issue.status === 'internal' ? ' and is hidden from the dashboard.' : ' and sits at the bottom of the list.'}
          </div>
        )}

        <blockquote className="mt-4 border-l-4 border-emerald-300 bg-emerald-50/40 px-4 py-3 text-[15px] text-gray-900 whitespace-pre-line">
          {inbound.message || '(No message)'}
        </blockquote>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={mailto} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <Icon name="mail" className="w-4 h-4" /> Reply by email
          </a>
          {inbound.phone && (
            <a href={`tel:${inbound.phone.replace(/[^\d+]/g, '')}`} className={button}>
              Call
            </a>
          )}
          {linkedIn && (
            <a href={linkedIn} target="_blank" rel="noopener noreferrer" className={button}>
              <Icon name="user" className="w-4 h-4" /> {enquirer?.linkedinUrl ? 'LinkedIn profile' : 'Find on LinkedIn'}
            </a>
          )}
          <button type="button" onClick={onShowFull} className="ml-auto text-sm text-blue-600 hover:text-blue-800">
            Show full analysis →
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* How they found Amzur */}
          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Their journey</h2>
              {data && visits.length > 0 && (
                <span className="text-xs text-gray-500">
                  {visits.length} page{visits.length === 1 ? '' : 's'} · {sessions} visit{sessions === 1 ? '' : 's'}
                  {engaged ? ` · ${duration(engaged)} reading` : ''}
                </span>
              )}
            </div>
            <JourneySteps inbound={inbound} visits={visits} loaded={!!data} />
          </section>

          {/* Their company */}
          {companyKnown ? (
            <CompanyIntelligence lead={lead} onChange={onChange} showNews={false} />
          ) : (
            <section className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-600">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Company</h2>
              They wrote from a personal email address, so their company isn’t known yet. Look them up in Apollo (Contact)
              to find their employer, or ask in your reply.
            </section>
          )}
        </div>

        {/* The person */}
        <ContactCard lead={lead} inbound={inbound} enquirer={enquirer} location={location} onChange={onChange} />
      </div>
    </div>
  );
}

/** Source → every page read (time, scroll) → the form, with device and location per visit. */
function JourneySteps({ inbound, visits, loaded }: { inbound: any; visits: any[]; loaded: boolean }) {
  type Step = { kind: 'arrive' | 'page' | 'form'; title: string; detail?: string; meta?: string; href?: string };
  const steps: Step[] = [];
  if (visits.length) {
    visits.forEach((visit, index) => {
      if (index === 0 || visits[index - 1].sessionId !== visit.sessionId) {
        steps.push({
          kind: 'arrive',
          title: index === 0 ? `Arrived from ${visit.cameFrom}` : `Came back from ${visit.cameFrom}`,
          detail: [deviceLabel(visit), [visit.city, visit.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined,
          meta: when(visit.at),
        });
      }
      steps.push({
        kind: 'page',
        title: visit.title?.replace(/\s*[|–-]\s*Amzur.*$/i, '') || visit.path,
        detail: visit.path,
        meta: [duration(visit.engagedSec), visit.scrollPct ? `read ${visit.scrollPct}%` : null].filter(Boolean).join(' · ') || undefined,
        href: visit.url,
      });
    });
  } else {
    const touch = inbound.firstTouch;
    steps.push({
      kind: 'arrive',
      title: `Arrived from ${cameFromLabel(touch)}`,
      detail: [deviceLabel(inbound.device), [inbound.city, inbound.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined,
      meta: when(touch?.firstSeenAt),
    });
  }
  steps.push({
    kind: 'form',
    title: 'Sent the contact form',
    detail: inbound.pageTitle || pathOf(inbound.pageUrl),
    meta: when(inbound.submittedAt),
  });

  const dot = { arrive: 'bg-blue-600', page: 'bg-gray-300', form: 'bg-emerald-600' };
  return (
    <>
      <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
        {steps.map((step, index) => (
          <li key={index} className="relative pl-5">
            <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${dot[step.kind]}`} />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              {step.href ? (
                <a href={step.href} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-900 hover:text-blue-700">
                  {step.title}
                </a>
              ) : (
                <span className={`text-sm ${step.kind === 'page' ? 'text-gray-900' : 'font-medium text-gray-900'}`}>{step.title}</span>
              )}
              {step.meta && <span className="text-xs text-gray-500 whitespace-nowrap">{step.meta}</span>}
            </div>
            {step.detail && <div className="text-xs text-gray-500 break-all">{step.detail}</div>}
          </li>
        ))}
      </ol>
      {loaded && !visits.length && (
        <p className="mt-3 text-xs text-gray-500">
          No page history: the visitor declined tracking, or the tracker wasn’t running when they browsed.
        </p>
      )}
    </>
  );
}

/** The person who wrote in, with an Apollo lookup by their email (1 credit). */
function ContactCard({
  lead,
  inbound,
  enquirer,
  location,
  onChange,
}: {
  lead: any;
  inbound: any;
  enquirer: any;
  location: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const found = enquirer && !enquirer.notFound;

  const lookUp = async () => {
    if (!window.confirm(`Look up ${inbound.name || inbound.email} in Apollo? This uses 1 Apollo credit if they are found.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apolloAPI.lookupEnquirer(lead.id);
      onChange();
    } catch (e: any) {
      setError(e?.message || 'Apollo lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3">
      <dt className="text-gray-500 w-20 shrink-0">{label}</dt>
      <dd className="text-gray-900 min-w-0">{value}</dd>
    </div>
  );

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h2>
      <div className="font-medium text-gray-900">{enquirer?.name || inbound.name || inbound.email}</div>
      <div className="text-xs text-gray-500">
        {found ? [enquirer.title, enquirer.organization].filter(Boolean).join(' at ') || 'Title not listed' : inbound.jobTitle || 'Title not given'}
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {row(
          'Email',
          <>
            <a href={`mailto:${inbound.email}`} className="text-blue-600 hover:text-blue-800 break-all">
              {inbound.email}
            </a>
            {!inbound.businessEmail && <div className="text-xs text-amber-700">Personal address</div>}
          </>
        )}
        {row(
          'Phone',
          inbound.phone ? (
            <a href={`tel:${inbound.phone.replace(/[^\d+]/g, '')}`} className="text-blue-600 hover:text-blue-800">
              {inbound.phone}
            </a>
          ) : (
            <span className="text-gray-400">Not given</span>
          )
        )}
        {found && enquirer.linkedinUrl &&
          row(
            'LinkedIn',
            <a href={enquirer.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all">
              Profile ↗
            </a>
          )}
        {found && enquirer.seniority && row('Seniority', <span className="capitalize">{String(enquirer.seniority).replace(/_/g, ' ')}</span>)}
        {row('Location', (found && enquirer.location) || location || <span className="text-gray-400">Unknown</span>)}
        {row('Device', deviceLabel(inbound.device) || <span className="text-gray-400">Not recorded</span>)}
        {row('Marketing', inbound.consentMarketing ? 'Opted in' : 'Not opted in')}
      </dl>

      <div className="mt-4 pt-3 border-t border-gray-100 text-sm">
        {found ? (
          <span className="text-xs text-gray-500">From Apollo, looked up {when(enquirer.revealedAt)}</span>
        ) : enquirer?.notFound ? (
          <span className="text-xs text-gray-500">Apollo has no record of this email (no credit used).</span>
        ) : (
          <button type="button" onClick={lookUp} disabled={busy} className="text-blue-600 hover:text-blue-800 disabled:text-gray-400">
            {busy ? 'Looking up…' : 'Look up in Apollo: title, LinkedIn, employer (1 credit)'}
          </button>
        )}
        {error && <div className="text-xs text-red-700 mt-1">{error}</div>}
      </div>
    </section>
  );
}
