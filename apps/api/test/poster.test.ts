import { describe, expect, it } from "vitest";
import { cleanPosterUrl } from "../src/poster";
import { guest, hostRoom, song } from "./helpers";

const DEEZER = "https://cdn-images.dzcdn.net/images/cover/5bbfab8ae2def08b9d58932b5e6121a4/300x300-000000-80-0-0.jpg";
const APPLE = "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a7/98/d8/a798d867/14UMDIM03793.rgb.jpg/300x300bb.jpg";

describe("cleanPosterUrl", () => {
  it("accepts only the two cover CDNs over https", () => {
    expect(cleanPosterUrl(DEEZER)).toBe(DEEZER);
    expect(cleanPosterUrl(APPLE)).toBe(APPLE);
    expect(cleanPosterUrl("http://cdn-images.dzcdn.net/images/cover/x/300x300.jpg")).toBeUndefined();
    expect(cleanPosterUrl("https://evil.example/pixel.gif")).toBeUndefined();
    expect(cleanPosterUrl("https://cdn-images.dzcdn.net.evil.example/x.jpg")).toBeUndefined();
    expect(cleanPosterUrl("https://cdn-images.dzcdn.net/x.jpg?track=me")).toBeUndefined();
    expect(cleanPosterUrl("javascript:alert(1)")).toBeUndefined();
    expect(cleanPosterUrl(42)).toBeUndefined();
    expect(cleanPosterUrl(undefined)).toBeUndefined();
  });
});

describe("a song's poster in the room", () => {
  it("is kept for everyone when it comes from a cover CDN, and dropped when it doesn't", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    await host.act({ type: "add_song", song: { ...song("With poster"), posterUrl: DEEZER } });
    await host.act({ type: "add_song", song: { ...song("Tracker"), posterUrl: "https://evil.example/pixel.gif" } });
    const state = await ana.client.waitForState((s) => s.upNext.length >= 1 && s.nowPlaying !== null);
    const all = [state.nowPlaying, ...state.upNext].filter(Boolean).map((i) => i!.song);
    expect(all.find((s) => s.title === "With poster")?.posterUrl).toBe(DEEZER);
    expect(all.find((s) => s.title === "Tracker")?.posterUrl).toBeUndefined();
  });
});
