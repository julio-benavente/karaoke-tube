import { describe, expect, it } from "vitest";
import { artworkUrl, createCovers, loadCovers, type CoversFile } from "../src/covers.ts";

const file: CoversFile = {
  v: 1,
  built: "2026-11-05T00:00:00.000Z",
  catalogBuilt: "2026-11-03T20:50:00.000Z",
  songCount: 4,
  sources: {
    itunes: "https://is1-ssl.mzstatic.com/image/thumb/{p}/{size}x{size}bb.jpg",
    deezer: "https://cdn-images.dzcdn.net/images/cover/{p}/{size}x{size}-000000-80-0-0.jpg",
  },
  art: [
    { s: "itunes", p: "Music1/v4/ab/cd/ef/uuid/cover.jpg" },
    { s: "deezer", p: "a1a60473e51bb722cb8b2de751b3808d" },
  ],
  c: [0, -1, 1, 0],
};
const stamp = { built: file.catalogBuilt, songCount: 4 };

describe("createCovers", () => {
  it("builds URLs at any size and returns null for songs without a cover", () => {
    const covers = createCovers(file, stamp)!;
    expect(covers.count).toBe(3);
    expect(covers.url(0, 600)).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music1/v4/ab/cd/ef/uuid/cover.jpg/600x600bb.jpg");
    expect(covers.url(2, 250)).toBe("https://cdn-images.dzcdn.net/images/cover/a1a60473e51bb722cb8b2de751b3808d/250x250-000000-80-0-0.jpg");
    expect(covers.url(0)).toContain("/300x300bb.jpg");
    expect(covers.url(1)).toBeNull();
    expect(covers.has(1)).toBe(false);
    expect(covers.url(99)).toBeNull();
  });

  it("refuses covers made for another catalog build (the app then shows its generated cards)", () => {
    expect(createCovers(file, { ...stamp, built: "2026-11-04T00:00:00.000Z" })).toBeNull();
    expect(createCovers(file, { ...stamp, songCount: 5 })).toBeNull();
    expect(createCovers({ ...file, c: [0, 0] }, stamp)).toBeNull();
  });

  it("refuses anything that is not a covers file", () => {
    expect(createCovers(null, stamp)).toBeNull();
    expect(createCovers({ v: 2 }, stamp)).toBeNull();
    expect(createCovers("<html>", stamp)).toBeNull();
  });

  it("ignores an artwork whose source has no template", () => {
    const covers = createCovers({ ...file, sources: {} }, stamp)!;
    expect(covers.url(0)).toBeNull();
    expect(covers.has(0)).toBe(false);
  });
});

describe("loadCovers", () => {
  it("loads, and checks against the catalog", async () => {
    expect((await loadCovers(stamp, { fetchFile: async () => file }))?.count).toBe(3);
    expect(await loadCovers({ ...stamp, built: "other" }, { fetchFile: async () => file })).toBeNull();
  });
  it("never throws: a missing or broken file means no covers", async () => {
    expect(await loadCovers(stamp, { fetchFile: async () => Promise.reject(new Error("404")) })).toBeNull();
  });
});

describe("artworkUrl", () => {
  it("clamps silly sizes", () => {
    expect(artworkUrl("x/{p}/{size}x{size}.jpg", "a", 5000)).toBe("x/a/1000x1000.jpg");
    expect(artworkUrl("x/{p}/{size}x{size}.jpg", "a", 1)).toBe("x/a/16x16.jpg");
  });
});
