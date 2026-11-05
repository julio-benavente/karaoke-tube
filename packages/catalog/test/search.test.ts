import { describe, expect, it, vi } from "vitest";
import type { SearchApi, Song } from "@karaoke-tube/shared";
import { buildCatalog, type ChannelConfig, type RawVideo } from "../src/build.ts";
import { createCatalogIndex, createCatalogIndexAsync, createCatalogSearchApi } from "../src/search";

const channels: ChannelConfig[] = [
  { key: "sk", id: "1", title: "Sing King", order: "artist-song", priority: 100 },
  { key: "kf", id: "2", title: "KaraFun", order: "song-artist", priority: 90 },
];

const SONGS: Array<[string, string, string, number]> = [
  ["sk", "Queen - Bohemian Rhapsody (Karaoke Version)", "queenrhap01", 9_000_000],
  ["sk", "Queen - Killer Queen (Karaoke Version)", "queenkill01", 2_000_000],
  ["sk", "ABBA - Dancing Queen (Karaoke Version)", "abbadanc001", 5_000_000],
  ["sk", "Journey - Don't Stop Believin' (Karaoke Version)", "journey0001", 8_000_000],
  ["kf", "Love Story - Taylor Swift | Karaoke Version | KaraFun", "taylorlove1", 7_000_000],
  ["sk", "Céline Dion - My Heart Will Go On (Karaoke Version)", "celine00001", 6_000_000],
  ["sk", "Obscure Band - Love Story (Karaoke Version)", "obscure0001", 100],
  ["sk", "Adele - Hello (Karaoke Version)", "adelehello1", 4_000_000],
];

const videos: RawVideo[] = SONGS.map(([channelKey, title, id, views]) => ({
  id,
  channelKey,
  title,
  durationSec: 240,
  views,
  live: false,
  isPublic: true,
}));
const { catalog } = buildCatalog(videos, channels, new Date("2026-01-01"));

const titles = (songs: Song[]) => songs.map((s) => s.title);

describe("artists and combined filters", () => {
  const index = createCatalogIndex(catalog);

  it("filters by artist (any case or accents) and still pages", () => {
    expect(titles(index.browse({ artist: "queen" }, 10))).toEqual(expect.arrayContaining(["Queen - Bohemian Rhapsody", "Queen - Killer Queen"]));
    expect(titles(index.browse({ artist: "queen" }, 10))).toHaveLength(2);
    expect(titles(index.browse({ artist: "CELINE DION" }))).toEqual(["Céline Dion - My Heart Will Go On"]);
    expect(index.browse({ artist: "Nobody Here" })).toEqual([]);
    expect(titles(index.browse({ artist: "queen" }, 1, 1))).toHaveLength(1);
  });

  it("narrows a text search by artist", () => {
    // 'queen' is also in 'Dancing Queen' (ABBA): the artist filter keeps only Queen's own songs.
    expect(titles(index.search("queen", 10))).toHaveLength(3);
    expect(titles(index.search("queen", 10, 0, { artist: "Queen" }))).toEqual(expect.arrayContaining(["Queen - Bohemian Rhapsody", "Queen - Killer Queen"]));
    expect(titles(index.search("queen", 10, 0, { artist: "Queen" }))).toHaveLength(2);
    expect(index.search("hello", 10, 0, { artist: "Queen" })).toEqual([]);
  });

  it("suggests artists as you type, best known first", () => {
    expect(index.artists("que")).toEqual(["Queen"]);
    expect(index.artists("adel")).toEqual(["Adele"]);
    expect(index.artists("celine d")).toEqual(["Céline Dion"]);
    expect(index.artists("zzz")).toEqual([]);
    expect(index.artists("")).toEqual([]);
  });

  it("a filtered search never falls back to YouTube", async () => {
    const remote = { search: vi.fn(), video: vi.fn(), roomInfo: vi.fn() } as unknown as SearchApi;
    const api = createCatalogSearchApi(remote, { autoLoad: false, fetchCatalog: async () => catalog });
    expect((await api.search("hello", { filter: { artist: "Queen" } })).results).toEqual([]);
    expect(remote.search).not.toHaveBeenCalled();
    await api.preload();
    expect(await api.artists?.("adel")).toEqual(["Adele"]);
  });
});

