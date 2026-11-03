import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ListMusic, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Member, QueueItem } from "@karaoke-tube/shared";
import { EmptyState, IconButton, QueueRow, songParts, useRoom, useT } from "@karaoke-tube/ui";
import css from "./host.module.css";

/** Right panel: now singing + next up, drag to reorder. */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { state, send } = useRoom();
  const t = useT();
  const upNext = state?.upNext ?? [];
  // Optimistic order while the room confirms the move.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => setOrder(null), [upNext]);

  const items = useMemo(() => {
    if (!order) return upNext;
    const byId = new Map(upNext.map((q) => [q.id, q]));
    return order.map((id) => byId.get(id)).filter((q): q is QueueItem => !!q);
  }, [order, upNext]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!state) return null;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = items.map((q) => q.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setOrder(arrayMove(ids, from, to));
    send({ type: "move_song", itemId: String(active.id), toIndex: to });
  };

  return (
    <aside className={`${css.panel} ${css.queue}`} aria-label={t("host.queueAria")}>
      <header className={css.queueHead}>
        <h2 className={css.queueTitle}>{t("tab.queue")}</h2>
        <IconButton label={t("host.closeQueue")} size="sm" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className={css.queueScroll}>
        {(state.pending?.length ?? 0) > 0 && (
          <section className={css.pendingBox} aria-label={t("host.waitingAria")} data-testid="host-pending">
            <h3 className={css.queueSub}>
              {t("host.waitingOk")} <span className={css.muted}>{state.pending!.length}</span>
            </h3>
            <ul className={css.queueList}>
              {state.pending!.map((q) => (
                <li key={q.id}>
                  <QueueRow
                    item={q}
                    members={state.members}
                    compact
                    actions={
                      <span className={css.pendingBtns}>
                        <button
                          type="button"
                          className={css.pendingBtn}
                          aria-label={t("queue.decline", { title: songParts(q.song).title })}
                          title={t("host.decline")}
                          onClick={() => send({ type: "decline_song", itemId: q.id })}
                        >
                          <X size={16} />
                        </button>
                        <button
                          type="button"
                          className={`${css.pendingBtn} ${css.pendingApprove}`}
                          aria-label={t("queue.approve", { title: songParts(q.song).title })}
                          title={t("host.approve")}
                          onClick={() => send({ type: "approve_song", itemId: q.id })}
                        >
                          <Check size={16} />
                        </button>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <h3 className={css.queueSub}>{t("queue.nowSinging")}</h3>
        {state.nowPlaying ? (
          <QueueRow item={state.nowPlaying} members={state.members} playing compact />
        ) : (
          <p className={css.muted}>{t("host.nothingYet")}</p>
        )}
        <h3 className={css.queueSub}>
          {t("queue.nextUp")} <span className={css.muted}>{items.length}</span>
        </h3>
        {items.length === 0 ? (
          <EmptyState icon={<ListMusic />} title={t("host.queueEmpty")}>
            {t("host.queueEmptyHint")}
          </EmptyState>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <ol className={css.queueList}>
                {items.map((q) => (
                  <SortableRow key={q.id} item={q} members={state.members} onRemove={() => send({ type: "remove_song", itemId: q.id })} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}

function SortableRow({ item, members, onRemove }: { item: QueueItem; members: Member[]; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 2 : undefined }}
    >
      <QueueRow
        item={item}
        members={members}
        compact
        dragging={isDragging}
        dragHandle={{ ...attributes, ...listeners }}
        onRemove={onRemove}
      />
    </li>
  );
}
