import { LW, PLAYER_SCREEN_Y, PLAYER_HIT_RADIUS, PLAYER_COLLECT_RADIUS, BOOST_SPEED_MULT, DEPTH_PER_UNIT, SCORE, baseSpeedForDepth } from "./constants";
import { Player } from "./Player";
import { WorldGenerator } from "./WorldGenerator";
import { Background } from "./Background";
import { ParticleSystem, FloatTextSystem } from "./Particles";
import { Audio } from "./AudioManager";
import { SaveManager } from "./SaveManager";
import { paletteAt } from "./Zones";
import { setSpriteRes, drawSprite } from "./Sprites";
import { drawJellyfish, drawSmallFish, drawCoin, drawPearl, drawBubble, drawSeaweed, drawAmbient, Obstacle } from "./Entities";
import { Creature, creatureCircles, drawCreature, drawWarning, knockCreature } from "./Creatures";
import { clamp, damp, dist2, rand } from "./utils";

export type GameState = "MENU" | "TUTORIAL" | "PLAYING" | "BOOSTING" | "PAUSED" | "DYING" | "GAME_OVER";

export interface Snapshot {
  state: GameState;
  score: number;
  best: number;
  depth: number;
  boostActive: boolean;
  boostTimer: number;
  boostCooldown: number;
  canBoost: boolean;
  zoneName: string;
  newBest: boolean;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  a: number;
}

/**
 * Game
 * ----
 * Central game manager: owns the loop, the explicit state machine, input,
 * camera, collision resolution and rendering order.
 *
 * WORLD CONVENTION: +y = forward / deeper = UP on screen.
 * `camY` is the world y at the TOP edge of the screen, so screen y = camY - worldY.
 * The player sits at screen y = H * PLAYER_SCREEN_Y; everything ahead of the
 * player appears above it and flows DOWN as the player dives.
 */
export class Game {
  state: GameState = "MENU";
  private prevState: GameState = "PLAYING";

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private W = LW;
  private H = 800;

  player = new Player();
  world = new WorldGenerator();
  bg = new Background();
  particles = new ParticleSystem();
  texts = new FloatTextSystem();

  private score = 0;
  private best = SaveManager.getBest();
  private newBest = false;
  private time = 0;
  private lastTs = 0;
  private raf = 0;
  private destroyed = false;
  private deathTimer = 0;
  private timeScale = 1;
  private hitStop = 0;

  // camera & effects
  private camY = 0;
  private camX = 0;
  private zoom = 1;
  private shake = 0;
  private flash = 0;
  private flashColor = "255,40,40";
  private streaks: Streak[] = [];
  private bubbleAcc = 0;

  // input
  private pointerDown = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerStartT = 0;
  private dragStartTarget = 0;
  private dragging = false;
  private keys = new Set<string>();
  private steeringInput = false;

