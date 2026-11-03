// D1 schema and the password/token helpers for accounts. Accounts are optional: nothing else depends on them.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_seed TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    room_settings TEXT,
    pw_salt TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    song TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, video_id)
  )`,
  // One row per pair, `a` asked `b`. accepted_at NULL = still a request.
  `CREATE TABLE IF NOT EXISTS friendships (
    a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (a, b)
  )`,
  `CREATE TABLE IF NOT EXISTS parties (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    entry TEXT NOT NULL,
    PRIMARY KEY (user_id, code, joined_at)
  )`,
  // The room credentials of parties this account is in, so it can get back in on another device (host or co-host).
  // Only parties that are still open are handed out again, and only to the signed-in owner.
  `CREATE TABLE IF NOT EXISTS party_keys (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_key TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, code)
  )`,
];

let ready: Promise<unknown> | null = null;

/** Creates the tables on first use in this isolate (cheap `IF NOT EXISTS`), so no separate migration step is needed. */
export function ensureSchema(db: D1Database): Promise<unknown> {
  ready ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf instanceof Uint8Array ? buf : buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** PBKDF2-SHA256 at 100k iterations (the most Workers allows). */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: 100_000, salt: new TextEncoder().encode(salt) },
    key,
    256,
  );
  return hex(bits);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
