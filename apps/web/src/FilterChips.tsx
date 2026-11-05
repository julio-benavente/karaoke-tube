import { useState } from "react";
import { ArrowLeft, Mic2, SlidersHorizontal, X } from "lucide-react";
import { DECADES, GENRES, LANGUAGES } from "@karaoke-tube/catalog";
import { BROWSE_PRESETS, Button, Chip, Sheet, Tile, filterCardArt, filterCardDescription, useLang, useT } from "@karaoke-tube/ui";
import { countFilters, filterLabel, hasFilters, NO_FILTERS, type FilterKind, type Filters } from "./catalogFilters";
import type { useCatalogSearch } from "./useCatalogSearch";
import css from "./FilterChips.module.css";

type CS = ReturnType<typeof useCatalogSearch>;

/**
 * Put inside a chip row. "← Browse" (when you are looking at results), the Filters button, and one removable chip
 * per active filter. The Filters sheet opens from the button.
 */
export function FilterChips({ cs }: { cs: CS }) {
  const t = useT();
  const [lang] = useLang();
  const [open, setOpen] = useState(false);
  const count = countFilters(cs.filters);
  // Every active filter shows as a removable chip; the one-click ones live as cards on the Browse page.
  const active = (Object.keys(cs.filters) as FilterKind[]).flatMap((kind) => cs.filters[kind].map((id) => ({ kind, id })));
  return (
    <>
      {!cs.inBrowse && (
        <Chip icon={<ArrowLeft size={16} />} onClick={cs.backToBrowse} data-testid="back-to-browse">
          {t("filters.browse")}
        </Chip>
      )}
      <Chip icon={<SlidersHorizontal size={16} />} selected={count > 0} onClick={() => setOpen(true)} data-testid="open-filters">
        {count > 0 ? t("filters.titleCount", { count }) : t("filters.title")}
      </Chip>
      {active.map(({ kind, id }) => (
        <Chip key={kind + id} selected icon={<X size={14} />} onClick={() => cs.toggle(kind, id)} aria-label={t("filters.remove", { name: filterLabel(kind, id, lang) })} data-testid="active-filter">
          {filterLabel(kind, id, lang)}
        </Chip>
      ))}
      <FilterSheet open={open} onClose={() => setOpen(false)} cs={cs} />
    </>
  );
}

/** Tags that have a card and a place in the Filters sheet. */
const SHEET_TAGS = ["party", "ballad", "easy", "duet", "explicit"];

/** True when one of the "Browse all" cards already is exactly this single filter (Pop, 80s, Ballads…). */
function hasPreset(kind: FilterKind, id: string): boolean {
  return BROWSE_PRESETS.some((p) => {
    const v = (p.filter as Record<string, string | string[] | undefined>)[kind];
    const only = Object.keys(p.filter).length === 1;
    return only && (Array.isArray(v) ? v.length === 1 && v[0] === id : v === id);
  });
}

/** Colours the cards take in turn (the same twelve as the Browse all cards). */
const cardColor = (i: number) => `var(--kt-tile-${(i % 12) + 1})`;

/**
 * The rest of the one-click filters as cards under "Browse all": the other genres, the languages and the other tags
 * (anything that does not already have a card above). One click = just this filter.
 */
