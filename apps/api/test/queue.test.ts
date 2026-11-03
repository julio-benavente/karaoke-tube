import { describe, expect, it } from "vitest";
import { orderUpNext, shiftPins, type StoredItem } from "../src/queue";

let seq = 0;
function item(singer: string, addedAt: number, extra: Partial<StoredItem> = {}): StoredItem {
  return {
    id: `i${++seq}`,
    song: { videoId: `v${seq}`, title: `Song ${seq}`, channel: "c", durationSec: 200, thumbnailUrl: "" },
    singerIds: [singer],
    addedBy: singer,
    status: "waiting",
    addedAt,
    startedAt: null,
    pinIndex: null,
    ...extra,
  };
}
const singers = (items: StoredItem[]) => items.map((i) => i.singerIds[0]);

describe("orderUpNext", () => {
  it("fifo orders by addedAt", () => {
    const items = [item("a", 3), item("a", 1), item("b", 2)];
    expect(orderUpNext(items, "fifo").map((i) => i.addedAt)).toEqual([1, 2, 3]);
  });

  it("rotation gives each singer one song per round", () => {
    // Ana adds three songs before Ben and Cleo add one each.
    const items = [item("ana", 1), item("ana", 2), item("ana", 3), item("ben", 4), item("cleo", 5)];
    expect(singers(orderUpNext(items, "rotation"))).toEqual(["ana", "ben", "cleo", "ana", "ana"]);
  });

  it("rotation counts songs already sung or started", () => {
    const items = [
      item("ana", 1, { status: "played", startedAt: 10 }),
      item("ana", 2, { status: "playing", startedAt: 20 }),
      item("ana", 3),
      item("ben", 4),
    ];
    // Ana is on round 2, Ben on round 0.
    expect(singers(orderUpNext(items, "rotation"))).toEqual(["ben", "ana"]);
  });

  it("rotation breaks ties by when the singer joined the rotation", () => {
    const items = [item("ben", 1, { status: "played", startedAt: 5 }), item("ana", 2, { status: "played", startedAt: 6 }), item("ana", 3), item("ben", 4)];
    // Both on round 1; Ben joined first.
    expect(singers(orderUpNext(items, "rotation"))).toEqual(["ben", "ana"]);
  });

  it("skipped songs count as a turn", () => {
    const items = [item("ana", 1, { status: "skipped", startedAt: 5 }), item("ana", 2), item("ben", 3)];
    expect(singers(orderUpNext(items, "rotation"))).toEqual(["ben", "ana"]);
  });

  it("pinned items keep their index; new songs go around them", () => {
    const a = item("ana", 1, { pinIndex: 1 });
    const b = item("ben", 2, { pinIndex: 0 });
    const c = item("cleo", 3);
    expect(orderUpNext([a, b, c], "rotation").map((i) => i.id)).toEqual([b.id, a.id, c.id]);
  });

  it("ignores played items", () => {
    const items = [item("ana", 1, { status: "played", startedAt: 1 })];
    expect(orderUpNext(items, "fifo")).toEqual([]);
  });

  it("a duet uses a turn for each singer", () => {
    // Ana & Ben's duet comes first; then Cleo, who hasn't sung, goes before Ana's solo and Ben's solo.
    const duet = item("ana", 1, { singerIds: ["ana", "ben"] });
    const anaSolo = item("ana", 2);
    const benSolo = item("ben", 3);
    const cleo = item("cleo", 4);
    const order = orderUpNext([duet, anaSolo, benSolo, cleo], "rotation").map((i) => i.id);
    expect(order).toEqual([duet.id, cleo.id, anaSolo.id, benSolo.id]);
  });

  it("a duet waits until both singers are due", () => {
    // Ben already sang; a duet with him is round 1, so Cleo (round 0) goes first.
    const sung = item("ben", 1, { status: "played", startedAt: 5 });
    const duet = item("ana", 2, { singerIds: ["ana", "ben"] });
    const cleo = item("cleo", 3);
    expect(orderUpNext([sung, duet, cleo], "rotation").map((i) => i.id)).toEqual([cleo.id, duet.id]);
  });

  it("an 'everyone sings' song is the adder's turn", () => {
    const group = item("ana", 1, { everyone: true });
    const anaSolo = item("ana", 2);
    const ben = item("ben", 3);
    expect(orderUpNext([group, anaSolo, ben], "rotation").map((i) => i.id)).toEqual([group.id, ben.id, anaSolo.id]);
  });

  it("approval mode orders approved songs like rotation and leaves pending ones out", () => {
    const a1 = item("ana", 1);
    const a2 = item("ana", 2);
    const b = item("ben", 3);
    const pending = item("cleo", 0, { status: "pending" });
    expect(orderUpNext([a1, a2, b, pending], "approval").map((i) => i.id)).toEqual([a1.id, b.id, a2.id]);
  });
});

describe("shiftPins", () => {
  it("moves pins after the removed index up by one", () => {
    const a = item("a", 1, { pinIndex: 0 });
    const b = item("b", 2, { pinIndex: 1 });
    const c = item("c", 3, { pinIndex: 2 });
    expect(shiftPins([a, b, c], 0)).toEqual([
      [b.id, 0],
      [c.id, 1],
    ]);
  });
});
