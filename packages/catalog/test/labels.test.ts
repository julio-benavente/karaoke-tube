import { describe, expect, it } from "vitest";
import { buildCatalog, type ChannelConfig, type RawVideo } from "../src/build.ts";
import { filterSongs } from "../src/filter.ts";
import { createLabeler, labelCatalog, norm, type LabelData } from "../src/labels.ts";
import { loadLabelData } from "../src/load-data.ts";
import { createCatalogIndex } from "../src/search.ts";
import { DECADES, GENRES, TAGS, decadeOfYear, genreChain } from "../src/taxonomy.ts";
import type { AnyCatalog, CatalogV1 } from "../src/types.ts";

const data: LabelData = {
  artists: [
    { g: ["rock-n-roll", "oldies"], l: "en", d: "50s", a: ["Elvis Presley"] },
    { g: ["hard-rock"], l: "en", a: ["Guns N' Roses@80s", "AC/DC@70s"] },
    { g: ["reggaeton", "latin-urban"], l: "es", d: "10s", a: ["Daddy Yankee@00s"] },
  ],
  rules: {
    title: [{ re: "\\bchristmas\\b", g: ["christmas"], m: ["christmas"] }],
    artist: [],
    channel: { "Kids Karaoke Songs": { g: ["kids"], m: ["kids-family"] } },
    artistTags: [{ m: ["nostalgic"], a: ["Elvis Presley"] }],
  },
  years: { "Elvis Presley": { "Suspicious Minds": 1969 } },
  tags: { wedding: ["Elvis Presley|Can't Help Falling In Love (Karaoke Version)"] },
};
const label = createLabeler(data);

describe("Spanish and English songs share the general genres", () => {
  const shared = createLabeler({
    artists: [
      { g: ["latin-pop", "latin"], l: "es", a: ["Shakira"] },
      { g: ["bossa-nova"], l: "es", a: ["Roberto Carlos"] },
      { g: ["balada"], l: "es", replace: true, a: ["Roberto Carlos"] },
    ],
    rules: { title: [], artist: [], channel: { "Canal Español": { l: "es" } }, artistTags: [] },
    years: {},
    tags: {},
  });

  it("folds Latin pop into Pop and drops the Latin umbrella", () => {
    expect(shared({ title: "Ojos Así", artist: "Shakira", channel: "x" }).g).toEqual(["pop"]);
  });

  it("a replace group corrects an artist instead of adding to it", () => {
    expect(shared({ title: "Amigo", artist: "Roberto Carlos", channel: "x" })).toMatchObject({ g: ["balada"], l: "es" });
  });

  it("a Spanish channel gives its unlabeled songs Spanish", () => {
    expect(shared({ title: "Algo", artist: "Nadie Conocido", channel: "Canal Español" }).l).toBe("es");
  });
});

