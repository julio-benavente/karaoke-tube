import { afterEach, describe, expect, it, vi } from "vitest";
import { guest, hostRoom, song } from "./helpers";

/** The JSON event lines the app printed (other console.log calls are ignored). */
const events = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls
    .map((c) => String(c[0]))
    .filter((l) => l.startsWith('{"event"'))
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe("event logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs room, join and song events as JSON, without names or codes", async () => {
    const spy = vi.spyOn(console, "log");
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Anabel Secretname");
    await ana.client.act({ type: "add_song", song: song("Some Song") });
    await host.waitForState((s) => s.nowPlaying?.song.title === "Some Song");
    host.send({ type: "end_party" });
    await host.waitForState((s) => s.status === "ended");

    const got = events(spy);
    const names = got.map((e) => e.event);
    expect(names).toEqual(expect.arrayContaining(["room_created", "member_joined", "song_added", "room_ended"]));
    expect(got.find((e) => e.event === "room_ended")).toMatchObject({ reason: "host", songsPlayed: 0 });

    const text = JSON.stringify(got);
    expect(text).not.toContain("Anabel");
    expect(text).not.toContain(code);
  });
});
