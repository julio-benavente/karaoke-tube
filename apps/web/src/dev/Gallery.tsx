import { useMemo, useState } from "react";
import { Home, ListMusic, PartyPopper, Search, X } from "lucide-react";
import {
  ActionList,
  Avatar,
  AvatarStack,
  Banner,
  BottomTabs,
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Logo,
  MiniPlayer,
  Pill,
  PlayerBar,
  ProgressBar,
  QueueRow,
  RoomProvider,
  SAMPLE_SONGS,
  Sheet,
  Shelf,
  ShortcutTile,
  SongRow,
  Spinner,
  TextField,
  Tile,
  Toggle,
  ToastProvider,
  createMockRoomClient,
  createMockSearchApi,
  useReactions,
  useRoom,
  useToast,
} from "@karaoke-tube/ui";
import { REACTION_EMOJI } from "@karaoke-tube/shared";
import css from "./Gallery.module.css";

/** /dev/ui: every shared component against the mock room, for eyeballing. */
export function Gallery() {
  const client = useMemo(
    () => createMockRoomClient({ identity: { nickname: "Julio", avatarSeed: "julio" }, role: "host", simulate: true }),
    [],
  );
  const search = useMemo(() => createMockSearchApi(), []);
  return (
    <RoomProvider client={client} search={search}>
      <ToastProvider offset={140}>
        <GalleryBody />
      </ToastProvider>
    </RoomProvider>
  );
}

function GalleryBody() {
  const { state, me, status, send } = useRoom();
  const { recent, total } = useReactions();
  const toast = useToast();
  const [chip, setChip] = useState("All");
  const [on, setOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState("home");

  return (
    <div className={css.page}>
      <Logo />
      <p className={css.muted}>
        status: {status} · me: {me?.nickname ?? "-"} · reactions: {total}{" "}
        {recent.map((r) => REACTION_EMOJI[r.reaction]).join(" ")}
      </p>

      <h2>Buttons</h2>
      <div className={css.row}>
        <Button>Join party</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="light">Light</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="sm" onClick={() => toast.show("Added to queue · you're 3rd")}>Toast</Button>
        <Button size="sm" variant="danger" onClick={() => toast.show("Queue limit reached", { tone: "error" })}>
          Error toast
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSheet(true)}>
          Sheet
        </Button>
        <Spinner />
      </div>

      <h2>Chips, pills, avatars</h2>
      <ChipRow>
        {["All", "Pop", "Rock", "80s", "Ballads", "Latin", "K-Pop"].map((c) => (
          <Chip key={c} selected={chip === c} onClick={() => setChip(c)}>
            {c}
          </Chip>
        ))}
      </ChipRow>
      <div className={css.row}>
        <Pill>Guest</Pill>
        <Pill tone="accent">Host</Pill>
        <Pill tone="warning">Locked</Pill>
        {state?.members.map((m) => <Avatar key={m.id} seed={m.avatarSeed} size={40} online={m.connected} />)}
        <AvatarStack seeds={state?.members.map((m) => m.avatarSeed) ?? []} />
      </div>

      <h2>Toggle, field, banner</h2>
      <div className={css.narrow}>
        <Toggle checked={on} onChange={setOn} label="Reactions" description="Guests can send emoji to the TV" />
        <TextField label="Nickname" placeholder="What should we call you?" />
        <TextField label="Code" error="We couldn't find that party." defaultValue="NOPE" />
        <Banner tone="accent">You're up in 2 songs</Banner>
        <Banner tone="warning">Reconnecting…</Banner>
      </div>

      <h2>Tiles</h2>
      <div className={css.tiles}>
        {SAMPLE_SONGS.slice(0, 4).map((s, i) => (
          <Tile key={s.videoId} title={["Pop", "Rock", "80s", "Ballads"][i]!} color={`var(--kt-tile-${i + 1})`} image={s.thumbnailUrl} />
        ))}
      </div>
      <div className={css.shortcuts}>
        {SAMPLE_SONGS.slice(4, 10).map((s) => (
          <ShortcutTile key={s.videoId} title={s.title.split(" - ")[1] ?? s.title} image={s.thumbnailUrl} onPlay={() => {}} />
        ))}
      </div>
      <Shelf title="Popular in this room" action={<a className={css.muted}>Show all</a>}>
        {SAMPLE_SONGS.slice(10, 18).map((s) => (
          <Card key={s.videoId} title={s.title.split(" - ")[1] ?? s.title} subtitle={s.channel} image={s.thumbnailUrl} onPlay={() => {}} />
        ))}
      </Shelf>

      <h2>Rows</h2>
      <div className={css.narrow}>
        {SAMPLE_SONGS.slice(0, 3).map((s, i) => (
          <SongRow key={s.videoId} song={s} added={i === 1} onAdd={() => {}} />
        ))}
        {state?.nowPlaying && <QueueRow item={state.nowPlaying} members={state.members} playing />}
        {state?.upNext.map((q, i) => (
          <QueueRow
            key={q.id}
            item={q}
            members={state.members}
            position={i + 1}
            mine={i === 2}
            onRemove={() => send({ type: "remove_song", itemId: q.id })}
          />
        ))}
        <ProgressBar value={42} max={200} showTimes />
      </div>

      <h2>Empty state</h2>
      <EmptyState icon={<ListMusic />} title="The queue is empty" action={<Button>Find a song</Button>}>
        Search for a song to get the party started.
      </EmptyState>

      <div className={css.spacer} />
      {state && (
        <div className={css.playerBar}>
          <PlayerBar
            item={state.nowPlaying}
            playback={state.playback}
            members={state.members}
            onPause={() => send({ type: "pause" })}
            onResume={() => send({ type: "resume" })}
            onSkip={() => send({ type: "skip" })}
            onRestart={() => send({ type: "restart" })}
          />
        </div>
      )}
      <div className={css.phone}>
        <BottomTabs
          active={tab}
          onSelect={setTab}
          tabs={[
            { key: "home", label: "Home", icon: <Home /> },
            { key: "search", label: "Search", icon: <Search /> },
            { key: "queue", label: "Queue", icon: <ListMusic />, badge: state?.upNext.length },
            { key: "party", label: "Party", icon: <PartyPopper /> },
          ]}
        >
          {state?.nowPlaying && (
            <MiniPlayer
              item={state.nowPlaying}
              playback={state.playback}
              members={state.members}
              onOpen={() => setSheet(true)}
              onToggle={() => send({ type: state.playback.state === "playing" ? "pause" : "resume" })}
            />
          )}
        </BottomTabs>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} label="Song options">
        <ActionList
          items={[
            { key: "a", label: "Move to top", icon: <ListMusic />, onClick: () => setSheet(false) },
            { key: "b", label: "Remove from queue", icon: <X />, danger: true, onClick: () => setSheet(false) },
          ]}
        />
      </Sheet>
    </div>
  );
}
