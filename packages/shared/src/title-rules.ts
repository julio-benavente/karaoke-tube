import type { TitleId } from "./protocol";
import type { TitlesInput } from "./titles";

/**
 * Every title, with the stat behind it, what it takes to earn it, and a small party that earns it. The examples are
 * run through the real `computeTitles` by a test (apps/api/test/title-rules.test.ts) and by the dev page /dev/titles, so
 * this list can't drift from the rules.
 *
 * - position: where you were in the night (first song, last song, first guest in)
 * - most:     whoever has the most of something (ties share it), once past a minimum
 * - threshold: everyone who passes a bar (many people can earn these; they are spread out so the cast doesn't repeat)
 * - filler:   a kind "for being there" title for anyone left with fewer than two
 */
export type TitleKind = "position" | "most" | "threshold" | "filler";

export type TitleRule = {
  kind: TitleKind;
  /** What is measured. */
  stat: string;
  /** What it takes (minimums, ties, special cases). */
  needs: string;
  /** The example party, in one line. */
  story: string;
  example: TitlesInput;
  /** Who must get the title in the example. Left out: at least one person must. */
  winners?: string[];
};

type Perf = TitlesInput["performances"][number];
const START = 1_000_000;
const NAMES = ["ana", "ben", "cleo", "dan"];
const room = (over: Partial<TitlesInput> = {}): TitlesInput => ({
  members: NAMES.map((id, i) => ({ id, joinedAt: i })),
  performances: [],
  reactionsSent: {},
  awardsGiven: {},
  cheered: {},
  ...over,
});
/** The n-th song of the night (1-based), 5 minutes after the one before. */
const song = (n: number, singers: string[], extra: Partial<Perf> = {}): Perf => ({
  itemId: `s${n}`,
  singerIds: singers,
  everyone: false,
  addedBy: singers[0]!,
  durationSec: 200,
  performedAt: START + n * 300_000,
  cheers: 0,
  ...extra,
});

