/** The TV page remembers which party it is paired with, so reloading or restarting the TV keeps the screen. */
const KEY = "kt:screen";

export type PairedScreen = { code: string; key: string };

export function loadScreen(): PairedScreen | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<PairedScreen>) : null;
    return v?.code && v.key ? { code: v.code, key: v.key } : null;
  } catch {
    return null;
  }
}

export function saveScreen(s: PairedScreen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the TV works until it is reloaded
  }
}

export function clearScreen() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
