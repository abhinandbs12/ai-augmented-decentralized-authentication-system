import React, { useState } from "react";

interface LoginSimulatorProps {
  onAttemptCompleted: () => void;
}

const PRESETS = [
  { key: "normal",     label: "Known device",   wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2", ip: "192.168.1.100" },
  { key: "new_device", label: "New device",     wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "new_unknown_device_hash_9999999999999999999999999999999999999999",   ip: "192.168.1.100" },
  { key: "traveling",  label: "Different city", wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2", ip: "203.0.113.55" },
  { key: "fraud",      label: "Fraud pattern",  wallet: "0xF6a7B8c9D0e1f2A3b4C5d6E7f8A9b0C1d2E3f4A5", device: "ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00",   ip: "203.0.113.99" },
];

export default function LoginSimulator({ onAttemptCompleted }: LoginSimulatorProps) {
  const [wallet, setWallet] = useState(PRESETS[0].wallet);
  const [device, setDevice] = useState(PRESETS[0].device);
  const [ip, setIp] = useState(PRESETS[0].ip);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [active, setActive] = useState("normal");

  const applyPreset = (p: typeof PRESETS[0]) => {
    setActive(p.key);
    setWallet(p.wallet);
    setDevice(p.device);
    setIp(p.ip);
    setResult(null);
  };

  const handleSimulate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, device_fingerprint: device, ip_address: ip }),
      });
      const data = await res.json();
      setResult(data);
      onAttemptCompleted();
    } catch (err: any) {
      setResult({ error: err.message || "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  const decision = result?.decision ?? result?.state ?? "";
  const isAllow   = decision === "allow" || decision === "CHALLENGE_ISSUED";
  const isOtp     = decision === "otp_required" || decision === "OTP_PENDING";
  const isBlocked = decision === "blocked" || decision === "BLOCKED";

  return (
    <div className="bg-[#FDFAF7] border border-[#E8DDD3] rounded-xl p-6">
      {/* Header */}
      <div className="mb-5 pb-4 border-b border-[#F0E8DF]">
        <h3 className="text-sm font-semibold text-[#2C1A11] tracking-wide">Authentication Simulator</h3>
        <p className="text-xs text-[#8B6355] mt-0.5">Test live risk evaluation with real device and network signals</p>
      </div>

      {/* Scenario presets — text-style tabs, not coloured pills */}
      <div className="flex flex-wrap items-center gap-1 mb-5">
        <span className="text-[11px] text-[#8B6355] font-medium mr-2 uppercase tracking-widest">Scenario</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p)}
            className={`text-xs px-3 py-1.5 rounded border font-medium transition-all cursor-pointer ${
              active === p.key
                ? "bg-[#2C1A11] text-[#F7F3EE] border-[#2C1A11]"
                : "bg-transparent text-[#5C3D2E] border-[#C4A882] hover:border-[#5C3D2E] hover:bg-[#F0E8DF]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Input fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {[
          { label: "Wallet address", value: wallet, set: setWallet, ph: "0x…" },
          { label: "Device fingerprint", value: device, set: setDevice, ph: "sha256 hash" },
          { label: "IP address", value: ip, set: setIp, ph: "192.168.x.x" },
        ].map(({ label, value, set, ph }) => (
          <div key={label}>
            <label className="block text-[11px] font-medium text-[#5C3D2E] uppercase tracking-wider mb-1.5">{label}</label>
            <input
              type="text"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={ph}
              className="w-full text-[11px] font-mono px-3 py-2 border border-[#E8DDD3] rounded bg-[#F7F3EE] focus:bg-white focus:outline-none focus:border-[#B8521E] text-[#2C1A11] placeholder-[#C4A882] transition-colors"
            />
          </div>
        ))}
      </div>

      {/* Submit + result */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t border-[#F0E8DF]">
        <button
          onClick={handleSimulate}
          disabled={loading}
          className="px-5 py-2.5 bg-[#B8521E] hover:bg-[#8A3C12] text-white text-sm font-medium rounded border border-[#B8521E] hover:border-[#8A3C12] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Evaluating…
            </>
          ) : (
            "Run evaluation →"
          )}
        </button>

        {result && !result.error && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[#8B6355]">Result:</span>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${
              isAllow   ? "bg-[#EEF5F4] text-[#3A6B65] border-[#B2D8D3]" :
              isOtp     ? "bg-[#FBF3E8] text-[#7A4A10] border-[#E8C990]" :
                          "bg-[#FBF0EC] text-[#7A2A10] border-[#DFB5A5]"
            }`}>
              {isAllow ? "Allowed" : isOtp ? "OTP required" : isBlocked ? "Blocked" : decision}
            </span>
            {result.trustScore !== undefined && (
              <span className="text-[#5C3D2E] font-mono font-semibold">score {result.trustScore}/100</span>
            )}
            {result.reasons?.length > 0 && (
              <span className="text-[#8B6355] font-mono text-[10px]">{result.reasons.join(" · ")}</span>
            )}
          </div>
        )}

        {result?.error && (
          <span className="text-xs text-[#B8521E] font-medium">{result.error}</span>
        )}
      </div>
    </div>
  );
}
