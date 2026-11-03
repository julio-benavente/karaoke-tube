import { Avatar, Style } from "@dicebear/core";
import bigSmile from "@dicebear/styles/big-smile.json";

// Avatar backgrounds: soft colours that read on the dark UI. Hex without '#', as DiceBear expects.
const BACKGROUNDS = ["ffd5dc", "ffdfbf", "c0aede", "d1d4f9", "b6e3f4", "ffe7a3", "c7f0d8", "f9c9e8"];

// ── Chosen avatars ("v2:" seeds) ─────────────────────────────────────────
//
// A chosen avatar travels in the contract's `avatarSeed` string as "v2:" + one base-36 digit per feature:
// hair, hair colour, skin, eyes, mouth, accessory, background (e.g. "v2:a3205b1"). The lists below are
// indexed by those digits, so their order must never change: only append.

const HAIR = [
  "bangs", "bowlCutHair", "braids", "bunHair", "curlyBob", "curlyShortHair", "froBun",
  "halfShavedHead", "mohawk", "shavedHead", "shortHair", "straightHair", "wavyBob",
] as const;
const HAIR_COLORS = ["220f00", "3a1a00", "71472d", "e2ba87", "605de4", "238d80", "d56c0c", "e9b729"];
/** Light to dark, for the skin tone row. */
export const SKIN_TONES = ["ffe4c0", "f5d7b1", "efcc9f", "e2ba87", "c99c62", "a47539", "8c5a2b", "643d19"];
const EYES = ["angry", "cheery", "confused", "normal", "sad", "sleepy", "starstruck", "winking"] as const;
const MOUTHS = ["awkwardSmile", "braces", "gapSmile", "kawaii", "openSad", "openedSmile", "teethSmile", "unimpressed"] as const;
/** Index 0 = no accessory. */
const ACCESSORIES = ["", "catEars", "clownNose", "faceMask", "glasses", "mustache", "sailormoonCrown", "sleepMask", "sunglasses"] as const;

/** The first question when picking an avatar. "any" mixes every look. */
export type AvatarLook = "girl" | "boy" | "any";

const idx = <T extends string>(list: readonly T[], names: readonly T[]) => names.map((n) => list.indexOf(n));
const LOOKS: Record<AvatarLook, { hair: number[]; accessories: number[] }> = {
  girl: {
    hair: idx(HAIR, ["braids", "bunHair", "curlyBob", "straightHair", "wavyBob", "froBun", "bangs"]),
    accessories: idx(ACCESSORIES, ["glasses", "sunglasses", "catEars", "sailormoonCrown"]),
  },
  boy: {
    hair: idx(HAIR, ["shortHair", "curlyShortHair", "mohawk", "shavedHead", "bowlCutHair", "halfShavedHead"]),
    accessories: idx(ACCESSORIES, ["glasses", "sunglasses", "mustache"]),
  },
  any: {
    hair: HAIR.map((_, i) => i),
    accessories: idx(ACCESSORIES, ["glasses", "sunglasses", "catEars", "sailormoonCrown", "mustache", "clownNose"]),
  },
};
// Only happy faces on offer (old random seeds may still use the others).
const HAPPY_EYES = idx(EYES, ["cheery", "normal", "starstruck", "winking", "sleepy"]);
const HAPPY_MOUTHS = idx(MOUTHS, ["awkwardSmile", "braces", "gapSmile", "kawaii", "openedSmile", "teethSmile"]);

type Features = { hair: number; hairColor: number; skin: number; eyes: number; mouth: number; accessory: number; bg: number };
const ORDER: (keyof Features)[] = ["hair", "hairColor", "skin", "eyes", "mouth", "accessory", "bg"];
const SIZES: Record<keyof Features, number> = {
  hair: HAIR.length,
  hairColor: HAIR_COLORS.length,
  skin: SKIN_TONES.length,
  eyes: EYES.length,
  mouth: MOUTHS.length,
  accessory: ACCESSORIES.length,
  bg: BACKGROUNDS.length,
};

