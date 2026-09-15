import { LW, DEPTH_PER_UNIT, difficultyForDepth, baseSpeedForDepth } from "./constants";
import { Obstacle, Collectible, FishSchool, Decor, Ambient } from "./Entities";
import { Creature, CreatureKind, BIG_KINDS, createCreature, updateCreature } from "./Creatures";
import { makeRock, makeCoral, makeColumn, makeShell, makeGlowPlant, makeAnemone, makeFanCoral, makeMushrooms, RockStyle } from "./Sprites";
import { clamp, lerp, rand, randInt, pick, weighted, TAU, dist2 } from "./utils";
import { zoneAt, ZoneDef } from "./Zones";

type Pattern = "single" | "pair" | "wall" | "cluster" | "jellyRow" | "coralGarden" | "ruinRow";

const JELLY_COLORS = ["#ff6fd8", "#7ad7ff", "#c58bff", "#ff9a6b", "#8dffb0"];
const FISH_COLORS = ["#ffb347", "#6ee7ff", "#ff7aa8", "#b4ff6e", "#ffd86b", "#8fa8ff"];

/**
 * WorldGenerator
 * --------------
 * World convention: +y = forward / deeper = UP on screen (screen y = camY - y).
 * `camY` is the world y at the TOP edge of the screen; everything is spawned
 * AHEAD of the player (y > camY) and flows DOWN as the player dives forward.
 * Every obstacle row is built around a "gap" whose position is limited by how
 * far the player can steer between rows -> always fair.
 */
export class WorldGenerator {
  obstacles: Obstacle[] = [];
  creatures: Creature[] = [];
  collectibles: Collectible[] = [];
  schools: FishSchool[] = [];
  decor: Decor[] = [];
  ambient: Ambient[] = [];

  /** set by the game when a big creature is announced (for sfx/shake) */
  onWarning: ((c: Creature) => void) | null = null;

  private nextRowY = 0;
  private nextDecorY = 0;
  private nextFillerY = 0;
  private nextAmbientY = 0;
  private prevGapC = LW / 2;
  private prevRowY = 0;
  private lastWallY = -9999;
  private creatureTimer = 6;
  private demo = false;

  reset(camY: number, H: number, demo = false) {
    this.obstacles.length = 0;
    this.creatures.length = 0;
    this.collectibles.length = 0;
    this.schools.length = 0;
    this.decor.length = 0;
    this.ambient.length = 0;
    this.demo = demo;
    this.nextRowY = camY + (demo ? 99999999 : 700); // first hazard row well ahead (~5s)
    this.nextDecorY = camY - H - 100; // fill the visible screen with decor
    this.nextFillerY = camY + 150;
    this.nextAmbientY = camY - H;
    this.prevGapC = LW / 2;
    this.prevRowY = camY;
    this.lastWallY = -9999;
    this.creatureTimer = 7;
  }

  // ------------------------------------------------------------------
  // Spawning ahead (above the screen top)
  // ------------------------------------------------------------------
  spawnAhead(camY: number) {
    const limit = camY + 340;
    while (this.nextDecorY < limit) {
      this.spawnDecor(this.nextDecorY);
      this.nextDecorY += rand(90, 180);
    }
    while (this.nextAmbientY < limit) {
      this.spawnAmbient(this.nextAmbientY);
      this.nextAmbientY += rand(260, 520);
    }
    while (this.nextFillerY < limit) {
      this.spawnFiller(this.nextFillerY);
      this.nextFillerY += rand(260, 420);
    }
    while (this.nextRowY < limit) {
      const depth = this.nextRowY * DEPTH_PER_UNIT;
      const diff = difficultyForDepth(depth);
      this.spawnRow(this.nextRowY, depth, diff);
      const gap = lerp(600, 350, diff) * rand(0.9, 1.15);
      this.prevRowY = this.nextRowY;
      this.nextRowY += gap;
    }
  }

