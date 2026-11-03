import type { Recap, RecapPerformance } from "@karaoke-tube/shared";

export const recapUrl = (id: string) => `${location.origin}/recap/${id}`;

/** Performances a member sang (for a group song, the one who started it), with the cheers they got. */
export function songsOf(recap: Recap, memberId: string): RecapPerformance[] {
  return recap.performances.filter((p) => (p.item.everyone ? p.item.addedBy === memberId : p.item.singerIds.includes(memberId)));
}

export const cheersOf = (recap: Recap, memberId: string) => songsOf(recap, memberId).reduce((n, p) => n + p.cheers, 0);

export const singerCount = (recap: Recap) => new Set(recap.performances.flatMap((p) => (p.item.everyone ? [p.item.addedBy] : p.item.singerIds))).size;

export type ShareResult = "shared" | "copied" | "failed";

/** The Web Share sheet when the device has one, otherwise the link goes to the clipboard. */
export async function shareRecap(recap: Recap): Promise<ShareResult> {
  const url = recapUrl(recap.id);
  const data = { title: "Our karaoke night", text: "Look what we did at karaoke night!", url };
  try {
    if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data);
      return "shared";
    }
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return "failed"; // they closed the sheet
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
