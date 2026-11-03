import { useEffect, useState } from "react";
import type { LiveParty } from "@karaoke-tube/shared";
import { useAccount } from "./AccountContext";

/**
 * The signed-in account's parties that are still open, with the credentials to get back in from this device.
 * `null` while loading; `[]` for guests or when there is nothing to rejoin. Errors count as "nothing" so the app
 * keeps working offline.
 */
export function useLiveParties(): LiveParty[] | null {
  const { api, account, loading } = useAccount();
  const [parties, setParties] = useState<LiveParty[] | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!account) return setParties([]);
    let live = true;
    api
      .liveParties()
      .then((r) => live && setParties(r.parties))
      .catch(() => live && setParties([]));
    return () => {
      live = false;
    };
  }, [api, account, loading]);
  return parties;
}
