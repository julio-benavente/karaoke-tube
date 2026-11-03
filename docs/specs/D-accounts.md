# D: Optional accounts

Branch `feat/accounts` (worktree `../karaoke-tube-accounts`). **Accounts are optional: guests keep joining and hosting
exactly as before.** Every account feature is opt-in and does nothing when nobody is signed in.

Username + password (PBKDF2-SHA256), bearer token kept in `localStorage` (`kt:account-token`), 60-day sessions.
Data lives in Cloudflare D1 (binding `DB`); tables are created on first use (`apps/api/src/accounts/db.ts`).

## Tasks

### D1 ✅ Contract + API
`packages/shared/src/accounts.ts` (exported from the index), `apps/api/src/routes/account.ts` under `/api/account`:
register / login / logout, `me` (profile, avatar, tagline, saved room settings, stats), change password (signs out other
devices), delete account, favorites, friends (request, accept, decline, remove; asking back = accept), party log.
Rate limit `AUTH_LIMITER`. Done when: `pnpm --filter @karaoke-tube/api test` passes (`test/account.test.ts`).

### D2 ✅ Saved room settings
`POST /api/rooms` with a valid token starts the room with the account's `roomSettings` (`Room.init` takes optional
settings, sanitized). Without a token: defaults.

### D3 ✅ Party log
`POST /api/account/parties { code, memberId, key }`: the room verifies the member key (`Room.memberSummary`), so only
real members can log a party. The web app logs on join and again when the party ends (adds recap id, titles, songs, cheers).

### D4 ✅ Client + web UI
`packages/client/src/account-api.ts`; web `/account` (sign in / create, profile + avatar + tagline, room settings,
favorites, friends, party log with recap links, password, delete); favorites heart in the song sheet; Join and New party
prefill name/avatar from the account; "Sign in to save your parties" link on Join. English + Spanish strings (`acct.*`).

## Contract changes (see README)
`accounts.ts` types, `Room.init(..., settings?)` and `Room.memberSummary()` RPC (A's folder, additive).

## Not done / ideas
- Account-aware presence ("friend is at a party", join a friend's party) needs a room-side presence feed.
- Email, password reset, Google sign-in (no email is stored today, so a lost password can't be recovered).
- Extension host app doesn't expose sign-in yet (it can reuse `createAccountApi` with a `chrome.storage` `TokenStore`).
- First deploy: Wrangler auto-creates the D1 database from `"d1_databases": [{ "binding": "DB" }]`; if it doesn't,
  run `wrangler d1 create karaoke-tube` and add the id.
