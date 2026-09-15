import { LW } from "./constants";
import { clamp, damp, lerp, rand, TAU } from "./utils";

/**
 * Creature system: dangerous sea life that approaches from AHEAD (top of screen).
 *
 * World convention: +y = forward / deeper = UP on screen. Screen y = camY - y.
 * A creature with vy < 0 swims toward the player; vy = 0 holds position and is
 * passed by the player; the player's own speed always makes creatures flow DOWN.
 */
export type CreatureKind = "shark" | "octopus" | "bigJelly" | "eel" | "manta" | "angler" | "serpent";

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Creature {
  kind: CreatureKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  phase: number;
  size: number;
  t: number;
  alive: boolean;
  warn: number; // seconds of warning remaining (waits above the screen)
  warned: boolean;
  knock: number; // >0 while flung away after a boost hit
  kx: number;
  ky: number;
  spin: number;
  harmless: boolean;
  chase: number;
  variant: number;
  side: number;
  trail: { x: number; y: number }[];
  anchorX: number;
  anchorY: number;
  extend: number;
  pulse: number;
  mouth: number;
  eyeLook: number;
}

export const BIG_KINDS: CreatureKind[] = ["octopus", "eel", "manta", "angler", "serpent", "bigJelly"];

export function createCreature(kind: CreatureKind, x: number, y: number, variant = 0, side = 1): Creature {
  const c: Creature = {
    kind, x, y, vx: 0, vy: 0, angle: 0, phase: rand(0, TAU), size: 30, t: 0, alive: true,
    warn: 0, warned: false, knock: 0, kx: 0, ky: 0, spin: 0, harmless: false, chase: 0, variant, side,
    trail: [], anchorX: x, anchorY: y, extend: 0, pulse: rand(0, 2), mouth: 0, eyeLook: 0,
  };
  switch (kind) {
    case "shark": {
      const len = [64, 90, 122][variant];
      c.size = len;
      const spd = [rand(60, 90), rand(85, 120), rand(100, 135)][variant];
      c.vx = -side * spd;
      c.vy = -rand(15, 55); // drifts toward the player
      c.chase = [0, 0.35, 0.6][variant];
      break;
    }
    case "octopus":
      c.size = 36;
      c.vy = -22;
      c.chase = 0.6;
      c.warn = 1.3;
      break;
    case "bigJelly":
      c.size = 40;
      c.vy = -18;
      c.warn = 0.9;
      break;
    case "eel":
      c.size = 14;
      c.anchorX = side < 0 ? -6 : LW + 6;
      c.anchorY = y;
      c.warn = 1.2;
      break;
    case "manta":
      c.size = 150; // half wingspan
      c.vx = -side * 85;
      c.vy = -14;
      c.warn = 1.4;
      break;
    case "angler":
      c.size = 42;
      c.vy = -34;
      c.chase = 0.5;
      c.warn = 1.6;
      break;
    case "serpent":
      c.size = 15;
      c.vx = -side * 70;
      c.vy = -45;
      c.warn = 1.4;
      break;
  }
  return c;
}

