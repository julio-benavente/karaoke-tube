import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Check, ChevronsUp, ListMusic, MoreHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Member, QueueItem } from "@karaoke-tube/shared";
import { ActionList, Banner, Button, EmptyState, QueueRow, Sheet, songParts, useRoom, useT } from "@karaoke-tube/ui";
import { useShell } from "./RoomShell";
import css from "./Queue.module.css";

/** G5: now singing, "You're up in N songs", next up with singers, ✕ on own songs, ⋯ for hosts. */
export function QueueScreen() {
  const { state, me, isHost, send } = useRoom();
  const t = useT();
  const { openNowSinging, code } = useShell();
  const navigate = useNavigate();
  const [menuItem, setMenuItem] = useState<QueueItem | null>(null);
  // Close the menu if its song left the queue (played, skipped or removed by someone else).
  const menuGone = !!menuItem && !state?.upNext.some((q) => q.id === menuItem.id);
  useEffect(() => {
    if (menuGone) setMenuItem(null);
  }, [menuGone]);
  // Hosts and co-hosts drag songs to reorder. Optimistic order while the room confirms the move.
  const [order, setOrder] = useState<string[] | null>(null);
  const roomUpNext = state?.upNext;
  useEffect(() => setOrder(null), [roomUpNext]);
  const sortedUpNext = useMemo(() => {
    if (!order || !roomUpNext) return roomUpNext ?? [];
    const byId = new Map(roomUpNext.map((q) => [q.id, q]));
    return order.map((id) => byId.get(id)).filter((q): q is QueueItem => !!q);
  }, [order, roomUpNext]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!state || !me) return null;

  const { nowPlaying, members } = state;
  const upNext = isHost ? sortedUpNext : state.upNext;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = upNext.map((q) => q.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setOrder(arrayMove(ids, from, to));
    send({ type: "move_song", itemId: String(active.id), toIndex: to });
  };
  const myIndex = upNext.findIndex((q) => q.singerIds.includes(me.id));
  const singingNow = !!nowPlaying?.singerIds.includes(me.id);
  const pending = state.pending ?? [];
  const myPending = pending.filter((q) => q.addedBy === me.id || q.singerIds.includes(me.id));

  let banner: string | null = null;
  if (singingNow) banner = state.playback.state === "get_ready" ? t("queue.banner.getReady") : t("queue.banner.singing");
  else if (myIndex === 0) banner = t("queue.banner.next");
  else if (myIndex > 0) {
    // Songs that finish before yours: the current one plus those ahead of you.
    const n = myIndex + (nowPlaying ? 1 : 0);
    banner = t("queue.banner.soon", { count: n });
  }

  const menuIndex = menuItem ? upNext.findIndex((q) => q.id === menuItem.id) : -1;

  return (
    <div className={css.page}>
      <h1 className={css.title}>{t("tab.queue")}</h1>

      {banner && (
        <div className={css.banner}>
          <Banner tone="accent">{banner}</Banner>
        </div>
      )}

      {isHost && pending.length > 0 && (
        <section className={css.section} data-testid="pending-approve">
          <h2 className={css.h2}>
            {t("queue.needsOk")} <span className={css.count}>{pending.length}</span>
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
                        aria-label={t("queue.decline", { title: songParts(q.song).title })}
                      >
                        <X />
                      </button>
                      <button
                        type="button"
                        className={css.approve}
                        onClick={() => send({ type: "approve_song", itemId: q.id })}
                        aria-label={t("queue.approve", { title: songParts(q.song).title })}
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
          <h2 className={css.h2}>{t("queue.waitingOk")}</h2>
          <p className={css.hint}>{t("queue.waitingHint")}</p>
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
          <h2 className={css.h2}>{t("queue.nowSinging")}</h2>
          <button type="button" className={css.nowBtn} onClick={openNowSinging} aria-label={t("player.openNow")}>
            <QueueRow item={nowPlaying} members={members} playing mine={singingNow} meId={me.id} showOffline={isHost} />
          </button>
        </section>
      ) : null}

      <section className={css.section}>
        <h2 className={css.h2}>{t("queue.nextUp")}</h2>
        {upNext.length === 0 ? (
          <EmptyState
            icon={<ListMusic />}
            title={nowPlaying ? t("queue.nothingNext") : t("queue.empty")}
            action={<Button onClick={() => navigate(`/r/${code}/search`)}>{t("queue.findSong")}</Button>}
          >
            {t("queue.emptyHint")}
          </EmptyState>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={upNext.map((q) => q.id)} strategy={verticalListSortingStrategy} disabled={!isHost}>
              <ol className={css.list}>
                {upNext.map((q, i) => {
                  const mine = q.singerIds.includes(me.id) || q.addedBy === me.id;
                  return (
                    <SortableItem key={q.id} id={q.id} sortable={isHost}>
                      {(dragProps) => (
                        <QueueRow
                          item={q}
                          members={members}
                          position={i + 1}
                          mine={q.singerIds.includes(me.id)}
                          meId={me.id}
                          onRemove={mine && !isHost ? () => send({ type: "remove_song", itemId: q.id }) : undefined}
                          showOffline={isHost}
                          onRemoveAllOf={isHost ? (m: Member) => send({ type: "remove_member_songs", memberId: m.id }) : undefined}
                          dragHandle={dragProps?.handle}
                          dragging={dragProps?.dragging}
                          actions={
                            isHost ? (
                              <button
                                type="button"
                                className={css.more}
                                onClick={() => setMenuItem(q)}
                                aria-label={t("queue.moreOptions", { title: songParts(q.song).title })}
                              >
                                <MoreHorizontal />
                              </button>
                            ) : undefined
                          }
                        />
                      )}
                    </SortableItem>
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <Sheet open={!!menuItem} onClose={() => setMenuItem(null)} label={t("queue.songOptions")}>
        {menuItem && (
          <>
            <p className={css.sheetTitle}>{songParts(menuItem.song).title}</p>
            <ActionList
              items={[
                ...(menuIndex > 0
                  ? [
                      {
                        key: "top",
                        label: t("queue.playNext"),
                        icon: <ChevronsUp />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: 0 }),
                      },
                      {
                        key: "up",
                        label: t("queue.moveUp"),
                        icon: <ArrowUp />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: menuIndex - 1 }),
                      },
                    ]
                  : []),
                ...(menuIndex >= 0 && menuIndex < upNext.length - 1
                  ? [
                      {
                        key: "down",
                        label: t("queue.moveDown"),
                        icon: <ArrowDown />,
                        onClick: () => send({ type: "move_song", itemId: menuItem.id, toIndex: menuIndex + 1 }),
                      },
                    ]
                  : []),
                {
                  key: "remove",
                  label: t("queue.removeFromQueue"),
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

/** A queue line that hosts can drag by its handle. Guests get a plain line. */
function SortableItem({
  id,
  sortable,
  children,
}: {
  id: string;
  sortable: boolean;
  children: (drag: { handle: HTMLAttributes<HTMLButtonElement>; dragging: boolean } | null) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !sortable });
  return (
    <li
      ref={setNodeRef}
      className={css.item}
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 2 : undefined }}
    >
      {children(sortable ? { handle: { ...attributes, ...listeners }, dragging: isDragging } : null)}
    </li>
  );
}
