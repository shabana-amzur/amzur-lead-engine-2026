'use client';

// The decision strip at the top of a lead: explainable score, status, owner
// and next action, so a rep can act in seconds. Every change is logged.
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { leadsAPI } from '@/lib/api';

export const STATUS_OPTIONS = [
  { value: 'new', label: 'New', style: 'bg-gray-100 text-gray-700' },
  { value: 'contacted', label: 'Contacted', style: 'bg-blue-100 text-blue-800' },
  { value: 'replied', label: 'Replied', style: 'bg-indigo-100 text-indigo-800' },
  { value: 'meeting', label: 'Meeting booked', style: 'bg-purple-100 text-purple-800' },
  { value: 'won', label: 'Won', style: 'bg-emerald-100 text-emerald-800' },
  { value: 'lost', label: 'Lost', style: 'bg-red-100 text-red-700' },
  { value: 'not_relevant', label: 'Not relevant', style: 'bg-gray-200 text-gray-600' },
];

const NOT_RELEVANT_REASONS = [
  'Not a technology need',
  'Vendor already chosen',
  'Too large / too small',
  'Wrong region',
  'Competitor or partner',
  'Existing customer',
  'Duplicate',
];

const scoreClass = (score: number) =>
  score >= 75 ? 'bg-emerald-600 text-white' : score >= 55 ? 'bg-amber-500 text-white' : 'bg-gray-400 text-white';

export default function LeadActionBar({ lead, onChange }: { lead: any; onChange: () => void }) {
  const workflow = lead.signals?.workflow || {};
  const status = workflow.status || 'new';
  const { data: team } = useSWR('/api/leads/team/members', () => leadsAPI.teamMembers(), { revalidateOnFocus: false });
  const [owner, setOwner] = useState(workflow.owner || '');
  const [nextAction, setNextAction] = useState(workflow.nextAction || '');
  const [due, setDue] = useState(workflow.nextActionDue || '');
  const [showScore, setShowScore] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOwner(workflow.owner || '');
    setNextAction(workflow.nextAction || '');
    setDue(workflow.nextActionDue || '');
  }, [workflow.owner, workflow.nextAction, workflow.nextActionDue]);

  const save = async (changes: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      await leadsAPI.updateWorkflow(lead.id, changes);
      onChange();
      return true;
    } catch (err: any) {
      setError(err?.message || 'Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const overdue = workflow.nextActionDue && workflow.nextActionDue < new Date().toISOString().slice(0, 10);
  const dirty = owner !== (workflow.owner || '') || nextAction !== (workflow.nextAction || '') || due !== (workflow.nextActionDue || '');
  const statusStyle = STATUS_OPTIONS.find((o) => o.value === status)?.style || '';

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-end gap-4">
        <button
          type="button"
          onClick={() => setShowScore((v) => !v)}
          className="flex items-center gap-2 text-left"
          title="Show how the score is calculated"
        >
          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-semibold ${scoreClass(lead.leadScore)}`}>
            {lead.leadScore}
          </span>
          <span className="text-xs text-gray-500 leading-tight">
            Lead score
            <br />
            <span className="text-blue-600">{showScore ? 'Hide' : 'Why?'}</span>
          </span>
        </button>

        <label className="text-xs text-gray-500">
          Status
          <select
            value={status}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value === 'not_relevant') setAskReason(true);
              else save({ status: e.target.value });
            }}
            className={`block mt-1 text-sm rounded-md border border-gray-300 px-2 py-1.5 font-medium ${statusStyle}`}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-gray-500">
          Owner
          <input
            list="lead-owners"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Unassigned"
            className="block mt-1 text-sm rounded-md border border-gray-300 px-2 py-1.5 w-52"
          />
          <datalist id="lead-owners">
            {(team?.members || []).map((m: string) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <label className="text-xs text-gray-500 flex-1 min-w-[220px]">
          Next action
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="e.g. Call the CTO about the SAP role"
            className="block mt-1 text-sm rounded-md border border-gray-300 px-2 py-1.5 w-full"
          />
        </label>

        <label className="text-xs text-gray-500">
          Due
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={`block mt-1 text-sm rounded-md border px-2 py-1.5 ${overdue && !dirty ? 'border-red-300 text-red-700' : 'border-gray-300'}`}
          />
        </label>

        <div className="flex gap-2">
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ owner, nextAction, nextActionDue: due || null })}
              className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {status !== 'not_relevant' && (
            <button
              type="button"
              onClick={() => setAskReason(true)}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Not relevant
            </button>
          )}
        </div>
      </div>

      {overdue && !dirty && <p className="mt-2 text-xs text-red-700">Next action is overdue ({workflow.nextActionDue}).</p>}
      {status === 'not_relevant' && workflow.notRelevantReason && (
        <p className="mt-2 text-xs text-gray-600">Marked not relevant: {workflow.notRelevantReason}. It is hidden from the dashboard.</p>
      )}

      {askReason && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm text-gray-700 mb-2">Why isn&apos;t this lead relevant? This hides it from the dashboard and helps tune the filters.</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {NOT_RELEVANT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`text-xs px-2 py-1 rounded-md border ${reason === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 bg-white'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type a reason"
            className="text-sm rounded-md border border-gray-300 px-2 py-1.5 w-full mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!reason.trim() || saving}
              onClick={async () => {
                if (await save({ status: 'not_relevant', notRelevantReason: reason })) {
                  setAskReason(false);
                  setReason('');
                }
              }}
              className="text-sm px-3 py-1.5 rounded-md bg-gray-800 text-white disabled:opacity-40"
            >
              Mark not relevant
            </button>
            <button type="button" onClick={() => setAskReason(false)} className="text-sm px-3 py-1.5 text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showScore && lead.scoreBreakdown && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <table className="w-full text-sm">
            <tbody>
              {lead.scoreBreakdown.map((item: any) => (
                <tr key={item.label} className="border-b border-gray-50 last:border-0">
                  <td className="py-1 text-gray-700">{item.label}</td>
                  <td className={`py-1 text-right font-mono ${item.points ? 'text-gray-900' : 'text-gray-400'}`}>
                    +{item.points} <span className="text-gray-400">/ {item.max}</span>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-medium text-gray-900">Total</td>
                <td className="pt-2 text-right font-mono font-semibold">{lead.leadScore} / 100</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
