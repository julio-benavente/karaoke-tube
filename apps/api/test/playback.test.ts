import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TestClient, guest, hostRoom, song } from "./helpers";

/** A room whose host socket is the player, with the get-ready card off unless asked. */
async function partyRoom(getReadyCard = false) {
  const room = await hostRoom();
  await room.host.act({ type: "update_settings", settings: { getReadyCard, maxWaitingPerMember: 5 } });
  return room;
}

describe("playback", () => {
  it("plays right away without the get-ready card, then moves on when a song ends", async () => {
    const { host } = await partyRoom();
    let state = await host.act({ type: "add_song", song: song("first") });
    const play = await host.next("play");
    expect(play.item.song.title).toBe("first");
    expect(state.nowPlaying?.id).toBe(play.item.id);
    expect(state.nowPlaying?.status).toBe("playing");
    expect(state.upNext).toEqual([]);

    state = await host.act({ type: "add_song", song: song("second") });
    expect(state.upNext.map((i) => i.song.title)).toEqual(["second"]);

    state = await host.act({ type: "player_event", event: "started", itemId: play.item.id, positionSec: 0 });
    expect(state.playback.state).toBe("playing");
    state = await host.act({ type: "player_event", event: "progress", itemId: play.item.id, positionSec: 42 });
    expect(state.playback.positionSec).toBe(42);

    state = await host.act({ type: "player_event", event: "ended", itemId: play.item.id });
    const next = await host.next("play");
    expect(next.item.song.title).toBe("second");
    expect(state.nowPlaying?.id).toBe(next.item.id);

    state = await host.act({ type: "player_event", event: "ended", itemId: next.item.id });
    expect(state.nowPlaying).toBeNull();
    expect(state.playback.state).toBe("idle");
  });

  it("shows the get-ready card, then sends play when the countdown alarm fires", async () => {
    const { code, host } = await partyRoom(true);
    const before = Date.now();
    const state = await host.act({ type: "add_song", song: song("ready") });
    expect(state.playback.state).toBe("get_ready");
    expect(state.playback.countdownEndsAt).toBeGreaterThanOrEqual(before + 5000);
    expect(host.messages.some((m) => m.type === "play")).toBe(false);

    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const play = await host.next("play");
    expect(play.item.song.title).toBe("ready");

    const started = await host.act({ type: "player_event", event: "started", itemId: play.item.id });
    expect(started.playback).toMatchObject({ state: "playing", countdownEndsAt: null });
  });

  it("skips a song that errors and plays the next", async () => {
    const { host } = await partyRoom();
    await host.act({ type: "add_song", song: song("broken") });
    const play = await host.next("play");
    await host.act({ type: "add_song", song: song("fine") });
    const state = await host.act({ type: "player_event", event: "error", itemId: play.item.id });
    expect(state.nowPlaying?.song.title).toBe("fine");
    expect((await host.next("play")).item.song.title).toBe("fine");
  });

  it("skip, pause, resume and restart from hosts reach the player", async () => {
    const { code, host } = await partyRoom();
    const ana = await guest(code, "Ana");
    await host.act({ type: "add_song", song: song("one") });
    const play = await host.next("play");
    await host.act({ type: "add_song", song: song("two") });
    await host.act({ type: "player_event", event: "started", itemId: play.item.id });

    let state = await host.act({ type: "pause" });
    expect(state.playback.state).toBe("paused");
    expect((await host.next("player_command")).command).toBe("pause");
    state = await host.act({ type: "resume" });
    expect(state.playback.state).toBe("playing");
    expect((await host.next("player_command")).command).toBe("resume");
    state = await host.act({ type: "restart" });
    expect(state.playback.positionSec).toBe(0);
    expect((await host.next("player_command")).command).toBe("restart");

    // Guests don't get the player commands.
    expect(ana.client.messages.some((m) => m.type === "play" || m.type === "player_command")).toBe(false);

    state = await host.act({ type: "skip" });
    expect(state.nowPlaying?.song.title).toBe("two");
    expect((await host.next("play")).item.song.title).toBe("two");
    expect(state.upNext).toEqual([]);
  });

  it("only the host's ?player=1 socket can send player events", async () => {
    const { code, host, memberId, key } = await partyRoom();
    await host.act({ type: "add_song", song: song() });
    const play = await host.next("play");

    const hostApp = await TestClient.open(code); // the host, but not as the player
    await hostApp.request({ type: "rejoin", memberId, key }, "welcome");
    expect(await hostApp.expectError({ type: "player_event", event: "ended", itemId: play.item.id })).toBe("not_allowed");

    const ana = await guest(code, "Ana");
    expect(await ana.client.expectError({ type: "player_event", event: "ended", itemId: play.item.id })).toBe("not_allowed");

    // A guest asking to be the player isn't one.
    const sneaky = await TestClient.open(code, "?player=1");
    await sneaky.join("Sneaky");
    expect(await sneaky.expectError({ type: "player_event", event: "ended", itemId: play.item.id })).toBe("not_allowed");
  });

  it("a reconnecting player gets the current song again", async () => {
    const { code, host, memberId, key } = await partyRoom();
    await host.act({ type: "add_song", song: song("again") });
    const first = await host.next("play");
    host.close();
    const player = await TestClient.open(code, "?player=1");
    player.send({ type: "rejoin", memberId, key });
    const play = await player.next("play");
    expect(play.item.id).toBe(first.item.id);
  });

  it("ignores events for a song that isn't playing anymore", async () => {
    const { host } = await partyRoom();
    await host.act({ type: "add_song", song: song("a") });
    const play = await host.next("play");
    await host.act({ type: "add_song", song: song("b") });
    await host.act({ type: "skip" });
    // A late `ended` for the skipped song changes nothing.
    host.send({ type: "player_event", event: "ended", itemId: play.item.id });
    const after = await host.act({ type: "update_settings", settings: {} });
    expect(after.nowPlaying?.song.title).toBe("b");
  });
});
