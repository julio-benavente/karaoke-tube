import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { BROWSE_PRESETS } from "@karaoke-tube/ui";

type Preset = (typeof BROWSE_PRESETS)[number];

/**
 * Keeps what you searched in the address: `?q=text` for a search, `?b=<category>` for a Browse tile. Opening the
 * page with either runs it again, so refresh, Back and shared links land on the same results.
 */
export function useSearchUrl(opts: { query: string; presetTitle: string | null; setQuery: (q: string) => void; runPreset: (p: Preset) => void }) {
  const [params, setParams] = useSearchParams();
  const first = useRef(true);
  const preset = BROWSE_PRESETS.find((p) => p.title === opts.presetTitle);

  useEffect(() => {
    const b = params.get("b");
    const q = params.get("q");
    const p = b ? BROWSE_PRESETS.find((x) => x.id === b) : undefined;
    if (p) opts.runPreset(p);
    else if (q) opts.setQuery(q);
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false; // the first pass belongs to the effect above
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("q");
    next.delete("b");
    if (preset) next.set("b", preset.id);
    else if (opts.query.trim()) next.set("q", opts.query.trim());
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.query, preset?.id]);
}
