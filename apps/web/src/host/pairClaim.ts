import { useState, type FormEvent } from "react";
import { localStorageCredentials } from "@karaoke-tube/client";
import type { PairClaimRequest } from "@karaoke-tube/shared";
import { useT, useToast } from "@karaoke-tube/ui";

/** The pairing form's logic: the code a TV at /tv shows is typed here and claimed for this party. Shared by Settings → TV screen and the "TV not connected" banner. */
export function usePairClaim(roomCode: string) {
  const t = useT();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/\D/g, "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const creds = localStorageCredentials().load(roomCode);
    if (!creds || clean.length !== 5 || busy) return setError(t("tvscreen.codeHint"));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pair/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: clean, roomCode, memberId: creds.memberId, key: creds.key } satisfies PairClaimRequest),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(res.status === 404 ? t("tvscreen.notFound") : res.status === 403 ? t("tvscreen.notHost") : (body?.message ?? t("tvscreen.error")));
        return;
      }
      setCode("");
      toast.show(t("tvscreen.paired"));
    } catch {
      setError(t("tvscreen.error"));
    } finally {
      setBusy(false);
    }
  };

  return { code, setCode: (v: string) => setCode(v.replace(/\D/g, "").slice(0, 5)), ready: clean.length === 5, busy, error, submit };
}
