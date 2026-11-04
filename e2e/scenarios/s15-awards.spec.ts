import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";
import { song } from "../lib/songs";
import type { RoomState } from "@karaoke-tube/shared";

// The room doesn't broadcast when a window runs out (screens go by `closesAt`), so "open" means not yet closed.
const windowOpen = (s: RoomState) => !!s.awardWindow && s.awardWindow.closesAt > Date.now();

// The award window is 6 s here (E2E_FAST); in the real app it is 60 s.
test("S15 · Awards after the song @social", async ({ night }) => {
  const { host } = await night.setup({ songSec: 4, countdown: 2 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const cleo = await night.join("Cleo");
  await ana.addSong(song("a1"));
  await cleo.addSong(song("c1"));

  // Ana's song ends: the window opens on Ben's phone (with its own countdown) but not on Ana's.
  const open = await host.waitForState("award window", (s) => s.awardWindow?.item.song.videoId === "e2e-song-a1", 20_000);
  expect(open.awardWindow!.closesAt - Date.now()).toBeLessThanOrEqual(6_100);
  await expect(ben.page.getByTestId("award-prompt")).toBeVisible();
  await expect(ben.page.getByText(/Give an award · \d+s/)).toBeVisible();
  await expect(ana.page.getByTestId("award-prompt")).toHaveCount(0);

  // Cleo's song starts while the window is still open: the prompt is still for Ana's song, and the two countdowns don't mix.
  const during = await host.waitForState("Cleo up while window open", (st) => st.nowPlaying?.song.videoId === "e2e-song-c1" && !!st.awardWindow, 6_000);
  expect(during.awardWindow!.item.song.videoId).toBe("e2e-song-a1");

  // Ben gives "Nailed it" (a real tap). He can't give a second one; Ana can't award her own song.
  await ben.page.getByRole("button", { name: "Nailed it" }).click();
  await host.waitForState("one award counted", (s) => s.awardWindow?.counts.nailed_it === 1);
  expect(await ben.expectRefused({ type: "give_award", itemId: open.awardWindow!.item.id, award: "great_vibes" })).toBe("not_allowed");
  expect(await ana.expectRefused({ type: "give_award", itemId: open.awardWindow!.item.id, award: "nailed_it" })).toBe("not_allowed");

  // The window closes by itself.
  await host.waitForState("a1's window closed", (s) => !windowOpen(s) || s.awardWindow!.item.song.videoId !== "e2e-song-a1", 12_000);
  await expect(ben.page.getByTestId("award-prompt")).toHaveCount(0);
  expect(await cleo.expectRefused({ type: "give_award", itemId: open.awardWindow!.item.id, award: "brave_pick" })).toBe("not_allowed");

  // Awards off: no window after the next song.
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);
  await host.waitForState("no window left", (s) => !windowOpen(s), 12_000);
  await host.send({ type: "update_settings", settings: { awards: false } });
  await ana.addSong(song("a2"));
  await host.waitForState("a2 plays", (s) => s.nowPlaying?.song.videoId === "e2e-song-a2");
  await host.waitForState("a2 done", (s) => s.playback.state === "idle", 15_000);
  await sleep(800);
  expect(windowOpen((await host.state())!)).toBe(false);
});
