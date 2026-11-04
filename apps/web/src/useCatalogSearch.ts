import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { UseSearch } from "@karaoke-tube/ui";
import { BROWSE_PRESETS, parseYouTubeId } from "@karaoke-tube/ui";
import { getSearchApi } from "./session";
import { fromBrowseFilter, hasFilters, parseFilters, toBrowseFilter, writeFilters, type FilterKind, type Filters } from "./catalogFilters";

type Preset = (typeof BROWSE_PRESETS)[number];
/** Kept in the history entry: how many steps ago the Browse page was, so "← Browse" can go straight back to it. */
type NavState = { depth?: number } | null;

/**
 * What you are searching, kept in the address so Back, refresh and links all work:
 * `?q=text` and `?genre=…&decade=…&lang=…&tag=…&artist=…`. Choosing filters or a category adds a history entry
 * (Back undoes it); typing replaces the entry. Runs the search through `search` and offers artist suggestions.
 */
export function useCatalogSearch(search: UseSearch) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const filters = useMemo(() => parseFilters(params), [params]);
  const q = params.get("q") ?? "";
  const inBrowse = !q.trim() && !hasFilters(filters);
  const depth = ((location.state as NavState)?.depth ?? 0) as number;

  // The address -> the search. Skips changes we made ourselves (typing), so nothing runs twice.
  const applied = useRef<string | null>(null);
  const key = JSON.stringify([q, filters]);
  useEffect(() => {
    if (applied.current === key) return;
    applied.current = key;
    search.apply(q, toBrowseFilter(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const go = useCallback(
    (nextQ: string, nextFilters: Filters, how: "push" | "replace") => {
      const p = writeFilters(new URLSearchParams(params), nextFilters);
      p.delete("q");
      if (nextQ.trim()) p.set("q", nextQ);
      const nextKey = JSON.stringify([nextQ, nextFilters]);
      applied.current = nextKey; // we are about to run it ourselves
      navigate({ pathname: location.pathname, search: p.toString() ? `?${p}` : "" }, { replace: how === "replace", state: { depth: how === "push" ? depth + 1 : depth } satisfies NavState });
    },
    [params, navigate, location.pathname, depth],
  );

  const setFilters = useCallback(
    (next: Filters) => {
      go(q, next, "push");
      search.apply(q, toBrowseFilter(next));
    },
    [go, q, search],
  );

  const onType = useCallback(
    (value: string) => {
      // A pasted YouTube link isn't searched for: the screen shows that one song.
      if (parseYouTubeId(value)) {
        search.setQuery(value, { run: false });
        search.apply(value, undefined);
        search.run("");
      } else search.setQuery(value);
      // Leaving the Browse page for a search adds one history entry; typing on from there only replaces it.
      go(value, filters, !q.trim() && value.trim() && !hasFilters(filters) ? "push" : "replace");
    },
    [go, q, filters, search],
  );

  const toggle = useCallback(
    (kind: FilterKind, id: string) => {
      const has = filters[kind].includes(id);
      setFilters({ ...filters, [kind]: has ? filters[kind].filter((x) => x !== id) : [...filters[kind], id] });
    },
    [filters, setFilters],
  );

  const applyPreset = useCallback(
    (p: Preset) => {
      go("", fromBrowseFilter(p.filter), "push");
      search.apply("", p.filter);
      window.scrollTo({ top: 0 });
    },
    [go, search],
  );

  /** Takes the text you typed and filters to that one artist instead ("all songs by Queen"). */
  const pickArtist = useCallback(
    (name: string) => {
      const next = { ...filters, artist: [name] };
      go("", next, "push");
      search.apply("", toBrowseFilter(next));
    },
    [go, filters, search],
  );

  /** Back to the Browse page: undo the steps taken since it (or, for a link that landed here, start it fresh). */
  const backToBrowse = useCallback(() => {
    applied.current = JSON.stringify(["", { genre: [], decade: [], language: [], tag: [], artist: [] }]);
    search.apply("", undefined);
    if (depth > 0) navigate(-depth);
    else navigate({ pathname: location.pathname }, { replace: true, state: { depth: 0 } satisfies NavState });
  }, [depth, navigate, location.pathname, search]);

  // Artists matching what is typed ("Queen", "Queen Latifah"): one tap filters to their songs.
  const [artists, setArtists] = useState<string[]>([]);
  useEffect(() => {
    const text = search.query.trim();
    if (text.length < 2 || text.startsWith("http")) return setArtists([]);
    let alive = true;
    const timer = setTimeout(() => {
      getSearchApi()
        .artists?.(text, 4)
        .then((a) => alive && setArtists(a.filter((name) => !filters.artist.includes(name))))
        .catch(() => alive && setArtists([]));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search.query, filters.artist]);

  return { filters, q, inBrowse, depth, artists, setFilters, toggle, onType, applyPreset, pickArtist, backToBrowse };
}
