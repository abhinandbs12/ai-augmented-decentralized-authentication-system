import React, { useEffect, useState } from "react";
import RiskScoreGraph, { LoginAttemptData } from "../../components/RiskScoreGraph";
import LoginSimulator from "../../components/LoginSimulator";

export default function Attempts() {
  const [attempts, setAttempts] = useState<LoginAttemptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(25);
  const [filterDecision, setFilterDecision] = useState<"all" | "allow" | "otp_required" | "blocked" | "cluster">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAttempt, setSelectedAttempt] = useState<LoginAttemptData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "simulator" | "table">("overview");

  useEffect(() => {
    fetchAttempts();
  }, [topN]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAttempts(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, topN]);

  async function fetchAttempts(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attempts/top?n=${topN}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAttempts(data.attempts || []);
    } catch (err: any) {
      setError(err.message || "Failed to load attempts");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  // Filtered list
  const filteredAttempts = attempts.filter((a) => {
    if (filterDecision === "cluster") {
      if (!a.cluster_id) return false;
    } else if (filterDecision !== "all" && a.decision !== filterDecision) {
      return false;
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchWallet = a.wallet_address.toLowerCase().includes(q);
      const matchIp = a.ip_address?.toLowerCase().includes(q);
      const matchCluster = a.cluster_id?.toLowerCase().includes(q);
      return matchWallet || matchIp || matchCluster;
    }
    return true;
  });

  const clusterCount = attempts.filter((a) => !!a.cluster_id).length;

  return (
    <div className="min-h-screen bg-[#f8f6f2] text-[#1a2936] pb-20">
      {/* Top Navigation Bar */}
      <header className="bg-[#0b3866] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between py-3">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#3b687f] border border-[#a3c7c0]/30 flex items-center justify-center text-white font-black text-xl shadow-inner">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-black tracking-tight text-white">IdentityVault</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f7b738] text-[#0b3866] tracking-wide uppercase">
                  Banking Auth 2.0
                </span>
              </div>
              <p className="text-xs text-[#a3c7c0] font-medium">
                AI-Augmented Fraud-Resistant Login &amp; Cryptographic Audit
              </p>
            </div>
          </div>

          {/* System Health Indicators */}
          <div className="hidden lg:flex items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b687f]/40 border border-[#3b687f] text-white/90 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#4d8a83] animate-pulse"></span>
              <span>Gateway :3000</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b687f]/40 border border-[#3b687f] text-white/90 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#4d8a83] animate-pulse"></span>
              <span>AI Risk Engine :8001</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3b687f]/40 border border-[#3b687f] text-white/90 font-medium">
              <span className="w-2 h-2 rounded-full bg-[#4d8a83] animate-pulse"></span>
              <span>Hardhat EVM :8545</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                autoRefresh
                  ? "bg-[#4d8a83] text-white border-[#a3c7c0]"
                  : "bg-white/10 text-white/90 border-white/20 hover:bg-white/15"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-white animate-ping" : "bg-[#a3c7c0]"}`}></span>
              {autoRefresh ? "Live 5s Active" : "Auto Refresh"}
            </button>
            <button
              onClick={() => fetchAttempts(true)}
              disabled={loading}
              className="px-4 py-1.5 bg-[#f7b738] hover:bg-[#df851a] text-[#0b3866] hover:text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition cursor-pointer"
            >
              {loading ? "Fetching..." : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[#e4dad3] pb-4 mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "overview"
                  ? "bg-[#0b3866] text-white shadow-xs"
                  : "bg-white text-[#667e85] hover:text-[#0b3866] border border-[#e4dad3]"
              }`}
            >
              📊 Executive Overview &amp; Graph
            </button>
            <button
              onClick={() => setActiveTab("simulator")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "simulator"
                  ? "bg-[#0b3866] text-white shadow-xs"
                  : "bg-white text-[#667e85] hover:text-[#0b3866] border border-[#e4dad3]"
              }`}
            >
              ⚡ Risk Engine Simulator
            </button>
            <button
              onClick={() => setActiveTab("table")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "table"
                  ? "bg-[#0b3866] text-white shadow-xs"
                  : "bg-white text-[#667e85] hover:text-[#0b3866] border border-[#e4dad3]"
              }`}
            >
              📋 Detailed Activity Log ({filteredAttempts.length})
            </button>
          </div>
          <div className="hidden sm:block text-xs font-semibold text-[#667e85]">
            Last Synced: {new Date().toLocaleTimeString()}
          </div>
        </div>

        {/* Coordinated Fraud Ring Alert Banner */}
        {clusterCount > 0 && (
          <div className="bg-[#fcf1ed] border border-[#f2cbbf] rounded-2xl p-4 mb-6 flex items-start justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              <span className="text-2xl mt-0.5">🚨</span>
              <div>
                <h4 className="text-sm font-black text-[#75300d]">
                  Coordinated Mule Fraud Ring Detected
                </h4>
                <p className="text-xs text-[#b8521e] mt-0.5 font-medium">
                  The graph-based BFS engine identified {clusterCount} login attempts linked by shared device fingerprints and IP infrastructure.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setFilterDecision("cluster");
                setActiveTab("table");
              }}
              className="px-3.5 py-1.5 bg-[#b8521e] text-white text-xs font-bold rounded-xl hover:bg-[#75300d] transition shrink-0 cursor-pointer shadow-xs"
            >
              Inspect Ring ({clusterCount})
            </button>
          </div>
        )}

        {/* Simulator Tab */}
        {(activeTab === "overview" || activeTab === "simulator") && (
          <div className="mb-6">
            <LoginSimulator onAttemptCompleted={() => fetchAttempts(false)} />
          </div>
        )}

        {/* Risk Score Graph — always visible */}
        <div className="mb-7">
          <RiskScoreGraph
            attempts={attempts}
            onSelectAttempt={(a) => {
              setSelectedAttempt(a);
              setActiveTab("table");
            }}
          />
        </div>

        {/* Activity Table */}
        <div className="bg-white border border-[#e4dad3] rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#eee7e1] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-[#0b3866] tracking-tight">
                Authentication Access Ledger
              </h3>
              <p className="text-xs text-[#667e85] mt-0.5 font-medium">
                Live stream of evaluated customer sign-ins, calculated trust scores, and routing decisions
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search wallet, IP, cluster..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs pl-8 pr-3 py-2 border border-[#dcc5b6] rounded-xl w-56 sm:w-64 focus:outline-[#0b3866] bg-[#faf8f5] focus:bg-white text-[#0b3866] font-medium"
                />
                <span className="absolute left-2.5 top-2.5 text-[#667e85] text-xs">🔍</span>
              </div>
              <select
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="text-xs border border-[#dcc5b6] rounded-xl px-3 py-2 bg-[#faf8f5] text-[#0b3866] font-semibold"
              >
                <option value={10}>Show 10</option>
                <option value={25}>Show 25</option>
                <option value={50}>Show 50</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-6 py-3 bg-[#faf8f5] border-b border-[#eee7e1] flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#667e85] font-bold mr-1">Filter View:</span>
            {[
              { id: "all", label: "All Attempts", count: attempts.length },
              { id: "allow", label: "Allow (≥90)", count: attempts.filter((a) => a.decision === "allow" || a.trust_score >= 90).length },
              { id: "otp_required", label: "OTP Step-Up (50-89)", count: attempts.filter((a) => a.decision === "otp_required" || (a.trust_score >= 50 && a.trust_score < 90)).length },
              { id: "blocked", label: "Blocked (<50)", count: attempts.filter((a) => a.decision === "blocked" || a.trust_score < 50).length },
              { id: "cluster", label: "Fraud Rings", count: clusterCount },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterDecision(tab.id as any)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  filterDecision === tab.id
                    ? "bg-[#0b3866] text-white shadow-xs"
                    : "bg-white text-[#667e85] hover:text-[#0b3866] hover:bg-[#f5f0ec] border border-[#e4dad3]"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {error && (
            <div className="p-4 bg-[#fcf1ed] text-[#75300d] text-xs border-b border-[#f2cbbf] font-medium">
              Error loading attempts: {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f5f0ec] border-b border-[#e4dad3] text-[#0b3866] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-5">Verification Decision</th>
                  <th className="py-3.5 px-5">Trust Score</th>
                  <th className="py-3.5 px-5">Customer Wallet</th>
                  <th className="py-3.5 px-5">Client IP</th>
                  <th className="py-3.5 px-5">Coordinated Cluster</th>
                  <th className="py-3.5 px-5">Timestamp</th>
                  <th className="py-3.5 px-5 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7e1] font-mono">
                {filteredAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#667e85] font-sans font-medium">
                      {loading ? "Querying authentication records..." : "No matching authentication records found."}
                    </td>
                  </tr>
                ) : (
                  filteredAttempts.map((attempt) => {
                    const isAllow = attempt.decision === "allow" || attempt.trust_score >= 90;
                    const isOtp = attempt.decision === "otp_required" || (attempt.trust_score >= 50 && attempt.trust_score < 90);
                    const isBlocked = attempt.decision === "blocked" || attempt.trust_score < 50;

                    return (
                      <tr
                        key={attempt.event_id}
                        className={`hover:bg-[#faf8f5] transition ${
                          attempt.cluster_id ? "bg-[#fcf1ed]/40" : ""
                        }`}
                      >
                        <td className="py-3.5 px-5 font-sans">
                          {isAllow && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black bg-[#f0f7f5] text-[#2e5954] border border-[#cbe4de]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4d8a83]"></span>
                              ALLOW
                            </span>
                          )}
                          {isOtp && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black bg-[#fef8ed] text-[#8f5209] border border-[#f5dfb8]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#df851a]"></span>
                              OTP STEP-UP
                            </span>
                          )}
                          {isBlocked && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black bg-[#fcf1ed] text-[#75300d] border border-[#f2cbbf]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#b8521e]"></span>
                              BLOCKED
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 font-sans">
                          <div className="flex items-center gap-2.5">
                            <span className={`font-black text-sm ${isAllow ? "text-[#4d8a83]" : isOtp ? "text-[#df851a]" : "text-[#b8521e]"}`}>
                              {attempt.trust_score}
                            </span>
                            <div className="w-16 bg-[#e8dfd8] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isAllow ? "bg-[#4d8a83]" : isOtp ? "bg-[#df851a]" : "bg-[#b8521e]"}`}
                                style={{ width: `${attempt.trust_score}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 font-semibold text-[#0b3866]">
                          <span title={attempt.wallet_address}>
                            {attempt.wallet_address.slice(0, 8)}…{attempt.wallet_address.slice(-6)}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-[#667e85] font-medium">
                          {attempt.ip_address || "127.0.0.1"}
                        </td>
                        <td className="py-3.5 px-5 font-sans">
                          {attempt.cluster_id ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#fcf1ed] text-[#75300d] border border-[#f2cbbf]">
                              <span>⚠️</span> {attempt.cluster_id}
                            </span>
                          ) : (
                            <span className="text-[#667e85]/70 text-[11px] font-medium">Unlinked</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-[#667e85] text-[11px]">
                          {new Date(attempt.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="py-3.5 px-5 text-right font-sans">
                          <button
                            onClick={() => setSelectedAttempt(attempt)}
                            className="text-[#3b687f] hover:text-[#0b3866] font-bold hover:underline cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Audit Inspector Modal */}
      {selectedAttempt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b3866]/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-[#e4dad3] p-7">
            <div className="flex items-center justify-between pb-4 border-b border-[#eee7e1]">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔍</span>
                <h3 className="text-base font-black text-[#0b3866]">Cryptographic Attempt Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedAttempt(null)}
                className="text-[#667e85] hover:text-[#0b3866] text-xl leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                <span className="text-[#667e85] font-semibold">Event ID</span>
                <span className="font-mono text-[#0b3866] font-bold">{selectedAttempt.event_id}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                <span className="text-[#667e85] font-semibold">Verification Decision</span>
                <span className="font-black uppercase text-[#0b3866]">{selectedAttempt.decision}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                <span className="text-[#667e85] font-semibold">Evaluated Trust Score</span>
                <span className="font-black text-[#0b3866] text-sm">{selectedAttempt.trust_score} / 100</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                <span className="text-[#667e85] font-semibold">Customer Wallet</span>
                <span className="font-mono text-[#0b3866] break-all text-right ml-4">{selectedAttempt.wallet_address}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                <span className="text-[#667e85] font-semibold">Client IP</span>
                <span className="font-mono text-[#0b3866]">{selectedAttempt.ip_address || "127.0.0.1"}</span>
              </div>
              {selectedAttempt.device_fingerprint && (
                <div className="py-2 border-b border-[#f5f0ec]">
                  <span className="text-[#667e85] font-semibold block mb-1">Device Fingerprint SHA-256</span>
                  <span className="font-mono text-[11px] text-[#0b3866] break-all bg-[#faf8f5] p-2 rounded-xl border border-[#e4dad3] block">
                    {selectedAttempt.device_fingerprint}
                  </span>
                </div>
              )}
              {selectedAttempt.cluster_id && (
                <div className="flex justify-between py-2 border-b border-[#f5f0ec]">
                  <span className="text-[#667e85] font-semibold">Fraud Ring Cluster ID</span>
                  <span className="font-black text-[#75300d] bg-[#fcf1ed] px-2.5 py-0.5 rounded-lg border border-[#f2cbbf]">
                    {selectedAttempt.cluster_id}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-[#667e85] font-semibold">Timestamp</span>
                <span className="text-[#0b3866] font-mono">{new Date(selectedAttempt.timestamp).toISOString()}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedAttempt(null)}
                className="px-5 py-2.5 bg-[#f5f0ec] hover:bg-[#e8dfd8] text-[#0b3866] font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
