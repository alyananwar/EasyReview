"use client";

import type { Run } from "./types";

interface Props {
  runs: Run[];
}

export function RunsTable({ runs }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="font-semibold">Recent Runs</h2>
      </div>
      {runs.length === 0 ? (
        <div className="px-6 py-6 text-gray-500 text-sm">No runs yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-6 py-3 text-left">Started</th>
                <th className="px-6 py-3 text-left">Source</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Sent</th>
                <th className="px-6 py-3 text-right">Skipped</th>
                <th className="px-6 py-3 text-right">Failed</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="px-6 py-3 text-gray-300">
                    {new Date(r.started_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-gray-400">{r.source}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.status === "completed"
                          ? "bg-green-900/50 text-green-400"
                          : r.status === "running"
                            ? "bg-blue-900/50 text-blue-400"
                            : r.status === "failed"
                              ? "bg-red-900/50 text-red-400"
                              : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-green-400">
                    {r.sent}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-300">
                    {r.skipped}
                  </td>
                  <td className="px-6 py-3 text-right text-red-400">
                    {r.failed}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-300">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
