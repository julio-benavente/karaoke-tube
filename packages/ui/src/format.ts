import type { Member, QueueItem, Song } from "@karaoke-tube/shared";
import { makeT, type TFn } from "./i18n/core";

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const NOISE =
  /\s*[([](?:official\s*)?(?:karaoke|instrumental|lyrics?|with lyrics|karaoke version|karaoke with lyrics|version|hd|4k)[^)\]]*[)\]]|\s*-\s*instrumental karaoke$/gi;

/**
 * Split a karaoke video title into song and artist: "Queen - Bohemian Rhapsody (Karaoke Version)"
 * → { title: "Bohemian Rhapsody", artist: "Queen" }. Falls back to the channel as artist.
 */
export function songParts(song: Song): { title: string; artist: string } {
  const clean = song.title.replace(NOISE, "").replace(/\s*\(karaoke\)$/i, "").trim();
  const dash = clean.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { artist: dash[0]!.trim(), title: dash.slice(1).join(" - ").trim() };
  return { title: clean, artist: song.channel };
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function greeting(date = new Date(), t: TFn = makeT("en")): string {
  const h = date.getHours();
  if (h < 5) return t("greeting.night");
  if (h < 12) return t("greeting.morning");
  if (h < 18) return t("greeting.afternoon");
  return t("greeting.evening");
}

/** Extract a YouTube video id from a pasted link (watch, youtu.be, shorts, embed) or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return url.pathname.slice(1, 12) || null;
    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v.slice(0, 11);
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
      if (m) return m[1]!;
    }
  } catch {
    // not a URL
  }
  return null;
}

/** Avatar seeds of everyone who sings an item (a duet has two or more), in singing order. Unknown members are skipped. */
export function singerSeeds(item: Pick<QueueItem, "singerIds">, members: Pick<Member, "id" | "avatarSeed">[]): string[] {
  return item.singerIds.flatMap((id) => {
    const m = members.find((x) => x.id === id);
    return m ? [m.avatarSeed] : [];
  });
}

/** Who sings an item: "Ana", "Ana & Ben", "Ana, Ben & Cy", or "Everyone" for a group song. */
export function singerLabel(item: Pick<QueueItem, "singerIds" | "everyone">, members: Pick<Member, "id" | "nickname">[], meId?: string, t: TFn = makeT("en")): string {
  if (item.everyone) return t("singer.everyone");
  // "You" goes first: "You & Ben".
  const ids = meId && item.singerIds.includes(meId) ? [meId, ...item.singerIds.filter((id) => id !== meId)] : item.singerIds;
  const names = ids.map((id) => (id === meId ? t("singer.you") : (members.find((m) => m.id === id)?.nickname ?? t("singer.someone"))));
  const and = ` ${t("singer.and")} `;
  if (names.length <= 2) return names.join(and);
  return `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}`;
}
