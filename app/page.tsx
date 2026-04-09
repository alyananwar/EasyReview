'use client'

import { useEffect, useState } from 'react'

type Customer = {
  id: string
  name: string
  phone: string
  qb_customer_id: string
  texted_at: string | null
  created_at: string
}

export default function Dashboard() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      setResult('QuickBooks connected successfully!')
      window.history.replaceState({}, '', '/')
    } else if (params.get('error')) {
      setResult('Failed to connect QuickBooks. Please try again.')
      window.history.replaceState({}, '', '/')
    }
  }, [])

  async function loadData() {
    setLoading(true)
    const [customersRes, settingsRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/settings'),
    ])
    const customersData = await customersRes.json()
    const settingsData = await settingsRes.json()
    setCustomers(Array.isArray(customersData) ? customersData : [])
    setIsConnected(settingsData.isConnected || false)
    setLoading(false)
  }

  async function handleSendTexts() {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/send-texts', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setResult(`Error: ${data.error}`)
      } else {
        const details = data.results?.map((r: {name: string, status: string, error?: string}) =>
          `${r.name}: ${r.status}${r.error ? ` (${r.error})` : ''}`
        ).join(' | ') || ''
        setResult(`Done! Sent ${data.sent} text(s) out of ${data.total} recent customer(s). ${details}`)
        loadData()
      }
    } catch {
      setResult('Something went wrong. Check the console.')
    }
    setSending(false)
  }

  const texted = customers.filter(c => c.texted_at)
  const pending = customers.filter(c => !c.texted_at)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">EasyReview</h1>
          <p className="text-sm text-gray-400">Lockeford Garage — Review Automation</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full ${isConnected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            {isConnected ? 'QuickBooks Connected' : 'QuickBooks Not Connected'}
          </div>
          <a
            href="/api/auth/quickbooks"
            className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition"
          >
            {isConnected ? 'Reconnect QBO' : 'Connect QuickBooks'}
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold">{customers.length}</div>
            <div className="text-sm text-gray-400 mt-1">Total Customers</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-green-400">{texted.length}</div>
            <div className="text-sm text-gray-400 mt-1">Texts Sent</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-yellow-400">{pending.length}</div>
            <div className="text-sm text-gray-400 mt-1">Pending</div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="font-semibold mb-1">Send Review Requests</h2>
          <p className="text-sm text-gray-400 mb-4">
            Pulls customers from the last 7 days in QuickBooks and texts anyone who hasn&apos;t been contacted yet.
          </p>
          <button
            onClick={handleSendTexts}
            disabled={sending || !isConnected}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2 rounded-lg text-sm font-medium transition"
          >
            {sending ? 'Sending...' : 'Run Now'}
          </button>
          {!isConnected && (
            <p className="text-xs text-red-400 mt-2">Connect QuickBooks first.</p>
          )}
          {result && (
            <div className={`mt-4 text-sm px-4 py-3 rounded-lg ${result.startsWith('Error') ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
              {result}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="font-semibold">Customer Log</h2>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-gray-500 text-sm">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="px-6 py-8 text-gray-500 text-sm">
              No customers yet. Connect QuickBooks and click Run Now.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Texted At</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-6 py-3">{c.name}</td>
                    <td className="px-6 py-3 text-gray-400">{c.phone}</td>
                    <td className="px-6 py-3">
                      {c.texted_at ? (
                        <span className="bg-green-900/50 text-green-400 text-xs px-2 py-1 rounded-full">Sent</span>
                      ) : (
                        <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-1 rounded-full">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-400">
                      {c.texted_at ? new Date(c.texted_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
