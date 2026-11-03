import type { QueueItem, QueueMode } from "@karaoke-tube/shared";

/** A queue item as the room stores it: the public fields plus ordering data. */
export type StoredItem = QueueItem & {
  /** When the item was sent to the player (counts toward the singer's round). Null while waiting. */
  startedAt: number | null;
  /** Set by the host's `move_song`: the item's index in `upNext`. Overrides the queue mode until it plays. */
  pinIndex: number | null;
  /** When the player reported it really started (it's a performance: awards, titles). */
  performedAt?: number | null;
};

/** The singer whose turn an item counts toward first (ties in rotation). */
export function primarySinger(item: QueueItem): string {
  return item.singerIds[0] ?? item.addedBy;
}

/** Everyone whose turn the item uses: all singers of a duet; the adder of an "Everyone sings" song. */
export function turnHolders(item: QueueItem): string[] {
  if (item.everyone || item.singerIds.length === 0) return [item.addedBy];
  return item.singerIds;
}

/**
 * Waiting items in play order.
 *
 * - `fifo`: by `addedAt`.
 * - `rotation` (and `approval`, once a host has let songs in): one turn per singer per round. A duet uses a
 *   turn for each of its singers. A singer's round starts at how many songs they have sung or started; an item's
 *   round is the latest round of its singers, and each of them moves to the round after it. Ties go to whoever
 *   joined the rotation first (their first song ever added), then `addedAt`.
 * - Pinned items (`pinIndex`) are then placed at their index, in pin order.
 */
export function orderUpNext(items: readonly StoredItem[], mode: QueueMode): StoredItem[] {
  const waiting = items.filter((i) => i.status === "waiting");
  const pinned = waiting.filter((i) => i.pinIndex !== null).sort((a, b) => a.pinIndex! - b.pinIndex! || a.addedAt - b.addedAt);
  const free = waiting.filter((i) => i.pinIndex === null).sort((a, b) => a.addedAt - b.addedAt || cmp(a.id, b.id));

  let ordered: StoredItem[];
  if (mode === "fifo") {
    ordered = free;
  } else {
    const started = new Map<string, number>();
    const joinedRotation = new Map<string, number>();
    for (const item of items) {
      if (item.status === "pending") continue;
      for (const singer of turnHolders(item)) {
        const joined = joinedRotation.get(singer);
        if (joined === undefined || item.addedAt < joined) joinedRotation.set(singer, item.addedAt);
        if (item.startedAt !== null) started.set(singer, (started.get(singer) ?? 0) + 1);
      }
    }
    // Pinned items still use up a round for their singers, so their other songs don't jump ahead.
    const nextRound = new Map(started);
    for (const item of [...waiting].sort((a, b) => a.addedAt - b.addedAt)) {
      if (item.pinIndex === null) continue;
      for (const singer of turnHolders(item)) nextRound.set(singer, (nextRound.get(singer) ?? 0) + 1);
    }
    const keyed = free.map((item) => {
      const holders = turnHolders(item);
      const round = Math.max(...holders.map((s) => nextRound.get(s) ?? 0));
      for (const s of holders) nextRound.set(s, round + 1);
      const joined = Math.min(...holders.map((s) => joinedRotation.get(s) ?? item.addedAt));
      return { item, round, joined };
    });
    keyed.sort((a, b) => a.round - b.round || a.joined - b.joined || a.item.addedAt - b.item.addedAt || cmp(a.item.id, b.item.id));
    ordered = keyed.map((k) => k.item);
  }

  for (const item of pinned) {
    ordered.splice(Math.min(item.pinIndex!, ordered.length), 0, item);
  }
  return ordered;
}

/**
 * New pin indexes after the item at `removedIndex` leaves `upNext` (it started playing or was removed),
 * so pinned items keep moving up. Returns `[itemId, newPinIndex]` for each pin that changes.
 */
export function shiftPins(upNext: readonly StoredItem[], removedIndex: number): Array<[string, number]> {
  const changes: Array<[string, number]> = [];
  for (const item of upNext) {
    if (item.pinIndex !== null && item.pinIndex > removedIndex) changes.push([item.id, item.pinIndex - 1]);
  }
  return changes;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
