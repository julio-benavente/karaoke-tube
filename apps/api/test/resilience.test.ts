import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { BASE, TestClient, createRoom, guest, hostRoom } from "./helpers";

const stubFor = (code: string) => env.ROOM.get(env.ROOM.idFromName(code));
const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("playerConnected", () => {
  it("is true only while the player socket is attached and reports its window open", async () => {
    const { code, host, memberId, key } = await hostRoom(); // host socket is the player (?player=1)
    const ana = await guest(code, "Ana");
    expect(ana.welcome.state.playerConnected).toBe(false);

    let state = await host.act({ type: "player_status", tabOpen: true });
    expect(state.playerConnected).toBe(true);
    await ana.client.waitForState((s) => s.playerConnected === true);

    state = await host.act({ type: "player_status", tabOpen: false });
    expect(state.playerConnected).toBe(false);

    await host.act({ type: "player_status", tabOpen: true });
    host.close();
    await ana.client.waitForState((s) => s.playerConnected === false && s.members.some((m) => m.id === memberId && !m.connected));

    // The player comes back (e.g. the service worker restarted): its last window status still holds.
    const back = await TestClient.open(code, "?player=1");
    const welcome = await back.request({ type: "rejoin", memberId, key }, "welcome");
    expect(welcome.state.playerConnected).toBe(true);
  });

  it("refuses player_status from anyone but the player", async () => {
    const { code, memberId, key } = await hostRoom();
    const ana = await guest(code, "Ana");
    expect(await ana.client.expectError({ type: "player_status", tabOpen: true })).toBe("not_allowed");
    const hostApp = await TestClient.open(code); // the host, but not the player
    await hostApp.request({ type: "rejoin", memberId, key }, "welcome");
    expect(await hostApp.expectError({ type: "player_status", tabOpen: true })).toBe("not_allowed");
  });
});

describe("abandoned parties", () => {
  it("end themselves after 12 hours with nobody connected", async () => {
    const { code, host } = await hostRoom();
    const ana = await guest(code, "Ana");
    host.close();
    ana.client.close();
    const stub = stubFor(code);
    // Give the room a moment to notice both sockets are gone.
    await new Promise((r) => setTimeout(r, 200));
    const idleSince = await runInDurableObject(stub, async (_room, state) =>
      JSON.parse(state.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'idleSince'").one().value),
    );
    expect(typeof idleSince).toBe("number");
    expect(await stub.info()).toMatchObject({ status: "open" });

    // Not yet 12 hours: the alarm leaves it open.
    await runDurableObjectAlarm(stub);
    expect(await stub.info()).toMatchObject({ status: "open" });

    // Pretend 13 hours have passed.
    await runInDurableObject(stub, async (_room, state) => {
      state.storage.sql.exec("UPDATE meta SET value = ? WHERE key = 'idleSince'", JSON.stringify(Date.now() - 13 * 3600_000));
    });
    await runDurableObjectAlarm(stub);
    expect(await stub.info()).toMatchObject({ status: "ended" });
    const info = await (await SELF.fetch(`${BASE}/api/rooms/${code}`)).json<{ status: string }>();
    expect(info.status).toBe("ended");
  });

  it("end themselves even if nobody ever connected", async () => {
    const { code } = await createRoom();
    const stub = stubFor(code);
    await runDurableObjectAlarm(stub);
    expect(await stub.info()).toMatchObject({ status: "open" });
    await runInDurableObject(stub, async (_room, state) => {
      state.storage.sql.exec("UPDATE meta SET value = ? WHERE key = 'idleSince'", JSON.stringify(Date.now() - 13 * 3600_000));
    });
    await runDurableObjectAlarm(stub);
    expect(await stub.info()).toMatchObject({ status: "ended" });
  });

  it("stop the idle clock when someone reconnects", async () => {
    const { code, host, memberId, key } = await hostRoom();
    host.close();
    await new Promise((r) => setTimeout(r, 200));
    const stub = stubFor(code);
    const back = await TestClient.open(code);
    await back.request({ type: "rejoin", memberId, key }, "welcome");
    const idleSince = await runInDurableObject(stub, async (_room, state) =>
      JSON.parse(state.storage.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'idleSince'").one().value),
    );
    expect(idleSince).toBeNull();
  });
});

describe("heartbeat", () => {
  it("answers ping with pong", async () => {
    const { host } = await hostRoom();
    host.ws.send("ping");
    await until(() => host.pongs > 0);
    expect(host.pongs).toBe(1);
  });
});
