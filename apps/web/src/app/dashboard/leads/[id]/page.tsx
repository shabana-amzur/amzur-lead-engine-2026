'use client';

import { use } from 'react';
import useSWR from 'swr';
import { leadsAPI } from '@/lib/api';
import { lobBadge, lobLabel } from '@/lib/lobs';
import { industryBadge, isPriorityIndustry } from '@/lib/industries';
import { describeSource, hostname, isLinkedInLead } from '@/lib/sources';
import { useRouter } from 'next/navigation';

// Suggested approach and buyer roles per line of business. These are
// playbook suggestions, not data about the company.
const PLAYBOOK: Record<string, { pitch: string; talkingPoints: string[]; contacts: string[] }> = {
  Cloud: {
    pitch: 'Cloud migration and managed cloud operations',
    talkingPoints: [
      'Hiring cloud engineers points to more cloud work than the team can handle. Offer a migration or landing-zone engagement to close the gap now.',
      'Propose a short cloud readiness / cost assessment as a low-risk first step.',
      'Follow with managed cloud operations (monitoring, security, FinOps) once workloads move.',
    ],
    contacts: ['CTO', 'VP Infrastructure', 'Head of Cloud'],
  },
  ERP: {
    pitch: 'NetSuite implementation, optimization and managed administration',
    talkingPoints: [
      'Hiring a NetSuite admin/developer usually means a backlog of customizations and integrations.',
      'Offer managed NetSuite administration so they get a full team instead of one hire.',
      'Lead with a NetSuite health check: scripts, workflows, integrations, reporting.',
    ],
    contacts: ['CFO', 'Controller', 'Director of Business Systems'],
  },
  Solution: {
    pitch: 'DevOps, platform and site reliability engineering',
    talkingPoints: [
      'DevOps / SRE hiring signals scaling pains: CI/CD, infrastructure as code, reliability.',
      'Offer a platform engineering pod to accelerate pipelines, Kubernetes and observability.',
      'Propose a DevOps maturity assessment with a 90-day roadmap.',
    ],
    contacts: ['VP Engineering', 'Head of Platform', 'DevOps Manager'],
  },
  'Application Development': {
    pitch: 'Product and application development teams',
    talkingPoints: [
      'Engineering hiring or new funding means a roadmap that is ahead of team capacity.',
      'Offer a dedicated product engineering squad to ship features in parallel.',
      'Highlight full-stack, mobile and API delivery with a fast start.',
    ],
    contacts: ['CTO', 'VP Engineering', 'Head of Product'],
  },
  'Legacy Modernization': {
    pitch: 'Legacy and mainframe modernization',
    talkingPoints: [
      'COBOL / mainframe hiring shows they depend on legacy systems that are hard to staff.',
      'Offer incremental modernization: re-platforming, API enablement, phased migration.',
      'Propose a legacy portfolio assessment to size risk and quick wins.',
    ],
    contacts: ['CIO', 'Enterprise Architect', 'Head of Core Systems'],
  },
  'Process Automation': {
    pitch: 'RPA, workflow and AI-driven process automation',
    talkingPoints: [
      'Automation hiring signals an automation program that needs to scale.',
      'Offer an automation CoE: process discovery, RPA/UiPath build and AI agents.',
      'Lead with an automation opportunity assessment showing ROI per process.',
    ],
    contacts: ['COO', 'Head of Automation', 'Director of Operations'],
  },
  Offshore: {
    pitch: 'India dedicated teams and global capability centers',
    talkingPoints: [
      'Expanding engineering in India signals appetite for offshore capacity.',
      'Offer dedicated teams or build-operate-transfer for their India center.',
      'Emphasize speed to hire, retention and time-zone coverage.',
    ],
    contacts: ['CTO', 'VP Engineering', 'Head of Global Delivery'],
  },
};

// Technologies worth surfacing when they appear in the source text.
const TECH_KEYWORDS = [
  'AWS', 'Azure', 'GCP', 'Google Cloud', 'Kubernetes', 'Docker', 'Terraform', 'Ansible', 'CI/CD', 'GitHub Actions',
  'Jenkins', 'Datadog', 'Prometheus', 'NetSuite', 'SuiteScript', 'Oracle', 'SAP', 'Salesforce', 'UiPath',
  'Automation Anywhere', 'RPA', 'COBOL', 'Mainframe', '.NET', 'C#', 'Java', 'Python', 'Go', 'Node.js', 'TypeScript',
  'React', 'PostgreSQL', 'Snowflake', 'AI agents', 'LLM',
];

