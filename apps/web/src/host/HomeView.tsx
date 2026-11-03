import { useEffect, useMemo } from "react";
import type { Song } from "@karaoke-tube/shared";
import {
  Card,
  BROWSE_PRESETS,
  SAMPLE_SONGS,
  Shelf,
  ShortcutTile,
  SingWithButton,
  greeting,
  hueOf,
  songParts,
  useRoom,
  useRoomSongs,
  useSearch,
  useT,
} from "@karaoke-tube/ui";
import { useHostAdd } from "./useHostAdd";
import css from "./host.module.css";

/** Host Home: greeting, 6 shortcut tiles, popular in this room, party classics. */
export function HomeView({ onSearch }: { onSearch: () => void }) {
  const { state, me } = useRoom();
  const t = useT();
  const roomSongs = useRoomSongs(state);
  const add = useHostAdd();
  const classics = useSearch();
  const popular = useSearch();
  // Everything on Home comes from our own song catalog (by labels), most popular first.
  useEffect(() => {
    const party = BROWSE_PRESETS.find((p) => p.id === "classics")!;
    classics.browse(party.filter, { limit: 24, shuffle: true, fallbackQuery: party.query });
    popular.browse({}, { limit: 150, shuffle: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shortcuts = useMemo(() => (popular.results.length ? popular.results : SAMPLE_SONGS).slice(0, 6), [popular.results]);

  if (!state || !me) return null;
  const tint = state.nowPlaying ? `hsl(${hueOf(state.nowPlaying.song.videoId)} 45% 30%)` : "var(--kt-hover)";
  const card = (s: Song) => {
    const p = songParts(s);
    return <Card key={s.videoId} title={p.title} subtitle={p.artist} image={s.thumbnailUrl} onPlay={() => add(s)} />;
  };

  return (
    <div className={css.view} style={{ ["--tint" as string]: tint }}>
      <div className={css.wash} />
      <header className={css.viewTop}>
        <button type="button" className={css.fakeSearch} onClick={onSearch}>
          {t("search.placeholder")}
        </button>
        <SingWithButton />
      </header>
      <h1 className={css.greeting}>{greeting(undefined, t)}</h1>
      <div className={css.shortcuts}>
        {shortcuts.map((s) => (
          <ShortcutTile key={s.videoId} title={songParts(s).title} label={s.title} image={s.thumbnailUrl} onPlay={() => add(s)} />
        ))}
      </div>
      {roomSongs.length > 0 && <Shelf title={t("home.popular")}>{roomSongs.slice(0, 12).map(card)}</Shelf>}
      {classics.results.length > 0 && <Shelf title={t("home.classics")}>{classics.results.map(card)}</Shelf>}
    </div>
  );
}
