import { AWARDS, type Award, type TitleId } from "./protocol";

/** What happened during the party, as the titles need it. */
export type TitlesInput = {
  /** `isHost`: the party's host (not counted for "first guest to join"). */
  members: Array<{ id: string; joinedAt: number; isHost?: boolean }>;
  /** Performances in the order they were sung. */
  performances: Array<{
    itemId: string;
    singerIds: string[];
    everyone: boolean;
    addedBy: string;
    durationSec: number;
    performedAt: number;
    /** When the song was added to the queue (for who waited longest). */
    addedAt?: number;
    /** People who cheered it (reaction or award), not counting the singers; each person counts once. */
    cheers: number;
    /** The awards it got, by kind. */
    awards?: Partial<Record<Award, number>>;
  }>;
  /** memberId → reactions they sent during performances. */
  reactionsSent: Record<string, number>;
  /** memberId → awards they gave. */
  awardsGiven: Record<string, number>;
  /** memberId → item ids they reacted to or gave an award. */
  cheered: Record<string, string[]>;
};

/** Most special first: when someone earns more than three, they keep the top three. */
const PRIORITY: TitleId[] = [
  "showstopper",
  "full_house",
  "crowd_favorite",
  "dynamic_duo",
  "golden_voice",
  "crowd_pleaser",
  "vibe_master",
  "bold_choice",
  "encore",
  "repeat_performer",
  "hat_trick",
  "choir_leader",
  "brave_soul",
  "rising_star",
  "duet_partner",
  "dj",
  "standing_ovation",
  "biggest_fan",
  "award_giver",
  "patient_soul",
  "early_bird",
  "fashionably_late",
  "great_audience",
  "power_ballad",
  "quick_hit",
  "opening_act",
  "grand_finale",
  "party_spirit",
  "good_company",
  "front_row",
];

/**
 * Titles many people can earn at once (a threshold, not a "most of"). They are handed out so the cast doesn't all
 * get the same ones; the "most of" titles always go to everyone who earned them.
 */
export const SHARED_TITLES = new Set<TitleId>(["encore", "hat_trick", "rising_star", "fashionably_late", "standing_ovation", "great_audience"]);

/** For people who earned too little on their own: there's always something kind to say, but not the same for all. */
export const FILLER_TITLES: TitleId[] = ["party_spirit", "good_company", "front_row"];

/** The title for having the most of an award kind. */
const AWARD_TITLE: Record<Award, TitleId> = {
  nailed_it: "golden_voice",
  great_vibes: "vibe_master",
  crowd_pleaser: "crowd_pleaser",
  brave_pick: "bold_choice",
};

export const MAX_TITLES = 3;
export const MIN_TITLES = 2;
/** Waiting at least this long for a turn counts as patience. */
export const PATIENT_MS = 8 * 60_000;

/** Who sang a performance: all duet singers; for "Everyone sings", the person who started it. */
const singersOf = (p: TitlesInput["performances"][number]) => (p.everyone ? [p.addedBy] : p.singerIds);

/** Members with the highest value (ties all win), when it reaches `min`. */
function top(values: Map<string, number>, min = 1): string[] {
  let best = 0;
  for (const v of values.values()) best = Math.max(best, v);
  if (best < min) return [];
  return [...values].filter(([, v]) => v === best).map(([id]) => id);
}

const bump = (map: Map<string, number>, id: string, by = 1) => map.set(id, (map.get(id) ?? 0) + by);

