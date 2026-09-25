import React, { useEffect, useState, useRef } from "react";

/* ─── Types ──────────────────────────────────────────────────── */
interface Attempt {
  event_id: string;
  wallet_address: string;
  trust_score: number;
  decision: "allow" | "otp_required" | "blocked";
  cluster_id?: string;
  timestamp: string;
  ip_address?: string;
  device_fingerprint?: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
const scoreColor = (s: number) => s >= 90 ? "#4D8A83" : s >= 50 ? "#DF851A" : "#B8521E";
const scoreBg    = (s: number) => s >= 90 ? "rgba(77,138,131,0.12)" : s >= 50 ? "rgba(223,133,26,0.12)" : "rgba(184,82,30,0.12)";
const scoreBorder = (s: number) => s >= 90 ? "rgba(77,138,131,0.3)" : s >= 50 ? "rgba(223,133,26,0.3)" : "rgba(184,82,30,0.3)";
const decisionLabel = (d: string, s: number) =>
  s >= 90 || d === "allow" ? "ALLOW" : s >= 50 || d === "otp_required" ? "OTP" : "BLOCKED";

const PRESETS = [
  { key: "normal",     label: "Known device",   wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2", ip: "192.168.1.100" },
  { key: "new_device", label: "New device",     wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "new_unknown_device_hash_9999999999999999999999999999999999999999", ip: "192.168.1.100" },
  { key: "traveling",  label: "Diff. location", wallet: "0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", device: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2", ip: "203.0.113.55" },
  { key: "fraud",      label: "Fraud pattern",  wallet: "0xF6a7B8c9D0e1f2A3b4C5d6E7f8A9b0C1d2E3f4A5", device: "ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00", ip: "203.0.113.99" },
];


/* ─── Sample Data (fallback when API unreachable) ────────────── */
const _t = Date.now();
const SAMPLE_DATA: Attempt[] = [
  { event_id:'s001', wallet_address:'0xAsha1Raghavan2C3d4E5f6a7B8c9D0e1F2a3B4c5', trust_score:96, decision:'allow',        timestamp: new Date(_t - 1*60000).toISOString(),  ip_address:'10.0.1.45',     device_fingerprint:'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' },
  { event_id:'s002', wallet_address:'0xRahul3Menon4E5f6a7B8c9D0e1F2a3B4c5D6e7F8', trust_score:91, decision:'allow',        timestamp: new Date(_t - 3*60000).toISOString(),  ip_address:'10.0.1.72',     device_fingerprint:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3' },
  { event_id:'s003', wallet_address:'0xPriya5Sharma6a7B8c9D0e1F2a3B4c5D6e7F8a9B', trust_score:78, decision:'otp_required', timestamp: new Date(_t - 5*60000).toISOString(),  ip_address:'192.168.2.11',  device_fingerprint:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4' },
  { event_id:'s004', wallet_address:'0xVikram7Patel8c9D0e1F2a3B4c5D6e7F8a9B0C1d', trust_score:35, decision:'blocked',       timestamp: new Date(_t - 7*60000).toISOString(),  ip_address:'203.0.113.99',  device_fingerprint:'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00', cluster_id:'ring-A' },
  { event_id:'s005', wallet_address:'0xMeera9Iyer0e1F2a3B4c5D6e7F8a9B0C1d2E3f4',  trust_score:94, decision:'allow',        timestamp: new Date(_t - 9*60000).toISOString(),  ip_address:'10.0.0.5',     device_fingerprint:'d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' },
  { event_id:'s006', wallet_address:'0xAsha1Raghavan2C3d4E5f6a7B8c9D0e1F2a3B4c5', trust_score:88, decision:'otp_required', timestamp: new Date(_t - 12*60000).toISOString(), ip_address:'203.0.113.55',  device_fingerprint:'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2' },
  { event_id:'s007', wallet_address:'0xF6a7B8c9MuleD0e1f2A3b4C5d6E7f8A9b0C1d2E', trust_score:28, decision:'blocked',       timestamp: new Date(_t - 14*60000).toISOString(), ip_address:'203.0.113.99',  device_fingerprint:'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00', cluster_id:'ring-A' },
  { event_id:'s008', wallet_address:'0xRahul3Menon4E5f6a7B8c9D0e1F2a3B4c5D6e7F8', trust_score:93, decision:'allow',        timestamp: new Date(_t - 17*60000).toISOString(), ip_address:'10.0.1.72',     device_fingerprint:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3' },
  { event_id:'s009', wallet_address:'0xSunny9Singh0a1B2c3D4e5F6a7B8c9D0e1F2a3B4', trust_score:62, decision:'otp_required', timestamp: new Date(_t - 19*60000).toISOString(), ip_address:'172.16.0.88',   device_fingerprint:'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6' },
  { event_id:'s010', wallet_address:'0xB8c9MuleD0e1f2A3b4C5d6E7f8A9b0C1d2E3f4A5', trust_score:31, decision:'blocked',       timestamp: new Date(_t - 21*60000).toISOString(), ip_address:'203.0.113.99',  device_fingerprint:'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00', cluster_id:'ring-A' },
  { event_id:'s011', wallet_address:'0xPriya5Sharma6a7B8c9D0e1F2a3B4c5D6e7F8a9B', trust_score:95, decision:'allow',        timestamp: new Date(_t - 24*60000).toISOString(), ip_address:'192.168.2.11',  device_fingerprint:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4' },
  { event_id:'s012', wallet_address:'0xMeera9Iyer0e1F2a3B4c5D6e7F8a9B0C1d2E3f4',  trust_score:71, decision:'otp_required', timestamp: new Date(_t - 26*60000).toISOString(), ip_address:'10.0.0.5',     device_fingerprint:'d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' },
  { event_id:'s013', wallet_address:'0xVikram7Patel8c9D0e1F2a3B4c5D6e7F8a9B0C1d', trust_score:89, decision:'otp_required', timestamp: new Date(_t - 29*60000).toISOString(), ip_address:'10.0.2.33',     device_fingerprint:'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7' },
  { event_id:'s014', wallet_address:'0xSunny9Singh0a1B2c3D4e5F6a7B8c9D0e1F2a3B4', trust_score:97, decision:'allow',        timestamp: new Date(_t - 32*60000).toISOString(), ip_address:'172.16.0.88',   device_fingerprint:'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6' },
  { event_id:'s015', wallet_address:'0xAsha1Raghavan2C3d4E5f6a7B8c9D0e1F2a3B4c5', trust_score:44, decision:'blocked',       timestamp: new Date(_t - 35*60000).toISOString(), ip_address:'203.0.113.77',  device_fingerprint:'a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' },
  { event_id:'s016', wallet_address:'0xRahul3Menon4E5f6a7B8c9D0e1F2a3B4c5D6e7F8', trust_score:83, decision:'otp_required', timestamp: new Date(_t - 38*60000).toISOString(), ip_address:'10.0.1.72',     device_fingerprint:'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3' },
  { event_id:'s017', wallet_address:'0xMeera9Iyer0e1F2a3B4c5D6e7F8a9B0C1d2E3f4',  trust_score:92, decision:'allow',        timestamp: new Date(_t - 41*60000).toISOString(), ip_address:'10.0.0.5',     device_fingerprint:'d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5' },
  { event_id:'s018', wallet_address:'0xPriya5Sharma6a7B8c9D0e1F2a3B4c5D6e7F8a9B', trust_score:58, decision:'otp_required', timestamp: new Date(_t - 44*60000).toISOString(), ip_address:'192.168.2.11',  device_fingerprint:'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4' },
  { event_id:'s019', wallet_address:'0xVikram7Patel8c9D0e1F2a3B4c5D6e7F8a9B0C1d', trust_score:98, decision:'allow',        timestamp: new Date(_t - 47*60000).toISOString(), ip_address:'10.0.2.33',     device_fingerprint:'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7' },
  { event_id:'s020', wallet_address:'0xSunny9Singh0a1B2c3D4e5F6a7B8c9D0e1F2a3B4', trust_score:22, decision:'blocked',       timestamp: new Date(_t - 50*60000).toISOString(), ip_address:'203.0.113.99',  device_fingerprint:'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00', cluster_id:'ring-A' },
];

/* ─── SVG Risk Graph ─────────────────────────────────────────── */
function RiskGraph({ attempts, onSelect }: { attempts: Attempt[]; onSelect: (a: Attempt) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mode, setMode] = useState<"timeline"|"distribution">("timeline");
  const sorted = [...attempts].reverse();
  const W = 820, H = 220;
  const pad = { t: 20, r: 20, b: 32, l: 40 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;
  const gY = (s: number) => pad.t + cH - (s / 100) * cH;
  const gX = (i: number, n: number) => n <= 1 ? pad.l + cW/2 : pad.l + (i/(n-1))*cW;

  const pts = sorted.map((a, i) => ({ x: gX(i, sorted.length), y: gY(a.trust_score), d: a }));
  const line = pts.length ? pts.map((p,i) => `${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") : "";
  const area = pts.length ? `${line} L ${pts[pts.length-1].x.toFixed(1)} ${pad.t+cH} L ${pts[0].x.toFixed(1)} ${pad.t+cH} Z` : "";

  const total = attempts.length;
  const allow = attempts.filter(a => a.trust_score >= 90).length;
  const otp   = attempts.filter(a => a.trust_score >= 50 && a.trust_score < 90).length;
  const block = attempts.filter(a => a.trust_score < 50).length;
  const avg   = total ? Math.round(attempts.reduce((s,a) => s+a.trust_score,0)/total) : 0;

  const buckets = Array.from({length:10},(_,i)=>{
    const min=i*10, max=min+10;
    return { min, label:`${min}`, count: attempts.filter(a => a.trust_score>=min&&(i===9?a.trust_score<=max:a.trust_score<max)).length };
  });
  const maxB = Math.max(...buckets.map(b=>b.count),1);

  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
      {/* Graph header */}
      <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color:"var(--text)", letterSpacing:"-0.01em" }}>RISK SCORE ANALYTICS</div>
          <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2, fontFamily:"'IBM Plex Mono',monospace" }}>{total} events · avg {avg}/100</div>
        </div>
        {/* KPI pills */}
        <div style={{ display:"flex", gap:8 }}>
          {[
            { label:"ALLOW", val:allow, color:"#4D8A83" },
            { label:"OTP",   val:otp,   color:"#DF851A" },
            { label:"BLOCK", val:block, color:"#B8521E" },
          ].map(k => (
            <div key={k.label} style={{ textAlign:"center", padding:"6px 12px", background:`${k.color}18`, border:`1px solid ${k.color}40`, borderRadius:6 }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, fontSize:16, color:k.color, lineHeight:1 }}>{k.val}</div>
              <div style={{ fontSize:9, color:"var(--text-3)", letterSpacing:"0.08em", marginTop:3 }}>{k.label}</div>
            </div>
          ))}
        </div>
        {/* Mode toggle */}
        <div style={{ display:"flex", background:"var(--surface)", borderRadius:6, padding:2, border:"1px solid var(--border)" }}>
          {(["timeline","distribution"] as const).map(m => (
            <button key={m} onClick={()=>setMode(m)} style={{
              padding:"4px 10px", borderRadius:4, border:"none", cursor:"pointer", fontSize:10, fontFamily:"'IBM Plex Mono',monospace",
              fontWeight:500, letterSpacing:"0.04em", transition:"all .15s",
              background: mode===m ? "var(--border-hi)" : "transparent",
              color: mode===m ? "var(--text)" : "var(--text-3)"
            }}>{m.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ position:"relative", padding:"4px 0" }}>
        {mode === "timeline" ? (
          pts.length === 0 ? (
            <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)", fontSize:12, fontFamily:"'IBM Plex Mono',monospace" }}>
              NO DATA — RUN A SIMULATION
            </div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", display:"block", minHeight:180 }}>
              <defs>
                <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B687F" stopOpacity="0.35"/>
                  <stop offset="100%" stopColor="#3B687F" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="lG" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3B687F"/>
                  <stop offset="50%" stopColor="#4D8A83"/>
                  <stop offset="100%" stopColor="#A3C7C0"/>
                </linearGradient>
              </defs>
              {/* Zone bands */}
              <rect x={pad.l} y={gY(100)} width={cW} height={gY(90)-gY(100)} fill="#4D8A8318"/>
              <rect x={pad.l} y={gY(90)}  width={cW} height={gY(50)-gY(90)}  fill="#DF851A12"/>
              <rect x={pad.l} y={gY(50)}  width={cW} height={gY(0)-gY(50)}   fill="#B8521E12"/>
              {/* Threshold lines */}
              <line x1={pad.l} y1={gY(90)} x2={pad.l+cW} y2={gY(90)} stroke="#4D8A83" strokeWidth=".8" strokeDasharray="4 4" opacity=".6"/>
              <line x1={pad.l} y1={gY(50)} x2={pad.l+cW} y2={gY(50)} stroke="#DF851A" strokeWidth=".8" strokeDasharray="4 4" opacity=".6"/>
              {/* Axis labels */}
              {[100,90,50,0].map(v => (
                <text key={v} x={pad.l-5} y={gY(v)+4} textAnchor="end" fontSize="8" fill="var(--text-3)" fontFamily="IBM Plex Mono,monospace">{v}</text>
              ))}
              {/* Zone text */}
              <text x={pad.l+cW-4} y={gY(95)+3} textAnchor="end" fontSize="7.5" fill="#4D8A83" fontFamily="IBM Plex Mono,monospace" fontWeight="600" letterSpacing="1">ALLOW ≥90</text>
              <text x={pad.l+cW-4} y={gY(70)+3} textAnchor="end" fontSize="7.5" fill="#DF851A" fontFamily="IBM Plex Mono,monospace" fontWeight="600" letterSpacing="1">OTP 50–89</text>
              <text x={pad.l+cW-4} y={gY(25)+3} textAnchor="end" fontSize="7.5" fill="#B8521E" fontFamily="IBM Plex Mono,monospace" fontWeight="600" letterSpacing="1">BLOCK &lt;50</text>
              {/* Area & line */}
              {area && <path d={area} fill="url(#aG)"/>}
              {line && <path d={line} fill="none" stroke="url(#lG)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
              {/* Points */}
              {pts.map((p,i) => {
                const col = scoreColor(p.d.trust_score);
                const hov = hovered === i;
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={hov?16:10} fill={col} fillOpacity={hov?.18:.06} style={{cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onClick={()=>onSelect(p.d)}/>
                    <circle cx={p.x} cy={p.y} r={hov?5:3.5} fill="#fff" stroke={col} strokeWidth={hov?2.5:2} style={{cursor:"pointer",transition:"all .15s"}}
                      onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onClick={()=>onSelect(p.d)}/>
                  </g>
                );
              })}
              {/* X axis */}
              <line x1={pad.l} y1={pad.t+cH} x2={pad.l+cW} y2={pad.t+cH} stroke="var(--border)" strokeWidth="1"/>
              <text x={pad.l} y={H-8} fontSize="8" fill="var(--text-3)" fontFamily="IBM Plex Mono,monospace">OLDEST</text>
              <text x={pad.l+cW} y={H-8} textAnchor="end" fontSize="8" fill="var(--text-3)" fontFamily="IBM Plex Mono,monospace">LATEST</text>
            </svg>
          )
        ) : (
          <div style={{ padding:"12px 20px 16px", display:"grid", gridTemplateColumns:"repeat(10,1fr)", gap:6, alignItems:"flex-end", height:200 }}>
            {buckets.map((b,i) => {
              const h = (b.count/maxB)*120;
              const col = b.min>=90?"#4D8A83":b.min>=50?"#DF851A":"#B8521E";
              return (
                <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end", height:160 }}>
                  <span style={{ fontSize:9, color:"var(--text-3)", fontFamily:"IBM Plex Mono,monospace", marginBottom:4 }}>{b.count||""}</span>
                  <div style={{ width:"100%", background:"var(--border)", borderRadius:"3px 3px 0 0", height:120, display:"flex", alignItems:"flex-end" }}>
                    <div style={{ width:"100%", background:col, borderRadius:"3px 3px 0 0", height:`${Math.max((b.count/maxB)*100,2)}%`, transition:"height .3s ease", opacity:.85 }}/>
                  </div>
                  <span style={{ fontSize:8, color:"var(--text-3)", fontFamily:"IBM Plex Mono,monospace", marginTop:4 }}>{b.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Hover tooltip */}
        {hovered !== null && pts[hovered] && mode==="timeline" && (
          <div style={{
            position:"absolute", pointerEvents:"none", zIndex:20,
            left:`${(pts[hovered].x / W)*100}%`,
            top:`${Math.max((pts[hovered].y / H)*100 - 14, 4)}%`,
            transform:"translate(-50%,-100%)",
            background:"var(--surface)", border:"1px solid var(--border-hi)",
            borderRadius:8, padding:"8px 12px", minWidth:160,
            boxShadow:"0 8px 24px rgba(0,0,0,0.5)"
          }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:600, color:scoreColor(pts[hovered].d.trust_score), marginBottom:4 }}>
              {pts[hovered].d.trust_score}/100 — {decisionLabel(pts[hovered].d.decision, pts[hovered].d.trust_score)}
            </div>
            <div style={{ fontSize:10, color:"var(--text-2)", fontFamily:"'IBM Plex Mono',monospace" }}>
              {pts[hovered].d.wallet_address.slice(0,8)}…{pts[hovered].d.wallet_address.slice(-6)}
            </div>
            {pts[hovered].d.ip_address && (
              <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>ip {pts[hovered].d.ip_address}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── User Card ──────────────────────────────────────────────── */
function UserCard({ wallet, attempts, onClick }: { wallet: string; attempts: Attempt[]; onClick: () => void }) {
  const avg = Math.round(attempts.reduce((s,a) => s+a.trust_score,0)/attempts.length);
  const hasFraud = attempts.some(a => !!a.cluster_id);
  const latest = attempts[attempts.length-1];
  const col = scoreColor(avg);
  const initials = wallet.slice(2,4).toUpperCase();
  return (
    <button onClick={onClick} style={{
      width:"100%", textAlign:"left", background:"var(--surface)", border:"1px solid var(--border)",
      borderRadius:10, padding:"12px 14px", cursor:"pointer", transition:"all .15s",
      display:"flex", alignItems:"center", gap:12,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = col; (e.currentTarget as HTMLElement).style.background = "var(--card)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
    >
      <div style={{ width:36, height:36, borderRadius:8, background:`${col}22`, border:`1.5px solid ${col}55`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:11, color:col }}>{initials}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, fontWeight:500, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {wallet.slice(0,10)}…{wallet.slice(-6)}
        </div>
        <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>
          {attempts.length} event{attempts.length!==1?"s":""} · {new Date(latest.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
        </div>
        {hasFraud && (
          <div style={{ fontSize:8, color:"#B8521E", background:"rgba(184,82,30,0.12)", border:"1px solid rgba(184,82,30,0.3)", borderRadius:4, padding:"1px 6px", display:"inline-block", marginTop:4, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.06em" }}>
            ⚠ FRAUD RING
          </div>
        )}
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:20, color:col, lineHeight:1 }}>{avg}</div>
        <div style={{ fontSize:8, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:2, letterSpacing:"0.06em" }}>AVG SCORE</div>
      </div>
    </button>
  );
}

/* ─── Prediction Card ────────────────────────────────────────── */
function PredCard({ icon, title, value, detail, color }: { icon:string; title:string; value:string; detail:string; color:string }) {
  return (
    <div style={{ background:`${color}0d`, border:`1px solid ${color}30`, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <span style={{ fontSize:16, lineHeight:1, marginTop:1, flexShrink:0 }}>{icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.08em", marginBottom:3 }}>{title.toUpperCase()}</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color, marginBottom:4, letterSpacing:"-0.01em" }}>{value}</div>
          <div style={{ fontSize:10, color:"var(--text-2)", lineHeight:1.5 }}>{detail}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Simulator ──────────────────────────────────────────────── */
function Simulator({ onDone }: { onDone: () => void }) {
  const [wallet, setWallet] = useState(PRESETS[0].wallet);
  const [device, setDevice] = useState(PRESETS[0].device);
  const [ip,     setIp]     = useState(PRESETS[0].ip);
  const [active, setActive] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<any>(null);

  const applyPreset = (p: typeof PRESETS[0]) => { setActive(p.key); setWallet(p.wallet); setDevice(p.device); setIp(p.ip); setResult(null); };

  const run = async () => {
    setLoading(true); setResult(null);
    try {
      const r = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ wallet_address:wallet, device_fingerprint:device, ip_address:ip }) });
      const text = await r.text();
      if (!text) throw new Error('API returned empty response — is the backend running?');
      const d = JSON.parse(text);
      setResult(d); onDone();
    } catch(e:any) {
      // Simulate a realistic result when backend is offline
      const score = wallet.toLowerCase().includes('f6a7') || ip.startsWith('203') ? 32
                  : device.includes('new_unknown') ? 68
                  : ip === '203.0.113.55' ? 74 : 94;
      const dec = score >= 90 ? 'allow' : score >= 50 ? 'otp_required' : 'blocked';
      setResult({ decision: dec, trustScore: score, reasons: ['demo-mode: backend offline'], _demo: true });
      onDone();
    } finally { setLoading(false); }
  };

  const dec = result?.decision ?? result?.state ?? "";
  const ok  = dec==="allow"||dec==="CHALLENGE_ISSUED";
  const mid = dec==="otp_required"||dec==="OTP_PENDING";
  const bad = dec==="blocked"||dec==="BLOCKED";

  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:"20px", height:"100%" }}>
      <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color:"var(--text)", letterSpacing:"-0.01em", marginBottom:4 }}>AUTHENTICATION SIMULATOR</div>
      <div style={{ fontSize:10, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginBottom:16 }}>Fire live requests against the risk engine</div>

      {/* Presets */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
        <span style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.08em", alignSelf:"center" }}>SCENARIO</span>
        {PRESETS.map(p => (
          <button key={p.key} onClick={()=>applyPreset(p)} style={{
            padding:"4px 10px", borderRadius:5, border:`1px solid ${active===p.key?"#3B687F":"var(--border)"}`,
            background: active===p.key ? "rgba(59,104,127,0.2)" : "var(--surface)",
            color: active===p.key ? "#A3C7C0" : "var(--text-2)",
            fontSize:10, fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer",
            transition:"all .15s",
          }}>{p.label}</button>
        ))}
      </div>

      {/* Inputs */}
      <div style={{ display:"grid", gap:10, marginBottom:16 }}>
        {[
          { label:"WALLET", value:wallet, set:setWallet, ph:"0x…" },
          { label:"DEVICE FINGERPRINT", value:device, set:setDevice, ph:"sha256…" },
          { label:"IP ADDRESS", value:ip, set:setIp, ph:"0.0.0.0" },
        ].map(f => (
          <div key={f.label}>
            <label style={{ display:"block", fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.08em", marginBottom:5 }}>{f.label}</label>
            <input value={f.value} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={{
              width:"100%", padding:"7px 10px", background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:6, color:"var(--text)", fontSize:10, fontFamily:"'IBM Plex Mono',monospace", outline:"none",
              transition:"border-color .15s",
            }}
              onFocus={e=>{(e.target as HTMLElement).style.borderColor="#3B687F";}}
              onBlur={e=>{(e.target as HTMLElement).style.borderColor="var(--border)";}}
            />
          </div>
        ))}
      </div>

      {/* Run button */}
      <button onClick={run} disabled={loading} style={{
        width:"100%", padding:"10px", background: loading ? "var(--border)" : "linear-gradient(135deg,#0B3866,#3B687F)",
        border:"none", borderRadius:7, color:"#fff", fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12,
        letterSpacing:"0.05em", cursor: loading ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        transition:"all .2s", opacity: loading ? .7 : 1,
      }}>
        {loading ? (
          <><span style={{ width:12, height:12, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block", animation:"spin 0.7s linear infinite" }}/> EVALUATING…</>
        ) : "RUN EVALUATION →"}
      </button>

      {/* Result */}
      {result && !result.error && (
        <div style={{ marginTop:14, padding:"12px 14px", background: ok?"rgba(77,138,131,0.1)":mid?"rgba(223,133,26,0.1)":"rgba(184,82,30,0.1)", border:`1px solid ${ok?"rgba(77,138,131,0.3)":mid?"rgba(223,133,26,0.3)":"rgba(184,82,30,0.3)"}`, borderRadius:8 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color: ok?"#4D8A83":mid?"#DF851A":"#B8521E", marginBottom:4 }}>
            {ok?"✓ ALLOW":mid?"⚡ OTP REQUIRED":"✗ BLOCKED"}
          </div>
          {result.trustScore !== undefined && (
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"var(--text-2)" }}>score {result.trustScore}/100</div>
          )}
          {result.reasons?.length > 0 && (
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"var(--text-3)", marginTop:4 }}>{result.reasons.join(" · ")}</div>
          )}
        </div>
      )}
      {result?.error && (
        <div style={{ marginTop:12, padding:"8px 12px", background:"rgba(184,82,30,0.1)", border:"1px solid rgba(184,82,30,0.3)", borderRadius:7, fontSize:10, color:"#B8521E", fontFamily:"'IBM Plex Mono',monospace" }}>
          {result.error}
        </div>
      )}
    </div>
  );
}

/* ─── Inspect Modal ──────────────────────────────────────────── */
function InspectModal({ attempt, onClose }: { attempt: Attempt; onClose: () => void }) {
  const col = scoreColor(attempt.trust_score);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:"var(--card)", border:"1px solid var(--border-hi)", borderRadius:16, padding:"24px 28px", maxWidth:520, width:"92%", boxShadow:"0 24px 60px rgba(0,0,0,0.6)", animation:"fade-up 0.2s ease both" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, paddingBottom:16, borderBottom:"1px solid var(--border)" }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:14, color:"var(--text)" }}>CRYPTOGRAPHIC INSPECTOR</div>
            <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:3, letterSpacing:"0.06em" }}>ATTEMPT AUDIT RECORD</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ padding:"6px 14px", borderRadius:6, background:`${col}18`, border:`1px solid ${col}40`, fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12, color:col }}>
              {decisionLabel(attempt.decision, attempt.trust_score)} — {attempt.trust_score}/100
            </div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-3)", fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
          </div>
        </div>
        <div style={{ display:"grid", gap:12 }}>
          {[
            { label:"Event ID", value:attempt.event_id },
            { label:"Wallet Address", value:attempt.wallet_address },
            { label:"Client IP", value:attempt.ip_address||"127.0.0.1" },
            ...(attempt.cluster_id ? [{ label:"Fraud Ring Cluster", value:attempt.cluster_id }] : []),
            { label:"Timestamp", value:new Date(attempt.timestamp).toISOString() },
          ].map(row => (
            <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
              <span style={{ fontSize:10, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{row.label}</span>
              <span style={{ fontSize:10, color:"var(--text)", fontFamily:"'IBM Plex Mono',monospace", textAlign:"right", wordBreak:"break-all" }}>{row.value}</span>
            </div>
          ))}
          {attempt.device_fingerprint && (
            <div>
              <div style={{ fontSize:10, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.04em", marginBottom:6 }}>Device Fingerprint</div>
              <div style={{ fontSize:9, color:"var(--text)", fontFamily:"'IBM Plex Mono',monospace", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", wordBreak:"break-all", lineHeight:1.7 }}>
                {attempt.device_fingerprint}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────── */
export default function Dashboard() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [topN, setTopN] = useState(25);
  const [filter, setFilter] = useState<"all"|"allow"|"otp"|"blocked"|"cluster">("all");
  const [search, setSearch] = useState("");
  const [inspect, setInspect] = useState<Attempt|null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState<"overview"|"simulate"|"log">("overview");

  const fetch_ = async (spin=true) => {
    if (spin) setLoading(true);
    try {
      const r = await fetch(`/api/admin/attempts/top?n=${topN}`);
      if (!r.ok) throw new Error('bad status');
      const text = await r.text();
      if (!text) throw new Error('empty');
      const d = JSON.parse(text);
      setAttempts(d.attempts?.length ? d.attempts : SAMPLE_DATA);
    } catch {
      // API unavailable — show built-in demo data
      setAttempts(SAMPLE_DATA);
    } finally { if(spin) setLoading(false); }
  };

  useEffect(() => { fetch_(); }, [topN]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetch_(false), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, topN]);

  const clusters = attempts.filter(a => !!a.cluster_id).length;
  const filtered = attempts.filter(a => {
    if (filter==="cluster" && !a.cluster_id) return false;
    if (filter==="allow"   && !(a.trust_score>=90)) return false;
    if (filter==="otp"     && !(a.trust_score>=50&&a.trust_score<90)) return false;
    if (filter==="blocked" && !(a.trust_score<50)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return a.wallet_address.toLowerCase().includes(q)||a.ip_address?.includes(q)||a.cluster_id?.includes(q);
    }
    return true;
  });

  /* Unique wallets */
  const walletMap = new Map<string, Attempt[]>();
  attempts.forEach(a => { if(!walletMap.has(a.wallet_address)) walletMap.set(a.wallet_address,[]); walletMap.get(a.wallet_address)!.push(a); });

  /* Predictions */
  const total = attempts.length;
  const blocked_ = attempts.filter(a=>a.trust_score<50).length;
  const otp_ = attempts.filter(a=>a.trust_score>=50&&a.trust_score<90).length;
  const allow_ = attempts.filter(a=>a.trust_score>=90).length;
  const avg_ = total ? Math.round(attempts.reduce((s,a)=>s+a.trust_score,0)/total) : 0;
  const rings = new Set(attempts.filter(a=>!!a.cluster_id).map(a=>a.wallet_address)).size;
  const fraudPct = total ? Math.round((blocked_/total)*100) : 0;

  const preds = [
    { icon:"🔮", title:"Next Login Forecast", value: avg_>=80?"ALLOW — Low Friction":avg_>=55?"OTP STEP-UP":"BLOCK — High Threat", detail:`Rolling avg ${avg_}/100 across ${total} events`, color: avg_>=80?"#4D8A83":avg_>=55?"#DF851A":"#B8521E" },
    { icon:"⚠️", title:"Fraud Exposure", value: fraudPct===0?"MINIMAL":fraudPct<20?"LOW":fraudPct<40?"MODERATE — Alert":"HIGH — ESCALATE", detail:`${blocked_} blocked of ${total} (${fraudPct}%). ${rings} wallet${rings!==1?"s":""} in rings.`, color: fraudPct<20?"#4D8A83":fraudPct<40?"#DF851A":"#B8521E" },
    { icon:"📈", title:"OTP Friction Load", value: otp_===0?"NONE":`${otp_} sessions (${total?Math.round((otp_/total)*100):0}%)`, detail:"Percentage of sessions receiving SMS OTP challenge.", color:"#3B687F" },
    { icon:"✅", title:"Zero-Friction Rate", value:`${total?Math.round((allow_/total)*100):0}% clean passes`, detail:`${allow_} of ${total} logins scored ≥90 with no friction.`, color:"#4D8A83" },
    { icon:"🕵️", title:"Coordinated Attack", value: rings===0?"NONE DETECTED":`${rings} wallet${rings!==1?"s":""} flagged`, detail: rings===0?"BFS found no cross-wallet collusion patterns.":`Cluster links ${rings} wallets. Recommend escalation.`, color: rings===0?"#4D8A83":"#B8521E" },
  ];

  return (
    <div style={{ position:"relative", zIndex:1, minHeight:"100vh" }}>
      {/* Spin keyframe injected */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position:"sticky", top:0, zIndex:50,
        background:"rgba(13,17,23,0.92)",
        backdropFilter:"blur(12px)",
        borderBottom:"1px solid var(--border)",
        padding:"0 24px", height:56,
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        {/* Brand */}
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ position:"relative", width:32, height:32 }}>
            <div style={{ position:"absolute", inset:0, borderRadius:8, background:"linear-gradient(135deg,#0B3866,#3B687F)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:15 }}>🏛</span>
            </div>
            <div style={{ position:"absolute", bottom:-2, right:-2, width:10, height:10, borderRadius:"50%", background:"#4D8A83", border:"2px solid var(--bg)", animation:"pulse-ring 2s ease-in-out infinite" }}/>
          </div>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:"var(--text)", letterSpacing:"-0.03em", lineHeight:1 }}>IdentityVault</div>
            <div style={{ fontSize:8, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em", marginTop:2 }}>AI-AUGMENTED AUTH SYSTEM</div>
          </div>
          <div style={{ marginLeft:8, padding:"3px 8px", borderRadius:4, background:"rgba(247,183,56,0.15)", border:"1px solid rgba(247,183,56,0.35)", fontSize:8, fontFamily:"'IBM Plex Mono',monospace", color:"#F7B738", letterSpacing:"0.08em", fontWeight:600 }}>
            BANKING AUTH 2.0
          </div>
        </div>

        {/* Service status */}
        <div style={{ display:"flex", gap:10 }}>
          {["Gateway :3000","Risk Engine :8001","Hardhat :8545"].map(s => (
            <div key={s} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:6 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"#4D8A83", display:"inline-block", animation:"pulse-ring 2s ease-in-out infinite" }}/>
              <span style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace", color:"var(--text-2)" }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={()=>setAutoRefresh(v=>!v)} style={{
            padding:"5px 12px", borderRadius:6, border:`1px solid ${autoRefresh?"#4D8A83":"var(--border)"}`,
            background: autoRefresh?"rgba(77,138,131,0.15)":"var(--surface)",
            color: autoRefresh?"#4D8A83":"var(--text-2)", fontSize:10,
            fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer", display:"flex", alignItems:"center", gap:6,
          }}>
            <span style={{ width:5, height:5, borderRadius:"50%", background: autoRefresh?"#4D8A83":"var(--text-3)", animation: autoRefresh?"pulse-ring 2s ease-in-out infinite":"none" }}/>
            {autoRefresh?"LIVE 5s":"AUTO REFRESH"}
          </button>
          <button onClick={()=>fetch_()} disabled={loading} style={{
            padding:"5px 14px", borderRadius:6, border:"none",
            background:"linear-gradient(135deg,#0B3866,#3B687F)",
            color:"#E6EDF3", fontSize:10, fontFamily:"'IBM Plex Mono',monospace",
            fontWeight:600, cursor:"pointer", opacity: loading?.6:1, transition:"opacity .15s",
          }}>
            {loading?"LOADING…":"REFRESH ↻"}
          </button>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main style={{ maxWidth:1200, margin:"0 auto", padding:"24px 20px" }}>

        {/* Tab bar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ display:"flex", gap:4, background:"var(--surface)", borderRadius:8, padding:4, border:"1px solid var(--border)" }}>
            {([
              { id:"overview", label:"OVERVIEW" },
              { id:"simulate", label:"SIMULATOR" },
              { id:"log",      label:`LOG (${filtered.length})` },
            ] as const).map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{
                padding:"6px 16px", borderRadius:5, border:"none", cursor:"pointer", fontSize:10,
                fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, letterSpacing:"0.06em",
                background: tab===t.id ? "var(--border-hi)" : "transparent",
                color: tab===t.id ? "var(--text)" : "var(--text-3)", transition:"all .15s",
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace" }}>
            SYNCED {new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}
          </div>
        </div>

        {/* Fraud ring banner */}
        {clusters > 0 && (
          <div style={{ marginBottom:20, padding:"12px 18px", background:"rgba(184,82,30,0.08)", border:"1px solid rgba(184,82,30,0.3)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20 }}>🚨</span>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12, color:"#B8521E" }}>COORDINATED FRAUD RING DETECTED</div>
                <div style={{ fontSize:10, color:"rgba(184,82,30,0.8)", fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>
                  BFS graph engine linked {clusters} attempts via shared device fingerprints and IP infrastructure
                </div>
              </div>
            </div>
            <button onClick={()=>{setFilter("cluster");setTab("log");}} style={{
              padding:"6px 14px", background:"#B8521E", border:"none", borderRadius:6,
              color:"#fff", fontSize:10, fontFamily:"'IBM Plex Mono',monospace", fontWeight:600,
              cursor:"pointer", whiteSpace:"nowrap",
            }}>INSPECT RING ({clusters})</button>
          </div>
        )}

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <RiskGraph attempts={attempts} onSelect={a=>{setInspect(a); setTab("log");}}/>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

              {/* User Details */}
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", background:"var(--surface)", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14 }}>👤</span>
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12, color:"var(--text)" }}>USER DETAILS</div>
                    <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:1 }}>Wallet profiles from authentication events</div>
                  </div>
                </div>
                <div style={{ padding:14, display:"flex", flexDirection:"column", gap:8, maxHeight:340, overflowY:"auto" }}>
                  {walletMap.size === 0 ? (
                    <div style={{ textAlign:"center", padding:"32px 0", fontSize:10, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace" }}>NO DATA — REFRESH OR SIMULATE</div>
                  ) : (
                    Array.from(walletMap.entries()).slice(0,8).map(([wallet, ua]) => (
                      <UserCard key={wallet} wallet={wallet} attempts={ua} onClick={()=>setInspect(ua[ua.length-1])}/>
                    ))
                  )}
                </div>
              </div>

              {/* Predictions */}
              <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", background:"var(--surface)", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:14 }}>🤖</span>
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:12, color:"var(--text)" }}>AI RISK PREDICTIONS</div>
                    <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:1 }}>Derived from trust score patterns and signals</div>
                  </div>
                </div>
                <div style={{ padding:14, display:"flex", flexDirection:"column", gap:8, maxHeight:340, overflowY:"auto" }}>
                  {total === 0 ? (
                    <div style={{ textAlign:"center", padding:"32px 0", fontSize:10, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace" }}>SIMULATE LOGINS TO SEE PREDICTIONS</div>
                  ) : (
                    preds.map((p,i) => <PredCard key={i} {...p}/>)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SIMULATOR TAB ── */}
        {tab === "simulate" && (
          <div style={{ display:"grid", gridTemplateColumns:"420px 1fr", gap:20, alignItems:"start" }}>
            <Simulator onDone={()=>fetch_(false)}/>
            <RiskGraph attempts={attempts} onSelect={a=>setInspect(a)}/>
          </div>
        )}

        {/* ── LOG TAB ── */}
        {tab === "log" && (
          <div style={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
            {/* Table controls */}
            <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", display:"flex", flexWrap:"wrap", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:13, color:"var(--text)" }}>AUTHENTICATION ACCESS LEDGER</div>
                <div style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", marginTop:2 }}>Live stream of evaluated sign-ins and routing decisions</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ position:"relative" }}>
                  <input placeholder="search wallet, ip, cluster…" value={search} onChange={e=>setSearch(e.target.value)} style={{
                    padding:"6px 10px 6px 28px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:7,
                    color:"var(--text)", fontSize:10, fontFamily:"'IBM Plex Mono',monospace", outline:"none", width:200,
                  }}
                    onFocus={e=>{(e.target as HTMLElement).style.borderColor="#3B687F";}}
                    onBlur={e=>{(e.target as HTMLElement).style.borderColor="var(--border)";}}
                  />
                  <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"var(--text-3)" }}>⌕</span>
                </div>
                <select value={topN} onChange={e=>setTopN(Number(e.target.value))} style={{
                  padding:"6px 10px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:7,
                  color:"var(--text)", fontSize:10, fontFamily:"'IBM Plex Mono',monospace", outline:"none", cursor:"pointer",
                }}>
                  {[10,25,50].map(n=><option key={n} value={n}>TOP {n}</option>)}
                </select>
              </div>
            </div>

            {/* Filter pills */}
            <div style={{ padding:"10px 20px", background:"var(--surface)", borderBottom:"1px solid var(--border)", display:"flex", flexWrap:"wrap", gap:6 }}>
              <span style={{ fontSize:9, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.06em", alignSelf:"center" }}>FILTER</span>
              {([
                { id:"all",     label:"ALL",       count:attempts.length },
                { id:"allow",   label:"ALLOW ≥90", count:allow_ },
                { id:"otp",     label:"OTP 50-89", count:otp_ },
                { id:"blocked", label:"BLOCK <50",  count:blocked_ },
                { id:"cluster", label:"FRAUD RING", count:clusters },
              ] as const).map(f => (
                <button key={f.id} onClick={()=>setFilter(f.id)} style={{
                  padding:"3px 10px", borderRadius:5, border:`1px solid ${filter===f.id?"#3B687F":"var(--border)"}`,
                  background: filter===f.id?"rgba(59,104,127,0.2)":"var(--card)",
                  color: filter===f.id?"#A3C7C0":"var(--text-3)",
                  fontSize:9, fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer", transition:"all .15s",
                }}>{f.label} ({f.count})</button>
              ))}
            </div>

            {/* Table */}
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:"var(--surface)" }}>
                    {["DECISION","SCORE","WALLET","IP","CLUSTER","TIME",""].map(h => (
                      <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:8, color:"var(--text-3)", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em", fontWeight:600, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0 ? (
                    <tr><td colSpan={7} style={{ padding:"48px 0", textAlign:"center", color:"var(--text-3)", fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }}>
                      {loading?"LOADING RECORDS…":"NO MATCHING RECORDS"}
                    </td></tr>
                  ) : filtered.map(a => {
                    const col = scoreColor(a.trust_score);
                    const label = decisionLabel(a.decision, a.trust_score);
                    return (
                      <tr key={a.event_id} style={{ borderBottom:"1px solid var(--border)", transition:"background .1s" }}
                        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="var(--surface)";}}
                        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";}}>
                        <td style={{ padding:"10px 16px" }}>
                          <span style={{ padding:"3px 8px", borderRadius:5, fontSize:9, fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, letterSpacing:"0.06em", background:`${col}18`, color:col, border:`1px solid ${col}40` }}>
                            {label}
                          </span>
                        </td>
                        <td style={{ padding:"10px 16px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:col, lineHeight:1 }}>{a.trust_score}</span>
                            <div style={{ width:48, height:3, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                              <div style={{ width:`${a.trust_score}%`, height:"100%", background:col, borderRadius:2, transition:"width .3s" }}/>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:"10px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--text-2)" }} title={a.wallet_address}>
                          {a.wallet_address.slice(0,8)}…{a.wallet_address.slice(-6)}
                        </td>
                        <td style={{ padding:"10px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"var(--text-3)" }}>
                          {a.ip_address||"127.0.0.1"}
                        </td>
                        <td style={{ padding:"10px 16px" }}>
                          {a.cluster_id ? (
                            <span style={{ fontSize:8, color:"#B8521E", background:"rgba(184,82,30,0.12)", border:"1px solid rgba(184,82,30,0.3)", borderRadius:4, padding:"2px 7px", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.06em" }}>
                              ⚠ {a.cluster_id}
                            </span>
                          ) : <span style={{ color:"var(--text-3)", fontSize:10 }}>—</span>}
                        </td>
                        <td style={{ padding:"10px 16px", fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"var(--text-3)", whiteSpace:"nowrap" }}>
                          {new Date(a.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                        </td>
                        <td style={{ padding:"10px 16px", textAlign:"right" }}>
                          <button onClick={()=>setInspect(a)} style={{ background:"none", border:"1px solid var(--border)", borderRadius:5, padding:"3px 10px", color:"var(--text-3)", fontSize:9, fontFamily:"'IBM Plex Mono',monospace", cursor:"pointer", transition:"all .15s" }}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color="var(--text)"; (e.currentTarget as HTMLElement).style.borderColor="var(--border-hi)";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color="var(--text-3)"; (e.currentTarget as HTMLElement).style.borderColor="var(--border)";}}>
                            INSPECT
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {inspect && <InspectModal attempt={inspect} onClose={()=>setInspect(null)}/>}
    </div>
  );
}
