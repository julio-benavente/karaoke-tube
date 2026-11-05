import { useEffect } from "react";
import type { Song } from "@karaoke-tube/shared";
import {
  Card,
  BROWSE_PRESETS,
  Shelf,
  SingWithButton,
  SongArt,
  greeting,
  hueOf,
  songParts,
  useLang,
  useRoom,
  useSearch,
  useT,
} from "@karaoke-tube/ui";
import { HomeStatus } from "./HomeStatus";
import { useHostAdd } from "./useHostAdd";
import css from "./host.module.css";

/** Host Home: greeting, the party at a glance, party classics. The classics follow the session language and keep a fixed order. */
export function HomeView({ onSearch }: { onSearch: () => void }) {
  const { state, me } = useRoom();
  const t = useT();
  const [lang] = useLang();
  const add = useHostAdd();
  const classics = useSearch();
  // Everything on Home comes from our own song catalog (by labels), most popular first.
  useEffect(() => {
    const party = BROWSE_PRESETS.find((p) => p.id === "classics")!;
    classics.browse({ ...party.filter, language: lang }, { limit: 24, fallbackQuery: party.query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (!state || !me) return null;
  const tint = state.nowPlaying ? `hsl(${hueOf(state.nowPlaying.song.videoId)} 45% 30%)` : "var(--kt-hover)";
  const card = (s: Song) => {
    const p = songParts(s);
    return <Card key={s.videoId} title={p.title} subtitle={p.artist} art={<SongArt song={s} radius="sm" shadow explicit={s.explicit} />} onPlay={() => add(s)} />;
  };

  return (
    <div className={css.view} style={{ ["--tint" as string]: tint }}>
      <div className={css.wash} />
      <header className={`${css.viewTop} ${css.viewTopFlow}`}>
        <button type="button" className={css.fakeSearch} onClick={onSearch}>
          {t("search.placeholder")}
        </button>
        <SingWithButton />
      </header>
      <h1 className={css.greeting}>{greeting(undefined, t)}</h1>
      <HomeStatus />
      {classics.results.length > 0 && <Shelf title={t("home.classics")}>{classics.results.map(card)}</Shelf>}
    </div>
  );
}
