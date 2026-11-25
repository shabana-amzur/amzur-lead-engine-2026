'use client';

// Website visitors: who is browsing amzur.com, where they came from and what
// they read. Visitors who filled in the form link to their inbound lead.
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { inboundAPI } from '@/lib/api';
import { regionLabel } from '@/lib/regions';

const RANGES = [7, 30, 90];

const when = (value: string) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const duration = (seconds: number) => {
  if (!seconds) return '–';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const pageName = (title: string | null, path: string) => (title ? title.replace(/\s*[|–-]\s*Amzur.*$/i, '') : path) || path;

// A ranked list with one thin bar per row (single series: one hue, value labelled).
function BarList({ rows, unit }: { rows: { key: string; label: string; value: number; hint?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-gray-500">No visits in this period yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} title={`${row.label}: ${row.value.toLocaleString('en-US')} ${unit}${row.hint ? ` (${row.hint})` : ''}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-800 truncate">{row.label}</span>
            <span className="text-gray-600 font-mono text-xs shrink-0">{row.value.toLocaleString('en-US')}</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-100 rounded-full">
            <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function VisitorsPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useSWR(`/api/inbound/visitors?days=${days}`, () => inboundAPI.visitors(days));
  const totals = data?.totals;
  const visitors: any[] = data?.visitors || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-6 py-6">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to Dashboard
        </Link>

        <div className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Website visitors</h1>
            <p className="text-sm text-gray-600 mt-1">
              People browsing amzur.com: where they came from, what they read and who went on to contact Amzur.
            </p>
          </div>
          <div className="flex rounded-md border border-gray-300 bg-white overflow-hidden text-sm">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`px-3 py-1.5 ${days === range ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {range} days
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Website visitors couldn’t be loaded right now.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Visitors', value: totals?.visitors, note: `in the last ${days} days` },
            { label: 'Returning visitors', value: totals?.returning, note: 'came back more than once' },
            { label: 'Pages read', value: totals?.pageViews, note: 'page views' },
            { label: 'Contacted Amzur', value: totals?.formFills, note: 'filled in the form' },
          ].map(({ label, value, note }) => (
            <div key={label} className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">{label}</div>
              <div className="text-2xl font-medium text-blue-700 font-mono">{data ? (value ?? 0).toLocaleString('en-US') : '…'}</div>
              <div className="text-xs mt-1 text-gray-500">{note}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Where visitors came from</h2>
            {data ? (
              <BarList unit="visitors" rows={(data.sources || []).map((s: any) => ({ key: s.label, label: s.label, value: s.visitors }))} />
            ) : (
              <p className="text-sm text-gray-500">Loading…</p>
            )}
          </section>
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Most-read pages</h2>
            {data ? (
              <BarList
                unit="visitors"
                rows={(data.topPages || []).map((p: any) => ({
                  key: p.path,
                  label: pageName(p.title, p.path),
                  value: p.visitors,
                  hint: `${p.views} views`,
                }))}
              />
            ) : (
              <p className="text-sm text-gray-500">Loading…</p>
            )}
          </section>
        </div>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recent visitors</h2>
            <p className="text-xs text-gray-500 mt-1">
              Visitors who haven’t filled in the form are anonymous here; company identification isn’t connected yet.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Last seen</th>
                  <th className="px-4 py-2 font-medium">Came from</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium text-right">Visits</th>
                  <th className="px-4 py-2 font-medium text-right">Pages</th>
                  <th className="px-4 py-2 font-medium text-right">Reading</th>
                  <th className="px-4 py-2 font-medium">Pages read (latest first)</th>
                  <th className="px-4 py-2 font-medium">Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data && visitors.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      No visits recorded in this period. Once the tracker is added to amzur.com, visits appear here.
                    </td>
                  </tr>
                )}
                {visitors.map((v) => (
                  <tr key={v.visitorId} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{when(v.lastSeen)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {v.cameFrom}
                      {v.campaign && <div className="text-xs text-gray-500">Campaign: {v.campaign}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {v.country ? (
                        <>
                          {regionLabel(v.region)}
                          <div className="text-xs text-gray-500">{[v.city, v.country].filter(Boolean).join(', ')}</div>
                        </>
                      ) : (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{v.sessions}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{v.pageViews}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{duration(v.engagedSec)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <ul className="space-y-0.5">
                        {v.pages.slice(0, 3).map((p: any) => (
                          <li key={p.path} className="truncate max-w-[260px]" title={p.path}>
                            {pageName(p.title, p.path)}
                          </li>
                        ))}
                        {v.pages.length > 3 && <li className="text-xs text-gray-400">+{v.pages.length - 3} more</li>}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      {v.leadId ? (
                        <Link href={`/dashboard/leads/${v.leadId}`} className="text-blue-600 hover:text-blue-800 font-medium">
                          {v.leadName || 'Open lead'}
                        </Link>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
