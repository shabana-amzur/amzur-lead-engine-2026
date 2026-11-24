'use client';

// Shown only for tenders / RFPs: deadline countdown, documents, eligibility
// checklist and a go / no-go scorecard. Answers are saved on the lead.
import { useState } from 'react';
import { leadsAPI } from '@/lib/api';
import { findDeadline } from '@/lib/leadBrief';

const ELIGIBILITY = [
  { key: 'registered', label: 'Amzur is (or can get) registered on the buyer’s procurement portal' },
  { key: 'presence', label: 'Local presence / entity requirements are met' },
  { key: 'turnover', label: 'Minimum turnover and financial criteria are met' },
  { key: 'experience', label: 'We have the number of similar past projects they ask for' },
  { key: 'certifications', label: 'Required certifications are held (e.g. ISO 27001, CMMI, vendor partner status)' },
  { key: 'documents', label: 'Bid security / EMD and mandatory forms can be provided' },
];

const SCORECARD = [
  { key: 'scope', label: 'Scope matches Amzur services', must: true },
  { key: 'eligible', label: 'We meet every eligibility rule', must: true },
  { key: 'time', label: 'Enough time to write a strong response', must: true },
  { key: 'references', label: 'We have relevant references to cite', must: false },
  { key: 'value', label: 'Contract value is worth the bid effort', must: false },
  { key: 'relationship', label: 'We know the buyer or can meet them before the deadline', must: false },
];

type Answer = 'yes' | 'no' | 'unsure';

export default function RfpPanel({ lead, onChange }: { lead: any; onChange: () => void }) {
  const signals = lead.signals || {};
  const saved = signals.rfp || {};
  const text = [signals.sourceTitle, signals.searchContext, signals.requirement?.headline, signals.requirement?.summary].filter(Boolean).join(' ');
  const detected = findDeadline(text, signals.postedAt);
  const deadline: string | null = saved.deadline || detected;
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(deadline || '');
  const [saving, setSaving] = useState(false);

  const save = async (rfp: Record<string, unknown>) => {
    setSaving(true);
    try {
      await leadsAPI.updateWorkflow(lead.id, { rfp });
      onChange();
    } finally {
      setSaving(false);
    }
  };

  const daysLeft = deadline ? Math.ceil((new Date(`${deadline}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
  const eligibility: Record<string, boolean> = saved.eligibility || {};
  const scorecard: Record<string, Answer> = saved.scorecard || {};
  const mustNo = SCORECARD.some((c) => c.must && scorecard[c.key] === 'no');
  const allMustYes = SCORECARD.filter((c) => c.must).every((c) => scorecard[c.key] === 'yes');
  const niceYes = SCORECARD.filter((c) => !c.must && scorecard[c.key] === 'yes').length;
  const verdict = mustNo
    ? { label: 'No-go', style: 'bg-red-100 text-red-800', why: 'A must-have criterion is not met.' }
    : allMustYes && niceYes >= 2
      ? { label: 'Go', style: 'bg-emerald-100 text-emerald-800', why: 'All must-haves met and the bid looks winnable.' }
      : allMustYes
        ? { label: 'Go, with care', style: 'bg-amber-100 text-amber-800', why: 'Must-haves met, but few strengths to win on.' }
        : { label: 'Not decided', style: 'bg-gray-100 text-gray-700', why: 'Answer the must-have questions first.' };
  const docsSearch = `https://www.google.com/search?q=${encodeURIComponent(`"${lead.companyName}" ${signals.sourceTitle || 'tender'} RFP OR tender document`)}`;

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Tender / RFP</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-md ${verdict.style}`}>{verdict.label}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-md border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Submission deadline</div>
          {editingDeadline ? (
            <div className="flex gap-2 mt-1">
              <input type="date" value={deadlineInput} onChange={(e) => setDeadlineInput(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1" />
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await save({ deadline: deadlineInput || null });
                  setEditingDeadline(false);
                }}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
              >
                Save
              </button>
            </div>
          ) : deadline ? (
            <>
              <div className={`text-lg font-semibold ${daysLeft !== null && daysLeft < 0 ? 'text-gray-400 line-through' : daysLeft !== null && daysLeft <= 7 ? 'text-red-700' : 'text-gray-900'}`}>
                {new Date(`${deadline}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="text-xs text-gray-600">
                {daysLeft === null ? '' : daysLeft < 0 ? 'Deadline passed' : daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                {!saved.deadline && detected ? ' · read from the source, please confirm' : ''}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">Not stated in the source</div>
          )}
          {!editingDeadline && (
            <button type="button" onClick={() => setEditingDeadline(true)} className="mt-1 text-xs text-blue-600 hover:text-blue-800">
              {deadline ? 'Change' : 'Set deadline'}
            </button>
          )}
        </div>
        <div className="rounded-md border border-gray-200 p-3 text-sm">
          <div className="text-xs text-gray-500 mb-1">Documents</div>
          {signals.tavilyUrl && (
            <a href={signals.tavilyUrl} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800">
              Original notice ↗
            </a>
          )}
          <a href={docsSearch} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800">
            Search for the tender documents ↗
          </a>
          <div className="text-xs text-gray-400 mt-1">News items rarely link the documents: get them from the buyer&apos;s procurement portal.</div>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Eligibility checklist</h3>
        <ul className="space-y-1.5">
          {ELIGIBILITY.map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!eligibility[item.key]}
                  disabled={saving}
                  onChange={(e) => save({ eligibility: { ...eligibility, [item.key]: e.target.checked } })}
                />
                <span className={eligibility[item.key] ? 'text-gray-900' : ''}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Go / no-go</h3>
        <table className="w-full text-sm">
          <tbody>
            {SCORECARD.map((c) => (
              <tr key={c.key} className="border-b border-gray-100 last:border-0">
                <td className="py-1.5 text-gray-700">
                  {c.label}
                  {c.must && <span className="ml-1 text-[10px] text-red-600 font-medium">MUST</span>}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {(['yes', 'unsure', 'no'] as Answer[]).map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      disabled={saving}
                      onClick={() => save({ scorecard: { ...scorecard, [c.key]: answer } })}
                      className={`ml-1 text-xs px-2 py-0.5 rounded border ${
                        scorecard[c.key] === answer
                          ? answer === 'yes'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : answer === 'no'
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-gray-600 text-white border-gray-600'
                          : 'border-gray-300 text-gray-600'
                      }`}
                    >
                      {answer === 'unsure' ? '?' : answer === 'yes' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-600">
          <span className="font-medium">{verdict.label}:</span> {verdict.why}
        </p>
      </div>
    </section>
  );
}
