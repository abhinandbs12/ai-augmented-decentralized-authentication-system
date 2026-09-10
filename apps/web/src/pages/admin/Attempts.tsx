/**
 * Attempts.tsx — Admin Risk Table
 * ================================
 * Fetches recent login attempts from the orchestrator and shows them
 * in a plain table, sorted by risk (highest first), with flagged-cluster
 * rows highlighted.
 *
 * Owner: Abhinand Baiju Smitha
 * Ref: docs/Abhinand_Task_Plan.md — Attempts.tsx section
 * Ref: PRD FR-24 (top-N riskiest attempts, rank ordered)
 *
 * NOTE: For Phase 1, this is a plain table — no charting library,
 * no 3D visualization. The full threat graph visualization is Phase 2.
 */

import React, { useEffect, useState } from "react";

// Types matching the API response from GET /api/admin/attempts/top
interface LoginAttempt {
  event_id: string;
  wallet_address: string;
  trust_score: number;
  decision: "allow" | "otp_required" | "blocked";
  cluster_id?: string;
  timestamp: string;
  ip_address?: string;
  device_fingerprint?: string;
}

// Colour mapping for risk bands (PRD §3.2, TRD §4.5)
const DECISION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  allow: { bg: "bg-green-100", text: "text-green-800", label: "Allow" },
  otp_required: { bg: "bg-amber-100", text: "text-amber-800", label: "OTP" },
  blocked: { bg: "bg-red-100", text: "text-red-800", label: "Blocked" },
};

// Truncate a wallet address for display (NFR-07: no technical jargon)
function truncateWallet(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Attempts() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(20);

  useEffect(() => {
    fetchAttempts();
  }, [topN]);

  async function fetchAttempts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attempts/top?n=${topN}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAttempts(data.attempts || []);
    } catch (err: any) {
      setError(err.message || "Failed to load attempts");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Login Attempts — Risk Overview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Top {topN} riskiest recent login attempts, sorted by trust score
            (lowest first).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="topn-select" className="text-sm text-gray-600">
            Show:
          </label>
          <select
            id="topn-select"
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button
            onClick={fetchAttempts}
            className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          Loading attempts…
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  #
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Wallet
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Trust Score
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Decision
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Cluster
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    No login attempts found.
                  </td>
                </tr>
              ) : (
                attempts.map((attempt, idx) => {
                  const style = DECISION_STYLES[attempt.decision] || DECISION_STYLES.blocked;
                  const isFlagged = !!attempt.cluster_id;

                  return (
                    <tr
                      key={attempt.event_id}
                      className={`border-b hover:bg-gray-50 ${
                        isFlagged ? "border-l-4 border-l-purple-500" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono text-gray-900">
                        {truncateWallet(attempt.wallet_address)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-12 text-center font-bold rounded px-2 py-0.5 ${
                            attempt.trust_score >= 90
                              ? "bg-green-100 text-green-800"
                              : attempt.trust_score >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {attempt.trust_score}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isFlagged ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-300">
                            🚩 {attempt.cluster_id}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(attempt.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs text-gray-500">
        <span>
          <span className="inline-block w-3 h-3 bg-green-200 rounded mr-1"></span>
          Allow (90–100)
        </span>
        <span>
          <span className="inline-block w-3 h-3 bg-amber-200 rounded mr-1"></span>
          OTP (50–89)
        </span>
        <span>
          <span className="inline-block w-3 h-3 bg-red-200 rounded mr-1"></span>
          Blocked (0–49)
        </span>
        <span>
          <span className="inline-block w-3 h-3 bg-purple-200 rounded mr-1 border border-purple-400"></span>
          Flagged Cluster
        </span>
      </div>
    </div>
  );
}
