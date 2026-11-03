import { presetName, useT } from "@karaoke-tube/ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Song } from "@karaoke-tube/shared";
import {
  Avatar,
  BROWSE_PRESETS,
  Card,
  Chip,
  ChipRow,
  SAMPLE_SONGS,
  Shelf,
  ShortcutTile,
  greeting,
  hueOf,
  songParts,
  useRoom,
  useRoomSongs,
  useSearch,
} from "@karaoke-tube/ui";
import { useShell } from "./RoomShell";
import { SongSheet } from "./SongSheet";
import { useAddWithToast } from "./useAdd";
import css from "./Home.module.css";

const GENRES = BROWSE_PRESETS.filter((p) => p.chip);

/** G2: greeting, genre chips, 6 shortcut tiles, "Popular in this room". */
export function HomeScreen() {
  const t = useT();
  const { state, me } = useRoom();
  const navigate = useNavigate();
  const { code } = useShell();
  const roomSongs = useRoomSongs(state);
  const { add, pending } = useAddWithToast();
  const [sheetSong, setSheetSong] = useState<Song | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const genreSearch = useSearch();
  const classics = useSearch();
  const popular = useSearch();

  const preset = GENRES.find((g) => g.id === genre);
  useEffect(() => {
    if (preset) genreSearch.browse(preset.filter, { limit: 30, fallbackQuery: preset.query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.id]);
  // Everything on Home comes from our own song catalog (by labels), most popular first.
  useEffect(() => {
    const party = BROWSE_PRESETS.find((p) => p.id === "classics")!;
    classics.browse(party.filter, { limit: 24, shuffle: true, fallbackQuery: party.query });
    popular.browse({}, { limit: 150, shuffle: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        image={s.thumbnailUrl}
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
        <ChipRow className={css.chips}>
          <Chip selected={!genre} onClick={() => setGenre(null)}>
            All
          </Chip>
          {GENRES.map((g) => (
            <Chip key={g.id} selected={genre === g.id} onClick={() => setGenre(genre === g.id ? null : g.id)}>
              {presetName(t, g.id)}
            </Chip>
          ))}
        </ChipRow>
      </header>

      <h1 className={css.greeting}>
        {greeting(undefined, t)}, {me.nickname}
      </h1>

      {preset ? (
        <section className={css.section}>
          {genreSearch.loading && !genreSearch.results.length ? (
            <div className={css.grid}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={css.skeleton} />
              ))}
            </div>
          ) : (
            <div className={css.grid}>
              {genreSearch.results.slice(0, 6).map((s) => (
                <ShortcutTile
                  key={s.videoId}
                  title={songParts(s).title}
                  label={s.title}
                  image={s.thumbnailUrl}
                  onClick={() => setSheetSong(s)}
                  onPlay={() => add(s)}
                />
              ))}
            </div>
          )}
          <Shelf title={t("home.more", { title: presetName(t, preset.id) })}>{genreSearch.results.slice(6).map(card)}</Shelf>
        </section>
      ) : (
        <section className={css.section}>
          <div className={css.grid}>
            {shortcuts.map((s) => (
              <ShortcutTile
                key={s.videoId}
                title={songParts(s).title}
                label={s.title}
                image={s.thumbnailUrl}
                onClick={() => setSheetSong(s)}
                onPlay={() => add(s)}
                playLabel={pending.includes(s.videoId) ? t("home.adding") : t("home.add")}
              />
            ))}
          </div>
          {roomSongs.length > 0 && <Shelf title={t("home.popular")}>{roomSongs.slice(0, 12).map(card)}</Shelf>}
          {classics.results.length > 0 && <Shelf title={t("home.classics")}>{classics.results.map(card)}</Shelf>}
        </section>
      )}

      <SongSheet song={sheetSong} onClose={() => setSheetSong(null)} onAdd={add} />
    </div>
  );
}
