import { makeCanvas, rand, randInt, TAU, pick, RGB, rgb } from "./utils";

/**
 * Sprite factory: procedurally paints detailed environment art into
 * offscreen canvases ONCE, so per-frame rendering is a cheap drawImage.
 */
export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number; // logical width
  h: number; // logical height
  ax: number; // anchor x (logical, from left)
  ay: number; // anchor y (logical, from top)
}

/** Resolution multiplier (set from device pixel ratio by the game). */
export let SPRITE_RES = 2;
export function setSpriteRes(r: number) {
  SPRITE_RES = Math.min(3, Math.max(1, r));
}

function begin(w: number, h: number) {
  const r = SPRITE_RES;
  const { canvas, ctx } = makeCanvas(w * r, h * r);
  ctx.scale(r, r);
  return { canvas, ctx };
}

export type RockStyle = "grey" | "brown" | "dark" | "mossy" | "coral";

const ROCK_COLORS: Record<RockStyle, { base: RGB; light: RGB; dark: RGB }> = {
  grey: { base: [98, 108, 122], light: [160, 172, 186], dark: [40, 48, 62] },
  brown: { base: [110, 92, 78], light: [170, 150, 128], dark: [48, 38, 34] },
  dark: { base: [52, 62, 80], light: [98, 112, 136], dark: [18, 24, 38] },
  mossy: { base: [86, 104, 96], light: [140, 168, 140], dark: [30, 44, 42] },
  coral: { base: [120, 96, 104], light: [186, 160, 160], dark: [52, 36, 50] },
};

/** Irregular shaded rock. Returns sprite anchored at center. */
export function makeRock(w: number, h: number, style: RockStyle = "grey", jagged = false): Sprite {
  const pad = 14;
  const { canvas, ctx } = begin(w + pad * 2, h + pad * 2);
  const cx = w / 2 + pad;
  const cy = h / 2 + pad;
  const n = jagged ? randInt(7, 10) : randInt(9, 14);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = jagged ? 0.62 + Math.random() * 0.42 : 0.78 + Math.random() * 0.24;
    pts.push([cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r]);
  }
  const coralTufts: [number, number, string][] = [];
  if (style === "coral") {
    const cols = ["#ff5f7e", "#ff9a3d", "#ffd23f", "#2ee6c8", "#d84bff", "#ff4fa3"];
    for (let i = 0; i < randInt(3, 5); i++) {
      const a = rand(Math.PI * 1.05, Math.PI * 1.95); // top edge
      coralTufts.push([cx + Math.cos(a) * (w / 2) * 0.8, cy + Math.sin(a) * (h / 2) * 0.8, pick(cols)]);
    }
  }
  const c = ROCK_COLORS[style];
  const path = () => {
    ctx.beginPath();
    if (jagged) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    } else {
      ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % n];
        ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
    }
    ctx.closePath();
  };
  // base
  const grad = ctx.createRadialGradient(cx - w * 0.25, cy - h * 0.3, 2, cx, cy, Math.max(w, h) * 0.7);
  grad.addColorStop(0, rgb(c.light));
  grad.addColorStop(0.45, rgb(c.base));
  grad.addColorStop(1, rgb(c.dark));
  ctx.fillStyle = grad;
  path();
  ctx.fill();
  // facets
  ctx.save();
  path();
  ctx.clip();
  for (let i = 0; i < 4; i++) {
    const fx = cx + rand(-w * 0.35, w * 0.35);
    const fy = cy + rand(-h * 0.35, h * 0.35);
    const fr = rand(w * 0.15, w * 0.4);
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, rgb(i % 2 ? c.light : c.dark, 0.25));
    fg.addColorStop(1, rgb(c.base, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, w + pad * 2, h + pad * 2);
  }
  // cracks
  ctx.strokeStyle = rgb(c.dark, 0.7);
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    let x = cx + rand(-w * 0.3, w * 0.3);
    let y = cy + rand(-h * 0.3, h * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = randInt(2, 4);
    for (let s = 0; s < segs; s++) {
      x += rand(-w * 0.2, w * 0.2);
      y += rand(-h * 0.2, h * 0.2);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // speckles / moss
  for (let i = 0; i < 18; i++) {
    const sx = cx + rand(-w * 0.45, w * 0.45);
    const sy = cy + rand(-h * 0.45, h * 0.45);
    ctx.fillStyle = style === "mossy" && Math.random() < 0.6 ? "rgba(90,170,110,0.45)" : rgb(Math.random() < 0.5 ? c.light : c.dark, 0.35);
    ctx.beginPath();
    ctx.arc(sx, sy, rand(0.8, 2.2), 0, TAU);
    ctx.fill();
  }
  // bottom shade
  const bs = ctx.createLinearGradient(0, cy, 0, cy + h / 2);
  bs.addColorStop(0, "rgba(0,0,20,0)");
  bs.addColorStop(1, "rgba(0,0,20,0.45)");
  ctx.fillStyle = bs;
  ctx.fillRect(0, 0, w + pad * 2, h + pad * 2);
  ctx.restore();
  // rim light
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  path();
  ctx.stroke();
  // coral tufts & anemone bits growing on the rock
  ctx.lineCap = "round";
  for (const [tx, ty, col] of coralTufts) {
    const branches = randInt(4, 7);
    for (let b = 0; b < branches; b++) {
      const a = -Math.PI / 2 + rand(-1.1, 1.1);
      const len = rand(7, 15);
      ctx.strokeStyle = col;
      ctx.lineWidth = rand(2, 3.5);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.5 + rand(-3, 3), ty + Math.sin(a) * len * 0.5, tx + Math.cos(a) * len, ty + Math.sin(a) * len);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(tx + Math.cos(a) * len, ty + Math.sin(a) * len, 1.3, 0, TAU);
      ctx.fill();
    }
  }
  return { canvas, w: w + pad * 2, h: h + pad * 2, ax: cx, ay: cy };
}

