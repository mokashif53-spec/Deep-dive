import { LW } from "./constants";
import { LayerObject } from "./Entities";
import { makeCanvas, rand, randInt, rgb, TAU, pick, weighted, clamp } from "./utils";
import { Palette, zoneAt } from "./Zones";
import { makeRock, makeCoral, makeColumn, makeFanCoral, Sprite, drawSprite } from "./Sprites";

interface FarShape {
  x: number;
  y: number; // layer-space y (bottom anchor)
  pts: [number, number][];
  w: number;
}
interface Mote {
  x: number;
  y: number;
  s: number;
  vx: number;
  vy: number;
  a: number;
}
interface Ray {
  x: number;
  w: number;
  tilt: number;
  phase: number;
  speed: number;
}

const FAR_P = 0.22;
const MID_P = 0.5;
const MOTE_P = 1.25;

/**
 * Multi-layer parallax underwater environment.
 */
export class Background {
  private far: FarShape[] = [];
  private mid: LayerObject[] = [];
  private motes: Mote[] = [];
  private bubbles: Mote[] = [];
  private flow: Mote[] = []; // screen-space current streaks
  private rays: Ray[] = [];
  private caustic: HTMLCanvasElement;
  private causticPattern: CanvasPattern | null = null;
  private rayCanvas: HTMLCanvasElement;
  private farNext = 0;
  private midNext = 0;

