"use client";

import { useState } from "react";
import type { Settings } from "./types";

interface Props {
  settings: Settings;
  onSaved: () => void;
}

export function SetupSection({ settings, onSaved }: Props) {
  const [saving, setSaving] = useState(false);

  async function toggleAutomation() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automationEnabled: !settings.automationEnabled,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const lastRun = settings.lastRunAt
    ? new Date(settings.lastRunAt).toLocaleString()
    : "Never";

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="font-semibold mb-4">Setup</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatusRow
          label="QuickBooks"
          ok={settings.isConnected}
          okText={settings.qbCompanyName ?? "Connected"}
          failText="Not connected"
          action={
            <a
              href="/api/auth/quickbooks"
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              {settings.isConnected ? "Reconnect" : "Connect"}
            </a>
          }
        />
        <StatusRow
          label="Google review link"
          ok={settings.reviewLinkOk}
          okText="Configured"
          failText="Not set — add REVIEW_LINK to env"
        />
        <StatusRow
          label="SMS number"
          ok={!!settings.smsNumber}
          okText={settings.smsNumber ?? "Configured"}
          failText="Not configured"
        />
        <StatusRow
          label="Last successful run"
          ok={!!settings.lastRunAt}
          okText={lastRun}
          failText="No runs yet"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            Automation{" "}
            <span
              className={
                settings.automationEnabled
                  ? "text-green-400"
                  : "text-yellow-400"
              }
            >
              {settings.automationEnabled ? "active" : "paused"}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {settings.automationEnabled
              ? `Daily cron runs at 10am ${settings.businessTimezone.replace("America/", "").replace("_", " ")} — quiet hours ${settings.quietHoursStart}–${settings.quietHoursEnd}`
              : "No texts will be sent until you resume"}
          </div>
        </div>
        <button
          onClick={toggleAutomation}
          disabled={saving}
          className={`text-sm px-4 py-1.5 rounded-lg font-medium transition disabled:opacity-50 ${
            settings.automationEnabled
              ? "bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900"
              : "bg-green-900/50 text-green-300 hover:bg-green-900"
          }`}
        >
          {saving
            ? "Saving..."
            : settings.automationEnabled
              ? "Pause"
              : "Resume"}
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText,
  failText,
  action,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-950/50 rounded-lg px-4 py-2.5">
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {label}
        </div>
        <div
          className={`text-sm mt-0.5 ${ok ? "text-gray-200" : "text-red-400"}`}
        >
          {ok ? okText : failText}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : "bg-red-400"}`}
        />
      </div>
    </div>
  );
}
