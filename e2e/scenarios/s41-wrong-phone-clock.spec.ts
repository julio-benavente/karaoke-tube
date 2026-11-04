import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";
import { song } from "../lib/songs";

// Real phones often have a clock that is seconds (sometimes minutes) off. The countdown and the song position come from
// the server's clock, so a wrong phone clock must not change what the phone shows. (The checks C2/C8 compare every
// screen with the room, so a wrong number fails the scenario by itself.)
test("S41 · Phones with the wrong time @core @countdown", async ({ night }) => {
  const { host } = await night.setup({ countdown: 6, songSec: 60 });
  const ahead = await night.join("Ana", { clockOffsetMs: 20_000 }); // 20 s ahead
  const behind = await night.join("Ben", { clockOffsetMs: -45_000 }); // 45 s behind
  await ahead.addSong(song("a1"));
  await host.waitForState("get ready", (s) => s.playback.state === "get_ready");

  await sleep(1500);
  for (const p of [ahead, behind]) {
    const shown = await p.countdowns();
    expect(shown.length, `${p.name} shows a countdown`).toBeGreaterThan(0);
    for (const n of shown) expect(n, `${p.name}'s countdown`).toBeLessThanOrEqual(6);
    for (const n of shown) expect(n, `${p.name}'s countdown`).toBeGreaterThanOrEqual(3);
  }
  // No "Waiting for the TV…" while the TV is simply counting down, and the song then plays with a sane position.
  await expect(ahead.page.getByText("Waiting for the TV")).toHaveCount(0);
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await sleep(2500);
  const pos = (await host.state())!.playback.positionSec;
  expect(pos).toBeGreaterThanOrEqual(0);
});
