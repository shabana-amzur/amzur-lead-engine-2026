'use client';

// Company intelligence for one lead: the public profile found during the scan,
// Apollo's company record (size, growth, team sizes, funding, technology stack;
// 1 credit, on click) and recent news (free, cached for a day).
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { apolloAPI } from '@/lib/api';
import { hostname } from '@/lib/sources';

type Intel = {
  description?: string | null;
  industry?: string | null;
  keywords?: string[];
  revenue?: number | null;
  revenuePrinted?: string | null;
  employees?: number | null;
  growth?: { sixMonths: number | null; twelveMonths: number | null; twentyFourMonths: number | null };
  departments?: { name: string; count: number }[];
  founded?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  funding?: { totalPrinted: string | null; latestStage: string | null; latestDate: string | null };
  publicSymbol?: string | null;
  techStack?: { name: string; category: string }[];
  relevantTech?: string[];
  checkedAt?: string;
};

const growthText = (value: number | null | undefined) =>
  value === null || value === undefined ? null : `${value > 0 ? '+' : ''}${value}%`;
const growthClass = (value: number | null | undefined) =>
  value === null || value === undefined ? 'text-gray-400' : value > 0 ? 'text-emerald-700' : value < 0 ? 'text-red-700' : 'text-gray-700';

// Drop page chrome such as "About us ;" and "Website: …" (older profiles stored it).
function cleanDescription(text?: string | null): string | null {
  const clean = (text || '')
    .replace(/\babout us\b\s*[;:,.\-]*/gi, ' ')
    .replace(/\bwebsite\s*[:\-]?\s*\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s;:,.\-]+|[\s;:,\-]+$/g, '')
    .trim();
  return clean.length >= 30 ? clean : null;
}

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// Where a fact came from, so reps know what is safe to quote.
type Source = 'apollo' | 'confirmed' | 'profile' | 'estimate';
const SOURCE_TAG: Record<Source, [string, string, string]> = {
  apollo: ['Apollo', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'From Apollo’s company record'],
  confirmed: ['Verified', 'bg-emerald-50 text-emerald-700 border-emerald-200', 'Confirmed: Apollo lists people at this company on this domain'],
  profile: ['Public profile', 'bg-blue-50 text-blue-700 border-blue-200', 'From the company’s public profile / LinkedIn page'],
  estimate: ['Estimate', 'bg-amber-50 text-amber-800 border-amber-200', 'Read from a web snippet: confirm before quoting'],
};

function Fact({ label, source, children }: { label: string; source?: Source; children: React.ReactNode }) {
  const tag = source ? SOURCE_TAG[source] : null;
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-gray-500 w-28 shrink-0">{label}</dt>
      <dd className="text-gray-900 min-w-0 break-words">
        {children}
        {tag && (
          <span title={tag[2]} className={`ml-1.5 align-middle text-[10px] px-1 py-px rounded border ${tag[1]}`}>
            {tag[0]}
          </span>
        )}
      </dd>
    </div>
  );
}

