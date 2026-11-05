import { useEffect, useState } from "react";
import type { Song } from "@karaoke-tube/shared";
import { useHideExplicit, useSearchApi } from "@karaoke-tube/ui";

/** Where a pasted YouTube link is: being looked up, found, or why it can't be offered. */
export type LinkLookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; song: Song }
  | { status: "not_found" | "not_embeddable" | "hidden" | "offline" };

/**
 * Looks up the video of a pasted link (`videoId` from parseYouTubeId; null = nothing pasted). The API tells a video that
 * doesn't exist (`not_found`) from one that exists but can't be played here (`not_embeddable`); `hidden` is an explicit
 * video in a room that hides them.
 */
export function useLinkLookup(videoId: string | null): LinkLookup {
  const api = useSearchApi();
  const hideExplicit = useHideExplicit();
  const [result, setResult] = useState<LinkLookup>({ status: "idle" });

  useEffect(() => {
    if (!videoId) return setResult({ status: "idle" });
    let alive = true;
    setResult({ status: "loading" });
    api
      .video(videoId)
      .then((r) => alive && setResult({ status: "found", song: r.song }))
      .catch((e: unknown) => {
        if (!alive) return;
        const code = (e as { code?: string } | null)?.code;
        setResult({ status: code === "not_embeddable" ? "not_embeddable" : code === "not_found" || code === "bad_request" ? "not_found" : "offline" });
      });
    return () => {
      alive = false;
    };
  }, [videoId, api]);

  return result.status === "found" && hideExplicit && result.song.explicit ? { status: "hidden" } : result;
}

/** The i18n key of the message for a lookup that found nothing. */
export const LINK_MESSAGE = {
  not_found: "search.linkNotFound",
  not_embeddable: "search.linkNotEmbeddable",
  hidden: "search.linkHidden",
  offline: "search.linkOffline",
} as const;
