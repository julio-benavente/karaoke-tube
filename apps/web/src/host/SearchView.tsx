import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Song } from "@karaoke-tube/shared";
import {
  BROWSE_PRESETS,
  EmptyState,
  SAMPLE_SONGS,
  SingWithButton,
  SongRow,
  Tile,
  parseYouTubeId,
  useRoom,
  useSearch,
  useSearchApi,
} from "@karaoke-tube/ui";
import { useHostAdd } from "./useHostAdd";
import css from "./host.module.css";

/** Host Search: field, Browse all tiles, results with ⊕. Pasted YouTube links work too. */
export function SearchView() {
  const { state } = useRoom();
  const search = useSearch();
  const add = useHostAdd();
  const api = useSearchApi();
  const [title, setTitle] = useState<string | null>(null);
  const [linkSong, setLinkSong] = useState<Song | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkId = parseYouTubeId(search.query);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    setLinkSong(null);
    if (!linkId) return;
    let alive = true;
    api
      .video(linkId)
      .then((r) => alive && setLinkSong(r.song))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [linkId, api]);

  if (!state) return null;
  const queued = new Set(state.upNext.map((q) => q.song.videoId));

  const runPreset = (t: string, q: string) => {
    setTitle(t);
    search.setQuery(t, { run: false });
    search.run(q);
  };

  return (
    <div className={css.view}>
      <header className={css.viewTop}>
        <label className={css.searchField}>
          <SearchIcon size={20} className={css.searchIcon} aria-hidden />
          <span className="kt-sr-only">Search songs</span>
          <input
            ref={inputRef}
            value={search.query}
            onChange={(e) => {
              setTitle(null);
              search.setQuery(e.target.value, { run: !parseYouTubeId(e.target.value) });
            }}
            placeholder="What do you want to sing? Or paste a YouTube link"
            type="search"
          />
          {search.query && (
            <button
              type="button"
              className={css.searchClear}
              aria-label="Clear search"
              onClick={() => {
                setTitle(null);
                search.setQuery("", { run: false });
                search.run("");
              }}
            >
              <X size={18} />
            </button>
          )}
        </label>
        <SingWithButton />
      </header>

      {!search.query.trim() ? (
        <section>
          <h2 className={css.h2}>Browse all</h2>
          <div className={css.tiles}>
            {BROWSE_PRESETS.map((p, i) => (
              <Tile
                key={p.id}
                title={p.title}
                color={p.color}
                image={SAMPLE_SONGS[(i * 7) % SAMPLE_SONGS.length]!.thumbnailUrl}
                onClick={() => runPreset(p.title, p.query)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className={css.h2}>{linkId ? "From your link" : (title ?? "Songs")}</h2>
          {search.error ? (
            <EmptyState title="Search is resting">Paste a YouTube link instead.</EmptyState>
          ) : search.loading && !search.results.length ? (
            <p className={css.muted}>Searching…</p>
          ) : (
            <div className={css.results}>
              {(linkId ? (linkSong ? [linkSong] : []) : search.results).map((s, i) => (
                <SongRow
                  key={s.videoId + s.title}
                  song={s}
                  index={i + 1}
                  onAdd={() => add(s)}
                  added={queued.has(s.videoId)}
                />
              ))}
              {!search.loading && search.resultsFor && !search.results.length && (
                <p className={css.muted}>No results for "{search.resultsFor}".</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