// --------------------------------------------------------------------------
// Update
// --------------------------------------------------------------------------
export function updateCreature(c: Creature, dt: number, px: number, py: number, camY: number) {
  c.t += dt;
  c.phase += dt;

  if (c.knock > 0) {
    c.knock -= dt;
    c.x += c.kx * dt;
    c.y += c.ky * dt;
    c.kx = damp(c.kx, 0, 3, dt);
    c.ky = damp(c.ky, 0, 3, dt);
    c.spin += 6 * dt;
    if (c.knock <= 0) c.alive = false;
    return;
  }

  // warning phase: hold just above the top of the screen
  if (c.warn > 0) {
    c.warn -= dt;
    const hold = c.kind === "manta" ? 200 : c.kind === "bigJelly" ? 150 : 130;
    c.y = camY + hold;
    if (c.kind === "eel") c.anchorY = c.y;
    if (c.kind === "serpent") c.trail.length = 0;
    return;
  }

  const ahead = c.y - py; // >0 while still in front of the player

  switch (c.kind) {
    case "shark": {
      if (c.chase > 0 && ahead > 40 && ahead < 420) {
        const want = Math.sign(px - c.x) * Math.abs(c.vx);
        c.vx += (want - c.vx) * c.chase * dt;
      }
      c.x += c.vx * dt;
      c.y += (c.vy + Math.sin(c.phase * 1.3) * 12) * dt;
      c.angle = damp(c.angle, Math.atan2(c.vx, c.vy + 40), 6, dt);
      break;
    }
    case "octopus": {
      if (ahead > 60) {
        const want = clamp((px - c.x) * 0.8, -36, 36);
        c.vx = damp(c.vx, want * c.chase, 2, dt);
      } else c.vx = damp(c.vx, 0, 2, dt);
      c.x = clamp(c.x + c.vx * dt, 70, LW - 70);
      c.y += c.vy * dt;
      break;
    }
    case "bigJelly": {
      c.x = clamp(c.x + Math.sin(c.phase * 0.7) * 22 * dt, 60, LW - 60);
      c.y += c.vy * dt;
      c.pulse += dt;
      if (c.pulse > 3.6) c.pulse = 0;
      break;
    }
    case "eel": {
      // extend across the path, hold, retract; repeat
      const cyc = c.t % 4.2;
      c.extend = cyc < 1.3 ? cyc / 1.3 : cyc < 2.6 ? 1 : Math.max(0, 1 - (cyc - 2.6) / 1.1);
      c.extend = c.extend * c.extend * (3 - 2 * c.extend);
      c.mouth = (Math.sin(c.t * 3.2) + 1) / 2;
      c.eyeLook = damp(c.eyeLook, clamp((px - eelHead(c).x) / 120, -1, 1), 4, dt);
      const h = eelHead(c);
      c.x = h.x;
      c.y = h.y;
      break;
    }
    case "manta": {
      c.x += c.vx * dt;
      c.y += (c.vy + Math.sin(c.phase * 0.9) * 8) * dt;
      break;
    }
    case "angler": {
      if (ahead > 50) {
        const want = clamp((px - c.x) * 0.9, -44, 44);
        c.vx = damp(c.vx, want * c.chase, 2.5, dt);
      } else c.vx = damp(c.vx, 0, 2, dt);
      c.x = clamp(c.x + c.vx * dt, 50, LW - 50);
      c.y += c.vy * dt;
      c.mouth = clamp((Math.sin(c.t * 2) + 0.4), 0, 1);
      break;
    }
    case "serpent": {
      const sway = Math.cos(c.t * 2.4) * 110;
      c.x += (c.vx + sway) * dt;
      c.y += c.vy * dt;
      c.angle = Math.atan2(c.vx + sway, c.vy);
      const last = c.trail[0];
      if (!last || (last.x - c.x) ** 2 + (last.y - c.y) ** 2 > 64) {
        c.trail.unshift({ x: c.x, y: c.y });
        if (c.trail.length > 42) c.trail.pop();
      }
      break;
    }
  }
}

function eelHead(c: Creature) {
  const reach = LW * 0.56;
  const s = 1;
  return {
    x: c.anchorX - c.side * reach * c.extend * s, // extends INWARD from its cave
    y: c.anchorY + Math.sin(s * Math.PI * 1.5 + c.t * 3) * 22 * c.extend - s * 34 * c.extend,
  };
}
function eelPoint(c: Creature, s: number) {
  const reach = LW * 0.56;
  return {
    x: c.anchorX - c.side * reach * c.extend * s,
    y: c.anchorY + Math.sin(s * Math.PI * 1.5 + c.t * 3) * 22 * c.extend * s - s * 34 * c.extend,
  };
}

/** Knock the creature away after a boost smash. */
export function knockCreature(c: Creature, px: number) {
  c.knock = 0.7;
  c.harmless = true;
  const dir = Math.sign(c.x - px) || (Math.random() < 0.5 ? -1 : 1);
  c.kx = dir * rand(200, 320);
  c.ky = rand(180, 280); // pushed forward/away
  if (c.kind === "eel" || c.kind === "serpent") c.knock = 0.45;
}

// --------------------------------------------------------------------------
// Collision shapes
// --------------------------------------------------------------------------
const scratch: Circle[] = [];
function push(x: number, y: number, r: number) {
  scratch.push({ x, y, r });
}

