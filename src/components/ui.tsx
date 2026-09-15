import { useEffect, useRef, ReactNode } from "react";
import { cn } from "../utils/cn";
import { Audio } from "../game/AudioManager";

/** Premium rounded button with press animation. */
export function GameButton({
  children,
  onClick,
  variant = "primary",
  className,
  size = "lg",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  size?: "lg" | "md" | "sm";
}) {
  const styles = {
    primary: "bg-gradient-to-b from-[#5ff0ff] to-[#12a8d8] text-[#04263a] shadow-[0_8px_0_#0b6f95,0_14px_30px_rgba(0,180,255,0.35)] active:shadow-[0_2px_0_#0b6f95] active:translate-y-[6px]",
    secondary: "bg-gradient-to-b from-[#2a6b96] to-[#164a6e] text-white shadow-[0_6px_0_#0d2f47,0_10px_20px_rgba(0,0,0,0.3)] active:shadow-[0_1px_0_#0d2f47] active:translate-y-[5px]",
    ghost: "bg-white/10 text-white backdrop-blur-md border border-white/20 shadow-[0_4px_0_rgba(0,0,0,0.25)] active:translate-y-[3px] active:shadow-none",
    danger: "bg-gradient-to-b from-[#ff8a7a] to-[#d8443c] text-white shadow-[0_6px_0_#8a2a24,0_10px_20px_rgba(0,0,0,0.3)] active:shadow-[0_1px_0_#8a2a24] active:translate-y-[5px]",
  }[variant];
  const sizes = { lg: "px-10 py-4 text-2xl min-w-[220px]", md: "px-6 py-3 text-lg min-w-[180px]", sm: "px-4 py-2 text-sm" }[size];
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        Audio.init();
        Audio.play("click");
        onClick();
      }}
      className={cn(
        "select-none rounded-2xl font-black tracking-wide uppercase transition-all duration-100 ease-out touch-manipulation outline-none",
        styles,
        sizes,
        className
      )}
    >
      {children}
    </button>
  );
}

/** Toggle pill (MUSIC / SOUND). */
export function TogglePill({ label, on, onToggle, icon }: { label: string; on: boolean; onToggle: () => void; icon: ReactNode }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        Audio.init();
        onToggle();
        Audio.play("click");
      }}
      className={cn(
        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-wide transition-all active:scale-95 touch-manipulation border",
        on ? "bg-[#5ff0ff]/20 text-[#bff6ff] border-[#5ff0ff]/50 shadow-[0_0_18px_rgba(95,240,255,0.25)]" : "bg-white/5 text-white/50 border-white/15 line-through decoration-2"
      )}
    >
      <span className="text-base leading-none">{icon}</span>
      {label} <span className="text-[10px] opacity-80">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

/** Small canvas that draws an icon using the game's own art routines. */
export function IconCanvas({ size = 80, draw, className }: { size?: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const start = performance.now();
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      draw(ctx, t);
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [size, draw]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={className} />;
}

export const MusicIcon = () => <span>♫</span>;
export const SoundIcon = () => <span>🔊</span>;
