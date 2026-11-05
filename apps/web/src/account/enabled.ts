/**
 * Accounts (sign-up, sign-in, favorites, friends, the party log) are switched off for now: no /account page, no sign-in link, and a
 * saved sign-in is ignored. The code stays; build with VITE_ACCOUNTS=1 (and set ACCOUNTS_ENABLED to "true" on the server) to bring it back.
 */
export const ACCOUNTS_ENABLED: boolean = import.meta.env.VITE_ACCOUNTS === "1";
