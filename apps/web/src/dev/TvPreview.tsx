import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { REACTIONS } from "@karaoke-tube/shared";
import { Button, Chip, ChipRow, RoomProvider, createMockRoomClient, hueOf, sampleRecap, useRoom, useRoomClient } from "@karaoke-tube/ui";
import { AwardsShow, GetReadyCard, awardsSlideCount, TvOverlay, TV_REACTION_MS, tvCss, type TvReaction } from "@karaoke-tube/ui/tv";
import css from "./TvPreview.module.css";

/**
 * /dev/tv: the TV overlay components over a fake video, mounted in a shadow root exactly as the
 * content script will mount them. Driven by the mock room with simulated reactions.
 */
export function TvPreview() {
  // Created in an effect (not useMemo) so StrictMode's double mount gets a fresh client after cleanup.
  const [client, setClient] = useState<ReturnType<typeof createMockRoomClient> | null>(null);
  useEffect(() => {
    const c = createMockRoomClient({
      code: "groovy-disco-party",
      role: "host",
      identity: { nickname: "Host", avatarSeed: "host-seed" },
    });
    c.mock.simulate({ songLengthSec: 90, reactionEveryMs: 1500 });
    setClient(c);
    return () => c.close();
  }, []);
  if (!client) return null;
  return (
    <RoomProvider client={client}>
      <Preview />
    </RoomProvider>
  );
}

function Preview() {
  const { state, send } = useRoom();
  const client = useRoomClient();
  const [qr, setQr] = useState<string>();
  const [recapQr, setRecapQr] = useState<string>();
  const [size, setSize] = useState<"small" | "large">("large");
  const [awards, setAwards] = useState(false);
  // Awards show controls: which slide, held on it, and speed.
  const [slide, setSlide] = useState(0);
  const [held, setHeld] = useState(false);
  const [fast, setFast] = useState(false);
  const [reactions, setReactions] = useState<TvReaction[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    QRCode.toDataURL(`${location.origin}/join/groovy-disco-party`, { margin: 1, width: 300 }).then(setQr);
    // The preview has no saved recap, so its recap link goes to the sample recap page instead.
    QRCode.toDataURL(`${location.origin}/dev/recap`, { margin: 1, width: 300 }).then(setRecapQr);
  }, []);

  // The content script will do the same: keep each reaction for TV_REACTION_MS.
  useEffect(
    () =>
      client.onReaction((e) => {
        const nickname = client.state?.members.find((m) => m.id === e.memberId)?.nickname;
        const r: TvReaction = { id: seq.current++, reaction: e.reaction, nickname };
        setReactions((xs) => [...xs.slice(-20), r]);
        setTimeout(() => setReactions((xs) => xs.filter((x) => x.id !== r.id)), TV_REACTION_MS);
      }),
    [client],
  );

  if (!state) return <p className={css.wait}>Starting the mock room…</p>;
  const item = state.nowPlaying;
  const hue = item ? hueOf(item.song.videoId) : 330;
  const recap = state.recap ?? withPeople(sampleRecap(state.members), Number(new URLSearchParams(location.search).get("people")) || 0);
  const slideCount = awardsSlideCount(recap);
  const mock = (client as unknown as { mock: { finishSong(): void; randomReaction(): void } }).mock;

  return (
    <div className={css.page}>
      <header className={css.bar}>
        <h1 className={css.title}>TV overlay preview</h1>
        <ChipRow>
          <Chip selected={size === "large"} onClick={() => setSize("large")}>
            Full screen
          </Chip>
          <Chip selected={size === "small"} onClick={() => setSize("small")}>
            Small player
          </Chip>
        </ChipRow>
        <div className={css.actions}>
          {awards ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setSlide((i) => (i - 1 + slideCount) % slideCount)}>
                Previous slide
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSlide((i) => (i + 1) % slideCount)}>
                Next slide
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setHeld((h) => !h)}>
                {held ? "Play" : "Pause"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setSlide(0)}>
                Restart
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setFast((f) => !f)}>
                {fast ? "Normal speed" : "Fast (3×)"}
              </Button>
              <span className={css.slideCount}>
                Slide {slide % slideCount + 1} of {slideCount}
              </span>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => mock.finishSong()}>
                Finish song (get ready)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => send({ type: "skip" })}>
                Skip
              </Button>
              <Button size="sm" variant="secondary" onClick={() => REACTIONS.forEach((_, i) => setTimeout(() => mock.randomReaction(), i * 150))}>
                Burst of reactions
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!awards) {
                setSlide(0);
                setHeld(false);
              }
              setAwards((a) => !a);
            }}
          >
            {awards ? "Back to the overlay" : "Awards show"}
          </Button>
        </div>
      </header>

      <div className={`${css.player} ${size === "small" ? css.small : ""}`}>
        {/* Fake video: a moving gradient + the song thumbnail. */}
        <div className={css.video} style={{ ["--h" as string]: hue }}>
          {item && <img src={item.song.thumbnailUrl.replace("hqdefault", "maxresdefault")} alt="" className={css.thumb} />}
          <div className={css.ytControls}>
            <span />
          </div>
        </div>
        <ShadowMount>
          {awards ? (
            <AwardsShow
              recap={recap}
              recapText={`${location.host}/dev/recap`}
              qrSrc={recapQr}
              slideIndex={slide}
              onSlideChange={setSlide}
              paused={held}
              speed={fast ? 3 : 1}
            />
          ) : state.playback.state === "get_ready" && item && state.playback.countdownEndsAt ? (
            <GetReadyCard
              item={item}
              members={state.members}
              countdownEndsAt={state.playback.countdownEndsAt}
              countdownSec={state.settings.countdownSec}
            />
          ) : (
            <TvOverlay
              nowPlaying={item}
              upNext={state.upNext}
              members={state.members}
              code={state.code}
              qrSrc={qr}
              joinText={`${location.host}/join`}
              reactions={reactions}
              layout={((l) => (l === "bar" || l === "video" ? l : "overlay"))(new URLSearchParams(location.search).get("layout"))}
              barSize={(new URLSearchParams(location.search).get("size") as "small" | "medium" | "large") ?? "medium"}
            />
          )}
        </ShadowMount>
      </div>
      <p className={css.note}>
        Rendered inside a shadow root with only <code>tvCss</code>. Reactions arrive from the simulated room every few seconds.
      </p>
    </div>
  );
}

/** `?people=N` pads the sample recap to N people (and makes the top moment a duet), to see the credits at any size. */
function withPeople(recap: ReturnType<typeof sampleRecap>, n: number) {
  if (n <= 0) return recap;
  const base = recap.members;
  const members = Array.from({ length: n }, (_, i) => (i < base.length ? base[i]! : { id: `x${i}`, nickname: `Guest ${i + 1}`, avatarSeed: `guest-${i}` }));
  const moment = recap.topMoment && base[2] ? { ...recap.topMoment, item: { ...recap.topMoment.item, singerIds: [...recap.topMoment.item.singerIds, base[2].id] } } : recap.topMoment;
  return { ...recap, members, topMoment: moment };
}

/** Mounts children in an open shadow root with tvCss, like the content script. */
function ShadowMount({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = tvCss;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    setRoot(mount);
  }, []);
  return (
    <div ref={hostRef} className={css.shadowHost}>
      {root && createPortal(children, root)}
    </div>
  );
}
