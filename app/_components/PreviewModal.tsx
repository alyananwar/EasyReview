"use client";

import type { PreviewResult } from "./types";

interface Props {
  preview: PreviewResult;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}

export function PreviewModal({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">Preview: Review Requests</h2>
        <p className="text-sm text-gray-400 mb-5">
          Review who will be contacted before sending.
        </p>

        <div className="space-y-2 mb-5">
          <PreviewRow
            label="Will receive a text"
            value={preview.eligible}
            color="text-green-400"
            bold
          />
          <PreviewRow
            label="Already texted (within 90 days)"
            value={preview.already_texted}
            color="text-gray-400"
          />
          <PreviewRow
            label="Opted out"
            value={preview.opted_out}
            color="text-gray-400"
          />
          <PreviewRow
            label="Invalid or missing phone"
            value={preview.invalid_phone}
            color="text-yellow-400"
          />
          {preview.over_cap > 0 && (
            <PreviewRow
              label={`Over daily cap (${preview.daily_cap})`}
              value={preview.over_cap}
              color="text-yellow-400"
            />
          )}
        </div>

        {preview.eligible > 0 && (
          <div className="bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 mb-5">
            <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
              Message preview
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {preview.sample_message}
            </p>
          </div>
        )}

        {preview.eligible === 0 && (
          <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-yellow-300">
              No eligible customers to text right now.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-lg text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming || preview.eligible === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 rounded-lg text-sm font-medium transition"
          >
            {confirming
              ? "Starting..."
              : `Send ${preview.eligible} review request${preview.eligible === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`${color} ${bold ? "font-semibold text-base" : ""}`}>
        {value}
      </span>
    </div>
  );
}
