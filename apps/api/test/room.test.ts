import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE, TestClient, createRoom, guest, hostRoom, song } from "./helpers";

describe("rooms HTTP", () => {
  it("creates a room with a 4-character code", async () => {
    const room = await createRoom("Julio");
    expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    const info = await (await SELF.fetch(`${BASE}/api/rooms/${room.code.toLowerCase()}`)).json();
    expect(info).toEqual({ code: room.code, exists: true, locked: false, status: "open" });
  });

  it("reports unknown rooms", async () => {
    const info = await (await SELF.fetch(`${BASE}/api/rooms/ZZZZ`)).json();
    expect(info).toEqual({ code: "ZZZZ", exists: false, locked: false, status: null });
  });

  it("rejects a missing nickname", async () => {
    const res = await SELF.fetch(`${BASE}/api/rooms`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });

  it("sends room_not_found on a socket to an unknown room", async () => {
    const c = await TestClient.open("QQQQ");
    expect((await c.next("error")).code).toBe("room_not_found");
  });
});

describe("join and rejoin", () => {
  it("joins as a guest and everyone gets the new state", async () => {
    const { code, host, memberId } = await hostRoom();
    const ana = await guest(code, "Ana");
    expect(ana.welcome.state.members.map((m) => [m.nickname, m.role, m.connected])).toEqual([
      ["Host", "host", true],
      ["Ana", "guest", true],
    ]);
    expect(ana.key).toMatch(/^[0-9a-f]{64}$/);
    const state = (await host.next("state")).state;
    expect(state.members.find((m) => m.id === ana.id)?.connected).toBe(true);
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("host");
  });

  it("numbers duplicate nicknames", async () => {
    const { code } = await hostRoom();
    await guest(code, "Ana");
    const second = await guest(code, "ana");
    const third = await guest(code, "Ana");
    const names = third.welcome.state.members.map((m) => m.nickname);
    expect(names).toEqual(["Host", "Ana", "ana 2", "Ana 3"]);
    expect(second.welcome.state.members.at(-1)?.nickname).toBe("ana 2");
  });

  it("rejoins with the key and refuses a wrong key", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    ana.client.close();
    await host.waitForState((s) => s.members.find((m) => m.id === ana.id)?.connected === false);

    const again = await TestClient.open(code);
    const welcome = await again.request({ type: "rejoin", memberId: ana.id, key: ana.key }, "welcome");
    expect(welcome.memberId).toBe(ana.id);
    expect(welcome.state.members.find((m) => m.id === ana.id)?.connected).toBe(true);

    const impostor = await TestClient.open(code);
    expect(await impostor.expectError({ type: "rejoin", memberId: ana.id, key: "0".repeat(64) })).toBe("bad_key");
  });

  it("requires joining before anything else", async () => {
    const { code } = await hostRoom();
    const c = await TestClient.open(code);
    expect(await c.expectError({ type: "add_song", song: song() })).toBe("not_allowed");
  });

  it("rejects malformed messages", async () => {
    const { host } = await hostRoom();
    expect(await host.expectError({ type: "move_song" } as never)).toBe("invalid_message");
    host.ws.send("not json");
    expect((await host.next("error")).code).toBe("invalid_message");
  });
});

describe("lock and end", () => {
  it("refuses joins while locked, but members can still rejoin", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    const state = await host.act({ type: "update_settings", settings: { locked: true } });
    expect(state.settings.locked).toBe(true);
    const info = await (await SELF.fetch(`${BASE}/api/rooms/${code}`)).json<{ locked: boolean }>();
    expect(info.locked).toBe(true);

    const late = await TestClient.open(code);
    expect(await late.expectError({ type: "join", nickname: "Late", avatarSeed: "x" })).toBe("room_locked");

    const back = await TestClient.open(code);
    expect((await back.request({ type: "rejoin", memberId: ana.id, key: ana.key }, "welcome")).memberId).toBe(ana.id);
  });

  it("ends the party: status ended, `ended` broadcast, joins refused", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    expect(await ana.client.expectError({ type: "end_party" })).toBe("not_allowed");
    host.send({ type: "end_party" });
    await ana.client.next("ended");
    const info = await (await SELF.fetch(`${BASE}/api/rooms/${code}`)).json<{ status: string }>();
    expect(info.status).toBe("ended");
    const late = await TestClient.open(code);
    expect(await late.expectError({ type: "join", nickname: "Late", avatarSeed: "x" })).toBe("room_ended");
    expect(await ana.client.expectError({ type: "add_song", song: song() })).toBe("room_ended");
  });
});

