"use client";

import { useState } from "react";
import type { OptOut } from "./types";

interface Props {
  optOuts: OptOut[];
  onChanged: () => void;
}

export function OptOutsSection({ optOuts, onChanged }: Props) {
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/opt-outs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to add opt-out");
      } else {
        setPhone("");
        onChanged();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(optOutPhone: string) {
    try {
      await fetch("/api/opt-outs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: optOutPhone }),
      });
      onChanged();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Opt-Outs</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Customers who replied STOP or were manually opted out
          </p>
        </div>
        <span className="text-sm text-gray-500">{optOuts.length}</span>
      </div>

      <div className="px-6 py-4 border-b border-gray-800">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(209) 555-1234"
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={adding || !phone}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-1.5 rounded-lg text-sm font-medium transition"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </form>
        {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      </div>

      {optOuts.length === 0 ? (
        <div className="px-6 py-6 text-gray-500 text-sm">No opt-outs yet.</div>
      ) : (
        <ul className="divide-y divide-gray-800/50">
          {optOuts.map((o) => (
            <li
              key={o.id}
              className="px-6 py-3 flex items-center justify-between text-sm"
            >
              <div>
                <span className="text-gray-300">{o.phone}</span>
                <span className="text-gray-600 ml-2 text-xs">{o.reason}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600">
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleRemove(o.phone)}
                  className="text-xs text-gray-600 hover:text-red-400 transition"
                  title="Remove from opt-out list"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
