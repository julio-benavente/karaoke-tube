import { describe, expect, it } from "vitest";
import { TITLES, TITLE_RULES, computeTitles } from "@karaoke-tube/shared";

// The examples on the dev page (/dev/titles) are the same data: each one must really earn its title.
describe("title rules (the /dev/titles examples)", () => {
  it("has a rule for every title", () => {
    expect(Object.keys(TITLE_RULES).sort()).toEqual([...TITLES].sort());
  });

  for (const id of TITLES) {
    it(`${id}: its example earns it`, () => {
      const rule = TITLE_RULES[id];
      const result = computeTitles(rule.example);
      if (rule.winners) for (const w of rule.winners) expect(result[w], `${w} should get ${id}`).toContain(id);
      else expect(Object.values(result).flat(), `somebody should get ${id}`).toContain(id);
    });
  }
});