export const TITLE_RULES: Record<TitleId, TitleRule> = {
  opening_act: {
    kind: "position",
    stat: "Order of the songs",
    needs: "Sang the first song.",
    story: "Ana sings first, then Ben.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ben"])] }),
    winners: ["ana"],
  },
  grand_finale: {
    kind: "position",
    stat: "Order of the songs",
    needs: "Sang the last song (needs at least 2 songs).",
    story: "Ana sings first, then Ben closes.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ben"])] }),
    winners: ["ben"],
  },
  early_bird: {
    kind: "position",
    stat: "When people joined",
    needs: "First guest to join. The host doesn't count. Needs 3 or more people.",
    story: "Ana hosts. Ben is the first to arrive, then Cleo and Dan.",
    example: room({
      members: [
        { id: "ana", joinedAt: 0, isHost: true },
        { id: "ben", joinedAt: 5 },
        { id: "cleo", joinedAt: 9 },
        { id: "dan", joinedAt: 12 },
      ],
    }),
    winners: ["ben"],
  },
  encore: {
    kind: "threshold",
    stat: "Order of the songs",
    needs: "Sang two songs back to back.",
    story: "Ben sings twice back to back.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ben"]), song(3, ["ben"]), song(4, ["cleo"])] }),
    winners: ["ben"],
  },
  showstopper: {
    kind: "most",
    stat: "People who cheered each song",
    needs: "Your song got more cheers than any other. A cheer is a reaction or award from someone else.",
    story: "Ana's song gets 5 cheers, Ben's gets 2.",
    example: room({ performances: [song(1, ["ana"], { cheers: 5 }), song(2, ["ben"], { cheers: 2 })] }),
    winners: ["ana"],
  },
  full_house: {
    kind: "threshold",
    stat: "Who cheered each song",
    needs: "Everyone who cheered that night cheered your song (at least 3 people).",
    story: "Ben, Cleo and Dan all cheer Ana's song.",
    example: room({
      performances: [song(1, ["ana"], { cheers: 3 })],
      cheered: { ben: ["s1"], cleo: ["s1"], dan: ["s1"] },
    }),
    winners: ["ana"],
  },
  crowd_favorite: {
    kind: "most",
    stat: "Cheers over all the songs a person sang",
    needs: "Most cheers over all your songs. Needs 2 or more songs; one big song is Showstopper instead.",
    story: "Ana sings twice (2 + 3 cheers). Ben's one song got 6, but he sang only once.",
    example: room({ performances: [song(1, ["ana"], { cheers: 2 }), song(2, ["ben"], { cheers: 6 }), song(3, ["ana"], { cheers: 3 })] }),
    winners: ["ana"],
  },
  power_ballad: {
    kind: "most",
    stat: "Song length",
    needs: "Sang the longest song.",
    story: "Ana's song is 6:40, Ben's is 2:00.",
    example: room({ performances: [song(1, ["ana"], { durationSec: 400 }), song(2, ["ben"], { durationSec: 120 })] }),
    winners: ["ana"],
  },
  quick_hit: {
    kind: "most",
    stat: "Song length",
    needs: "Sang the shortest song.",
    story: "Ana's song is 6:40, Ben's is 2:00.",
    example: room({ performances: [song(1, ["ana"], { durationSec: 400 }), song(2, ["ben"], { durationSec: 120 })] }),
    winners: ["ben"],
  },
  repeat_performer: {
    kind: "most",
    stat: "Songs sung",
    needs: "Sang the most songs (at least 2).",
    story: "Ana sings twice, Ben once.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ana"]), song(3, ["ben"])] }),
    winners: ["ana"],
  },
  hat_trick: {
    kind: "threshold",
    stat: "Songs sung",
    needs: "Sang 3 songs or more.",
    story: "Ana sings three songs, spread through the night.",
    example: room({
      performances: [song(1, ["ben"]), song(2, ["ana"]), song(3, ["cleo"]), song(4, ["ana"]), song(5, ["dan"]), song(6, ["ana"]), song(7, ["dan"])],
    }),
    winners: ["ana"],
  },
  duet_partner: {
    kind: "most",
    stat: "Duets joined",
    needs: "Sang in the most duets.",
    story: "Ana duets with Ben, then with Cleo.",
    example: room({ performances: [song(1, ["ana", "ben"]), song(2, ["ana", "cleo"]), song(3, ["dan"])] }),
    winners: ["ana"],
  },
  dynamic_duo: {
    kind: "most",
    stat: "Cheers on duets",
    needs: "Your duet got more cheers than any other duet.",
    story: "Ana and Ben's duet gets 4 cheers; Cleo's solo gets 1.",
    example: room({ performances: [song(1, ["ana", "ben"], { cheers: 4 }), song(2, ["cleo"], { cheers: 1 })] }),
    winners: ["ana", "ben"],
  },
  choir_leader: {
    kind: "threshold",
    stat: "Sing-along songs",
    needs: "Started a sing-along for everyone.",
    story: "Dan starts a sing-along.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["dan"], { everyone: true, addedBy: "dan" }), song(3, ["ben"])] }),
    winners: ["dan"],
  },
  dj: {
    kind: "most",
    stat: "Songs added for other people",
    needs: "Queued the most songs that other people sang (at least 2).",
    story: "Dan queues one song for Ana and one for Ben.",
    example: room({ performances: [song(1, ["ana"], { addedBy: "dan" }), song(2, ["ben"], { addedBy: "dan" })] }),
    winners: ["dan"],
  },
  patient_soul: {
    kind: "most",
    stat: "Wait between adding a song and singing it",
    needs: "Waited the longest for your turn (at least 8 minutes).",
    story: "Cleo added her song 15 minutes before it was sung.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ben"]), song(3, ["cleo"], { addedAt: START })] }),
    winners: ["cleo"],
  },
  golden_voice: {
    kind: "most",
    stat: "“Nailed it” awards received",
    needs: "Got the most “Nailed it” awards.",
    story: "Ana gets 3, Ben gets 1.",
    example: room({ performances: [song(1, ["ana"], { awards: { nailed_it: 3 } }), song(2, ["ben"], { awards: { nailed_it: 1 } })] }),
    winners: ["ana"],
  },
  vibe_master: {
    kind: "most",
    stat: "“Great vibes” awards received",
    needs: "Got the most “Great vibes” awards.",
    story: "Ana gets 3, Ben gets 1.",
    example: room({ performances: [song(1, ["ana"], { awards: { great_vibes: 3 } }), song(2, ["ben"], { awards: { great_vibes: 1 } })] }),
    winners: ["ana"],
  },
  crowd_pleaser: {
    kind: "most",
    stat: "“Crowd pleaser” awards received",
    needs: "Got the most “Crowd pleaser” awards.",
    story: "Ana gets 3, Ben gets 1.",
    example: room({ performances: [song(1, ["ana"], { awards: { crowd_pleaser: 3 } }), song(2, ["ben"], { awards: { crowd_pleaser: 1 } })] }),
    winners: ["ana"],
  },
  bold_choice: {
    kind: "most",
    stat: "“Brave pick” awards received",
    needs: "Got the most “Brave pick” awards.",
    story: "Ana gets 3, Ben gets 1.",
    example: room({ performances: [song(1, ["ana"], { awards: { brave_pick: 3 } }), song(2, ["ben"], { awards: { brave_pick: 1 } })] }),
    winners: ["ana"],
  },
  rising_star: {
    kind: "threshold",
    stat: "Cheers on a person's only song",
    needs: "Sang only once, in a night of 3+ songs, and got above-average cheers.",
    story: "Ben sings once and gets 4 cheers (the average is 2).",
    example: room({ performances: [song(1, ["ana"], { cheers: 1 }), song(2, ["ben"], { cheers: 4 }), song(3, ["cleo"], { cheers: 1 })] }),
    winners: ["ben"],
  },
  brave_soul: {
    kind: "threshold",
    stat: "Order and cheers of the songs",
    needs: "Sang right after the song with the most cheers.",
    story: "Cleo follows Ana's 5-cheer song.",
    example: room({ performances: [song(1, ["ana"], { cheers: 5 }), song(2, ["cleo"], { cheers: 1 })] }),
    winners: ["cleo"],
  },
  fashionably_late: {
    kind: "threshold",
    stat: "When people joined",
    needs: "Joined after the first song started, then sang.",
    story: "Dan walks in after the first song, then sings.",
    example: room({
      members: [
        { id: "ana", joinedAt: 0 },
        { id: "ben", joinedAt: 1 },
        { id: "cleo", joinedAt: 2 },
        { id: "dan", joinedAt: START + 400_000 },
      ],
      performances: [song(1, ["ana"]), song(2, ["dan"])],
    }),
    winners: ["dan"],
  },
  biggest_fan: {
    kind: "most",
    stat: "Reactions sent",
    needs: "Sent the most reactions (at least 3).",
    story: "Cleo sends 8 reactions, Dan sends 3.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["ben"])], reactionsSent: { cleo: 8, dan: 3 } }),
    winners: ["cleo"],
  },
  award_giver: {
    kind: "most",
    stat: "Awards given",
    needs: "Gave the most awards.",
    story: "Dan gives 3 awards, Ben gives 1.",
    example: room({ performances: [song(1, ["ana"]), song(2, ["cleo"])], awardsGiven: { dan: 3, ben: 1 } }),
    winners: ["dan"],
  },
  standing_ovation: {
    kind: "threshold",
    stat: "Songs cheered",
    needs: "Cheered every song you weren't in (at least 2 songs).",
    story: "Dan doesn't sing but cheers all three songs.",
    example: room({
      performances: [song(1, ["ana"]), song(2, ["ben"]), song(3, ["cleo"])],
      cheered: { dan: ["s1", "s2", "s3"] },
    }),
    winners: ["dan"],
  },
  great_audience: {
    kind: "threshold",
    stat: "Songs cheered",
    needs: "Cheered at least half the songs you weren't in (at least 2 songs).",
    story: "Dan cheers 2 of the 3 songs.",
    example: room({
      performances: [song(1, ["ana"]), song(2, ["ben"]), song(3, ["cleo"])],
      cheered: { dan: ["s1", "s2"] },
    }),
    winners: ["dan"],
  },
  party_spirit: {
    kind: "filler",
    stat: "—",
    needs: "Given to anyone with fewer than 2 titles. Rotates with the other two.",
    story: "A quiet night where nothing stands out.",
    example: room(),
  },
  good_company: {
    kind: "filler",
    stat: "—",
    needs: "Given to anyone with fewer than 2 titles. Rotates with the other two.",
    story: "A quiet night where nothing stands out.",
    example: room(),
  },
  front_row: {
    kind: "filler",
    stat: "—",
    needs: "Given to anyone with fewer than 2 titles. Rotates with the other two.",
    story: "A quiet night where nothing stands out.",
    example: room(),
  },
};
