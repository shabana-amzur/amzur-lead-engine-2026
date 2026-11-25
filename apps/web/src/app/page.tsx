'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { leadsAPI, scanAPI } from '@/lib/api';
import { LOB_OPTIONS } from '@/lib/lobs';
import { REGION_OPTIONS } from '@/lib/regions';
import { signalType } from '@/lib/signals';
import SidebarIcon from '@/components/SidebarIcon';

const BRAND = '#2f0a4d';
const DAY_MS = 86400000;

// Same request (and SWR key) as the dashboard, so opening it is instant.
const LEADS_KEY = '/api/leads?limit=1000';

const SOURCES = [
  {
    icon: 'user',
    signal: 'Asked for a provider',
    title: 'LinkedIn requests',
    text: 'People publicly asking for a NetSuite partner, a development firm or an automation consultant. Each post is confirmed on LinkedIn itself.',
  },
  {
    icon: 'tender',
    signal: 'Tender / RFP',
    title: 'Open tenders & RFPs',
    text: 'Open calls for IT and software work from UK Contracts Finder, EU TED and regional news. Awarded contracts are left out.',
  },
  {
    icon: 'briefcase',
    signal: 'Hiring',
    title: 'Hiring signals',
    text: 'Companies hiring for NetSuite, cloud, DevOps or data roles: a sign of a project Amzur can staff or deliver.',
  },
  {
    icon: 'news',
    signal: 'Project / initiative',
    title: 'Projects & initiatives',
    text: 'News of modernisation, ERP or digital programmes where the buyer hasn’t chosen a vendor yet.',
  },
];

const CHECKS = [
  {
    title: 'Still open',
    text: 'The buyer hasn’t picked a vendor, the job is still listed and the LinkedIn post still exists.',
  },
  {
    title: 'A real request',
    text: 'Job ads, agency adverts and awareness posts that only quote a request are filtered out on the full text.',
  },
  {
    title: 'Fits the ICP',
    text: '$10M–$200M companies with established systems, reached through a CTO, COO, CIO or Head of Digital.',
  },
  {
    title: 'Scored and explained',
    text: 'A 0–100 score with every point’s reason, the Amzur service it maps to and who to contact.',
  },
];

function formatScanTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today at ${time}` : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

export default function HomePage() {
  const { data: leadsData, error } = useSWR(LEADS_KEY, () => leadsAPI.getAll({ page: 1, limit: 1000 }));
  const { data: scanData } = useSWR('/api/scan/latest', () => scanAPI.getLatest());

  const leads: any[] = leadsData?.leads || [];
  const loaded = !!leadsData;
  const weekAgo = Date.now() - 7 * DAY_MS;
  const bySignal = (signal: string) => leads.filter((lead) => signalType(lead) === signal).length;
  const recentDays = leadsData?.recentDays || 20;
  const lastScan = formatScanTime(scanData?.scan?.startedAt);

  const stats = [
    { label: `Open opportunities`, note: `posted in the last ${recentDays} days`, value: leads.length },
    {
      label: 'New this week',
      note: 'found in the last 7 days',
      value: leads.filter((lead) => new Date(lead.discoveredAt).getTime() >= weekAgo).length,
    },
    { label: 'Asked on LinkedIn', note: 'looking for a provider', value: bySignal('Asked for a provider') },
    { label: 'Open tenders', note: 'tenders and RFPs', value: bySignal('Tender / RFP') },
  ];
  const show = (value: number) => (loaded ? value.toLocaleString('en-US') : error ? '–' : '…');

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* Brand band: same colour and logo as the dashboard sidebar */}
      <section style={{ backgroundColor: BRAND }} className="text-white">
        <div className="max-w-6xl mx-auto px-6">
          <header className="flex items-center justify-between py-5">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/amzur-logo-white.png" alt="Amzur Technologies" width={140} height={46} className="w-[140px] h-auto" />
              <span className="hidden sm:flex items-center text-sm font-medium text-white/90 border-l border-white/20 pl-4">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse" />
                Lead Discovery Engine
              </span>
            </div>
            <Link
              href="/dashboard"
              className="text-sm font-medium bg-white/10 hover:bg-white/20 border border-white/20 rounded-md px-4 py-2 transition-colors"
            >
              Open dashboard
            </Link>
          </header>

          <div className="pt-10 pb-28 max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
              Companies asking for what Amzur sells, found every day.
            </h1>
            <p className="mt-5 text-lg text-white/80 leading-relaxed">
              The Lead Discovery Engine searches LinkedIn, public tenders, job boards and the news for buyers who are still choosing a
              provider. It checks each one and gives sales a scored lead with the person to contact.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-white text-[#2f0a4d] font-semibold px-6 py-3 rounded-md hover:bg-purple-50 transition-colors"
              >
                Go to Dashboard
                <span aria-hidden="true">→</span>
              </Link>
              {lastScan && (
                <span className="text-sm text-white/70">
                  Last scan {lastScan}
                  {typeof scanData?.scan?.newLeadsFound === 'number' ? ` · ${scanData.scan.newLeadsFound} new leads` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Live numbers, overlapping the brand band */}
      <section className="max-w-6xl mx-auto px-6 -mt-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, note, value }) => (
            <Link
              key={label}
              href="/dashboard"
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 hover:border-purple-300 hover:shadow-md transition-all"
            >
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
              <div className="mt-2 text-3xl font-semibold text-[#2f0a4d] font-mono">{show(value)}</div>
              <div className="mt-1 text-xs text-gray-500">{note}</div>
            </Link>
          ))}
        </div>
        {error && (
          <p className="mt-3 text-sm text-gray-500">Live numbers are unavailable right now. The dashboard will retry.</p>
        )}
      </section>

      {/* Where leads come from */}
      <section className="max-w-6xl mx-auto px-6 pt-16">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Where leads come from</h2>
        <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SOURCES.map(({ icon, signal, title, text }) => (
            <div key={title} className="bg-white rounded-lg border border-gray-200 p-5 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="w-9 h-9 rounded-md bg-purple-50 text-[#2f0a4d] flex items-center justify-center">
                  <SidebarIcon name={icon} className="w-5 h-5" />
                </span>
                <span className="text-xs font-medium text-gray-500">
                  {loaded ? `${bySignal(signal)} open` : ''}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How each lead is checked */}
      <section className="max-w-6xl mx-auto px-6 pt-14">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">How every lead is checked</h2>
        <ol className="mt-4 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {CHECKS.map(({ title, text }, index) => (
            <li key={title} className="bg-white rounded-lg border border-gray-200 p-5">
              <span className="inline-flex w-7 h-7 rounded-full bg-[#2f0a4d] text-white text-sm font-semibold items-center justify-center">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Coverage */}
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-16">
        <div className="bg-white rounded-lg border border-gray-200 p-6 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Amzur services matched</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {LOB_OPTIONS.map(({ value, label, badge }) => (
                <span key={value} className={`text-sm px-3 py-1 rounded-full ${badge}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Target regions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {REGION_OPTIONS.filter(({ value }) => value !== 'Unknown').map(({ value, label, flag }) => (
                <span key={value} className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-800">
                  {flag} {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>Amzur Technologies · Lead Discovery Engine (internal)</span>
          <span>Searches run once a day, with a LinkedIn-only refresh later in the day.</span>
        </footer>
      </section>
    </main>
  );
}