  private rockStyle(zone: ZoneDef): RockStyle {
    return pick(zone.rockStyle);
  }

  private baseObstacle(kind: Obstacle["kind"], x: number, y: number, r: number): Obstacle {
    return { kind, x, y, r, circles: [], oy: 0, scale: 1, rot: 0, phase: rand(0, TAU), vx: 0, vy: 0, size: 0, color: "#fff", debris: [], alive: true, baseX: x, drift: 0 };
  }

  private addRock(x: number, y: number, w: number, h: number, zone: ZoneDef, jagged = false) {
    const style = this.rockStyle(zone);
    const o = this.baseObstacle("rock", x, y, Math.min(w, h) * 0.42);
    o.sprite = makeRock(w, h, style, jagged || (zone.id === "canyon" && Math.random() < 0.5));
    o.rot = rand(-0.2, 0.2);
    if (w > h * 1.4) {
      const off = (w - h) * 0.35;
      o.circles.push({ dx: -off, dy: 0, r: h * 0.38 }, { dx: off, dy: 0, r: h * 0.38 });
    }
    o.debris = style === "brown" ? ["#8d7462", "#5b4a3e", "#a9927c"] : style === "mossy" ? ["#7a8c80", "#4d6058", "#93b28f"] : style === "coral" ? ["#b8a0a0", "#ff6f8f", "#6a4a5a"] : ["#7d8896", "#46505f", "#a2adbb"];
    this.obstacles.push(o);
    return o;
  }

  private addCoral(x: number, y: number, w: number, h: number) {
    const o = this.baseObstacle("coral", x, y, w * 0.34);
    o.sprite = makeCoral(w, h, true);
    o.oy = h * 0.5; // sprite anchored at its base (lower on screen)
    o.circles.push({ dx: 0, dy: -h * 0.25, r: w * 0.3 });
    o.debris = ["#ff6f8f", "#ffb3c2", "#c0304f"];
    this.obstacles.push(o);
    return o;
  }

  private addColumn(x: number, y: number, w: number, h: number) {
    const o = this.baseObstacle("ruin", x, y, w * 0.55);
    o.sprite = makeColumn(w, h, Math.random() < 0.6);
    o.rot = rand(-0.12, 0.12);
    const n = Math.floor(h / (w * 1.1));
    for (let i = 0; i < n; i++) {
      const dy = -h / 2 + w * 0.6 + (i * (h - w * 1.2)) / Math.max(1, n - 1);
      o.circles.push({ dx: Math.sin(o.rot) * dy, dy: Math.cos(o.rot) * dy, r: w * 0.55 });
    }
    o.debris = ["#a9b7ad", "#6d7d78", "#c6d2c7"];
    this.obstacles.push(o);
    return o;
  }

  private addJelly(x: number, y: number, size: number, drift: number) {
    const o = this.baseObstacle("jelly", x, y, size * 0.85);
    o.size = size;
    o.color = pick(JELLY_COLORS);
    o.drift = drift;
    o.vy = rand(-16, 4); // mostly drifting toward the player
    o.debris = [o.color, "#ffffff", o.color];
    this.obstacles.push(o);
    return o;
  }

  private fillRegion(x0: number, x1: number, y: number, zone: ZoneDef, tall: boolean) {
    const w = x1 - x0;
    if (w < 34) return;
    const cx = (x0 + x1) / 2;
    const kind = weighted<"rock" | "coral" | "ruin">([
      { item: "rock", w: zone.rock + 1 },
      { item: "coral", w: zone.coral },
      { item: "ruin", w: zone.ruin },
    ]);
    if (kind === "coral" && w < 110) {
      const cw = clamp(w * 0.8, 40, 80);
      this.addCoral(cx, y, cw, cw * rand(1.1, 1.4));
    } else if (kind === "ruin" && w < 100) {
      this.addColumn(cx, y, clamp(w * 0.35, 18, 32), rand(110, 170));
    } else if (w > 150) {
      const n = Math.ceil(w / 110);
      for (let i = 0; i < n; i++) {
        const rx = x0 + (w * (i + 0.5)) / n;
        this.addRock(rx, y + rand(-20, 20), clamp(w / n + 30, 70, 150), tall ? rand(90, 150) : rand(55, 100), zone);
      }
    } else {
      this.addRock(cx, y, clamp(w + 20, 55, 150), tall ? rand(90, 140) : rand(50, 95), zone);
    }
  }

