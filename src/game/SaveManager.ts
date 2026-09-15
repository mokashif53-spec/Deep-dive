import { SAVE_KEYS } from "./constants";

/** Thin, safe wrapper around localStorage for persistent progress & settings. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) - ignore */
  }
}

export const SaveManager = {
  getBest(): number {
    return parseInt(read(SAVE_KEYS.best) ?? "0", 10) || 0;
  },
  setBest(v: number) {
    write(SAVE_KEYS.best, String(Math.floor(v)));
  },
  getMusic(): boolean {
    return read(SAVE_KEYS.music) !== "off";
  },
  setMusic(on: boolean) {
    write(SAVE_KEYS.music, on ? "on" : "off");
  },
  getSound(): boolean {
    return read(SAVE_KEYS.sound) !== "off";
  },
  setSound(on: boolean) {
    write(SAVE_KEYS.sound, on ? "on" : "off");
  },
  isTutorialDone(): boolean {
    return read(SAVE_KEYS.tutorial) === "1";
  },
  setTutorialDone() {
    write(SAVE_KEYS.tutorial, "1");
  },
};
