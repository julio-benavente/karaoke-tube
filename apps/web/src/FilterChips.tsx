import { useState } from "react";
import { ArrowLeft, Mic2, SlidersHorizontal, X } from "lucide-react";
import { DECADES, GENRES, LANGUAGES, TAGS } from "@karaoke-tube/catalog";
import { Button, Chip, Sheet, useLang, useT } from "@karaoke-tube/ui";
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
            <div className={css.chips}>{tops.map((g) => chip("genre", g.id, g[lang]))}</div>
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
            <h3 className={css.h3}>{t("filters.language")}</h3>
            <div className={css.chips}>{LANGUAGES.map((l) => chip("language", l.id, l[lang]))}</div>
          </section>
          {(["mood", "occasion", "feature"] as const).map((kind) => (
            <section key={kind}>
              <h3 className={css.h3}>{t(`filters.${kind}`)}</h3>
              <div className={css.chips}>{TAGS.filter((x) => x.kind === kind).map((x) => chip("tag", x.id, x[lang]))}</div>
            </section>
          ))}
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
