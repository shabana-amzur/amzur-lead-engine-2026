'use client';

import { use } from 'react';
import useSWR from 'swr';
import { apolloAPI, leadsAPI } from '@/lib/api';
import { lobBadge, lobLabel } from '@/lib/lobs';
import { industryBadge, isPriorityIndustry } from '@/lib/industries';
import { describeSource, isLinkedInLead } from '@/lib/sources';
import { regionLabel } from '@/lib/regions';
import { buildBrief, buildTimeline } from '@/lib/leadBrief';
import { matchCaseStudies } from '@/lib/caseStudies';
import LeadActionBar from '@/components/LeadActionBar';
import RfpPanel from '@/components/RfpPanel';
import { CaseStudyMatch, OutreachSequence, WhyNowTimeline } from '@/components/LeadPanels';
import ApolloContacts, { ApolloCompanyButton } from '@/components/ApolloContacts';
import CompanyIntelligence from '@/components/CompanyIntelligence';
import LinkedInAuthor from '@/components/LinkedInAuthor';
import Icon from '@/components/SidebarIcon';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const FIT_STYLES: Record<string, string> = {
  'Strong fit': 'bg-emerald-50 border-emerald-200 text-emerald-900',
  'Good fit': 'bg-blue-50 border-blue-200 text-blue-900',
  'Needs qualification': 'bg-amber-50 border-amber-200 text-amber-900',
};
const FIT_BADGES: Record<string, string> = {
  'Strong fit': 'bg-emerald-600 text-white',
  'Good fit': 'bg-blue-600 text-white',
  'Needs qualification': 'bg-amber-500 text-white',
};

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

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

