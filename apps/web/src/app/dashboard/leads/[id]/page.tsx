'use client';

import { use } from 'react';
import useSWR from 'swr';
import { leadsAPI } from '@/lib/api';
import { lobBadge, lobLabel } from '@/lib/lobs';
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

const JOB_BOARDS: Record<string, string> = {
  'greenhouse.io': 'Greenhouse',
  'lever.co': 'Lever',
};
const NEWS_SITES: Record<string, string> = {
  'businesswire.com': 'Business Wire',
  'prnewswire.com': 'PR Newswire',
  'techcrunch.com': 'TechCrunch',
};

function hostname(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

function describeSource(url?: string) {
  const host = hostname(url);
  const match = (sites: Record<string, string>) => Object.entries(sites).find(([domain]) => host.endsWith(domain))?.[1];

  const board = match(JOB_BOARDS);
  if (board) return { type: 'Job posting', where: board, meaning: 'The company is hiring for this skill: they have the need now.' };
  if (host.startsWith('jobs.') || host.startsWith('careers.')) {
    return { type: 'Job posting', where: host, meaning: 'The company is hiring for this skill: they have the need now.' };
  }
  const news = match(NEWS_SITES);
  if (news) return { type: 'Press release', where: news, meaning: 'Announced in the news. Check that the company is the one buying, not selling.' };
  if (host.endsWith('sam.gov')) return { type: 'Government RFP', where: 'SAM.gov', meaning: 'A public request for proposals: an open buying opportunity.' };
  return { type: 'Web page', where: host || 'Unknown', meaning: 'Found on the web. Verify the signal before outreach.' };
}

// Phrases typical of companies selling services or products rather than buying.
const VENDOR_PATTERNS =
  /\b(consulting firm|consultancy|IT services|technology services|design and technology services|digital accelerator|systems integrator|solutions provider|leading provider|on behalf of a partner|our clients|helps (companies|enterprises|organizations)|announced the availability|launches|today launched|partnership with|our .{0,20}practice)\b/i;

const NON_PROSPECT_EMAIL_DOMAINS = /(greenhouse\.io|lever\.co|businesswire\.com|prnewswire\.com|techcrunch\.com|sam\.gov|^jobs\.|^careers\.)/i;

const linkedInPeople = (role: string, company: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${role} ${company}`)}`;

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
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${lobBadge(lead.lob)}`}>
                  {lobLabel(lead.lob)}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                  {source.type} · {source.where}
                </span>
                <span className="text-gray-500">
                  Discovered {new Date(lead.discoveredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
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
            <a
              href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLink}
            >
              💼 LinkedIn company
            </a>
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
                <ul className="space-y-2">
                  {playbook.contacts.map((role) => (
                    <li key={role} className="flex items-center justify-between text-sm">
                      <span className="text-gray-800">{role}</span>
                      <a
                        href={linkedInPeople(role, company)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Find on LinkedIn →
                      </a>
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
                    <div className="text-gray-600">No reliable email yet. Use the LinkedIn links above.</div>
                  )}
                </div>
              </section>
            )}

            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Company snapshot</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Industry</dt>
                  <dd className="text-gray-900 text-right">{lead.industry || 'Unknown'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Location</dt>
                  <dd className="text-gray-900 text-right">{lead.hq || 'Unknown'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Employees</dt>
                  <dd className="text-gray-900 text-right">{lead.employees ? lead.employees.toLocaleString() : 'Not enriched yet'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Revenue</dt>
                  <dd className="text-gray-900 text-right">
                    {lead.revenue ? `$${(lead.revenue / 1000000).toFixed(1)}M` : 'Not enriched yet'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Website</dt>
                  <dd className="text-right">
                    {lead.website ? (
                      <>
                        <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all">
                          {hostname(lead.website)}
                        </a>
                        <div className="text-xs text-gray-400">Best guess, not verified</div>
                      </>
                    ) : (
                      'Unknown'
                    )}
                  </dd>
                </div>
              </dl>
            </section>

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