describe("paging", () => {
  const index = createCatalogIndex(catalog);

  it("search pages line up: page 1 + page 2 is the same as one bigger page, with no repeats", () => {
    const all = index.search("queen", 10);
    const pages = [...index.search("queen", 1, 0), ...index.search("queen", 1, 1), ...index.search("queen", 1, 2)];
    expect(titles(pages)).toEqual(titles(all.slice(0, 3)));
    expect(new Set(titles(pages)).size).toBe(pages.length);
    expect(index.search("queen", 5, 50)).toEqual([]); // past the end
  });

  it("browse pages line up too", () => {
    const all = index.browse({}, 8);
    const pages = [...index.browse({}, 3, 0), ...index.browse({}, 3, 3), ...index.browse({}, 3, 6)];
    expect(titles(pages)).toEqual(titles(all));
    expect(index.browse({}, 5, 100)).toEqual([]);
  });

  it("the search API only pages the catalog: later pages never ask YouTube", async () => {
    const remote = { search: vi.fn(), video: vi.fn(), roomInfo: vi.fn() } as unknown as SearchApi;
    const api = createCatalogSearchApi(remote, { autoLoad: false, fetchCatalog: async () => catalog });
    const first = await api.search("queen", { limit: 3 });
    expect(first.results).toHaveLength(3); // enough from the catalog: no YouTube
    expect(remote.search).not.toHaveBeenCalled();
    const second = await api.search("queen", { limit: 3, offset: 3 });
    expect(second.results).toEqual([]); // past the end of the catalog's matches, and still no YouTube
    expect((await api.search("zzzzqq nothing here", { limit: 3, offset: 3 })).results).toEqual([]);
    expect(remote.search).not.toHaveBeenCalled();
  });
});

describe("createCatalogIndexAsync", () => {
  it("builds in small chunks, yielding to the event loop, and answers exactly like the one-shot build", async () => {
    let turns = 0;
    const tick = setInterval(() => turns++, 0); // counts event-loop turns while the index is being built
    const async = await createCatalogIndexAsync(catalog, 2); // 8 songs in chunks of 2 → several turns
    clearInterval(tick);
    const sync = createCatalogIndex(catalog);
    expect(turns).toBeGreaterThan(0);
    for (const q of ["queen", "bohemain rapsody", "adele hel", "love story", "hotel"]) {
      expect(titles(async.search(q))).toEqual(titles(sync.search(q)));
    }
    expect(async.size).toBe(sync.size);
  });
});

describe("createCatalogIndex", () => {
  const index = createCatalogIndex(catalog);

  it("finds by title, by artist, and by both", () => {
    expect(titles(index.search("bohemian rhapsody"))).toEqual(["Queen - Bohemian Rhapsody"]);
    expect(titles(index.search("queen"))).toEqual(expect.arrayContaining(["Queen - Bohemian Rhapsody", "Queen - Killer Queen"]));
    expect(titles(index.search("abba dancing"))).toEqual(["ABBA - Dancing Queen"]);
  });

  it("forgives typos, accents, apostrophes and half-typed words", () => {
    expect(titles(index.search("bohemain rapsody"))[0]).toBe("Queen - Bohemian Rhapsody");
    expect(titles(index.search("celine dion"))[0]).toBe("Céline Dion - My Heart Will Go On");
    expect(titles(index.search("dont stop believin"))[0]).toBe("Journey - Don't Stop Believin'");
    expect(titles(index.search("hotel"))).toEqual([]);
    expect(titles(index.search("adele hel"))).toEqual(["Adele - Hello"]);
  });

  it("lists exact title matches most popular first", () => {
    const result = titles(index.search("love story"));
    expect(result).toEqual(["Taylor Swift - Love Story", "Obscure Band - Love Story"]);
  });

  it("returns nothing for blank or punctuation-only queries", () => {
    expect(index.search("")).toEqual([]);
    expect(index.search("  ?! ")).toEqual([]);
  });

  it("builds songs the screens understand", () => {
    const [song] = index.search("bohemian");
    expect(song).toEqual({
      videoId: "queenrhap01",
      title: "Queen - Bohemian Rhapsody",
      channel: "Sing King",
      durationSec: 240,
      thumbnailUrl: "https://i.ytimg.com/vi/queenrhap01/mqdefault.jpg",
    });
  });

  it("looks songs up by video id", () => {
    expect(index.byVideoId("adelehello1")?.title).toBe("Adele - Hello");
    expect(index.byVideoId("nope0000000")).toBeNull();
  });
});

function fakeRemote(over: Partial<SearchApi> = {}): SearchApi & { search: ReturnType<typeof vi.fn>; video: ReturnType<typeof vi.fn> } {
  const live: Song = { videoId: "live0000001", title: "Some Live Result", channel: "YT", durationSec: 100, thumbnailUrl: "" };
  return {
    search: vi.fn(async (query: string) => ({ query, results: [live] })),
    video: vi.fn(async () => ({ song: live })),
    roomInfo: vi.fn(async () => ({}) as never),
    ...over,
  } as never;
}

