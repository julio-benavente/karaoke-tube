import { Hono, type Context, type Next } from "hono";
import {
  MIN_PASSWORD,
  USERNAME_RE,
  type Account,
  type AccountErrorCode,
  type AccountErrorResponse,
  type AccountStats,
  type AuthResponse,
  type FavoriteSong,
  type Friend,
  type PartyLogEntry,
  type PublicProfile,
  type RoomSettings,
  type Song,
} from "@karaoke-tube/shared";
import { normalizeRoomCode, isRoomCode } from "@karaoke-tube/shared";
import { ensureSchema, hashPassword, randomHex, safeEqual, sha256, SESSION_TTL_MS } from "../accounts/db";

export type UserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_seed: string;
  tagline: string;
  room_settings: string | null;
  pw_salt: string;
  pw_hash: string;
  created_at: number;
};

type Vars = { user: UserRow };
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const fail = (c: Context, status: 400 | 401 | 404 | 409 | 429, error: AccountErrorCode, message: string) =>
  c.json({ error, message } satisfies AccountErrorResponse, status);

const profile = (u: UserRow): PublicProfile => ({
  id: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarSeed: u.avatar_seed,
  tagline: u.tagline,
});

const toAccount = (u: UserRow): Account => ({
  ...profile(u),
  createdAt: u.created_at,
  roomSettings: u.room_settings ? (JSON.parse(u.room_settings) as Partial<RoomSettings>) : null,
});

const text = (v: unknown, max: number): string | null => (typeof v === "string" ? v.trim().slice(0, max) : null);

/** Only keys we know, with the right types. Same rules the room applies. */
export function cleanSettings(input: unknown): Partial<RoomSettings> {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Partial<RoomSettings> = {};
  if (s.queueMode === "rotation" || s.queueMode === "fifo" || s.queueMode === "approval") out.queueMode = s.queueMode;
  if (typeof s.maxWaitingPerMember === "number" && Number.isFinite(s.maxWaitingPerMember)) out.maxWaitingPerMember = Math.max(1, Math.min(20, Math.trunc(s.maxWaitingPerMember)));
  if (typeof s.countdownSec === "number" && Number.isFinite(s.countdownSec)) out.countdownSec = Math.max(0, Math.min(30, Math.trunc(s.countdownSec)));
  if (s.joinInfo === "between" || s.joinInfo === "always" || s.joinInfo === "start") out.joinInfo = s.joinInfo;
  for (const k of ["hostsOnlyAdd", "reactions", "getReadyCard", "duets", "turnAlerts", "awards", "titles"] as const) {
    if (typeof s[k] === "boolean") out[k] = s[k];
  }
  return out;
}

function cleanSong(v: unknown): Song | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (typeof s.videoId !== "string" || !s.videoId || s.videoId.length > 64) return null;
  if (typeof s.title !== "string" || typeof s.channel !== "string" || typeof s.thumbnailUrl !== "string") return null;
  return {
    videoId: s.videoId,
    title: s.title.slice(0, 300),
    channel: s.channel.slice(0, 200),
    durationSec: typeof s.durationSec === "number" && Number.isFinite(s.durationSec) ? s.durationSec : 0,
    thumbnailUrl: s.thumbnailUrl.slice(0, 500),
  };
}

/** The user for a Bearer token, or null. */
export async function userFromRequest(env: Env, req: Request): Promise<UserRow | null> {
  const m = /^Bearer\s+([0-9a-f]{64})$/.exec(req.headers.get("Authorization") ?? "");
  if (!m) return null;
  await ensureSchema(env.DB);
  return env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  )
    .bind(await sha256(m[1]!), Date.now())
    .first<UserRow>();
}

const authLimit = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const ip = c.req.header("CF-Connecting-IP");
  if (ip && !(await c.env.AUTH_LIMITER.limit({ key: ip })).success) {
    return fail(c, 429, "too_many_requests", "Too many tries, wait a minute and try again");
  }
  await next();
};

async function newSession(env: Env, userId: string): Promise<string> {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, Date.now() + SESSION_TTL_MS)
    .run();
  return token;
}

