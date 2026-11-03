import { Avatar, Style } from "@dicebear/core";
import bigSmile from "@dicebear/styles/big-smile.json";

// Avatar backgrounds: soft colours that read on the dark UI. Hex without '#', as DiceBear expects.
const BACKGROUNDS = ["ffd5dc", "ffdfbf", "c0aede", "d1d4f9", "b6e3f4", "ffe7a3", "c7f0d8", "f9c9e8"];

let style: Style | null = null;
const cache = new Map<string, string>();

/** A data: URI for the avatar of `seed`. Cached; safe to call during render. */
export function avatarUri(seed: string): string {
  const hit = cache.get(seed);
  if (hit) return hit;
  style ??= new Style(bigSmile as ConstructorParameters<typeof Style>[0]);
  const uri = new Avatar(style, { seed, size: 96, backgroundColor: BACKGROUNDS }).toDataUri();
  cache.set(seed, uri);
  return uri;
}

/** A fresh random seed for "re-roll". */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
