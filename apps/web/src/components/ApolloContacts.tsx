'use client';

// Decision makers from Apollo for one lead: a free search for ICP roles, then
// "Reveal email" per person (1 Apollo credit each, asked before spending).
// Revealed contacts are saved on the lead, so they are never paid for twice.
import { useState } from 'react';
import useSWR from 'swr';
import { apolloAPI } from '@/lib/api';

type Candidate = { id: string; name: string; title: string | null; hasEmail: boolean; hasPhone: boolean; icpRank: number };
type Contact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  phoneIsCompany?: boolean;
  location: string | null;
  icpRank: number;
};

const ICP_LABEL = ['', 'Senior leader', 'Senior tech / ops', 'ICP role', 'ICP role'];
const ICP_STYLE = ['', 'bg-gray-100 text-gray-600', 'bg-blue-50 text-blue-700', 'bg-emerald-50 text-emerald-700', 'bg-emerald-50 text-emerald-700'];

export default function ApolloContacts({ lead, onChange }: { lead: any; onChange: () => void }) {
  const { data: status } = useSWR('/api/leads/apollo/status', () => apolloAPI.status());
  const saved = lead.signals?.apollo || {};
  const candidates: Candidate[] = saved.candidates || [];
  const contacts: Contact[] = saved.contacts || [];
  const revealedIds = new Set(contacts.map((c) => c.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      onChange();
    } catch (err: any) {
      setError(err?.message || 'Apollo request failed');
    } finally {
      setBusy(null);
    }
  };

  if (status && !status.configured) {
    return (
      <p className="text-xs text-gray-500">
        Apollo isn&apos;t connected on this server. Add <code className="font-mono">APOLLO_API_KEY</code> to the API environment to find
        decision makers and their emails.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <ul className="space-y-3">
          {contacts.map((contact) => (
            <li key={contact.id} className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900">{contact.name}</div>
                  <div className="text-xs text-gray-600">{contact.title || 'Title unknown'}</div>
                </div>
                {contact.icpRank >= 3 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">ICP role</span>}
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {contact.email ? (
                  <div>
                    ✉️{' '}
                    <a href={`mailto:${contact.email}`} className="text-blue-600 hover:text-blue-800 break-all">
                      {contact.email}
                    </a>
                    {contact.emailStatus && <span className="text-gray-400"> · {contact.emailStatus}</span>}
                  </div>
                ) : (
                  <div className="text-gray-500">No email found in Apollo</div>
                )}
                {contact.phone && (
                  <div className="text-gray-700">
                    📞 {contact.phone}
                    {contact.phoneIsCompany && <span className="text-gray-400"> · company line</span>}
                  </div>
                )}
                {contact.linkedinUrl && (
                  <div>
                    💼{' '}
                    <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                      LinkedIn profile ↗
                    </a>
                  </div>
                )}
                {contact.location && <div className="text-gray-500">📍 {contact.location}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {candidates.filter((c) => !revealedIds.has(c.id)).length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-1.5">
            Found in Apollo{saved.matchedBy ? ` by ${saved.matchedBy}` : ''}. Revealing an email uses 1 credit.
          </div>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
            {candidates
              .filter((c) => !revealedIds.has(c.id))
              .map((candidate) => (
                <li key={candidate.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-gray-900 truncate">
                      {candidate.name}
                      {candidate.icpRank > 0 && (
                        <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${ICP_STYLE[candidate.icpRank]}`}>{ICP_LABEL[candidate.icpRank]}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{candidate.title || 'Title unknown'}</div>
                  </div>
                  {candidate.hasEmail ? (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        if (window.confirm(`Reveal ${candidate.name}'s email? This uses 1 Apollo credit (no charge if not found).`)) {
                          run(candidate.id, () => apolloAPI.revealContact(lead.id, candidate.id));
                        }
                      }}
                      className="shrink-0 text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {busy === candidate.id ? 'Revealing…' : 'Reveal email'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-400">No email in Apollo</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {saved.searchedAt && candidates.length === 0 && (
        <p className="text-xs text-gray-500">No senior contacts found in Apollo{saved.matchedBy ? ` by ${saved.matchedBy}` : ''}.</p>
      )}

      <button
        type="button"
        disabled={!!busy}
        onClick={() => run('search', () => apolloAPI.findContacts(lead.id))}
        className="w-full text-sm px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy === 'search' ? 'Searching Apollo…' : saved.searchedAt ? '↻ Search Apollo again (free)' : '🔍 Find decision makers in Apollo (free)'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Button for the ICP card: company revenue / headcount from Apollo (1 credit). */
export function ApolloCompanyButton({ lead, onChange }: { lead: any; onChange: () => void }) {
  const { data: status } = useSWR('/api/leads/apollo/status', () => apolloAPI.status());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checked = lead.signals?.apollo?.company;
  if (!status?.configured) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {checked ? (
        <p className="text-xs text-gray-500">
          Apollo: {checked.revenuePrinted ? `$${checked.revenuePrinted} revenue` : 'revenue unknown'}
          {checked.employees ? ` · ${Number(checked.employees).toLocaleString()} employees` : ''}
          {checked.founded ? ` · founded ${checked.founded}` : ''}
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Look up ${lead.companyName}'s revenue and headcount in Apollo? This uses 1 credit (no charge if not found).`)) return;
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
          }}
          className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? 'Checking Apollo…' : 'Verify size in Apollo (1 credit)'}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
