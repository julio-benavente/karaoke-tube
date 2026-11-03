import { Clipboard, Info, Link2, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Song } from "@karaoke-tube/shared";
import {
  BROWSE_PRESETS,
  Banner,
  Button,
  Chip,
  ChipRow,
  EmptyState,
  Sheet,
  SingWithButton,
  SongRow,
  TextField,
  Tile,
  SAMPLE_SONGS,
  parseYouTubeId,
  useRoom,
  useSearch,
  useT,
} from "@karaoke-tube/ui";
import { getSearchApi } from "../session";
import { useAddWithToast } from "./useAdd";
import css from "./Search.module.css";

/** G3 (browse) / G4 (results): search field, Browse all tiles, results with ⊕, paste a link. */
export function SearchScreen() {
  const { state, me, isHost } = useRoom();
  const t = useT();
  const search = useSearch();
  const { add, pending } = useAddWithToast();
  const [presetTitle, setPresetTitle] = useState<string | null>(null);
  const [linkSong, setLinkSong] = useState<Song | null>(null);
  const [linkState, setLinkState] = useState<"idle" | "loading" | "error">("idle");
  const [pasteOpen, setPasteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A pasted YouTube link in the search field becomes a single "From your link" result.
  const linkId = parseYouTubeId(search.query);
  useEffect(() => {
    if (!linkId) {
      setLinkSong(null);
      setLinkState("idle");
      return;
    }
    let alive = true;
    setLinkState("loading");
    getSearchApi()
      .video(linkId)
      .then((r) => alive && (setLinkSong(r.song), setLinkState("idle")))
      .catch(() => alive && setLinkState("error"));
    return () => {
      alive = false;
    };
  }, [linkId]);

  if (!state || !me) return null;

  const waitingOk = (state.pending ?? []).filter((q) => q.singerIds.includes(me.id));
  const mine = [...state.upNext.filter((q) => q.singerIds.includes(me.id)), ...waitingOk];
  const limit = state.settings.maxWaitingPerMember;
  const atLimit = !isHost && mine.length >= limit;
  const blocked = state.settings.hostsOnlyAdd && !isHost;
  const queuedIds = new Set(mine.map((q) => q.song.videoId));
  if (state.nowPlaying?.singerIds.includes(me.id)) queuedIds.add(state.nowPlaying.song.videoId);

  const onType = (q: string) => {
    setPresetTitle(null);
    if (parseYouTubeId(q)) {
      search.setQuery(q, { run: false });
      search.run("");
    } else search.setQuery(q);
  };

  const runPreset = (title: string, query: string) => {
    setPresetTitle(title);
    search.setQuery(title, { run: false });
    search.run(query);
    window.scrollTo({ top: 0 });
  };

  const clear = () => {
    setPresetTitle(null);
    search.setQuery("", { run: false });
    search.run("");
    inputRef.current?.focus();
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (parseYouTubeId(text)) return onType(text.trim());
    } catch {
      // Clipboard blocked: fall back to the paste sheet.
    }
    setPasteOpen(true);
  };

  const row = (s: Song) => (
    <SongRow
      key={s.videoId + s.title}
      song={s}
      onAdd={blocked ? undefined : () => add(s)}
      adding={pending.includes(s.videoId)}
      added={queuedIds.has(s.videoId)}
    />
  );

  const showBrowse = !search.query.trim();
  const searchUnavailable = !!search.error;

  return (
    <div className={css.page}>
      <h1 className={css.title}>{t("tab.search")}</h1>
      <div className={css.sticky}>
        <label className={css.field}>
          <SearchIcon className={css.fieldIcon} aria-hidden />
          <span className="kt-sr-only">{t("search.songs")}</span>
          <input
            ref={inputRef}
            className={css.input}
            value={search.query}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !linkId && search.run(search.query)}
            placeholder={t("search.placeholder")}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
          />
          {search.query && (
            <button type="button" className={css.clear} onClick={clear} aria-label={t("search.clear")}>
              <X />
            </button>
          )}
        </label>
        <ChipRow className={css.chips}>
          <SingWithButton />
          <Chip icon={<Link2 size={16} />} onClick={pasteFromClipboard}>
            {t("search.paste")}
          </Chip>
          {BROWSE_PRESETS.slice(0, 5).map((p) => (
            <Chip key={p.id} selected={presetTitle === p.title} onClick={() => runPreset(p.title, p.query)}>
              {p.title}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {blocked && (
        <Banner icon={<Info />}>{t("search.onlyHosts")}</Banner>
      )}
      {atLimit && (
        <Banner icon={<Info />}>
          {t("search.limit", { count: limit })}
        </Banner>
      )}

      {showBrowse ? (
        <section>
          <h2 className={css.h2}>{t("search.browse")}</h2>
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
      ) : linkId ? (
        <section>
          <h2 className={css.h2}>{t("search.fromLink")}</h2>
          {linkState === "loading" && <SkeletonRows n={1} />}
          {linkState === "error" && <p className={css.muted}>{t("search.linkError")}</p>}
          {linkSong && row(linkSong)}
        </section>
      ) : searchUnavailable ? (
        <EmptyState
          icon={<Link2 />}
          title={t("search.resting")}
          action={
            <Button variant="light" icon={<Clipboard size={18} />} onClick={pasteFromClipboard}>
              {t("search.pasteInstead")}
            </Button>
          }
        >
          {t("search.restingHint")}
        </EmptyState>
      ) : (
        <section>
          {presetTitle && <h2 className={css.h2}>{presetTitle}</h2>}
          {search.loading && !search.results.length ? (
            <SkeletonRows n={8} />
          ) : search.results.length ? (
            <div className={css.results}>{search.results.map(row)}</div>
          ) : search.resultsFor ? (
            <EmptyState icon={<SearchIcon />} title={t("search.noResults", { query: search.resultsFor })}>
              {t("search.noResultsHint")}
            </EmptyState>
          ) : (
            <SkeletonRows n={8} />
          )}
        </section>
      )}

      <PasteSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(text) => {
          setPasteOpen(false);
          onType(text);
        }}
      />
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className={css.results} aria-busy>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={css.skelRow}>
          <span className={css.skelArt} />
          <span className={css.skelText}>
            <span style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <span style={{ width: `${30 + ((i * 11) % 25)}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function PasteSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const valid = !!parseYouTubeId(text);
  return (
    <Sheet open={open} onClose={onClose} label={t("search.paste")}>
      <form
        className={css.paste}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(text.trim());
          setText("");
        }}
      >
        <h2 className={css.h2}>{t("search.paste")}</h2>
        <TextField
          label={t("search.link")}
          hideLabel
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://youtu.be/…"
          error={text && !valid ? t("search.badLink") : null}
          autoFocus
        />
        <Button type="submit" block disabled={!valid}>
          {t("search.findSong")}
        </Button>
      </form>
    </Sheet>
  );
}