function encode(f: Features): string {
  return "v2:" + ORDER.map((k) => f[k].toString(36)).join("");
}

function decode(seed: string): Features | null {
  if (!/^v2:[0-9a-z]{7}$/.test(seed)) return null;
  const f = {} as Features;
  for (const [i, k] of ORDER.entries()) {
    const n = parseInt(seed[3 + i]!, 36);
    if (n >= SIZES[k]) return null;
    f[k] = n;
  }
  return f;
}

const pick = <T,>(xs: readonly T[], rnd: () => number): T => xs[Math.floor(rnd() * xs.length)]!;

/** A random avatar for `look`. `skin` keeps a chosen skin tone (index into SKIN_TONES). */
export function randomAvatar(look: AvatarLook, skin?: number, rnd: () => number = Math.random): string {
  const l = LOOKS[look];
  return encode({
    hair: pick(l.hair, rnd),
    hairColor: Math.floor(rnd() * HAIR_COLORS.length),
    skin: skin ?? Math.floor(rnd() * SKIN_TONES.length),
    eyes: pick(HAPPY_EYES, rnd),
    mouth: pick(HAPPY_MOUTHS, rnd),
    accessory: rnd() < 0.4 ? pick(l.accessories, rnd) : 0,
    bg: Math.floor(rnd() * BACKGROUNDS.length),
  });
}

/** `count` different avatars for `look`. */
export function avatarOptions(look: AvatarLook, count: number, skin?: number): string[] {
  const out = new Set<string>();
  for (let tries = 0; out.size < count && tries < count * 20; tries++) out.add(randomAvatar(look, skin));
  return [...out];
}

/** The same avatar with another skin tone. Plain (old) seeds are returned unchanged. */
export function withSkinTone(seed: string, skin: number): string {
  const f = decode(seed);
  return f ? encode({ ...f, skin }) : seed;
}

/** Which look a chosen avatar belongs to (by its hair), or null for plain random seeds. */
export function lookOf(seed: string): AvatarLook | null {
  const f = decode(seed);
  if (!f) return null;
  if (LOOKS.girl.hair.includes(f.hair)) return "girl";
  if (LOOKS.boy.hair.includes(f.hair)) return "boy";
  return "any";
}

/** The skin tone index of a chosen avatar, or null for plain seeds. */
export function skinToneOf(seed: string): number | null {
  return decode(seed)?.skin ?? null;
}

// ── Rendering ────────────────────────────────────────────────────────────

let style: Style | null = null;
const cache = new Map<string, string>();

/** A data: URI for the avatar of `seed` (a chosen "v2:" avatar or any plain seed). Cached; safe to call during render. */
export function avatarUri(seed: string): string {
  const hit = cache.get(seed);
  if (hit) return hit;
  style ??= new Style(bigSmile as ConstructorParameters<typeof Style>[0]);
  const f = decode(seed);
  const options = f
    ? {
        seed,
        size: 96,
        hairVariant: [HAIR[f.hair]!],
        hairColor: [HAIR_COLORS[f.hairColor]!],
        skinColor: [SKIN_TONES[f.skin]!],
        eyesVariant: [EYES[f.eyes]!],
        mouthVariant: [MOUTHS[f.mouth]!],
        accessoriesProbability: f.accessory ? 100 : 0,
        ...(f.accessory ? { accessoriesVariant: [ACCESSORIES[f.accessory]!] } : {}),
        backgroundColor: [BACKGROUNDS[f.bg]!],
      }
    : { seed, size: 96, backgroundColor: BACKGROUNDS };
  const uri = new Avatar(style, options as ConstructorParameters<typeof Avatar>[1]).toDataUri();
  cache.set(seed, uri);
  return uri;
}

/**
 * A plain random seed: the placeholder avatar before someone picks one (the picker then asks its first
 * question, because `lookOf` is null for plain seeds). Chosen avatars come from `randomAvatar`.
 */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
