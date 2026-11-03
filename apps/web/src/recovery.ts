import { localStorageCredentials } from "@karaoke-tube/client";
import type { Role } from "@karaoke-tube/shared";

/**
 * A personal "rejoin link" for people without an account: it carries this member's id + key in the URL fragment
 * (never sent to a server), so opening it on any device, or after clearing the browser, brings them back as the
 * same member with the same role. Hosts get the host app; everyone else the phone app.
 */
export function recoveryLink(code: string, role: Role): string | null {
  const creds = localStorageCredentials().load(code);
  if (!creds) return null;
  const hash = `#m=${encodeURIComponent(creds.memberId)}&k=${encodeURIComponent(creds.key)}`;
  return `${location.origin}/${role === "host" ? "host" : "join"}/${code}${hash}`;
}

/** If the address carries `#m=…&k=…`, saves them as this device's credentials for `code` and wipes the fragment. */
export function adoptRecoveryHash(code: string): boolean {
  const hash = new URLSearchParams(location.hash.slice(1));
  const memberId = hash.get("m");
  const key = hash.get("k");
  if (!memberId || !key) return false;
  localStorageCredentials().save(code, { memberId, key });
  history.replaceState(null, "", location.pathname + location.search);
  return true;
}