  private spawnRow(y: number, depth: number, diff: number) {
    const zone = zoneAt(depth);
    const speed = baseSpeedForDepth(depth);
    const rowDist = y - this.prevRowY;
    const reach = clamp(((rowDist / speed) * 380) * 0.75, 60, LW);
    const gapW = lerp(185, 118, diff) * rand(0.95, 1.1);
    const half = gapW / 2;
    let gapC = clamp(this.prevGapC + rand(-reach, reach), half + 14, LW - half - 14);
    if (Math.abs(gapC - this.prevGapC) < 25 && Math.random() < 0.6) gapC = clamp(gapC + (Math.random() < 0.5 ? -1 : 1) * rand(50, Math.max(60, reach)), half + 14, LW - half - 14);

    const pattern = weighted<Pattern>([
      { item: "single", w: 4 - diff * 2 },
      { item: "pair", w: 2 + diff * 2 },
      { item: "wall", w: zone.wall * (0.4 + diff) * (y - this.lastWallY > 900 ? 1 : 0) },
      { item: "cluster", w: 1 + diff * 2 },
      { item: "jellyRow", w: depth < 500 ? 0 : zone.jelly * (0.5 + diff) },
      { item: "coralGarden", w: zone.coral * 0.6 },
      { item: "ruinRow", w: zone.ruin },
    ]);

    switch (pattern) {
      case "single": {
        const left = gapC > LW / 2;
        const w = rand(60, 120);
        const x = left ? rand(w / 2 + 5, gapC - half - w / 2) : rand(gapC + half + w / 2, LW - w / 2 - 5);
        if (Number.isFinite(x) && x > 0 && x < LW) this.fillRegion(x - w / 2, x + w / 2, y, zone, false);
        else this.fillRegion(0, gapC - half, y, zone, false);
        break;
      }
      case "pair":
        this.fillRegion(0, gapC - half, y, zone, false);
        this.fillRegion(gapC + half, LW, y, zone, false);
        break;
      case "wall": {
        this.lastWallY = y;
        const tallH = rand(150, 230);
        const lw = gapC - half;
        const rw = LW - (gapC + half);
        if (lw > 30) this.addRock(lw / 2 - 10, y, lw + 30, tallH, zone, true);
        if (rw > 30) this.addRock(LW - rw / 2 + 10, y + rand(-30, 30), rw + 30, tallH * rand(0.8, 1.1), zone, true);
        break;
      }
      case "cluster": {
        const n = 2 + Math.round(diff * 2);
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const w = rand(45, 75);
          const region = side < 0 ? [w / 2 + 5, gapC - half - w / 2] : [gapC + half + w / 2, LW - w / 2 - 5];
          if (region[1] - region[0] < 10) continue;
          const x = rand(region[0], region[1]);
          const yy = y + (i - n / 2) * rand(60, 90);
          if (Math.random() < zone.coral / 6) this.addCoral(x, yy, w, w * 1.3);
          else this.addRock(x, yy, w, w * rand(0.7, 1), zone);
        }
        break;
      }
      case "jellyRow": {
        const n = 2 + (diff > 0.4 && Math.random() < 0.5 ? 1 : 0);
        const size = rand(16, 22);
        const spots: number[] = [];
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const region = side < 0 ? [size + 10, gapC - half - size - 10] : [gapC + half + size + 10, LW - size - 10];
          if (region[1] - region[0] < 10) continue;
          spots.push(rand(region[0], region[1]));
        }
        spots.forEach((x, i) => this.addJelly(x, y + i * rand(50, 90), size, rand(10, 26) * (0.5 + diff)));
        break;
      }
      case "coralGarden": {
        const left = gapC > LW / 2;
        for (let i = 0; i < 3; i++) {
          const w = rand(50, 75);
          const x = left ? rand(w / 2, Math.max(w / 2 + 1, gapC - half - w / 2)) : rand(Math.min(LW - w / 2 - 1, gapC + half + w / 2), LW - w / 2);
          this.addCoral(x, y + i * rand(70, 110), w, w * rand(1.1, 1.4));
        }
        this.decor.push({ kind: "sprite", x: left ? rand(10, 60) : LW - rand(10, 60), y: y + rand(-60, 60), sprite: makeFanCoral(rand(60, 90), rand(45, 65)), h: 0, phase: 0, color: "", scale: 1, flip: false });
        break;
      }
      case "ruinRow": {
        const lw = gapC - half;
        const rw = LW - (gapC + half);
        if (lw > 40) this.addColumn(rand(20, lw - 15), y, rand(20, 30), rand(120, 190));
        if (rw > 40) this.addColumn(LW - rand(20, rw - 15), y + rand(-40, 40), rand(20, 30), rand(120, 190));
        if (diff > 0.35 && Math.random() < 0.5) this.addRock(gapC + (Math.random() < 0.5 ? -1 : 1) * (half + 40), y + 120, rand(50, 80), rand(40, 60), zone);
        break;
      }
    }
    this.prevGapC = gapC;

    const r = Math.random();
    if (r < 0.14) this.addPearl(gapC + rand(-20, 20), y + rand(-10, 10));
    else if (r < 0.5) this.addCoinArc(gapC, y + rand(120, 200), 4 + randInt(0, 3), 0.4);
  }

  private spawnFiller(y: number) {
    const depth = y * DEPTH_PER_UNIT;
    const r = Math.random();
    if (r < 0.32) this.addCoinArc(rand(70, LW - 70), y, 6 + randInt(0, 3), rand(0.6, 1.4));
    else if (r < 0.6) this.addFishSchool(y);
    else if (r < 0.85) this.addBubbleCluster(rand(40, LW - 40), y);
    else if (depth > 300 || this.demo) this.addPearl(rand(60, LW - 60), y);
    else this.addBubbleCluster(rand(40, LW - 40), y);
  }

  private spawnDecor(y: number) {
    const depth = y * DEPTH_PER_UNIT;
    const zone = zoneAt(depth);
    const kind = pick(zone.decor);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? rand(4, 70) : LW - rand(4, 70);
    const d: Decor = { kind: "sprite", x, y, h: 0, phase: rand(0, TAU), color: "", scale: rand(0.85, 1.2), flip: side > 0 };
    switch (kind) {
      case "seaweed":
        d.kind = "seaweed";
        d.h = rand(60, 130);
        d.color = pick(["#1f8a5a", "#2aa86b", "#22b39a", "#6fbf3a", "#c9a227", "#e07b39"]);
        if (depth > 1500) d.color = pick(["#1b6b52", "#166050", "#2a7a8a"]);
        if (depth > 3200) d.color = pick(["#12503f", "#0f4436", "#1d3f5a"]);
        break;
      case "coralDecor":
        d.sprite = Math.random() < 0.5 ? makeCoral(rand(40, 70), rand(50, 80), false) : makeFanCoral(rand(50, 90), rand(40, 60));
        break;
      case "anemone":
        d.sprite = makeAnemone(rand(30, 50));
        break;
      case "glowPlant":
        d.sprite = makeGlowPlant(rand(50, 90));
        break;
      case "mushroom":
        d.sprite = makeMushrooms(rand(26, 40));
        break;
      case "shell":
        d.sprite = makeShell(rand(18, 26));
        break;
      case "column":
        d.sprite = makeColumn(rand(16, 26), rand(60, 120), Math.random() < 0.8);
        d.x = side < 0 ? rand(10, 40) : LW - rand(10, 40);
        break;
    }
    this.decor.push(d);
    // tiny crab hanging around reef rocks
    if ((kind === "shell" || kind === "anemone") && Math.random() < 0.5) {
      this.ambient.push({ kind: "crab", x: clamp(d.x + rand(-20, 20), 8, LW - 8), y: y - 8, vx: rand(-8, 8), vy: 0, phase: rand(0, TAU), size: 6, color: "#ff6a3d", dir: 1 });
    }
  }

  private spawnAmbient(y: number) {
    const depth = y * DEPTH_PER_UNIT;
    const r = Math.random();
    if (depth > 2200 && r < 0.45) {
      for (let i = 0; i < randInt(2, 4); i++) {
        this.ambient.push({ kind: "glowfish", x: rand(20, LW - 20), y: y + rand(-40, 40), vx: rand(-15, 15), vy: rand(-10, 10), phase: rand(0, TAU), size: 3, color: pick(["#7af0ff", "#b58cff", "#8dff9c"]), dir: 1 });
      }
    } else if (r < 0.35) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.ambient.push({ kind: "ray", x: side < 0 ? -30 : LW + 30, y, vx: -side * rand(25, 45), vy: rand(-10, 10), phase: rand(0, TAU), size: rand(12, 18), color: "", dir: side });
    } else if (r < 0.7) {
      for (let i = 0; i < randInt(3, 5); i++) {
        this.ambient.push({ kind: "butterfly", x: rand(30, LW - 30), y: y + rand(-30, 30), vx: rand(-12, 12), vy: rand(-8, 8), phase: rand(0, TAU), size: 4, color: pick(["#ffb3e6", "#b3f0ff", "#fff3a3"]), dir: 1 });
      }
    }
  }

  // ------------------------------------------------------------------
  // Collectibles
  // ------------------------------------------------------------------
  private safeSpot(x: number, y: number, margin: number) {
    for (const o of this.obstacles) {
      if (dist2(o.x, o.y, x, y) < (o.r + margin) ** 2) return false;
      for (const c of o.circles) if (dist2(o.x + c.dx, o.y + c.dy, x, y) < (c.r + margin) ** 2) return false;
    }
    return true;
  }

  private addCoinArc(cx: number, y: number, n: number, curve: number) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const amp = rand(40, 90) * curve;
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const x = clamp(cx + Math.sin(t * Math.PI) * amp * dir, 24, LW - 24);
      const yy = y + i * 34;
      if (!this.safeSpot(x, yy, 42)) continue;
      this.collectibles.push({ kind: "coin", x, y: yy, r: 16, phase: i * 0.4, alive: true, vx: 0, vy: 0 });
    }
  }

  private addBubbleCluster(x: number, y: number) {
    const n = randInt(3, 5);
    for (let i = 0; i < n; i++) {
      const bx = clamp(x + rand(-30, 30), 20, LW - 20);
      const by = y + rand(-40, 40);
      if (!this.safeSpot(bx, by, 24)) continue;
      // bubbles rise toward the surface (= behind the player = -y)
      this.collectibles.push({ kind: "bubble", x: bx, y: by, r: 14, phase: rand(0, TAU), alive: true, vx: rand(-6, 6), vy: -rand(12, 26), size: rand(7, 10) });
    }
  }

  private addPearl(x: number, y: number) {
    x = clamp(x, 40, LW - 40);
    if (!this.safeSpot(x, y, 34)) return;
    this.decor.push({ kind: "sprite", x, y: y - 6, sprite: makeShell(26), h: 0, phase: 0, color: "", scale: 1, flip: false });
    this.collectibles.push({ kind: "pearl", x, y: y + 4, r: 18, phase: rand(0, TAU), alive: true, vx: 0, vy: 0 });
  }

  private addFishSchool(y: number) {
    const n = randInt(5, 8);
    const school: FishSchool = {
      x: rand(60, LW - 60), y, vx: rand(25, 55) * (Math.random() < 0.5 ? -1 : 1), vy: rand(-15, 25),
      phase: rand(0, TAU), turnT: rand(1.5, 3.5), color: pick(FISH_COLORS), size: rand(6, 8.5), members: [],
    };
    for (let i = 0; i < n; i++) {
      const ox = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 16 + rand(-4, 4);
      const oy = -Math.ceil(i / 2) * 14 + rand(-4, 4);
      const c: Collectible = { kind: "fish", x: school.x + ox, y: school.y + oy, r: 14, phase: rand(0, TAU), alive: true, vx: 0, vy: 0, school, ox, oy, color: school.color, size: school.size * rand(0.85, 1.15) };
      school.members.push(c);
      this.collectibles.push(c);
    }
    this.schools.push(school);
  }

  // ------------------------------------------------------------------
  // Creatures (progressively introduced by depth)
  // ------------------------------------------------------------------
  private trySpawnCreature(dt: number, camY: number, depth: number, diff: number) {
    if (this.demo || depth < 500) return;
    this.creatureTimer -= dt;
    if (this.creatureTimer > 0) return;
    this.creatureTimer = lerp(8.5, 3.6, diff) * rand(0.8, 1.25);
    const spawnY = camY + 120;
    if (Math.abs(spawnY - this.lastWallY) < 420) return;
    const bigOnScreen = this.creatures.some((c) => BIG_KINDS.includes(c.kind) && c.y > camY - 900);
    const sharksOnScreen = this.creatures.filter((c) => c.kind === "shark").length;

    const kind = weighted<CreatureKind>([
      { item: "shark", w: sharksOnScreen >= 2 ? 0 : 5 },
      { item: "bigJelly", w: depth > 1200 && !bigOnScreen ? 2.5 : 0 },
      { item: "octopus", w: depth > 2000 && !bigOnScreen ? 3 : 0 },
      { item: "eel", w: depth > 2000 && !bigOnScreen ? 2.5 : 0 },
      { item: "manta", w: depth > 3000 && !bigOnScreen ? 2 : 0 },
      { item: "angler", w: depth > 3000 && !bigOnScreen ? 2.5 : 0 },
      { item: "serpent", w: depth > 4000 && !bigOnScreen ? 2 : 0 },
    ]);
    this.addCreature(kind, spawnY, depth, diff);
    // deep combos: a shark escort alongside a big creature
    if (depth > 4000 && kind !== "shark" && Math.random() < 0.35 + diff * 0.2) this.addCreature("shark", spawnY + 220, depth, diff);
  }

  private addCreature(kind: CreatureKind, y: number, depth: number, diff: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    let c: Creature;
    switch (kind) {
      case "shark": {
        const variant = weighted([
          { item: 0, w: 5 },
          { item: 1, w: depth > 1200 ? 3 + diff * 2 : 0 },
          { item: 2, w: depth > 3000 ? 1 + diff * 3 : 0 },
        ]);
        const len = [64, 90, 122][variant];
        c = createCreature("shark", side < 0 ? -len : LW + len, y + rand(0, 120), variant, side);
        c.vx *= 1 + diff * 0.35;
        break;
      }
      case "octopus":
        c = createCreature("octopus", rand(90, LW - 90), y, 0, side);
        break;
      case "bigJelly":
        c = createCreature("bigJelly", rand(70, LW - 70), y, 0, side);
        break;
      case "eel": {
        c = createCreature("eel", side < 0 ? 0 : LW, y, 0, side);
        // the cave rock the eel lives in
        const zone = zoneAt(depth);
        this.addRock(side < 0 ? 18 : LW - 18, y + 10, 90, 120, zone, true);
        break;
      }
      case "manta":
        c = createCreature("manta", side < 0 ? -70 : LW + 70, y, 0, side);
        break;
      case "angler":
        c = createCreature("angler", rand(70, LW - 70), y, 0, side);
        break;
      default:
        c = createCreature("serpent", side < 0 ? -40 : LW + 40, y, 0, side);
    }
    this.creatures.push(c);
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------
  update(dt: number, time: number, camY: number, H: number, playerX: number, playerY: number) {
    const depth = playerY * DEPTH_PER_UNIT;
    const diff = difficultyForDepth(depth);
    this.spawnAhead(camY);
    this.trySpawnCreature(dt, camY, depth, diff);

    for (const o of this.obstacles) {
      if (o.kind === "jelly") {
        o.phase += dt;
        o.x = o.baseX + Math.sin(o.phase * 0.9) * o.drift;
        o.y += o.vy * dt;
      }
    }

    for (const c of this.creatures) {
      const wasWarn = c.warn > 0;
      updateCreature(c, dt, playerX, playerY, camY);
      if (wasWarn && !c.warned) {
        c.warned = true;
        this.onWarning?.(c);
      }
    }

    for (const sc of this.schools) {
      sc.phase += dt;
      sc.turnT -= dt;
      if (sc.turnT <= 0) {
        sc.turnT = rand(1.5, 3.5);
        sc.vx = rand(20, 55) * (Math.random() < 0.5 ? -1 : 1);
        sc.vy = rand(-20, 30);
      }
      const d2 = dist2(sc.x, sc.y, playerX, playerY);
      if (d2 < 150 * 150) {
        const d = Math.sqrt(d2) || 1;
        sc.vx += ((sc.x - playerX) / d) * 90 * dt;
        sc.vy += ((sc.y - playerY) / d) * 60 * dt;
      }
      if ((sc.x < 40 && sc.vx < 0) || (sc.x > LW - 40 && sc.vx > 0)) sc.vx *= -1;
      sc.x += sc.vx * dt;
      sc.y += sc.vy * dt;
      const ang = Math.atan2(sc.vx, sc.vy + 30);
      for (const m of sc.members) {
        if (!m.alive) continue;
        m.x = sc.x + m.ox! + Math.sin(time * 3 + m.phase) * 3;
        m.y = sc.y + m.oy! + Math.cos(time * 2 + m.phase) * 3;
        m.vx = ang; // facing angle
      }
    }
    for (const c of this.collectibles) {
      if (c.kind === "bubble") {
        c.x += (c.vx + Math.sin(time * 2 + c.phase) * 8) * dt;
        c.y += c.vy * dt;
      }
    }
    for (const a of this.ambient) {
      a.phase += dt;
      if (a.kind === "crab") {
        a.x += a.vx * dt;
        if (Math.random() < dt * 0.5) a.vx = rand(-10, 10);
      } else {
        a.x += (a.vx + Math.sin(a.phase * 1.5) * 6) * dt;
        a.y += (a.vy + Math.cos(a.phase * 1.2) * 5) * dt;
        if (a.kind !== "ray" && (a.x < 10 || a.x > LW - 10)) a.vx *= -1;
      }
    }

    // cleanup: anything that has fallen below the bottom of the screen
    const killY = camY - H - 260;
    this.obstacles = this.obstacles.filter((o) => o.alive && o.y > killY - 120);
    this.creatures = this.creatures.filter((c) => c.alive && c.y > killY - 200 && c.x > -320 && c.x < LW + 320 && c.y < camY + 700);
    this.collectibles = this.collectibles.filter((c) => c.alive && c.y > killY);
    this.schools = this.schools.filter((s) => s.members.some((m) => m.alive) && s.y > killY);
    for (const s of this.schools) s.members = s.members.filter((m) => m.alive);
    this.decor = this.decor.filter((d) => d.y > killY - 150);
    this.ambient = this.ambient.filter((a) => a.y > killY && a.x > -80 && a.x < LW + 80);
  }
}