  private listeners = new Set<(s: Snapshot) => void>();
  private snapshot: Snapshot = { state: "MENU", score: 0, best: this.best, depth: 0, boostActive: false, boostTimer: 0, boostCooldown: 0, canBoost: true, zoneName: "", newBest: false };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.world.onWarning = (c) => this.onCreatureWarning(c);
    this.resize();
    this.startDemo();
    this.bindInput();
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.unbindInput();
    Audio.stopMusic();
  }

  subscribe(fn: (s: Snapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private publish() {
    const p = this.player;
    this.snapshot = {
      state: this.state,
      score: Math.floor(this.score),
      best: this.best,
      depth: Math.floor(p.worldY * DEPTH_PER_UNIT),
      boostActive: p.boostActive,
      boostTimer: p.boostTimer,
      boostCooldown: p.boostCooldown,
      canBoost: p.canBoost,
      zoneName: paletteAt(p.worldY * DEPTH_PER_UNIT).zoneName,
      newBest: this.newBest,
    };
    for (const l of this.listeners) l(this.snapshot);
  }

  // ------------------------------------------------------------------
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = this.canvas.width / LW;
    this.W = LW;
    this.H = this.canvas.height / this.scale;
    setSpriteRes(this.scale);
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }

  private get cssScale() {
    return this.canvas.getBoundingClientRect().width / LW;
  }

  private camTopFor(worldY: number) {
    return worldY + this.H * PLAYER_SCREEN_Y;
  }

  // ------------------------------------------------------------------
  // State transitions
  // ------------------------------------------------------------------
  private resetRun(demo: boolean) {
    this.player.reset();
    this.particles.clear();
    this.texts.clear();
    this.streaks.length = 0;
    this.score = 0;
    this.newBest = false;
    this.deathTimer = 0;
    this.shake = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.hitStop = 0;
    this.zoom = 1;
    this.camY = this.camTopFor(this.player.worldY);
    this.bg.reset(this.camY, this.H);
    this.world.reset(this.camY, this.H, demo);
    this.world.spawnAhead(this.camY);
    this.bg.update(0, this.camY, 0, this.H, 0);
  }

  startDemo() {
    this.state = "MENU";
    this.resetRun(true);
    this.player.speed = 90;
    this.publish();
  }

  showTutorial() {
    this.state = "TUTORIAL";
    this.publish();
  }

  startGame() {
    Audio.init();
    Audio.startMusic();
    this.resetRun(false);
    this.state = "PLAYING";
    this.publish();
  }

  pause() {
    if (this.state !== "PLAYING" && this.state !== "BOOSTING") return;
    this.prevState = this.state;
    this.state = "PAUSED";
    this.pointerDown = false;
    this.dragging = false;
    Audio.pauseAll();
    this.publish();
  }

  resume() {
    if (this.state !== "PAUSED") return;
    this.state = this.prevState;
    Audio.resumeAll();
    this.lastTs = performance.now();
    this.publish();
  }

  restart() {
    Audio.resumeAll();
    Audio.play("retry");
    this.startGame();
  }

  goHome() {
    Audio.resumeAll();
    Audio.stopMusic();
    this.startDemo();
  }

  private tryBoost() {
    if (this.state !== "PLAYING") return;
    if (!this.player.canBoost) return;
    this.player.startBoost();
    this.state = "BOOSTING";
    this.flash = 0.35;
    this.flashColor = "120,220,255";
    this.shake = Math.max(this.shake, 4);
    Audio.play("boostStart");
    this.particles.bubbles(this.player.x, this.player.worldY - 30, 18, 120, 4);
    this.particles.burst(this.player.x, this.player.worldY, 14, "rgba(140,230,255,0.9)", 200, 3, 0.5);
    this.publish();
  }

  private onBoostEnded() {
    this.state = "PLAYING";
    Audio.play("boostEnd");
    this.particles.bubbles(this.player.x, this.player.worldY - 20, 8, 60, 3);
  }

  private onCreatureWarning(_c: Creature) {
    if (this.state !== "PLAYING" && this.state !== "BOOSTING") return;
    Audio.play("danger");
    this.shake = Math.max(this.shake, 2.5);
  }

  private die(kind: Obstacle["kind"] | Creature["kind"], impactX: number) {
    if (this.state !== "PLAYING") return;
    const p = this.player;
    const dir = Math.sign(impactX - p.x) || 1;
    p.kill(dir);
    this.state = "DYING";
    this.deathTimer = 0;
    this.shake = 16;
    this.flash = 0.7;
    this.flashColor = "255,40,40";
    this.hitStop = 0.09;
    const sfx = kind === "rock" || kind === "ruin" || kind === "wall" ? "hitRock" : kind === "coral" ? "hitCoral" : kind === "jelly" || kind === "bigJelly" ? "hitJelly" : "hitShark";
    Audio.play(sfx);
    Audio.play("death");
    this.particles.burst(p.x, p.worldY, 24, "rgba(255,120,120,0.9)", 260, 4, 0.6);
    this.particles.bubbles(p.x, p.worldY, 24, 140, 5);
    this.pointerDown = false;
    this.dragging = false;
    this.publish();
  }

  private finishDeath() {
    this.state = "GAME_OVER";
    if (Math.floor(this.score) > this.best) {
      this.best = Math.floor(this.score);
      this.newBest = true;
      SaveManager.setBest(this.best);
    }
    Audio.play("gameOver");
    this.publish();
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  private onPointerDown = (e: PointerEvent) => {
    if (this.state !== "PLAYING" && this.state !== "BOOSTING") return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointerDown = true;
    this.dragging = false;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.pointerStartT = performance.now();
    this.dragStartTarget = this.player.x;
    this.player.targetX = this.player.x;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerDown) return;
    const dx = (e.clientX - this.pointerStartX) / this.cssScale;
    if (!this.dragging && Math.abs(dx) > 7) this.dragging = true;
    if (this.dragging) {
      this.player.targetX = clamp(this.dragStartTarget + dx * 1.35, 22, LW - 22);
      this.steeringInput = true;
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    const dt = performance.now() - this.pointerStartT;
    const moved = Math.hypot(e.clientX - this.pointerStartX, e.clientY - this.pointerStartY);
    if (!this.dragging && dt < 350 && moved < 10) this.tryBoost();
    this.dragging = false;
    this.steeringInput = false;
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      this.tryBoost();
    } else if (e.code === "Escape" || e.code === "KeyP") {
      if (this.state === "PAUSED") this.resume();
      else this.pause();
    }
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onVisibility = () => {
    if (document.hidden) this.pause();
  };

  private bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisibility);
  }
  private unbindInput() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  private loop = (ts: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    if (this.state === "PAUSED" || this.state === "TUTORIAL") {
      this.render();
      return;
    }
    this.update(dt);
    this.render();
    this.publish();
  };

  private update(rawDt: number) {
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      this.timeScale = 0.12;
    } else {
      this.timeScale = damp(this.timeScale, 1, 12, rawDt);
    }
    const dt = rawDt * this.timeScale;
    this.time += dt;

    const p = this.player;
    const depth = p.worldY * DEPTH_PER_UNIT;

    if (this.state === "PLAYING" || this.state === "BOOSTING") {
      const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
      const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
      if (left !== right) {
        p.targetX = clamp(p.targetX + (right ? 1 : -1) * 520 * dt, 22, LW - 22);
        this.steeringInput = true;
      } else if (!this.dragging) this.steeringInput = false;
    }

    let targetSpeed: number;
    if (this.state === "MENU") {
      targetSpeed = 90;
      p.targetX = LW / 2 + Math.sin(this.time * 0.6) * 90;
    } else {
      const base = baseSpeedForDepth(depth);
      targetSpeed = p.boostActive ? base * BOOST_SPEED_MULT : base;
    }
    const wasBoosting = p.boostActive;
    p.update(dt, targetSpeed, this.steeringInput);
    if (wasBoosting && !p.boostActive && this.state === "BOOSTING") this.onBoostEnded();

    // forward motion: the player advances into the world (+y)
    p.worldY += p.speed * dt * (p.dead ? 0.5 : 1);

    // camera follows; slight zoom-out during boost for a wider view
    const targetCam = this.camTopFor(p.worldY);
    this.camY = p.dead ? damp(this.camY, targetCam, 6, dt) : targetCam;
    this.camX = damp(this.camX, -p.bank * 10, 5, dt);
    this.zoom = damp(this.zoom, p.boostActive ? 0.94 : 1, 4, dt);
    this.shake = damp(this.shake, 0, 7, dt);
    this.flash = Math.max(0, this.flash - dt * 1.8);

    const speedFactor = clamp((p.speed - 120) / 400, 0, 1);
    this.world.update(dt, this.time, this.camY, this.H, p.x, p.worldY);
    this.bg.update(dt, this.camY, depth, this.H, speedFactor);
    this.particles.update(dt);
    this.texts.update(dt);

    // trailing bubbles from the tail (behind the fish = -y), drifting back
    this.bubbleAcc += dt * (p.boostActive ? 40 : 6 + Math.abs(p.vx) / 40);
    while (this.bubbleAcc > 1) {
      this.bubbleAcc -= 1;
      this.particles.bubbles(p.x + rand(-6, 6), p.worldY - 34, 1, 40, p.boostActive ? 3.5 : 2.2);
    }

    // boost speed streaks flow top -> bottom (screen space)
    if (p.boostGlow > 0.05 && this.streaks.length < 26 && Math.random() < p.boostGlow) {
      this.streaks.push({ x: rand(0, LW), y: -rand(20, 140), len: rand(40, 120), speed: rand(900, 1500), a: rand(0.25, 0.6) });
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.y += s.speed * dt;
      if (s.y - s.len > this.H) this.streaks.splice(i, 1);
    }

    if (this.state === "PLAYING" || this.state === "BOOSTING") {
      this.score += p.speed * dt * 0.02 * (p.boostActive ? 1.25 : 1);
      this.handleCollisions();
    } else if (this.state === "DYING") {
      this.deathTimer += dt;
      if (this.deathTimer > 2.0) this.finishDeath();
    } else if (this.state === "MENU") {
      this.collectDemo();
    }
  }

  // ------------------------------------------------------------------
  // Collisions
  // ------------------------------------------------------------------
  private hitsPlayer(x: number, y: number, r: number) {
    const p = this.player;
    // body circle + nose circle (nose is ahead = +y)
    const nx = p.x + Math.sin(p.yaw) * 20;
    const ny = p.worldY + Math.cos(p.yaw) * 20;
    const rr = r + PLAYER_HIT_RADIUS;
    return dist2(p.x, p.worldY, x, y) < rr * rr || dist2(nx, ny, x, y) < (r + 11) * (r + 11);
  }

  private obstacleHits(o: Obstacle) {
    if (this.hitsPlayer(o.x, o.y, o.r)) return true;
    for (const c of o.circles) if (this.hitsPlayer(o.x + c.dx, o.y + c.dy, c.r)) return true;
    return false;
  }

  private handleCollisions() {
    const p = this.player;
    const invincible = p.boostActive; // purely timer driven
    const w = this.world;

    const cr = PLAYER_COLLECT_RADIUS;
    const nx = p.x + Math.sin(p.yaw) * 18;
    const ny = p.worldY + Math.cos(p.yaw) * 18;
    for (const c of w.collectibles) {
      if (!c.alive) continue;
      const rr = c.r + cr;
      if (dist2(p.x, p.worldY, c.x, c.y) < rr * rr || dist2(nx, ny, c.x, c.y) < rr * rr) {
        c.alive = false;
        this.collect(c.kind, c.x, c.y, c.color);
      }
    }

    for (const o of w.obstacles) {
      if (!o.alive) continue;
      if (Math.abs(o.y - p.worldY) > 220) continue;
      if (!this.obstacleHits(o)) continue;
      if (invincible) this.smash(o.x, o.y, o.debris, o.kind);
      else {
        this.die(o.kind, o.x);
        return;
      }
      o.alive = false;
    }

    for (const c of w.creatures) {
      if (!c.alive || c.harmless || c.warn > 0) continue;
      if (Math.abs(c.y - p.worldY) > 420) continue;
      let hit = false;
      for (const circ of creatureCircles(c)) {
        if (this.hitsPlayer(circ.x, circ.y, circ.r)) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      if (invincible) this.smashCreature(c);
      else {
        this.die(c.kind, c.x);
        return;
      }
    }
  }

  private collect(kind: "bubble" | "coin" | "pearl" | "fish", x: number, y: number, color?: string) {
    let v = 0;
    switch (kind) {
      case "bubble":
        v = SCORE.bubble;
        Audio.play("bubble");
        this.particles.bubbles(x, y, 5, 50, 2.5);
        this.texts.add(x, y, `+${v}`, "#d9f4ff", 0.85);
        break;
      case "coin":
        v = SCORE.coin;
        Audio.play("coin");
        this.particles.sparkles(x, y, 8, "#ffe27a");
        this.texts.add(x, y, `+${v}`, "#ffd85a", 1);
        break;
      case "pearl":
        v = SCORE.pearl;
        Audio.play("pearl");
        this.particles.sparkles(x, y, 18, "#ffffff");
        this.particles.burst(x, y, 12, "rgba(220,200,255,0.9)", 140, 3, 0.7);
        this.texts.add(x, y, `+${v}`, "#f4ecff", 1.3);
        this.flash = Math.max(this.flash, 0.18);
        this.flashColor = "255,255,255";
        break;
      case "fish":
        v = SCORE.fish;
        Audio.play("eat");
        this.particles.burst(x, y, 10, color ?? "#ffb347", 160, 3, 0.45);
        this.particles.bubbles(x, y, 4, 60, 2.5);
        this.texts.add(x, y, `+${v}`, color ?? "#ffb347", 1.05);
        this.shake = Math.max(this.shake, 1.5);
        break;
    }
    this.score += v;
  }

  private smash(x: number, y: number, colors: string[], kind: string) {
    Audio.play("smash");
    this.particles.debris(x, y, kind === "jelly" ? 8 : 16, colors, 260);
    this.particles.burst(x, y, 10, "rgba(160,235,255,0.9)", 200, 3, 0.4);
    this.score += SCORE.smash;
    this.texts.add(x, y, `SMASH +${SCORE.smash}`, "#9fe8ff", 0.95);
    this.shake = Math.max(this.shake, 6);
    this.hitStop = Math.max(this.hitStop, 0.03);
  }

  /** Boost impact with a creature: creature recoils / is flung away, player is safe. */
  private smashCreature(c: Creature) {
    const p = this.player;
    knockCreature(c, p.x);
    Audio.play("smash");
    const x = c.x;
    const y = c.y;
    switch (c.kind) {
      case "octopus":
        this.particles.burst(x, y, 26, "rgba(60,20,90,0.85)", 180, 7, 0.9); // ink cloud
        this.particles.bubbles(x, y, 14, 90, 4);
        this.texts.add(x, y, "INK! +5", "#d9a6ff", 1.1);
        break;
      case "bigJelly":
        this.particles.sparkles(x, y, 24, "#bff8ff"); // electric burst
        this.particles.burst(x, y, 12, "rgba(255,255,255,0.9)", 260, 2.5, 0.4);
        this.texts.add(x, y, "ZAP! +5", "#bff8ff", 1.1);
        break;
      case "shark":
        this.particles.debris(x, y, 10, ["#7c8aa2", "#48546a"], 220);
        this.particles.bubbles(x, y, 16, 120, 4);
        this.texts.add(x, y, "KNOCKOUT +5", "#9fe8ff", 1);
        break;
      case "eel":
        this.particles.burst(x, y, 14, "rgba(150,190,80,0.9)", 200, 3, 0.5);
        this.particles.bubbles(x, y, 10, 90, 3);
        this.texts.add(x, y, "RECOIL +5", "#c9e07a", 1);
        break;
      case "manta":
        this.particles.bubbles(x, y, 24, 140, 5);
        this.particles.burst(x, y, 10, "rgba(120,150,210,0.8)", 220, 4, 0.5);
        this.texts.add(x, y, "PUSHED +5", "#bcd0ff", 1);
        break;
      case "angler":
        this.particles.sparkles(x, y, 14, "#9ffff0");
        this.particles.burst(x, y, 12, "rgba(40,50,90,0.9)", 220, 4, 0.6);
        this.texts.add(x, y, "KNOCKED BACK +5", "#9ffff0", 1);
        break;
      case "serpent":
        this.particles.burst(x, y, 16, "rgba(60,190,170,0.9)", 220, 3, 0.5);
        this.texts.add(x, y, "REPELLED +5", "#8ff5dc", 1);
        break;
    }
    this.score += 5;
    this.shake = Math.max(this.shake, 8);
    this.hitStop = Math.max(this.hitStop, 0.05);
  }

  private collectDemo() {
    const p = this.player;
    for (const c of this.world.collectibles) {
      if (!c.alive) continue;
      const rr = c.r + PLAYER_COLLECT_RADIUS;
      if (dist2(p.x, p.worldY, c.x, c.y) < rr * rr) {
        c.alive = false;
        if (c.kind === "fish") this.particles.burst(c.x, c.y, 8, c.color ?? "#fff", 120, 3, 0.4);
        else this.particles.sparkles(c.x, c.y, 6, "#ffffff");
      }
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  private render() {
    const ctx = this.ctx;
    const { W, H } = this;
    const p = this.player;
    const depth = p.worldY * DEPTH_PER_UNIT;
    const pal = paletteAt(depth);
    const camY = this.camY;
    const sx = this.shake > 0.1 ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake > 0.1 ? rand(-this.shake, this.shake) : 0;
    const playerSy = camY - p.worldY;

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.bg.drawBack(ctx, W, H, camY, pal, this.time);

    ctx.save();
    // zoom around the player (wider view during boost)
    ctx.translate(W / 2, playerSy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-W / 2, -playerSy);
    ctx.translate(this.camX + sx, sy);

    // decor (ground layer)
    for (const d of this.world.decor) {
      const y = camY - d.y;
      if (y < -200 || y > H + 200) continue;
      if (d.kind === "seaweed") drawSeaweed(ctx, d.x, y, d.h, d.phase, this.time, d.color, d.scale);
      else if (d.sprite) {
        ctx.save();
        ctx.translate(d.x, y);
        if (d.flip) ctx.scale(-1, 1);
        ctx.scale(d.scale, d.scale);
        ctx.drawImage(d.sprite.canvas, -d.sprite.ax, -d.sprite.ay, d.sprite.w, d.sprite.h);
        ctx.restore();
      }
    }

    // harmless ambient life
    for (const a of this.world.ambient) {
      const y = camY - a.y;
      if (y < -60 || y > H + 60) continue;
      drawAmbient(ctx, a, y, this.time);
    }

    // collectibles
    for (const c of this.world.collectibles) {
      if (!c.alive) continue;
      const y = camY - c.y;
      if (y < -60 || y > H + 60) continue;
      switch (c.kind) {
        case "bubble": drawBubble(ctx, c.x, y, c.size ?? 8); break;
        case "coin": drawCoin(ctx, c.x, y, this.time + c.phase); break;
        case "pearl": drawPearl(ctx, c.x, y, this.time + c.phase); break;
        case "fish": drawSmallFish(ctx, c.x, y, c.vx, c.size ?? 7, this.time * 9 + c.phase * 10, c.color ?? "#ffb347"); break;
      }
    }

    // obstacles
    for (const o of this.world.obstacles) {
      if (!o.alive) continue;
      const y = camY - o.y;
      if (y < -260 || y > H + 260) continue;
      if (o.kind === "jelly") drawJellyfish(ctx, o.x, y, o.size, this.time + o.phase, o.color, pal.glow);
      else if (o.sprite) drawSprite(ctx, o.sprite, o.x, y + o.oy, o.scale, o.rot);
    }

    // creatures
    for (const c of this.world.creatures) {
      if (!c.alive) continue;
      const y = camY - c.y;
      if (y < -400 || y > H + 400) continue;
      drawCreature(ctx, c, camY, this.time, pal.glow);
    }

    this.particles.draw(ctx, camY);

    // boost streaks
    if (this.streaks.length) {
      ctx.lineCap = "round";
      for (const s of this.streaks) {
        ctx.strokeStyle = `rgba(200,240,255,${s.a * p.boostGlow})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - s.len);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    }

    // player
    p.draw(ctx, p.x, playerSy);

    this.texts.draw(ctx, camY);
    ctx.restore();

    // warnings for incoming big creatures (screen space, top)
    for (const c of this.world.creatures) if (c.alive && c.warn > 0) drawWarning(ctx, c, this.time);

    this.bg.drawFront(ctx, W, H, camY, pal, clamp((p.speed - 120) / 400, 0, 1));

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.boostGlow > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, "rgba(90,200,255,0)");
      g.addColorStop(1, `rgba(90,200,255,${0.35 * p.boostGlow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === "MENU" || this.state === "TUTORIAL") {
      ctx.fillStyle = "rgba(0,10,30,0.28)";
      ctx.fillRect(0, 0, W, H);
    }
  }
}
