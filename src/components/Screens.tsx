import { ReactNode } from "react";
import { GameButton, TogglePill, MusicIcon, SoundIcon } from "./ui";

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-[86%] max-w-[360px] rounded-[28px] bg-[#041a30]/70 backdrop-blur-xl border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.45)] px-6 py-7 flex flex-col items-center gap-5 animate-pop ${className}`}>
      {children}
    </div>
  );
}

interface AudioProps {
  music: boolean;
  sound: boolean;
  onToggleMusic: () => void;
  onToggleSound: () => void;
}

// ---------------------------------------------------------------------------
export function MenuScreen({ best, onPlay, music, sound, onToggleMusic, onToggleSound }: { best: number; onPlay: () => void } & AudioProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-10 select-none" style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))", paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="flex flex-col items-center mt-6 animate-float">
        <h1 className="title-text text-[64px] leading-[0.9] font-black tracking-tight text-center">
          DEEP
          <br />
          DIVE
        </h1>
        <p className="mt-4 text-[12px] font-extrabold tracking-[0.4em] text-[#9fe8ff]/90">HOW DEEP CAN YOU GO?</p>
      </div>

      <div className="flex flex-col items-center gap-5">
        {best > 0 && (
          <div className="rounded-full bg-[#03192e]/60 backdrop-blur-md border border-[#ffd85a]/30 px-5 py-1.5 text-sm font-extrabold text-[#ffd85a] tracking-widest">
            ★ BEST {best.toLocaleString()}
          </div>
        )}
        <GameButton onClick={onPlay} className="animate-breathe">
          ▶ &nbsp;PLAY
        </GameButton>
        <div className="flex gap-3">
          <TogglePill label="Sound" on={sound} onToggle={onToggleSound} icon={<SoundIcon />} />
          <TogglePill label="Music" on={music} onToggle={onToggleMusic} icon={<MusicIcon />} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PauseScreen({ onResume, onRestart, onHome, music, sound, onToggleMusic, onToggleSound }: { onResume: () => void; onRestart: () => void; onHome: () => void } & AudioProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#000a18]/55 backdrop-blur-[2px] select-none">
      <Panel>
        <h2 className="text-3xl font-black tracking-[0.25em] text-white">PAUSED</h2>
        <GameButton onClick={onResume}>Resume</GameButton>
        <div className="flex gap-3">
          <TogglePill label="Music" on={music} onToggle={onToggleMusic} icon={<MusicIcon />} />
          <TogglePill label="Sound" on={sound} onToggle={onToggleSound} icon={<SoundIcon />} />
        </div>
        <div className="flex gap-3 w-full">
          <GameButton onClick={onRestart} variant="secondary" size="md" className="flex-1 min-w-0">
            Restart
          </GameButton>
          <GameButton onClick={onHome} variant="ghost" size="md" className="flex-1 min-w-0">
            Home
          </GameButton>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function GameOverScreen({ score, best, depth, newBest, onRetry, onHome }: { score: number; best: number; depth: number; newBest: boolean; onRetry: () => void; onHome: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#000a18]/50 select-none">
      <Panel>
        <h2 className="text-[34px] font-black tracking-[0.15em] text-[#ff8a7a] drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]">GAME OVER</h2>
        {newBest && <div className="-mt-2 rounded-full bg-[#ffd85a] text-[#3a2a00] text-xs font-black px-4 py-1 tracking-widest animate-pop">★ NEW BEST!</div>}
        <div className="grid grid-cols-2 gap-3 w-full">
          <div className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center">
            <span className="text-[10px] font-extrabold tracking-[0.25em] text-white/50">SCORE</span>
            <span className="text-3xl font-black text-white tabular-nums">{score.toLocaleString()}</span>
          </div>
          <div className="rounded-2xl bg-white/5 border border-[#ffd85a]/30 py-3 flex flex-col items-center">
            <span className="text-[10px] font-extrabold tracking-[0.25em] text-[#ffd85a]/70">BEST</span>
            <span className="text-3xl font-black text-[#ffd85a] tabular-nums">{best.toLocaleString()}</span>
          </div>
        </div>
        <div className="text-xs font-extrabold tracking-[0.3em] text-[#8fe9ff]/80 -mt-1">DEPTH {depth}m</div>
        <GameButton onClick={onRetry} className="w-full">
          ↻ &nbsp;Retry
        </GameButton>
        <GameButton onClick={onHome} variant="ghost" size="md" className="w-full">
          Home
        </GameButton>
      </Panel>
    </div>
  );
}
