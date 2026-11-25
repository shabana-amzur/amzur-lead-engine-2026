'use client';

import useSWR from 'swr';
import { leadsAPI, scanAPI } from '@/lib/api';
import { LOB_OPTIONS, lobBadge, lobLabel } from '@/lib/lobs';
import { INDUSTRY_OPTIONS, PRIORITY_INDUSTRIES, industryBadge, isPriorityIndustry } from '@/lib/industries';
import { isLinkedInLead, leadSource } from '@/lib/sources';
import { ICP_OPTIONS, SIGNAL_TYPES, SOURCE_TYPES, VENDOR_STATUS_OPTIONS, icpStatus, signalType, sourceType, vendorStatus, vendorStatusReason } from '@/lib/signals';
import { REGION_OPTIONS, leadRegion, regionLabel } from '@/lib/regions';
import { useRouter } from 'next/navigation';
import SidebarIcon, { INDUSTRY_ICONS, SERVICE_ICONS } from '@/components/SidebarIcon';
import { useCallback, useEffect, useRef, useState } from 'react';

// The dashboard's view (filters, sidebar view, scroll position) is kept for
// this browser tab, so coming back from a lead returns to the same place.
const VIEW_KEY = 'lead-engine:dashboard-view';
const CAME_FROM_DASHBOARD_KEY = 'lead-engine:came-from-dashboard';

type SavedView = { filters: Filters; activeView: string; scrollTop: number };
function readSavedView(): SavedView | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
    return saved && saved.filters ? saved : null;
  } catch {
    return null;
  }
}

type Filters = { quick: string; icp: string; region: string; source: string; signal: string; status: string; service: string; industry: string };
const NO_FILTERS: Filters = { quick: 'all', icp: 'all', region: 'all', source: 'all', signal: 'all', status: 'all', service: 'all', industry: 'all' };

// The number cards: which leads each one counts (and lists when clicked).
const DAY_MS = 86400000;
// All leads are loaded at once (counts, filters and the table work on the full
// set); well above current volumes so the totals are never cut off.
const LEADS_LIMIT = 1000;
const startOfDay = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - offsetDays * DAY_MS;
};
const foundToday = (lead: any) => new Date(lead.discoveredAt).getTime() >= startOfDay(0);
const foundYesterday = (lead: any) => {
  const t = new Date(lead.discoveredAt).getTime();
  return t >= startOfDay(1) && t < startOfDay(0);
};
const foundThisWeek = (lead: any) => new Date(lead.discoveredAt).getTime() >= startOfDay(6);
const isHighIntent = (lead: any) => lead.leadScore >= 75 && vendorStatus(lead) !== 'review';
const QUICK_LABELS: Record<string, string> = { 'new-today': 'New today', 'high-intent': 'High intent (75+)' };

function matchesFilters(lead: any, filters: Filters) {
  return (
    (filters.quick === 'all' ||
      (filters.quick === 'new-today' && foundToday(lead)) ||
      (filters.quick === 'high-intent' && isHighIntent(lead))) &&
    (filters.icp === 'all' || icpStatus(lead) === filters.icp) &&
    (filters.region === 'all' || leadRegion(lead) === filters.region) &&
    (filters.source === 'all' || sourceType(lead) === filters.source) &&
    (filters.signal === 'all' || signalType(lead) === filters.signal) &&
    (filters.status === 'all' || vendorStatus(lead) === filters.status) &&
    (filters.service === 'all' || lead.lob === filters.service) &&
    (filters.industry === 'all' || (lead.industry || 'Other') === filters.industry)
  );
}

