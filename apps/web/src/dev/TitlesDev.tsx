import { useMemo, useState } from "react";
import { TITLES, TITLE_INFO, TITLE_RULES, SHARED_TITLES, computeTitles, repeatedTitles, simulateParty, type TitleId, type TitleKind } from "@karaoke-tube/shared";
import { Button, Chip, ChipRow } from "@karaoke-tube/ui";

const KIND_LABEL: Record<TitleKind, string> = {
  position: "Position in the night",
  most: "Most of…",
  threshold: "Passes a bar",
  filler: "For being there",
};

const pill = { display: "inline-flex", gap: 4, padding: "4px 10px", borderRadius: 999, background: "var(--kt-card)", fontSize: 13, whiteSpace: "nowrap" } as const;
const muted = { color: "var(--kt-text-2)", fontSize: 14, margin: 0 } as const;

function Titles({ ids, hot, repeated }: { ids: TitleId[]; hot?: TitleId; repeated?: Set<string> }) {
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ids.map((id) => (
        <span
          key={id}
          title={TITLE_INFO[id].description}
          style={{ ...pill, background: id === hot ? "var(--kt-accent-soft)" : "var(--kt-card)", outline: repeated?.has(id) ? "1px solid var(--kt-warning)" : undefined }}
        >
          {TITLE_INFO[id].emoji} {TITLE_INFO[id].name}
        </span>
      ))}
    </span>
  );
}

/** /dev/titles: every title with the stat it needs and a worked example, plus a party simulator to see how much they repeat. */
export function TitlesDev() {
  const [kind, setKind] = useState<TitleKind | "all">("all");
  const [size, setSize] = useState(6);
  const [seed, setSeed] = useState(1);
  const sim = useMemo(() => {
    const { input, names } = simulateParty(seed, size);
    const result = computeTitles(input);
    return { input, names, result, repeats: repeatedTitles(result) as Array<[TitleId, number]> };
  }, [seed, size]);
  const repeated = new Set(sim.repeats.map(([t]) => t));
  const h2 = { fontSize: 20, fontWeight: 700, margin: "32px 0 12px" } as const;
  const card = { background: "var(--kt-panel)", border: "1px solid var(--kt-border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 } as const;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", color: "var(--kt-text)" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Titles</h1>
      <p style={{ ...muted, marginTop: 8, maxWidth: 720 }}>
        Everyone gets 2–3. “Most of…” titles go to whoever has the most (ties share). “Passes a bar” titles can be earned by many people, so they are spread out:
        each is given to as few people as possible. Anyone left with fewer than two gets a “for being there” title, rotating. All of this runs the real engine.
      </p>

      <h2 style={h2}>Party simulator</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <ChipRow>
          {[3, 5, 8, 12].map((n) => (
            <Chip key={n} selected={size === n} onClick={() => setSize(n)}>
              {n} people
            </Chip>
          ))}
        </ChipRow>
        <Button variant="secondary" onClick={() => setSeed((s) => s + 1)}>
          New random party (#{seed})
        </Button>
        <span style={muted}>
          {sim.repeats.length === 0 ? "No title repeats 🎉" : `Repeated (outlined): ${sim.repeats.map(([t, n]) => `${TITLE_INFO[t].name} ×${n}`).join(", ")}`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
        {sim.input.members.map((m) => {
          const sung = sim.input.performances.filter((p) => (p.everyone ? p.addedBy === m.id : p.singerIds.includes(m.id))).length;
          return (
            <div key={m.id} style={card}>
              <b>
                {sim.names[m.id]}
                {m.isHost ? " (host)" : ""} <small style={{ color: "var(--kt-text-3)", fontWeight: 400 }}>· {sung} songs · {sim.input.reactionsSent[m.id] ?? 0} reactions · {sim.input.awardsGiven[m.id] ?? 0} awards given</small>
              </b>
              <Titles ids={sim.result[m.id] ?? []} repeated={repeated} />
            </div>
          );
        })}
      </div>

      <h2 style={h2}>All {TITLES.length} titles</h2>
      <ChipRow>
        {(["all", "position", "most", "threshold", "filler"] as const).map((k) => (
          <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
            {k === "all" ? "All" : KIND_LABEL[k]}
          </Chip>
        ))}
      </ChipRow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, marginTop: 12 }}>
        {TITLES.filter((id) => kind === "all" || TITLE_RULES[id].kind === kind).map((id) => {
          const rule = TITLE_RULES[id];
          const result = computeTitles(rule.example);
          const ok = rule.winners ? rule.winners.every((w) => result[w]?.includes(id)) : Object.values(result).some((t) => t.includes(id));
          return (
            <div key={id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b style={{ fontSize: 18 }}>
                  {TITLE_INFO[id].emoji} {TITLE_INFO[id].name}
                </b>
                <span style={{ ...pill, fontSize: 12 }}>
                  {KIND_LABEL[rule.kind]}
                  {SHARED_TITLES.has(id) ? " · spread out" : ""}
                </span>
              </div>
              <p style={muted}>{TITLE_INFO[id].description}</p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <b>Stat:</b> {rule.stat}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <b>Needs:</b> {rule.needs}
              </p>
              <div style={{ borderTop: "1px solid var(--kt-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={muted}>
                  {ok ? "✓" : "⚠ engine disagrees:"} {rule.story}
                </span>
                {rule.example.members.map((m) => (
                  <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ width: 44, fontSize: 13, color: "var(--kt-text-2)", textTransform: "capitalize" }}>{m.id}</span>
                    <Titles ids={result[m.id] ?? []} hot={id} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
