import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { RecapResponse } from "@karaoke-tube/shared";
import { BASE, guest, hostRoom, song } from "./helpers";

/** Host is the player; get-ready card off so songs start right away. */
async function party() {
  const room = await hostRoom();
  await room.host.act({ type: "update_settings", settings: { getReadyCard: false, maxWaitingPerMember: 5 } });
  return room;
}

describe("C1 duets & group songs", () => {
  it("a guest can add a duet with a partner; it counts for both in the queue limit", async () => {
    const { code, host } = await party();
    await host.act({ type: "update_settings", settings: { maxWaitingPerMember: 1 } });
    await host.act({ type: "add_song", song: song("now") }); // plays now, so the rest waits
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    const state = await ana.client.act({ type: "add_song", song: song("duet"), singerIds: [ana.id, ben.id] });
    expect(state.upNext.at(-1)?.singerIds).toEqual([ana.id, ben.id]);
    expect(await ben.client.expectError({ type: "add_song", song: song() })).toBe("queue_limit");
  });

  it("a guest must sing in their own duet", async () => {
    const { code } = await party();
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    const cleo = await guest(code, "Cleo");
    expect(await ana.client.expectError({ type: "add_song", song: song(), singerIds: [ben.id, cleo.id] })).toBe("not_allowed");
  });

  it("'everyone sings' is marked on the item", async () => {
    const { host } = await party();
    await host.act({ type: "add_song", song: song("now") });
    const state = await host.act({ type: "add_song", song: song("all"), everyone: true });
    expect(state.upNext.at(-1)?.everyone).toBe(true);
  });

  it("with duets off, duets and group songs are refused", async () => {
    const { code, host } = await party();
    await host.act({ type: "update_settings", settings: { duets: false } });
    const ana = await guest(code, "Ana");
    const ben = await guest(code, "Ben");
    expect(await ana.client.expectError({ type: "add_song", song: song(), singerIds: [ana.id, ben.id] })).toBe("not_allowed");
    expect(await ana.client.expectError({ type: "add_song", song: song(), everyone: true })).toBe("not_allowed");
  });
});

describe("hide explicit songs", () => {
  it("keeps the explicit and duet flags, and refuses explicit songs once the host hides them", async () => {
    const { host } = await party();
    await host.act({ type: "add_song", song: song("now") });
    const flagged = await host.act({ type: "add_song", song: { ...song("spicy"), explicit: true, duet: true } });
    expect(flagged.upNext.at(-1)?.song).toMatchObject({ explicit: true, duet: true });
    const state = await host.act({ type: "update_settings", settings: { hideExplicit: true } });
    expect(state.settings.hideExplicit).toBe(true);
    expect(await host.expectError({ type: "add_song", song: { ...song("spicy 2"), explicit: true } })).toBe("explicit_hidden");
    await host.act({ type: "add_song", song: song("clean") });
  });
});

describe("C6 host picks", () => {
  it("guests' songs wait for approval; hosts approve or decline", async () => {
    const { code, host } = await party();
    await host.act({ type: "update_settings", settings: { queueMode: "approval" } });
    await host.act({ type: "add_song", song: song("host song") }); // hosts skip the line
    const ana = await guest(code, "Ana");
    let state = await ana.client.act({ type: "add_song", song: song("ana 1") });
    state = await ana.client.act({ type: "add_song", song: song("ana 2") });
    expect(state.pending?.map((i) => i.song.title)).toEqual(["ana 1", "ana 2"]);
    expect(state.pending?.every((i) => i.status === "pending")).toBe(true);
    expect(state.upNext).toEqual([]);

    expect(await ana.client.expectError({ type: "approve_song", itemId: state.pending![0]!.id })).toBe("not_allowed");
    state = await host.act({ type: "approve_song", itemId: state.pending![0]!.id });
    expect(state.upNext.map((i) => i.song.title)).toEqual(["ana 1"]);
    state = await host.act({ type: "decline_song", itemId: state.pending![0]!.id });
    expect(state.pending).toEqual([]);
  });

  it("guests can take back their own pending song; leaving the mode lets pending songs in", async () => {
    const { code, host } = await party();
    await host.act({ type: "update_settings", settings: { queueMode: "approval" } });
    await host.act({ type: "add_song", song: song("now") });
    const ana = await guest(code, "Ana");
    let state = await ana.client.act({ type: "add_song", song: song("a") });
    state = await ana.client.act({ type: "remove_song", itemId: state.pending![0]!.id });
    expect(state.pending).toEqual([]);
    await ana.client.act({ type: "add_song", song: song("b") });
    state = await host.act({ type: "update_settings", settings: { queueMode: "rotation" } });
    expect(state.pending).toEqual([]);
    expect(state.upNext.map((i) => i.song.title)).toEqual(["b"]);
  });
});