// Phrases typical of companies selling services or products rather than buying.
const VENDOR_PATTERNS =
  /\b(consulting firm|consultancy|IT services|technology services|design and technology services|digital accelerator|systems integrator|solutions provider|leading provider|on behalf of a partner|our clients|helps (companies|enterprises|organizations)|announced the availability|launches|today launched|partnership with|our .{0,20}practice)\b/i;

const NON_PROSPECT_EMAIL_DOMAINS = /(greenhouse\.io|lever\.co|businesswire\.com|prnewswire\.com|techcrunch\.com|sam\.gov|^jobs\.|^careers\.)/i;

const linkedInPeople = (role: string, company: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company}`)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// "3 days ago", "5 months ago", "2 years ago".
function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const { data, error } = useSWR(`/api/leads/${id}`, () => leadsAPI.getById(id));

  const backButton = (
    <button
      onClick={() => router.push('/dashboard')}
      className="text-sm text-gray-600 hover:text-gray-900 font-medium"
    >
      ← Back to Dashboard
    </button>
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">Lead details are currently unavailable.</p>
        {backButton}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading lead details…</div>
      </div>
    );
  }

  const lead = data.lead;
  const signals = lead.signals || {};
  const context: string = signals.searchContext || '';
  const sourceUrl: string | undefined = signals.tavilyUrl;
  const source = describeSource(sourceUrl);
  const playbook = PLAYBOOK[lead.lob];
  const company: string = lead.companyName;
  const fromLinkedIn = isLinkedInLead(lead);
  // Company profile looked up by the API (description, official website, LinkedIn page).
  const profile: {
    description?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    headquarters?: string | null;
    linkedinIndustry?: string | null;
    employees?: number | null;
    founded?: string | null;
  } | null = signals.company || null;
  const companyLinkedIn = profile?.linkedinUrl || null;
  const officialWebsite = profile?.website || null;
  const authorProfileUrl: string | undefined = signals.authorProfileUrl || undefined;
  const postedAt: string | undefined = signals.postedAt || undefined;
  const postedAtSource: string | undefined = signals.postedAtSource || undefined;
  const postedDaysAgo = postedAt ? (Date.now() - new Date(postedAt).getTime()) / 86400000 : null;

  const techMentioned = TECH_KEYWORDS.filter((tech) => {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, 'i').test(context);
  });

  const possibleVendor = VENDOR_PATTERNS.test(context);

  const emailDomain = (lead.outreachEmail || '').split('@')[1] || '';
  const reliableEmail = lead.outreachEmail && !NON_PROSPECT_EMAIL_DOMAINS.test(emailDomain);

  const scoreClass =
    lead.leadScore >= 80
      ? 'bg-emerald-100 text-emerald-800'
      : lead.leadScore >= 65
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-700';

  const actionLink = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-4">{backButton}</div>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{company}</h1>
              {fromLinkedIn && (
                <p className="text-sm text-gray-600 mt-1">
                  Asked on LinkedIn{postedAt ? ` on ${formatDate(postedAt)}` : ''}.
                  Their company isn&apos;t identified yet: check their profile.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${lobBadge(lead.lob)}`}>
                  {lobLabel(lead.lob)}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${industryBadge(lead.industry || 'Other')}`}>
                  {lead.industry || 'Other'}{isPriorityIndustry(lead.industry) ? ' ★ Priority' : ''}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                  {source.type} · {source.where}
                </span>
                <span className="text-gray-500">
                  {postedAt ? `Posted ${formatDate(postedAt)} (${timeAgo(postedAt)})` : `Discovered ${formatDate(lead.discoveredAt)}`}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-semibold ${scoreClass}`}>
                {lead.leadScore}/100
              </div>
              <div className="text-xs text-gray-400 mt-1">Lead score</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={actionLink}>
                📄 View original {source.type.toLowerCase()}
              </a>
            )}
            {fromLinkedIn ? (
              <a
                href={authorProfileUrl || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={actionLink}
              >
                👤 Author&apos;s LinkedIn profile
              </a>
            ) : (
              <a
                href={companyLinkedIn || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={actionLink}
              >
                💼 {companyLinkedIn ? 'LinkedIn page' : 'Find on LinkedIn'}
              </a>
            )}
            {!fromLinkedIn && officialWebsite && (
              <a href={officialWebsite} target="_blank" rel="noopener noreferrer" className={actionLink}>
                🌐 Website
              </a>
            )}
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`"${company}"`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLink}
            >
              🔎 Search the web
            </a>
            <a
              href={`https://news.google.com/search?q=${encodeURIComponent(`"${company}"`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLink}
            >
              📰 Recent news
            </a>
          </div>
        </div>

        {possibleVendor && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Check before outreach:</strong> the source text reads like this company <em>sells</em> services or
            products (for example a consultancy or vendor announcement), so it may be a competitor or partner rather
            than a buyer.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-4">
            {!fromLinkedIn && (
              <section className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">About {company}</h2>
                {profile ? (
                  <>
                    {profile.description ? (
                      <p className="text-gray-800 leading-relaxed">{profile.description}</p>
                    ) : (
                      <p className="text-gray-500 text-sm">No description available.</p>
                    )}
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
                      <div className="flex justify-between sm:justify-start gap-3">
                        <dt className="text-gray-500 w-24 shrink-0">Website</dt>
                        <dd>
                          {officialWebsite ? (
                            <a href={officialWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all">
                              {hostname(officialWebsite)} ↗
                            </a>
                          ) : (
                            <span className="text-gray-400">Not found</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between sm:justify-start gap-3">
                        <dt className="text-gray-500 w-24 shrink-0">LinkedIn</dt>
                        <dd>
                          {companyLinkedIn ? (
                            <a href={companyLinkedIn} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all">
                              {companyLinkedIn.replace(/^https?:\/\/(www\.)?/, '')} ↗
                            </a>
                          ) : (
                            <span className="text-gray-400">Not found</span>
                          )}
                        </dd>
                      </div>
                      {profile.headquarters && (
                        <div className="flex justify-between sm:justify-start gap-3">
                          <dt className="text-gray-500 w-24 shrink-0">Headquarters</dt>
                          <dd className="text-gray-900">{profile.headquarters}</dd>
                        </div>
                      )}
                      {profile.linkedinIndustry && (
                        <div className="flex justify-between sm:justify-start gap-3">
                          <dt className="text-gray-500 w-24 shrink-0">Sector</dt>
                          <dd className="text-gray-900">{profile.linkedinIndustry}</dd>
                        </div>
                      )}
                      {profile.founded && (
                        <div className="flex justify-between sm:justify-start gap-3">
                          <dt className="text-gray-500 w-24 shrink-0">Founded</dt>
                          <dd className="text-gray-900">{profile.founded}</dd>
                        </div>
                      )}
                      {profile.employees ? (
                        <div className="flex justify-between sm:justify-start gap-3">
                          <dt className="text-gray-500 w-24 shrink-0">Employees</dt>
                          <dd className="text-gray-900">~{profile.employees.toLocaleString()} on LinkedIn</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="text-xs text-gray-400 mt-3">From the company&apos;s public LinkedIn / web profile.</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {signals.companyChecked
                      ? 'We couldn’t find a reliable public profile for this company.'
                      : 'Company profile not looked up yet.'}{' '}
                    Use the LinkedIn and web search buttons above.
                  </p>
                )}
              </section>
            )}

            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Where we found this</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-gray-500">Discovery link</dt>
                <dd>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 break-all"
                    >
                      {sourceUrl} ↗
                    </a>
                  ) : (
                    <span className="text-gray-500">Not recorded</span>
                  )}
                </dd>

                <dt className="text-gray-500">Source</dt>
                <dd className="text-gray-900">{source.type} on {source.where}</dd>

                <dt className="text-gray-500">Posted online</dt>
                <dd>
                  {postedAt ? (
                    <>
                      <span className="text-gray-900 font-medium">{formatDate(postedAt)}</span>
                      <span className="text-gray-500"> · {timeAgo(postedAt)}</span>
                      {postedAtSource && <div className="text-xs text-gray-400 mt-0.5">Date from {postedAtSource}</div>}
                      {postedDaysAgo !== null && postedDaysAgo > 365 && (
                        <div className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                          Over a year old: the need may already be met. Confirm it&apos;s still current.
                        </div>
                      )}
                      {postedDaysAgo !== null && postedDaysAgo > 90 && postedDaysAgo <= 365 && source.type === 'Job posting' && (
                        <div className="mt-1 text-xs text-gray-500">
                          Posted over 3 months ago: the role may be filled. Check the link is still live.
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-500">
                      {signals.postedAtChecked ? 'The source doesn’t publish a date' : 'Not looked up yet'}
                    </span>
                  )}
                </dd>

                <dt className="text-gray-500">Found by Lead Engine</dt>
                <dd className="text-gray-900">{formatDate(lead.discoveredAt)}</dd>
              </dl>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Buying signal</h2>
              <p className="text-lg font-medium text-gray-900">⚡ {lead.intentSignal || 'No signal recorded'}</p>
              <p className="text-sm text-gray-600 mt-1">{source.meaning}</p>

              {context && (
                <div className="mt-5">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">What the source says</h3>
                  <blockquote className="border-l-4 border-gray-200 pl-4 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {context.trim()}
                    {context.length >= 500 ? '…' : ''}
                  </blockquote>
                  {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-sm text-blue-600 hover:text-blue-800">
                      Read the full {source.type.toLowerCase()} →
                    </a>
                  )}
                </div>
              )}

              {techMentioned.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Technologies mentioned</h3>
                  <div className="flex flex-wrap gap-2">
                    {techMentioned.map((tech) => (
                      <span key={tech} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {playbook && (
              <section className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Suggested approach</h2>
                <p className="text-gray-900">
                  <span className="text-gray-500">Recommended service:</span>{' '}
                  <span className="font-medium">{lead.recommendedService || playbook.pitch}</span>
                </p>
                <ul className="mt-3 space-y-2 text-sm text-gray-700">
                  {playbook.talkingPoints.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="text-gray-400">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Side column */}
          <div className="space-y-4">
            {playbook && (
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Who to contact</h2>
                {fromLinkedIn && (
                  <div className="mb-3 pb-3 border-b border-gray-100 text-sm">
                    <div className="font-medium text-gray-900">{company}</div>
                    <div className="text-gray-500 text-xs">Asked for this service: reply to the post or message them.</div>
                    {sourceUrl && (
                      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm">
                        Open their post →
                      </a>
                    )}
                    <div className="text-xs text-gray-400 mt-2">Once you know their company, these roles there may also be involved:</div>
                  </div>
                )}
                <ul className="space-y-2">
                  {playbook.contacts.map((role) => (
                    <li key={role} className="flex items-center justify-between text-sm">
                      <span className="text-gray-800">{role}</span>
                      {!fromLinkedIn && (
                        <a
                          href={linkedInPeople(role, company)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Find on LinkedIn →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-3 border-t border-gray-100 text-sm">
                  <div className="text-gray-500 mb-1">Email</div>
                  {reliableEmail ? (
                    <>
                      <a href={`mailto:${lead.outreachEmail}`} className="text-blue-600 hover:text-blue-800 break-all">
                        {lead.outreachEmail}
                      </a>
                      <div className="text-xs text-gray-400 mt-0.5">Guessed general inbox, not verified</div>
                    </>
                  ) : (
                    <div className="text-gray-600">
                      {fromLinkedIn ? 'No email: contact them through LinkedIn.' : 'No reliable email yet. Use the LinkedIn links above.'}
                    </div>
                  )}
                </div>
              </section>
            )}

            {fromLinkedIn && (
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Company</h2>
                <p className="text-sm text-gray-600">
                  Not identified yet. Open the author&apos;s LinkedIn profile to see where they work.
                </p>
              </section>
            )}

            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Discovery details</h2>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">Found by search</dt>
                  <dd className="text-gray-700 font-mono text-xs mt-0.5 break-words">
                    {(lead.source || '').replace(/ \(Tavily\)$/, '') || 'Unknown'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Data source</dt>
                  <dd className="text-gray-900">{signals.dataSource || 'Unknown'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Discovered</dt>
                  <dd className="text-gray-900">{new Date(lead.discoveredAt).toLocaleString()}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
