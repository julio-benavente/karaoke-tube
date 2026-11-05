import { useT } from "../i18n/context";
import css from "./ExplicitBadge.module.css";

/** Small "E" on a square, next to a song that is marked explicit. Renders nothing for other songs. */
export function ExplicitBadge({ song }: { song: { explicit?: boolean } }) {
  const t = useT();
  if (!song.explicit) return null;
  return (
    <span className={css.explicit} title={t("song.explicit")} aria-label={t("song.explicit")} data-testid="explicit-badge">
      E
    </span>
  );
}
