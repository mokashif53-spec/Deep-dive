import { Sprite } from "./Sprites";
import { TAU } from "./utils";

// ------------------------------------------------------------
// Entity type definitions (all positions are in world space:
// x in logical units across, y = distance travelled downward)
// ------------------------------------------------------------

export type ObstacleKind = "rock" | "coral" | "ruin" | "wall" | "jelly";

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number; // primary collision radius
  circles: { dx: number; dy: number; r: number }[]; // extra collision circles (offsets)
  sprite?: Sprite;
  oy: number; // draw offset from collision center to sprite anchor
  scale: number;
  rot: number;
  phase: number;
  vx: number;
  vy: number;
  size: number; // visual size (jelly bell radius etc)
  color: string; // jelly color
  debris: string[];
  alive: boolean;
  baseX: number; // for drifting jelly
  drift: number;
}

export type CollectibleKind = "bubble" | "coin" | "pearl" | "fish";

export interface Collectible {
  kind: CollectibleKind;
  x: number;
  y: number;
  r: number;
  phase: number;
  alive: boolean;
  vx: number;
  vy: number;
  // fish-only
  school?: FishSchool;
  ox?: number;
  oy?: number;
  color?: string;
  size?: number;
}

export interface FishSchool {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  turnT: number;
  color: string;
  size: number;
  members: Collectible[];
}

export type DecorKind = "seaweed" | "sprite";

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  sprite?: Sprite;
  h: number;
  phase: number;
  color: string;
  scale: number;
  flip: boolean;
}

export type AmbientKind = "ray" | "crab" | "butterfly" | "glowfish";
export interface Ambient {
  kind: AmbientKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
  color: string;
  dir: number;
}

export interface LayerObject {
  x: number;
  y: number;
  sprite: Sprite;
  scale: number;
  alpha: number;
}

// ------------------------------------------------------------
// Live drawing routines for animated entities
// ------------------------------------------------------------

export function drawJellyfish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number, color: string, glow: number) {
  const pulse = 1 + Math.sin(t * 2.4) * 0.08;
  const squish = 1 - Math.sin(t * 2.4) * 0.08;
  ctx.save();
  ctx.translate(x, y);

  // outer glow
  const gl = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 2.2);
  gl.addColorStop(0, color + "55");
  gl.addColorStop(1, color + "00");
  ctx.globalAlpha = 0.5 + glow * 0.5;
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.2, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // tentacles
  ctx.lineCap = "round";
  const nT = 7;
  for (let i = 0; i < nT; i++) {
    const fx = ((i / (nT - 1)) - 0.5) * size * 1.5;
    const len = size * (2.2 + (i % 2) * 0.8);
    ctx.strokeStyle = color + (i % 2 ? "aa" : "77");
    ctx.lineWidth = i % 2 ? 1.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(fx * 0.8, size * 0.5);
    const ph = t * 3 + i * 0.8;
    ctx.bezierCurveTo(
      fx + Math.sin(ph) * size * 0.5, size * 0.5 + len * 0.35,
      fx * 1.3 + Math.sin(ph + 1.2) * size * 0.6, size * 0.5 + len * 0.7,
      fx * 1.2 + Math.sin(ph + 2.2) * size * 0.8, size * 0.5 + len
    );
    ctx.stroke();
  }
  // frilly oral arms
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size * 0.25, size * 0.5);
    ctx.quadraticCurveTo(i * size * 0.4 + Math.sin(t * 2.5 + i) * size * 0.3, size * 1.2, i * size * 0.3 + Math.sin(t * 2 + i) * size * 0.4, size * 1.7);
    ctx.stroke();
  }

  // bell
  ctx.scale(pulse, squish);
  const bg = ctx.createRadialGradient(-size * 0.25, -size * 0.35, size * 0.1, 0, 0, size * 1.05);
  bg.addColorStop(0, "rgba(255,255,255,0.95)");
  bg.addColorStop(0.35, color + "ee");
  bg.addColorStop(1, color + "66");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-size, size * 0.35);
  ctx.bezierCurveTo(-size * 1.05, -size * 0.6, -size * 0.55, -size, 0, -size);
  ctx.bezierCurveTo(size * 0.55, -size, size * 1.05, -size * 0.6, size, size * 0.35);
  // scalloped bottom rim
  for (let i = 4; i >= -4; i--) {
    const px = (i / 4) * size;
    ctx.quadraticCurveTo(px + size * 0.125, size * 0.6, px, size * 0.42);
  }
  ctx.closePath();
  ctx.fill();
  // inner organ
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.15, size * 0.45, size * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + t;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.25, -size * 0.15 + Math.sin(a) * size * 0.15, size * 0.12, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, -size * 0.05, size * 0.92, Math.PI * 1.15, Math.PI * 1.65);
  ctx.stroke();
  ctx.restore();
}