export function creatureCircles(c: Creature): Circle[] {
  scratch.length = 0;
  if (c.harmless || c.warn > 0) return scratch;
  switch (c.kind) {
    case "shark": {
      const r = c.size * 0.17;
      const ux = Math.sin(c.angle);
      const uy = Math.cos(c.angle);
      for (const t of [-0.3, 0, 0.3]) push(c.x + ux * c.size * t, c.y + uy * c.size * t, r);
      break;
    }
    case "octopus": {
      push(c.x, c.y, c.size * 0.95);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        const wave = Math.sin(c.phase * 2 + i) * 0.25;
        const reach = c.size * 1.9;
        push(c.x + Math.cos(a + wave) * reach * 0.6, c.y - Math.sin(a + wave) * reach * 0.6, c.size * 0.3);
        push(c.x + Math.cos(a + wave * 1.5) * reach, c.y - Math.sin(a + wave * 1.5) * reach, c.size * 0.26);
      }
      break;
    }
    case "bigJelly": {
      const zap = c.pulse > 3.0 ? 10 : 0;
      push(c.x, c.y, c.size * 0.9 + zap);
      // tentacles hang toward the player (down screen = -y)
      push(c.x, c.y - c.size * 1.1, c.size * 0.4);
      push(c.x + Math.sin(c.phase * 2) * 10, c.y - c.size * 1.9, c.size * 0.32);
      push(c.x + Math.sin(c.phase * 2 + 1) * 14, c.y - c.size * 2.7, c.size * 0.26);
      break;
    }
    case "eel": {
      if (c.extend < 0.05) break;
      for (let s = 0.12; s <= 1.0; s += 0.11) {
        const p = eelPoint(c, s);
        push(p.x, p.y, s > 0.9 ? 17 : 12);
      }
      break;
    }
    case "manta": {
      const flap = Math.sin(c.phase * 2.2);
      push(c.x, c.y, 36);
      for (const s of [-1, 1]) {
        push(c.x + s * 62, c.y + flap * 6, 28);
        push(c.x + s * 112, c.y + flap * 14, 20);
        push(c.x + s * 140, c.y + flap * 20, 12);
      }
      break;
    }
    case "angler": {
      push(c.x, c.y, c.size * 0.85);
      push(c.x, c.y - c.size * 0.55, c.size * 0.65);
      break;
    }
    case "serpent": {
      push(c.x, c.y, 17);
      for (let i = 2; i < c.trail.length; i += 3) push(c.trail[i].x, c.trail[i].y, 12);
      break;
    }
  }
  return scratch;
}

// --------------------------------------------------------------------------
// Drawing (screen space; sy = camY - y)
// --------------------------------------------------------------------------
export function drawCreature(ctx: CanvasRenderingContext2D, c: Creature, camY: number, time: number, glow: number) {
  if (c.warn > 0) return;
  const sx = c.x;
  const sy = camY - c.y;
  ctx.save();
  if (c.knock > 0) ctx.globalAlpha = clamp(c.knock / 0.7, 0, 1);
  switch (c.kind) {
    case "shark": drawShark(ctx, sx, sy, c.angle + c.spin, c.size, c.phase * (5 + Math.abs(c.vx) / 25), c.variant); break;
    case "octopus": drawOctopus(ctx, sx, sy, c.size, c.phase, c.spin, c.knock > 0); break;
    case "bigJelly": drawBigJelly(ctx, sx, sy, c.size, c.phase, c.pulse, glow); break;
    case "eel": drawEel(ctx, c, camY); break;
    case "manta": drawManta(ctx, sx, sy, c.phase, c.spin, c.vx); break;
    case "angler": drawAngler(ctx, sx, sy, c.size, c.phase, c.mouth, c.spin); break;
    case "serpent": drawSerpent(ctx, c, camY, time); break;
  }
  ctx.restore();
}

