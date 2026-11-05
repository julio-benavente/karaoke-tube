import { describe, expect, it } from "vitest";
import { artistKey, orient, parseTitle, tidyCase, titleKey, type Order } from "../src/parse.ts";

/** [raw title, channel order, expected artist, expected song]. Titles are real ones from the collected channels. */
const CASES: Array<[string, Order, string | null, string]> = [
  // artist - song (Sing King, Party Tyme, Karaoke Instrumental)
  ["Trace Adkins - Honky Tonk Badonkadonk (Karaoke Version)", "artist-song", "Trace Adkins", "Honky Tonk Badonkadonk"],
  ["'Next To Normal' - I Miss The Mountains (Karaoke Version)", "artist-song", "Next To Normal", "I Miss The Mountains"],
  ["Céline Dion - It's All Coming Back To Me Now - Karaoke Instrumental - Lower", "artist-song", "Céline Dion", "It's All Coming Back To Me Now"],
  ["Los Piojos - Bicho De Ciudad - karaoke Instrumental - Bajo", "artist-song", "Los Piojos", "Bicho De Ciudad"],
  ["Casi Normales - No Hay Manual (Anibal Vecchio) - Karaoke Instrumental", "artist-song", "Casi Normales", "No Hay Manual (Anibal Vecchio)"],
  ["Abba - Don't Shut Me Down - Karaoke Instrumental - Male", "artist-song", "Abba", "Don't Shut Me Down"],

  // song - artist (KaraFun, Piano Karaoke, My All Time Karaoke)
  ["Smooth (Dance Mix) - Rob Thomas & Santana | Karaoke Version | KaraFun", "song-artist", "Rob Thomas & Santana", "Smooth (Dance Mix)"],
  ["Black Sheep - Scott Pilgrim vs. The World (Metric) | Karaoke Version | KaraFun", "song-artist", "Scott Pilgrim vs. The World (Metric)", "Black Sheep"],
  ["Voulez-vous (version française) - Mamma Mia! (musical) | Karaoke Version | KaraFun", "song-artist", "Mamma Mia! (musical)", "Voulez-vous (version française)"],
  ["It Don't Mean a Thing (If It Ain't Got That Swing) - Ella Fitzgerald | Karaoke Version | KaraFun", "song-artist", "Ella Fitzgerald", "It Don't Mean a Thing (If It Ain't Got That Swing)"],
  ["I Love You Always Forever (LOWER -3) - Donna Lewis - Piano Karaoke Instrumental", "song-artist", "Donna Lewis", "I Love You Always Forever"],
  ["Titanium -  David Guetta ft. Sia - Piano Karaoke Instrumental", "song-artist", "David Guetta ft. Sia", "Titanium"],

  // Stingray: "in the style of" and "Song : Artist"
  ["Fidelity in the style of Regina Spektor karaoke video", "artist-song", "Regina Spektor", "Fidelity"],
  ["Complicated (Radio Version) in the style of Avril Lavigne | Karaoke with Lyrics", "artist-song", "Avril Lavigne", "Complicated (Radio Version)"],
  ['You Are The Sunshine Of My Life in the Style of "Stevie Wonder" with lyrics (no lead vocal)', "artist-song", "Stevie Wonder", "You Are The Sunshine Of My Life"],
  ["IDGAF : Dua Lipa | Karaoke with Lyrics", "artist-song", "Dua Lipa", "IDGAF"],
  ["Luke Combs - Six Feet Apart (Karaoke with Lyrics)", "artist-song", "Luke Combs", "Six Feet Apart"],

  // Vocal Star and Sing2Piano: boilerplate and promo text
  ["Cliff Richard - Just A Little Bit Too Late | With Lyrics HD Vocal-Star Karaoke 4K", "artist-song", "Cliff Richard", "Just A Little Bit Too Late"],
  ["Aretha Franklin - I Say a Little Prayer (Karaoke Studio Version) (Vocal Guide)", "artist-song", "Aretha Franklin", "I Say a Little Prayer"],
  ["Girls Aloud - The Show (Karaoke Studio Version) with Lyrics On Screen", "artist-song", "Girls Aloud", "The Show"],
  ["The Beatles - Now And Then (Karaoke Piano) 🎄 Green Screen Yourself Into Video via @Sing2Minis🕺", "artist-song", "The Beatles", "Now And Then"],
  ['Lorde - Royals (Piano Karaoke) 🎤 "And we\'ll never be royals"', "artist-song", "Lorde", "Royals"],

  // Vocal Star brand text and vocal notes, hashtag that is the title
  ["Major Lazer Feat. Justin Bieber and MØ - Cold Water (Karaoke Version) with Lyrics HD Vocal-Star", "artist-song", "Major Lazer Feat. Justin Bieber and MØ", "Cold Water"],
  ["Carly Rae Jepsen - Higher (Karaoke Version) Lyrics HD Vocal-Star Karaoke", "artist-song", "Carly Rae Jepsen", "Higher"],
  ["Thorn in My Side - Eurythmics KARAOKE Without Backing Vocals", "song-artist", "Eurythmics", "Thorn in My Side"],
  ["B52's - Meet the Flintstones with lead vocals (Karaoke Version) with Lyrics HD Vocal-Star Karaoke", "artist-song", "B52's", "Meet the Flintstones"],
  ["The Chainsmokers - #Selfie (Karaoke Version)", "artist-song", "The Chainsmokers", "#Selfie"],

  // "Song Karaoke | Artist Karaoke Version" is song-first even in a channel that is mostly artist-first
  ["Mr. Roboto Karaoke | Styx Karaoke Version", "artist-song", "Styx", "Mr. Roboto"],
  ["We're On The Ball Karaoke | Ant and Dec Karaoke Version", "artist-song", "Ant and Dec", "We're On The Ball"],
  ["Waiting On A Miracle Karaoke - Stephanie Beatriz Encanto Instrumental Lower Higher Male Original Key", "artist-song", "Stephanie Beatriz Encanto", "Waiting On A Miracle"],
  ["BB King - Is You Is Or Is You Ain't Karaoke Song With Lyrics Vocal-Star Karaoke Version", "artist-song", "BB King", "Is You Is Or Is You Ain't"],
  ["Carly Rae Jepsen - Higher (Karaoke Version) Lyrics HD Vocal-Star Karaoke", "artist-song", "Carly Rae Jepsen", "Higher"],

  // Karaoke All Keys / KaraokeMedia
  ["Madison Beer - Make You Mine Karaoke Instrumental Lower Higher Male & Original Key", "artist-song", "Madison Beer", "Make You Mine"],
  ["Hold On Karaoke - Justin Bieber Instrumental Lower Higher Female Original Key", "song-artist", "Justin Bieber", "Hold On"],
  ["Frank Sinatra - A Mi Manera LETRA (INSTRUMENTAL KARAOKE)", "artist-song", "Frank Sinatra", "A Mi Manera"],
  ["Sara Montiel - La Violetera LETRA (INSTRUMENTAL KARAOKE) ISRC: ES54I0326973", "artist-song", "Sara Montiel", "La Violetera"],
  ["La abeja Maya (Karaoke) | Instrumental y letra", "artist-song", null, "La abeja Maya"],

  // CurtainUp (musicals)
  ['"Gimme Gimme" (Lower Key) from Thoroughly Modern Millie (E Major) - Karaoke Track with Lyrics', "song-artist", "Thoroughly Modern Millie", "Gimme Gimme"],
  ['"The Wizard and I" (Cynthia Erivo Film Version) from Wicked - Karaoke Track with Lyrics on Screen', "song-artist", "Wicked", "The Wizard and I (Cynthia Erivo Film Version)"],
  ["I'm Here - The Color Purple (Karaoke Short)  #musical #broadway #thecolorpurple #karaoke #singalong", "song-artist", "The Color Purple", "I'm Here"],
  ["Say My Name (You Sing Lydia Karaoke) – Beetlejuice | Sing With Me", "song-artist", "Beetlejuice", "Say My Name"],
  ['"Don\'t Lose Ur Head" (Karaoke) – Six: The Musical | Lyrics on Screen', "song-artist", "Six: The Musical", "Don't Lose Ur Head"],

  // Things that must survive
  // Karaoke Rudissimo: "(Version Karaoke Profesional)" with a bracket missing or the text cut off
  ["Amar Y Querer - José José (Version Karaoke Profesional)", "song-artist", "José José", "Amar Y Querer"],
  ["Si Tú Supieras - Alejándro Fernández Version Karaoke Profesional)", "song-artist", "Alejándro Fernández", "Si Tú Supieras"],
  ["Oh Que Será - Jose Feliciano (Version Karaoke Profesional", "song-artist", "Jose Feliciano", "Oh Que Será"],
  ["Mi Viejo - Felipe Pirela (Version Karaoke Profesion", "song-artist", "Felipe Pirela", "Mi Viejo"],
  ["Cariño Malo - Tony Vega (Version Karaoke (Balada) Profesional)", "song-artist", "Tony Vega", "Cariño Malo"],
  ["Skeleton Key - Artist (Karaoke Version)", "song-artist", "Artist", "Skeleton Key"],
  ["Rock & Roll - Led Zeppelin (Karaoke Version)", "song-artist", "Led Zeppelin", "Rock & Roll"],
  ["No - Meghan Trainor (Karaoke Version)", "song-artist", "Meghan Trainor", "No"],
  ["Me - Artist | Karaoke Version", "song-artist", "Artist", "Me"],
  ["Piano Man - Billy Joel (Karaoke Version)", "song-artist", "Billy Joel", "Piano Man"],
];

