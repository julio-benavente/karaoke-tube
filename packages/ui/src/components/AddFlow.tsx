import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Song } from "@karaoke-tube/shared";
import type { AddSingers } from "../hooks/add-song";
import { songParts } from "../format";
import { useT } from "../i18n/context";
import { SongArt } from "./SongCard";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { SingWithPicker, useSingWith } from "./SingWith";
import css from "./AddFlow.module.css";

type Ask = { song: Song; add: (song: Song, singers?: AddSingers) => void };
type Ctx = { ask: (a: Ask) => void };
const AddFlowContext = createContext<Ctx | null>(null);

/**
 * The one "who do you sing with?" step every way of adding a song goes through (Home, Search, the host app).
 * Mount it inside `SingWithProvider`. A partner is optional: "Skip" sings the song solo.
 */
export function AddFlowProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<Ask | null>(null);
  const value = useMemo<Ctx>(() => ({ ask: setAsking }), []);
  return (
    <AddFlowContext.Provider value={value}>
      {children}
      <AddFlowSheet asking={asking} onClose={() => setAsking(null)} />
    </AddFlowContext.Provider>
  );
}

function AddFlowSheet({ asking, onClose }: { asking: Ask | null; onClose: () => void }) {
  const t = useT();
  const sw = useSingWith();
  // Keep the last song while the sheet slides away.
  const last = useRef<Ask | null>(null);
  if (asking) last.current = asking;
  const shown = asking ?? last.current;
  const parts = shown ? songParts(shown.song) : null;
  const duet = !!shown?.song.duet;
  const finish = (singers: AddSingers | undefined) => {
    if (!asking) return;
    asking.add(asking.song, singers);
    sw.reset();
    onClose();
  };
  return (
    <Sheet
      open={!!asking}
      onClose={() => {
        sw.reset();
        onClose();
      }}
      label={t("addflow.title")}
    >
      {shown && parts && (
        <div className={css.sheet} data-testid="add-flow">
          <div className={css.head}>
            <SongArt song={shown.song} size={56} explicit={shown.song.explicit} />
            <div className={css.text}>
              <div className={css.title}>{parts.title}</div>
              <div className={css.sub}>{parts.artist}</div>
            </div>
          </div>
          <h2 className={css.heading}>{duet ? t("addflow.titleDuet") : t("addflow.title")}</h2>
          <p className={css.hint}>{duet ? t("addflow.textDuet") : sw.canAddFor ? t("singwith.textHost") : t("addflow.text")}</p>
          <SingWithPicker />
          <div className={css.actions}>
            <Button block onClick={() => finish(sw.singers())} data-testid="add-flow-add">
              {t("addflow.add")}
            </Button>
            {!sw.asId && (
              <Button block variant="secondary" onClick={() => finish(undefined)} data-testid="add-flow-skip">
                {t("addflow.skip")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Wraps an add function so it first asks who sings. It adds straight away when there is nothing to ask (duets are
 * off, you are alone) or the singers were already chosen (the "Sing with…" pill, or a host adding for someone).
 * Goes back to solo after each song.
 */
export function useAddFlow(add: (song: Song, singers?: AddSingers) => void): (song: Song) => void {
  const ctx = useContext(AddFlowContext);
  const sw = useSingWith();
  const latest = useRef({ add, sw, ctx });
  latest.current = { add, sw, ctx };
  return useCallback((song: Song) => {
    const { add, sw, ctx } = latest.current;
    const chosen = sw.singers();
    if (chosen || !ctx || !(sw.enabled || sw.canAddFor)) {
      add(song, chosen);
      sw.reset();
    } else {
      ctx.ask({ song, add });
    }
  }, []);
}
