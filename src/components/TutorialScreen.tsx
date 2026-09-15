import { useMemo, useState } from "react";
import { GameButton, IconCanvas } from "./ui";
import { Player } from "../game/Player";
import { drawCoin, drawPearl, drawBubble, drawSmallFish, drawJellyfish } from "../game/Entities";
import { drawShark } from "../game/Creatures";
import { makeRock, drawSprite, Sprite } from "../game/Sprites";
import { cn } from "../utils/cn";

const player = new Player();
let rockSprite: Sprite | null = null;

function arrow(ctx: CanvasRenderingContext2D, x: number, dir: 1 | -1, pulse: number) {
  ctx.save();
  ctx.translate(x + dir * pulse * 6, 0);
  ctx.fillStyle = "#5ff0ff";
  ctx.beginPath();
  ctx.moveTo(dir * 22, 0);
  ctx.lineTo(0, -16);
  ctx.lineTo(0, -7);
  ctx.lineTo(-dir * 18, -7);
  ctx.lineTo(-dir * 18, 7);
  ctx.lineTo(0, 7);
  ctx.lineTo(0, 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const drawSteer = (ctx: CanvasRenderingContext2D, t: number) => {
  player.tailPhase = t * 8;
  player.finPhase = t * 3;
  player.bank = Math.sin(t * 2) * 0.6;
  player.yaw = Math.sin(t * 2) * 0.25;
  const pulse = (Math.sin(t * 4) + 1) / 2;
  arrow(ctx, -72, -1, pulse);
  arrow(ctx, 72, 1, pulse);
  ctx.scale(1.1, 1.1);
  player.draw(ctx, Math.sin(t * 2) * 14, 6);
};

const drawBoost = (ctx: CanvasRenderingContext2D, t: number) => {
  const tap = (Math.sin(t * 5) + 1) / 2;
  // ripple
  ctx.strokeStyle = `rgba(95,240,255,${0.7 * (1 - tap)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-6, -10, 14 + tap * 28, 0, Math.PI * 2);
  ctx.stroke();
  // finger
  ctx.save();
  ctx.translate(0, tap * 6);
  ctx.fillStyle = "#ffd9b8";
  ctx.strokeStyle = "#c98a63";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-14, -12, 16, 46, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(2, 8, 12, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(14, 12, 11, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // lightning
  ctx.save();
  ctx.translate(48, -30);
  ctx.rotate(0.15);
  ctx.scale(1 + tap * 0.15, 1 + tap * 0.15);
  ctx.fillStyle = "#ffe25a";
  ctx.shadowColor = "#ffe25a";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(-4, -24);
  ctx.lineTo(10, -24);
  ctx.lineTo(2, -4);
  ctx.lineTo(12, -4);
  ctx.lineTo(-8, 26);
  ctx.lineTo(-2, 2);
  ctx.lineTo(-12, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawCollect = (ctx: CanvasRenderingContext2D, t: number) => {
  ctx.save();
  ctx.scale(1.35, 1.35);
  drawBubble(ctx, -48, -18 + Math.sin(t * 2) * 3, 9);
  drawCoin(ctx, -16, 4, t);
  drawPearl(ctx, 16, -8, t);
  drawSmallFish(ctx, 48, 8 + Math.sin(t * 3) * 3, Math.PI / 2 + Math.sin(t * 3) * 0.2, 8, t * 10, "#ffb347");
  ctx.restore();
};

const drawDanger = (ctx: CanvasRenderingContext2D, t: number) => {
  if (!rockSprite) rockSprite = makeRock(64, 50, "grey");
  drawSprite(ctx, rockSprite, -58, 6, 1, 0);
  drawJellyfish(ctx, 0, -8 + Math.sin(t * 2) * 4, 15, t, "#ff6fd8", 1);
  drawShark(ctx, 58, 4, Math.PI + Math.sin(t * 2) * 0.15, 70, t * 8, 1);
};

const STEPS = [
  { title: "DRAG LEFT / RIGHT", sub: "Steer your shark", draw: drawSteer },
  { title: "TAP = BOOST", sub: "3 sec invincibility • smash everything", draw: drawBoost },
  { title: "COLLECT THEM", sub: "+1  •  +5  •  +25  •  +10", draw: drawCollect },
  { title: "AVOID DANGER", sub: "Rocks • Jellyfish • Sharks", draw: drawDanger },
];

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = useMemo(() => STEPS[i], [i]);
  const last = i === STEPS.length - 1;
  return (
    <div className="absolute inset-0 flex items-center justify-center select-none">
      <div className="w-[86%] max-w-[360px] rounded-[28px] bg-[#041a30]/75 backdrop-blur-xl border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.45)] px-6 pt-6 pb-7 flex flex-col items-center gap-4 animate-pop" key={i}>
        <div className="text-[10px] font-extrabold tracking-[0.35em] text-white/45">HOW TO PLAY</div>
        <div className="rounded-3xl bg-gradient-to-b from-[#0b4f7a]/70 to-[#052b48]/70 border border-white/10 w-full flex items-center justify-center py-4">
          <IconCanvas size={200} draw={step.draw} />
        </div>
        <h3 className="text-2xl font-black tracking-wider text-white text-center">{step.title}</h3>
        <p className="-mt-2 text-sm font-bold text-[#9fe8ff]/80 text-center">{step.sub}</p>
        {last && (
          <div className="rounded-full bg-[#ffe25a]/15 border border-[#ffe25a]/40 px-4 py-1.5 text-xs font-black text-[#ffe25a] tracking-widest">⚡ BOOST = 3 SEC INVINCIBILITY</div>
        )}
        <div className="flex gap-1.5 mt-1">
          {STEPS.map((_, k) => (
            <span key={k} className={cn("h-1.5 rounded-full transition-all", k === i ? "w-6 bg-[#5ff0ff]" : "w-1.5 bg-white/25")} />
          ))}
        </div>
        <GameButton onClick={() => (last ? onDone() : setI(i + 1))} className="w-full">
          {last ? "Let's Dive!" : "Next"}
        </GameButton>
        {!last && (
          <button onClick={onDone} className="text-xs font-bold text-white/40 hover:text-white/70 tracking-widest uppercase -mt-1 touch-manipulation">
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
