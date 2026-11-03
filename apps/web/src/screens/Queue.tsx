import { ArrowDown, ArrowUp, Check, ChevronsUp, ListMusic, MoreHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { QueueItem } from "@karaoke-tube/shared";
import { ActionList, Banner, Button, EmptyState, QueueRow, Sheet, songParts, useRoom } from "@karaoke-tube/ui";
import { useShell } from "./RoomShell";
import css from "./Queue.module.css";

/** G5: now singing, "You're up in N songs", next up with singers, ✕ on own songs, ⋯ for hosts. */
export function QueueScreen() {
  const { state, me, isHost, send } = useRoom();
  const { openNowSinging, code } = useShell();
  const navigate = useNavigate();
  const [menuItem, setMenuItem] = useState<QueueItem | null>(null);
  // Close the menu if its song left the queue (played, skipped or removed by someone else).
  const menuGone = !!menuItem && !state?.upNext.some((q) => q.id === menuItem.id);
  useEffect(() => {
    if (menuGone) setMenuItem(null);
  }, [menuGone]);
  if (!state || !me) return null;

  const { nowPlaying, upNext, members } = state;
  const myIndex = upNext.findIndex((q) => q.singerIds.includes(me.id));
  const singingNow = !!nowPlaying?.singerIds.includes(me.id);
  const pending = state.pending ?? [];
  const myPending = pending.filter((q) => q.addedBy === me.id || q.singerIds.includes(me.id));

  let banner: string | null = null;
  if (singingNow) banner = state.playback.state === "get_ready" ? "Get ready, you're up!" : "You're singing now. Go get 'em!";
  else if (myIndex === 0) banner = "You're up next!";
  else if (myIndex > 0) {
    // Songs that finish before yours: the current one plus those ahead of you.
    const n = myIndex + (nowPlaying ? 1 : 0);
    banner = `You're up in ${n} song${n === 1 ? "" : "s"}`;
  }

  const menuIndex = menuItem ? upNext.findIndex((q) => q.id === menuItem.id) : -1;

  return (
    <div className={css.page}>
      <h1 className={css.title}>Queue</h1>

      {banner && (
        <div className={css.banner}>
          <Banner tone="accent">{banner}</Banner>
        </div>
      )}

      {isHost && pending.length > 0 && (
        <section className={css.section} data-testid="pending-approve">
          <h2 className={css.h2}>
            Needs your OK <span className={css.count}>{pending.length}</span>
          </h2>
          <ul className={css.list}>
            {pending.map((q) => (
              <li key={q.id} className={css.item}>
                <QueueRow
                  item={q}
                  members={members}
                  meId={me.id}
                  actions={
                    <span className={css.approveBtns}>
                      <button
                        type="button"
                        className={css.decline}
                        onClick={() => send({ type: "decline_song", itemId: q.id })}
                        aria-label={`Decline ${songParts(q.song).title}`}
                      >
                        <X />
                      </button>
                      <button
                        type="button"
                        className={css.approve}
                        onClick={() => send({ type: "approve_song", itemId: q.id })}
                        aria-label={`Approve ${songParts(q.song).title}`}
                      >
                        <Check />
                      </button>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isHost && myPending.length > 0 && (
        <section className={css.section} data-testid="pending-mine">
          <h2 className={css.h2}>Waiting for the host's OK</h2>
          <p className={css.hint}>The host picks what plays tonight. Your song joins the queue once they say yes.</p>
          <ul className={css.list}>
            {myPending.map((q) => (
              <li key={q.id} className={css.item}>
                <QueueRow
                  item={q}
                  members={members}
                  meId={me.id}
                  mine
                  onRemove={() => send({ type: "remove_song", itemId: q.id })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {nowPlaying ? (
        <section className={css.section}>
          <h2 className={css.h2}>Now singing</h2>
          <button type="button" className={css.nowBtn} onClick={openNowSinging} aria-label="Open now singing">
            <QueueRow item={nowPlaying} members={members} playing mine={singingNow} meId={me.id} />
          </button>
        </section>
      ) : null}

      <section className={css.section}>
        <h2 className={css.h2}>Next up</h2>
        {upNext.length === 0 ? (
          <EmptyState
            icon={<ListMusic />}
            title={nowPlaying ? "Nothing up next" : "The queue is empty"}
            action={<Button onClick={() => navigate(`/r/${code}/search`)}>Find a song</Button>}
          >
            Add a song and it'll show up here.
          </EmptyState>
        ) : (
          <ol className={css.list}>
            {upNext.map((q, i) => {
              const mine = q.singerIds.includes(me.id) || q.addedBy === me.id;
              return (
                <li key={q.id} className={css.item}>
                  <QueueRow
                    item={q}
                    members={members}
                    position={i + 1}
                    mine={q.singerIds.includes(me.id)}
                    meId={me.id}
                    onRemove={mine && !isHost ? () => send({ type: "remove_song", itemId: q.id }) : undefined}
                    actions={
                      isHost ? (
                        <button
                          type="button"
                          className={css.more}
                          onClick={() => setMenuItem(q)}
                          aria-label={`More options for ${songParts(q.song).title}`}
                        >
                          <MoreHorizontal />
                        </button>
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <Sheet open={!!menuItem} onClose={() => setMenuItem(null)} label="Song options">
        {menuItem && (
          <>
            <p className={css.sheetTitle}>{songParts(menuItem.song).title}</p>
            <ActionList
              items={[
                ...(menuIndex > 0
                  ? [
                      {
                        key: "top",
                        label: "Play next",
                        icon: <ChevronsUp />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: 0 }),
                      },
                      {
                        key: "up",
                        label: "Move up",
                        icon: <ArrowUp />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: menuIndex - 1 }),
                      },
                    ]
                  : []),
                ...(menuIndex >= 0 && menuIndex < upNext.length - 1
                  ? [
                      {
                        key: "down",
                        label: "Move down",
                        icon: <ArrowDown />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: menuIndex + 1 }),
                      },
                    ]
                  : []),
                {
                  key: "remove",
                  label: "Remove from queue",
                  icon: <Trash2 />,
                  danger: true,
                  onClick: () => send({ type: "remove_song", itemId: menuItem.id }),
                },
              ].map((a) => ({
                ...a,
                onClick: () => {
                  a.onClick();
                  setMenuItem(null);
                },
              }))}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}
