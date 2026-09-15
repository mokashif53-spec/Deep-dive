import { RGB, mixRGB, clamp, smoothstep } from "./utils";

/**
 * Linear depth progression. Each zone starts at `start` meters and blends
 * smoothly into the next one over TRANSITION meters. The last zone is endless.
 */
export type ZoneId = "reef" | "rocky" | "canyon" | "darkblue" | "deep" | "abyss";
export type DecorKind = "seaweed" | "coralDecor" | "glowPlant" | "shell" | "column" | "anemone" | "mushroom";

export interface ZoneDef {
  id: ZoneId;
  name: string;
  start: number;
  tint: RGB;
  tintAmount: number;
  rock: number;
  coral: number;
  ruin: number;
  wall: number;
  jelly: number;
  decor: DecorKind[];
  farColor: RGB;
  glow: boolean;
  rockStyle: ("grey" | "brown" | "dark" | "mossy" | "coral")[];
}

export const ZONES: ZoneDef[] = [
  { id: "reef", name: "CORAL REEF", start: 0, tint: [255, 200, 120], tintAmount: 0.05, rock: 2, coral: 4, ruin: 0, wall: 0, jelly: 0.6, decor: ["seaweed", "coralDecor", "coralDecor", "anemone", "shell", "mushroom"], farColor: [20, 95, 125], glow: false, rockStyle: ["coral", "coral", "mossy", "brown"] },
  { id: "rocky", name: "ROCKY REEF", start: 700, tint: [120, 110, 100], tintAmount: 0.1, rock: 4, coral: 2, ruin: 0, wall: 1, jelly: 1, decor: ["seaweed", "coralDecor", "anemone", "shell", "mushroom"], farColor: [15, 65, 100], glow: false, rockStyle: ["coral", "brown", "grey", "mossy"] },
  { id: "canyon", name: "UNDERWATER CANYON", start: 1400, tint: [70, 80, 110], tintAmount: 0.16, rock: 5, coral: 0.8, ruin: 0, wall: 4, jelly: 1, decor: ["seaweed", "shell", "glowPlant"], farColor: [10, 45, 80], glow: false, rockStyle: ["grey", "dark", "brown"] },
  { id: "darkblue", name: "DARK BLUE", start: 2200, tint: [60, 30, 140], tintAmount: 0.24, rock: 3, coral: 0.5, ruin: 0.5, wall: 1, jelly: 3, decor: ["glowPlant", "mushroom", "seaweed"], farColor: [20, 18, 65], glow: true, rockStyle: ["dark", "grey"] },
  { id: "deep", name: "DEEP OCEAN", start: 3000, tint: [10, 40, 110], tintAmount: 0.26, rock: 4, coral: 0, ruin: 3, wall: 2, jelly: 1.5, decor: ["glowPlant", "column", "mushroom", "shell"], farColor: [5, 20, 55], glow: true, rockStyle: ["dark", "grey"] },
  { id: "abyss", name: "THE ABYSS", start: 4000, tint: [0, 5, 20], tintAmount: 0.4, rock: 4, coral: 0, ruin: 2, wall: 1, jelly: 2, decor: ["glowPlant", "mushroom", "column"], farColor: [2, 8, 25], glow: true, rockStyle: ["dark"] },
];

const TRANSITION = 150;

export function zoneIndexAt(depth: number) {
  let i = 0;
  while (i < ZONES.length - 1 && depth >= ZONES[i + 1].start) i++;
  return i;
}
export function zoneAt(depth: number): ZoneDef {
  return ZONES[zoneIndexAt(depth)];
}

/** Returns current zone, next zone and blend factor (0 = fully current). */
export function zoneBlend(depth: number) {
  const idx = zoneIndexAt(depth);
  const a = ZONES[idx];
  const b = ZONES[Math.min(idx + 1, ZONES.length - 1)];
  const t = idx === ZONES.length - 1 ? 0 : smoothstep(b.start - TRANSITION, b.start, depth);
  return { a, b, t };
}

// Depth palette keyframes
const KEYS: { d: number; top: RGB; bottom: RGB }[] = [
  { d: 0, top: [40, 200, 225], bottom: [12, 130, 175] },
  { d: 700, top: [22, 160, 205], bottom: [8, 96, 152] },
  { d: 1500, top: [12, 110, 170], bottom: [6, 62, 120] },
  { d: 2400, top: [8, 66, 128], bottom: [4, 34, 86] },
  { d: 3300, top: [4, 36, 84], bottom: [2, 16, 48] },
  { d: 4500, top: [2, 18, 50], bottom: [1, 7, 24] },
  { d: 9000, top: [1, 8, 28], bottom: [0, 3, 12] },
];

export interface Palette {
  top: RGB;
  bottom: RGB;
  fog: RGB;
  far: RGB;
  light: number;
  glow: number;
  zoneName: string;
}

export function paletteAt(depth: number): Palette {
  const d = Math.max(0, depth);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].d <= d) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = clamp((d - k0.d) / (k1.d - k0.d), 0, 1);
  let top = mixRGB(k0.top, k1.top, t);
  let bottom = mixRGB(k0.bottom, k1.bottom, t);

  const { a, b, t: zt } = zoneBlend(d);
  const tint = mixRGB(a.tint, b.tint, zt);
  const amt = a.tintAmount + (b.tintAmount - a.tintAmount) * zt;
  top = mixRGB(top, tint, amt);
  bottom = mixRGB(bottom, tint, amt);
  const far = mixRGB(mixRGB(a.farColor, b.farColor, zt), bottom, 0.35);

  const light = 1 - smoothstep(500, 3000, d);
  const glowA = a.glow ? 1 : 0;
  const glowB = b.glow ? 1 : 0;
  return { top, bottom, fog: mixRGB(bottom, [0, 0, 0], 0.3), far, light, glow: glowA + (glowB - glowA) * zt, zoneName: zt > 0.5 ? b.name : a.name };
}