/** Small prey fish, top-down, facing angle (0 = up). */
export function drawSmallFish(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, phase: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const swing = Math.sin(phase) * 0.6;
  // tail
  ctx.save();
  ctx.translate(0, size * 0.9);
  ctx.rotate(swing);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size * 0.5, size * 0.7);
  ctx.lineTo(0, size * 0.45);
  ctx.lineTo(-size * 0.5, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  // body
  const g = ctx.createLinearGradient(-size * 0.4, 0, size * 0.4, 0);
  g.addColorStop(0, color);
  g.addColorStop(0.5, "#ffffff");
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.38, size, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.1, size * 0.16, size * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // eyes
  ctx.fillStyle = "#102030";
  ctx.beginPath();
  ctx.arc(-size * 0.2, -size * 0.55, size * 0.1, 0, TAU);
  ctx.arc(size * 0.2, -size * 0.55, size * 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const r = 11;
  const sx = Math.abs(Math.cos(t * 2.2)) * 0.85 + 0.15;
  ctx.save();
  ctx.translate(x, y);
  // glow
  const gl = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4);
  gl.addColorStop(0, "rgba(255,215,90,0.45)");
  gl.addColorStop(1, "rgba(255,215,90,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, TAU);
  ctx.fill();
  ctx.scale(sx, 1);
  // edge
  ctx.fillStyle = "#b07a12";
  ctx.beginPath();
  ctx.arc(1.5, 1, r, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 1, 0, 0, r);
  g.addColorStop(0, "#fff4b0");
  g.addColorStop(0.5, "#ffcf3f");
  g.addColorStop(1, "#d9950f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, TAU);
  ctx.stroke();
  // star emboss
  ctx.fillStyle = "rgba(190,120,10,0.7)";
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    const a2 = a + TAU / 10;
    ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
    ctx.lineTo(Math.cos(a2) * r * 0.22, Math.sin(a2) * r * 0.22);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // shine sweep
  const sh = (Math.sin(t * 3) + 1) / 2;
  if (sh > 0.85) {
    ctx.save();
    ctx.translate(x - r * 0.4, y - r * 0.4);
    ctx.globalAlpha = (sh - 0.85) / 0.15;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
      ctx.lineTo(Math.cos(a + TAU / 8) * 1.5, Math.sin(a + TAU / 8) * 1.5);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawPearl(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const r = 10;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 1.5) * 2);
  const gl = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 3);
  gl.addColorStop(0, `rgba(255,255,255,${0.35 + Math.sin(t * 3) * 0.1})`);
  gl.addColorStop(0.5, "rgba(200,230,255,0.18)");
  gl.addColorStop(1, "rgba(200,230,255,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, "#eef3ff");
  g.addColorStop(0.8, "#d3c8f0");
  g.addColorStop(1, "#b6d8ea");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // iridescent rim
  ctx.strokeStyle = "rgba(255,180,230,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.4, r * 0.22, 0, TAU);
  ctx.fill();
  // sparkle
  const s = 3 + Math.sin(t * 4) * 2;
  ctx.save();
  ctx.translate(r * 0.6, -r * 0.7);
  ctx.rotate(t);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.25, -s * 0.25);
  ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.25, s * 0.25);
  ctx.lineTo(0, s);
  ctx.lineTo(-s * 0.25, s * 0.25);
  ctx.lineTo(-s, 0);
  ctx.lineTo(-s * 0.25, -s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 0.9) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.02)");
  g.addColorStop(0.85, "rgba(200,240,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0.7)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawSeaweed(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, phase: number, time: number, color: string, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) {
    const hh = h * (1 - Math.abs(i) * 0.25);
    const sway = Math.sin(time * 1.3 + phase + i) * 10;
    const sway2 = Math.sin(time * 1.7 + phase + i * 2) * 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 - Math.abs(i);
    ctx.beginPath();
    ctx.moveTo(i * 5, 0);
    ctx.bezierCurveTo(i * 5 + sway * 0.3, -hh * 0.35, i * 8 + sway, -hh * 0.7, i * 6 + sway2, -hh);
    ctx.stroke();
    // leaves
    ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const px = i * 5 + sway * t * t;
      const py = -hh * t;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 8 * (k % 2 ? 1 : -1), py - 4, px + 12 * (k % 2 ? 1 : -1), py - 10);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Harmless ambient life. Screen-space (x, sy). */
