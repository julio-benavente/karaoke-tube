import { Download, MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { ApiErrorResponse, Recap, RecapResponse } from "@karaoke-tube/shared";
import { Button, EmptyState, Logo, SessionLanguage, Spinner, useT } from "@karaoke-tube/ui";
import { RecapView, ShareRecapButton } from "./RecapView";
import { saveRecapImage } from "./recap-image";
import css from "./RecapPage.module.css";

type Load = { state: "loading" } | { state: "gone" } | { state: "error" } | { state: "ready"; recap: Recap };

/** /recap/:id: public, no login. The recap card with Share and Save as image; friendly when it has expired. */
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

  return (
    <div className={css.page}>
      <div className={css.top}>
        <Logo />
      </div>
      {load.state === "loading" && <Spinner />}
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
      {load.state === "ready" && (
        // The recap is in the language the night was held in.
        <SessionLanguage lang={load.recap.language}>
          <RecapBody recap={load.recap} />
        </SessionLanguage>
      )}
    </div>
  );
}

function RecapBody({ recap }: { recap: Recap }) {
  const t = useT();
  return (
    <>
      <RecapView recap={recap} />
      <div className={css.actions}>
        <ShareRecapButton recap={recap} />
        <Button size="lg" variant="secondary" icon={<Download size={18} />} onClick={() => void saveRecapImage(recap, t)}>
          {t("recap.save")}
        </Button>
      </div>
      <p className={css.foot}>
        {t("recap.madeWith")} <Link to="/join">{t("recap.joinParty")}</Link>
      </p>
    </>
  );
}