describe("createCatalogSearchApi", () => {
  const make = (remote: SearchApi, over = {}) => createCatalogSearchApi(remote, { autoLoad: false, fetchCatalog: async () => catalog, ...over });

  it("answers from the catalog without calling YouTube when it has enough", async () => {
    const remote = fakeRemote();
    const api = make(remote);
    const r = await api.search("love story");
    expect(titles(r.results).slice(0, 2)).toEqual(["Taylor Swift - Love Story", "Obscure Band - Love Story"]);
    // Two local hits is under the threshold of 3, so YouTube is asked as well and appended.
    expect(remote.search).toHaveBeenCalledTimes(1);
    expect(r.results.at(-1)!.videoId).toBe("live0000001");
  });

  it("does not ask YouTube when the catalog has 3 or more", async () => {
    const many = Array.from({ length: 5 }, (_, i): RawVideo => ({ ...videos[0]!, id: `many${String(i).padStart(7, "0")}`, title: `Band${i} - Common Word Song (Karaoke Version)` }));
    const bigger = buildCatalog(many, channels).catalog;
    const remote = fakeRemote();
    const api = createCatalogSearchApi(remote, { autoLoad: false, fetchCatalog: async () => bigger });
    const r = await api.search("common word");
    expect(r.results).toHaveLength(5);
    expect(remote.search).not.toHaveBeenCalled();
  });

  it("falls back to YouTube when the catalog finds nothing", async () => {
    const remote = fakeRemote();
    const r = await make(remote).search("zzz unknown song");
    expect(titles(r.results)).toEqual(["Some Live Result"]);
  });

  it("keeps the catalog's answer if YouTube is out of quota", async () => {
    const remote = fakeRemote({ search: vi.fn(async () => Promise.reject(new Error("search_unavailable"))) });
    const r = await make(remote).search("love story");
    expect(titles(r.results)).toEqual(["Taylor Swift - Love Story", "Obscure Band - Love Story"]);
  });

  it("passes the error on when neither has anything", async () => {
    const remote = fakeRemote({ search: vi.fn(async () => Promise.reject(new Error("search_unavailable"))) });
    await expect(make(remote).search("zzz unknown song")).rejects.toThrow("search_unavailable");
  });

  it("uses YouTube alone if the catalog can't be loaded, and doesn't hammer the download", async () => {
    const remote = fakeRemote();
    const fetchCatalog = vi.fn(async () => Promise.reject(new Error("404")));
    const api = createCatalogSearchApi(remote, { autoLoad: false, fetchCatalog });
    expect(titles((await api.search("queen")).results)).toEqual(["Some Live Result"]);
    await api.search("queen");
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
    expect(remote.search).toHaveBeenCalledTimes(2);
  });

  it("waits for a catalog that is still downloading", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const api = createCatalogSearchApi(fakeRemote(), { autoLoad: false, fetchCatalog: async () => (await gate, catalog) });
    const pending = api.search("adele hello");
    release();
    expect(titles((await pending).results)[0]).toBe("Adele - Hello");
  });

  it("gives up waiting after waitMs and uses YouTube", async () => {
    const api = createCatalogSearchApi(fakeRemote(), { autoLoad: false, waitMs: 20, fetchCatalog: () => new Promise(() => {}) });
    expect(titles((await api.search("queen")).results)).toEqual(["Some Live Result"]);
  });

  it("knows catalog videos without a network call", async () => {
    const remote = fakeRemote();
    const api = make(remote);
    await api.preload();
    expect((await api.video("adelehello1")).song.title).toBe("Adele - Hello");
    expect(remote.video).not.toHaveBeenCalled();
    expect((await api.video("unknown0001")).song.videoId).toBe("live0000001");
    expect(remote.video).toHaveBeenCalledTimes(1);
  });

  it("returns no results for a blank query without any network", async () => {
    const remote = fakeRemote();
    expect((await make(remote).search("   ")).results).toEqual([]);
    expect(remote.search).not.toHaveBeenCalled();
  });
});

describe("explicit songs", () => {
  const explicitVideos: RawVideo[] = [
    { id: "cleansong01", channelKey: "sk", title: "Queen - Bohemian Rhapsody (Karaoke Version)", durationSec: 240, views: 100, live: false, isPublic: true },
    { id: "spicysong01", channelKey: "sk", title: "Some Artist - Bad Bitch Anthem (Karaoke Version)", durationSec: 240, views: 100, live: false, isPublic: true },
  ];
  const index = createCatalogIndex(buildCatalog(explicitVideos, channels, new Date("2026-01-01")).catalog);

  it("flags songs whose title looks explicit and can filter to them", () => {
    const all = index.search("anthem");
    expect(all[0]?.explicit).toBe(true);
    expect(index.search("bohemian")[0]?.explicit).toBeUndefined();
    expect(titles(index.browse({ tag: "explicit" }))).toEqual(["Some Artist - Bad Bitch Anthem"]);
  });
});
