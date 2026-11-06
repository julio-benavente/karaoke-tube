import { MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { ApiErrorResponse, Recap, RecapResponse } from "@karaoke-tube/shared";
import { Button, EmptyState, Logo, SessionLanguage, Spinner, useT } from "@karaoke-tube/ui";
import { RecapView, ShareRecapButton } from "./RecapView";
import css from "./RecapPage.module.css";

type Load = { state: "loading" } | { state: "gone" } | { state: "error" } | { state: "ready"; recap: Recap };

/** /recap/:id: public, no login. The recap card with a Share button; friendly when it has expired. */
export function RecapPage({ preload }: { preload?: Recap } = {}) {
  const { id = "" } = useParams();
  const t = useT();
  const [load, setLoad] = useState<Load>(preload ? { state: "ready", recap: preload } : { state: "loading" });

  useEffect(() => {
    if (preload) return;
    const ctl = new AbortController();
    setLoad({ state: "loading" });
    fetch(`/api/recaps/${encodeURIComponent(id)}`, { signal: ctl.signal })
      .then(async (res) => {
        if (res.status === 404) return setLoad({ state: "gone" });
        if (!res.ok) return setLoad({ state: "error" });
        const body = (await res.json()) as RecapResponse | ApiErrorResponse;
        setLoad("recap" in body ? { state: "ready", recap: body.recap } : { state: "error" });
      })
      .catch((e) => e.name !== "AbortError" && setLoad({ state: "error" }));
    return () => ctl.abort();
  }, [id, preload]);

  // The recap itself is laid out like the end of the phone story (same width, spacing and bottom bar).
  if (load.state === "ready") {
    return (
      // The recap is in the language the night was held in.
      <SessionLanguage lang={load.recap.language}>
        <RecapBody recap={load.recap} />
      </SessionLanguage>
    );
  }

  return (
    <div className={css.page}>
      <div className={css.top}>
        <Logo />
      </div>
      {load.state === "loading" && (
        <div className={css.loading}>
          <Spinner />
        </div>
      )}
      {load.state === "gone" && (
        <EmptyState
          icon={<MicOff />}
          title={t("recap.expired")}
          action={
            <Link to="/join" className={css.link}>
              <Button>{t("recap.joinParty")}</Button>
            </Link>
          }
        >
          {t("recap.expiredHint")}
        </EmptyState>
      )}
      {load.state === "error" && (
        <EmptyState icon={<MicOff />} title={t("recap.loadError")} action={<Button onClick={() => location.reload()}>{t("common.tryAgain")}</Button>}>
          {t("recap.loadErrorHint")}
        </EmptyState>
      )}
    </div>
  );
}

function RecapBody({ recap }: { recap: Recap }) {
  const t = useT();
  return (
    <div className={css.summary}>
      <div className={css.scroll}>
        <RecapView recap={recap} />
        <p className={css.foot}>
          {t("recap.madeWith")} <Link to="/join">{t("recap.joinParty")}</Link>
        </p>
      </div>
      <div className={css.actions}>
        <ShareRecapButton recap={recap} />
      </div>
    </div>
  );
}
