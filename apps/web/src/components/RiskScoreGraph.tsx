import React, { useState } from "react";

export interface LoginAttemptData {
  event_id: string;
  wallet_address: string;
  trust_score: number;
  decision: "allow" | "otp_required" | "blocked";
  cluster_id?: string;
  timestamp: string;
  ip_address?: string;
  device_fingerprint?: string;
}

interface Props {
  attempts: LoginAttemptData[];
  onSelectAttempt?: (a: LoginAttemptData) => void;
}

const colOf = (s: number) => s >= 90 ? "#4D8A83" : s >= 50 ? "#DF851A" : "#B8521E";

export default function RiskScoreGraph({ attempts, onSelectAttempt }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mode, setMode] = useState<"timeline" | "distribution">("timeline");

  const sorted = [...attempts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const total   = attempts.length;
  const avg     = total ? Math.round(attempts.reduce((s, a) => s + a.trust_score, 0) / total) : 0;

  /* SVG dimensions */
  const W = 800, H = 240;
  const pad = { t: 24, r: 28, b: 36, l: 44 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const getY = (s: number) => pad.t + cH - (s / 100) * cH;
  const getX = (i: number, n: number) => n <= 1 ? pad.l + cW / 2 : pad.l + (i / (n - 1)) * cW;

  const pts = sorted.map((a, i) => ({ x: getX(i, sorted.length), y: getY(a.trust_score), data: a }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L ${pts[pts.length-1].x.toFixed(1)} ${pad.t+cH} L ${pts[0].x.toFixed(1)} ${pad.t+cH} Z` : "";

  /* Distribution buckets */
  const buckets = Array.from({ length: 10 }, (_, i) => {
    const min = i * 10, max = min + 10;
    return { min, label: `${min}`, count: attempts.filter(a => a.trust_score >= min && (i === 9 ? a.trust_score <= max : a.trust_score < max)).length };
  });
  const maxB = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="bg-[#FDFAF7] border border-[#E8DDD3] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#F0E8DF] flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#2C1A11]">Risk score trajectory</h3>
          <p className="text-xs text-[#8B6355] mt-0.5">{total} events · avg score {avg}/100</p>
        </div>
        <div className="flex items-center gap-0 border border-[#E8DDD3] rounded overflow-hidden text-xs">
          {(["timeline", "distribution"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-medium transition-all cursor-pointer capitalize ${
                mode === m ? "bg-[#2C1A11] text-[#F7F3EE]" : "bg-[#F7F3EE] text-[#5C3D2E] hover:bg-[#F0E8DF]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative bg-[#F7F3EE] px-1 py-1">
        {mode === "timeline" ? (
          pts.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-[#8B6355]">
              No events yet — refresh or run a simulation
            </div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none" style={{ minHeight: 210 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#4D8A83" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#4D8A83" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Zone bands — very subtle */}
              <rect x={pad.l} y={getY(100)} width={cW} height={getY(90)-getY(100)} fill="#EEF5F4" opacity="0.6" />
              <rect x={pad.l} y={getY(90)}  width={cW} height={getY(50)-getY(90)}  fill="#FBF3E8" opacity="0.6" />
              <rect x={pad.l} y={getY(50)}  width={cW} height={getY(0)-getY(50)}   fill="#FBF0EC" opacity="0.6" />

              {/* Threshold dashes */}
              <line x1={pad.l} y1={getY(90)} x2={pad.l+cW} y2={getY(90)} stroke="#4D8A83" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />
              <line x1={pad.l} y1={getY(50)} x2={pad.l+cW} y2={getY(50)} stroke="#DF851A" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />

              {/* Y labels */}
              <text x={pad.l-6} y={getY(100)+4} textAnchor="end" fontSize="9" fill="#8B6355">100</text>
              <text x={pad.l-6} y={getY(90)+4}  textAnchor="end" fontSize="9" fill="#4D8A83" fontWeight="600">90</text>
              <text x={pad.l-6} y={getY(50)+4}  textAnchor="end" fontSize="9" fill="#DF851A" fontWeight="600">50</text>
              <text x={pad.l-6} y={getY(0)+4}   textAnchor="end" fontSize="9" fill="#B8521E" fontWeight="600">0</text>

              {/* Zone labels */}
              <text x={pad.l+cW-6} y={getY(95)+3} textAnchor="end" fontSize="8" fill="#4D8A83" opacity="0.8">allow ≥ 90</text>
              <text x={pad.l+cW-6} y={getY(70)+3} textAnchor="end" fontSize="8" fill="#DF851A" opacity="0.8">otp 50–89</text>
              <text x={pad.l+cW-6} y={getY(25)+3} textAnchor="end" fontSize="8" fill="#B8521E" opacity="0.8">blocked &lt; 50</text>

              {/* Area + Line */}
              {area && <path d={area} fill="url(#g1)" />}
              {line && <path d={line} fill="none" stroke="#5C3D2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />}

              {/* Points */}
              {pts.map((p, i) => {
                const h = hovered === i;
                const c = colOf(p.data.trust_score);
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={h ? 14 : 8} fill={c} fillOpacity={h ? 0.12 : 0}
                      className="cursor-pointer"
                      onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                      onClick={() => onSelectAttempt?.(p.data)} />
                    <circle cx={p.x} cy={p.y} r={h ? 5 : 3.5} fill="#FDFAF7" stroke={c} strokeWidth={h ? 2.5 : 1.8}
                      className="cursor-pointer"
                      onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                      onClick={() => onSelectAttempt?.(p.data)} />
                  </g>
                );
              })}

              {/* X axis */}
              <line x1={pad.l} y1={pad.t+cH} x2={pad.l+cW} y2={pad.t+cH} stroke="#E8DDD3" strokeWidth="1" />
              <text x={pad.l}      y={H-8} fontSize="8.5" fill="#8B6355">Earlier</text>
              <text x={pad.l+cW}  y={H-8} textAnchor="end" fontSize="8.5" fill="#8B6355">Latest</text>
            </svg>
          )
        ) : (
          /* Distribution */
          <div className="px-6 py-6">
            <div className="grid grid-cols-10 gap-2 h-40 items-end">
              {buckets.map((b, i) => {
                const pct = (b.count / maxB) * 100;
                const col = b.min >= 90 ? "bg-[#4D8A83]" : b.min >= 50 ? "bg-[#DF851A]" : "bg-[#B8521E]";
                return (
                  <div key={i} className="flex flex-col items-center h-full justify-end group">
                    {b.count > 0 && <span className="text-[9px] text-[#5C3D2E] mb-1 font-medium">{b.count}</span>}
                    <div className="w-full bg-[#E8DDD3] rounded-t h-32 flex items-end">
                      <div className={`w-full rounded-t ${col} opacity-75 group-hover:opacity-100 transition-opacity`} style={{ height: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <span className="text-[9px] text-[#8B6355] mt-1">{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tooltip */}
        {hovered !== null && pts[hovered] && (
          <div
            className="absolute z-20 pointer-events-none bg-[#2C1A11] text-[#F7F3EE] rounded-lg px-3 py-2.5 text-xs shadow-xl -translate-x-1/2 -translate-y-full"
            style={{ left: `${(pts[hovered].x / W) * 100}%`, top: `${Math.max((pts[hovered].y / H) * 100 - 6, 10)}%` }}
          >
            <div className="font-semibold" style={{ color: colOf(pts[hovered].data.trust_score) }}>
              {pts[hovered].data.trust_score}/100 · {pts[hovered].data.decision.replace("_", " ")}
            </div>
            <div className="text-[10px] font-mono text-[#C4A882] mt-0.5">
              {pts[hovered].data.wallet_address.slice(0, 10)}…
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-[#F0E8DF] flex items-center gap-5 text-[10px] text-[#8B6355]">
        {[["#4D8A83","≥ 90 allowed"],["#DF851A","50–89 OTP"],["#B8521E","< 50 blocked"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: c, opacity: 0.8 }} />
            {l}
          </span>
        ))}
        <span className="ml-auto text-[9px]">Click any point for details</span>
      </div>
    </div>
  );
}
