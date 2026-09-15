import { TAU, rand } from "./utils";

/**
 * Pooled particle system. Particles live in WORLD space (x, worldY)
 * so they scroll naturally with the environment.
 */
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2 | 3; // 0 = circle, 1 = bubble (ring), 2 = debris (poly), 3 = sparkle
  rot: number;
  vrot: number;
  drag: number;
  gravity: number;
}

const MAX = 420;

export class ParticleSystem {
  pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2,
        color: "#fff", kind: 0, rot: 0, vrot: 0, drag: 0, gravity: 0,
      });
    }
  }

  clear() {
    for (const p of this.pool) p.active = false;
  }

  emit(opts: Partial<Particle> & { x: number; y: number }) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.active = true;
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.maxLife = opts.maxLife ?? 0.6;
    p.life = p.maxLife;
    p.size = opts.size ?? 3;
    p.color = opts.color ?? "#ffffff";
    p.kind = opts.kind ?? 0;
    p.rot = opts.rot ?? rand(0, TAU);
    p.vrot = opts.vrot ?? rand(-4, 4);
    p.drag = opts.drag ?? 2;
    p.gravity = opts.gravity ?? 0;
  }

  /** Burst of round particles */
  burst(x: number, y: number, count: number, color: string, speed = 120, size = 3, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, size: rand(size * 0.5, size * 1.3), maxLife: rand(life * 0.6, life), drag: 3 });
    }
  }

  bubbles(x: number, y: number, count: number, speed = 60, size = 3) {
    for (let i = 0; i < count; i++) {
      this.emit({
        x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: rand(-20, 20), vy: -rand(speed * 0.5, speed),
        color: "rgba(220,245,255,0.8)", kind: 1, size: rand(size * 0.5, size * 1.4),
        maxLife: rand(0.5, 1.1), drag: 0.6, gravity: -60,
      });
    }
  }

  debris(x: number, y: number, count: number, colors: string[], speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.emit({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 2,
        color: colors[i % colors.length], size: rand(3, 8),
        maxLife: rand(0.5, 0.9), drag: 2.2, gravity: -120,
      });
    }
  }

  sparkles(x: number, y: number, count: number, color = "#ffffff") {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 110);
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 3, color, size: rand(3, 6), maxLife: rand(0.4, 0.8), drag: 2.5 });
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camY: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const sy = camY - p.y;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (p.kind === 0) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.size * (0.4 + 0.6 * t), 0, TAU);
        ctx.fill();
      } else if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.size, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.3, sy - p.size * 0.3, p.size * 0.28, 0, TAU);
        ctx.fill();
      } else if (p.kind === 2) {
        ctx.save();
        ctx.translate(p.x, sy);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.6);
        ctx.lineTo(s * 0.7, -s);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(-s * 0.4, s);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(p.x, sy);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const s = p.size * t;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.3, -s * 0.3);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.3, s * 0.3);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Floating "+5" style texts, in world space. */
export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export class FloatTextSystem {
  items: FloatText[] = [];
  clear() {
    this.items.length = 0;
  }
  add(x: number, y: number, text: string, color = "#ffffff", scale = 1) {
    this.items.push({ x, y, text, color, life: 0.9, maxLife: 0.9, scale });
    if (this.items.length > 30) this.items.shift();
  }
  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      f.y += 40 * dt; // drifts forward = up the screen
      if (f.life <= 0) this.items.splice(i, 1);
    }
  }
  draw(ctx: CanvasRenderingContext2D, camY: number) {
    for (const f of this.items) {
      const t = f.life / f.maxLife;
      const pop = 1 + Math.max(0, t - 0.75) * 3;
      ctx.save();
      ctx.translate(f.x, camY - f.y);
      ctx.scale(f.scale * pop, f.scale * pop);
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = "bold 16px 'Nunito', 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,20,40,0.55)";
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
