import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";
import { REACTIONS } from "@karaoke-tube/shared";
import { song } from "../lib/songs";

test("S14 · Reaction flood @social", async ({ night }) => {
  const { host, tv } = await night.setup({ songSec: 120, settings: { tvLayout: "clean" } });
  const phones = await Promise.all(["Ana", "Ben", "Cleo", "Dev"].map((n) => night.join(n)));
  await host.addSong(song("loud"));
  await host.waitForState("playing", (s) => s.playback.state === "playing");

  // Four phones spam reactions every 100 ms for 3 seconds.
  const ids = await Promise.all(phones.map((p) => p.memberId()));
  const spam = phones.map(async (p) => {
    for (let i = 0; i < 30; i++) {
      await p.send({ type: "react", reaction: REACTIONS[i % REACTIONS.length] });
      await sleep(100);
    }
  });
  await Promise.all(spam);
  await sleep(1000);

  // One cheer per person per song: exactly one of each person's 30 gets through, the rest are refused, and the
  // host and the TV both saw every one that did.
  const got = await host.reactions();
  for (const id of ids) {
    expect(got.filter((r) => r.memberId === id).length, `reactions that got through for ${id} (one cheer per song)`).toBe(1);
  }
  expect(got.length).toBe(ids.length);
  expect((await tv!.reactions()).length).toBe(got.length);
  expect(await phones[0].expectRefused({ type: "react", reaction: "clap" })).toBe("already_cheered");

  // The TV is still responsive after the flood and its floating reactions have cleared.
  await expect.poll(async () => (await tv!.snapshot())?.state?.nowPlaying?.song.videoId).toBe("e2e-song-loud");

  // Reactions off, live: the room refuses them and a phone says so on its now-singing page.
  await host.send({ type: "update_settings", settings: { reactions: false } });
  await phones[0].waitForState("reactions off", (s) => !s.settings.reactions);
  expect(await phones[0].expectRefused({ type: "react", reaction: "clap" })).toBe("not_allowed");
  await phones[0].page.getByRole("button", { name: "Open now singing" }).click();
  await expect(phones[0].page.getByText("The host turned reactions off.")).toBeVisible();

  // A reaction sent as the song ends doesn't break anything.
  await host.send({ type: "update_settings", settings: { reactions: true } });
  await host.send({ type: "skip" });
  await host.waitForState("song over", (s) => s.playback.state === "idle", 25_000);
  await phones[1].send({ type: "react", reaction: "party" });
  await sleep(500);
});
