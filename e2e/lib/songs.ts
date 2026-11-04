import type { Song } from "@karaoke-tube/shared";

// Songs for tests that add by message. The fake YouTube plays any video id, so these don't need to exist.
// (Tests that add through the real search use titles from the catalog instead.)
const mk = (n: string, title: string, channel = "Sing King", durationSec = 6): Song => ({
  videoId: `e2e-${n}`,
  title: `${title} (Karaoke Version)`,
  channel,
  durationSec,
  // A tiny real image, so pages that draw the cover (favorites, recaps) have something to draw.
  thumbnailUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
});

export const SONGS = {
  bohemian: mk("bohemian", "Queen - Bohemian Rhapsody"),
  believin: mk("believin", "Journey - Don't Stop Believin'"),
  uptown: mk("uptown", "Bruno Mars - Uptown Funk"),
  hello: mk("hello", "Adele - Hello"),
  takeOnMe: mk("takeonme", "a-ha - Take On Me"),
  titanium: mk("titanium", "David Guetta - Titanium"),
  mariposa: mk("mariposa", "Selena - Bidi Bidi Bom Bom"),
  longOne: mk("long", "Meat Loaf - Paradise by the Dashboard Light", "Sing King", 480),
} as const;
export type SongKey = keyof typeof SONGS;

/** Any number of distinct fake songs: `song("a")`, `song("b")`… Titles are "Song A" etc. */
export const song = (name: string, durationSec = 6): Song => mk(`song-${name.toLowerCase().replace(/\W+/g, "-")}`, `Artist - Song ${name}`, "Sing King", durationSec);
