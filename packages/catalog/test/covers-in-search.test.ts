import { describe, expect, it } from "vitest";
import { buildCatalog, type ChannelConfig, type RawVideo } from "../src/build.ts";
import { createCovers, type CoversFile } from "../src/covers.ts";
import { createCatalogIndex } from "../src/search";

const channels: ChannelConfig[] = [{ key: "sk", id: "1", title: "Sing King", order: "artist-song", priority: 100 }];
const raw = (id: string, title: string, views: number): RawVideo => ({ id, channelKey: "sk", title, durationSec: 240, views, live: false, isPublic: true });
const { catalog } = buildCatalog(
  [raw("queenrhap01", "Queen - Bohemian Rhapsody (Karaoke Version)", 9_000_000), raw("obscure0001", "Obscure Band - Nobody Knows (Karaoke Version)", 100)],
  channels,
  new Date("2026-01-01"),
);

/** A covers file made for `catalog`: the first song (by index) has a Deezer cover, the second none. */
function coversFor(songs: string[], covered: number): CoversFile {
  return {
    v: 1,
    built: "2026-01-02T00:00:00.000Z",
    catalogBuilt: catalog.built,
    songCount: catalog.songs.t.length,
    sources: { deezer: "https://cdn-images.dzcdn.net/images/cover/{p}/{size}x{size}-000000-80-0-0.jpg" },
    art: [{ s: "deezer", p: "abc123" }],
    c: songs.map((_, i) => (i === covered ? 0 : -1)),
  };
}

describe("posters in search results", () => {
  const covered = catalog.songs.t.findIndex((t) => t === "Bohemian Rhapsody");
  const covers = createCovers(coversFor(catalog.songs.t, covered), { built: catalog.built, songCount: catalog.songs.t.length });

  it("a song with a cover carries its poster address; one without carries none", () => {
    const index = createCatalogIndex(catalog, covers);
    const [queen] = index.search("bohemian");
    const [obscure] = index.search("nobody knows");
    expect(queen!.posterUrl).toBe("https://cdn-images.dzcdn.net/images/cover/abc123/300x300-000000-80-0-0.jpg");
    expect(obscure!.posterUrl).toBeUndefined();
  });

  it("without covers (or covers made for another catalog build) no song gets a poster", () => {
    expect(createCatalogIndex(catalog).search("bohemian")[0]!.posterUrl).toBeUndefined();
    const stale = createCovers({ ...coversFor(catalog.songs.t, covered), catalogBuilt: "1999-01-01" }, { built: catalog.built, songCount: catalog.songs.t.length });
    expect(stale).toBeNull();
    expect(createCatalogIndex(catalog, stale).search("bohemian")[0]!.posterUrl).toBeUndefined();
  });
});
