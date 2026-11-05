import { describe, expect, it } from "vitest";
import { isExplicitText } from "../src/explicit.ts";

describe("isExplicitText", () => {
  it("catches titles that say so or use strong language", () => {
    expect(isExplicitText("Some Artist - Song (Explicit)")).toBe(true);
    expect(isExplicitText("Cee Lo Green - Fuck You")).toBe(true);
    expect(isExplicitText("Artist - Hoes Be Crazy")).toBe(true);
  });
  it("catches well-known songs with clean titles", () => {
    expect(isExplicitText("WAP", "Cardi B")).toBe(true);
    expect(isExplicitText("Eminem - Lose Yourself")).toBe(true);
  });
  it("leaves ordinary titles and look-alike words alone", () => {
    expect(isExplicitText("Queen - Bohemian Rhapsody")).toBe(false);
    expect(isExplicitText("Cocktail Party", "Scunthorpe Band")).toBe(false);
    expect(isExplicitText("Dixie Chicks - Cowboy Take Me Away")).toBe(false);
  });
});
