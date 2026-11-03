import { normalizeRoomCode } from "@karaoke-tube/shared";
import type { RoomInfoResponse, SearchApi, Song } from "@karaoke-tube/shared";
import { SAMPLE_SONGS } from "./sample-data";

/** Codes with special behaviour in the mock. Any other code is an open party. */
export const MOCK_CODES = {
  locked: "locked-door-party",
  ended: "party-is-over",
  missing: "no-such-party",
} as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 250 + Math.random() * 350;

function score(song: Song, words: string[]) {
  const hay = `${song.title} ${song.channel}`.toLowerCase();
  return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
}

function titleCase(q: string) {
  return q.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A SearchApi over the sample songs. Unknown queries still return results, like YouTube does. */
export function createMockSearchApi(): SearchApi {
  return {
    async search(query) {
      await wait(jitter());
      const words = query
        .toLowerCase()
        .replace(/karaoke/g, "")
        .split(/\s+/)
        .filter(Boolean);
      const ranked = SAMPLE_SONGS.map((song) => ({ song, n: score(song, words) }))
        .filter((r) => r.n > 0)
        .sort((a, b) => b.n - a.n)
        .map((r) => r.song);
      if (ranked.length < 4 && words.length) {
        // Make up a few plausible results for the query.
        const base = titleCase(query.replace(/karaoke/gi, "").trim());
        const fillers = ["- Greatest Hits Medley (Karaoke)", "- Best Of (Karaoke Version)", "- Acoustic Session (Karaoke)"];
        fillers.forEach((suffix, i) => {
          const like = SAMPLE_SONGS[(base.length * 7 + i * 5) % SAMPLE_SONGS.length]!;
          ranked.push({
            ...like,
            videoId: `${like.videoId.slice(0, 9)}f${i}`,
            title: `${base} ${suffix}`,
            channel: ["SingAlong Studio", "Karaoke Hits", "Lyric Lounge"][i]!,
          });
        });
      }
      return { query, results: ranked.slice(0, 15) };
    },
    async video(videoId) {
      await wait(jitter());
      const song = SAMPLE_SONGS.find((s) => s.videoId === videoId);
      if (song) return { song };
      return {
        song: {
          videoId,
          title: "Pasted video (Karaoke)",
          channel: "YouTube",
          durationSec: 215,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      };
    },
    async roomInfo(code): Promise<RoomInfoResponse> {
      await wait(jitter());
      const c = normalizeRoomCode(code);
      if (c === MOCK_CODES.missing) return { code: c, exists: false, locked: false, status: null };
      if (c === MOCK_CODES.ended) return { code: c, exists: true, locked: false, status: "ended" };
      return { code: c, exists: true, locked: c === MOCK_CODES.locked, status: "open" };
    },
  };
}
