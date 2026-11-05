import type { ReactNode } from "react";
import type { TFn, TKey } from "./i18n/core";
import { filterPattern } from "./filterPatterns";

/**
 * Art for the one-click filter cards under "Browse all" (genres, languages, tags that have no card of their own).
 * Each one gets its own colour, its own geometric pattern (filterPatterns.tsx) and a one-line description in
 * `card.<kind>.<id>` (en.ts / es.ts). `title` is only set where the catalog name is too long for a card.
 */
type Def = { color: string; title?: { en: string; es: string } };

const FILTER_CARDS: Record<string, Def> = {
  "language:en": { color: "#1f4fa3" },
  "language:es": { color: "#c8372d" },

  "genre:country": { color: "#8f5a2a" },
  "genre:rnb": { color: "#3949ab" },
  "genre:jazz": { color: "#1b4a5e" },
  "genre:electronic": { color: "#0a9bbf" },
  "genre:oldies": { color: "#a97c2b", title: { en: "Oldies", es: "Clásicos" } },
  "genre:disney": { color: "#3d5bd9", title: { en: "Disney", es: "Disney" } },
  "genre:christmas": { color: "#b3202b" },
  "genre:gospel": { color: "#9c8420" },
  "genre:balada": { color: "#c2185b", title: { en: "Romantic ballads", es: "Baladas románticas" } },
  "genre:tropical": { color: "#ef6c00" },
  "genre:regional-mexican": { color: "#1c7a4d" },
  "genre:reggaeton": { color: "#6a1b9a" },
  "genre:punk": { color: "#d7263d" },
  "genre:metal": { color: "#26262e" },
  "genre:alternative": { color: "#3f7d5a" },
  "genre:new-wave": { color: "#2a7fb8" },
  "genre:indie": { color: "#6b8e23" },
  "genre:soul": { color: "#b0402a" },
  "genre:funk": { color: "#c77d00" },
  "genre:disco": { color: "#c0369f" },
  "genre:folk": { color: "#5d7a52" },
  "genre:blues": { color: "#1d3f8c" },
  "genre:reggae": { color: "#2e8b2e" },
  "genre:tango": { color: "#7b1a2c" },
  "genre:flamenco": { color: "#c4361b", title: { en: "Flamenco", es: "Flamenco" } },
  "genre:bossa-nova": { color: "#e0833a", title: { en: "Bossa nova", es: "Bossa nova" } },
  "genre:sertanejo": { color: "#6b7f1f" },
  "genre:soundtrack": { color: "#1a1a40", title: { en: "Movie soundtracks", es: "Bandas sonoras" } },
  "genre:tv-theme": { color: "#00838f" },
  "genre:kids": { color: "#e08600" },
  "genre:crossover": { color: "#4a4e8c" },
  "genre:chanson": { color: "#345995" },
  "genre:italian": { color: "#2b8a3e" },
  "genre:a-cappella": { color: "#5e60ce" },
  "genre:novelty": { color: "#d6336c", title: { en: "Novelty & comedy", es: "Humor y novedad" } },

  "tag:explicit": { color: "#3a3a44" },
};

export type FilterCardArt = Def & { pattern: ReactNode };
export const filterCardArt = (kind: string, id: string): FilterCardArt | undefined => {
  const def = FILTER_CARDS[`${kind}:${id}`];
  return def ? { ...def, pattern: filterPattern(kind, id) } : undefined;
};

/** The short grey line under a filter card, or undefined when there is none. */
export const filterCardDescription = (t: TFn, kind: string, id: string): string | undefined =>
  FILTER_CARDS[`${kind}:${id}`] ? t(`card.${kind}.${id}` as TKey) : undefined;