describe("permissions", () => {
  it("guests can't use host actions; nothing changes", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    // Fill the queue so something is waiting.
    await host.act({ type: "add_song", song: song() });
    const before = await host.act({ type: "add_song", song: song() });
    const itemId = before.upNext.at(-1)!.id;

    const c = ana.client;
    expect(await c.expectError({ type: "move_song", itemId, toIndex: 0 })).toBe("not_allowed");
    expect(await c.expectError({ type: "skip" })).toBe("not_allowed");
    expect(await c.expectError({ type: "pause" })).toBe("not_allowed");
    expect(await c.expectError({ type: "kick", memberId: ben.id })).toBe("not_allowed");
    expect(await c.expectError({ type: "set_role", memberId: ben.id, role: "cohost" })).toBe("not_allowed");
    expect(await c.expectError({ type: "update_settings", settings: { locked: true } })).toBe("not_allowed");
    expect(await c.expectError({ type: "remove_song", itemId })).toBe("not_allowed");
    expect(await c.expectError({ type: "add_song", song: song(), singerIds: [ben.id] })).toBe("not_allowed");

    const after = (await c.request({ type: "add_song", song: song() }, "state")).state;
    // Only Ana's own add went through.
    expect(after.upNext.length).toBe(before.upNext.length + 1);
    expect(after.settings.locked).toBe(false);
  });

  it("guests remove their own songs; hosts remove any", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "add_song", song: song() }); // starts nothing (no A2 yet) or plays; either way
    let state = await ana.client.act({ type: "add_song", song: song() });
    const anaItem = state.upNext.find((i) => i.addedBy === ana.id)!;
    state = await ana.client.act({ type: "remove_song", itemId: anaItem.id });
    expect(state.upNext.some((i) => i.id === anaItem.id)).toBe(false);

    state = await ana.client.act({ type: "add_song", song: song() });
    const again = state.upNext.find((i) => i.addedBy === ana.id)!;
    state = await host.act({ type: "remove_song", itemId: again.id });
    expect(state.upNext.some((i) => i.id === again.id)).toBe(false);
  });

  it("cohosts get host powers but can't end the party or set roles", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    const state = await host.act({ type: "set_role", memberId: ana.id, role: "cohost" });
    expect(state.members.find((m) => m.id === ana.id)?.role).toBe("cohost");

    expect((await ana.client.act({ type: "update_settings", settings: { hostsOnlyAdd: true } })).settings.hostsOnlyAdd).toBe(true);
    expect(await ben.client.expectError({ type: "add_song", song: song() })).toBe("not_allowed");
    expect(await ana.client.expectError({ type: "end_party" })).toBe("not_allowed");
    expect(await ana.client.expectError({ type: "set_role", memberId: ben.id, role: "cohost" })).toBe("not_allowed");
  });

  it("kick removes the member and their waiting songs", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "add_song", song: song() });
    await ana.client.act({ type: "add_song", song: song() });
    const state = await host.act({ type: "kick", memberId: ana.id });
    expect(state.members.some((m) => m.id === ana.id)).toBe(false);
    expect(state.upNext.some((i) => i.singerIds.includes(ana.id))).toBe(false);
    await ana.client.next("kicked");
    const back = await TestClient.open(code);
    expect(await back.expectError({ type: "rejoin", memberId: ana.id, key: ana.key })).toBe("bad_key");
  });
});

describe("queue", () => {
  it("applies the per-guest limit; hosts are exempt", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "update_settings", settings: { maxWaitingPerMember: 2, getReadyCard: false } });
    await ana.client.act({ type: "add_song", song: song() });
    await ana.client.act({ type: "add_song", song: song() });
    expect(await ana.client.expectError({ type: "add_song", song: song() })).toBe("queue_limit");
    for (let i = 0; i < 4; i++) await host.act({ type: "add_song", song: song() });
  });

  it("orders up next by rotation", async () => {
    const { code, host, memberId: hostId } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await host.act({ type: "update_settings", settings: { maxWaitingPerMember: 5 } });
    await ana.client.act({ type: "add_song", song: song() });
    await ana.client.act({ type: "add_song", song: song() });
    await ana.client.act({ type: "add_song", song: song() });
    await ben.client.act({ type: "add_song", song: song() });
    const state = await host.act({ type: "add_song", song: song() });
    const all = [state.nowPlaying, ...state.upNext].filter((i) => i !== null).map((i) => i.singerIds[0]);
    expect(all).toEqual([ana.id, ben.id, hostId, ana.id, ana.id]);
  });

  it("fifo mode orders by time added", async () => {
    const { code, host, memberId: hostId } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "update_settings", settings: { queueMode: "fifo" } });
    await ana.client.act({ type: "add_song", song: song() });
    await ana.client.act({ type: "add_song", song: song() });
    const state = await host.act({ type: "add_song", song: song() });
    const all = [state.nowPlaying, ...state.upNext].filter((i) => i !== null).map((i) => i.singerIds[0]);
    expect(all).toEqual([ana.id, ana.id, hostId]);
  });

  it("move_song overrides rotation order", async () => {
    const { code, host, memberId: hostId } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "update_settings", settings: { maxWaitingPerMember: 5 } });
    for (let i = 0; i < 3; i++) await ana.client.act({ type: "add_song", song: song() });
    let state = await host.act({ type: "add_song", song: song() });
    const last = state.upNext.at(-1)!;
    state = await host.act({ type: "move_song", itemId: last.id, toIndex: 0 });
    expect(state.upNext[0]!.id).toBe(last.id);
    // A song added later goes after the frozen order.
    state = await host.act({ type: "add_song", song: song("late") });
    expect(state.upNext.at(-1)!.song.title).toBe("late");
    expect(state.upNext.map((i) => i.singerIds[0]).filter((s) => s === hostId).length).toBeGreaterThan(0);
  });
});

describe("reactions", () => {
  it("broadcasts reactions, rate limited to one per 500 ms", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    ana.client.send({ type: "react", reaction: "fire" });
    ana.client.send({ type: "react", reaction: "clap" });
    const r = await host.next("reaction");
    expect(r).toEqual({ type: "reaction", memberId: ana.id, reaction: "fire" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.messages.filter((m) => m.type === "reaction").length).toBe(1);
  });

  it("refuses reactions when turned off", async () => {
    const { code, host } = await hostRoom({ player: false });
    const ana = await guest(code, "Ana");
    await host.act({ type: "update_settings", settings: { reactions: false } });
    expect(await ana.client.expectError({ type: "react", reaction: "fire" })).toBe("not_allowed");
  });
});