async function stats(db: D1Database, userId: string): Promise<AccountStats> {
  const [parties, fav, friends] = await db.batch([
    db.prepare("SELECT entry FROM parties WHERE user_id = ?").bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?").bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM friendships WHERE accepted_at IS NOT NULL AND (a = ?1 OR b = ?1)").bind(userId),
  ]);
  const entries = (parties!.results as { entry: string }[]).map((r) => JSON.parse(r.entry) as PartyLogEntry);
  return {
    parties: entries.length,
    hosted: entries.filter((e) => e.role === "host").length,
    songsSung: entries.reduce((n, e) => n + e.songsSung, 0),
    cheers: entries.reduce((n, e) => n + e.cheers, 0),
    favorites: (fav!.results[0] as { n: number }).n,
    friends: (friends!.results[0] as { n: number }).n,
  };
}

export const accountRoutes = new Hono<{ Bindings: Env; Variables: Vars }>()
  .use("*", async (c, next) => {
    await ensureSchema(c.env.DB);
    await next();
  })

  .post("/register", authLimit, async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const username = text(body.username, 40)?.toLowerCase() ?? "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!USERNAME_RE.test(username)) return fail(c, 400, "bad_request", "Username: 3–20 letters, numbers or _");
    if (password.length < MIN_PASSWORD || password.length > 200) return fail(c, 400, "bad_request", `Password needs at least ${MIN_PASSWORD} characters`);
    const id = crypto.randomUUID();
    const salt = randomHex(16);
    const user: UserRow = {
      id,
      username,
      display_name: text(body.displayName, 20) || username,
      avatar_seed: text(body.avatarSeed, 64) || randomHex(4),
      tagline: "",
      room_settings: null,
      pw_salt: salt,
      pw_hash: await hashPassword(password, salt),
      created_at: Date.now(),
    };
    try {
      await c.env.DB.prepare(
        "INSERT INTO users (id, username, display_name, avatar_seed, tagline, room_settings, pw_salt, pw_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(user.id, user.username, user.display_name, user.avatar_seed, user.tagline, null, user.pw_salt, user.pw_hash, user.created_at)
        .run();
    } catch {
      return fail(c, 409, "username_taken", "That username is taken");
    }
    return c.json({ token: await newSession(c.env, id), account: toAccount(user) } satisfies AuthResponse, 201);
  })

  .post("/login", authLimit, async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const username = text(body.username, 40)?.toLowerCase() ?? "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
    // Hash even for unknown users so timing doesn't reveal which usernames exist.
    const hash = await hashPassword(password, user?.pw_salt ?? "0".repeat(32));
    if (!user || !safeEqual(hash, user.pw_hash)) return fail(c, 401, "bad_credentials", "Wrong username or password");
    return c.json({ token: await newSession(c.env, user.id), account: toAccount(user) } satisfies AuthResponse);
  })

  // Everything below needs a signed-in account.
  .use("*", async (c, next) => {
    const user = await userFromRequest(c.env, c.req.raw);
    if (!user) return fail(c, 401, "unauthorized", "Sign in first");
    c.set("user", user);
    await next();
  })

  .post("/logout", async (c) => {
    const token = c.req.header("Authorization")!.slice(7);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return c.json({ ok: true });
  })

  .get("/me", async (c) => {
    const u = c.get("user");
    return c.json({ account: toAccount(u), stats: await stats(c.env.DB, u.id) });
  })

  .patch("/me", async (c) => {
    const u = c.get("user");
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const displayName = body.displayName === undefined ? u.display_name : text(body.displayName, 20);
    const avatarSeed = body.avatarSeed === undefined ? u.avatar_seed : text(body.avatarSeed, 64);
    const tagline = body.tagline === undefined ? u.tagline : text(body.tagline, 80);
    if (!displayName || !avatarSeed || tagline === null) return fail(c, 400, "bad_request", "Name and avatar can't be empty");
    const settings = body.roomSettings === undefined ? u.room_settings : body.roomSettings === null ? null : JSON.stringify(cleanSettings(body.roomSettings));
    await c.env.DB.prepare("UPDATE users SET display_name = ?, avatar_seed = ?, tagline = ?, room_settings = ? WHERE id = ?")
      .bind(displayName, avatarSeed, tagline, settings, u.id)
      .run();
    const next = { ...u, display_name: displayName, avatar_seed: avatarSeed, tagline, room_settings: settings };
    return c.json({ account: toAccount(next), stats: await stats(c.env.DB, u.id) });
  })

  .post("/password", authLimit, async (c) => {
    const u = c.get("user");
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const current = typeof body.current === "string" ? body.current : "";
    const next = typeof body.next === "string" ? body.next : "";
    if (!safeEqual(await hashPassword(current, u.pw_salt), u.pw_hash)) return fail(c, 401, "bad_credentials", "Current password is wrong");
    if (next.length < MIN_PASSWORD || next.length > 200) return fail(c, 400, "bad_request", `Password needs at least ${MIN_PASSWORD} characters`);
    const salt = randomHex(16);
    const keep = await sha256(c.req.header("Authorization")!.slice(7));
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET pw_salt = ?, pw_hash = ? WHERE id = ?").bind(salt, await hashPassword(next, salt), u.id),
      // Sign out every other device.
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(u.id, keep),
    ]);
    return c.json({ ok: true });
  })

  .delete("/", authLimit, async (c) => {
    const u = c.get("user");
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const password = typeof body.password === "string" ? body.password : "";
    if (!safeEqual(await hashPassword(password, u.pw_salt), u.pw_hash)) return fail(c, 401, "bad_credentials", "Password is wrong");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ?").bind(u.id),
      c.env.DB.prepare("DELETE FROM parties WHERE user_id = ?").bind(u.id),
      c.env.DB.prepare("DELETE FROM party_keys WHERE user_id = ?").bind(u.id),
      c.env.DB.prepare("DELETE FROM friendships WHERE a = ?1 OR b = ?1").bind(u.id),
      c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id),
    ]);
    return c.json({ ok: true });
  })

  // ── Favorites ──
  .get("/favorites", async (c) => {
    const rows = await c.env.DB.prepare("SELECT song, added_at FROM favorites WHERE user_id = ? ORDER BY added_at DESC")
      .bind(c.get("user").id)
      .all<{ song: string; added_at: number }>();
    const favorites: FavoriteSong[] = rows.results.map((r) => ({ song: JSON.parse(r.song) as Song, addedAt: r.added_at }));
    return c.json({ favorites });
  })

  .put("/favorites", async (c) => {
    const body = await c.req.json<{ song?: unknown }>().catch(() => ({}) as { song?: unknown });
    const song = cleanSong(body.song);
    if (!song) return fail(c, 400, "bad_request", "That doesn't look like a song");
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?").bind(c.get("user").id).first<{ n: number }>();
    if ((count?.n ?? 0) >= 500) return fail(c, 400, "bad_request", "You can keep up to 500 favorites");
    await c.env.DB.prepare(
      "INSERT INTO favorites (user_id, video_id, song, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, video_id) DO UPDATE SET song = excluded.song",
    )
      .bind(c.get("user").id, song.videoId, JSON.stringify(song), Date.now())
      .run();
    return c.json({ ok: true });
  })

  .delete("/favorites/:videoId", async (c) => {
    await c.env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND video_id = ?").bind(c.get("user").id, c.req.param("videoId")).run();
    return c.json({ ok: true });
  })

  // ── Friends ──
  .get("/friends", async (c) => c.json({ friends: await listFriends(c.env.DB, c.get("user").id) }))

  .post("/friends", async (c) => {
    const me = c.get("user");
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const username = text(body.username, 40)?.toLowerCase().replace(/^@/, "") ?? "";
    const other = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRow>();
    if (!other) return fail(c, 404, "not_found", "No one with that username");
    if (other.id === me.id) return fail(c, 400, "bad_request", "That's you!");
    const existing = await c.env.DB.prepare("SELECT * FROM friendships WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)")
      .bind(me.id, other.id)
      .first<{ a: string; accepted_at: number | null }>();
    const now = Date.now();
    if (!existing) {
      await c.env.DB.prepare("INSERT INTO friendships (a, b, created_at, accepted_at) VALUES (?, ?, ?, NULL)").bind(me.id, other.id, now).run();
    } else if (existing.accepted_at === null && existing.a === other.id) {
      // They already asked us: asking back = accepting.
      await c.env.DB.prepare("UPDATE friendships SET accepted_at = ? WHERE a = ? AND b = ?").bind(now, other.id, me.id).run();
    }
    return c.json({ friends: await listFriends(c.env.DB, me.id) });
  })

  .post("/friends/:id/accept", async (c) => {
    const me = c.get("user");
    const res = await c.env.DB.prepare("UPDATE friendships SET accepted_at = ? WHERE a = ? AND b = ? AND accepted_at IS NULL")
      .bind(Date.now(), c.req.param("id"), me.id)
      .run();
    if (!res.meta.changes) return fail(c, 404, "not_found", "No request from them");
    return c.json({ friends: await listFriends(c.env.DB, me.id) });
  })

  .delete("/friends/:id", async (c) => {
    const me = c.get("user");
    const id = c.req.param("id");
    await c.env.DB.prepare("DELETE FROM friendships WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)").bind(me.id, id).run();
    return c.json({ friends: await listFriends(c.env.DB, me.id) });
  })

  // ── Party log ──
  .get("/parties", async (c) => {
    const rows = await c.env.DB.prepare("SELECT entry FROM parties WHERE user_id = ? ORDER BY joined_at DESC LIMIT 200")
      .bind(c.get("user").id)
      .all<{ entry: string }>();
    return c.json({ parties: rows.results.map((r) => JSON.parse(r.entry) as PartyLogEntry) });
  })

  // The room vouches for the member (id + key), so nobody can log a party they weren't in.
  .post("/parties", async (c: Ctx) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const code = normalizeRoomCode(typeof body.code === "string" ? body.code : "");
    if (!isRoomCode(code) || typeof body.memberId !== "string" || typeof body.key !== "string") return fail(c, 400, "bad_request", "Missing room details");
    const summary = await c.env.ROOM.get(c.env.ROOM.idFromName(code)).memberSummary(body.memberId, body.key);
    if (!summary) return fail(c, 404, "not_found", "Couldn't find you in that party");
    await c.env.DB.prepare(
      "INSERT INTO parties (user_id, code, joined_at, entry) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, code, joined_at) DO UPDATE SET entry = excluded.entry",
    )
      .bind(c.get("user").id, code, summary.joinedAt, JSON.stringify(summary))
      .run();
    // Remember the credentials so this account can rejoin from another device or after clearing the browser.
    await c.env.DB.prepare(
      "INSERT INTO party_keys (user_id, code, member_id, member_key, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, code) DO UPDATE SET member_id = excluded.member_id, member_key = excluded.member_key, updated_at = excluded.updated_at",
    )
      .bind(c.get("user").id, code, body.memberId, body.key, Date.now())
      .run();
    return c.json({ party: summary });
  })

  // Parties still open that this account is a member of, with the credentials to get back in. The room re-checks each
  // one, so ended parties, expired rooms and removed members drop out (and their stored keys are deleted).
  .get("/parties/live", async (c: Ctx) => {
    const userId = c.get("user").id;
    const rows = await c.env.DB.prepare(
      "SELECT code, member_id, member_key FROM party_keys WHERE user_id = ? ORDER BY updated_at DESC LIMIT 8",
    )
      .bind(userId)
      .all<{ code: string; member_id: string; member_key: string }>();
    const checked = await Promise.all(
      rows.results.map(async (r) => {
        const summary = await c.env.ROOM.get(c.env.ROOM.idFromName(r.code))
          .memberSummary(r.member_id, r.member_key)
          .catch(() => undefined);
        return { r, summary };
      }),
    );
    const stale = checked.filter((x) => x.summary === null || (x.summary && x.summary.endedAt !== null));
    if (stale.length) {
      await c.env.DB.batch(stale.map((x) => c.env.DB.prepare("DELETE FROM party_keys WHERE user_id = ? AND code = ?").bind(userId, x.r.code)));
    }
    const parties = checked
      .filter((x) => x.summary && x.summary.endedAt === null)
      .map((x) => ({ code: x.r.code, role: x.summary!.role, memberId: x.r.member_id, key: x.r.member_key, joinedAt: x.summary!.joinedAt }));
    return c.json({ parties });
  });

async function listFriends(db: D1Database, userId: string): Promise<Friend[]> {
  const rows = await db
    .prepare(
      `SELECT f.a, f.created_at, f.accepted_at, u.* FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
       WHERE f.a = ?1 OR f.b = ?1 ORDER BY u.display_name`,
    )
    .bind(userId)
    .all<UserRow & { a: string; accepted_at: number | null }>();
  return rows.results.map((r) => ({
    profile: profile(r),
    status: r.accepted_at !== null ? "friend" : r.a === userId ? "outgoing" : "incoming",
    since: r.accepted_at ?? r.created_at,
  }));
}
