// TV overlay components for the YouTube player (mounted by Spec A's content script).
//
// Shadow-root safe: these import no global CSS and touch no document-level styles. Put `tvCss` in a <style>
// inside your shadow root, then render the components there:
//
//   const shadow = host.attachShadow({ mode: "open" });
//   const style = document.createElement("style");
//   style.textContent = tvCss;
//   shadow.append(style, mountPoint);
//   createRoot(mountPoint).render(<TvOverlay {...props} />);
//
// Both components position themselves `absolute; inset: 0`, so the host element should cover the player
// (e.g. a child of #movie_player with position: absolute; inset: 0).
import tvCss from "./tv.css?inline";

export { tvCss };
export { TvOverlay, TV_REACTION_MS, type TvOverlayProps, type TvReaction } from "./TvOverlay";
export { GetReadyCard, type GetReadyCardProps } from "./GetReadyCard";
