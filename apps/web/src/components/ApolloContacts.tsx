'use client';

// Decision makers from Apollo for one lead: a free search for ICP roles, then
// "Reveal email" per person (1 Apollo credit each, asked before spending).
// Revealed contacts are saved on the lead, so they are never paid for twice.
import { useEffect, useRef, useState } from 'react';
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
  phones?: { number: string; type: string | null }[];
  phoneStatus?: 'pending' | 'found' | 'none';
  revealedAt?: string;
  location: string | null;
  icpRank: number;
};

const ICP_BADGE: Record<number, [string, string]> = {
  4: ['ICP role', 'bg-emerald-100 text-emerald-800'],
  3: ['ICP role', 'bg-emerald-100 text-emerald-800'],
  2: ['Tech / ops leader', 'bg-blue-50 text-blue-700'],
  1: ['Senior leader', 'bg-gray-100 text-gray-600'],
};

const PHONE_TYPES: Record<string, string> = { mobile: 'mobile', direct_dial: 'direct', work_direct: 'direct', work: 'work', work_hq: 'office' };

export default function ApolloContacts({ lead, onChange }: { lead: any; onChange: () => void }) {
  const { data: status } = useSWR('/api/leads/apollo/status', () => apolloAPI.status());
  const saved = lead.signals?.apollo || {};
  const candidates: Candidate[] = saved.candidates || [];
  const contacts: Contact[] = saved.contacts || [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  // Revealed people first (in candidate order), then the rest.
  const people: { candidate: Candidate; contact?: Contact }[] = [
    ...candidates.map((candidate) => ({ candidate, contact: byId.get(candidate.id) })),
    ...contacts
      .filter((c) => !candidates.some((k) => k.id === c.id))
      .map((c) => ({ candidate: { id: c.id, name: c.name, title: c.title, hasEmail: !!c.email, hasPhone: true, icpRank: c.icpRank }, contact: c })),
  ];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const searched = useRef(false);

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

  // Names and titles are free: look them up as soon as the page opens.
  useEffect(() => {
    if (status?.configured && !saved.searchedAt && !searched.current) {
      searched.current = true;
      run('search', () => apolloAPI.findContacts(lead.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured, saved.searchedAt, lead.id]);

  // Phone numbers arrive from Apollo a little after the reveal: refresh until they do (up to ~3 minutes).
  const waitingForPhone = contacts.some(
    (c) => c.phoneStatus === 'pending' && c.revealedAt && Date.now() - new Date(c.revealedAt).getTime() < 180000
  );
  useEffect(() => {
    if (!waitingForPhone) return;
    const timer = setInterval(onChange, 5000);
    return () => clearInterval(timer);
  }, [waitingForPhone, onChange]);

  if (status && !status.configured) {
    return (
      <p className="text-xs text-gray-500">
        Apollo isn&apos;t connected on this server. Add <code className="font-mono">APOLLO_API_KEY</code> to the API environment to find
        decision makers and their contact details.
      </p>
    );
  }

  const revealEmail = (candidate: Candidate) => {
    if (window.confirm(`Reveal ${candidate.name}'s email? This uses 1 Apollo credit (no charge if not found).`)) {
      run(`${candidate.id}:email`, () => apolloAPI.revealContact(lead.id, candidate.id, 'email'));
    }
  };
  const revealPhone = (candidate: Candidate, contact?: Contact) => {
    const cost = contact ? 'This uses extra Apollo credits if a number is found' : 'This uses 1 credit for the person plus extra credits if a number is found';
    if (window.confirm(`Reveal ${candidate.name}'s phone number? ${cost} (no charge if none is found).`)) {
      run(`${candidate.id}:phone`, () => apolloAPI.revealContact(lead.id, candidate.id, 'phone'));
    }
  };

  return (
    <div className="space-y-3">
      {!saved.searchedAt && busy === 'search' && <p className="text-sm text-gray-500">Finding decision makers in Apollo…</p>}

      {people.length > 0 && (
        <>
          <p className="text-xs text-gray-500">
            {people.length} decision maker{people.length === 1 ? '' : 's'} in Apollo{saved.matchedBy ? ` (by ${saved.matchedBy})` : ''}. Names and
            titles are free; revealing contact details uses credits.
          </p>
          <ul className="space-y-2.5">
            {people.map(({ candidate, contact }) => {
              const badge = ICP_BADGE[candidate.icpRank];
              const phoneDone = contact?.phoneStatus === 'found' || contact?.phoneStatus === 'pending' || contact?.phoneStatus === 'none';
              return (
                <li key={candidate.id} className={`rounded-md border p-3 text-sm ${contact ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{contact?.name || candidate.name}</div>
                      <div className="text-xs text-gray-600">{contact?.title || candidate.title || 'Title unknown'}</div>
                    </div>
                    {badge && <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${badge[1]}`}>{badge[0]}</span>}
                  </div>

                  {contact && (
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
                      {(contact.phones || []).map((phone) => (
                        <div key={phone.number} className="text-gray-700">
                          📞 <a href={`tel:${phone.number}`} className="hover:text-blue-700">{phone.number}</a>
                          {phone.type && <span className="text-gray-400"> · {PHONE_TYPES[phone.type] || phone.type}</span>}
                        </div>
                      ))}
                      {!(contact.phones || []).length && contact.phone && (
                        <div className="text-gray-700">
                          📞 <a href={`tel:${contact.phone}`} className="hover:text-blue-700">{contact.phone}</a>
                          {contact.phoneIsCompany && <span className="text-gray-400"> · company line</span>}
                        </div>
                      )}
                      {contact.phoneStatus === 'pending' && (
                        <div className="text-amber-700">{waitingForPhone ? 'Looking up phone numbers… (can take a minute)' : 'Phone lookup still pending in Apollo'}</div>
                      )}
                      {contact.phoneStatus === 'none' && <div className="text-gray-500">No direct phone number found</div>}
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
                  )}

                  {(!contact || !phoneDone) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!contact &&
                        (candidate.hasEmail ? (
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => revealEmail(candidate)}
                            className="text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            {busy === `${candidate.id}:email` ? 'Revealing…' : '✉️ Reveal email · 1 credit'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 py-1">No email in Apollo</span>
                        ))}
                      {candidate.hasPhone && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => revealPhone(candidate, contact)}
                          className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {busy === `${candidate.id}:phone` ? 'Requesting…' : '📞 Reveal phone · credits'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {saved.searchedAt && people.length === 0 && (
        <p className="text-xs text-gray-500">No senior contacts found in Apollo{saved.matchedBy ? ` by ${saved.matchedBy}` : ''}.</p>
      )}

      {saved.searchedAt && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('search', () => apolloAPI.findContacts(lead.id))}
          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {busy === 'search' ? 'Searching Apollo…' : '↻ Search Apollo again (free)'}
        </button>
      )}
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