/**
 * 2–3 positive titles per member, from what happened. Each title is a real stat: "most of" titles go to whoever has
 * the most (ties share), threshold titles to everyone who passes it. Shared titles are spread so people in the cast
 * don't all get the same ones, and anyone left with fewer than two gets a friendly "for being there" title, rotating.
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
  const picked = new Map<string, number>(); // songs they added for other people
  const longestWait = new Map<string, number>();
  const awardsGot = new Map<Award, Map<string, number>>();
  for (const p of perfs) {
    for (const s of singersOf(p)) {
      bump(sung, s);
      bump(cheersReceived, s, p.cheers);
      if (p.addedAt !== undefined) longestWait.set(s, Math.max(longestWait.get(s) ?? 0, p.performedAt - p.addedAt));
      for (const a of AWARDS) {
        const n = p.awards?.[a] ?? 0;
        if (n > 0) bump((awardsGot.get(a) ?? awardsGot.set(a, new Map()).get(a))!, s, n);
      }
    }
    if (!p.everyone && p.singerIds.length > 1) for (const s of p.singerIds) bump(duets, s);
    if (!p.everyone && !p.singerIds.includes(p.addedBy)) bump(picked, p.addedBy);
    if (p.everyone) give("choir_leader", [p.addedBy]);
  }

  // Position in the night.
  if (perfs.length > 0) {
    give("opening_act", singersOf(perfs[0]!));
    if (perfs.length > 1) give("grand_finale", singersOf(perfs.at(-1)!));
  }
  for (let i = 1; i < perfs.length; i++) {
    // Encore: on stage in two performances in a row.
    const prev = new Set(singersOf(perfs[i - 1]!));
    give("encore", singersOf(perfs[i]!).filter((s) => prev.has(s)));
  }

  // The room's reaction to a song.
  const bestCheers = Math.max(0, ...perfs.map((p) => p.cheers));
  if (bestCheers > 0) {
    perfs.forEach((p, i) => {
      if (p.cheers !== bestCheers) return;
      give("showstopper", singersOf(p));
      // Brave Soul: went up right after the biggest song of the night, and wasn't in it.
      const next = perfs[i + 1];
      if (next && next.cheers < bestCheers) give("brave_soul", singersOf(next).filter((s) => !singersOf(p).includes(s)));
    });
  }
  // Crowd Favorite is over several songs, so one song never earns both it and Showstopper.
  give("crowd_favorite", top(new Map([...cheersReceived].filter(([id]) => (sung.get(id) ?? 0) >= 2))));

  // Full House: every person who was cheering that night cheered this song.
  const audience = new Set(Object.entries(input.cheered).filter(([, items]) => items.length > 0).map(([id]) => id));
  for (const p of perfs) {
    const others = [...audience].filter((id) => !singersOf(p).includes(id));
    if (others.length >= 3 && others.every((id) => input.cheered[id]!.includes(p.itemId))) give("full_house", singersOf(p));
  }

  // Awards from the audience: the most of each kind.
  for (const [award, counts] of awardsGot) give(AWARD_TITLE[award], top(counts));

  // Rising Star: sang once and the room liked it at least as much as an average song.
  if (perfs.length >= 3) {
    const avg = perfs.reduce((n, p) => n + p.cheers, 0) / perfs.length;
    for (const p of perfs) {
      const who = singersOf(p).filter((s) => sung.get(s) === 1);
      if (p.cheers > 0 && p.cheers >= avg) give("rising_star", who);
    }
  }

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

  // How much people sang.
  give("repeat_performer", top(sung, 2));
  give("hat_trick", [...sung].filter(([, n]) => n >= 3).map(([id]) => id));
  give("duet_partner", top(duets));
  const duetPerfs = perfs.filter((p) => !p.everyone && p.singerIds.length > 1);
  const bestDuet = Math.max(0, ...duetPerfs.map((p) => p.cheers));
  if (bestDuet > 0) for (const p of duetPerfs) if (p.cheers === bestDuet) give("dynamic_duo", p.singerIds);
  give("dj", top(picked, 2));
  give("patient_soul", top(longestWait, PATIENT_MS));

  // The audience.
  give("biggest_fan", top(new Map(Object.entries(input.reactionsSent)), 3));
  give("award_giver", top(new Map(Object.entries(input.awardsGiven))));

  // Early Bird: the first guest in (the host doesn't count), when there's a group to be first in.
  const guests = members.filter((m) => !m.isHost);
  if (members.length >= 3 && guests.length > 0) {
    const first = Math.min(...guests.map((m) => m.joinedAt));
    give("early_bird", guests.filter((m) => m.joinedAt === first).map((m) => m.id));
  }

  const firstAt = perfs[0]?.performedAt ?? Infinity;
  for (const m of members) {
    const cheeredSet = new Set(input.cheered[m.id] ?? []);
    const others = perfs.filter((p) => !singersOf(p).includes(m.id));
    const cheeredOthers = others.filter((p) => cheeredSet.has(p.itemId)).length;
    if (others.length >= 2 && cheeredOthers === others.length) give("standing_ovation", [m.id]);
    // Great Audience: cheered at least half of the songs that weren't theirs.
    if (others.length >= 2 && cheeredOthers >= Math.ceil(others.length / 2)) give("great_audience", [m.id]);
    if ((sung.get(m.id) ?? 0) > 0 && m.joinedAt > firstAt) give("fashionably_late", [m.id]);
  }

  // ── Hand them out ──────────────────────────────────────────────────────
  const rank = (t: TitleId) => PRIORITY.indexOf(t);
  const handed = new Map<TitleId, number>();
  const result = new Map<string, TitleId[]>(members.map((m) => [m.id, []]));
  const take = (id: string, t: TitleId) => {
    result.get(id)!.push(t);
    handed.set(t, (handed.get(t) ?? 0) + 1);
  };

  // 1. Everything somebody won outright ("most of"…) goes to them, strongest first.
  for (const m of members) {
    const won = [...earned.get(m.id)!].filter((t) => !SHARED_TITLES.has(t)).sort((a, b) => rank(a) - rank(b));
    for (const t of won.slice(0, MAX_TITLES)) take(m.id, t);
  }

  // 2. Fill the rest with shared titles, so each is handed to as few people as possible. People with the fewest
  //    options choose first. A third title is a bonus: only one nobody else has.
  const order = [...members].sort(
    (a, b) => earned.get(a.id)!.size - earned.get(b.id)!.size || a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1),
  );
  for (let round = 0; round < MAX_TITLES; round++) {
    for (const m of order) {
      const mine = result.get(m.id)!;
      if (mine.length > round || mine.length >= MAX_TITLES) continue;
      let options = [...earned.get(m.id)!].filter((t) => SHARED_TITLES.has(t) && !mine.includes(t));
      if (mine.length >= MIN_TITLES) options = options.filter((t) => !handed.has(t));
      if (options.length === 0) continue;
      options.sort((a, b) => (handed.get(a) ?? 0) - (handed.get(b) ?? 0) || rank(a) - rank(b));
      take(m.id, options[0]!);
    }
  }

  // 3. Anyone still under two gets a "for being there" title, a different one from the person before when possible.
  for (const m of order) {
    const mine = result.get(m.id)!;
    while (mine.length < MIN_TITLES) {
      const left = FILLER_TITLES.filter((t) => !mine.includes(t)).sort((a, b) => (handed.get(a) ?? 0) - (handed.get(b) ?? 0) || FILLER_TITLES.indexOf(a) - FILLER_TITLES.indexOf(b));
      take(m.id, left[0]!);
    }
  }

  const out: Record<string, TitleId[]> = {};
  for (const [id, titles] of result) {
    if (ids.has(id)) out[id] = titles.sort((a, b) => rank(a) - rank(b));
  }
  return out;
}
