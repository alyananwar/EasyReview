"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SetupSection } from "./_components/SetupSection";
import { MessageSection } from "./_components/MessageSection";
import { SendSection } from "./_components/SendSection";
import { RunsTable } from "./_components/RunsTable";
import { CustomersTable } from "./_components/CustomersTable";
import { OptOutsSection } from "./_components/OptOutsSection";
import type { Settings, Customer, Run, OptOut } from "./_components/types";

export default function Dashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, customersRes, runsRes, optOutsRes] =
        await Promise.all([
          fetch("/api/settings"),
          fetch("/api/customers"),
          fetch("/api/runs"),
          fetch("/api/opt-outs"),
        ]);
      const [settingsData, customersData, runsData, optOutsData] =
        await Promise.all([
          settingsRes.json(),
          customersRes.json(),
          runsRes.json(),
          optOutsRes.json(),
        ]);

      setSettings(settingsData);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      const allRuns: Run[] = Array.isArray(runsData) ? runsData : [];
      setRuns(allRuns);
      setOptOuts(Array.isArray(optOutsData) ? optOutsData : []);

      const running = allRuns.find((r) => r.status === "running");
      if (running && (!activeRun || activeRun.status !== "running")) {
        setActiveRun(running);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      window.history.replaceState({}, "", "/");
    } else if (params.get("error")) {
      window.history.replaceState({}, "", "/");
    }
  }, [loadData]);

  // Poll the active run every 3s until it finishes.
  useEffect(() => {
    if (!activeRun || activeRun.status !== "running") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${activeRun.id}`);
        if (!res.ok) return;
        const run: Run = await res.json();
        setActiveRun(run);
        if (run.status !== "running") {
          loadData();
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [activeRun, loadData]);

  function handleRunStarted(runId: string) {
    setActiveRun({
      id: runId,
      status: "running",
      source: "manual",
      started_at: new Date().toISOString(),
      finished_at: null,
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: null,
    });
  }

  async function handleOptOut(phone: string) {
    await fetch("/api/opt-outs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    await loadData();
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sentThisWeek = runs
    .filter(
      (r) => r.status === "completed" && new Date(r.started_at) >= weekAgo,
    )
    .reduce((s, r) => s + r.sent, 0);
  const sentThisMonth = runs
    .filter(
      (r) => r.status === "completed" && new Date(r.started_at) >= monthAgo,
    )
    .reduce((s, r) => s + r.sent, 0);

  if (loading && !settings) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">EasyReview</h1>
          <p className="text-sm text-gray-400">Review automation dashboard</p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-300 transition"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat
            label="Sent this week"
            value={sentThisWeek}
            color="text-green-400"
          />
          <Stat
            label="Sent this month"
            value={sentThisMonth}
            color="text-blue-400"
          />
          <Stat label="Total customers" value={customers.length} />
          <Stat label="Opt-outs" value={optOuts.length} color="text-gray-400" />
        </div>

        {/* Setup */}
        {settings && <SetupSection settings={settings} onSaved={loadData} />}

        {/* Message template */}
        {settings && (
          <MessageSection
            key={settings.messageTemplate}
            settings={settings}
            onSaved={loadData}
          />
        )}

        {/* Send */}
        {settings && (
          <SendSection
            settings={settings}
            activeRun={activeRun}
            onRunStarted={handleRunStarted}
          />
        )}

        {/* Recent Runs */}
        <RunsTable runs={runs} />

        {/* Customers */}
        <CustomersTable
          customers={customers}
          optOuts={optOuts}
          onOptOut={handleOptOut}
        />

        {/* Opt-Outs */}
        <OptOutsSection optOuts={optOuts} onChanged={loadData} />

        {/* Footer links */}
        <div className="text-center text-xs text-gray-700 pb-4 space-x-4">
          <a href="/privacy" className="hover:text-gray-500 transition">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-gray-500 transition">
            Terms of Service
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className={`text-3xl font-bold ${color ?? ""}`}>{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );
}