const CORAL_PALETTES: [string, string, string][] = [
  ["#ff5f7e", "#ff9db1", "#b8244a"],
  ["#2ee6c8", "#a4fff0", "#0f9e86"],
  ["#ffd23f", "#fff2a8", "#c99a00"],
  ["#4fa8ff", "#a9d4ff", "#1f5fb8"],
  ["#ff7a3d", "#ffb37a", "#c2401c"],
  ["#ff4fa3", "#ffa1d0", "#b0176c"],
  ["#ffb347", "#ffe0a3", "#c76f0e"],
  ["#d84bff", "#efa9ff", "#7f1fa8"],
];

/** Branching coral, anchored at bottom center. Dangerous variant has sharp tips. */
export function makeCoral(w: number, h: number, dangerous = true): Sprite {
  const { canvas, ctx } = begin(w, h);
  const [base, light, dark] = pick(CORAL_PALETTES);
  ctx.lineCap = "round";
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    const g = ctx.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, dark);
    g.addColorStop(0.6, base);
    g.addColorStop(1, light);
    ctx.strokeStyle = g;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(ang + 0.4) * len * 0.5, y + Math.sin(ang + 0.4) * len * 0.5, ex, ey);
    ctx.stroke();
    if (depth <= 0) {
      // tip
      ctx.fillStyle = dangerous ? "#fff1f4" : light;
      ctx.beginPath();
      if (dangerous) {
        ctx.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6);
        ctx.lineTo(ex + Math.cos(ang + 1.9) * 3, ey + Math.sin(ang + 1.9) * 3);
        ctx.lineTo(ex + Math.cos(ang - 1.9) * 3, ey + Math.sin(ang - 1.9) * 3);
        ctx.closePath();
      } else {
        ctx.arc(ex, ey, width * 0.8, 0, TAU);
      }
      ctx.fill();
      return;
    }
    const n = depth >= 2 ? randInt(2, 3) : 2;
    for (let i = 0; i < n; i++) {
      const na = ang + rand(-0.75, 0.75);
      branch(ex, ey, na, len * rand(0.6, 0.8), width * 0.68, depth - 1);
    }
  };
  const trunks = randInt(2, 3);
  for (let i = 0; i < trunks; i++) {
    const ang = -Math.PI / 2 + rand(-0.5, 0.5);
    branch(w / 2 + rand(-w * 0.15, w * 0.15), h, ang, h * rand(0.25, 0.32), Math.max(4, w * 0.11), 3);
  }
  // polyp dots
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.arc(rand(w * 0.2, w * 0.8), rand(h * 0.2, h * 0.9), rand(0.6, 1.4), 0, TAU);
    ctx.fill();
  }
  return { canvas, w, h, ax: w / 2, ay: h };
}

