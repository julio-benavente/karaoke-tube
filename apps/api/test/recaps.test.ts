import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Recap, RecapResponse } from "@karaoke-tube/shared";
import { BASE } from "./helpers";

const recap: Recap = {
  id: "0123456789abcdef",
  code: "x",
  endedAt: 1,
  members: [{ id: "m1", nickname: "Ana", avatarSeed: "a" }],
  performances: [],
  titles: { m1: ["brave_soul", "party_spirit"] },
  topMoment: null,
};

describe("GET /api/recaps/:id", () => {
  it("returns a saved recap without any login", async () => {
    await env.RECAPS.put(`recap:${recap.id}`, JSON.stringify(recap));
    const res = await SELF.fetch(`${BASE}/api/recaps/${recap.id}`);
    expect(res.status).toBe(200);
    expect((await res.json<RecapResponse>()).recap).toEqual(recap);
  });

  it("404s for expired or unknown ids and ignores ids that are not 16 hex characters", async () => {
    for (const id of ["fedcba9876543210", "short", "ZZZZZZZZZZZZZZZZ", "0123456789abcdef0"]) {
      const res = await SELF.fetch(`${BASE}/api/recaps/${id}`);
      expect(res.status).toBe(404);
    }
  });

  it("is not reachable through the room code", async () => {
    await env.RECAPS.put(`recap:${recap.id}`, JSON.stringify(recap));
    expect((await SELF.fetch(`${BASE}/api/recaps/${recap.code}`)).status).toBe(404);
  });
});
