import { presetName, useLang, useT } from "@karaoke-tube/ui";
import { Search as SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Song } from "@karaoke-tube/shared";
import {
  Avatar,
  BROWSE_PRESETS,
  Card,
  SongArt,
  SAMPLE_SONGS,
  SingWithButton,
  Shelf,
  ShortcutTile,
  Tile,
  greeting,
  hueOf,
  presetDescription,
  songParts,
  useRoom,
  useRoomSongs,
  useSearch,
} from "@karaoke-tube/ui";
import { HomeStatus } from "../host/HomeStatus";
import { fromBrowseFilter, writeFilters } from "../catalogFilters";
import { useShell } from "./RoomShell";
import { SongSheet } from "./SongSheet";
import { useAddWithToast } from "./useAdd";
import css from "./Home.module.css";

/** G2: greeting, search bar, 6 shortcut tiles, "Popular in this room". */
export function HomeScreen() {
  const t = useT();
  const [lang] = useLang();
  const { state, me, isHost } = useRoom();
  const navigate = useNavigate();
  const { code } = useShell();
  const roomSongs = useRoomSongs(state);
  const { add, addNow, pending } = useAddWithToast();
  const [sheetSong, setSheetSong] = useState<Song | null>(null);
  const classics = useSearch();
  const popular = useSearch();

  // Everything on Home comes from our own song catalog (by labels), most popular first.
  useEffect(() => {
    const party = BROWSE_PRESETS.find((p) => p.id === "classics")!;
    classics.browse({ ...party.filter, language: lang }, { limit: 24, shuffle: true, fallbackQuery: party.query });
    popular.browse({ language: lang }, { limit: 150, shuffle: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Shortcut tiles: quick picks that aren't already in this room (those go in "Popular in this room").
  // Picked when the catalog answers, so the tiles don't reshuffle while the queue changes.
  const shortcuts = useMemo(() => {
    const inRoom = new Set(roomSongs.map((s) => s.videoId));
    const pool = popular.results.length ? popular.results : SAMPLE_SONGS; // demo mode has no catalog
    return pool.filter((s) => !inRoom.has(s.videoId)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popular.results]);

  if (!state || !me) return null;
  const tint = state.nowPlaying ? `hsl(${hueOf(state.nowPlaying.song.videoId)} 45% 30%)` : "var(--kt-hover)";

  const card = (s: Song) => {
    const p = songParts(s);
    return (
      <Card
        key={s.videoId}
        title={p.title}
        subtitle={p.artist}
        art={<SongArt song={s} radius="sm" shadow explicit={s.explicit} />}
        onClick={() => setSheetSong(s)}
        onPlay={() => add(s)}
      />
    );
  };

  return (
    <div className={css.home} style={{ ["--tint" as string]: tint }}>
      <header className={css.header}>
        <button type="button" className={css.me} onClick={() => navigate(`/r/${code}/party`)} aria-label={t("tab.party")}>
          <Avatar seed={me.avatarSeed} size={32} />
        </button>
        <button type="button" className={css.fakeSearch} onClick={() => navigate(`/r/${code}/search`)}>
          <SearchIcon size={18} aria-hidden /> {t("search.placeholder")}
        </button>
        {isHost && <SingWithButton />}
      </header>

      <h1 className={css.greeting}>
        {greeting(undefined, t)}, {me.nickname}
      </h1>

      {isHost && (
        <div className={css.status}>
          <HomeStatus />
        </div>
      )}

        <section className={css.section}>
          <div className={css.grid}>
            {shortcuts.map((s) => (
              <ShortcutTile
                key={s.videoId}
                title={songParts(s).title}
                label={s.title}
                art={<SongArt song={s} radius="none" explicit={s.explicit} />}
                onClick={() => setSheetSong(s)}
                onPlay={() => add(s)}
                playLabel={pending.includes(s.videoId) ? t("home.adding") : t("home.add")}
              />
            ))}
          </div>
          <Shelf title={t("home.byGenre")}>
            {BROWSE_PRESETS.map((p) => (
              <div key={p.id} className={css.mixCell}>
              <Tile
                id={p.id}
                title={presetName(t, p.id)}
                description={presetDescription(t, p.id)}
                color={p.color}
                onClick={() => navigate({ pathname: `/r/${code}/search`, search: `?${writeFilters(new URLSearchParams(), fromBrowseFilter(p.filter))}` })}
              />
              </div>
            ))}
          </Shelf>
          {classics.results.length > 0 && <Shelf title={t("home.classics")}>{classics.results.map(card)}</Shelf>}
        </section>

      <SongSheet song={sheetSong} onClose={() => setSheetSong(null)} onAdd={addNow} />
    </div>
  );
}
