"use client";

import type { Run } from "./types";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-900/50 text-green-400",
  already_texted: "bg-gray-800 text-gray-400",
  invalid_phone: "bg-yellow-900/50 text-yellow-400",
  opted_out: "bg-gray-800 text-gray-400",
  over_cap: "bg-yellow-900/50 text-yellow-400",
  error: "bg-red-900/50 text-red-400",
};

interface Props {
  run: Run;
}

export function RunProgress({ run }: Props) {
  const processed = run.sent + run.skipped + run.failed;
  const pct =
    run.total > 0
      ? Math.min(100, Math.round((processed / run.total) * 100))
      : 0;

  const barColor =
    run.status === "running"
      ? "bg-blue-500"
      : run.status === "failed"
        ? "bg-red-500"
        : "bg-green-500";

  const statusLabel = {
    running: "Run in progress",
    completed: "Run complete",
    failed: "Run failed",
    cancelled: "Run cancelled",
  }[run.status];

  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{statusLabel}</div>
        <div className="text-xs text-gray-500">
          {processed} / {run.total || "?"} processed
        </div>
      </div>
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-gray-400">
        <span>
          <span className="text-green-400">{run.sent}</span> sent
        </span>
        <span>
          <span className="text-gray-300">{run.skipped}</span> skipped
        </span>
        <span>
          <span className="text-red-400">{run.failed}</span> failed
        </span>
      </div>
      {run.error && (
        <div className="mt-3 text-xs bg-red-900/30 text-red-300 px-3 py-2 rounded">
          {run.error}
        </div>
      )}
      {run.results && run.results.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto border-t border-gray-800 pt-3 space-y-1">
          {run.results
            .slice()
            .reverse()
            .map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-gray-300">
                  {a.name} <span className="text-gray-500">({a.phone})</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] ${STATUS_STYLES[a.status] ?? "bg-gray-800 text-gray-400"}`}
                >
                  {a.status}
                  {a.error ? `: ${a.error}` : ""}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
