import type { TitleId } from "@karaoke-tube/shared";

/** What happened during the party, as the titles need it. */
export type TitlesInput = {
  members: Array<{ id: string; joinedAt: number }>;
  /** Performances in the order they were sung. */
  performances: Array<{
    itemId: string;
    singerIds: string[];
    everyone: boolean;
    addedBy: string;
    durationSec: number;
    performedAt: number;
    /** Reactions + awards it got. */
    cheers: number;
  }>;
  /** memberId → reactions they sent during performances. */
  reactionsSent: Record<string, number>;
  /** memberId → awards they gave. */
  awardsGiven: Record<string, number>;
  /** memberId → item ids they reacted to or gave an award. */
  cheered: Record<string, string[]>;
};

/** Most special first: each member keeps their top three. */
const PRIORITY: TitleId[] = [
  "showstopper",
  "crowd_favorite",
  "dynamic_duo",
  "encore",
  "repeat_performer",
  "choir_leader",
  "standing_ovation",
  "biggest_fan",
  "award_giver",
  "duet_partner",
  "power_ballad",
  "quick_hit",
  "opening_act",
  "grand_finale",
  "fashionably_late",
  "rising_star",
  "brave_soul",
  "great_audience",
  "party_spirit",
];

export const MAX_TITLES = 3;
export const MIN_TITLES = 2;

/** Who sang a performance: all duet singers; for "Everyone sings", the person who started it. */
const singersOf = (p: TitlesInput["performances"][number]) => (p.everyone ? [p.addedBy] : p.singerIds);

/** Members with the highest positive value (ties all win). */
function top(values: Map<string, number>, min = 1): string[] {
  let best = 0;
  for (const v of values.values()) best = Math.max(best, v);
  if (best < min) return [];
  return [...values].filter(([, v]) => v === best).map(([id]) => id);
}

/**
 * 2–3 positive titles per member, from what happened. Everyone gets at least two: when nothing special stands out,
 * they get the "for being there" titles (Brave Soul, Great Audience, Party Spirit).
 */
export function computeTitles(input: TitlesInput): Record<string, TitleId[]> {
  const { members, performances: perfs } = input;
  const ids = new Set(members.map((m) => m.id));
  const earned = new Map<string, Set<TitleId>>(members.map((m) => [m.id, new Set()]));
  const give = (title: TitleId, who: Iterable<string>) => {
    for (const id of who) earned.get(id)?.add(title);
  };

  const sung = new Map<string, number>();
  const cheersReceived = new Map<string, number>();
  const duets = new Map<string, number>();
  for (const p of perfs) {
    for (const s of singersOf(p)) {
      sung.set(s, (sung.get(s) ?? 0) + 1);
      cheersReceived.set(s, (cheersReceived.get(s) ?? 0) + p.cheers);
    }
    if (!p.everyone && p.singerIds.length > 1) for (const s of p.singerIds) duets.set(s, (duets.get(s) ?? 0) + 1);
    if (p.everyone) give("choir_leader", [p.addedBy]);
  }

  if (perfs.length > 0) {
    give("opening_act", singersOf(perfs[0]!));
    if (perfs.length > 1) give("grand_finale", singersOf(perfs.at(-1)!));
  }

  // Encore: in two performances in a row.
  for (let i = 1; i < perfs.length; i++) {
    const prev = new Set(singersOf(perfs[i - 1]!));
    give("encore", singersOf(perfs[i]!).filter((s) => prev.has(s)));
  }

  // Showstopper: the single most-cheered performance.
  const bestCheers = Math.max(0, ...perfs.map((p) => p.cheers));
  if (bestCheers > 0) for (const p of perfs) if (p.cheers === bestCheers) give("showstopper", singersOf(p));
  give("crowd_favorite", top(cheersReceived));

  // Longest and shortest song, when there's a real difference.
  const timed = perfs.filter((p) => p.durationSec > 0);
  if (timed.length > 1) {
    const longest = Math.max(...timed.map((p) => p.durationSec));
    const shortest = Math.min(...timed.map((p) => p.durationSec));
    if (longest !== shortest) {
      for (const p of timed) {
        if (p.durationSec === longest) give("power_ballad", singersOf(p));
        if (p.durationSec === shortest) give("quick_hit", singersOf(p));
      }
    }
  }

  give("repeat_performer", top(sung, 2));
  give("duet_partner", top(duets));
  const duetPerfs = perfs.filter((p) => !p.everyone && p.singerIds.length > 1);
  const bestDuet = Math.max(0, ...duetPerfs.map((p) => p.cheers));
  if (bestDuet > 0) for (const p of duetPerfs) if (p.cheers === bestDuet) give("dynamic_duo", p.singerIds);

  give("biggest_fan", top(new Map(Object.entries(input.reactionsSent))));
  give("award_giver", top(new Map(Object.entries(input.awardsGiven))));

  const firstAt = perfs[0]?.performedAt ?? Infinity;
  for (const m of members) {
    const mine = sung.get(m.id) ?? 0;
    const cheeredSet = new Set(input.cheered[m.id] ?? []);
    const others = perfs.filter((p) => !singersOf(p).includes(m.id));
    if (others.length >= 2 && others.every((p) => cheeredSet.has(p.itemId))) give("standing_ovation", [m.id]);
    if (mine > 0 && m.joinedAt > firstAt) give("fashionably_late", [m.id]);
    if (mine === 1) give("rising_star", [m.id]);
    if (mine > 0) give("brave_soul", [m.id]);
    if (mine === 0 && cheeredSet.size > 0) give("great_audience", [m.id]);
    give("party_spirit", [m.id]);
  }

  const out: Record<string, TitleId[]> = {};
  for (const [id, set] of earned) {
    if (!ids.has(id)) continue;
    const titles = PRIORITY.filter((t) => set.has(t)).slice(0, MAX_TITLES);
    // Everyone leaves with at least two.
    for (const fallback of ["great_audience", "party_spirit"] as const) {
      if (titles.length < MIN_TITLES && !titles.includes(fallback)) titles.push(fallback);
    }
    out[id] = titles.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  }
  return out;
}
