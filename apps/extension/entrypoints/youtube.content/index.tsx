import ReactDOM from "react-dom/client";
import { Badge } from "./Badge";

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  // Styles live inside a shadow root, isolated from YouTube's CSS.
  cssInjectionMode: "ui",

  async main(ctx) {
    console.log("[content] Karaoke Tube loaded on", location.href);

    const ui = await createShadowRootUi(ctx, {
      name: "karaoke-tube-badge",
      position: "overlay",
      zIndex: 2147483647,
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<Badge />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
