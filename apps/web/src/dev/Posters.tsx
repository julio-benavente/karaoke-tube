import { SongCard, SongRow, SongTile } from "@karaoke-tube/ui";

/** /dev/posters: album art from the iTunes Search API for a few songs in different genres (sample data, nothing is stored). */
const ROWS = [
 {
  "genre": "pop",
  "artist": "Taylor Swift",
  "title": "Shake It Off",
  "album": "1989 (Deluxe Edition)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/a7/98/d8/a798d867-344d-2bf2-fbfe-d2d1412dcef8/14UMDIM03793.rgb.jpg/600x600bb.jpg",
  "sec": 219
 },
 {
  "genre": "rock",
  "artist": "Queen",
  "title": "Bohemian Rhapsody",
  "album": "A Night At The Opera (Deluxe Edition)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8b/0a/ea/8b0aea60-6f4a-195b-5958-cdf459c2333b/602527644271.jpg/600x600bb.jpg",
  "sec": 354
 },
 {
  "genre": "salsa",
  "artist": "Celia Cruz",
  "title": "La Vida Es un Carnaval",
  "album": "La Vida Es un Carnaval: Baile Total",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/1a/22/3b/1a223bd0-2620-fdbf-c561-f1aee5cee9eb/00602567162544.rgb.jpg/600x600bb.jpg",
  "sec": 277
 },
 {
  "genre": "reggaeton",
  "artist": "Daddy Yankee",
  "title": "Gasolina",
  "album": "Barrio Fino (Deluxe Version)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/2f/66/f0/2f66f0f1-c3c2-9dc0-8391-04804cabc8cf/24CRGIM46808.rgb.jpg/600x600bb.jpg",
  "sec": 193
 },
 {
  "genre": "country",
  "artist": "Dolly Parton",
  "title": "Jolene",
  "album": "Jolene",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0b/f8/1e/0bf81e88-de6e-aba3-9fd4-e7407bfbcc31/886445438048.jpg/600x600bb.jpg",
  "sec": 163
 },
 {
  "genre": "hip-hop",
  "artist": "Eminem",
  "title": "Lose Yourself",
  "album": "8 Mile (Music from and Inspired By the Motion Picture)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/08/23/fc/0823fcd9-cb44-695b-32bf-b3bf51d9f800/00606949351229.rgb.jpg/600x600bb.jpg",
  "sec": 322
 },
 {
  "genre": "balada",
  "artist": "Juan Gabriel",
  "title": "Amor Eterno",
  "album": "Mariachi Mexicanisimo (Instrumental)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music49/v4/a2/f2/29/a2f22949-6bd7-3e01-5f90-94b6fb016578/070367101528.jpg/600x600bb.jpg",
  "sec": 257
 },
 {
  "genre": "disney",
  "artist": "Idina Menzel",
  "title": "Let It Go",
  "album": "Frozen (Original Motion Picture Soundtrack)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/4c/5d/31/4c5d3166-3a4b-fb3c-473e-1776ff947466/13DMGIM04437.rgb.jpg/600x600bb.jpg",
  "sec": 225
 },
 {
  "genre": "disco",
  "artist": "Gloria Gaynor",
  "title": "I Will Survive",
  "album": "20th Century Masters - The Millennium Collection: The Best of Gloria Gaynor",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/33/12/df/3312dfbf-2cd2-e149-1ccb-9688e2a60980/00731454913720.rgb.jpg/600x600bb.jpg",
  "sec": 198
 },
 {
  "genre": "mexican",
  "artist": "Vicente Fernández",
  "title": "El Rey",
  "album": "Historia de un Ídolo, Vol. II",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c5/85/87/c58587d3-fb95-226b-1063-3e72b3c47132/mzi.sfllgtrf.jpg/600x600bb.jpg",
  "sec": 154
 },
 {
  "genre": "k-pop",
  "artist": "BTS",
  "title": "Dynamite (Live)",
  "album": "PERMISSION TO DANCE ON STAGE (LIVE)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/2b/f6/82/2bf682ab-f6c5-a82e-d204-306faede272e/198704579318_Cover.jpg/600x600bb.jpg",
  "sec": 197
 },
 {
  "genre": "jazz",
  "artist": "Frank Sinatra",
  "title": "Fly Me to the Moon (feat. Count Basie and His Orchestra)",
  "album": "Nothing But the Best (Remastered)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/3a/37/1a/3a371a7e-33fe-85db-0616-0c57ef26fb42/13UAEIM06265.rgb.jpg/600x600bb.jpg",
  "sec": 148
 },
 {
  "genre": "bolero",
  "artist": "Eydie Gorme & Los Panchos",
  "title": "Sabor a Mí (Remasterizado)",
  "album": "Canta en Español Con los Panchos",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ad/47/71/ad47715c-18ba-bdd4-01d3-b4f82089d472/7509900035929.jpg/600x600bb.jpg",
  "sec": 168
 },
 {
  "genre": "oldies",
  "artist": "The Platters",
  "title": "Only You (And You Alone)",
  "album": "20th Century Masters - The Millennium Series: The Best of The Platters (Remastered)",
  "art": "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/93/7e/75/937e75df-f4da-1fef-f981-c33f050d487a/00731454641425.rgb.jpg/600x600bb.jpg",
  "sec": 160
 }
] as const;

