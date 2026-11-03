import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PairStartResponse, PairStatusResponse } from "@karaoke-tube/shared";
import { SCREEN_MEMBER_ID } from "@karaoke-tube/shared";
import { BASE, TestClient, guest, hostRoom, song } from "./helpers";

const post = (path: string, body?: unknown) =>
  SELF.fetch(`${BASE}/api/pair${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const start = async () => (await (await post("/start")).json()) as PairStartResponse;
const status = async (id: string) => (await (await SELF.fetch(`${BASE}/api/pair/${id}`)).json()) as PairStatusResponse;
const claim = (code: string, room: { code: string; memberId: string; key: string }) =>
  post("/claim", { code, roomCode: room.code, memberId: room.memberId, key: room.key });

/** Pairs a TV with the room and connects it as the screen. */
async function pairedScreen(room: { code: string; memberId: string; key: string }) {
  const tv = await start();
  expect((await claim(tv.code, room)).status).toBe(200);
  const done = await status(tv.id);
  if (done.state !== "paired") throw new Error("not paired");
  const screen = await TestClient.open(room.code);
  const welcome = await screen.request({ type: "rejoin", memberId: SCREEN_MEMBER_ID, key: done.screenKey }, "welcome");
  return { screen, key: done.screenKey, welcome };
}

describe("TV pairing", () => {
  it("hands a TV a short code, then the room's screen key once the host enters it", async () => {
    const tv = await start();
    expect(tv.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(await status(tv.id)).toEqual({ state: "waiting" });

    const room = await hostRoom({ player: false });
    expect((await claim(tv.code.toLowerCase(), room)).status).toBe(200); // typing in lower case is fine
    const done = await status(tv.id);
    expect(done).toMatchObject({ state: "paired", roomCode: room.code });
    expect(await status(tv.id)).toEqual({ state: "expired" }); // handed over once
    expect((await claim(tv.code, room)).status).toBe(404); // and the code can't be used twice
  });

  it("a TV that asks for a new code invalidates its old one", async () => {
    const room = await hostRoom({ player: false });
    const first = await start();
    const res = await post("/start", { previous: first.id });
    const second = (await res.json()) as PairStartResponse;
    expect(second.code).not.toBe(first.code);
    expect(second.id).not.toBe(first.id);
    expect(await status(first.id)).toEqual({ state: "expired" });
    expect((await claim(first.code, room)).status).toBe(404); // the old code no longer works
    expect((await claim(second.code, room)).status).toBe(200); // the new one does
    expect(await status(second.id)).toMatchObject({ state: "paired", roomCode: room.code });
  });

  it("only a host can pair, and bad or unknown codes are refused", async () => {
    const room = await hostRoom({ player: false });
    const ana = await guest(room.code, "Ana");
    const tv = await start();
    expect((await claim(tv.code, { code: room.code, memberId: ana.id, key: ana.key })).status).toBe(403);
    expect((await claim(tv.code, { ...room, key: "wrong" })).status).toBe(403);
    expect((await claim("ZZZZZZ", room)).status).toBe(404);
    expect((await claim("nope", room)).status).toBe(400);
    expect(await status(tv.id)).toEqual({ state: "waiting" }); // nothing leaked to the TV
  });

  it("the paired screen is the player: it gets the songs, reports back, and cannot act as a member", async () => {
    const room = await hostRoom({ player: false });
    const { screen, welcome } = await pairedScreen(room);
    expect(welcome.state.screenPaired).toBe(true);
    expect(welcome.state.playerConnected).toBe(false);

    const state = await screen.act({ type: "player_status", tabOpen: true });
    expect(state.playerConnected).toBe(true);

    room.host.send({ type: "add_song", song: song("Screen song") });
    const stub = env.ROOM.get(env.ROOM.idFromName(room.code));
    await room.host.waitForState((s) => s.playback.state === "get_ready");
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const play = await screen.next("play");
    expect(play.item.song.title).toBe("Screen song");
    const started = await screen.act({ type: "player_event", event: "started", itemId: play.item.id });
    expect(started.playback.state).toBe("playing");

    expect(await screen.expectError({ type: "add_song", song: song("nope") })).toBe("not_allowed");
    expect(await screen.expectError({ type: "skip" })).toBe("not_allowed");
    expect(await screen.expectError({ type: "remove_screen" })).toBe("not_allowed");
  });

  it("a wrong or missing screen key is refused", async () => {
    const room = await hostRoom({ player: false });
    const wrong = await TestClient.open(room.code);
    wrong.send({ type: "rejoin", memberId: SCREEN_MEMBER_ID, key: "nope" });
    expect((await wrong.next("error")).code).toBe("bad_key");
    wrong.close();
  });

  it("the host can remove the screen: it is told, its key stops working, guests cannot", async () => {
    const room = await hostRoom({ player: false });
    const ana = await guest(room.code, "Ana");
    const { screen, key } = await pairedScreen(room);
    expect(await ana.client.expectError({ type: "remove_screen" })).toBe("not_allowed");

    room.host.send({ type: "remove_screen" });
    await screen.next("screen_removed");
    const state = await ana.client.waitForState((s) => s.screenPaired === false);
    expect(state.playerConnected).toBe(false);

    const again = await TestClient.open(room.code);
    again.send({ type: "rejoin", memberId: SCREEN_MEMBER_ID, key });
    expect((await again.next("error")).code).toBe("bad_key");
  });

  it("pairing another TV replaces the first one", async () => {
    const room = await hostRoom({ player: false });
    const first = await pairedScreen(room);
    const second = await pairedScreen(room);
    await first.screen.next("screen_removed");
    const old = await TestClient.open(room.code);
    old.send({ type: "rejoin", memberId: SCREEN_MEMBER_ID, key: first.key });
    expect((await old.next("error")).code).toBe("bad_key");
    const state = await second.screen.act({ type: "player_status", tabOpen: true });
    expect(state.playerConnected).toBe(true);
  });

  it("a stand-in host can pair and remove the screen too", async () => {
    const room = await hostRoom({ player: false });
    const ana = await guest(room.code, "Ana");
    room.host.close();
    await ana.client.waitForState((s) => s.members.some((m) => m.role === "host" && !m.connected));
    await runInDurableObject(env.ROOM.get(env.ROOM.idFromName(room.code)), async (_r, st) => {
      st.storage.sql.exec("UPDATE meta SET value = ? WHERE key = 'hostOfflineSince'", JSON.stringify(Date.now() - 61_000));
    });
    await runDurableObjectAlarm(env.ROOM.get(env.ROOM.idFromName(room.code)));
    await ana.client.waitForState((s) => s.tempHostId === ana.id);
    const { screen } = await pairedScreen({ code: room.code, memberId: ana.id, key: ana.key });
    ana.client.send({ type: "remove_screen" });
    await screen.next("screen_removed");
  });
});

describe("host presence with a TV", () => {
  it("a TV window opened with the host's login does not count as the host being here", async () => {
    const room = await hostRoom({ player: true }); // this socket is a TV opened with the host's credentials
    const ana = await guest(room.code, "Ana");
    // The host app (not the player) was never connected in this test; only the TV window is.
    await runInDurableObject(env.ROOM.get(env.ROOM.idFromName(room.code)), async (_r, st) => {
      const row = st.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'hostOfflineSince'").toArray()[0];
      expect(row).toBeTruthy();
      st.storage.sql.exec("UPDATE meta SET value = ? WHERE key = 'hostOfflineSince'", JSON.stringify(Date.now() - 61_000));
    });
    await runDurableObjectAlarm(env.ROOM.get(env.ROOM.idFromName(room.code)));
    const state = await ana.client.waitForState((s) => s.tempHostId === ana.id);
    expect(state.members.find((m) => m.id === ana.id)?.role).toBe("host");
  });
});