// A compact labelled dropdown for the filter bar.
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count: number }[];
}) {
  const active = value !== 'all';
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-600">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`text-xs rounded-md border px-2 py-1.5 pr-7 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 ${
          active ? 'border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-700'
        }`}
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.count === 0 && option.value !== value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // 'dashboard' scrolls to the top; 'all' jumps to the table. Both clear filters.
  const [activeView, setActiveView] = useState('dashboard');
  const hasFilters = Object.values(filters).some((value) => value !== 'all');

  // Restore the saved view when the dashboard opens (filters now, scroll once
  // the leads are on the page), and keep saving it as it changes.
  const savedView = useRef<SavedView | null>(null);
  const restoredScroll = useRef(false);
  const [viewRestored, setViewRestored] = useState(false);
  useEffect(() => {
    savedView.current = readSavedView();
    if (savedView.current) {
      setFilters({ ...NO_FILTERS, ...savedView.current.filters });
      setActiveView(savedView.current.activeView || 'dashboard');
    }
    setViewRestored(true);
  }, []);
  const saveView = useCallback(
    (scrollTop?: number) => {
      if (!viewRestored) return;
      const main = document.getElementById('dashboard-main');
      try {
        sessionStorage.setItem(
          VIEW_KEY,
          JSON.stringify({ filters, activeView, scrollTop: scrollTop ?? main?.scrollTop ?? 0 })
        );
      } catch {
        // storage unavailable (private mode): the view just isn't remembered
      }
    },
    [filters, activeView, viewRestored]
  );
  useEffect(() => {
    saveView();
  }, [saveView]);
  useEffect(() => {
    const main = document.getElementById('dashboard-main');
    if (!main) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveView(main.scrollTop), 150);
    };
    main.addEventListener('scroll', onScroll);
    return () => {
      clearTimeout(timer);
      main.removeEventListener('scroll', onScroll);
    };
  }, [saveView]);

  const scrollToTable = () =>
    document.getElementById('opportunities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  // Sidebar shortcuts toggle one filter and jump to the table.
  const toggleFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: current[key] === value ? 'all' : value }));
    scrollToTable();
  };

  const selectView = (view: 'dashboard' | 'all' | 'older') => {
    setActiveView(view);
    setFilters(NO_FILTERS);
    if (view === 'dashboard' || view === 'older') {
      document.getElementById('dashboard-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      scrollToTable();
    }
  };

  const navItemClass = (active: boolean) =>
    `w-full mb-1 px-2 py-2 rounded-md text-sm text-left cursor-pointer flex items-center gap-2 justify-between ${
      active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
    }`;

  // Fetch all leads
  const olderView = activeView === 'older';
  const { data: leadsData, error: leadsError, mutate: refreshLeads } = useSWR(
    olderView ? `/api/leads?limit=${LEADS_LIMIT}&view=older` : `/api/leads?limit=${LEADS_LIMIT}`,
    () => leadsAPI.getAll(olderView ? { page: 1, limit: LEADS_LIMIT, view: 'older' } : { page: 1, limit: LEADS_LIMIT }),
    { keepPreviousData: true }
  );
  // The Older tab's count, from whichever list is loaded (both report it).
  const olderCount: number = leadsData?.olderCount ?? 0;

  useEffect(() => {
    if (!leadsData || restoredScroll.current || !viewRestored) return;
    restoredScroll.current = true;
    const top = savedView.current?.scrollTop || 0;
    if (top > 0) requestAnimationFrame(() => document.getElementById('dashboard-main')?.scrollTo({ top }));
  }, [leadsData, viewRestored]);

  // Fetch latest scan
  const { data: scanData, mutate: refreshLatestScan } = useSWR('/api/scan/latest', () => scanAPI.getLatest());

  // Fetch scan history
  const { data: historyData, mutate: refreshHistory } = useSWR('/api/scan/history', () => scanAPI.getHistory({ limit: 5 }));

  // Scans spend paid search credits, so the API runs at most one per day: the
  // first visit of the day scans; later visits and "Refresh Results" reload
  // the saved leads. Existing leads show immediately either way.
  const [checking, setChecking] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const checkingRef = useRef(false);

  const checkForNewLeads = useCallback(async (force = false) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setRefreshMessage(force ? 'Checking for new leads…' : 'Loading leads…');

    try {
      const result = await scanAPI.refresh({ force });

      if (result.status === 'completed') {
        const count = result.newLeadsFound || 0;
        const found = count > 0 ? `${count} new lead${count === 1 ? '' : 's'} found.` : 'No new leads found.';
        setRefreshMessage(
          result.webSearchUnavailable
            ? `${found} Web search is paused (search provider limit reached); news and tender sources still ran.`
            : found
        );
      } else if (result.status === 'skipped') {
        const last = new Date(result.lastScanAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setRefreshMessage(
          `Leads were refreshed today at ${last}. New leads are searched once a day, with a LinkedIn-only refresh later in the day.`
        );
      } else if (result.status === 'search_unavailable') {
        setRefreshMessage(
          result.error?.status === 432
            ? 'Lead search is paused: the Tavily search account has reached its usage limit. Showing existing leads.'
            : 'Lead search is unavailable right now. Showing existing leads.'
        );
      } else if (result.status === 'in_progress') {
        setRefreshMessage('A scan is already running; results will appear shortly.');
      }
    } catch (error) {
      setRefreshMessage('Could not check for new leads right now. Showing existing leads.');
    } finally {
      await Promise.all([refreshLeads(), refreshLatestScan(), refreshHistory()]);
      checkingRef.current = false;
      setChecking(false);
    }
  }, [refreshLeads, refreshLatestScan, refreshHistory]);

  useEffect(() => {
    checkForNewLeads();
    // Run once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leads = leadsData?.leads || [];
  
  // Calculate metrics
  const totalLeads = leads.length;
  // Review-required leads aren't qualified yet, so they never count as high intent.
  const highIntentLeads = leads.filter(isHighIntent).length;
  const tenderLeads = leads.filter((l: any) => signalType(l) === 'Tender / RFP');
  const tenders = tenderLeads.length;
  const websiteEnquiries = leads.filter((l: any) => signalType(l) === 'Website enquiry').length;
  const hiringLeads = leads.filter((l: any) => signalType(l) === 'Hiring');
  const hiringCompanies = hiringLeads.length;
  const newToday = leads.filter(foundToday).length;
  const newYesterday = leads.filter(foundYesterday).length;
  const newThisWeek = leads.filter(foundThisWeek).length;
  const highIntentThisWeek = leads.filter((l: any) => isHighIntent(l) && foundThisWeek(l)).length;
  const hiringThisWeek = hiringLeads.filter(foundThisWeek).length;
  // Tenders whose deadline (from the notice or set on the lead) is within 7 days.
  const tendersClosingSoon = tenderLeads.filter((l: any) => {
    const deadline = l.signals?.rfp?.deadline ? new Date(`${l.signals.rfp.deadline}T23:59:59`).getTime() : null;
    return deadline !== null && deadline >= Date.now() && deadline - Date.now() <= 7 * DAY_MS;
  }).length;

  // Clicking a number card shows exactly the leads it counts.
  const showCard = (card: 'total' | 'new-today' | 'high-intent' | 'tenders' | 'hiring') => {
    const next: Filters =
      card === 'new-today' || card === 'high-intent'
        ? { ...NO_FILTERS, quick: card }
        : card === 'tenders'
          ? { ...NO_FILTERS, signal: 'Tender / RFP' }
          : card === 'hiring'
            ? { ...NO_FILTERS, signal: 'Hiring' }
            : NO_FILTERS;
    setActiveView('all');
    setFilters(next);
    scrollToTable();
  };
  const cardActive = (card: string) =>
    card === 'total'
      ? !hasFilters
      : card === 'tenders'
        ? filters.signal === 'Tender / RFP'
        : card === 'hiring'
          ? filters.signal === 'Hiring'
          : filters.quick === card;

  const filteredLeads = leads.filter((lead: any) => matchesFilters(lead, filters));
  const industryCount = (industry: string) => leads.filter((l: any) => (l.industry || 'Other') === industry).length;

  // Option counts respect the other active filters, e.g. Industry counts
  // within the selected Source and Service.
  const countWith = (key: keyof Filters, value: string) =>
    leads.filter((lead: any) => matchesFilters(lead, { ...filters, [key]: value })).length;

  const getScoreClass = (score: number) => {
    if (score >= 75) return 'bg-emerald-100 text-emerald-800';
    if (score >= 55) return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  };

  const getLobBadge = lobBadge;

  const latestScan = scanData?.scan;
  const scanHistory = historyData?.scans || [];

  return (
    <div className="flex h-screen min-h-[700px] bg-gray-50">
      {/* Sidebar */}
      <div className="w-[200px] min-w-[200px] bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-4 pb-3" style={{ backgroundColor: '#2f0a4d' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/amzur-logo-white.png" alt="Amzur Technologies" width={150} height={49} className="w-[150px] h-auto" />
          <div className="mt-3 text-sm font-medium text-white flex items-center">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
            Lead Discovery Engine
          </div>
        </div>
        
        <div className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2">Discover</div>
          <button
            type="button"
            onClick={() => selectView('dashboard')}
            className={navItemClass(activeView === 'dashboard' && !hasFilters)}
          >
            <span className="flex items-center gap-2"><SidebarIcon name="dashboard" /> Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('all')}
            className={navItemClass(activeView === 'all' && !hasFilters)}
          >
            <span className="flex items-center gap-2"><SidebarIcon name="list" /> All Leads</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{olderView ? '' : totalLeads}</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('older')}
            className={navItemClass(olderView)}
            title={`Leads posted ${leadsData?.olderWindow?.from ?? 20}-${leadsData?.olderWindow?.to ?? 30} days ago`}
          >
            <span className="flex items-center gap-2"><SidebarIcon name="archive" /> Older leads <span className="text-[10px] text-gray-400">20–30 days</span></span>
            <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{olderCount}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleFilter('signal', 'Tender / RFP')}
            className={navItemClass(filters.signal === 'Tender / RFP')}
          >
            <span className="flex items-center gap-2"><SidebarIcon name="tender" /> Tenders</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{tenders}</span>
          </button>

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Website opportunities</div>
          <button
            type="button"
            onClick={() => toggleFilter('signal', 'Website enquiry')}
            className={navItemClass(filters.signal === 'Website enquiry')}
            title="People who contacted Amzur through the website form"
          >
            <span className="flex items-center gap-2"><SidebarIcon name="mail" /> Enquiries</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{websiteEnquiries}</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/visitors')}
            className={navItemClass(false)}
            title="Who is browsing amzur.com, where they came from and what they read"
          >
            <span className="flex items-center gap-2"><SidebarIcon name="globe" /> Visitors</span>
          </button>

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Services</div>
          {LOB_OPTIONS.map(({ value: lob, label }) => (
            <button
              type="button"
              key={lob}
              onClick={() => toggleFilter('service', lob)}
              className={navItemClass(filters.service === lob)}
            >
              <span className="flex items-center gap-2"><SidebarIcon name={SERVICE_ICONS[lob] || 'list'} /> {label}</span>
              <span className="text-[10px] text-gray-400">
                {leads.filter((l: any) => l.lob === lob).length}
              </span>
            </button>
          ))}

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Priority Industries</div>
          {PRIORITY_INDUSTRIES.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              onClick={() => toggleFilter('industry', value)}
              className={navItemClass(filters.industry === value)}
            >
              <span className="flex items-center gap-2"><SidebarIcon name={INDUSTRY_ICONS[value] || 'list'} /> {label}</span>
              <span className="text-[10px] text-gray-400">{industryCount(value)}</span>
            </button>
          ))}

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Settings</div>
          <div
            title="Configuration is not available yet"
            className="mb-1 px-2 py-2 rounded-md text-sm text-gray-400 cursor-not-allowed flex items-center gap-2 justify-between"
          >
            <span className="flex items-center gap-2"><SidebarIcon name="settings" /> Configuration</span>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Soon</span>
          </div>
        </div>
        
        <div className="p-3 border-t border-gray-200 text-xs text-gray-500">
          <div className="flex items-center gap-2 mb-1">
            <SidebarIcon name="pulse" className="w-3.5 h-3.5 text-green-600" />
            <span>Auto-Discovery Engine</span>
          </div>
          {latestScan && (
            <div className="text-[10px] text-gray-400 ml-5">
              Last: {new Date(latestScan.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="text-[10px] text-gray-400 ml-5">
            Daily search + LinkedIn refresh
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div id="dashboard-main" className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <h1 className="text-lg font-medium text-gray-900">{olderView ? 'Older leads' : 'Lead Discovery Dashboard'}</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ·{' '}
                {olderView
                  ? `${totalLeads} leads posted ${leadsData?.olderWindow?.from ?? 20}–${leadsData?.olderWindow?.to ?? 30} days ago`
                  : `${totalLeads} opportunities tracked`}
              </p>
              {latestScan && (
                <p className="text-xs text-gray-500 mt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <SidebarIcon name="pulse" className="w-3.5 h-3.5 text-green-600" />
                    Last scan: {new Date(latestScan.startedAt).toLocaleString()} · {latestScan.newLeadsFound} new leads found
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => checkForNewLeads(true)}
                disabled={checking}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait flex items-center gap-2"
              >
                <SidebarIcon name="refresh" className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Refresh Results'}
              </button>
              {refreshMessage && (
                <span className="text-xs text-gray-500">{refreshMessage}</span>
              )}
            </div>
          </div>

          {leadsError && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Lead data is currently unavailable. The dashboard remains accessible; try refreshing later.
            </p>
          )}

          {olderView && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              These leads were posted {leadsData?.olderWindow?.from ?? 20}–{leadsData?.olderWindow?.to ?? 30} days ago. The need may already be filled or a
              vendor chosen, so confirm it&apos;s still open before outreach. Leads older than {leadsData?.olderWindow?.to ?? 30} days are kept in the
              database but no longer shown.{' '}
              <button type="button" onClick={() => selectView('dashboard')} className="font-medium text-blue-700 hover:text-blue-900">
                ← Back to current leads
              </button>
            </div>
          )}

          {/* Metrics: each number opens the leads it counts */}
          <div className={`grid grid-cols-5 gap-3 mb-5 ${olderView ? 'hidden' : ''}`}>
            {[
              {
                card: 'total',
                label: `Total Opportunities (last ${leadsData?.recentDays || 20} days)`,
                value: totalLeads,
                note: `+${newThisWeek} found this week`,
                good: newThisWeek > 0,
              },
              { card: 'new-today', label: 'New Today', value: newToday, note: `${newYesterday} found yesterday`, good: newToday > 0 },
              { card: 'high-intent', label: 'High Intent (75+)', value: highIntentLeads, note: `+${highIntentThisWeek} this week`, good: highIntentThisWeek > 0 },
              {
                card: 'tenders',
                label: 'Active Tenders',
                value: tenders,
                note: `${tendersClosingSoon} closing within 7 days`,
                good: false,
              },
              { card: 'hiring', label: 'Hiring Companies', value: hiringCompanies, note: `+${hiringThisWeek} this week`, good: hiringThisWeek > 0 },
            ].map(({ card, label, value, note, good }) => (
              <button
                key={card}
                type="button"
                onClick={() => showCard(card as any)}
                title={`Show ${label.toLowerCase()} in the table`}
                className={`text-left rounded-lg p-4 transition-colors cursor-pointer border ${
                  cardActive(card) && !(card === 'total' && activeView === 'dashboard')
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-gray-100 border-transparent hover:bg-gray-200'
                }`}
              >
                <div className="text-xs text-gray-600 mb-2">{label}</div>
                <div className="text-2xl font-medium text-blue-700 font-mono underline decoration-dotted underline-offset-4">{value}</div>
                <div className={`text-xs mt-1 ${good ? 'text-green-600' : 'text-gray-500'}`}>{note}</div>
              </button>
            ))}
          </div>

          {/* How the total splits by signal type (the cards above show only two of
              the types; High Intent is a score, so it overlaps all of them). */}
          {!olderView && totalLeads > 0 && (
            <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-600">
              <span className="font-medium text-gray-700">{totalLeads} opportunities =</span>
              {SIGNAL_TYPES.map(({ value, label }) => ({ value, label, count: leads.filter((l: any) => signalType(l) === value).length }))
                .filter(({ count }) => count > 0)
                .map(({ value, label, count }, index) => (
                  <span key={value} className="flex items-center gap-1.5">
                    {index > 0 && <span className="text-gray-400">+</span>}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('all');
                        setFilters({ ...NO_FILTERS, signal: value });
                        scrollToTable();
                      }}
                      title={`Show ${label.toLowerCase()} leads in the table`}
                      className="rounded px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-800"
                    >
                      {count} {label.toLowerCase()}
                    </button>
                  </span>
                ))}
              <span className="text-gray-500 ml-1">· High Intent counts leads scoring 75+ across all of these types.</span>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 bg-white border border-gray-200 rounded-lg px-4 py-3">
            <FilterSelect
              label="ICP"
              value={filters.icp}
              onChange={(value) => setFilter('icp', value)}
              options={ICP_OPTIONS.map(({ value, label }) => ({ value, label, count: countWith('icp', value) }))}
            />
            <FilterSelect
              label="Region"
              value={filters.region}
              onChange={(value) => setFilter('region', value)}
              options={REGION_OPTIONS.map(({ value }) => ({ value, label: regionLabel(value), count: countWith('region', value) }))}
            />
            <FilterSelect
              label="Source"
              value={filters.source}
              onChange={(value) => setFilter('source', value)}
              options={SOURCE_TYPES.map((type) => ({ value: type, label: type, count: countWith('source', type) }))}
            />
            <FilterSelect
              label="Signal type"
              value={filters.signal}
              onChange={(value) => setFilter('signal', value)}
              options={SIGNAL_TYPES.map(({ value, label }) => ({ value, label, count: countWith('signal', value) }))}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={VENDOR_STATUS_OPTIONS.map(({ value, label }) => ({ value, label, count: countWith('status', value) }))}
            />
            <FilterSelect
              label="Service"
              value={filters.service}
              onChange={(value) => setFilter('service', value)}
              options={LOB_OPTIONS.map(({ value, label }) => ({ value, label, count: countWith('service', value) }))}
            />
            <FilterSelect
              label="Industry"
              value={filters.industry}
              onChange={(value) => setFilter('industry', value)}
              options={INDUSTRY_OPTIONS.map(({ value, label, priority }) => ({
                value,
                label: priority ? `${label} ★` : label,
                count: countWith('industry', value),
              }))}
            />
            {filters.quick !== 'all' && (
              <span className="inline-flex items-center gap-1 text-xs rounded-md border border-blue-300 bg-blue-50 text-blue-700 px-2 py-1">
                {QUICK_LABELS[filters.quick] || filters.quick}
                <button type="button" onClick={() => setFilter('quick', 'all')} className="hover:text-blue-900" aria-label="Remove this filter">
                  ×
                </button>
              </span>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500 text-right">
              Showing {filteredLeads.length} of {totalLeads}
              {leadsData?.recentDays ? (
                <span className="block text-[10px] text-gray-400">
                  {olderView
                    ? `Posted ${leadsData.olderWindow?.from ?? 20}–${leadsData.olderWindow?.to ?? 30} days ago`
                    : `Posted in the last ${leadsData.recentDays} days`}
                  {!olderView && olderCount ? ` · ${olderCount} in Older leads` : ''}
                  {leadsData.hiddenOtherRegions ? ` · ${leadsData.hiddenOtherRegions} outside USA/UAE/Europe/India/Kenya (ERP) hidden` : ''}
                  {leadsData.hiddenClosed ? ` · ${leadsData.hiddenClosed} closed job postings hidden` : ''}
                  {leadsData.hiddenOutsideIcp ? ` · ${leadsData.hiddenOutsideIcp} outside ICP hidden` : ''}
                  {leadsData.hiddenNotRelevant ? ` · ${leadsData.hiddenNotRelevant} marked not relevant hidden` : ''}
                </span>
              ) : null}
            </span>
          </div>

          {/* Table */}
          <div id="opportunities" className="bg-white border border-gray-200 rounded-lg overflow-hidden scroll-mt-4">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-900">Opportunities</span>
              <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-500 bg-gray-50">
                <SidebarIcon name="search" className="w-4 h-4 text-gray-400" />
                <span>Search companies...</span>
              </div>
            </div>
            
            {!leadsData && !leadsError ? (
              <div className="p-8 text-center text-gray-500">Loading leads...</div>
            ) : leadsError ? (
              <div className="p-8 text-center text-gray-500">Lead data is unavailable.</div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No leads found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '160px'}}>Company</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '90px'}}>Industry</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '70px'}}>LOB</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '110px'}}>Intent Signal</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '120px'}}>Recommended Service</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '46px'}}>Score</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '70px'}}>Source</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap" style={{width: '70px'}}>Discovered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead: any) => (
                      <tr 
                        key={lead.id}
                        onClick={() => {
                          saveView();
                          try {
                            sessionStorage.setItem(CAME_FROM_DASHBOARD_KEY, '1');
                          } catch {
                            // storage unavailable: Back still opens the dashboard
                          }
                          router.push(`/dashboard/leads/${lead.id}`);
                        }}
                        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-gray-900">{lead.companyName}</div>
                          {isLinkedInLead(lead) && (
                            <div className="text-[10px] text-blue-700 mt-0.5">in LinkedIn post · company unknown</div>
                          )}
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {leadRegion(lead) !== 'Unknown'
                              ? `${regionLabel(leadRegion(lead))}${lead.signals?.location ? ` · ${lead.signals.location}` : ''}`
                              : 'Location unknown'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${industryBadge(lead.industry || 'Other')}`}>
                            {lead.industry || 'Other'}
                            {isPriorityIndustry(lead.industry) && <SidebarIcon name="star" className="w-3 h-3 ml-1 fill-current" />}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${getLobBadge(lead.lob)}`}>
                            {lobLabel(lead.lob)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                            <SidebarIcon name="energy" className="w-3 h-3 text-amber-500" /> {lead.intentSignal || 'N/A'}
                          </span>
                          {vendorStatus(lead) === 'review' && (
                            <div
                              className="mt-1 inline-flex items-center text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                              title={vendorStatusReason(lead) || 'Vendor selection status unclear'}
                            >
                              <SidebarIcon name="warning" className="w-3 h-3 mr-1" /> Review required
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{lead.recommendedService || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-medium font-mono ${getScoreClass(lead.leadScore)}`}>
                            {lead.leadScore}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {(() => {
                            const source = leadSource(lead);
                            return (
                              <>
                                <div className="text-gray-700">
                                  {source.type}
                                  {lead.signals?.jobOpen === true && (
                                    <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-600" title="Posting still open">
                                      <SidebarIcon name="check" className="w-3 h-3" /> open
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-400">{source.where}</div>
                              </>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(lead.discoveredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Recent Scans Section */}
        <div className="px-6 pb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Recent Scans</h3>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {scanHistory.length === 0 ? (
              <div className="px-4 py-3 text-center text-sm text-gray-500">No scans yet</div>
            ) : (
              scanHistory.map((scan: any) => (
                <div key={scan.id} className="px-4 py-3 flex justify-between items-center text-sm">
                  <div>
                    <span className="text-gray-900 font-medium">{scan.newLeadsFound} new leads</span>
                    <span className="text-gray-500 ml-2">• {scan.companiesScanned} companies scanned</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(scan.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
