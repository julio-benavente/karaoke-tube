import type { BrowseFilter } from "@karaoke-tube/shared";

/** "Browse all" tiles and Home genre chips. Each browses the catalog by labels (`filter`), with a text query as backup. */
export type BrowsePreset = {
  id: string;
  title: string;
  /** Sent to SearchApi.search (the API adds "karaoke") when the catalog has nothing for `filter`. */
  query: string;
  /** Catalog labels (see packages/catalog taxonomy). */
  filter: BrowseFilter;
  /** CSS colour for the tile. */
  color: string;
  /** Also shown as a Home genre chip. */
  chip?: boolean;
};

export const BROWSE_PRESETS: BrowsePreset[] = [
  { id: "pop", title: "Pop", query: "pop hits", filter: { genre: "pop" }, color: "var(--kt-tile-1)", chip: true },
  { id: "rock", title: "Rock", query: "rock anthems", filter: { genre: "rock" }, color: "var(--kt-tile-3)", chip: true },
  { id: "80s", title: "80s", query: "80s hits", filter: { decade: "80s" }, color: "var(--kt-tile-2)", chip: true },
  { id: "90s", title: "90s", query: "90s hits", filter: { decade: "90s" }, color: "var(--kt-tile-7)", chip: true },
  { id: "ballads", title: "Ballads", query: "power ballads", filter: { tag: "ballad" }, color: "var(--kt-tile-4)", chip: true },
  { id: "duets", title: "Duets", query: "duets", filter: { tag: "duet" }, color: "var(--kt-tile-8)" },
  { id: "latin", title: "Latin", query: "latin hits", filter: { genre: ["balada", "tropical", "regional-mexican", "reggaeton"] }, color: "var(--kt-tile-6)", chip: true },
  { id: "kpop", title: "K-Pop", query: "k-pop", filter: { genre: "k-pop" }, color: "var(--kt-tile-10)", chip: true },
  { id: "classics", title: "Party classics", query: "party classics", filter: { tag: "party" }, color: "var(--kt-tile-5)" },
  { id: "musicals", title: "Musicals", query: "musical songs", filter: { genre: "musical-theatre" }, color: "var(--kt-tile-11)" },
  { id: "hiphop", title: "Hip-hop", query: "hip hop", filter: { genre: "hip-hop" }, color: "var(--kt-tile-9)" },
  { id: "easy", title: "Easy to sing", query: "easy songs to sing", filter: { tag: "easy" }, color: "var(--kt-tile-12)" },
];
