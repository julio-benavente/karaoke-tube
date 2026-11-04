import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S12 · Only hosts add @host", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const [anaId, benId] = await Promise.all([ana.memberId(), ben.memberId()]);

  await host.send({ type: "update_settings", settings: { hostsOnlyAdd: true } });
  await ana.waitForState("setting reached Ana", (s) => s.settings.hostsOnlyAdd);

  // Ana's search page says so, and the room refuses her songs.
  await ana.tab("Search");
  await expect(ana.page.getByText("Only the hosts can add songs right now.")).toBeVisible();
  expect(await ana.expectRefused({ type: "add_song", song: song("sneaky") })).toBe("not_allowed");

  // Hana adds songs "as" Ana and Ben, and they take their turns.
  await host.addSong(song("for-ana"), { singerIds: [anaId] });
  await host.addSong(song("for-ben"), { singerIds: [benId] });
  const s = await host.waitForState("both queued", (st) => [st.nowPlaying, ...st.upNext].filter(Boolean).length === 2);
  expect(order(s, [s.nowPlaying!, ...s.upNext])).toEqual(["Ana:song-for-ana", "Ben:song-for-ben"]);

  // Turned off live: Ana's search page works again without a refresh.
  await host.send({ type: "update_settings", settings: { hostsOnlyAdd: false } });
  await expect(ana.page.getByText("Only the hosts can add songs right now.")).toHaveCount(0);
  await ana.addSong(song("ana-own"));
  await host.waitForState("Ana's own song queued", (st) => st.upNext.some((i) => i.song.videoId === "e2e-song-ana-own"));
});
