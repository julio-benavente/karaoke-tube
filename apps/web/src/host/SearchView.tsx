import { Link2, Search as SearchIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Song } from "@karaoke-tube/shared";
import {
  BROWSE_PRESETS,
  Chip,
  EmptyState,
  SingWithButton,
  SongRow,
  Tile,
  parseYouTubeId,
  presetDescription,
  presetName,
  useRoom,
  useSearch,
  useT,
} from "@karaoke-tube/ui";
import { useCatalogSearch } from "../useCatalogSearch";
import { LINK_MESSAGE, useLinkLookup } from "../useLinkLookup";
import { ArtistSuggestions, FilterCards, FilterChips } from "../FilterChips";
import { hasFilters } from "../catalogFilters";
import { LoadMore } from "../LoadMore";
import { PasteSheet } from "../screens/Search";
import { isPhoneLayout } from "./phone";
import { useHostAdd } from "./useHostAdd";
import css from "./host.module.css";

/** Host Search: field, Browse all tiles, results with ⊕. Pasted YouTube links work too. */
export function SearchView() {
  const { state } = useRoom();
  const t = useT();
  const search = useSearch();
  const add = useHostAdd();
  const inputRef = useRef<HTMLInputElement>(null);
  const phone = isPhoneLayout();
  const [pasteOpen, setPasteOpen] = useState(false);
  const linkId = parseYouTubeId(search.query);
  const link = useLinkLookup(linkId);

  // What you search (text, filters, category) lives in the address: Back, refresh and links keep it.
  const cs = useCatalogSearch(search);

  // Opens the paste box. (Reading the clipboard directly makes phones pop up their own "Paste" bubble.)
  const pasteFromClipboard = () => setPasteOpen(true);

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
            // autoFocus (not an effect): it focuses while the page is inserted, so the phone keyboard opens.
            autoFocus
            value={search.query}
            onChange={(e) => cs.onType(e.target.value)}
            placeholder={window.matchMedia("(max-width: 820px)").matches ? t("search.placeholder") : t("search.placeholderHost")}
            type="search"
          />
          {search.query && (
            <button
              type="button"
              className={css.searchClear}
              aria-label={t("search.clear")}
              onClick={() => cs.onType("")}
            >
              <X size={18} />
            </button>
          )}
        </label>
        {!phone && <SingWithButton />}
      </header>
      <div className={css.filterRow}>
        {/* On a phone the row looks like the guest Search: "Paste a link", then the filters (no "Sing with"). */}
        {phone && (
          <Chip icon={<Link2 size={16} />} onClick={pasteFromClipboard}>
            {t("search.paste")}
          </Chip>
        )}
        <FilterChips cs={cs} />
      </div>

      {cs.inBrowse ? (
        <>
          <section>
            <h2 className={css.h2}>{t("search.browse")}</h2>
            <div className={css.tiles}>
              {BROWSE_PRESETS.map((p) => (
                <Tile
                  key={p.id}
                  id={p.id}
                  title={presetName(t, p.id)}
                  description={presetDescription(t, p.id)}
                  color={p.color}
                  onClick={() => cs.applyPreset(p)}
                />
              ))}
            </div>
          </section>
          <FilterCards cs={cs} gridClassName={css.tiles} headingClassName={css.h2} />
        </>
      ) : (
        <section>
          <h2 className={css.h2}>{linkId ? t("search.fromLink") : t("search.songs.heading")}</h2>
          <ArtistSuggestions cs={cs} />
          {search.error ? (
            <EmptyState title={t("search.resting")}>{t("search.restingHostHint")}</EmptyState>
          ) : linkId ? (
            <div className={css.results}>
              {link.status === "loading" && (
                <p className={css.muted} role="status" data-testid="link-searching">
                  {t("search.linkSearching")}
                </p>
              )}
              {link.status !== "idle" && link.status !== "loading" && link.status !== "found" && (
                <p className={css.muted} role="alert" data-testid="link-error" data-reason={link.status}>
                  {t(LINK_MESSAGE[link.status])}
                </p>
              )}
              {link.status === "found" && <SongRow song={link.song} index={1} onAdd={() => add(link.song)} added={queued.has(link.song.videoId)} />}
            </div>
          ) : search.loading && !search.results.length ? (
            <p className={css.muted}>{t("search.searching")}</p>
          ) : (
            <div className={css.results}>
              {search.results.map((s, i) => (
                <SongRow
                  key={s.videoId + s.title}
                  song={s}
                  index={i + 1}
                  onAdd={() => add(s)}
                  added={queued.has(s.videoId)}
                />
              ))}
              {!search.loading && !search.results.length && !cs.q.trim() && hasFilters(cs.filters) && <p className={css.muted}>{t("filters.noResults")}</p>}
              {!search.loading && search.resultsFor && !search.results.length && cs.q.trim() && (
                <p className={css.muted}>{t("search.noResultsHost", { query: search.resultsFor })}</p>
              )}
              <LoadMore search={search} />
            </div>
          )}
        </section>
      )}
      <PasteSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(text) => {
          setPasteOpen(false);
          cs.onType(text);
        }}
      />
    </div>
  );
}