describe("C3 awards", () => {
  async function performed() {
    const room = await party();
    const ana = await guest(room.code, "Ana");
    const ben = await guest(room.code, "Ben");
    await ana.client.act({ type: "add_song", song: song("ana sings") });
    const play = await room.host.next("play");
    await room.host.act({ type: "player_event", event: "started", itemId: play.item.id });
    return { ...room, ana, ben, itemId: play.item.id };
  }

  it("after a song, others can give one award each; singers can't", async () => {
    const { host, ana, ben, itemId } = await performed();
    let state = await host.act({ type: "player_event", event: "ended", itemId });
    expect(state.awardWindow?.item.id).toBe(itemId);
    expect(state.awardWindow!.closesAt).toBeGreaterThan(Date.now());

    state = await ben.client.act({ type: "give_award", itemId, award: "nailed_it" });
    expect(state.awardWindow?.counts).toEqual({ nailed_it: 1 });
    expect(state.awardWindow?.givenBy).toEqual([ben.id]);
    expect(await ben.client.expectError({ type: "give_award", itemId, award: "great_vibes" })).toBe("not_allowed");
    expect(await ana.client.expectError({ type: "give_award", itemId, award: "great_vibes" })).toBe("not_allowed");
    state = await host.act({ type: "give_award", itemId, award: "great_vibes" });
    expect(state.awardWindow?.counts).toEqual({ nailed_it: 1, great_vibes: 1 });
  });

  it("no awards for a song that never started, or when awards are off", async () => {
    const { code, host } = await party();
    const ana = await guest(code, "Ana");
    await ana.client.act({ type: "add_song", song: song() });
    const play = await host.next("play");
    let state = await host.act({ type: "player_event", event: "error", itemId: play.item.id });
    expect(state.awardWindow ?? null).toBeNull();

    const again = await performed();
    await again.host.act({ type: "update_settings", settings: { awards: false } });
    state = await again.host.act({ type: "player_event", event: "ended", itemId: again.itemId });
    expect(state.awardWindow ?? null).toBeNull();
    expect(await again.ben.client.expectError({ type: "give_award", itemId: again.itemId, award: "brave_pick" })).toBe("not_allowed");
  });
});

describe("C4 recap & titles", () => {
  it("ending the party builds a recap with titles for everyone, readable at /api/recaps/:id", async () => {
    const { host, ana, ben, itemId } = await (async () => {
      const room = await party();
      const ana = await guest(room.code, "Ana");
      const ben = await guest(room.code, "Ben");
      await ana.client.act({ type: "add_song", song: song("ana sings") });
      const play = await room.host.next("play");
      await room.host.act({ type: "player_event", event: "started", itemId: play.item.id });
      return { ...room, ana, ben, itemId: play.item.id };
    })();
    ben.client.send({ type: "react", reaction: "fire" });
    await host.act({ type: "player_event", event: "ended", itemId });
    await ben.client.act({ type: "give_award", itemId, award: "crowd_pleaser" });
    host.send({ type: "end_party" });
    const state = await host.waitForState((s) => s.status === "ended");
    const recap = state.recap!;
    expect(recap.performances.map((p) => p.item.song.title)).toEqual(["ana sings"]);
    expect(recap.performances[0]!.cheers).toBe(2);
    expect(recap.topMoment?.item.id).toBe(itemId);
    for (const m of recap.members) expect(recap.titles[m.id]!.length).toBeGreaterThanOrEqual(2);
    expect(recap.titles[ana.id]).toContain("showstopper");
    expect(recap.titles[ben.id]).toContain("biggest_fan");

    const res = await SELF.fetch(`${BASE}/api/recaps/${recap.id}`);
    expect(res.status).toBe(200);
    expect((await res.json<RecapResponse>()).recap.id).toBe(recap.id);
    expect((await SELF.fetch(`${BASE}/api/recaps/0000000000000000`)).status).toBe(404);
  });

  it("a party where nobody sang still ends with a recap, 2+ titles each and an unguessable id", async () => {
    const { host, code } = await party();
    await guest(code, "Ana");
    host.send({ type: "end_party" });
    const recap = (await host.waitForState((s) => s.status === "ended")).recap!;
    expect(recap.id).toMatch(/^[0-9a-f]{16}$/);
    expect(recap.id).not.toContain(code);
    expect(recap.performances).toEqual([]);
    expect(recap.topMoment).toBeNull();
    for (const m of recap.members) expect(recap.titles[m.id]!.length).toBeGreaterThanOrEqual(2);
  });

  it("with titles off the recap has no titles", async () => {
    const { host } = await party();
    await host.act({ type: "update_settings", settings: { titles: false } });
    host.send({ type: "end_party" });
    const state = await host.waitForState((s) => s.status === "ended");
    expect(state.recap?.titles).toEqual({});
  });
});

describe("phoneless guests", () => {
  it("a host adds a guest without a phone; songs for them take their turns", async () => {
    const { code, host } = await party();
    const ana = await guest(code, "Ana");
    await host.act({ type: "add_song", song: song("now") });
    let state = await host.act({ type: "add_guest", nickname: "Abuela", avatarSeed: "abu" });
    const abuela = state.members.find((m) => m.nickname === "Abuela")!;
    expect(abuela.phoneless).toBe(true);
    expect(abuela.connected).toBe(true);
    state = await host.act({ type: "add_song", song: song("for abuela"), singerIds: [abuela.id] });
    expect(state.upNext.at(-1)?.singerIds).toEqual([abuela.id]);
    expect(state.upNext.at(-1)?.addedBy).toBe(state.members.find((m) => m.role === "host")!.id);
    // Rotation: Ana's and Abuela's first songs come before a second one from the host.
    await ana.client.act({ type: "add_song", song: song("ana") });
    state = await host.act({ type: "add_song", song: song("host 2") });
    expect(state.upNext.map((i) => i.song.title).at(-1)).toBe("host 2");
  });

  it("guests can't add guests, co-hosts can, and a phoneless guest can't be a co-host", async () => {
    const { code, host } = await party();
    const ana = await guest(code, "Ana");
    expect(await ana.client.expectError({ type: "add_guest", nickname: "Tio", avatarSeed: "x" })).toBe("not_allowed");
    await host.act({ type: "set_role", memberId: ana.id, role: "cohost" });
    const state = await ana.client.act({ type: "add_guest", nickname: "Tio", avatarSeed: "x" });
    const tio = state.members.find((m) => m.nickname === "Tio")!;
    expect(await host.expectError({ type: "set_role", memberId: tio.id, role: "cohost" })).toBe("not_allowed");
    const after = await host.act({ type: "kick", memberId: tio.id });
    expect(after.members.some((m) => m.id === tio.id)).toBe(false);
  });
});