/** Fan / brain coral used mainly as decoration. Anchored bottom center. */
export function makeFanCoral(w: number, h: number): Sprite {
  const { canvas, ctx } = begin(w, h);
  const [base, light, dark] = pick(CORAL_PALETTES);
  const cx = w / 2;
  const g = ctx.createRadialGradient(cx, h, 2, cx, h, h);
  g.addColorStop(0, dark);
  g.addColorStop(0.6, base);
  g.addColorStop(1, light);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 6, h);
  for (let a = Math.PI; a >= 0; a -= 0.12) {
    const r = h * (0.85 + Math.sin(a * 9) * 0.08);
    ctx.lineTo(cx + Math.cos(a) * r * (w / (2 * h)), h - Math.sin(a) * r);
  }
  ctx.lineTo(cx + 6, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + 0.7 * (i / 8));
    ctx.beginPath();
    ctx.moveTo(cx, h);
    ctx.quadraticCurveTo(cx + Math.cos(a) * w * 0.2, h - h * 0.5, cx + Math.cos(a) * w * 0.42, h - Math.sin(a) * h * 0.85);
    ctx.stroke();
  }
  return { canvas, w, h, ax: cx, ay: h };
}

/** Ancient stone column (ruins). Anchored center. */
export function makeColumn(w: number, h: number, broken = true): Sprite {
  const { canvas, ctx } = begin(w + 12, h + 8);
  const x0 = 6;
  const y0 = 4;
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, "#6d7d78");
  g.addColorStop(0.35, "#b7c4b8");
  g.addColorStop(0.7, "#93a29a");
  g.addColorStop(1, "#4e5c5a");
  ctx.fillStyle = g;
  // shaft
  ctx.beginPath();
  ctx.moveTo(x0 + 2, y0 + 10);
  ctx.lineTo(x0 + w - 2, y0 + 10);
  if (broken) {
    ctx.lineTo(x0 + w - 1, y0 + h - 14);
    ctx.lineTo(x0 + w * 0.7, y0 + h - 4);
    ctx.lineTo(x0 + w * 0.4, y0 + h - 10);
    ctx.lineTo(x0 + 1, y0 + h - 2);
  } else {
    ctx.lineTo(x0 + w - 1, y0 + h);
    ctx.lineTo(x0 + 1, y0 + h);
  }
  ctx.closePath();
  ctx.fill();
  // capital
  ctx.fillStyle = "#a9b7ad";
  ctx.fillRect(x0 - 4, y0, w + 8, 10);
  ctx.fillStyle = "#5f6f6b";
  ctx.fillRect(x0 - 4, y0 + 8, w + 8, 3);
  // flutes
  ctx.strokeStyle = "rgba(30,40,40,0.35)";
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const x = x0 + (w * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, y0 + 12);
    ctx.lineTo(x, y0 + h - 8);
    ctx.stroke();
  }
  // moss / algae patches
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(60,${randInt(120, 170)},110,0.4)`;
    ctx.beginPath();
    ctx.ellipse(x0 + rand(2, w - 2), y0 + rand(14, h - 6), rand(3, 7), rand(2, 4), rand(0, TAU), 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(20,30,30,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.3, y0 + h * 0.4);
  ctx.lineTo(x0 + w * 0.5, y0 + h * 0.55);
  ctx.lineTo(x0 + w * 0.45, y0 + h * 0.7);
  ctx.stroke();
  return { canvas, w: w + 12, h: h + 8, ax: (w + 12) / 2, ay: (h + 8) / 2 };
}

/** Open clam shell (holds pearls). Anchored center. */
export function makeShell(size: number): Sprite {
  const w = size * 1.4;
  const h = size * 1.1;
  const { canvas, ctx } = begin(w, h);
  const cx = w / 2;
  const cy = h * 0.68;
  const shell = (rot: number, color1: string, color2: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, size * 0.65);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let a = Math.PI; a <= TAU; a += 0.15) {
      const r = size * 0.62 * (1 + Math.sin(a * 8) * 0.05);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.75);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90,50,60,0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      const a = Math.PI + (Math.PI * i) / 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  };
  shell(0, "#ffd9e2", "#c98a9c"); // top shell (open, behind)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, -0.55);
  ctx.translate(-cx, -cy);
  shell(0, "#ffe9ef", "#d9a1b2"); // bottom shell
  ctx.restore();
  return { canvas, w, h, ax: cx, ay: cy };
}

/** Glowing deep-sea plant, anchored bottom center. */
export function makeGlowPlant(h: number): Sprite {
  const w = h * 0.7;
  const { canvas, ctx } = begin(w, h);
  const color = pick(["#5cf2ff", "#8dff7a", "#ff7ae9", "#ffd36b"]);
  ctx.lineCap = "round";
  const stalks = randInt(3, 5);
  for (let i = 0; i < stalks; i++) {
    const x = w / 2 + rand(-w * 0.3, w * 0.3);
    const top = rand(h * 0.1, h * 0.45);
    ctx.strokeStyle = "rgba(40,70,80,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + rand(-10, 10), (h + top) / 2, x + rand(-4, 4), top);
    ctx.stroke();
    const gg = ctx.createRadialGradient(x, top, 1, x, top, 12);
    gg.addColorStop(0, color);
    gg.addColorStop(0.4, color + "88");
    gg.addColorStop(1, color + "00");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, top, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, top, 2, 0, TAU);
    ctx.fill();
  }
  return { canvas, w, h, ax: w / 2, ay: h };
}

/** Cluster of glowing mushrooms. Anchored bottom center. */
export function makeMushrooms(size: number): Sprite {
  const w = size * 1.6;
  const h = size * 1.2;
  const { canvas, ctx } = begin(w, h);
  const color = pick(["#7af0ff", "#b58cff", "#ffe07a", "#8dff9c", "#ff8ad4"]);
  const n = randInt(3, 5);
  for (let i = 0; i < n; i++) {
    const cx = w * (0.2 + (0.6 * i) / Math.max(1, n - 1)) + rand(-4, 4);
    const capR = size * rand(0.18, 0.32);
    const stemH = size * rand(0.35, 0.7);
    ctx.fillStyle = "#e8f0f4";
    ctx.beginPath();
    ctx.roundRect(cx - capR * 0.28, h - stemH, capR * 0.56, stemH, 3);
    ctx.fill();
    const gg = ctx.createRadialGradient(cx, h - stemH, 1, cx, h - stemH, capR * 2.2);
    gg.addColorStop(0, color + "aa");
    gg.addColorStop(1, color + "00");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(cx, h - stemH, capR * 2.2, 0, TAU);
    ctx.fill();
    const cg = ctx.createRadialGradient(cx - capR * 0.3, h - stemH - capR * 0.4, 1, cx, h - stemH, capR);
    cg.addColorStop(0, "#ffffff");
    cg.addColorStop(0.4, color);
    cg.addColorStop(1, color);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, h - stemH, capR, Math.PI, 0);
    ctx.quadraticCurveTo(cx, h - stemH + capR * 0.35, cx - capR, h - stemH);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(cx + rand(-capR * 0.6, capR * 0.6), h - stemH - rand(0, capR * 0.6), 1.2, 0, TAU);
      ctx.fill();
    }
  }
  return { canvas, w, h, ax: w / 2, ay: h };
}

/** Anemone: soft tentacle bush, decorative. Anchored bottom center. */
export function makeAnemone(size: number): Sprite {
  const w = size * 1.3;
  const h = size;
  const { canvas, ctx } = begin(w, h);
  const [base, light] = pick(CORAL_PALETTES);
  ctx.lineCap = "round";
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI / 2 + rand(-1.1, 1.1);
    const len = rand(h * 0.5, h * 0.95);
    ctx.strokeStyle = i % 3 ? base : light;
    ctx.lineWidth = rand(2.5, 4);
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.quadraticCurveTo(w / 2 + Math.cos(a) * len * 0.5 + rand(-8, 8), h + Math.sin(a) * len * 0.5, w / 2 + Math.cos(a) * len, h + Math.sin(a) * len);
    ctx.stroke();
  }
  return { canvas, w, h, ax: w / 2, ay: h };
}

/** Far/mid background silhouette shape (mound, spires or arch). Anchored bottom center. */
export function makeSilhouette(w: number, h: number, color: RGB, alpha: number): Sprite {
  const { canvas, ctx } = begin(w, h);
  ctx.fillStyle = rgb(color, alpha);
  ctx.beginPath();
  ctx.moveTo(0, h);
  const bumps = randInt(3, 6);
  for (let i = 0; i <= bumps; i++) {
    const x = (w * i) / bumps;
    const y = h - h * rand(0.35, 1) * (i === 0 || i === bumps ? 0.3 : 1);
    ctx.quadraticCurveTo(x - w / bumps / 2, h - h * rand(0.5, 1), x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  return { canvas, w, h, ax: w / 2, ay: h };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1, rot = 0) {
  if (rot === 0 && scale === 1) {
    ctx.drawImage(s.canvas, x - s.ax, y - s.ay, s.w, s.h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
  ctx.restore();
}
