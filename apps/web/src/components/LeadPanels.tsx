'use client';

// Lead page panels: "why now" timeline, multi-step outreach sequence,
// matching case studies and the activity log with notes.
import { useState } from 'react';
import { leadsAPI } from '@/lib/api';
import type { Brief, TimelineEvent } from '@/lib/leadBrief';
import type { CaseStudy } from '@/lib/caseStudies';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
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
      className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shrink-0"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

const EVENT_STYLE: Record<TimelineEvent['kind'], string> = {
  source: 'bg-blue-600',
  news: 'bg-amber-500',
  funding: 'bg-emerald-600',
  found: 'bg-gray-400',
  contact: 'bg-purple-500',
  workflow: 'bg-gray-400',
};

export function WhyNowTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Why now</h2>
      <p className="text-xs text-gray-400 mb-4">Everything we know about this company, newest first. Recent, stacked signals are the best reason to call.</p>
      <ol className="relative border-l border-gray-200 ml-2 space-y-4">
        {events.slice(0, 10).map((event, i) => (
          <li key={`${event.date}-${i}`} className="ml-5">
            <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${EVENT_STYLE[event.kind]}`} />
            <div className="text-xs text-gray-500">{formatDate(event.date)}</div>
            <div className="text-sm font-medium text-gray-900">{event.label}</div>
            {event.detail &&
              (event.url ? (
                <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:text-blue-900">
                  {event.detail} ↗
                </a>
              ) : (
                <div className="text-sm text-gray-600">{event.detail}</div>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

const CHANNEL_STYLE: Record<string, string> = {
  Email: 'bg-blue-50 text-blue-700 border-blue-200',
  LinkedIn: 'bg-sky-50 text-sky-700 border-sky-200',
  Call: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function OutreachSequence({ brief }: { brief: Brief }) {
  const [open, setOpen] = useState(0);
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Outreach sequence</h2>
      <p className="text-xs text-gray-400 mb-4">
        {brief.context.kind === 'rfp' ? 'For a tender: contact through the official channel only.' : 'A two-week sequence written from this lead’s facts. Personalise before sending.'}
        {' '}Contacts in Who to contact each get a version for their role.
      </p>
      <ol className="space-y-2">
        {brief.sequence.map((step, index) => (
          <li key={`${step.day}-${step.title}`} className="border border-gray-200 rounded-md">
            <button
              type="button"
              onClick={() => setOpen(open === index ? -1 : index)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left"
            >
              <span className="text-xs font-mono text-gray-500 w-12 shrink-0">Day {step.day}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded border ${CHANNEL_STYLE[step.channel]}`}>{step.channel}</span>
              <span className="text-sm text-gray-900 flex-1">{step.title}</span>
              <span className="text-gray-400 text-xs">{open === index ? '▲' : '▼'}</span>
            </button>
            {open === index && (
              <div className="px-3 pb-3">
                {step.subject && (
                  <div className="text-sm text-gray-500 mb-1">
                    Subject: <span className="text-gray-900 font-medium">{step.subject}</span>
                  </div>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-md p-3">{step.body}</pre>
                <div className="mt-2 flex gap-2">
                  <CopyButton text={step.subject ? `Subject: ${step.subject}\n\n${step.body}` : step.body} label={`Copy ${step.channel === 'Call' ? 'script' : 'message'}`} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CaseStudyMatch({ matches }: { matches: { study: CaseStudy; reasons: string[] }[] }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Closest Amzur proof point</h3>
      {matches.length ? (
        <ul className="space-y-2">
          {matches.map(({ study, reasons }) => (
            <li key={study.title} className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
              <div className="font-medium text-gray-900">
                {study.url ? (
                  <a href={study.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">
                    {study.title} ↗
                  </a>
                ) : (
                  study.title
                )}
              </div>
              {study.client && <div className="text-xs text-gray-500">{study.client}</div>}
              <div className="text-gray-700 mt-1">{study.outcome}</div>
              <div className="text-xs text-emerald-700 mt-1">Matches: {reasons.join(', ')}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">
          No matching case study yet. Add Amzur&apos;s approved case studies to <code className="font-mono">apps/web/src/lib/caseStudies.ts</code> and
          the closest one will show here for each lead.
        </p>
      )}
    </div>
  );
}

const ACTIVITY_ICON: Record<string, string> = {
  status: '🔁',
  owner: '👤',
  next_action: '📌',
  note: '📝',
  reveal: '🔓',
  enrich: '🏢',
  sequence: '✉️',
  rfp: '📋',
};

export function ActivityLog({ lead, onChange }: { lead: any; onChange: () => void }) {
  const activity: any[] = [...(lead.signals?.activity || [])].reverse();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity &amp; notes</h2>
      <div className="flex gap-2 mb-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a note (call outcome, context for a teammate…)"
          className="flex-1 text-sm rounded-md border border-gray-300 px-2 py-1.5"
        />
        <button
          type="button"
          disabled={!note.trim() || saving}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await leadsAPI.updateWorkflow(lead.id, { note });
              setNote('');
              onChange();
            } catch (err: any) {
              setError(err?.message || 'Could not save the note');
            } finally {
              setSaving(false);
            }
          }}
          className="self-start text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {activity.length ? (
        <ul className="space-y-2.5 max-h-80 overflow-y-auto">
          {activity.map((item, i) => (
            <li key={`${item.at}-${i}`} className="flex gap-2 text-sm">
              <span className="shrink-0">{ACTIVITY_ICON[item.type] || '•'}</span>
              <div className="min-w-0">
                <div className={`text-gray-800 ${item.type === 'note' ? 'whitespace-pre-wrap' : ''}`}>{item.detail}</div>
                <div className="text-[11px] text-gray-400">
                  {item.by} · {new Date(item.at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">No activity yet. Status changes, contact reveals and notes will appear here.</p>
      )}
    </section>
  );
}
