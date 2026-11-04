import { describe, expect, it } from "vitest";
import { buildCatalog, isBlockedInMarkets, parseDuration, type ChannelConfig, type RawVideo } from "../src/build.ts";

const channels: ChannelConfig[] = [
  { key: "kf", id: "1", title: "KaraFun", order: "song-artist", priority: 95 },
  { key: "pt", id: "2", title: "Party Tyme", order: "artist-song", priority: 90 },
  { key: "mx", id: "3", title: "Mixed", order: "mixed", priority: 50 },
  { key: "pn", id: "4", title: "Piano", order: "song-artist", priority: 20 },
  { key: "kid", id: "5", title: "Kids", order: "mixed", priority: 10, exclude: "cartoons" },
];

let n = 0;
function video(channelKey: string, title: string, over: Partial<RawVideo> = {}): RawVideo {
  return { id: `v${String(++n).padStart(10, "0")}`.slice(0, 11), channelKey, title, durationSec: 200, views: 1000, live: false, isPublic: true, ...over };
}

function build(videos: RawVideo[]) {
  const { catalog, report } = buildCatalog(videos, channels, new Date("2026-01-01"));
  const songs = catalog.songs.t.map((t, i) => ({
    title: t,
    artist: catalog.songs.a[i]! >= 0 ? catalog.artists[catalog.songs.a[i]!] : null,
    id: catalog.songs.id[i]!,
    channel: catalog.channels[catalog.songs.c[i]!],
    alts: catalog.alts[i] ?? [],
  }));
  return { catalog, report, songs };
}

describe("isBlockedInMarkets", () => {
  it("blocks on a blocked list or an allowed-only list that misses a market, and on age limits", () => {
    expect(isBlockedInMarkets({ blocked: ["CA", "GB", "US"] }, {})).toBe(true);
    expect(isBlockedInMarkets({ blocked: ["RU"] }, {})).toBe(false);
    expect(isBlockedInMarkets({ allowed: ["US", "CA", "GB", "MX", "ES", "AR", "CO"] }, {})).toBe(false);
    expect(isBlockedInMarkets({ allowed: ["DE"] }, {})).toBe(true);
    expect(isBlockedInMarkets(undefined, { ytRating: "ytAgeRestricted" })).toBe(true);
    expect(isBlockedInMarkets(undefined, {})).toBe(false);
  });
});

describe("parseDuration", () => {
  it("reads ISO 8601", () => {
    expect(parseDuration("PT4M10S")).toBe(250);
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("PT45S")).toBe(45);
    expect(parseDuration(undefined)).toBe(0);
  });
});

describe("buildCatalog", () => {
  it("drops things that are not tracks", () => {
    const { songs, report } = build([
      video("kf", "Hello - Adele | Karaoke Version | KaraFun"),
      video("kf", "Hello - Adele | Karaoke Version | KaraFun #shorts", { id: "short-vid-1" }),
      video("kf", "Tiny - Artist | Karaoke Version", { durationSec: 30 }),
      video("kf", "Mega Mix - Artist | Karaoke Version", { durationSec: 3600 }),
      video("pt", "Artist - Best Songs Ever Compilation (Karaoke Version)"),
      video("pt", "Soundcheck Episode 7"),
      video("pt", "Live Thing - Artist (Karaoke Version)", { live: true }),
      video("pt", "Private Thing - Artist (Karaoke Version)", { isPublic: false }),
      video("pt", "No Embed - Artist (Karaoke Version)", { embeddable: false }),
      video("pt", "Blocked - Artist (Karaoke Version)", { unplayable: true }),
      video("kid", "Old Macdonald | Baby Cartoons - Kids Sing Alongs"),
    ]);
    expect(songs.map((s) => s.title)).toEqual(["Hello"]);
    expect(report.excluded["no karaoke wording (not a track)"]).toBe(1);
    expect(report.excluded["channel: kid"]).toBe(1);
    expect(report.excluded["embedding disabled (the player can't play it)"]).toBe(1);
    expect(report.excluded["blocked in a country we serve, or age-restricted"]).toBe(1);
  });

  it("merges the same song across channels and keeps the best version first", () => {
    const { songs, report } = build([
      video("pn", "Titanium - David Guetta ft. Sia - Piano Karaoke Instrumental", { views: 50000 }),
      video("pt", "David Guetta - Titanium (Karaoke Version)", { views: 100 }),
      video("kf", "Titanium - David Guetta ft. Sia | Karaoke Version | KaraFun", { views: 100 }),
    ]);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ title: "Titanium", channel: "KaraFun" });
    expect(songs[0]!.alts.map((a) => a[1])).toHaveLength(2);
    expect(songs[0]!.alts.map((a) => a[3]).sort()).toEqual(["", "piano"]);
    expect(report.mergedSongs).toBe(1);
  });

  it("prefers the original key over a lower or higher one on the same channel", () => {
    const { songs } = build([
      video("pt", "Adele - Skyfall (Lower Key) (Karaoke Version)", { views: 9999 }),
      video("pt", "Adele - Skyfall (Karaoke Version)", { views: 10 }),
    ]);
    expect(songs).toHaveLength(1);
    expect(songs[0]!.alts[0]![3]).toBe("lower key");
  });

  it("orders mixed channels by who is a known artist", () => {
    const { songs } = build([
      video("pt", "Adele - Hello (Karaoke Version)"),
      video("mx", "Hello - Adele (Instrumental Karaoke)", { id: "mixed-vid-1" }),
      video("mx", "Adele - Skyfall (Instrumental Karaoke)", { id: "mixed-vid-2" }),
    ]);
    expect(songs.map((s) => `${s.artist} | ${s.title}`).sort()).toEqual(["Adele | Hello", "Adele | Skyfall"]);
  });

  it("settles an unknown-artist mixed title from the same song on another channel", () => {
    const { songs } = build([
      video("kf", "Mammy Blue - Jose Merce | Karaoke Version | KaraFun"),
      video("mx", "Mammy Blue - Jose Merce (KARAOKE)", { id: "mixed-vid-1" }),
    ]);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ artist: "Jose Merce", title: "Mammy Blue" });
  });

  it("sorts most popular first and stores artists once", () => {
    const { catalog, songs } = build([
      video("pt", "Adele - Quiet Song (Karaoke Version)", { views: 10 }),
      video("pt", "Adele - Big Hit (Karaoke Version)", { views: 10_000_000 }),
      video("pt", "Queen - Medium (Karaoke Version)", { views: 5000 }),
    ]);
    expect(songs.map((s) => s.title)).toEqual(["Big Hit", "Medium", "Quiet Song"]);
    expect(catalog.artists.sort()).toEqual(["Adele", "Queen"]);
    expect(catalog.songs.p[0]).toBeGreaterThan(catalog.songs.p[2]!);
    expect(new Set(Object.values(catalog.songs).map((col) => col.length)).size).toBe(1);
  });

  it("keeps a song whose title has no artist", () => {
    const { songs } = build([video("pt", "Mandy chorus (karaoke version)")]);
    expect(songs[0]).toMatchObject({ artist: null, title: "Mandy chorus" });
  });
});