/** Real songs the cover lookup could not match (musical casts, "al estilo de" artists, live-only versions). They get the generated look. */
const NO_POSTER = [
  { artist: "Hamilton", title: "Burn", sec: 224 },
  { artist: "Les Misérables", title: "On My Own", sec: 218 },
  { artist: "Vicente Fernández", title: "A Mi Manera", sec: 245 },
  { artist: "Enanitos Verdes", title: "Tu Cárcel", sec: 232 },
  { artist: "Julio Jaramillo", title: "Nuestro Juramento", sec: 210 },
  { artist: "Hillsong", title: "The Power Of Your Love", sec: 301 },
  { artist: "Jennifer Hudson", title: "And I Am Telling You", sec: 270 },
  { artist: "Engelbert Humperdinck", title: "El Mundo", sec: 205 },
] as const;

const noPoster = (r: (typeof NO_POSTER)[number], i: number) => ({ videoId: "np" + i, title: r.artist + " - " + r.title, channel: "Karaoke Hits", durationSec: r.sec, thumbnailUrl: "" });

export function Posters() {
  const song = (r: (typeof ROWS)[number], i: number) => ({ videoId: "p" + i, title: r.artist + " - " + r.title, channel: "Karaoke Hits", durationSec: r.sec, thumbnailUrl: r.art });
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 24 } as const;
  const h2 = { fontSize: 20, fontWeight: 700, margin: "32px 0 12px" } as const;
  // Explicit songs carry a small E on the cover (the text under a tile has none). Here only Gasolina, as the example.
  const asSong = (r: (typeof ROWS)[number], i: number) => ({ ...song(r, i), explicit: r.title === "Gasolina" });
  const posterTile = (r: (typeof ROWS)[number], i: number) => <SongTile key={r.art} song={asSong(r, i)} posterUrl={r.art} />;
  const fallbackTile = (r: (typeof NO_POSTER)[number], i: number, explicit = false) => <SongTile key={"f" + i} song={{ ...noPoster(r, i), explicit }} />;
  // One grid, one shape: most songs have a poster, some don't (about 1 in 4 with Deezer alone). Interleaved so the seams show.
  const mixed = ROWS.slice(0, 8).flatMap((r, i) => [posterTile(r, i), ...(i % 2 === 1 ? [fallbackTile(NO_POSTER[(i - 1) / 2]!, i, i === 3)] : [])]);
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ ...h2, marginTop: 8 }}>Posters as cards</h2>
      <div style={grid}>{ROWS.map(posterTile)}</div>
      <h2 style={h2}>No poster found: the generated look (the fallback, always available)</h2>
      <div style={grid}>{NO_POSTER.map((r, i) => fallbackTile(r, i, i === 0))}</div>
      <h2 style={h2}>Mixed: posters and fallbacks in the same grid</h2>
      <div style={grid}>{mixed}</div>
      <h2 style={h2}>Rows: posters, then the fallback row</h2>
      <div style={{ maxWidth: 520 }}>
        {ROWS.slice(0, 4).map((r, i) => <SongRow key={r.art} song={song(r, i)} />)}
        {NO_POSTER.slice(0, 4).map((r, i) => <SongCard key={"c" + i} song={noPoster(r, i)} variant="c" />)}
      </div>
      <h2 style={h2}>Posters in the song rows</h2>
      <div style={{ maxWidth: 520 }}>{ROWS.map((r, i) => <SongRow key={r.art} song={song(r, i)} />)}</div>
    </div>
  );
}