// The text under the headline without the headline itself: news and tender
// leads often have only the headline as their "summary", and a LinkedIn
// post's text starts with the question used as the headline. Returns null
// when nothing meaningful is left.
function withoutHeadline(text: string | null | undefined, headline: string | null | undefined): string | null {
  // LinkedIn page chrome such as "Mehul Patel | 37 comments".
  let body = (text || '').replace(/^[^|]{0,60}\|\s*\d+\s+comments?\s*/i, '').trim();
  if (!body) return null;
  const head = (headline || '').trim();
  const clipped = /(…|\.\.\.)$/.test(head);
  const words = head.replace(/(…|\.\.\.)$/, '').match(/[a-z0-9]+/gi) || [];
  if (clipped) words.pop(); // the last word of a clipped headline may be cut
  if (words.length >= 3) {
    // The headline wherever it appears, whatever punctuation or spacing sits between its words.
    const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+'), 'i');
    const match = body.match(pattern);
    if (match && match.index !== undefined) {
      body = `${body.slice(0, match.index)} ${body.slice(match.index + match[0].length)}`;
    }
  }
  body = body
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9“"(]+/i, '')
    .trim();
  return body.length >= 25 ? body : null;
}

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

  const { data, error, mutate } = useSWR(`/api/leads/${id}`, () => leadsAPI.getById(id));

  // LinkedIn leads: read the full public post once (free) for a detailed
  // "What they need"; older leads only have the search snippet.
  const linkedinTried = useRef(false);
  useEffect(() => {
    const lead = data?.lead;
    // Not read yet, or unreadable last time (the API retries after an hour).
    const post = lead?.signals?.linkedinPost;
    if (!lead || lead.signals?.leadType !== 'linkedin_post' || (post && !post.unreadable) || linkedinTried.current) return;
    linkedinTried.current = true;
    apolloAPI
      .linkedinRefresh(lead.id)
      .then(() => mutate())
      .catch(() => {});
  }, [data, mutate]);

  const backButton = (
    <button
      onClick={() => {
        // Came from the dashboard in this tab: go back to that exact view
        // (filters and scroll are restored). Opened directly: open the dashboard.
        let cameFromDashboard = false;
        try {
          cameFromDashboard = sessionStorage.getItem('lead-engine:came-from-dashboard') === '1';
        } catch {
          // storage unavailable
        }
        if (cameFromDashboard && window.history.length > 1) router.back();
        else router.push('/dashboard');
      }}
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

  // The requirement as read from the source itself (job posting, press release, post).
  const requirement: {
    kind?: string;
    headline?: string | null;
    facts?: { label: string; value: string }[];
    summary?: string | null;
    sections?: { title: string; bullets: string[] }[];
  } | null = signals.requirement || null;
  const requirementText = requirement
    ? [requirement.headline, requirement.summary, ...(requirement.sections || []).flatMap((section) => section.bullets)].join(' ')
    : '';

  // What they need: the text under the headline, without repeating it.
  const needHeadline = requirement?.headline || lead.intentSignal || '';
  const needSummary = withoutHeadline(requirement?.summary, needHeadline);
  const needContext = needSummary ? null : withoutHeadline(context, needHeadline);

  const techMentioned = TECH_KEYWORDS.filter((tech) => {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`, 'i').test(`${requirementText} ${context}`);
  });

  const requirementLabel =
    {
      job: 'Job opening',
      press: 'Announcement',
      linkedin: 'Asked on LinkedIn',
      web: source.type,
    }[requirement?.kind || ''] || source.type;

  const possibleVendor = VENDOR_PATTERNS.test(context);
  // Lead-specific fit analysis and approach, built from the source itself.
  const brief = buildBrief(lead, { possibleVendor });
  const timeline = buildTimeline(lead);
  const caseStudies = matchCaseStudies(lead, brief.context.themes);
  const isRfp = brief.context.kind === 'rfp';

  const emailDomain = (lead.outreachEmail || '').split('@')[1] || '';
  const reliableEmail = lead.outreachEmail && !NON_PROSPECT_EMAIL_DOMAINS.test(emailDomain);

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
                  {lead.industry || 'Other'}{isPriorityIndustry(lead.industry) && (
                    <span className="inline-flex items-center gap-0.5 ml-1">
                      <Icon name="star" className="w-3 h-3 fill-current" /> Priority
                    </span>
                  )}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                  {regionLabel(signals.geography || 'Unknown')}
                  {signals.location ? ` · ${signals.location}` : ''}
                </span>
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                  {source.type} · {source.where}
                </span>
                <span className="text-gray-500">
                  {postedAt ? `Posted ${formatDate(postedAt)} (${timeAgo(postedAt)})` : `Discovered ${formatDate(lead.discoveredAt)}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={actionLink}>
                <Icon name="tender" className="w-3.5 h-3.5" /> View original {source.type.toLowerCase()}
              </a>
            )}
            {fromLinkedIn ? (
              <a
                href={authorProfileUrl || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={actionLink}
              >
                <Icon name="user" className="w-3.5 h-3.5" /> Author&apos;s LinkedIn profile
              </a>
            ) : (
              <a
                href={companyLinkedIn || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={actionLink}
              >
                <Icon name="briefcase" className="w-3.5 h-3.5" /> {companyLinkedIn ? 'LinkedIn page' : 'Find on LinkedIn'}
              </a>
            )}
            {!fromLinkedIn && officialWebsite && (
              <a href={officialWebsite} target="_blank" rel="noopener noreferrer" className={actionLink}>
                <Icon name="globe" className="w-3.5 h-3.5" /> Website
              </a>
            )}
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`"${company}"`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLink}
            >
              <Icon name="search" className="w-3.5 h-3.5" /> Search the web
            </a>
            <a
              href={`https://news.google.com/search?q=${encodeURIComponent(`"${company}"`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={actionLink}
            >
              <Icon name="news" className="w-3.5 h-3.5" /> Recent news
            </a>
          </div>
        </div>

        <LeadActionBar lead={lead} onChange={() => mutate()} />

        {possibleVendor && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Check before outreach:</strong> the source text reads like this company <em>sells</em> services or
            products (for example a consultancy or vendor announcement), so it may be a competitor or partner rather
            than a buyer.
          </div>
        )}

        {/* Amzur fit summary */}
        <section className={`mb-4 rounded-lg border p-5 ${FIT_STYLES[brief.fit.level]}`}>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide ${FIT_BADGES[brief.fit.level]}`}>
              {brief.fit.level}
            </span>
            <span className="text-sm font-medium">Amzur fit · {brief.primaryService}</span>
          </div>
          <p className="text-[15px] leading-relaxed">{brief.summary}</p>
          {brief.fit.reasons.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {brief.fit.reasons.map((reason) => (
                <li key={reason} className="text-xs px-2 py-1 rounded-md bg-white/70 border border-current/10">
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-4">
            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">What they need</h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">{requirementLabel}</span>
                  {signals.vendorStatus === 'review' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium border border-amber-200">
                      <span className="inline-flex items-center gap-1"><Icon name="warning" className="w-3 h-3" /> Review required</span>
                    </span>
                  )}
                  {signals.vendorStatus === 'open' && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium"><span className="inline-flex items-center gap-1"><Icon name="check" className="w-3 h-3" /> Open requirement</span></span>
                  )}
                  {signals.jobOpen === true && (
                    <span
                      className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium"
                      title={signals.jobCheckedAt ? `Checked ${new Date(signals.jobCheckedAt).toLocaleString()}` : undefined}
                    >
                      <span className="inline-flex items-center gap-1"><Icon name="check" className="w-3 h-3" /> Posting still open</span>
                    </span>
                  )}
                  {signals.jobOpen === false && (
                    <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-medium">
                      Posting closed{signals.jobClosedAt ? ` (${formatDate(signals.jobClosedAt)})` : ''}
                    </span>
                  )}
                  {postedAt && (
                    <span className={postedDaysAgo !== null && postedDaysAgo > 365 ? 'text-amber-700 font-medium' : 'text-gray-500'}>
                      Posted {formatDate(postedAt)} · {timeAgo(postedAt)}
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-xl font-semibold text-gray-900">
                {requirement?.headline || lead.intentSignal || 'Requirement not recorded'}
              </h3>

              {fromLinkedIn && signals.linkedinPost?.removed && (
                <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  <span className="font-medium">This post has been deleted on LinkedIn.</span> It was found through a
                  search engine that still lists it, so the text below is from that cached copy. There is no post to
                  reply to: skip this lead. It will be removed in the next cleanup.
                </div>
              )}

              {fromLinkedIn && signals.linkedinPost?.isRequest === false && !signals.linkedinPost?.removed && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span className="font-medium">Not a request for a provider.</span>{' '}
                  {{
                    'self-promotion': 'The author is advertising their own services.',
                    'rhetorical or second-hand': 'The author is commenting on requests (or quoting them), not making one.',
                    'job ad / recruiting': 'This is a job ad or recruiting post.',
                    'job ad (hiring in post URL)': 'This is a job ad or recruiting post.',
                    'not asking for a provider': 'The post doesn’t ask for a provider.',
                    'not asking for an Amzur service': 'The post asks for something Amzur doesn’t provide.',
                  }[String(signals.linkedinPost.notRequestReason)] || 'The full post doesn’t read like someone asking for a provider.'}{' '}
                  The post is shown below as written. Skip outreach unless you know otherwise.
                </div>
              )}

              {signals.vendorStatus === 'review' && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span className="font-medium">Review required:</span>{' '}
                  {signals.vendorCheck?.reason || 'Vendor selection status unclear'}. Check the source to confirm the company
                  hasn&apos;t already chosen a provider before reaching out.
                </div>
              )}

              {requirement?.facts && requirement.facts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {requirement.facts.map((fact) => (
                    <span key={fact.label} className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-700">
                      <span className="text-gray-400">{fact.label}:</span> {fact.value}
                    </span>
                  ))}
                </div>
              )}

              {postedDaysAgo !== null && postedDaysAgo > 365 && (
                <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                  This was posted over a year ago: the need may already be met. Confirm it&apos;s still current.
                </p>
              )}

              {needSummary ? (
                <p className="mt-4 text-gray-800 leading-relaxed">{needSummary}</p>
              ) : needContext ? (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-1">From the search result (may be partial):</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{needContext}{context.length >= 500 ? '…' : ''}</p>
                </div>
              ) : null}

              {(requirement?.sections || []).map((section) => (
                <div key={section.title} className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-1.5">{section.title}</h4>
                  <ul className="space-y-1.5 text-sm text-gray-700">
                    {section.bullets.map((bullet) => {
                      // "Lead & Sales Management: lead distribution, ..." -> bold label
                      const labelled = bullet.match(/^([A-Z][^:]{2,60}):\s+(.+)$/);
                      return (
                        <li key={bullet} className="flex gap-2">
                          <span className="text-gray-400 mt-0.5">•</span>
                          {labelled ? (
                            <span>
                              <span className="font-medium text-gray-900">{labelled[1]}:</span> {labelled[2]}
                            </span>
                          ) : (
                            <span>{bullet}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {fromLinkedIn && (requirement as any)?.hashtags?.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {(requirement as any).hashtags.slice(0, 12).map((tag: string) => (
                    <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {techMentioned.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">Technologies:</span>
                  {techMentioned.map((tech) => (
                    <span key={tech} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                      {tech}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-gray-600">
                  <span className="text-gray-400">Amzur fit:</span>{' '}
                  <span className="font-medium text-gray-900">{lead.recommendedService || lobLabel(lead.lob)}</span>
                </span>
                {sourceUrl && (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                    Read the full {source.type.toLowerCase()} ↗
                  </a>
                )}
              </div>
            </section>

            {isRfp && <RfpPanel lead={lead} onChange={() => mutate()} />}

            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">How Amzur fits</h2>
              <p className="text-xs text-gray-400 mb-4">Each need below is taken from the source and mapped to what Amzur delivers.</p>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-md">
                {brief.rows.map((row) => (
                  <div key={row.need} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Their need</div>
                      <div className="font-medium text-gray-900">{row.need}</div>
                      {row.evidence && (
                        <blockquote className="mt-1.5 text-sm text-gray-600 border-l-2 border-gray-200 pl-2 italic">
                          “{row.evidence}”
                        </blockquote>
                      )}
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Amzur delivers</div>
                      <div className="text-sm text-gray-800">{row.amzur}</div>
                    </div>
                  </div>
                ))}
              </div>

              {brief.angles.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">How to position Amzur</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    {brief.angles.map((angle) => (
                      <li key={angle} className="flex gap-2">
                        <span className="text-emerald-600 mt-0.5"><Icon name="check" className="w-4 h-4" /></span>
                        <span>{angle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.incumbent && (
                <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <span className="font-medium">Current vendor signal:</span> {brief.incumbent}
                </div>
              )}

              <CaseStudyMatch matches={caseStudies} />
            </section>

            <WhyNowTimeline events={timeline} />

            <section className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Engagement plan</h2>
              <ol className="relative border-l border-gray-200 ml-3 space-y-5">
                {brief.steps.map((step, index) => (
                  <li key={step.title} className="ml-6">
                    <span className="absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold">
                      {index + 1}
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium text-gray-900">{step.title}</h3>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{step.when}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{step.detail}</p>
                  </li>
                ))}
              </ol>
            </section>

            <OutreachSequence brief={brief} />

            {!fromLinkedIn && <CompanyIntelligence lead={lead} onChange={() => mutate()} />}

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

                <dt className="text-gray-500">Found by Lead Discovery Engine</dt>
                <dd className="text-gray-900">{formatDate(lead.discoveredAt)}</dd>
              </dl>
            </section>


          </div>

          {/* Side column */}
          <div className="space-y-4">
            {lead.icp && (
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ICP check</h2>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                      lead.icp.status === 'match'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : lead.icp.status === 'outside'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {lead.icp.status === 'match' ? 'Matches ICP' : lead.icp.status === 'outside' ? 'Outside ICP' : 'Unverified'}
                  </span>
                </div>
                <dl className="space-y-3 text-sm">
                  {[
                    ['Size', '$10M–$200M revenue', lead.icp.checks?.size],
                    ['Maturity', 'Established, existing systems', lead.icp.checks?.maturity],
                    ['Role', 'CTO / COO / CIO / VP Tech / Head of DT', lead.icp.checks?.role],
                  ].map(([label, target, check]: any) => (
                    <div key={label} className="flex gap-2">
                      <span
                        className={`mt-0.5 shrink-0 w-4 text-center ${
                          check?.status === 'match' ? 'text-emerald-600' : check?.status === 'outside' ? 'text-red-600' : 'text-gray-400'
                        }`}
                      >
                        {check?.status === 'match' ? <Icon name="check" className="w-4 h-4" /> : check?.status === 'outside' ? <Icon name="x" className="w-4 h-4" /> : '?'}
                      </span>
                      <div>
                        <dt className="text-gray-900 font-medium">
                          {label} <span className="text-gray-400 font-normal text-xs">· {target}</span>
                        </dt>
                        <dd className="text-gray-600 text-xs mt-0.5">{check?.reason}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
                {!fromLinkedIn && <ApolloCompanyButton lead={lead} onChange={() => mutate()} />}
              </section>
            )}

              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Who to contact</h2>
                {!fromLinkedIn && (
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <ApolloContacts lead={lead} brief={brief} onChange={() => mutate()} />
                  </div>
                )}
                {fromLinkedIn && <LinkedInAuthor lead={lead} brief={brief} onChange={() => mutate()} />}
                {!fromLinkedIn && <div className="text-xs text-gray-400 mb-2">Roles to target{(lead.signals?.apollo?.candidates || []).length ? ' if you need others' : ''}:</div>}
                {!fromLinkedIn && (
                <ul className="space-y-3">
                  {brief.contacts.map(({ role, why }) => (
                    <li key={role} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-900 font-medium">{role}</span>
                        {!fromLinkedIn && (
                          <a
                            href={linkedInPeople(role.replace(/ for .*$| of the .*$|\s*\/.*$/, ''), company)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 shrink-0 text-xs mt-0.5"
                          >
                            Find →
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{why}</div>
                    </li>
                  ))}
                </ul>
                )}
                {!fromLinkedIn && (
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
                )}
              </section>

            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Questions to ask</h2>
                <CopyButton text={brief.questions.map((q) => `- ${q}`).join('\n')} />
              </div>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                {brief.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </section>

            {brief.risks.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Watch-outs</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                  {brief.risks.map((risk) => (
                    <li key={risk} className="flex gap-2">
                      <span className="text-amber-500">!</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {fromLinkedIn && (
              <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Company</h2>
                {signals.apollo?.author?.organization ? (
                  <p className="text-sm text-gray-800">
                    {signals.apollo.author.name || company} works at{' '}
                    <span className="font-medium">{signals.apollo.author.organization}</span>
                    {signals.apollo.author.title ? ` as ${signals.apollo.author.title}` : ''}.
                    <span className="block text-xs text-gray-400 mt-1">From Apollo, matched by their LinkedIn profile.</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">
                    Not identified yet. Reveal the author&apos;s email above to see their title and employer, or open their LinkedIn profile.
                  </p>
                )}
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