/** Warning indicator drawn at the top of the screen before a big creature enters. */
export function drawWarning(ctx: CanvasRenderingContext2D, c: Creature, time: number) {
  const totalWarn = c.kind === "angler" ? 1.6 : c.kind === "manta" ? 1.4 : 1.3;
  const p = 1 - c.warn / totalWarn;
  const blink = (Math.sin(time * 12) + 1) / 2;
  const x = c.kind === "eel" ? (c.side < 0 ? 40 : LW - 40) : clamp(c.x, 40, LW - 40);
  ctx.save();
  // looming shadow
  const w = c.kind === "manta" ? 200 : c.kind === "serpent" ? 90 : 110;
  const g = ctx.createRadialGradient(x, 30, 4, x, 30, w);
  g.addColorStop(0, `rgba(0,0,15,${0.45 * p})`);
  g.addColorStop(1, "rgba(0,0,15,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - w, -20, w * 2, w + 40);
  if (c.kind === "angler") {
    // glowing lure bobbing at the top
    const lx = x + Math.sin(time * 3) * 12;
    const ly = 46 + Math.sin(time * 5) * 6;
    const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 30);
    lg.addColorStop(0, "rgba(200,255,255,0.95)");
    lg.addColorStop(0.3, "rgba(120,240,255,0.5)");
    lg.addColorStop(1, "rgba(120,240,255,0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(lx, ly, 30, 0, TAU);
    ctx.fill();
  } else {
    // glowing eyes in the dark
    ctx.fillStyle = `rgba(255,${c.kind === "octopus" ? 80 : 210},${c.kind === "bigJelly" ? 255 : 60},${0.4 + 0.6 * blink})`;
    ctx.shadowColor = "rgba(255,120,60,0.9)";
    ctx.shadowBlur = 10;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + s * 12, 40, 4, 2.4, 0, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  // "!" badge
  const bx = x;
  const by = 78;
  ctx.globalAlpha = 0.55 + 0.45 * blink;
  ctx.fillStyle = "#ff4b4b";
  ctx.beginPath();
  ctx.moveTo(bx, by - 13);
  ctx.lineTo(bx + 13, by + 10);
  ctx.lineTo(bx - 13, by + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px 'Nunito', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", bx, by + 2);
  ctx.restore();
}

// ---------------- SHARK (stylized predator) ----------------
export function drawShark(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, tailPhase: number, variant = 0) {
  const hw = len * 0.19;
  const hl = len / 2;
  const swing = Math.sin(tailPhase) * 0.5;
  const dark = variant === 2 ? "#2b3346" : variant === 1 ? "#3b4a63" : "#4c5f7a";
  const mid = variant === 2 ? "#5c6a85" : variant === 1 ? "#7288a8" : "#86a0bf";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,10,30,0.22)";
  ctx.beginPath();
  ctx.ellipse(4, 6, hw * 0.9, hl * 0.9, 0, 0, TAU);
  ctx.fill();
  // tail
  ctx.save();
  ctx.translate(0, hl * 0.8);
  ctx.rotate(swing);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.bezierCurveTo(hw * 0.8, hl * 0.1, hw * 1.4, hl * 0.4, hw * 1.1, hl * 0.55);
  ctx.bezierCurveTo(hw * 0.5, hl * 0.35, hw * 0.2, hl * 0.25, 0, hl * 0.22);
  ctx.bezierCurveTo(-hw * 0.2, hl * 0.3, -hw * 0.7, hl * 0.42, -hw * 0.8, hl * 0.44);
  ctx.bezierCurveTo(-hw * 0.9, hl * 0.2, -hw * 0.5, hl * 0.05, 0, -2);
  ctx.fill();
  ctx.restore();
  // pectorals
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.7, -hl * 0.05);
    ctx.quadraticCurveTo(s * hw * 2.0, hl * 0.1, s * hw * 2.3, hl * 0.45);
    ctx.quadraticCurveTo(s * hw * 1.2, hl * 0.3, s * hw * 0.5, hl * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  // body
  const g = ctx.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -hl);
  ctx.bezierCurveTo(hw * 0.9, -hl * 0.8, hw * 1.05, -hl * 0.2, hw, hl * 0.1);
  ctx.bezierCurveTo(hw * 0.9, hl * 0.5, hw * 0.4, hl * 0.75, hw * 0.2, hl * 0.8);
  ctx.lineTo(-hw * 0.2, hl * 0.8);
  ctx.bezierCurveTo(-hw * 0.4, hl * 0.75, -hw * 0.9, hl * 0.5, -hw, hl * 0.1);
  ctx.bezierCurveTo(-hw * 1.05, -hl * 0.2, -hw * 0.9, -hl * 0.8, 0, -hl);
  ctx.closePath();
  ctx.fill();
  // tiger stripes on medium/large
  if (variant > 0) {
    ctx.strokeStyle = "rgba(20,26,40,0.5)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = -hl * 0.3 + i * hl * 0.25;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.7, yy);
      ctx.quadraticCurveTo(0, yy + 5, hw * 0.7, yy);
      ctx.stroke();
    }
  }
  // back stripe & dorsal
  ctx.fillStyle = "rgba(20,26,40,0.4)";
  ctx.beginPath();
  ctx.ellipse(0, -hl * 0.1, hw * 0.35, hl * 0.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#222a3a";
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, -hl * 0.15);
  ctx.quadraticCurveTo(0, hl * 0.2, hw * 0.12, hl * 0.5);
  ctx.quadraticCurveTo(hw * 0.05, hl * 0.1, hw * 0.2, -hl * 0.15);
  ctx.closePath();
  ctx.fill();
  // scar on large
  if (variant === 2) {
    ctx.strokeStyle = "rgba(255,180,180,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hw * 0.2, -hl * 0.55);
    ctx.lineTo(hw * 0.6, -hl * 0.3);
    ctx.stroke();
  }
  // gills
  ctx.strokeStyle = "rgba(20,25,35,0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(hw * 0.75, -hl * 0.45 + i * 3);
    ctx.lineTo(hw * 0.95, -hl * 0.5 + i * 3);
    ctx.moveTo(-hw * 0.75, -hl * 0.45 + i * 3);
    ctx.lineTo(-hw * 0.95, -hl * 0.5 + i * 3);
    ctx.stroke();
  }
  // angry eyes with brow
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#ffe27a";
    ctx.beginPath();
    ctx.ellipse(s * hw * 0.55, -hl * 0.6, hw * 0.18, hw * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(s * hw * 0.55, -hl * 0.6, hw * 0.07, hw * 0.16, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(s * hw * 0.3, -hl * 0.72);
    ctx.lineTo(s * hw * 0.8, -hl * 0.64);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.ellipse(-hw * 0.35, -hl * 0.3, hw * 0.25, hl * 0.35, 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------- OCTOPUS ----------------
function drawOctopus(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, spin: number, recoil: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin * 0.5);
  const body = "#5b2a86";
  const bodyLight = "#9b5bd6";
  const bodyDark = "#2e1247";
  // tentacles
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const wave = Math.sin(phase * 2 + i) * 0.25;
    const reach = size * (recoil ? 1.3 : 1.9);
    const mx = Math.cos(a + wave) * reach * 0.55;
    const my = Math.sin(a + wave) * reach * 0.55;
    const tx = Math.cos(a + wave * 1.6) * reach;
    const ty = Math.sin(a + wave * 1.6) * reach;
    const cx2 = Math.cos(a + wave * 2.4 + 0.5) * reach * 1.05;
    const cy2 = Math.sin(a + wave * 2.4 + 0.5) * reach * 1.05;
    const grad = ctx.createLinearGradient(0, 0, tx, ty);
    grad.addColorStop(0, body);
    grad.addColorStop(1, bodyLight);
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * 0.34;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.stroke();
    ctx.lineWidth = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo((tx + cx2) / 2 + Math.cos(a + 1.5) * 8, (ty + cy2) / 2 + Math.sin(a + 1.5) * 8, cx2, cy2);
    ctx.stroke();
    // glowing suckers
    ctx.fillStyle = `rgba(120,255,235,${0.55 + Math.sin(phase * 4 + i) * 0.25})`;
    for (let k = 0.35; k <= 1; k += 0.22) {
      const qx = (1 - k) * (1 - k) * 0 + 2 * (1 - k) * k * mx + k * k * tx;
      const qy = (1 - k) * (1 - k) * 0 + 2 * (1 - k) * k * my + k * k * ty;
      ctx.beginPath();
      ctx.arc(qx, qy, size * 0.06, 0, TAU);
      ctx.fill();
    }
  }
  // mantle (bulb up-screen)
  const mg = ctx.createRadialGradient(-size * 0.3, -size * 0.6, size * 0.1, 0, -size * 0.2, size * 1.2);
  mg.addColorStop(0, bodyLight);
  mg.addColorStop(0.6, body);
  mg.addColorStop(1, bodyDark);
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(-size, size * 0.2);
  ctx.bezierCurveTo(-size * 1.1, -size * 0.8, -size * 0.6, -size * 1.5, 0, -size * 1.5);
  ctx.bezierCurveTo(size * 0.6, -size * 1.5, size * 1.1, -size * 0.8, size, size * 0.2);
  ctx.bezierCurveTo(size * 0.8, size * 0.7, -size * 0.8, size * 0.7, -size, size * 0.2);
  ctx.closePath();
  ctx.fill();
  // spots
  ctx.fillStyle = "rgba(255,140,200,0.35)";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.5, -size * 0.6 + Math.sin(a) * size * 0.5, size * 0.1 + (i % 2) * 2, 0, TAU);
    ctx.fill();
  }
  // eyes (menacing, slit pupils)
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#ffe36b";
    ctx.beginPath();
    ctx.ellipse(s * size * 0.45, size * 0.05, size * 0.24, size * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#170a25";
    ctx.beginPath();
    ctx.ellipse(s * size * 0.45, size * 0.05, size * 0.2, size * 0.07, 0, 0, TAU);
    ctx.fill();
    // angry lid
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s * size * 0.2, -size * 0.14);
    ctx.lineTo(s * size * 0.7, -size * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------- GIANT JELLYFISH ----------------
function drawBigJelly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, pulse: number, glow: number) {
  const charging = pulse > 2.3 && pulse <= 3.0;
  const zapping = pulse > 3.0;
  const beat = 1 + Math.sin(phase * 2) * 0.06;
  const color = "#63e6ff";
  ctx.save();
  ctx.translate(x, y);
  // glow
  const inten = 0.5 + glow * 0.4 + (charging ? (pulse - 2.3) / 0.7 : 0) * 0.6;
  const gl = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 2.6);
  gl.addColorStop(0, `rgba(120,230,255,${0.45 * inten})`);
  gl.addColorStop(1, "rgba(120,230,255,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.6, 0, TAU);
  ctx.fill();
  // electric ring
  if (zapping) {
    const t = (pulse - 3.0) / 0.6;
    ctx.strokeStyle = `rgba(200,255,255,${1 - t})`;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(0, 0, size * (1 + t * 1.6), 0, TAU);
    ctx.stroke();
    // arcs
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - t)})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + phase * 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * size * 0.9, Math.sin(a) * size * 0.9);
      const r2 = size * (1 + t * 1.6);
      ctx.lineTo(Math.cos(a + 0.2) * r2 * 0.8, Math.sin(a + 0.2) * r2 * 0.8);
      ctx.lineTo(Math.cos(a - 0.1) * r2, Math.sin(a - 0.1) * r2);
      ctx.stroke();
    }
  }
  // long tentacles hanging toward the player (down)
  ctx.lineCap = "round";
  for (let i = 0; i < 9; i++) {
    const fx = (i / 8 - 0.5) * size * 1.6;
    const len = size * (2.2 + (i % 3) * 0.5);
    ctx.strokeStyle = i % 2 ? "rgba(255,150,230,0.7)" : "rgba(140,235,255,0.6)";
    ctx.lineWidth = i % 2 ? 1.8 : 2.8;
    const ph = phase * 2.5 + i;
    ctx.beginPath();
    ctx.moveTo(fx * 0.8, size * 0.4);
    ctx.bezierCurveTo(fx + Math.sin(ph) * 14, size * 0.4 + len * 0.35, fx * 1.3 + Math.sin(ph + 1.3) * 18, size * 0.4 + len * 0.7, fx * 1.2 + Math.sin(ph + 2.4) * 22, size * 0.4 + len);
    ctx.stroke();
  }
  // frilly oral arms
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size * 0.3, size * 0.4);
    ctx.quadraticCurveTo(i * size * 0.5 + Math.sin(phase * 2 + i) * 12, size * 1.3, i * size * 0.35 + Math.sin(phase * 1.6 + i) * 16, size * 1.9);
    ctx.stroke();
  }
  // bell
  ctx.scale(beat, 2 - beat);
  const bg = ctx.createRadialGradient(-size * 0.3, -size * 0.4, size * 0.1, 0, 0, size * 1.05);
  bg.addColorStop(0, "rgba(255,255,255,0.95)");
  bg.addColorStop(0.4, charging ? "rgba(200,255,255,0.9)" : `${color}dd`);
  bg.addColorStop(1, "rgba(80,160,255,0.35)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-size, size * 0.3);
  ctx.bezierCurveTo(-size * 1.08, -size * 0.7, -size * 0.6, -size * 1.05, 0, -size * 1.05);
  ctx.bezierCurveTo(size * 0.6, -size * 1.05, size * 1.08, -size * 0.7, size, size * 0.3);
  for (let i = 5; i >= -5; i--) {
    const px = (i / 5) * size;
    ctx.quadraticCurveTo(px + size * 0.1, size * 0.55, px, size * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  // inner organs (pink glow)
  ctx.fillStyle = "rgba(255,120,220,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.2, size * 0.5, size * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + phase;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.28, -size * 0.2 + Math.sin(a) * size * 0.15, size * 0.1, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -size * 0.05, size * 0.92, Math.PI * 1.15, Math.PI * 1.65);
  ctx.stroke();
  ctx.restore();
}

// ---------------- MORAY EEL ----------------
function drawEel(ctx: CanvasRenderingContext2D, c: Creature, camY: number) {
  if (c.extend < 0.02) return;
  const pts: { x: number; y: number }[] = [];
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const p = eelPoint(c, s);
    pts.push({ x: p.x, y: camY - p.y });
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // body (thick stroke with gradient along)
  const head = pts[pts.length - 1];
  const tail = pts[0];
  const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  g.addColorStop(0, "#3c5a2a");
  g.addColorStop(1, "#7fa04a");
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  // dorsal ribbon fin
  ctx.strokeStyle = "rgba(200,220,120,0.45)";
  ctx.lineWidth = 34;
  path();
  ctx.stroke();
  ctx.strokeStyle = "#233818";
  ctx.lineWidth = 26;
  path();
  ctx.stroke();
  ctx.strokeStyle = g;
  ctx.lineWidth = 20;
  path();
  ctx.stroke();
  // spots
  ctx.fillStyle = "rgba(255,240,170,0.5)";
  for (let i = 2; i < pts.length - 2; i += 2) {
    ctx.beginPath();
    ctx.arc(pts[i].x + (i % 4 === 0 ? 4 : -4), pts[i].y + (i % 3) * 2 - 2, 2.5, 0, TAU);
    ctx.fill();
  }
  // head
  const prev = pts[pts.length - 2];
  const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
  ctx.translate(head.x, head.y);
  ctx.rotate(ang);
  const hg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 20);
  hg.addColorStop(0, "#9ab85a");
  hg.addColorStop(1, "#3c5a2a");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(2, 0, 20, 14, 0, 0, TAU);
  ctx.fill();
  // open mouth
  const open = 0.25 + c.mouth * 0.5;
  ctx.fillStyle = "#3a0c14";
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(24, -Math.sin(open) * 18);
  ctx.lineTo(24, Math.sin(open) * 18);
  ctx.closePath();
  ctx.fill();
  // teeth
  ctx.fillStyle = "#fff8e8";
  for (let i = 0; i < 4; i++) {
    const tx = 8 + i * 4.5;
    const ty = -Math.sin(open) * (18 * (tx - 4)) / 20;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + 2, ty + 5);
    ctx.lineTo(tx + 4, ty);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx, -ty);
    ctx.lineTo(tx + 2, -ty - 5);
    ctx.lineTo(tx + 4, -ty);
    ctx.fill();
  }
  // eye tracking player
  ctx.fillStyle = "#ffef9a";
  ctx.beginPath();
  ctx.arc(-2, -8, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-2 + c.eyeLook * 1.5, -8, 2.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------------- GIANT MANTA ----------------
function drawManta(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number, spin: number, vx: number) {
  const flap = Math.sin(phase * 2.2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin * 0.3 + clamp(vx / 400, -0.15, 0.15));
  // shadow
  ctx.fillStyle = "rgba(0,5,20,0.25)";
  ctx.beginPath();
  ctx.ellipse(8, 14, 150, 40, 0, 0, TAU);
  ctx.fill();
  // tail (trails behind = up screen)
  ctx.strokeStyle = "#1a2238";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(Math.sin(phase * 2) * 20, -80, Math.sin(phase * 1.5) * 30, -150);
  ctx.stroke();
  // wings + body
  const g = ctx.createLinearGradient(0, -50, 0, 50);
  g.addColorStop(0, "#26314f");
  g.addColorStop(1, "#141a2e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(60, -50, 120, -20 + flap * 12, 152, 10 + flap * 26);
  ctx.bezierCurveTo(110, 20 + flap * 10, 60, 40, 0, 46);
  ctx.bezierCurveTo(-60, 40, -110, 20 + flap * 10, -152, 10 + flap * 26);
  ctx.bezierCurveTo(-120, -20 + flap * 12, -60, -50, 0, -46);
  ctx.closePath();
  ctx.fill();
  // wing edge highlight
  ctx.strokeStyle = "rgba(140,170,220,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(60, -50, 120, -20 + flap * 12, 152, 10 + flap * 26);
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(-60, -50, -120, -20 + flap * 12, -152, 10 + flap * 26);
  ctx.stroke();
  // white spot pattern
  ctx.fillStyle = "rgba(220,235,255,0.55)";
  for (const [px, py, r] of [[-20, -10, 5], [22, -6, 4], [-45, 4, 3.5], [48, 6, 3], [0, 14, 4], [-70, 12, 2.5], [72, 14, 2.5], [-30, 22, 2.5], [30, 24, 2.5]]) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
  }
  // cephalic fins (horns) at the front (down screen)
  ctx.fillStyle = "#1a2238";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 14, 40);
    ctx.quadraticCurveTo(s * 26, 60, s * 20, 72);
    ctx.quadraticCurveTo(s * 10, 62, s * 6, 46);
    ctx.closePath();
    ctx.fill();
  }
  // eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#ffd36b";
    ctx.beginPath();
    ctx.ellipse(s * 30, 36, 5, 3.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(s * 30, 36, 2.2, 3, 0, 0, TAU);
    ctx.fill();
  }
  // mouth slit
  ctx.strokeStyle = "rgba(0,0,10,0.6)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 46);
  ctx.lineTo(12, 46);
  ctx.stroke();
  ctx.restore();
}

