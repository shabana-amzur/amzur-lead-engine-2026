'use client';

// The strip at the top of a lead: the explainable lead score and its
// breakdown. (Sales-activity controls such as status, owner, next action and
// "not relevant" are hidden for now; the API still supports them via
// PATCH /api/leads/:id/workflow.)
import { useState } from 'react';

const scoreClass = (score: number) =>
  score >= 75 ? 'bg-emerald-600 text-white' : score >= 55 ? 'bg-amber-500 text-white' : 'bg-gray-400 text-white';

export default function LeadActionBar({ lead }: { lead: any; onChange?: () => void }) {
  const [showScore, setShowScore] = useState(false);
  const top = (lead.scoreBreakdown || []).filter((item: any) => item.points > 0).slice(0, 3);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => setShowScore((v) => !v)} className="flex items-center gap-3 text-left" title="Show how the score is calculated">
          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-semibold ${scoreClass(lead.leadScore)}`}>
            {lead.leadScore}
          </span>
          <span className="text-sm text-gray-700 leading-tight">
            Lead score <span className="text-gray-400">/ 100</span>
            <br />
            <span className="text-xs text-blue-600">{showScore ? 'Hide breakdown' : 'Why this score?'}</span>
          </span>
        </button>
        {!showScore && top.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {top.map((item: any) => (
              <span key={item.label} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700">
                +{item.points} {item.label}
              </span>
            ))}
          </div>
        )}
      </div>

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
    </section>
  );
}
