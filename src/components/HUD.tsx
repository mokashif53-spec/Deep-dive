import { Snapshot } from "../game/Game";
import { BOOST_COOLDOWN } from "../game/constants";
import { cn } from "../utils/cn";

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-[#03192e]/55 backdrop-blur-md px-3 py-1.5 min-w-[74px] border border-white/10 shadow-lg">
      <span className="text-[9px] font-extrabold tracking-[0.2em] text-white/55">{label}</span>
      <span className={cn("text-lg font-black leading-tight tabular-nums", accent ?? "text-white")}>{value}</span>
    </div>
  );
}

export function HUD({ snap, onPause }: { snap: Snapshot; onPause: () => void }) {
  const cooldownPct = snap.boostActive ? 1 : 1 - snap.boostCooldown / BOOST_COOLDOWN;
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex gap-2">
          <Stat label="SCORE" value={snap.score.toLocaleString()} />
          <Stat label="BEST" value={snap.best.toLocaleString()} accent="text-[#ffd85a]" />
          <Stat label="DEPTH" value={`${snap.depth}m`} accent="text-[#8fe9ff]" />
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPause();
          }}
          aria-label="Pause"
          className="pointer-events-auto touch-manipulation w-11 h-11 rounded-2xl bg-[#03192e]/55 backdrop-blur-md border border-white/10 text-white text-xl font-black flex items-center justify-center active:scale-90 transition-transform shadow-lg"
        >
          <span className="flex gap-[5px]">
            <span className="block w-[5px] h-4 rounded-sm bg-white" />
            <span className="block w-[5px] h-4 rounded-sm bg-white" />
          </span>
        </button>
      </div>

      {/* zone name toast */}
      <div key={snap.zoneName} className="absolute top-[72px] left-0 right-0 flex justify-center animate-zone">
        <span className="text-[11px] font-extrabold tracking-[0.35em] text-white/70 drop-shadow">{snap.zoneName}</span>
      </div>

      {/* boost indicator */}
      <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        {snap.boostActive ? (
          <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1ec8ff]/80 to-[#7df5ff]/80 px-5 py-2 text-[#04263a] font-black text-lg shadow-[0_0_30px_rgba(95,240,255,0.6)] animate-pulse-fast border border-white/50">
            <span>⚡</span>
            <span>BOOST</span>
            <span className="tabular-nums">{snap.boostTimer.toFixed(1)}s</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-[#03192e]/45 backdrop-blur-md px-4 py-1.5 border border-white/10">
            <div className="relative w-24 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-100", snap.canBoost ? "bg-[#5ff0ff]" : "bg-white/40")} style={{ width: `${cooldownPct * 100}%` }} />
            </div>
            <span className={cn("text-[10px] font-extrabold tracking-[0.2em]", snap.canBoost ? "text-[#bff6ff]" : "text-white/40")}>{snap.canBoost ? "TAP = BOOST" : "RECHARGING"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