// ---------------- ANGLERFISH ----------------
function drawAngler(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number, mouth: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin * 0.4);
  // lure (arcs forward = down screen, toward the player)
  const lx = Math.sin(phase * 2) * 10;
  const ly = size * 1.35 + Math.sin(phase * 3) * 5;
  ctx.strokeStyle = "#2a2f45";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.5);
  ctx.bezierCurveTo(-size * 0.9, -size * 0.6, -size * 0.9, size * 1.1, lx, ly);
  ctx.stroke();
  const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 34);
  lg.addColorStop(0, "rgba(220,255,255,1)");
  lg.addColorStop(0.25, "rgba(120,240,255,0.6)");
  lg.addColorStop(1, "rgba(120,240,255,0)");
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(lx, ly, 34, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, TAU);
  ctx.fill();
  // tail fin (behind, up screen)
  ctx.fillStyle = "#1a1e30";
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, -size * 0.7);
  ctx.lineTo(-size * 0.55, -size * 1.25);
  ctx.lineTo(0, -size * 1.05);
  ctx.lineTo(size * 0.55, -size * 1.25);
  ctx.lineTo(size * 0.25, -size * 0.7);
  ctx.closePath();
  ctx.fill();
  // side fins
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * size * 0.7, -size * 0.1);
    ctx.quadraticCurveTo(s * size * 1.25, -size * 0.1, s * size * 1.2, size * 0.35);
    ctx.quadraticCurveTo(s * size * 0.9, size * 0.25, s * size * 0.6, size * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  // body
  const g = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.1, 0, 0, size * 1.1);
  g.addColorStop(0, "#3a4062");
  g.addColorStop(0.6, "#1f2440");
  g.addColorStop(1, "#0c0f1d");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.85, size * 0.95, 0, 0, TAU);
  ctx.fill();
  // spines
  ctx.strokeStyle = "#0c0f1d";
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * size * 0.22, -size * 0.85);
    ctx.lineTo(i * size * 0.3, -size * 1.15);
    ctx.stroke();
  }
  // huge mouth (facing player = down)
  const open = size * (0.35 + mouth * 0.35);
  ctx.fillStyle = "#2b0812";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.45, size * 0.72, open, 0, 0, TAU);
  ctx.fill();
  // teeth
  ctx.fillStyle = "#fff5e0";
  for (let i = -4; i <= 4; i++) {
    const tx = i * size * 0.16;
    const edge = Math.sqrt(Math.max(0, 1 - (tx / (size * 0.72)) ** 2));
    const top = size * 0.45 - open * edge;
    const bot = size * 0.45 + open * edge;
    const h = size * (0.16 + (i % 2 === 0 ? 0.08 : 0));
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, top);
    ctx.lineTo(tx, top + h);
    ctx.lineTo(tx + 2.5, top);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, bot);
    ctx.lineTo(tx, bot - h * 0.8);
    ctx.lineTo(tx + 2.5, bot);
    ctx.fill();
  }
  // glowing eyes
  for (const s of [-1, 1]) {
    const ex = s * size * 0.5;
    const ey = -size * 0.15;
    const eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, size * 0.3);
    eg.addColorStop(0, "rgba(160,255,240,1)");
    eg.addColorStop(0.4, "rgba(80,220,200,0.6)");
    eg.addColorStop(1, "rgba(80,220,200,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, size * 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#e8fffb";
    ctx.beginPath();
    ctx.arc(ex, ey, size * 0.11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#061a18";
    ctx.beginPath();
    ctx.arc(ex, ey + 1, size * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------- SEA SERPENT ----------------
function drawSerpent(ctx: CanvasRenderingContext2D, c: Creature, camY: number, time: number) {
  const pts = [{ x: c.x, y: camY - c.y }, ...c.trail.map((p) => ({ x: p.x, y: camY - p.y }))];
  ctx.save();
  // body segments from tail to head
  for (let i = pts.length - 1; i >= 1; i--) {
    const t = 1 - i / pts.length;
    const r = lerp(4, 15, Math.min(1, t * 1.6));
    const p = pts[i];
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 1, p.x, p.y, r);
    g.addColorStop(0, "#3fb8a8");
    g.addColorStop(0.7, "#1a6a70");
    g.addColorStop(1, "#0b3a44");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    // luminous dorsal fin spikes
    if (i % 3 === 0 && i < pts.length - 2) {
      const q = pts[i - 1];
      const a = Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2;
      ctx.fillStyle = `rgba(120,255,220,${0.5 + Math.sin(time * 4 + i) * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      ctx.lineTo(p.x + Math.cos(a) * (r + 10), p.y + Math.sin(a) * (r + 10));
      ctx.lineTo(p.x + Math.cos(a + 0.5) * r, p.y + Math.sin(a + 0.5) * r);
      ctx.fill();
    }
  }
  // head
  const h = pts[0];
  const n = pts[1] ?? { x: h.x, y: h.y + 10 };
  const ang = Math.atan2(h.y - n.y, h.x - n.x);
  ctx.translate(h.x, h.y);
  ctx.rotate(ang);
  const hg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 22);
  hg.addColorStop(0, "#5fd6c4");
  hg.addColorStop(1, "#0f4a52");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(4, 0, 22, 15, 0, 0, TAU);
  ctx.fill();
  // jaw
  ctx.fillStyle = "#2a0a14";
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(26, -9);
  ctx.lineTo(26, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(12 + i * 4, -6 + i * 0.5);
    ctx.lineTo(14 + i * 4, -1);
    ctx.lineTo(16 + i * 4, -6 + i * 0.5);
    ctx.fill();
  }
  // frills
  ctx.fillStyle = "rgba(120,255,220,0.6)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-6, s * 10);
    ctx.quadraticCurveTo(-16, s * 26, -24, s * 14);
    ctx.quadraticCurveTo(-14, s * 14, -10, s * 8);
    ctx.fill();
  }
  // eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#ffef7a";
    ctx.beginPath();
    ctx.arc(2, s * 8, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(3, s * 8, 1.5, 3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