export function FilterCards({ cs, gridClassName, headingClassName }: { cs: CS; gridClassName?: string; headingClassName?: string }) {
  const t = useT();
  const [lang] = useLang();
  const tops = GENRES.filter((g) => !g.parent).map((g) => g.id);
  const genres = [...MAIN_GENRES.filter((id) => tops.includes(id)), ...tops.filter((id) => !MAIN_GENRES.includes(id))];
  const groups = [
    { key: "language", heading: t("filters.language"), items: MAIN_LANGUAGES.map((id) => ({ kind: "language" as FilterKind, id })) },
    { key: "genre", heading: t("filters.genre"), items: genres.map((id) => ({ kind: "genre" as FilterKind, id })) },
    { key: "tag", heading: t("filters.tags"), items: SHEET_TAGS.map((id) => ({ kind: "tag" as FilterKind, id })) },
  ]
    .map((g) => ({ ...g, items: g.items.filter((x) => !hasPreset(x.kind, x.id)) }))
    .filter((g) => g.items.length > 0);
  let n = 0;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} data-testid={`filter-cards-${g.key}`}>
          <h2 className={headingClassName}>{g.heading}</h2>
          <div className={gridClassName}>
            {g.items.map(({ kind, id }) => {
              const art = filterCardArt(kind, id);
              return (
              <Tile
                key={kind + id}
                id={`${kind}-${id}`}
                title={art?.title?.[lang] ?? filterLabel(kind, id, lang)}
                description={filterCardDescription(t, kind, id)}
                color={art?.color ?? cardColor(n++ + 3)}
                pattern={art?.pattern}
                onClick={() => {
                  cs.setFilters({ ...NO_FILTERS, [kind]: [id] });
                  window.scrollTo({ top: 0 });
                }}
              />
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

/** "Artists: Queen · Queen Latifah": tap one to see only that artist's songs. */
export function ArtistSuggestions({ cs }: { cs: CS }) {
  const t = useT();
  if (!cs.artists.length || !cs.q.trim()) return null;
  return (
    <div className={css.artists} data-testid="artist-suggestions">
      <span className={css.artistsLabel}>{t("filters.artists")}</span>
      {cs.artists.map((name) => (
        <Chip key={name} icon={<Mic2 size={14} />} onClick={() => cs.pickArtist(name)}>
          {name}
        </Chip>
      ))}
    </div>
  );
}

/** The genres most songs carry; the rest sit behind "+N more" so the sheet is short. Languages: only those the catalog has songs in. */
const MAIN_GENRES = ["pop", "rock", "country", "rnb", "hip-hop", "jazz", "electronic", "oldies", "musical-theatre", "disney", "christmas", "gospel", "balada", "tropical", "regional-mexican", "reggaeton"];
const MAIN_LANGUAGES = ["en", "es"];

/** A row of chips that shows the main ones, anything you picked, and a "+N more" chip that opens the rest. */
function ChipGroup<T extends { id: string }>({ items, main, selected, render }: { items: T[]; main: string[]; selected: string[]; render: (x: T) => React.ReactNode }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const shown = items.filter((x) => main.includes(x.id) || selected.includes(x.id));
  const hidden = items.length - shown.length;
  const list = all || hidden <= 0 ? items : shown;
  return (
    <div className={css.chips}>
      {list.map(render)}
      {hidden > 0 && (
        <Chip onClick={() => setAll(!all)} data-testid="chips-more">
          {all ? t("filters.fewer") : t("filters.more", { count: hidden })}
        </Chip>
      )}
    </div>
  );
}

function FilterSheet({ open, onClose, cs }: { open: boolean; onClose: () => void; cs: CS }) {
  const t = useT();
  const [lang] = useLang();
  const f = cs.filters;
  const chip = (kind: FilterKind, id: string, label: string) => (
    <Chip key={kind + id} selected={f[kind].includes(id)} onClick={() => cs.toggle(kind, id)}>
      {label}
    </Chip>
  );
  const tops = GENRES.filter((g) => !g.parent);
  // Sub-genres of the genres you picked (or whose children you picked), so "Rock" opens "Hard rock", "Glam rock"…
  const openParents = new Set(f.genre.map((id) => GENRES.find((g) => g.id === id)).filter(Boolean).map((g) => g!.parent ?? g!.id));
  return (
    <Sheet open={open} onClose={onClose} label={t("filters.title")}>
      <div className={css.sheet}>
        <h2 className={css.sheetTitle}>{t("filters.title")}</h2>
        <div className={css.sections}>
          <section>
            <h3 className={css.h3}>{t("filters.genre")}</h3>
            <ChipGroup items={tops} main={MAIN_GENRES} selected={[...f.genre, ...openParents]} render={(g) => chip("genre", g.id, g[lang])} />
            {[...openParents].map((parent) => {
              const kids = GENRES.filter((g) => g.parent === parent);
              if (!kids.length) return null;
              return (
                <div key={parent} className={css.sub}>
                  <span className={css.subLabel}>{filterLabel("genre", parent, lang)} · {t("filters.moreSpecific")}</span>
                  <div className={css.chips}>{kids.map((g) => chip("genre", g.id, g[lang]))}</div>
                </div>
              );
            })}
          </section>
          <section>
            <h3 className={css.h3}>{t("filters.decade")}</h3>
            <div className={css.chips}>{DECADES.map((d) => chip("decade", d.id, d[lang]))}</div>
          </section>
          <section>
            <h3 className={css.h3}>{t("filters.tags")}</h3>
            <div className={css.chips}>{SHEET_TAGS.map((id) => chip("tag", id, filterLabel("tag", id, lang)))}</div>
          </section>
          <section>
            <h3 className={css.h3}>{t("filters.language")}</h3>
            <div className={css.chips}>{LANGUAGES.filter((l) => MAIN_LANGUAGES.includes(l.id) || f.language.includes(l.id)).map((l) => chip("language", l.id, l[lang]))}</div>
          </section>
          <p className={css.hint}>{t("filters.hint")}</p>
        </div>
        <div className={css.footer}>
          <Button variant="secondary" disabled={!hasFilters(f)} onClick={() => cs.setFilters({ ...NO_FILTERS })}>
            {t("filters.clear")}
          </Button>
          <Button onClick={onClose}>{t("filters.done")}</Button>
        </div>
      </div>
    </Sheet>
  );
}
