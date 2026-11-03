import type { Member, Role, Song } from "@karaoke-tube/shared";

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const s = (videoId: string, title: string, channel: string, durationSec: number): Song => ({
  videoId,
  title,
  channel,
  durationSec,
  thumbnailUrl: thumb(videoId),
});

/** About 30 believable karaoke songs. Thumbnails come from YouTube; the UI falls back to a gradient if one fails. */
export const SAMPLE_SONGS: Song[] = [
  s("fJ9rUzIMcZQ", "Queen - Bohemian Rhapsody (Karaoke Version)", "SingAlong Studio", 355),
  s("1k8craCGpgs", "Journey - Don't Stop Believin' (Karaoke Version)", "Karaoke Hits", 251),
  s("lDK9QqIzhwk", "Bon Jovi - Livin' On A Prayer (Karaoke Version)", "Karaoke Hits", 249),
  s("djV11Xbc914", "a-ha - Take On Me (Karaoke Version)", "Lyric Lounge", 226),
  s("OPf0YbXqDm0", "Mark Ronson ft. Bruno Mars - Uptown Funk (Karaoke)", "SingAlong Studio", 270),
  s("YQHsXMglC9A", "Adele - Hello (Karaoke Version)", "Lyric Lounge", 367),
  s("rYEDA3JcQqw", "Adele - Rolling in the Deep (Karaoke Version)", "Karaoke Hits", 234),
  s("JGwWNGJdvx8", "Ed Sheeran - Shape of You (Karaoke Version)", "SingAlong Studio", 263),
  s("2Vv-BfVoq4g", "Ed Sheeran - Perfect (Karaoke Version)", "Lyric Lounge", 280),
  s("lp-EO5I60KA", "Ed Sheeran - Thinking Out Loud (Karaoke)", "Karaoke Hits", 297),
  s("Zi_XLOBDo_Y", "Michael Jackson - Billie Jean (Karaoke Version)", "SingAlong Studio", 294),
  s("4fndeDfaWCg", "Backstreet Boys - I Want It That Way (Karaoke)", "Karaoke Hits", 213),
  s("ZbZSe6N_BXs", "Pharrell Williams - Happy (Karaoke Version)", "Lyric Lounge", 233),
  s("hT_nvWreIhg", "OneRepublic - Counting Stars (Karaoke Version)", "SingAlong Studio", 257),
  s("PIb6AZdTr-A", "Cyndi Lauper - Girls Just Want to Have Fun (Karaoke)", "Retro Mic", 238),
  s("btPJPFnesV4", "Survivor - Eye of the Tiger (Karaoke Version)", "Retro Mic", 245),
  s("1w7OgIMMRc4", "Guns N' Roses - Sweet Child O' Mine (Karaoke)", "Retro Mic", 356),
  s("hTWKbfoikeg", "Nirvana - Smells Like Teen Spirit (Karaoke)", "Retro Mic", 301),
  s("kXYiU_JCYtU", "Linkin Park - Numb (Karaoke Version)", "Karaoke Hits", 187),
  s("ktvTqknDobU", "Imagine Dragons - Radioactive (Karaoke Version)", "SingAlong Studio", 187),
  s("e-ORhEE9VVg", "Taylor Swift - Blank Space (Karaoke Version)", "Lyric Lounge", 232),
  s("nfWlot6h_JM", "Taylor Swift - Shake It Off (Karaoke Version)", "Lyric Lounge", 242),
  s("CevxZvSJLk8", "Katy Perry - Roar (Karaoke Version)", "SingAlong Studio", 224),
  s("09R8_2nJtjg", "Maroon 5 - Sugar (Karaoke Version)", "Karaoke Hits", 235),
  s("kJQP7kiw5Fk", "Luis Fonsi ft. Daddy Yankee - Despacito (Karaoke)", "Fiesta Karaoke", 229),
  s("pRpeEdMmmQ0", "Shakira - Waka Waka (Karaoke Version)", "Fiesta Karaoke", 211),
  s("RgKAFK5djSk", "Wiz Khalifa ft. Charlie Puth - See You Again (Karaoke)", "Karaoke Hits", 229),
  s("fLexgOxsZu0", "Bruno Mars - The Lazy Song (Karaoke Version)", "SingAlong Studio", 189),
  s("YVkUvmDQ3HY", "Eminem - Without Me (Karaoke Version)", "Karaoke Hits", 290),
  s("9bZkp7q19f0", "PSY - Gangnam Style (Karaoke Version)", "K-Pop Karaoke", 219),
  s("60ItHLz5WEA", "Alan Walker - Faded (Karaoke Version)", "SingAlong Studio", 212),
  s("dQw4w9WgXcQ", "Rick Astley - Never Gonna Give You Up (Karaoke)", "Retro Mic", 213),
];

const PEOPLE: Array<{ nickname: string; avatarSeed: string }> = [
  { nickname: "Maya", avatarSeed: "maya-1" },
  { nickname: "Leo", avatarSeed: "leo-7" },
  { nickname: "Ana", avatarSeed: "ana-3" },
  { nickname: "Kenji", avatarSeed: "kenji-2" },
  { nickname: "Priya", avatarSeed: "priya-9" },
  { nickname: "Tom", avatarSeed: "tom-4" },
  { nickname: "Zoe", avatarSeed: "zoe-5" },
];

/** Seven sample members. The first is the host, unless `meRole` is host (then the first is a co-host). */
export function sampleMembers(meRole: Role, now = Date.now()): Member[] {
  return PEOPLE.map((p, i) => ({
    id: `m-${p.nickname.toLowerCase()}`,
    nickname: p.nickname,
    avatarSeed: p.avatarSeed,
    role: i === 0 ? (meRole === "host" ? "cohost" : "host") : i === 2 ? "cohost" : "guest",
    connected: i !== 6,
    joinedAt: now - (60 - i * 5) * 60_000,
  }));
}
