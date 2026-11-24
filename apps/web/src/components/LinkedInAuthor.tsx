'use client';

// Who to contact for a LinkedIn lead: the person who posted. Their profile,
// reach and post are free; Apollo can reveal their email / phone by their
// LinkedIn profile (credits, asked first), which also shows their title and
// employer, i.e. the company behind the post.
import { useEffect, useState } from 'react';
import Icon from '@/components/SidebarIcon';
import { apolloAPI } from '@/lib/api';
import { personaOutreach, type Brief } from '@/lib/leadBrief';

const PHONE_TYPES: Record<string, string> = { mobile: 'mobile', direct_dial: 'direct', work_direct: 'direct', work: 'work', work_hq: 'office' };
const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

export default function LinkedInAuthor({ lead, brief, onChange }: { lead: any; brief: Brief; onChange: () => void }) {
  const signals = lead.signals || {};
  const post = signals.linkedinPost || {};
  const author = signals.apollo?.author || null;
  const name: string = author?.name || post.author || signals.author || lead.companyName;
  const profileUrl: string | null = author?.linkedinUrl || post.authorUrl || signals.authorProfileUrl || null;
  const postUrl: string | null = signals.tavilyUrl || null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Phone numbers arrive from Apollo shortly after the reveal: refresh until they do.
  const waitingForPhone = author?.phoneStatus === 'pending' && author?.revealedAt && Date.now() - new Date(author.revealedAt).getTime() < 180000;
  useEffect(() => {
    if (!waitingForPhone) return;
    const timer = setInterval(onChange, 5000);
    return () => clearInterval(timer);
  }, [waitingForPhone, onChange]);

  const reveal = async (type: 'email' | 'phone') => {
    const cost =
      type === 'email'
        ? 'This uses 1 Apollo credit (no charge if not found).'
        : author
          ? 'This uses extra Apollo credits if a number is found.'
          : 'This uses 1 credit for the person plus extra credits if a number is found.';
    if (!window.confirm(`Look up ${name}'s ${type === 'email' ? 'email, title and company' : 'phone number'} in Apollo from their LinkedIn profile? ${cost}`)) return;
    setBusy(type);
    setError('');
    try {
      await apolloAPI.revealAuthor(lead.id, type);
      onChange();
    } catch (err: any) {
      setError(err?.message || 'Apollo request failed');
    } finally {
      setBusy(null);
    }
  };

  const outreach = personaOutreach(brief, { name, title: author?.title || null });
  const phoneDone = ['found', 'pending', 'none'].includes(author?.phoneStatus);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="font-medium text-gray-900 flex flex-wrap items-center gap-x-2">
          {name}
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-normal text-blue-600 hover:text-blue-800">
              in Profile ↗
            </a>
          )}
        </div>
        {author?.title || author?.organization ? (
          <div className="text-xs text-gray-700">
            {[author.title, author.organization].filter(Boolean).join(' · ')}
          </div>
        ) : (
          <div className="text-xs text-gray-500">The person who posted this request. Reach out to them directly.</div>
        )}
        <div className="text-xs text-gray-500 mt-1">
          {[
            post.authorFollowers != null && `${Number(post.authorFollowers).toLocaleString()} followers`,
            formatDate(post.postedAt || signals.postedAt) && `posted ${formatDate(post.postedAt || signals.postedAt)}`,
            post.likes != null && `${Number(post.likes).toLocaleString()} likes`,
            post.comments != null && `${Number(post.comments).toLocaleString()} comments`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {author && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-1 text-xs">
          {author.email ? (
            <div>
              <Icon name="mail" className="inline-block -mt-0.5 mr-1 w-3.5 h-3.5" />
              <a href={`mailto:${author.email}`} className="text-blue-600 hover:text-blue-800 break-all">
                {author.email}
              </a>
              {author.emailStatus && <span className="text-gray-400"> · {author.emailStatus}</span>}
            </div>
          ) : (
            <div className="text-gray-500">No email found in Apollo</div>
          )}
          {(author.phones || []).map((phone: any) => (
            <div key={phone.number} className="text-gray-700">
              <Icon name="phone" className="inline-block -mt-0.5 mr-1 w-3.5 h-3.5" /><a href={`tel:${phone.number}`} className="hover:text-blue-700">{phone.number}</a>
              {phone.type && <span className="text-gray-400"> · {PHONE_TYPES[phone.type] || phone.type}</span>}
            </div>
          ))}
          {!(author.phones || []).length && author.phone && (
            <div className="text-gray-700">
              <Icon name="phone" className="inline-block -mt-0.5 mr-1 w-3.5 h-3.5" /><a href={`tel:${author.phone}`} className="hover:text-blue-700">{author.phone}</a>
              {author.phoneIsCompany && <span className="text-gray-400"> · company line</span>}
            </div>
          )}
          {author.phoneStatus === 'pending' && <div className="text-amber-700">Looking up phone numbers… (can take a minute)</div>}
          {author.phoneStatus === 'none' && <div className="text-gray-500">No direct phone number found</div>}
          {author.location && <div className="text-gray-500"><Icon name="pin" className="inline-block -mt-0.5 mr-1 w-3.5 h-3.5" />{author.location}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {postUrl && (
          <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700">
            Reply on their post ↗
          </a>
        )}
        {profileUrl && (
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50">
            Message on LinkedIn ↗
          </a>
        )}
        {!author && profileUrl && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => reveal('email')}
            className="text-xs px-2 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            {busy === 'email' ? 'Looking up…' : <span className="inline-flex items-center gap-1"><Icon name="mail" className="w-3 h-3" /> Reveal email &amp; company · 1 credit</span>}
          </button>
        )}
        {profileUrl && !phoneDone && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => reveal('phone')}
            className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === 'phone' ? 'Requesting…' : <span className="inline-flex items-center gap-1"><Icon name="phone" className="w-3 h-3" /> Reveal phone · credits</span>}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={outreach.linkedin} label="Copy LinkedIn message" />
        {author?.email && <CopyButton text={`Subject: ${outreach.email.subject}\n\n${outreach.email.body}`} label="Copy email" />}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
