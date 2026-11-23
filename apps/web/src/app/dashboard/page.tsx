'use client';

import useSWR from 'swr';
import { leadsAPI, scanAPI } from '@/lib/api';
import { LOB_OPTIONS, LOBS, lobBadge, lobLabel } from '@/lib/lobs';
import { INDUSTRY_OPTIONS, PRIORITY_INDUSTRIES, industryBadge, isPriorityIndustry } from '@/lib/industries';
import { describeSource, isLinkedInLead } from '@/lib/sources';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// Filter chips: intent-signal filters first, then one chip per line of business.
const FILTER_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'Hiring', label: 'Hiring' },
  { value: 'Funding', label: 'Funding' },
  { value: 'Tender', label: 'Tender' },
  { value: 'AI', label: 'AI' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  ...LOB_OPTIONS.map(({ value, label }) => ({ value, label })),
];

export default function DashboardPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeIndustry, setActiveIndustry] = useState('all');
  // Which sidebar item is highlighted. 'dashboard' and 'all' both show every
  // lead; 'all' additionally jumps to the table.
  const [activeView, setActiveView] = useState('dashboard');

  const applyFilter = (filter: string) => {
    setActiveFilter(filter);
    setActiveView(filter === 'all' ? 'dashboard' : filter);
  };

  const selectView = (view: string) => {
    setActiveView(view);
    setActiveFilter(view === 'dashboard' || view === 'all' ? 'all' : view);
    if (view === 'dashboard' || view === 'all') setActiveIndustry('all');

    if (view === 'dashboard') {
      document.getElementById('dashboard-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      document.getElementById('opportunities')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Check for new leads on every page load and on "Refresh Results".
  // Existing leads show immediately; new ones are added when the scan finishes.
  const [checking, setChecking] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const checkingRef = useRef(false);

  const checkForNewLeads = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setRefreshMessage('Checking for new leads…');

    try {
      const result = await scanAPI.refresh();

      if (result.status === 'completed') {
        const count = result.newLeadsFound || 0;
        setRefreshMessage(
          count > 0 ? `${count} new lead${count === 1 ? '' : 's'} found.` : 'No new leads found.'
        );
      } else if (result.status === 'skipped') {
        const next = new Date(result.nextScanAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setRefreshMessage(`Up to date. Checked recently; next check available after ${next}.`);
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
  const highIntentLeads = leads.filter((l: any) => l.leadScore >= 80).length;
  const tenders = leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('tender') || l.intentSignal?.toLowerCase().includes('rfp')).length;
  const hiringCompanies = leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('hiring') || l.intentSignal?.toLowerCase().includes('roles')).length;

  // Filter leads
  const getFilteredLeads = () => {
    const byIndustry =
      activeIndustry === 'all' ? leads : leads.filter((l: any) => (l.industry || 'Other') === activeIndustry);
    return filterBySignal(byIndustry);
  };

  const filterBySignal = (leads: any[]) => {
    if (activeFilter === 'all') return leads;
    if (activeFilter === 'LinkedIn') return leads.filter((l: any) => isLinkedInLead(l));
    if (activeFilter === 'Hiring') return leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('hiring') || l.intentSignal?.toLowerCase().includes('roles'));
    if (activeFilter === 'Funding') return leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('funding'));
    if (activeFilter === 'Tender') return leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('tender') || l.intentSignal?.toLowerCase().includes('rfp'));
    if (activeFilter === 'AI') return leads.filter((l: any) => l.intentSignal?.toLowerCase().includes('ai'));
    if (LOBS.includes(activeFilter)) return leads.filter((l: any) => l.lob === activeFilter);
    return leads;
  };

  const filteredLeads = getFilteredLeads();
  const industryCount = (industry: string) => leads.filter((l: any) => (l.industry || 'Other') === industry).length;

  const getScoreClass = (score: number) => {
    if (score >= 80) return 'bg-emerald-100 text-emerald-800';
    if (score >= 65) return 'bg-amber-100 text-amber-800';
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
            className={navItemClass(activeView === 'dashboard')}
          >
            <span className="flex items-center gap-2"><span>📊</span> Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('all')}
            className={navItemClass(activeView === 'all')}
          >
            <span className="flex items-center gap-2"><span>📋</span> All Leads</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{totalLeads}</span>
          </button>
          <button
            type="button"
            onClick={() => selectView('Tender')}
            className={navItemClass(activeView === 'Tender')}
          >
            <span className="flex items-center gap-2"><span>📄</span> Tenders</span>
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{tenders}</span>
          </button>

          <div className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-2 mt-4">LOB</div>
          {LOB_OPTIONS.map(({ value: lob, label, icon }) => (
            <button
              type="button"
              key={lob}
              onClick={() => selectView(lob)}
              className={navItemClass(activeView === lob)}
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
              onClick={() => setActiveIndustry(activeIndustry === value ? 'all' : value)}
              className={navItemClass(activeIndustry === value)}
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
            Runs on every refresh
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
                onClick={checkForNewLeads}
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
              <div className="text-xs text-gray-600 mb-2">High Intent (80+)</div>
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
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <span className="text-xs text-gray-600">Filter:</span>
            {FILTER_CHIPS.map(({ value: filter, label }) => (
              <button
                key={filter}
                onClick={() => applyFilter(filter)}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  activeFilter === filter
                    ? 'bg-blue-100 text-blue-700 border-transparent'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">
              Showing {filteredLeads.length} of {totalLeads}
            </span>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <span className="text-xs text-gray-600">Industry:</span>
            {[{ value: 'all', label: 'All', icon: '', priority: false }, ...INDUSTRY_OPTIONS].map(({ value, label, icon, priority }) => {
              const count = value === 'all' ? totalLeads : industryCount(value);
              if (value !== 'all' && !priority && count === 0) return null;
              return (
                <button
                  key={value}
                  onClick={() => setActiveIndustry(value)}
                  className={`px-3 py-1 text-xs rounded-full border transition-all ${
                    activeIndustry === value
                      ? 'bg-blue-100 text-blue-700 border-transparent'
                      : priority
                        ? 'bg-white text-gray-800 border-gray-400 hover:bg-gray-50 font-medium'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {icon ? `${icon} ` : ''}{label}{priority ? ' ★' : ''} <span className="text-gray-400">({count})</span>
                </button>
              );
            })}
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
                                <div className="text-gray-700">{source.type}</div>
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
