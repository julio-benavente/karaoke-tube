import { describe, expect, it } from "vitest";
import { artistSimilarity, normalizeTitle, pickBest, prepareSong, titleSimilarity, type Candidate, type Song } from "../src/cover-match.ts";
import { deezer, itunes, splitArtwork } from "../src/cover-sources.ts";

const song = (title: string, artist: string | null): Song => {
  const r = prepareSong(title, artist);
  if (!("song" in r)) throw new Error(r.skip);
  return r.song;
};
const cand = (over: Partial<Candidate>, pos = 0): Candidate => ({ artist: "Queen", title: "Bohemian Rhapsody", album: "A Night at the Opera", image: "https://x/image/thumb/a/100x100bb.jpg", pos, ...over });

describe("prepareSong", () => {
  it("takes the artist from 'Made Popular By' and strips karaoke noise", () => {
    const s = song("Asi Fue (Made Popular By Isabel Pantoja)", null);
    expect(s.artist).toBe("Isabel Pantoja");
    expect(s.title).toBe("Asi Fue");
    expect(song("Karaoke Version - Pompeii", "Bastille").title).toBe("Pompeii");
    expect(song("A Whole New World Karaoke Lyrics Instrumental Cover Original Key A", "Aladdin").title).toBe("A Whole New World");
    expect(song("Karaoke Folsom Prison Blues", "Johnny Cash").title).toBe("Folsom Prison Blues");
  });
  it("skips songs with no artist", () => {
    expect(prepareSong("Basta Ya", null)).toEqual({ skip: "no-artist" });
  });
  it("searches the first artist and leaves brackets out of the query", () => {
    const s = song("(Sittin' On) The Dock Of The Bay", "Dionne Warwick & Gladys Knight, Elton John");
    expect(s.head).toBe("Dionne Warwick & Gladys Knight");
    expect(s.query).toBe("The Dock Of The Bay");
  });
});

describe("normalization", () => {
  it("ignores case, accents, feat., brackets, versions and & / and", () => {
    expect(normalizeTitle("Total Eclipse of the Heart - Remastered 2011")).toBe(normalizeTitle("Total Eclipse Of The Heart (Radio Version)"));
    expect(titleSimilarity("Gimme! Gimme! Gimme!", "Gimme Gimme Gimme (A Man After Midnight)")).toBeGreaterThanOrEqual(0.8);
    expect(titleSimilarity("Despacito", "Despacito feat. Daddy Yankee")).toBe(1);
    expect(artistSimilarity("Céline Dion", "Celine Dion")).toBe(1);
    expect(artistSimilarity("Simon & Garfunkel", "Simon and Garfunkel")).toBe(1);
    expect(artistSimilarity("The Carpenters", "Carpenters")).toBe(1);
    expect(artistSimilarity("Beyoncé", "Beyoncé feat. Jay-Z")).toBeGreaterThanOrEqual(0.95);
    expect(artistSimilarity("Queen", "Michael Jackson")).toBeLessThan(0.5);
  });
});