export function drawAmbient(ctx: CanvasRenderingContext2D, a: Ambient, sy: number, time: number) {
  ctx.save();
  ctx.translate(a.x, sy);
  switch (a.kind) {
    case "ray": {
      const flap = Math.sin(time * 3 + a.phase);
      ctx.rotate(Math.atan2(a.vx, a.vy));
      ctx.fillStyle = "rgba(90,120,170,0.75)";
      ctx.beginPath();
      ctx.moveTo(0, -a.size * 0.8);
      ctx.quadraticCurveTo(a.size * 1.1, -a.size * 0.2 + flap * 6, a.size * 1.3, a.size * 0.3 + flap * 10);
      ctx.quadraticCurveTo(a.size * 0.5, a.size * 0.5, 0, a.size * 0.7);
      ctx.quadraticCurveTo(-a.size * 0.5, a.size * 0.5, -a.size * 1.3, a.size * 0.3 + flap * 10);
      ctx.quadraticCurveTo(-a.size * 1.1, -a.size * 0.2 + flap * 6, 0, -a.size * 0.8);
      ctx.fill();
      ctx.strokeStyle = "rgba(90,120,170,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, a.size * 0.6);
      ctx.lineTo(Math.sin(time * 2) * 4, a.size * 1.8);
      ctx.stroke();
      ctx.fillStyle = "rgba(220,235,255,0.5)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc((i % 2 ? 1 : -1) * a.size * 0.3, -a.size * 0.3 + i * 4, 1.3, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "crab": {
      const walk = Math.sin(time * 8 + a.phase);
      ctx.fillStyle = "#ff6a3d";
      ctx.strokeStyle = "#ff6a3d";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(s * 4, -1 + i * 2);
          ctx.lineTo(s * (9 + i), 1 + i * 2 + walk * (i % 2 ? 1.5 : -1.5));
          ctx.stroke();
        }
        // claw
        ctx.beginPath();
        ctx.arc(s * 8, -5 + walk * s, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 4.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(-2, -3.5, 1, 0, TAU);
      ctx.arc(2, -3.5, 1, 0, TAU);
      ctx.fill();
      break;
    }
    case "butterfly": {
      const flap = Math.abs(Math.sin(time * 9 + a.phase));
      ctx.fillStyle = a.color;
      ctx.globalAlpha = 0.85;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * 3.5 * (0.3 + flap * 0.7), 0, 3.5 * (0.3 + flap * 0.7), 5, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.2, 3.5, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case "glowfish": {
      const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, a.size * 2.5);
      g.addColorStop(0, a.color);
      g.addColorStop(0.3, a.color + "88");
      g.addColorStop(1, a.color + "00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, a.size * 2.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(0, 0, a.size * 0.5, a.size, Math.atan2(-a.vx, a.vy), 0, TAU);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}
