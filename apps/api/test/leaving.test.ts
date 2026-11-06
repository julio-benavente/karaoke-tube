import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TestClient, guest, hostRoom, song } from "./helpers";

const stubFor = (code: string) => env.ROOM.get(env.ROOM.idFromName(code));
const setMeta = (code: string, key: string, value: unknown) =>
  runInDurableObject(stubFor(code), async (_room, state) => {
    state.storage.sql.exec("UPDATE meta SET value = ? WHERE key = ?", JSON.stringify(value), key);
  });

describe("leaving", () => {
  it("a guest who leaves is removed with their waiting songs; others' songs stay", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await host.act({ type: "add_song", song: song("Warmup") });
    await ana.client.act({ type: "add_song", song: song("Ana 1") });
    await ben.client.act({ type: "add_song", song: song("Ben 1") });
    await ana.client.act({ type: "add_song", song: song("Ana 2") });

    ana.client.send({ type: "leave" });
    const state = await host.waitForState((s) => !s.members.some((m) => m.id === ana.id));
    const titles = [state.nowPlaying, ...state.upNext].filter(Boolean).map((i) => i!.song.title);
    expect(titles).toContain("Ben 1");
    expect(titles.some((t) => t.startsWith("Ana"))).toBe(false);
    expect(state.members.map((m) => m.nickname).sort()).toEqual(expect.arrayContaining(["Ben"]));
  });

  it("someone singing right now who leaves is skipped, and the next song starts", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await ana.client.act({ type: "add_song", song: song("Ana now") });
    await ben.client.act({ type: "add_song", song: song("Ben next") });
    let state = await host.waitForState((s) => s.nowPlaying?.song.title === "Ana now");
    expect(state.nowPlaying?.singerIds).toEqual([ana.id]);

    ana.client.send({ type: "leave" });
    state = await host.waitForState((s) => s.nowPlaying?.song.title === "Ben next");
    expect(state.members.some((m) => m.id === ana.id)).toBe(false);
  });

  it("a duet keeps going for the partner who stays", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await host.act({ type: "update_settings", settings: { duets: true } });
    await host.act({ type: "add_song", song: song("Opener") });
    await ana.client.act({ type: "add_song", song: song("Duet"), singerIds: [ana.id, ben.id] });
    ana.client.send({ type: "leave" });
    const state = await host.waitForState((s) => !s.members.some((m) => m.id === ana.id));
    const duet = state.upNext.find((i) => i.song.title === "Duet");
    expect(duet?.singerIds).toEqual([ben.id]);
  });

  it("the host leaving on purpose ends the party", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    host.send({ type: "leave" });
    const state = await ana.client.waitForState((s) => s.status === "ended");
    expect(state.status).toBe("ended");
  });

  it("hosts can clear all of a member's songs, but guests cannot", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await host.act({ type: "add_song", song: song("Opener") });
    await ana.client.act({ type: "add_song", song: song("Ana 1") });
    await ana.client.act({ type: "add_song", song: song("Ana 2") });
    await ben.client.act({ type: "add_song", song: song("Ben 1") });

    await host.waitForState((s) => s.upNext.some((i) => i.song.title === "Ben 1") && s.upNext.some((i) => i.song.title === "Ana 2"));
    expect(await ben.client.expectError({ type: "remove_member_songs", memberId: ana.id })).toBe("not_allowed");
    host.send({ type: "remove_member_songs", memberId: ana.id });
    const state = await host.waitForState((s) => !s.upNext.some((i) => i.singerIds.includes(ana.id)) && s.upNext.length > 0);
    expect(state.members.some((m) => m.id === ana.id)).toBe(true); // still in the party, just no songs
    expect(state.upNext.some((i) => i.song.title === "Ben 1")).toBe(true);
  });
});