describe("parseTitle + orient", () => {
  it.each(CASES)("%s", (raw, order, artist, title) => {
    const o = orient(parseTitle(raw), order);
    expect({ artist: o.artist, title: o.title }).toEqual({ artist, title });
  });

  it("fixes ALL CAPS titles when the channel is flagged, and not otherwise", () => {
    const shouty = parseTitle("THE MAN WHO CAN'T BE MOVED - THE SCRIPT (karaoke version)");
    expect(orient(shouty, "song-artist", undefined, { tidy: true })).toMatchObject({ artist: "The Script", title: "The Man Who Can't Be Moved" });
    expect(orient(shouty, "song-artist")).toMatchObject({ artist: "THE SCRIPT" });
  });

  it("Stingray's 'Song: Artist | Karaoke with lyrics' splits on the colon when asked to", () => {
    expect(parseTitle("Control: Janet Jackson | Karaoke with lyrics", { colonSplit: true }).segments).toEqual(["Control", "Janet Jackson"]);
    expect(parseTitle("The Beatles: Let It Be | Karaoke with Lyrics (with lead vocal)", { colonSplit: true }).segments).toEqual(["The Beatles", "Let It Be"]);
    // Off by default: a colon inside a lone title is just punctuation.
    expect(parseTitle("Mission: Impossible Theme (Karaoke Version)").segments).toEqual(["Mission: Impossible Theme"]);
  });

  it("Karaoke All Keys' 'Song Karaoke Artist Instrumental ...' uses the word Karaoke as the separator when asked to", () => {
    const p = parseTitle("Love It When You Hate Me Karaoke Avril Lavigne ft. Blackbear Instrumental Lower Higher Original Key", { karaokeSplit: true });
    expect(p.segments).toEqual(["Love It When You Hate Me", "Avril Lavigne ft. Blackbear"]);
    expect(p.ordered).toBe("song-first");
    // A title that is only boilerplate after Karaoke isn't split.
    expect(parseTitle("Hello Karaoke Instrumental Lower", { karaokeSplit: true }).segments).toEqual(["Hello"]);
  });

  it("a title with no separator has no artist", () => {
    expect(orient(parseTitle("Every Breath You Take karaoke"), "mixed")).toMatchObject({ artist: null, title: "Every Breath You Take" });
  });

  it("mixed channels use who has been seen as an artist", () => {
    const known = new Set(["adele"]);
    const score = (n: string) => (known.has(n.toLowerCase()) ? 1 : 0);
    // Same shape, opposite order: the known artist decides.
    expect(orient(parseTitle("Adele - Skyfall (Karaoke Piano)"), "mixed", score)).toMatchObject({ artist: "Adele", title: "Skyfall" });
    expect(orient(parseTitle("Skyfall - Adele (Piano Karaoke)"), "mixed", score)).toMatchObject({ artist: "Adele", title: "Skyfall" });
    expect(orient(parseTitle("Skyfall - Unknown Artist"), "mixed", score).certain).toBe(false);
  });

  it("keeps a dash inside a title", () => {
    expect(orient(parseTitle("Rock 'n' Roll - Part 2 - Gary Glitter (Karaoke Version)"), "song-artist")).toMatchObject({
      artist: "Gary Glitter",
      title: "Rock 'n' Roll - Part 2",
    });
  });
});