  constructor() {
    // caustics tile
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 6;
    for (let i = 0; i < 22; i++) {
      const x = rand(0, 256);
      const y = rand(0, 256);
      const r = rand(14, 40);
      ctx.strokeStyle = `rgba(255,255,255,${rand(0.1, 0.28)})`;
      // draw wrapped copies so the tile is seamless
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * rand(0.6, 1), rand(0, TAU), 0, TAU);
        ctx.stroke();
      }
    }
    this.caustic = canvas;

    // light ray sprite
    const rc = makeCanvas(160, 900);
    const g = rc.ctx.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.5, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    rc.ctx.fillStyle = g;
    rc.ctx.beginPath();
    rc.ctx.moveTo(60, 0);
    rc.ctx.lineTo(100, 0);
    rc.ctx.lineTo(160, 900);
    rc.ctx.lineTo(0, 900);
    rc.ctx.closePath();
    rc.ctx.fill();
    this.rayCanvas = rc.canvas;

    for (let i = 0; i < 6; i++) {
      this.rays.push({ x: rand(-40, LW + 40), w: rand(0.5, 1.2), tilt: rand(-0.25, 0.25), phase: rand(0, TAU), speed: rand(0.15, 0.35) });
    }
  }

  /** @param camY world y at the TOP of the screen (screen y = layerCam - y) */
  reset(camY: number, H: number) {
    this.far.length = 0;
    this.mid.length = 0;
    this.motes.length = 0;
    this.bubbles.length = 0;
    this.flow.length = 0;
    this.farNext = camY * FAR_P - H - 300;
    this.midNext = camY * MID_P - H - 300;
    const mc = camY * MOTE_P;
    for (let i = 0; i < 45; i++) this.motes.push(this.newMote(rand(mc - H - 100, mc + 200)));
    for (let i = 0; i < 14; i++) this.bubbles.push(this.newBubble(rand(camY - H, camY + 200)));
    for (let i = 0; i < 10; i++) this.flow.push({ x: rand(0, LW), y: rand(0, H), s: rand(30, 90), vx: 0, vy: rand(0.9, 1.4), a: rand(0.04, 0.1) });
  }

  private newMote(y: number): Mote {
    return { x: rand(-10, LW + 10), y, s: rand(0.8, 2.4), vx: rand(-6, 6), vy: rand(-8, 8), a: rand(0.15, 0.5) };
  }
  private newBubble(y: number): Mote {
    return { x: rand(0, LW), y, s: rand(2, 6), vx: rand(-8, 8), vy: -rand(30, 70), a: rand(0.3, 0.7) };
  }

  private spawnFar(y: number, depth: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const zone = zoneAt(depth);
    const spiky = zone.id === "deep" || zone.id === "canyon" || zone.id === "abyss";
    const w = rand(260, 520);
    const h = rand(90, spiky ? 260 : 170);
    const bumps = randInt(4, 7);
    // smooth mound profile: starts and ends at ground level, peaks in the middle
    const pts: [number, number][] = [];
    for (let i = 0; i <= bumps; i++) {
      const t = i / bumps;
      const env = Math.sin(t * Math.PI); // 0 at edges, 1 in the middle
      const peak = spiky && i % 2 === 1 ? rand(0.9, 1.3) : rand(0.45, 0.95);
      pts.push([t * w - w / 2, -h * env * peak]);
    }
    const x = side < 0 ? rand(-w * 0.35, w * 0.15) : LW + rand(-w * 0.15, w * 0.35);
    this.far.push({ x, y, pts, w });
  }

  private spawnMid(y: number, depth: number) {
    const zone = zoneAt(depth);
    const kind = weighted<"rock" | "coral" | "column" | "fan">([
      { item: "rock", w: 4 },
      { item: "coral", w: zone.id === "reef" || zone.id === "rocky" ? 3 : 0.3 },
      { item: "fan", w: zone.id === "reef" || zone.id === "rocky" ? 2 : 0.2 },
      { item: "column", w: zone.id === "deep" ? 4 : zone.id === "abyss" ? 1.5 : 0 },
    ]);
    let sprite: Sprite;
    if (kind === "rock") sprite = makeRock(rand(90, 200), rand(60, 130), pick(["dark", "grey", "dark"]));
    else if (kind === "coral") sprite = makeCoral(rand(60, 100), rand(70, 120), false);
    else if (kind === "fan") sprite = makeFanCoral(rand(70, 120), rand(50, 80));
    else sprite = makeColumn(rand(24, 40), rand(120, 220), Math.random() < 0.7);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? rand(-20, 70) : LW - rand(-20, 70);
    this.mid.push({ x, y, sprite, scale: 1, alpha: rand(0.45, 0.7) });
  }

  update(dt: number, camY: number, depth: number, H: number, speedFactor: number) {
    // far layer: spawn ahead (above the top), drop what fell below the bottom
    const farCam = camY * FAR_P;
    while (this.farNext < farCam + 300) {
      this.spawnFar(this.farNext, depth);
      this.farNext += rand(180, 320);
    }
    while (this.far.length && this.far[0].y < farCam - H - 400) this.far.shift();
    const midCam = camY * MID_P;
    while (this.midNext < midCam + 300) {
      this.spawnMid(this.midNext, depth);
      this.midNext += rand(200, 380);
    }
    while (this.mid.length && this.mid[0].y < midCam - H - 300) this.mid.shift();
    // motes
    const moteCam = camY * MOTE_P;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < moteCam - H - 50) Object.assign(m, this.newMote(moteCam + rand(10, 200)));
      else if (m.y > moteCam + 300) m.y = moteCam - H - 40;
      if (m.x < -20) m.x = LW + 20;
      if (m.x > LW + 20) m.x = -20;
    }
    // ambient bubbles rise toward the surface (= behind the player = -y)
    for (const b of this.bubbles) {
      b.x += (b.vx + Math.sin(b.y * 0.02) * 12) * dt;
      b.y += b.vy * dt;
      if (b.y < camY - H - 60) Object.assign(b, this.newBubble(camY + rand(20, 300)));
    }
    // water current streaks (screen space) flow top -> bottom with the player's speed
    const flowSpeed = 140 + speedFactor * 900;
    for (const f of this.flow) {
      f.y += flowSpeed * f.vy * dt;
      if (f.y - f.s > H) {
        f.y = -rand(20, 200);
        f.x = rand(0, LW);
        f.s = rand(30, 90) * (1 + speedFactor);
      }
    }
  }

  /** Water + light + far/mid parallax. Called before gameplay entities. */
  drawBack(ctx: CanvasRenderingContext2D, W: number, H: number, camY: number, pal: Palette, time: number) {
    // water gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(pal.top));
    g.addColorStop(1, rgb(pal.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle caustic light (fades with depth)
    if (pal.light > 0.02) {
      if (!this.causticPattern) this.causticPattern = ctx.createPattern(this.caustic, "repeat");
      if (this.causticPattern) {
        ctx.save();
        ctx.globalAlpha = 0.13 * pal.light;
        ctx.globalCompositeOperation = "soft-light";
        const ox = Math.sin(time * 0.3) * 30;
        const oy = ((camY * 0.15) % 256) + Math.cos(time * 0.2) * 20;
        ctx.translate(ox, oy);
        ctx.fillStyle = this.causticPattern;
        ctx.fillRect(-ox - 256, -oy - 256, W + 512, H + 512);
        ctx.restore();
      }
    }

    // far silhouettes (soft mounds fading into the haze)
    const farCam = camY * FAR_P;
    for (const f of this.far) {
      const sy = farCam - f.y;
      if (sy < -60 || sy - 320 > H) continue;
      const top = sy - 260;
      const grad = ctx.createLinearGradient(0, top, 0, sy + 70);
      grad.addColorStop(0, rgb(pal.far, 0.7));
      grad.addColorStop(0.75, rgb(pal.far, 0.45));
      grad.addColorStop(1, rgb(pal.far, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      const p = f.pts;
      ctx.moveTo(f.x + p[0][0], sy + 70);
      ctx.lineTo(f.x + p[0][0], sy + p[0][1]);
      for (let i = 1; i < p.length; i++) {
        const px = f.x + p[i - 1][0];
        const py = sy + p[i - 1][1];
        const nx = f.x + p[i][0];
        const ny = sy + p[i][1];
        ctx.bezierCurveTo(px + (nx - px) * 0.5, py, px + (nx - px) * 0.5, ny, nx, ny);
      }
      ctx.lineTo(f.x + p[p.length - 1][0], sy + 70);
      ctx.closePath();
      ctx.fill();
    }

    // light rays
    if (pal.light > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const r of this.rays) {
        const sway = Math.sin(time * r.speed + r.phase);
        const alpha = (0.14 + 0.08 * Math.sin(time * 0.7 + r.phase)) * pal.light;
        ctx.save();
        ctx.translate(r.x + sway * 25, -40);
        ctx.rotate(r.tilt + sway * 0.05);
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.rayCanvas, -80 * r.w, 0, 160 * r.w, H * 1.3);
        ctx.restore();
      }
      ctx.restore();
    }

    // mid layer (hazy)
    const midCam = camY * MID_P;
    for (const m of this.mid) {
      const sy = midCam - m.y;
      if (sy + m.sprite.h < -50 || sy - m.sprite.h > H + 50) continue;
      ctx.globalAlpha = m.alpha;
      drawSprite(ctx, m.sprite, m.x, sy, m.scale);
    }
    ctx.globalAlpha = 1;
    // haze over mid layer so it recedes
    ctx.fillStyle = rgb(pal.bottom, 0.28);
    ctx.fillRect(0, 0, W, H);

    // ambient bubbles behind player layer
    for (const b of this.bubbles) {
      const sy = camY - b.y;
      if (sy < -20 || sy > H + 20) continue;
      ctx.globalAlpha = b.a * 0.6;
      ctx.strokeStyle = "rgba(220,245,255,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, sy, b.s, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Foreground motes, fog & vignette. Called after gameplay entities. */
  drawFront(ctx: CanvasRenderingContext2D, W: number, H: number, camY: number, pal: Palette, speedFactor: number) {
    const moteCam = camY * MOTE_P;
    // plankton takes on a bioluminescent tint in the deep
    ctx.fillStyle = pal.glow > 0.5 ? "rgba(170,235,255,1)" : "rgba(220,240,255,1)";
    for (const m of this.motes) {
      const sy = moteCam - m.y;
      if (sy < -10 || sy > H + 10) continue;
      ctx.globalAlpha = m.a;
      ctx.beginPath();
      // stretch motes vertically with speed -> forward motion feel
      ctx.ellipse(m.x, sy, m.s, m.s * (1 + speedFactor * 2.2), 0, 0, TAU);
      ctx.fill();
    }
    // directional current streaks (soft, elegant)
    ctx.lineCap = "round";
    for (const f of this.flow) {
      const grad = ctx.createLinearGradient(0, f.y - f.s, 0, f.y);
      grad.addColorStop(0, "rgba(220,245,255,0)");
      grad.addColorStop(0.6, `rgba(220,245,255,${f.a * (0.6 + speedFactor)})`);
      grad.addColorStop(1, "rgba(220,245,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y - f.s);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // depth fog: bottom of screen is deeper -> darker
    const fog = ctx.createLinearGradient(0, H * 0.45, 0, H);
    fog.addColorStop(0, rgb(pal.fog, 0));
    fog.addColorStop(1, rgb(pal.fog, 0.35 + 0.25 * (1 - pal.light)));
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);

    // vignette
    const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.85);
    v.addColorStop(0, "rgba(0,5,20,0)");
    v.addColorStop(1, `rgba(0,5,20,${clamp(0.35 + 0.25 * (1 - pal.light), 0, 0.6)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}
