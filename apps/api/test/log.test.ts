import { afterEach, describe, expect, it, vi } from "vitest";
import { BUDGET_PER_MINUTE, EVENTS, logEvent, resetBudgets } from "../src/log";

const fake = () => {
  const points: AnalyticsEngineDataPoint[] = [];
  return { points, env: { EVENTS: { writeDataPoint: (p: AnalyticsEngineDataPoint) => void points.push(p) } as AnalyticsEngineDataset } };
};

describe("logEvent -> Analytics Engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetBudgets();
  });

  it("puts the event in index1, the room in blob1, then strings and numbers in schema order", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { points, env } = fake();
    logEvent(env, "song_added", { room: "ab12", videoId: "vid", status: "waiting", byHost: true, duet: false, explicit: 1, ignored: "x" });
    expect(points).toEqual([{ indexes: ["song_added"], blobs: ["ab12", "waiting", "vid"], doubles: [0, 1, 1] }]);
  });

  it("fills missing fields with empty text or 0, and clips long text", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { points, env } = fake();
    logEvent(env, "client_error", { message: "m".repeat(5000) });
    expect(points[0]!.blobs).toHaveLength(1 + EVENTS.client_error.strings.length);
    expect(points[0]!.blobs![0]).toBe("");
    expect(String(points[0]!.blobs![3])).toHaveLength(600);
    logEvent(env, "room_ended", { room: "r" });
    expect(points[1]!.doubles).toEqual([0, 0, 0]);
  });

  it("still prints the JSON line, and never throws when the dataset is missing or fails", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logEvent(undefined, "login_failed")).not.toThrow();
    const broken = { EVENTS: { writeDataPoint: () => { throw new Error("boom"); } } as unknown as AnalyticsEngineDataset };
    expect(() => logEvent(broken, "login_failed")).not.toThrow();
    expect(log).toHaveBeenCalledWith('{"event":"login_failed"}');
  });

  it("EVENT_MAX_TIER drops the lower-priority events from both the log and the dataset, never tier 1", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { points, env } = fake();
    const send = (max: string) => {
      points.length = 0;
      log.mockClear();
      const e = { ...env, EVENT_MAX_TIER: max };
      logEvent(e, "song_added", { room: "r" }); // tier 3
      logEvent(e, "song_unplayable", { room: "r" }); // tier 2
      logEvent(e, "room_ended", { room: "r" }); // tier 1
      return points.map((p) => p.indexes![0]);
    };
    expect(send("3")).toEqual(["song_added", "song_unplayable", "room_ended"]);
    expect(send("2")).toEqual(["song_unplayable", "room_ended"]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(send("1")).toEqual(["room_ended"]);
    expect(send("")).toHaveLength(3); // unset or unreadable means everything
    expect(send("nonsense")).toHaveLength(3);
  });

  it("trims a flood by priority on its own and recovers the next minute", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { points, env } = fake();
    const count = (name: string) => points.filter((p) => p.indexes![0] === name).length;
    // One noisy party: far more tier-3 and tier-2 events than its budget, plus a few vital ones.
    for (let i = 0; i < 500; i++) logEvent(env, "song_added", { room: "noisy" }); // tier 3
    for (let i = 0; i < 500; i++) logEvent(env, "room_error", { room: "noisy" }); // tier 2
    for (let i = 0; i < 5; i++) logEvent(env, "handler_failed", { room: "noisy" }); // tier 1
    expect(count("song_added")).toBe(BUDGET_PER_MINUTE[3]);
    expect(count("room_error")).toBe(BUDGET_PER_MINUTE[2]);
    expect(count("handler_failed")).toBe(5); // vital events still get through
    // Another party is unaffected by the noisy one.
    logEvent(env, "song_added", { room: "calm" });
    expect(count("song_added")).toBe(BUDGET_PER_MINUTE[3] + 1);
    // The flood is reported right away (first drop), once per tier, with the totals completed at the minute's end.
    const reports = () => points.filter((p) => p.indexes![0] === "events_dropped");
    expect(reports().map((p) => p.blobs!.slice(1).join("/")).sort()).toEqual(["noisy/2", "noisy/3"]);
    // A minute later the budget is back, and the rest of the dropped count is reported.
    vi.advanceTimersByTime(61_000);
    logEvent(env, "song_added", { room: "noisy" });
    expect(count("song_added")).toBe(BUDGET_PER_MINUTE[3] + 2);
    // Tier 3 rolled over: its reports (first drop + the rest) add up to exactly what it dropped.
    const droppedTier3 = reports().filter((p) => p.blobs![2] === "3").reduce((n, p) => n + (p.doubles![0] ?? 0), 0);
    expect(droppedTier3).toBe(500 - BUDGET_PER_MINUTE[3]);
  });

  it("keeps every schema within Analytics Engine's limits (20 blobs, 20 doubles)", () => {
    for (const [name, s] of Object.entries(EVENTS)) {
      expect(s.strings.length + 1, name).toBeLessThanOrEqual(20);
      expect(s.numbers.length, name).toBeLessThanOrEqual(20);
    }
  });
});
