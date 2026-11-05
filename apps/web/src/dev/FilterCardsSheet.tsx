import { GENRES } from "@karaoke-tube/catalog";
import { Tile, filterCardArt } from "@karaoke-tube/ui";

/** /dev/filter-cards: every filter card on one page (temporary contact sheet). */
export function FilterCardsSheet() {
  const items = [
    ...["en", "es"].map((id) => ({ kind: "language", id, name: id === "en" ? "English" : "Spanish" })),
    ...GENRES.filter((g) => !g.parent).map((g) => ({ kind: "genre", id: g.id, name: g.en })),
    { kind: "tag", id: "explicit", name: "Explicit" },
  ].filter((x) => filterCardArt(x.kind, x.id));
  return (
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 18 }}>
      {items.map((x) => {
        const art = filterCardArt(x.kind, x.id)!;
        return <Tile key={x.kind + x.id} id={x.id} title={art.title?.en ?? x.name} color={art.color} pattern={art.pattern} />;
      })}
    </div>
  );
}