describe("pickBest", () => {
  const s = song("Bohemian Rhapsody", "Queen");
  it("rejects live, karaoke, instrumental, tribute, cover and remix versions", () => {
    for (const bad of [
      cand({ title: "Bohemian Rhapsody (Live)" }),
      cand({ album: "Live at Wembley" }),
      cand({ title: "Bohemian Rhapsody - Karaoke Version" }),
      cand({ album: "Karaoke Hits" }),
      cand({ album: "Instrumental Classics" }),
      cand({ artist: "Queen Tribute Band" }),
      cand({ album: "Lullaby Renditions of Queen" }),
      cand({ album: "Piano Tribute to Queen" }),
      cand({ title: "Bohemian Rhapsody (Remix)" }),
      cand({ title: "Bohemian Rhapsody (Made Famous By Queen)" }),
      cand({ title: "Bohemian Rhapsody (En Vivo)" }),
      cand({ title: "Bohemian Rhapsody (At The Royal Albert Hall / London, UK / April 14, 1970)" }),
      cand({ album: "Primera Fila" }),
      cand({ album: "Altos De Chavón El Concierto" }),
      cand({ album: "Reworked" }),
      cand({ title: "Bohemian Rhapsody (The Indiscriminate Mix)" }),
    ])
      expect(pickBest(s, [bad]).best, JSON.stringify(bad)).toBeNull();
  });
  it("keeps radio / album / original mixes", () => {
    expect(pickBest(s, [cand({ title: "Bohemian Rhapsody (Radio Mix)", date: "1975-10-31T12:00:00Z" })]).best).not.toBeNull();
  });
  it("allows those words when the catalog title says so", () => {
    expect(pickBest(song("Dracula (Remix)", "Tame Impala"), [cand({ artist: "Tame Impala", title: "Dracula (Remix)", album: "Dracula Remix - Single" })]).best).not.toBeNull();
    expect(pickBest(song("Live and Let Die", "Wings"), [cand({ artist: "Wings", title: "Live and Let Die", album: "Live and Let Die (Soundtrack)" })]).best).not.toBeNull();
  });
  it("requires the artist and a close title; leaves it unmatched rather than guess", () => {
    expect(pickBest(s, [cand({ artist: "Panic! at the Disco" })]).best).toBeNull();
    // a different act whose name merely contains the artist's
    expect(pickBest(song("Someone Like You", "Adele"), [cand({ artist: "Hello I'm Adele", title: "Someone Like You", album: "Someone Like You" })]).best).toBeNull();
    expect(pickBest(song("Proud Mary", "Creedence Clearwater Revival"), [cand({ artist: "Creedence Clearwater Revival Experience", title: "Proud Mary", album: "Proud Mary" })]).best).toBeNull();
    // a near-identical name is only trusted on an original album, never a compilation
    expect(pickBest(song("Proud Mary", "Creedence Clearwater Revival"), [cand({ artist: "Creedence Clearwater Revived", title: "Proud Mary", album: "The Best of Creedence (Greatest Hits)" })]).best).toBeNull();
    expect(pickBest(song("Empathy", "Alanis Morrisette"), [cand({ artist: "Alanis Morissette", title: "Empathy", album: "Under Rug Swept", date: "2002-02-26T12:00:00Z" })]).best).not.toBeNull();
    // but collaborations still match
    expect(pickBest(song("Under Pressure", "Queen"), [cand({ artist: "Queen & David Bowie", title: "Under Pressure", album: "Hot Space", date: "1982-05-21T12:00:00Z" })]).best).not.toBeNull();
    expect(pickBest(song("Under Pressure", "Queen"), [cand({ artist: "Queen + Adam Lambert", title: "Under Pressure", album: "Live Around the World" })]).best).toBeNull();
    expect(pickBest(s, [cand({ title: "Killer Queen" })]).best).toBeNull();
    expect(pickBest(s, [cand({ title: "Bohemian Rhapsody" })]).reason).toBe("");
    expect(pickBest(s, []).reason).toBe("no results");
  });
  it("prefers the original album or single over compilations, and the earliest release", () => {
    const best = pickBest(s, [
      cand({ album: "Greatest Hits", date: "1981-10-26T12:00:00Z" }, 0),
      cand({ album: "Now That's What I Call Music 50", albumArtist: "Various Artists", date: "2001-01-01T12:00:00Z" }, 1),
      cand({ album: "A Night at the Opera", date: "1975-10-31T12:00:00Z" }, 2),
      cand({ album: "A Night at the Opera (Deluxe Edition)", date: "2011-06-06T12:00:00Z" }, 3),
    ]).best;
    expect(best?.album).toBe("A Night at the Opera");
    expect(pickBest(s, [cand({ album: "Bohemian Rhapsody - Single", date: "1975-10-31T12:00:00Z" }), cand({ album: "The Platinum Collection", date: "1975-10-31T12:00:00Z" }, 1)]).best?.album).toBe("Bohemian Rhapsody - Single");
  });
  it("keeps the viable candidates so the threshold can change without re-querying", () => {
    const only = [cand({ album: "Greatest Hits", artist: "Queen + Adam Lambert" })];
    const strict = pickBest(s, only, 0.99);
    expect(strict.best).toBeNull();
    expect(strict.viable.length).toBe(1);
    expect(pickBest(s, only, 0.5).best).not.toBeNull();
  });
});

describe("source adapters", () => {
  it("parses iTunes and Deezer answers and splits the image URLs", () => {
    const it = itunes.parse({ results: [{ kind: "song", artistName: "Queen", trackName: "Bohemian Rhapsody", collectionName: "Hits", artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music1/v4/ab/cd/ef/uuid/a.jpg/100x100bb.jpg", releaseDate: "1975-10-31T12:00:00Z" }, { kind: "music-video" }] });
    expect(it).toHaveLength(1);
    expect(splitArtwork(it[0]!.image)).toEqual({ template: "https://is1-ssl.mzstatic.com/image/thumb/{p}/{size}x{size}bb.jpg", p: "Music1/v4/ab/cd/ef/uuid/a.jpg" });
    const dz = deezer.parse({ data: [{ title: "T", artist: { name: "A" }, album: { title: "X", cover_xl: "https://cdn-images.dzcdn.net/images/cover/abc123/1000x1000-000000-80-0-0.jpg" } }, { title: "Q", artist: { name: "A" }, album: { title: "Y", cover_xl: "https://cdn-images.dzcdn.net/images/cover//1000x1000-000000-80-0-0.jpg" } }] });
    expect(dz).toHaveLength(1);
    expect(splitArtwork(dz[0]!.image)).toEqual({ template: "https://cdn-images.dzcdn.net/images/cover/{p}/{size}x{size}-000000-80-0-0.jpg", p: "abc123" });
    expect(splitArtwork("https://example.com/cover.png")).toBeNull();
  });
});