describe("variants", () => {
  it.each([
    ["Titanium - David Guetta - Piano Karaoke Instrumental", "piano"],
    ["I Love You Always Forever (LOWER -3) - Donna Lewis - Piano Karaoke Instrumental", "piano, lower key"],
    ["Not About Angels (HIGHER +3) - Birdy - Piano Karaoke Instrumental", "piano, higher key"],
    ["Madison Beer - Make You Mine Karaoke Instrumental Lower Higher Male & Original Key", ""],
    ["Naked Karaoke - FINNEAS Instrumental Lower Higher Female Original Key", ""],
    ["Girls Aloud - The Show (Karaoke Studio Version) (Vocal Guide)", "vocal guide"],
    ["Trace Adkins - Honky Tonk Badonkadonk (Karaoke Version)", ""],
  ])("%s", (raw, variant) => {
    expect(parseTitle(raw).variant).toBe(variant);
  });
});

describe("keys for finding duplicates", () => {
  it("ignores accents, punctuation, 'The' and featured artists", () => {
    expect(artistKey("The Beatles")).toBe("beatles");
    expect(artistKey("Rob Thomas & Santana")).toBe("rob thomas");
    expect(artistKey("David Guetta ft. Sia")).toBe("david guetta");
    expect(artistKey("Céline Dion")).toBe("celine dion");
    expect(titleKey("GDFR (feat. Sage The Gemini and Lookas)")).toBe(titleKey("GDFR"));
    expect(titleKey("Don't Stop Believin'")).toBe(titleKey("Dont Stop Believin"));
  });
});

describe("tidyCase", () => {
  it("fixes ALL CAPS only", () => {
    expect(tidyCase("THE MAN WHO CAN'T BE MOVED")).toBe("The Man Who Can't Be Moved");
    expect(tidyCase("ABBA")).toBe("Abba");
    expect(tidyCase("Abba")).toBe("Abba");
    expect(tidyCase("AC/DC and friends")).toBe("AC/DC and friends");
  });
});
