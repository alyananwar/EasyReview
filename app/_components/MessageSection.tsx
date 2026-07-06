"use client";

import { useState } from "react";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  onSaved: () => void;
}

const MAX_LENGTH = 320;
const PLACEHOLDERS = ["{first_name}", "{business_name}", "{review_link}"];

function renderPreview(template: string, settings: Settings): string {
  const body = template
    .replaceAll("{first_name}", "Sarah")
    .replaceAll("{business_name}", settings.businessName ?? "Your Shop")
    .replaceAll("{review_link}", "https://g.page/r/...")
    .trim();
  return body.toUpperCase().includes("STOP")
    ? body
    : `${body} Reply STOP to opt out.`;
}

export function MessageSection({ settings, onSaved }: Props) {
  const [template, setTemplate] = useState(settings.messageTemplate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = template !== settings.messageTemplate;
  const isDefault = template.trim() === settings.defaultTemplate;
  const tooLong = template.trim().length > MAX_LENGTH;
  const missingLink = !template.includes("{review_link}");

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageTemplate: template }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save template");
      } else {
        setSaved(true);
        onSaved();
      }
    } catch {
      setError("Something went wrong saving the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold">Message</h2>
        {!isDefault && (
          <button
            onClick={() => setTemplate(settings.defaultTemplate)}
            className="text-xs text-gray-500 hover:text-gray-300 underline transition"
          >
            Reset to default
          </button>
        )}
      </div>
      <p className="text-sm text-gray-400 mb-4">
        The text customers receive. Placeholders are filled in per customer;
        opt-out language is always appended if missing.
      </p>

      <textarea
        value={template}
        onChange={(e) => {
          setTemplate(e.target.value);
          setSaved(false);
        }}
        rows={4}
        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {PLACEHOLDERS.map((p) => (
          <code
            key={p}
            className={`px-2 py-0.5 rounded bg-gray-800 ${
              template.includes(p) ? "text-blue-300" : "text-gray-500"
            }`}
          >
            {p}
          </code>
        ))}
        <span
          className={`ml-auto ${tooLong ? "text-red-400" : "text-gray-500"}`}
        >
          {template.trim().length}/{MAX_LENGTH}
        </span>
      </div>

      {missingLink && (
        <p className="mt-3 text-sm text-yellow-300 bg-yellow-900/20 px-3 py-2 rounded-lg">
          Template must include {"{review_link}"} so customers can leave a
          review.
        </p>
      )}

      <div className="mt-4">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">
          Preview
        </div>
        <div className="bg-gray-950/50 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-300">
          {renderPreview(template, settings)}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty || tooLong || missingLink}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg text-sm font-medium transition"
        >
          {saving ? "Saving..." : "Save message"}
        </button>
        {saved && !dirty && (
          <span className="text-sm text-green-400">Saved.</span>
        )}
      </div>
    </div>
  );
}