export default function CompanyIntelligence({ lead, onChange }: { lead: any; onChange: () => void }) {
  const company: string = lead.companyName;
  const profile = lead.signals?.company || {};
  const intel: Intel | null = lead.signals?.apollo?.company || null;
  const { data: status } = useSWR('/api/leads/apollo/status', () => apolloAPI.status());
  const { data: news, error: newsError } = useSWR(`/api/leads/${lead.id}/company/news`, () => apolloAPI.companyNews(lead.id), {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const website = intel?.website || profile.website || null;
  const linkedin = intel?.linkedinUrl || profile.linkedinUrl || null;
  const description = intel?.description || cleanDescription(profile.description);

  // No real description yet but a confirmed website: read the company's own
  // About page (free, once per lead).
  const aboutTried = useRef(false);
  const [readingAbout, setReadingAbout] = useState(false);
  useEffect(() => {
    if (description || !profile.website || profile.aboutCheckedAt || aboutTried.current) return;
    aboutTried.current = true;
    setReadingAbout(true);
    apolloAPI
      .companyAbout(lead.id)
      .then(() => onChange())
      .catch(() => {})
      .finally(() => setReadingAbout(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, profile.website, profile.aboutCheckedAt, lead.id]);
  const revenue = intel?.revenuePrinted ? `$${intel.revenuePrinted}` : lead.revenue ? `~$${Math.round(lead.revenue / 1e6)}M` : null;
  const websiteSource: Source = intel?.website ? 'apollo' : profile.websiteSource ? 'confirmed' : 'profile';
  const employeeSource: Source = intel?.employees ? 'apollo' : profile.employees ? 'profile' : 'estimate';
  const employees = intel?.employees || lead.employees || profile.employees || null;
  const relevant = new Set((intel?.relevantTech || []).map((t) => t.toLowerCase()));
  const techByCategory = (intel?.techStack || []).reduce<Record<string, string[]>>((groups, tech) => {
    (groups[tech.category] = groups[tech.category] || []).push(tech.name);
    return groups;
  }, {});

  const enrich = async () => {
    if (!window.confirm(`Get ${company}'s company profile from Apollo (size, growth, funding, technology stack)? This uses 1 credit (no charge if not found).`)) return;
    setBusy(true);
    setError('');
    try {
      await apolloAPI.enrichCompany(lead.id);
      onChange();
    } catch (err: any) {
      setError(err?.message || 'Apollo request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Company intelligence · {company}</h2>
        {intel?.checkedAt ? (
          <span className="text-xs text-gray-400">Apollo profile from {formatDate(intel.checkedAt)}</span>
        ) : status?.configured && profile.website ? (
          <button
            type="button"
            onClick={enrich}
            disabled={busy}
            className="text-xs px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Getting profile…' : 'Get full profile from Apollo · 1 credit'}
          </button>
        ) : null}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {description ? (
        <div>
          <p className="text-gray-800 leading-relaxed">{description}</p>
          {!intel?.description && profile.descriptionSource && (
            <p className="text-xs text-gray-400 mt-1">
              From the company&apos;s website:{' '}
              <a href={profile.descriptionSource} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">
                {profile.descriptionSource.replace(/^https?:\/\/(www\.)?/, '')} ↗
              </a>
            </p>
          )}
        </div>
      ) : readingAbout ? (
        <p className="text-sm text-gray-500">Reading the company&apos;s About page…</p>
      ) : (
        <p className="text-sm text-gray-500">
          No company description found yet{profile.aboutCheckedAt ? ' (the website has no readable About page)' : ''}.
        </p>
      )}

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-4">
        <Fact label="Website" source={website ? websiteSource : undefined}>
          {website ? (
            <a href={website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
              {hostname(website)} ↗
            </a>
          ) : (
            <span className="text-gray-400">Not found</span>
          )}
        </Fact>
        <Fact label="LinkedIn" source={linkedin ? (intel?.linkedinUrl ? 'apollo' : 'profile') : undefined}>
          {linkedin ? (
            <a href={linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
              Company page ↗
            </a>
          ) : (
            <span className="text-gray-400">Not found</span>
          )}
        </Fact>
        {(intel?.industry || profile.linkedinIndustry) && (
          <Fact label="Industry">{intel?.industry || String(profile.linkedinIndustry).replace(/\s*Industry codes:.*$/i, '')}</Fact>
        )}
        {(intel?.address || profile.headquarters) && <Fact label="Headquarters" source={intel?.address ? 'apollo' : 'profile'}>{intel?.address || profile.headquarters}</Fact>}
        {(intel?.founded || profile.founded) && <Fact label="Founded" source={intel?.founded ? 'apollo' : 'profile'}>{intel?.founded || profile.founded}</Fact>}
        {revenue && <Fact label="Revenue" source={intel?.revenuePrinted ? 'apollo' : 'estimate'}>{revenue}</Fact>}
        {employees ? <Fact label="Employees" source={employeeSource}>~{Number(employees).toLocaleString()}</Fact> : null}
        {intel?.phone && <Fact label="Main phone"><a href={`tel:${intel.phone}`} className="hover:text-blue-700">{intel.phone}</a></Fact>}
        {intel?.publicSymbol && <Fact label="Listed">{intel.publicSymbol}</Fact>}
        {intel?.funding?.totalPrinted && (
          <Fact label="Funding">
            ${intel.funding.totalPrinted} total
            {intel.funding.latestStage ? ` · latest: ${intel.funding.latestStage}` : ''}
            {intel.funding.latestDate ? ` (${formatDate(intel.funding.latestDate)})` : ''}
          </Fact>
        )}
      </dl>

      {intel?.growth && (intel.growth.sixMonths !== null || intel.growth.twelveMonths !== null) && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Headcount growth</h3>
          <div className="grid grid-cols-3 gap-2 max-w-md">
            {[
              ['6 months', intel.growth.sixMonths],
              ['12 months', intel.growth.twelveMonths],
              ['24 months', intel.growth.twentyFourMonths],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-md border border-gray-200 px-3 py-2">
                <div className="text-[11px] text-gray-500">{label}</div>
                <div className={`text-base font-semibold ${growthClass(value as number | null)}`}>{growthText(value as number | null) || '–'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {intel?.departments && intel.departments.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Team sizes</h3>
          <div className="flex flex-wrap gap-2">
            {intel.departments.map((d) => (
              <span
                key={d.name}
                className={`text-xs px-2 py-1 rounded-md border ${
                  /engineering|information technology|operations/i.test(d.name) ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700'
                }`}
              >
                <span className="capitalize">{d.name}</span> · {d.count.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {intel?.techStack && intel.techStack.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-gray-700 mb-1">Technology stack</h3>
          {intel.relevantTech && intel.relevantTech.length > 0 && (
            <p className="text-xs text-gray-500 mb-2">
              Highlighted: systems Amzur works with ({intel.relevantTech.slice(0, 6).join(', ')}).
            </p>
          )}
          <div className="space-y-1.5">
            {Object.entries(techByCategory)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 8)
              .map(([category, names]) => (
                <div key={category} className="flex gap-2 text-xs">
                  <span className="text-gray-500 w-32 shrink-0 truncate" title={category}>{category}</span>
                  <div className="flex flex-wrap gap-1">
                    {names.slice(0, 12).map((name) => (
                      <span
                        key={name}
                        className={`px-1.5 py-0.5 rounded ${relevant.has(name.toLowerCase()) ? 'bg-emerald-100 text-emerald-800 font-medium' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {!intel && status?.configured && !profile.website && (
        <p className="mt-4 text-xs text-gray-500">
          The full Apollo profile becomes available once the company&apos;s website is confirmed (this happens automatically when its
          decision makers are found).
        </p>
      )}
      {!intel && status?.configured && profile.website && (
        <p className="mt-4 text-xs text-gray-500">
          The Apollo profile adds revenue, headcount growth, team sizes, funding and the company&apos;s technology stack.
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Recent news</h3>
        {!news && !newsError ? (
          <p className="text-sm text-gray-500">Loading news…</p>
        ) : newsError ? (
          <p className="text-sm text-gray-500">News is unavailable right now.</p>
        ) : news.items?.length ? (
          <ul className="space-y-2">
            {news.items.map((item: any) => (
              <li key={item.url} className="text-sm">
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-blue-700">
                  {item.title}
                </a>
                <div className="text-xs text-gray-500">
                  {[item.publisher, formatDate(item.date)].filter(Boolean).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No news about {company} in the last 90 days.</p>
        )}
      </div>
    </section>
  );
}
