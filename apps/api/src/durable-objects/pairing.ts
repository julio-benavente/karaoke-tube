import { DurableObject } from "cloudflare:workers";

/** How long a code on a TV stays valid. The TV replaces it a bit before that, so the code on screen is always fresh. */
const TTL_MS = 6 * 60_000;
/** Unambiguous letters and digits (no 0/O, 1/I/L), easy to read off a TV and type on a phone. */

type Row = { id: string; code: string; created_at: number; room_code: string | null; screen_key: string | null };

/**
 * One instance for the whole app (`idFromName("pairing")`): hands out short codes to TVs and passes the result
 * of a pairing back to the TV that is showing the code. Rows live at most 15 minutes.
 */
export class Pairing extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS pairs (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, room_code TEXT, screen_key TEXT)",
    );
  }

  private purge() {
    this.sql.exec("DELETE FROM pairs WHERE created_at < ?", Date.now() - TTL_MS);
  }

  private newCode(): string {
    // Five digits, easy to read off a TV and type on a phone ("00042" is a code too).
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % 100_000).padStart(5, "0");
  }

  /** A TV asks for a code. With `previousId` (the TV is replacing its code) the old code stops working at once. */
  async start(previousId?: string): Promise<{ id: string; code: string; expiresInSec: number }> {
    this.purge();
    if (previousId) this.sql.exec("DELETE FROM pairs WHERE id = ? AND room_code IS NULL", previousId);
    const id = crypto.randomUUID();
    for (let i = 0; i < 20; i++) {
      const code = this.newCode();
      try {
        this.sql.exec("INSERT INTO pairs (id, code, created_at) VALUES (?, ?, ?)", id, code, Date.now());
        return { id, code, expiresInSec: TTL_MS / 1000 };
      } catch {
        // code already in use: try another
      }
    }
    throw new Error("no free pairing code");
  }

  /** The TV's poll. A finished pairing is handed over once and then forgotten. */
  async status(id: string): Promise<{ state: "waiting" } | { state: "expired" } | { state: "paired"; roomCode: string; screenKey: string }> {
    this.purge();
    const row = this.sql.exec<Row>("SELECT * FROM pairs WHERE id = ?", id).toArray()[0];
    if (!row) return { state: "expired" };
    if (row.room_code && row.screen_key) {
      this.sql.exec("DELETE FROM pairs WHERE id = ?", id);
      return { state: "paired", roomCode: row.room_code, screenKey: row.screen_key };
    }
    return { state: "waiting" };
  }

  /** Is there a TV waiting with this code? (Checked before the room is asked to trust a new screen.) */
  async isWaiting(code: string): Promise<boolean> {
    this.purge();
    const row = this.sql.exec<Row>("SELECT * FROM pairs WHERE code = ?", code.toUpperCase()).toArray()[0];
    return !!row && !row.room_code;
  }

  async complete(code: string, roomCode: string, screenKey: string): Promise<boolean> {
    this.purge();
    const row = this.sql.exec<Row>("SELECT * FROM pairs WHERE code = ?", code.toUpperCase()).toArray()[0];
    if (!row || row.room_code) return false;
    this.sql.exec("UPDATE pairs SET room_code = ?, screen_key = ? WHERE id = ?", roomCode, screenKey, row.id);
    return true;
  }
}
