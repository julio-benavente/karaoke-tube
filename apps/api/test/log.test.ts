import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENTS, logEvent } from "../src/log";

const fake = () => {
  const points: AnalyticsEngineDataPoint[] = [];
  return { points, env: { EVENTS: { writeDataPoint: (p: AnalyticsEngineDataPoint) => void points.push(p) } as AnalyticsEngineDataset } };
};

describe("logEvent -> Analytics Engine", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("keeps every schema within Analytics Engine's limits (20 blobs, 20 doubles)", () => {
    for (const [name, s] of Object.entries(EVENTS)) {
      expect(s.strings.length + 1, name).toBeLessThanOrEqual(20);
      expect(s.numbers.length, name).toBeLessThanOrEqual(20);
    }
  });
});
