import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AuthResponse, FavoritesResponse, FriendsResponse, MeResponse, PartiesResponse, RoomState } from "@karaoke-tube/shared";
import { BASE, TestClient, createRoom, song } from "./helpers";

let n = 0;
const name = () => `user${++n}${Math.random().toString(36).slice(2, 6)}`;

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  return SELF.fetch(`${BASE}/api/account${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function signUp(username = name(), password = "hunter2hunter2") {
  const res = await api("/register", { body: { username, password, displayName: "Ana", avatarSeed: "s1" } });
  expect(res.status).toBe(201);
  return { ...(await res.json<AuthResponse>()), username, password };
}

describe("accounts", () => {
  it("registers, logs in, and rejects bad input and duplicates", async () => {
    const a = await signUp();
    expect((await api("/register", { body: { username: a.username.toUpperCase(), password: "another-pass" } })).status).toBe(409);
    expect((await api("/register", { body: { username: "x", password: "another-pass" } })).status).toBe(400);
    expect((await api("/register", { body: { username: name(), password: "short" } })).status).toBe(400);
    expect((await api("/login", { body: { username: a.username, password: "wrong-password" } })).status).toBe(401);
    const login = await api("/login", { body: { username: a.username, password: a.password } });
    expect(login.status).toBe(200);
    expect((await login.json<AuthResponse>()).account.displayName).toBe("Ana");
  });

  it("needs a token, and logout kills it", async () => {
    expect((await api("/me")).status).toBe(401);
    expect((await api("/me", { token: "0".repeat(64) })).status).toBe(401);
    const a = await signUp();
    expect((await api("/me", { token: a.token })).status).toBe(200);
    await api("/logout", { method: "POST", token: a.token });
    expect((await api("/me", { token: a.token })).status).toBe(401);
  });

  it("saves profile and room settings, and never returns the password", async () => {
    const a = await signUp();
    const res = await api("/me", { method: "PATCH", token: a.token, body: { displayName: "Ana B", tagline: "Queen of ballads", roomSettings: { queueMode: "fifo", locked: true, bogus: 1 } } });
    const me = await res.json<MeResponse>();
    expect(me.account.displayName).toBe("Ana B");
    expect(me.account.roomSettings).toEqual({ queueMode: "fifo" }); // unknown keys and `locked` dropped
    expect(JSON.stringify(me)).not.toContain("pw_");
  });

  it("applies saved settings to rooms the account starts, and guests still get defaults", async () => {
    const a = await signUp();
    await api("/me", { method: "PATCH", token: a.token, body: { roomSettings: { queueMode: "approval", countdownSec: 9 } } });
    const mk = async (token?: string) => {
      const res = await SELF.fetch(`${BASE}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ nickname: "H", avatarSeed: "s" }),
      });
      const created = await res.json<{ code: string; memberId: string; key: string }>();
      const ws = await TestClient.open(created.code);
      const w = await ws.request({ type: "rejoin", memberId: created.memberId, key: created.key }, "welcome");
      return { ...created, state: w.state as RoomState };
    };
    expect((await mk(a.token)).state.settings).toMatchObject({ queueMode: "approval", countdownSec: 9 });
    expect((await mk()).state.settings).toMatchObject({ queueMode: "rotation", countdownSec: 5 });
  });

  it("keeps favorites per account", async () => {
    const a = await signUp();
    const b = await signUp();
    const s = song("Love Song");
    expect((await api("/favorites", { method: "PUT", token: a.token, body: { song: s } })).status).toBe(200);
    expect((await api("/favorites", { method: "PUT", token: a.token, body: { song: { nope: 1 } } })).status).toBe(400);
    expect((await (await api("/favorites", { token: a.token })).json<FavoritesResponse>()).favorites.map((f) => f.song.title)).toEqual(["Love Song"]);
    expect((await (await api("/favorites", { token: b.token })).json<FavoritesResponse>()).favorites).toHaveLength(0);
    await api(`/favorites/${s.videoId}`, { method: "DELETE", token: a.token });
    expect((await (await api("/favorites", { token: a.token })).json<FavoritesResponse>()).favorites).toHaveLength(0);
  });

  it("handles friend requests: send, accept, decline, remove", async () => {
    const a = await signUp();
    const b = await signUp();
    expect((await api("/friends", { token: a.token, body: { username: "nobody-here" } })).status).toBe(404);
    expect((await api("/friends", { token: a.token, body: { username: a.username } })).status).toBe(400);
    const sent = await (await api("/friends", { token: a.token, body: { username: b.username } })).json<FriendsResponse>();
    expect(sent.friends[0]).toMatchObject({ status: "outgoing" });
    const incoming = await (await api("/friends", { token: b.token })).json<FriendsResponse>();
    expect(incoming.friends[0]).toMatchObject({ status: "incoming" });
    expect((await api(`/friends/${b.account.id}/accept`, { token: a.token, body: {} })).status).toBe(404); // can't accept your own request
    const accepted = await (await api(`/friends/${a.account.id}/accept`, { token: b.token, body: {} })).json<FriendsResponse>();
    expect(accepted.friends[0]).toMatchObject({ status: "friend" });
    expect((await (await api("/friends", { token: a.token })).json<FriendsResponse>()).friends[0]!.profile.username).toBe(b.username);
    const removed = await (await api(`/friends/${a.account.id}`, { method: "DELETE", token: b.token })).json<FriendsResponse>();
    expect(removed.friends).toHaveLength(0);
    // asking back after they asked = accept
    await api("/friends", { token: a.token, body: { username: b.username } });
    const mutual = await (await api("/friends", { token: b.token, body: { username: a.username } })).json<FriendsResponse>();
    expect(mutual.friends[0]).toMatchObject({ status: "friend" });
  });

  it("logs parties the member really attended, and fills in the recap after the night", async () => {
    const a = await signUp();
    const created = await createRoom("Ana");
    const host = await TestClient.open(created.code, "?player=1");
    await host.request({ type: "rejoin", memberId: created.memberId, key: created.key }, "welcome");
    const log = (body: object) => api("/parties", { token: a.token, body });

    expect((await log({ code: created.code, memberId: created.memberId, key: "wrong" })).status).toBe(404);
    expect((await log({ code: created.code, memberId: created.memberId, key: created.key })).status).toBe(200);
    let parties = await (await api("/parties", { token: a.token })).json<PartiesResponse>();
    expect(parties.parties).toHaveLength(1);
    expect(parties.parties[0]).toMatchObject({ code: created.code, role: "host", endedAt: null, recapId: null });

    await host.act({ type: "add_song", song: song("Dancing Queen") });
    await host.act({ type: "end_party" });
    await log({ code: created.code, memberId: created.memberId, key: created.key });
    parties = await (await api("/parties", { token: a.token })).json<PartiesResponse>();
    expect(parties.parties).toHaveLength(1); // refreshed, not duplicated
    expect(parties.parties[0]!.endedAt).not.toBeNull();
    expect(parties.parties[0]!.recapId).toMatch(/^[0-9a-f]{16}$/);

    const me = await (await api("/me", { token: a.token })).json<MeResponse>();
    expect(me.stats).toMatchObject({ parties: 1, hosted: 1 });
  });

  it("changes password (other devices signed out) and deletes the account", async () => {
    const a = await signUp();
    const second = await (await api("/login", { body: { username: a.username, password: a.password } })).json<AuthResponse>();
    expect((await api("/password", { token: a.token, body: { current: "nope-nope", next: "brand-new-pass" } })).status).toBe(401);
    expect((await api("/password", { token: a.token, body: { current: a.password, next: "brand-new-pass" } })).status).toBe(200);
    expect((await api("/me", { token: second.token })).status).toBe(401);
    expect((await api("/me", { token: a.token })).status).toBe(200);
    expect((await api("", { method: "DELETE", token: a.token, body: { password: "wrong-wrong" } })).status).toBe(401);
    expect((await api("", { method: "DELETE", token: a.token, body: { password: "brand-new-pass" } })).status).toBe(200);
    expect((await api("/login", { body: { username: a.username, password: "brand-new-pass" } })).status).toBe(401);
  });

  it("guests are unaffected: rooms work with no account at all", async () => {
    const created = await createRoom("Guest host");
    expect(created.code).toBeTruthy();
  });
});
