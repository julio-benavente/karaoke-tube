// Accounts contract (optional: guests keep working without one). Additive to protocol.ts; see docs/specs/D-accounts.md.
import type { Role, RoomSettings, Song, TitleId } from "./protocol";

/** What anyone can see about an account (friends, search by username). */
export type PublicProfile = {
  id: string;
  /** Unique, lowercase, 3–20 of a-z 0-9 _ */
  username: string;
  displayName: string;
  avatarSeed: string;
  tagline: string;
};

export type Account = PublicProfile & {
  createdAt: number;
  /** Saved room settings, applied to every room this account starts. Null = app defaults. */
  roomSettings: Partial<RoomSettings> | null;
};

export type AccountStats = { parties: number; hosted: number; songsSung: number; cheers: number; favorites: number; friends: number };

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;

/** POST /api/account/register, /login. The token goes in `Authorization: Bearer <token>`. */
export type RegisterRequest = { username: string; password: string; displayName?: string; avatarSeed?: string };
export type LoginRequest = { username: string; password: string };
export type AuthResponse = { token: string; account: Account };

/** GET /api/account/me */
export type MeResponse = { account: Account; stats: AccountStats };
/** PATCH /api/account/me */
export type UpdateProfileRequest = Partial<Pick<Account, "displayName" | "avatarSeed" | "tagline">> & {
  roomSettings?: Partial<RoomSettings> | null;
};
/** POST /api/account/password; DELETE /api/account (body) */
export type ChangePasswordRequest = { current: string; next: string };
export type DeleteAccountRequest = { password: string };

export type FavoriteSong = { song: Song; addedAt: number };
/** GET /api/account/favorites; PUT /favorites { song }; DELETE /favorites/:videoId */
export type FavoritesResponse = { favorites: FavoriteSong[] };

export type FriendStatus = "friend" | "incoming" | "outgoing";
export type Friend = { profile: PublicProfile; status: FriendStatus; since: number };
/** GET /api/account/friends; POST /friends { username }; POST /friends/:id/accept; DELETE /friends/:id (decline, cancel or remove) */
export type FriendsResponse = { friends: Friend[] };

/** One party this account was part of. */
export type PartyLogEntry = {
  code: string;
  role: Role;
  joinedAt: number;
  /** Null while the party is still open. */
  endedAt: number | null;
  recapId: string | null;
  songsSung: number;
  cheers: number;
  titles: TitleId[];
  members: number;
  /** Their most-cheered song, if they sang. */
  topSong: Song | null;
};
/** GET /api/account/parties; POST /parties logs or refreshes a party (proves membership with the room key). */
export type PartiesResponse = { parties: PartyLogEntry[] };
export type LogPartyRequest = { code: string; memberId: string; key: string };

/** Body of a non-2xx /api/account response. */
export type AccountErrorCode = "bad_request" | "unauthorized" | "username_taken" | "bad_credentials" | "not_found" | "too_many_requests";
export type AccountErrorResponse = { error: AccountErrorCode; message: string };
