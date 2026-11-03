/** "Browse all" tiles and Home genre chips. Each runs a preset search query. */
export type BrowsePreset = {
  id: string;
  title: string;
  /** Sent to SearchApi.search (the API adds "karaoke"). */
  query: string;
  /** CSS colour for the tile. */
  color: string;
  /** Also shown as a Home genre chip. */
  chip?: boolean;
};

export const BROWSE_PRESETS: BrowsePreset[] = [
  { id: "pop", title: "Pop", query: "pop hits", color: "var(--kt-tile-1)", chip: true },
  { id: "rock", title: "Rock", query: "rock anthems", color: "var(--kt-tile-3)", chip: true },
  { id: "80s", title: "80s", query: "80s hits", color: "var(--kt-tile-2)", chip: true },
  { id: "90s", title: "90s", query: "90s hits", color: "var(--kt-tile-7)", chip: true },
  { id: "ballads", title: "Ballads", query: "power ballads", color: "var(--kt-tile-4)", chip: true },
  { id: "duets", title: "Duets", query: "duets", color: "var(--kt-tile-8)" },
  { id: "latin", title: "Latin", query: "latin hits", color: "var(--kt-tile-6)", chip: true },
  { id: "kpop", title: "K-Pop", query: "k-pop", color: "var(--kt-tile-10)", chip: true },
  { id: "classics", title: "Party classics", query: "party classics", color: "var(--kt-tile-5)" },
  { id: "musicals", title: "Musicals", query: "musical songs", color: "var(--kt-tile-11)" },
  { id: "hiphop", title: "Hip-hop", query: "hip hop", color: "var(--kt-tile-9)" },
  { id: "easy", title: "Easy to sing", query: "easy songs to sing", color: "var(--kt-tile-12)" },
];
