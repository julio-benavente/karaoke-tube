import { useMemo, useState } from "react";
import { Chip, ChipRow, sampleRecap } from "@karaoke-tube/ui";
import type { Member } from "@karaoke-tube/shared";
import { EndStory } from "../screens/EndStory";
import { RecapPage } from "../screens/RecapPage";

const MEMBERS: Member[] = ["Maya", "Leo", "Ana", "Kenji", "Priya"].map((n, i) => ({
  id: `m-${n.toLowerCase()}`,
  nickname: n,
  avatarSeed: `${n.toLowerCase()}-${i}`,
  role: i === 0 ? "host" : "guest",
  connected: true,
  joinedAt: 0,
}));

/** /dev/recap: the phone story and the public recap page, against a sample recap. */
export function RecapDev() {
  const recap = useMemo(() => sampleRecap(MEMBERS), []);
  const [view, setView] = useState<"story" | "page">("story");
  const [run, setRun] = useState(0);
  return (
    <>
      <div style={{ position: "fixed", top: 56, right: 8, zIndex: 10 }}>
        <ChipRow>
          <Chip selected={view === "story"} onClick={() => (setView("story"), setRun((n) => n + 1))}>
            Story
          </Chip>
          <Chip selected={view === "page"} onClick={() => setView("page")}>
            /recap page
          </Chip>
        </ChipRow>
      </div>
      {view === "story" ? <EndStory key={run} recap={recap} meId="m-leo" onDone={() => setView("page")} /> : <RecapPage preload={recap} />}
    </>
  );
}
