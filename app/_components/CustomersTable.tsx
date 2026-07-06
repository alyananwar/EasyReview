"use client";

import type { Customer, OptOut } from "./types";

interface Props {
  customers: Customer[];
  optOuts: OptOut[];
  onOptOut: (phone: string) => void;
}

export function CustomersTable({ customers, optOuts, onOptOut }: Props) {
  const optOutPhones = new Set(optOuts.map((o) => o.phone));

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold">Customers</h2>
        <span className="text-sm text-gray-500">{customers.length} total</span>
      </div>
      {customers.length === 0 ? (
        <div className="px-6 py-8 text-gray-500 text-sm">
          No customers yet. Connect QuickBooks and run a preview to populate.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Phone</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Last Texted</th>
                <th className="px-6 py-3 text-left">Next Eligible</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const isOptedOut = optOutPhones.has(c.phone);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="px-6 py-3">{c.name}</td>
                    <td className="px-6 py-3 text-gray-400">{c.phone}</td>
                    <td className="px-6 py-3">
                      {isOptedOut ? (
                        <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">
                          Opted out
                        </span>
                      ) : c.texted_at ? (
                        <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                          Sent
                        </span>
                      ) : c.last_status === "error" ? (
                        <span
                          title={c.last_error ?? ""}
                          className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded-full cursor-help"
                        >
                          Failed
                        </span>
                      ) : (
                        <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-400">
                      {c.texted_at
                        ? new Date(c.texted_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-400">
                      {c.next_eligible_at
                        ? new Date(c.next_eligible_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {!isOptedOut && (
                        <button
                          onClick={() => onOptOut(c.phone)}
                          className="text-xs text-gray-500 hover:text-red-400 transition"
                          title="Add to opt-out list"
                        >
                          Opt out
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
