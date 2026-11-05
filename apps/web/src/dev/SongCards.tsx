import type { Song } from "@karaoke-tube/shared";
import { SongCard } from "@karaoke-tube/ui";

const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const song = (videoId: string, title: string, channel: string, durationSec: number, explicit?: boolean): Song => ({ videoId, title, channel, durationSec, thumbnailUrl: yt(videoId), explicit });

const SONGS: Song[] = [
  song("fJ9rUzIMcZQ", "Queen - Bohemian Rhapsody (Karaoke Version)", "Sing King", 359),
  song("kJQP7kiw5Fk", "Luis Fonsi - Despacito ft. Daddy Yankee (Karaoke)", "KaraFun", 229),
  song("hTWKbfoikeg", "Nirvana - Smells Like Teen Spirit (Karaoke)", "Sing King", 301),
  song("09R8_2nJtjg", "Maroon 5 - Sugar (Karaoke Version)", "Karaoke Hits", 235),
  song("YQHsXMglC9A", "Adele - Hello (Karaoke)", "Sing King", 295),
  song("CevxZvSJLk8", "Katy Perry - Roar (Karaoke)", "KaraFun", 223),
  song("pRpeEdMmmQ0", "Eminem - Lose Yourself (Karaoke, Explicit)", "Sing King", 326, true),
  song("RgKAFK5djSk", "Wiz Khalifa - See You Again ft. Charlie Puth (Karaoke Version with Backing Vocals)", "Karaoke Hits", 229),
];

/** /dev/song-cards: the song-card designs on the same grid as the Browse all cards. */
export function SongCards() {
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 24 } as const;
  const h2 = { fontSize: 20, fontWeight: 700, margin: "32px 0 12px" } as const;
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={h2}>Card: pure generated cover, duration chip</h2>
      <div style={grid}>{SONGS.map((s) => <SongCard key={s.videoId} song={s} variant="b" />)}</div>
      <h2 style={h2}>Row: compact row with initials</h2>
      <div style={{ ...grid, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>{SONGS.map((s) => <SongCard key={s.videoId} song={s} variant="c" />)}</div>
    </div>
  );
}