describe("taxonomy", () => {
  it("has unique, slug-shaped ids and every parent exists", () => {
    for (const list of [GENRES, DECADES, TAGS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const x of list) {
        expect(x.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(x.en && x.es).toBeTruthy();
      }
    }
    for (const g of GENRES) if (g.parent) expect(GENRES.some((p) => p.id === g.parent)).toBe(true);
  });

  it("walks up the genre tree and buckets years", () => {
    expect(genreChain("hair-metal")).toEqual(["hair-metal", "metal"]);
    expect(genreChain("pop")).toEqual(["pop"]);
    expect(decadeOfYear(1944)).toBe("40s");
    expect(decadeOfYear(1969)).toBe("60s");
    expect(decadeOfYear(2003)).toBe("00s");
    expect(decadeOfYear(2025)).toBe("20s");
  });
});

describe("the hand-written data", () => {
  it("only uses ids the taxonomy knows (createLabeler throws otherwise)", () => {
    expect(() => createLabeler(loadLabelData())).not.toThrow();
  });
});

describe("createLabeler", () => {
  it("labels from the artist, with a per-artist decade override", () => {
    expect(label({ title: "Heartbreak Hotel", artist: "Elvis Presley", channel: "x" })).toMatchObject({ g: ["rock-n-roll", "oldies"], y: 195, l: "en", m: ["nostalgic"] });
    expect(label({ title: "Sweet Child", artist: "Guns N' Roses", channel: "x" })).toMatchObject({ g: ["hard-rock"], y: 198, l: "en" });
  });

  it("finds the lead artist of a collaboration, and ignores accents/case/'the'", () => {
    expect(label({ title: "Despacito", artist: "daddy yankee ft. Justin Bieber", channel: "x" })).toMatchObject({ g: ["reggaeton", "latin-urban"], l: "es", y: 200 });
    expect(norm("Beyoncé & The Band")).toBe("beyonce and the band");
  });

  it("a song year beats the artist decade; a curated tag matches through '(…)' suffixes", () => {
    expect(label({ title: "Suspicious Minds", artist: "Elvis Presley", channel: "x" }).y).toBe(196);
    expect(label({ title: "Can't Help Falling In Love", artist: "Elvis Presley", channel: "x" }).m).toContain("wedding");
  });

  it("title and channel rules label unknown artists; derived tags follow the genre", () => {
    const xmas = label({ title: "Last Christmas", artist: "Nobody Known", channel: "x" });
    expect(xmas.g).toEqual(["christmas"]);
    expect(xmas.m).toContain("christmas");
    expect(label({ title: "Itsy", artist: null, channel: "Kids Karaoke Songs" })).toMatchObject({ g: ["kids"], m: ["kids-family"] });
    expect(label({ title: "Gasolina", artist: "Daddy Yankee", channel: "x" }).m).toContain("party");
  });

  it("leaves what it does not know unlabeled", () => {
    expect(label({ title: "???", artist: "Totally Unknown Band", channel: "x" })).toEqual({ g: [], y: 0, l: "", m: [] });
  });

  it("guesses the language of an unknown artist's title only when confident", () => {
    expect(label({ title: "Quiero bailar contigo", artist: "Nadie", channel: "x" }).l).toBe("es");
    expect(label({ title: "I love you baby", artist: "Nobody", channel: "x" }).l).toBe("en");
  });
});

const channels: ChannelConfig[] = [{ key: "sk", id: "1", title: "Sing King", order: "artist-song", priority: 100 }];
const video = (title: string, id: string, views: number): RawVideo => ({ id, channelKey: "sk", title, durationSec: 200, views, live: false, isPublic: true });
const videos = [
  video("Elvis Presley - Suspicious Minds (Karaoke Version)", "elvis000001", 9_000_000),
  video("Guns N' Roses - Paradise City (Karaoke Version)", "gnr00000001", 5_000_000),
  video("Daddy Yankee - Gasolina (Karaoke Version)", "daddy000001", 3_000_000),
  video("Nobody Known - Mystery Tune (Karaoke Version)", "nobody00001", 1_000),
];

describe("buildCatalog v2", () => {
  const { catalog } = buildCatalog(videos, channels, new Date("2026-01-01"), label);

  it("writes parallel label columns of the same length, with id dictionaries", () => {
    expect(catalog.v).toBe(2);
    const n = catalog.songs.t.length;
    expect(n).toBe(4);
    for (const col of [catalog.songs.g, catalog.songs.y, catalog.songs.l, catalog.songs.m]) expect(col).toHaveLength(n);
    expect(catalog.genres).toContain("hard-rock");
    const i = catalog.songs.t.indexOf("Suspicious Minds");
    expect(catalog.songs.g[i]!.map((x) => catalog.genres[x])).toEqual(["rock-n-roll", "oldies"]);
    expect(catalog.songs.y[i]).toBe(196);
    expect(catalog.songs.l[i]).toBe("en");
    const unknown = catalog.songs.t.indexOf("Mystery Tune");
    expect([catalog.songs.g[unknown], catalog.songs.y[unknown], catalog.songs.l[unknown], catalog.songs.m[unknown]]).toEqual([[], 0, "", []]);
  });

  it("without a labeler every song is simply unlabeled", () => {
    const plain = buildCatalog(videos, channels, new Date("2026-01-01")).catalog;
    expect(plain.v).toBe(2);
    expect(plain.songs.g.every((g) => g.length === 0)).toBe(true);
    expect(plain.genres).toEqual([]);
  });

  it("labelCatalog upgrades a v1 catalog and keeps everything else", () => {
    const v1: CatalogV1 = {
      v: 1,
      built: "2026-01-01T00:00:00.000Z",
      channels: catalog.channels,
      artists: catalog.artists,
      songs: { t: catalog.songs.t, a: catalog.songs.a, id: catalog.songs.id, d: catalog.songs.d, c: catalog.songs.c, p: catalog.songs.p },
      alts: {},
    };
    const v2 = labelCatalog(v1, label);
    expect(v2.v).toBe(2);
    expect(v2.songs.t).toEqual(v1.songs.t);
    expect(v2.songs.l).toEqual(catalog.songs.l);
  });
});

describe("filterSongs / browse", () => {
  const { catalog } = buildCatalog(videos, channels, new Date("2026-01-01"), label);
  const titles = (idx: number[]) => idx.map((i) => catalog.songs.t[i]);

  it("filters by genre (parents match sub-genres), decade, language, tags; popular first", () => {
    expect(titles(filterSongs(catalog, { genre: "rock" }))).toEqual(["Suspicious Minds", "Paradise City"]);
    expect(titles(filterSongs(catalog, { genre: "hard-rock" }))).toEqual(["Paradise City"]);
    expect(titles(filterSongs(catalog, { decade: "60s" }))).toEqual(["Suspicious Minds"]);
    expect(titles(filterSongs(catalog, { language: "es" }))).toEqual(["Gasolina"]);
    expect(titles(filterSongs(catalog, { genre: ["reggaeton", "oldies"] }))).toEqual(["Suspicious Minds", "Gasolina"]);
    expect(titles(filterSongs(catalog, { genre: "rock", decade: "80s" }))).toEqual(["Paradise City"]);
    expect(titles(filterSongs(catalog, { tag: "party" }))).toEqual(["Gasolina"]);
    expect(filterSongs(catalog, { tag: "no-such-tag" })).toEqual([]);
    expect(filterSongs(catalog, {}, 2)).toHaveLength(2);
  });

  it("the index exposes it as songs, and v1 catalogs just have no labels", () => {
    const index = createCatalogIndex(catalog);
    expect(index.hasLabels).toBe(true);
    expect(index.browse({ language: "es" })[0]?.title).toBe("Daddy Yankee - Gasolina");
    expect(index.search("gasolina")[0]?.title).toBe("Daddy Yankee - Gasolina");

    const v1: AnyCatalog = { v: 1, built: "", channels: catalog.channels, artists: catalog.artists, songs: { t: catalog.songs.t, a: catalog.songs.a, id: catalog.songs.id, d: catalog.songs.d, c: catalog.songs.c, p: catalog.songs.p }, alts: {} };
    const old = createCatalogIndex(v1);
    expect(old.hasLabels).toBe(false);
    expect(old.browse({ genre: "rock" })).toEqual([]);
    expect(old.browse({}).length).toBe(4);
    expect(old.search("gasolina")).toHaveLength(1);
  });
});
