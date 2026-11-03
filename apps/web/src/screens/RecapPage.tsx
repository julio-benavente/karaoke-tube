import { Download, MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { ApiErrorResponse, Recap, RecapResponse } from "@karaoke-tube/shared";
import { Button, EmptyState, Logo, Spinner } from "@karaoke-tube/ui";
import { RecapView, ShareRecapButton } from "./RecapView";
import { saveRecapImage } from "./recap-image";
import css from "./RecapPage.module.css";

type Load = { state: "loading" } | { state: "gone" } | { state: "error" } | { state: "ready"; recap: Recap };

/** /recap/:id: public, no login. The recap card with Share and Save as image; friendly when it has expired. */
export function RecapPage({ preload }: { preload?: Recap } = {}) {
  const { id = "" } = useParams();
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
          title="This recap has expired"
          action={
            <Link to="/join" className={css.link}>
              <Button>Join a party</Button>
            </Link>
          }
        >
          Recaps are kept for 30 days after the party. Ask whoever hosted if they saved a copy.
        </EmptyState>
      )}
      {load.state === "error" && (
        <EmptyState icon={<MicOff />} title="Couldn't load this recap" action={<Button onClick={() => location.reload()}>Try again</Button>}>
          Check your connection and try again.
        </EmptyState>
      )}
      {load.state === "ready" && (
        <>
          <RecapView recap={load.recap} />
          <div className={css.actions}>
            <ShareRecapButton recap={load.recap} />
            <Button size="lg" variant="secondary" icon={<Download size={18} />} onClick={() => void saveRecapImage(load.recap)}>
              Save as image
            </Button>
          </div>
          <p className={css.foot}>
            Made with Karaoke Tube. <Link to="/join">Join a party</Link>
          </p>
        </>
      )}
    </div>
  );
}
