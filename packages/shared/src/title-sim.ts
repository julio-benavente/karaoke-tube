import { AWARDS } from "./protocol";
import type { TitlesInput } from "./titles";

/** Names for simulated parties (the first one is the host). */
export const SIM_NAMES = ["Maya", "Leo", "Ana", "Kenji", "Priya", "Tom", "Zoe", "Sam", "Noor", "Eli", "Ines", "Raj"];

/** A small seeded random number generator, so a simulated party can be replayed from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A made-up but consistent night for `size` people: who joined when, the songs (solos, duets, a sing-along now and
 * then), who cheered each one (a reaction or an award) and who queued it. For the dev page and for measuring how
 * much the titles repeat.
 */
export function simulateParty(seed: number, size: number): { input: TitlesInput; names: Record<string, string> } {
  const rand = rng(seed);
  const int = (n: number) => Math.floor(rand() * n);
  const people = SIM_NAMES.slice(0, size).map((name, i) => ({ id: `m${i}`, name }));
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const START = 1_000_000;
  const members = people.map((p, i) => ({ id: p.id, joinedAt: i === 0 ? 0 : int(60) * 60_000 + 1000 * i, isHost: i === 0 }));

  const reactionsSent: Record<string, number> = {};
  const awardsGiven: Record<string, number> = {};
  const cheered: Record<string, string[]> = {};
  const songsCount = Math.max(2, Math.round(size * (0.8 + rand() * 1.2)));
  const performances: TitlesInput["performances"] = [];
  for (let n = 1; n <= songsCount; n++) {
    const duet = size > 3 && rand() < 0.2;
    const first = people[int(size)]!;
    const second = duet ? people.filter((p) => p.id !== first.id)[int(size - 1)]! : null;
    const everyone = !duet && rand() < 0.07;
    const singerIds = second ? [first.id, second.id] : [first.id];
    const performedAt = START + n * 270_000;
    const itemId = `s${n}`;
    const others = people.filter((p) => !singerIds.includes(p.id));
    const cheerers = others.filter(() => rand() < 0.15 + rand() * 0.6);
    const awards: Partial<Record<(typeof AWARDS)[number], number>> = {};
    for (const c of cheerers) {
      (cheered[c.id] ??= []).push(itemId);
      if (rand() < 0.3) {
        const a = AWARDS[int(AWARDS.length)]!;
        awards[a] = (awards[a] ?? 0) + 1;
        awardsGiven[c.id] = (awardsGiven[c.id] ?? 0) + 1;
      } else reactionsSent[c.id] = (reactionsSent[c.id] ?? 0) + 1 + int(3);
    }
    performances.push({
      itemId,
      singerIds,
      everyone,
      addedBy: rand() < 0.7 ? first.id : people[int(size)]!.id,
      durationSec: 130 + int(280),
      performedAt,
      addedAt: performedAt - int(20) * 60_000,
      cheers: cheerers.length,
      awards,
    });
  }
  return { input: { members, performances, reactionsSent, awardsGiven, cheered }, names };
}

/** Titles that more than one person ended up with: `[title, how many people]`. */
export function repeatedTitles(result: Record<string, string[]>): Array<[string, number]> {
  const count = new Map<string, number>();
  for (const titles of Object.values(result)) for (const t of titles) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].filter(([, n]) => n > 1);
}
