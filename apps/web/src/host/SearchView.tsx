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
  presetName,
  useRoom,
  useSearch,
  useSearchApi,
  useT,
} from "@karaoke-tube/ui";
import { useSearchUrl } from "../useSearchUrl";
import { LoadMore } from "../LoadMore";
import { useHostAdd } from "./useHostAdd";
import css from "./host.module.css";

/** Host Search: field, Browse all tiles, results with ⊕. Pasted YouTube links work too. */
export function SearchView() {
  const { state } = useRoom();
  const t = useT();
  const search = useSearch();
  const add = useHostAdd();
  const api = useSearchApi();
  const [title, setTitle] = useState<string | null>(null);
  const [linkSong, setLinkSong] = useState<Song | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkId = parseYouTubeId(search.query);

  const runPreset = (p: (typeof BROWSE_PRESETS)[number]) => {
    setTitle(p.title);
    search.setQuery(p.title, { run: false });
    search.browse(p.filter, { limit: 40, fallbackQuery: p.query, label: p.title });
  };
  useSearchUrl({ query: search.query, presetTitle: title, setQuery: (q) => search.setQuery(q), runPreset });

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

  return (
    <div className={css.view}>
      <header className={css.viewTop}>
        <label className={css.searchField}>
          <SearchIcon size={20} className={css.searchIcon} aria-hidden />
          <span className="kt-sr-only">{t("search.songs")}</span>
          <input
            ref={inputRef}
            value={search.query}
            onChange={(e) => {
              setTitle(null);
              search.setQuery(e.target.value, { run: !parseYouTubeId(e.target.value) });
            }}
            placeholder={window.matchMedia("(max-width: 820px)").matches ? t("search.placeholder") : t("search.placeholderHost")}
            type="search"
          />
          {search.query && (
            <button
              type="button"
              className={css.searchClear}
              aria-label={t("search.clear")}
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
          <h2 className={css.h2}>{t("search.browse")}</h2>
          <div className={css.tiles}>
            {BROWSE_PRESETS.map((p, i) => (
              <Tile
                key={p.id}
                title={presetName(t, p.id)}
                color={p.color}
                image={SAMPLE_SONGS[(i * 7) % SAMPLE_SONGS.length]!.thumbnailUrl}
                onClick={() => runPreset(p)}
              />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className={css.h2}>{linkId ? t("search.fromLink") : (title ?? t("search.songs.heading"))}</h2>
          {search.error ? (
            <EmptyState title={t("search.resting")}>{t("search.restingHostHint")}</EmptyState>
          ) : search.loading && !search.results.length ? (
            <p className={css.muted}>{t("search.searching")}</p>
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
                <p className={css.muted}>{t("search.noResultsHost", { query: search.resultsFor })}</p>
              )}
              {!linkId && <LoadMore search={search} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