describe("host offline", () => {
  it("hands the party to the co-host after a minute, and the old host stays on as co-host", async () => {
    const { code, host, memberId, key } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    await host.act({ type: "set_role", memberId: ben.id, role: "cohost" });

    host.close();
    await ana.client.waitForState((s) => s.members.some((m) => m.id === memberId && !m.connected));
    // Too early: nothing changes.
    await runDurableObjectAlarm(stubFor(code));
    let state = await ana.client.waitForState((s) => s.members.length === 3);
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("host");

    await setMeta(code, "hostOfflineSince", Date.now() - 61_000);
    await runDurableObjectAlarm(stubFor(code));
    state = await ana.client.waitForState((s) => s.members.find((m) => m.id === ben.id)?.role === "host");
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("cohost");
    expect(state.members.find((m) => m.id === ana.id)?.role).toBe("guest"); // the co-host came first
    expect(state.tempHostId).toBe(ben.id); // Ben is only standing in
    expect(state.realHostId).toBe(memberId);

    // The stand-in can't demote or remove the real host while they are away.
    expect(await ben.client.expectError({ type: "set_role", memberId, role: "guest" })).toBe("not_allowed");
    expect(await ben.client.expectError({ type: "kick", memberId })).toBe("not_allowed");

    // The real host comes back: host again, and Ben returns to co-host.
    const back = await TestClient.open(code);
    const welcome = await back.request({ type: "rejoin", memberId, key }, "welcome");
    expect(welcome.state.members.find((m) => m.id === memberId)?.role).toBe("host");
    expect(welcome.state.tempHostId).toBeNull();
    expect(welcome.state.realHostId).toBeNull();
    state = await ana.client.waitForState((s) => s.members.find((m) => m.id === ben.id)?.role === "cohost");
    expect(state.members.filter((m) => m.role === "host").map((m) => m.id)).toEqual([memberId]);
  });

  it("a stand-in who was a guest goes back to guest when the host returns", async () => {
    const { code, host, memberId, key } = await hostRoom();
    const ana = await guest(code, "Ana");
    await guest(code, "Ben");
    host.close();
    await ana.client.waitForState((s) => s.members.some((m) => m.role === "host" && !m.connected));
    await setMeta(code, "hostOfflineSince", Date.now() - 61_000);
    await runDurableObjectAlarm(stubFor(code));
    await ana.client.waitForState((s) => s.tempHostId === ana.id);
    const back = await TestClient.open(code);
    await back.request({ type: "rejoin", memberId, key }, "welcome");
    const state = await ana.client.waitForState((s) => s.tempHostId === null);
    expect(state.members.find((m) => m.id === ana.id)?.role).toBe("guest");
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("host");
  });

  it("a stand-in who leaves gives the seat back instead of ending the party", async () => {
    const { code, host, memberId } = await hostRoom();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    host.close();
    await ben.client.waitForState((s) => s.members.some((m) => m.role === "host" && !m.connected));
    await setMeta(code, "hostOfflineSince", Date.now() - 61_000);
    await runDurableObjectAlarm(stubFor(code));
    await ben.client.waitForState((s) => s.tempHostId === ana.id);
    ana.client.send({ type: "leave" });
    const state = await ben.client.waitForState((s) => !s.members.some((m) => m.id === ana.id));
    expect(state.status).toBe("open");
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("host");
    expect(state.tempHostId).toBeNull();
  });

  it("falls back to the guest who has been here longest when there is no co-host", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    await guest(code, "Ben");
    host.close();
    await ana.client.waitForState((s) => s.members.some((m) => m.role === "host" && !m.connected));
    await setMeta(code, "hostOfflineSince", Date.now() - 61_000);
    await runDurableObjectAlarm(stubFor(code));
    const state = await ana.client.waitForState((s) => s.members.find((m) => m.id === ana.id)?.role === "host");
    expect(state.members.filter((m) => m.role === "host")).toHaveLength(1);
  });

  it("does nothing if the host comes back in time", async () => {
    const { code, host, memberId, key } = await hostRoom();
    const ana = await guest(code, "Ana");
    host.close();
    await ana.client.waitForState((s) => s.members.some((m) => m.id === memberId && !m.connected));
    const back = await TestClient.open(code);
    await back.request({ type: "rejoin", memberId, key }, "welcome");
    await setMeta(code, "hostOfflineSince", Date.now() - 61_000); // even a stale clock must not fire for a host who is back
    await runDurableObjectAlarm(stubFor(code));
    const state = await ana.client.waitForState((s) => s.members.find((m) => m.id === memberId)?.connected === true);
    expect(state.members.find((m) => m.id === memberId)?.role).toBe("host");
    expect(state.members.find((m) => m.id === ana.id)?.role).toBe("guest");
  });
});
