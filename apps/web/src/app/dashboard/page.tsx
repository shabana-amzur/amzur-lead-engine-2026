'use client';

import useSWR from 'swr';
import { leadsAPI, scanAPI } from '@/lib/api';
import { LOB_OPTIONS, lobBadge, lobLabel } from '@/lib/lobs';
import { INDUSTRY_OPTIONS, PRIORITY_INDUSTRIES, industryBadge, isPriorityIndustry } from '@/lib/industries';
import { describeSource, isLinkedInLead } from '@/lib/sources';
import { ICP_OPTIONS, SIGNAL_TYPES, SOURCE_TYPES, VENDOR_STATUS_OPTIONS, icpStatus, signalType, sourceType, vendorStatus, vendorStatusReason } from '@/lib/signals';
import { REGION_OPTIONS, leadRegion, regionLabel } from '@/lib/regions';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type Filters = { icp: string; region: string; source: string; signal: string; status: string; service: string; industry: string };
const NO_FILTERS: Filters = { icp: 'all', region: 'all', source: 'all', signal: 'all', status: 'all', service: 'all', industry: 'all' };

function matchesFilters(lead: any, filters: Filters) {
  return (
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

  const scrollToTable = () =>
    document.getElementById('opportunities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  // Sidebar shortcuts toggle one filter and jump to the table.
  const toggleFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: current[key] === value ? 'all' : value }));
    scrollToTable();
  };

  const selectView = (view: 'dashboard' | 'all') => {
    setActiveView(view);
    setFilters(NO_FILTERS);
    if (view === 'dashboard') {
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
  const { data: leadsData, error: leadsError, mutate: refreshLeads } = useSWR(
    '/api/leads?limit=200',
    () => leadsAPI.getAll({ page: 1, limit: 200 })
  );

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
        setRefreshMessage(`Leads were refreshed today at ${last}. New leads are searched once a day; the next search runs tomorrow.`);
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
  const highIntentLeads = leads.filter((l: any) => l.leadScore >= 75 && vendorStatus(l) !== 'review').length;
  const tenders = leads.filter((l: any) => signalType(l) === 'Tender / RFP').length;
  const hiringCompanies = leads.filter((l: any) => signalType(l) === 'Hiring').length;

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
        <div className="p-5 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-900 flex items-center">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            Lead Engine
          </div>
          <div className="text-xs text-gray-500 mt-1">Amzur Technologies</div>
        </div>
        
        <div className="p-3 flex-1 overflow-y-auto">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2">Discover</div>
          <button
            type="button"
            onClick={() => selectView('dashboard')}
            className={navItemClass(activeView === 'dashboard' && !hasFilters)}
          >
            <span className="flex items-center gap-2"><span>📊</span> Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('all')}
            className={navItemClass(activeView === 'all' && !hasFilters)}
          >
            <span className="flex items-center gap-2"><span>📋</span> All Leads</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{totalLeads}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleFilter('signal', 'Tender / RFP')}
            className={navItemClass(filters.signal === 'Tender / RFP')}
          >
            <span className="flex items-center gap-2"><span>📄</span> Tenders</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{tenders}</span>
          </button>

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Services</div>
          {LOB_OPTIONS.map(({ value: lob, label, icon }) => (
            <button
              type="button"
              key={lob}
              onClick={() => toggleFilter('service', lob)}
              className={navItemClass(filters.service === lob)}
            >
              <span className="flex items-center gap-2"><span>{icon}</span> {label}</span>
              <span className="text-[10px] text-gray-400">
                {leads.filter((l: any) => l.lob === lob).length}
              </span>
            </button>
          ))}

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Priority Industries</div>
          {PRIORITY_INDUSTRIES.map(({ value, label, icon }) => (
            <button
              type="button"
              key={value}
              onClick={() => toggleFilter('industry', value)}
              className={navItemClass(filters.industry === value)}
            >
              <span className="flex items-center gap-2"><span>{icon}</span> {label}</span>
              <span className="text-[10px] text-gray-400">{industryCount(value)}</span>
            </button>
          ))}

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">Settings</div>
          <div
            title="Configuration is not available yet"
            className="mb-1 px-2 py-2 rounded-md text-sm text-gray-400 cursor-not-allowed flex items-center gap-2 justify-between"
          >
            <span className="flex items-center gap-2"><span>⚙️</span> Configuration</span>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Soon</span>
          </div>
        </div>
        
        <div className="p-3 border-t border-gray-200 text-xs text-gray-500">
          <div className="flex items-center gap-2 mb-1">
            <span>🤖</span>
            <span>Auto-Discovery Engine</span>
          </div>
          {latestScan && (
            <div className="text-[10px] text-gray-400 ml-5">
              Last: {new Date(latestScan.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="text-[10px] text-gray-400 ml-5">
            Searches once a day
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div id="dashboard-main" className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <h1 className="text-lg font-medium text-gray-900">Lead Discovery Dashboard</h1>
              <p className="text-sm text-gray-600 mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {totalLeads} opportunities tracked
              </p>
              {latestScan && (
                <p className="text-xs text-gray-500 mt-1">
                  🤖 Last scan: {new Date(latestScan.startedAt).toLocaleString()} · {latestScan.newLeadsFound} new leads found
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => checkForNewLeads(true)}
                disabled={checking}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait flex items-center gap-2"
              >
                <span className={checking ? 'animate-spin' : ''}>🔄</span>
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

          {/* Metrics */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">Total Opportunities</div>
              <div className="text-2xl font-medium text-gray-900 font-mono">{totalLeads}</div>
              <div className="text-xs text-green-600 mt-1">↗ +{Math.floor(totalLeads * 0.15)} this week</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">New Today</div>
              <div className="text-2xl font-medium text-gray-900 font-mono">{latestScan?.newLeadsFound || 0}</div>
              <div className="text-xs text-green-600 mt-1">↗ +{Math.max(0, (latestScan?.newLeadsFound || 0) - 3)} vs yesterday</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">High Intent (75+)</div>
              <div className="text-2xl font-medium text-gray-900 font-mono">{highIntentLeads}</div>
              <div className="text-xs text-green-600 mt-1">↗ +{Math.floor(highIntentLeads * 0.15)} this week</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">Active Tenders</div>
              <div className="text-2xl font-medium text-gray-900 font-mono">{tenders}</div>
              <div className="text-xs text-gray-500 mt-1">{Math.max(1, Math.floor(tenders * 0.15))} closing soon</div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-xs text-gray-600 mb-2">Hiring Companies</div>
              <div className="text-2xl font-medium text-gray-900 font-mono">{hiringCompanies}</div>
              <div className="text-xs text-green-600 mt-1">↗ +{Math.floor(hiringCompanies * 0.15)} this week</div>
            </div>
          </div>

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
                  Posted in the last {leadsData.recentDays} days
                  {leadsData.hiddenOlder ? ` · ${leadsData.hiddenOlder} older leads hidden` : ''}
                  {leadsData.hiddenOtherRegions ? ` · ${leadsData.hiddenOtherRegions} outside USA/UAE/Europe/India hidden` : ''}
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
                <span>🔍</span>
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
                        onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
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
                            {lead.industry || 'Other'}{isPriorityIndustry(lead.industry) ? ' ★' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${getLobBadge(lead.lob)}`}>
                            {lobLabel(lead.lob)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200">
                            ⚡ {lead.intentSignal || 'N/A'}
                          </span>
                          {vendorStatus(lead) === 'review' && (
                            <div
                              className="mt-1 inline-flex items-center text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                              title={vendorStatusReason(lead) || 'Vendor selection status unclear'}
                            >
                              ⚠ Review required
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
                            const source = describeSource(lead.signals?.tavilyUrl);
                            return (
                              <>
                                <div className="text-gray-700">
                                  {source.type}
                                  {lead.signals?.jobOpen === true && <span className="ml-1 text-emerald-600" title="Posting still open">✓ open</span>}
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
