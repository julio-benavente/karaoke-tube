import { describe, expect, it } from "vitest";
import { MAX_TITLES, MIN_TITLES, computeTitles, type TitlesInput } from "../src/titles";

type Perf = TitlesInput["performances"][number];
let t = 1000;
const perf = (singers: string[], extra: Partial<Perf> = {}): Perf => ({
  itemId: `p${t}`,
  singerIds: singers,
  everyone: false,
  addedBy: singers[0]!,
  durationSec: 200,
  performedAt: (t += 1000),
  cheers: 0,
  ...extra,
});

function input(over: Partial<TitlesInput>): TitlesInput {
  return {
    members: ["ana", "ben", "cleo", "dan"].map((id, i) => ({ id, joinedAt: i })),
    performances: [],
    reactionsSent: {},
    awardsGiven: {},
    cheered: {},
    ...over,
  };
}

describe("computeTitles", () => {
  it("gives everyone between 2 and 3 titles, even on a quiet night", () => {
    const result = computeTitles(input({}));
    for (const id of ["ana", "ben", "cleo", "dan"]) {
      expect(result[id]!.length).toBeGreaterThanOrEqual(MIN_TITLES);
      expect(result[id]!.length).toBeLessThanOrEqual(MAX_TITLES);
    }
    expect(result.ana).toEqual(["great_audience", "party_spirit"]);
  });

  it("finds the opening act, grand finale, encore and repeat performer", () => {
    const performances = [perf(["ana"]), perf(["ben"]), perf(["ben"]), perf(["cleo"])];
    const r = computeTitles(input({ performances }));
    expect(r.ana).toContain("opening_act");
    expect(r.cleo).toContain("grand_finale");
    expect(r.ben).toContain("encore");
    expect(r.ben).toContain("repeat_performer");
  });

  it("showstopper and crowd favorite go to the most cheered (ties share)", () => {
    const performances = [perf(["ana"], { cheers: 9 }), perf(["ben"], { cheers: 9 }), perf(["cleo"], { cheers: 2 })];
    const r = computeTitles(input({ performances }));
    expect(r.ana![0]).toBe("showstopper");
    expect(r.ben![0]).toBe("showstopper");
    expect(r.cleo).not.toContain("showstopper");
  });

  it("duets: duet partner and dynamic duo for both singers; choir leader for a group song", () => {
    const performances = [
      perf(["ana", "ben"], { cheers: 5 }),
      perf(["cleo"], { cheers: 1 }),
      perf(["dan"], { everyone: true, addedBy: "dan" }),
    ];
    const r = computeTitles(input({ performances }));
    expect(r.ana).toContain("dynamic_duo");
    expect(r.ben).toContain("dynamic_duo");
    expect(r.dan).toContain("choir_leader");
  });

  it("rewards the audience: biggest fan, award giver, standing ovation", () => {
    const performances = [perf(["ana"]), perf(["ben"])];
    const r = computeTitles(
      input({
        performances,
        reactionsSent: { cleo: 12, dan: 3 },
        awardsGiven: { dan: 2 },
        cheered: { cleo: [performances[0]!.itemId, performances[1]!.itemId], dan: [performances[0]!.itemId] },
      }),
    );
    expect(r.cleo).toContain("biggest_fan");
    expect(r.cleo).toContain("standing_ovation");
    expect(r.dan).toContain("award_giver");
    expect(r.dan).not.toContain("standing_ovation");
  });

  it("power ballad and quick hit only when lengths differ", () => {
    const same = computeTitles(input({ performances: [perf(["ana"]), perf(["ben"])] }));
    expect(Object.values(same).flat()).not.toContain("power_ballad");
    const r = computeTitles(input({ performances: [perf(["ana"], { durationSec: 400 }), perf(["ben"], { durationSec: 120 })] }));
    expect(r.ana).toContain("power_ballad");
    expect(r.ben).toContain("quick_hit");
  });

  it("fashionably late: joined after the first song and still sang", () => {
    const performances = [perf(["ana"]), perf(["dan"])];
    const members = [
      { id: "ana", joinedAt: 0 },
      { id: "dan", joinedAt: performances[0]!.performedAt + 1 },
    ];
    const r = computeTitles(input({ members, performances }));
    expect(r.dan).toContain("fashionably_late");
  });

  it("never gives more than three", () => {
    const performances = [perf(["ana"], { cheers: 3, durationSec: 500 }), perf(["ana"], { cheers: 1 }), perf(["ben"])];
    const r = computeTitles(input({ performances, reactionsSent: { ana: 9 }, awardsGiven: { ana: 4 } }));
    expect(r.ana!.length).toBe(MAX_TITLES);
  });
});
