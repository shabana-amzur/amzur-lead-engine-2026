'use client';

import { use } from 'react';
import useSWR from 'swr';
import { leadsAPI, authAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const { data, error } = useSWR(
    `/api/leads/${id}`,
    () => leadsAPI.getById(id)
  );

  const handleLogout = () => {
    authAPI.logout();
    router.push('/login');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Amzur Lead Engine</h1>
            <button onClick={handleLogout} className="text-gray-600 hover:text-gray-900">
              Logout
            </button>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-red-600">Failed to load lead details</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-4 text-primary-600 hover:text-primary-700"
            >
              ← Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading lead details...</div>
      </div>
    );
  }

  const lead = data.lead;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Amzur Lead Engine</h1>
          <button onClick={handleLogout} className="text-gray-600 hover:text-gray-900">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-8 py-6 text-white">
            <h2 className="text-3xl font-bold">{lead.companyName}</h2>
            <p className="text-primary-100 mt-2">{lead.hq}</p>
          </div>

          {/* Lead Score Badge */}
          <div className="px-8 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">Lead Score:</span>
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-bold ${
                lead.leadScore >= 80 ? 'bg-green-100 text-green-800' :
                lead.leadScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {lead.leadScore}/100
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Company Information</h3>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Industry</label>
                <p className="text-gray-900 mt-1">{lead.industry || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Website</label>
                <p className="text-gray-900 mt-1">
                  {lead.website ? (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">
                      {lead.website}
                    </a>
                  ) : 'N/A'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Employees</label>
                <p className="text-gray-900 mt-1">{lead.employees?.toLocaleString() || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Revenue</label>
                <p className="text-gray-900 mt-1">
                  {lead.revenue ? `$${(lead.revenue / 1000000).toFixed(1)}M` : 'N/A'}
                </p>
              </div>
            </div>

            {/* Lead Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Lead Details</h3>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Line of Business</label>
                <p className="text-gray-900 mt-1">{lead.lob || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Recommended Service</label>
                <p className="text-gray-900 mt-1">{lead.recommendedService || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Intent Signal</label>
                <p className="text-gray-900 mt-1">{lead.intentSignal || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Source</label>
                <p className="text-gray-900 mt-1">{lead.source || 'N/A'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Outreach Email</label>
                <p className="text-gray-900 mt-1">
                  {lead.outreachEmail ? (
                    <a href={`mailto:${lead.outreachEmail}`} className="text-primary-600 hover:text-primary-700">
                      {lead.outreachEmail}
                    </a>
                  ) : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Signals Section */}
          {lead.signals && (
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Signals & Context</h3>
              
              {lead.signals.techStack && lead.signals.techStack.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-500 block mb-2">Tech Stack</label>
                  <div className="flex flex-wrap gap-2">
                    {lead.signals.techStack.map((tech: string, idx: number) => (
                      <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {lead.signals.whyThisLead && lead.signals.whyThisLead.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-500 block mb-2">Why This Lead</label>
                  <ul className="list-disc list-inside space-y-1 text-gray-900">
                    {lead.signals.whyThisLead.map((reason: string, idx: number) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {lead.signals.searchContext && (
                <div>
                  <label className="text-sm font-medium text-gray-500 block mb-2">Discovery Context</label>
                  <p className="text-gray-700 text-sm">{lead.signals.searchContext}</p>
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          <div className="px-8 py-4 bg-white border-t border-gray-200 text-sm text-gray-500">
            Discovered: {new Date(lead.discoveredAt).toLocaleString()}
          </div>
        </div>
      </main>
    </div>
  );
}
