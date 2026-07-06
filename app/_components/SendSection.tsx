"use client";

import { useState } from "react";
import { PreviewModal } from "./PreviewModal";
import { RunProgress } from "./RunProgress";
import type { Run, PreviewResult, Settings } from "./types";

interface Props {
  settings: Settings;
  activeRun: Run | null;
  onRunStarted: (runId: string) => void;
}

export function SendSection({ settings, activeRun, onRunStarted }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "info" | "error";
    msg: string;
  } | null>(null);

  const isRunning = activeRun?.status === "running";
  const isFinished = activeRun && activeRun.status !== "running";

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    setBanner(null);
    try {
      const res = await fetch("/api/preview");
      const data = await res.json();
      if (!res.ok || data.error) {
        setPreviewError(data.error ?? "Failed to load preview");
      } else {
        setPreview(data);
      }
    } catch {
      setPreviewError("Something went wrong loading the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setBanner(null);
    try {
      const res = await fetch("/api/send-texts", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setBanner({ kind: "error", msg: data.error ?? "Failed to start run" });
      } else {
        onRunStarted(data.runId);
      }
    } catch {
      setBanner({ kind: "error", msg: "Something went wrong." });
    } finally {
      setConfirming(false);
      setPreview(null);
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <h2 className="font-semibold mb-1">Send Review Requests</h2>
      <p className="text-sm text-gray-400 mb-4">
        Pulls invoices from the last 7 days in QuickBooks and texts eligible
        customers. Already-texted customers are automatically skipped.
      </p>

      {!settings.automationEnabled && (
        <div className="mb-4 px-4 py-3 bg-yellow-900/20 border border-yellow-800/40 rounded-lg text-sm text-yellow-300">
          Automation is paused. Resume it in Setup to allow sends.
        </div>
      )}

      {!settings.isConnected && (
        <div className="mb-4 px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg text-sm text-red-300">
          Connect QuickBooks to enable sending.
        </div>
      )}

      <button
        onClick={handlePreview}
        disabled={
          previewing ||
          isRunning ||
          !settings.isConnected ||
          !settings.automationEnabled
        }
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg text-sm font-medium transition"
      >
        {previewing
          ? "Loading preview..."
          : isRunning
            ? "Run in progress..."
            : "Preview & Send"}
      </button>

      {previewError && (
        <p className="mt-3 text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-lg">
          {previewError}
        </p>
      )}

      {banner && (
        <div
          className={`mt-4 text-sm px-4 py-3 rounded-lg ${
            banner.kind === "error"
              ? "bg-red-900/40 text-red-300"
              : "bg-green-900/40 text-green-300"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {(isRunning || isFinished) && activeRun && (
        <div className="mt-6">
          <RunProgress run={activeRun} />
        </div>
      )}

      {preview && (
        <PreviewModal
          preview={preview}
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
          confirming={confirming}
        />
      )}
    </div>
  );
}
