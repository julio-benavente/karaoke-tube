import { createRoomClient, memoryCredentials } from "@karaoke-tube/client";
import type { CreateRoomResponse, QueueItem, RoomClient, ServerMessage } from "@karaoke-tube/shared";
import {
  API_URL,
  WEB_URL,
  fetchHealth,
  type EndPartyResponse,
  type ExtMessage,
  type GetPartyResponse,
  type ShowOnTvResponse,
  type StartPartyResponse,
} from "@/utils/api";
import { PLAYER_PORT, type PlayerPortToBackground, type PlayerPortToTab } from "@/utils/ports";

type Port = Browser.runtime.Port;

/**
 * The running party. Kept in chrome.storage.local so it survives service worker restarts, extension reloads
 * and browser restarts; removed only when the party ends or the room is gone.
 */
type SavedParty = { code: string; memberId: string; key: string; youtubeTabId: number | null; hostTabId?: number | null };
const PARTY_KEY = "party";
const YOUTUBE_URL = "https://www.youtube.com/";
/** A party tab that doesn't connect within this long has an orphaned content script: reload it. */
const ORPHAN_CHECK_MS = 6000;
/** Navigating to the next song drops the tab's port for a moment; only report "TV closed" after this. */
const TAB_GONE_GRACE_MS = 5000;

let party: SavedParty | null = null;
let room: RoomClient | null = null;
/** The last `play` from the room, so a reloaded YouTube tab can pick the song up again. */
let currentPlay: QueueItem | null = null;
let playerPort: Port | null = null;
let ready: Promise<void> = Promise.resolve();

export default defineBackground(() => {
  console.log("[bg] service worker started");
  // Listeners must be registered synchronously; handlers wait for `ready` (the saved party) themselves.
  ready = restore();

  // After an extension update/reload the party tab's content script is orphaned: reload the tab.
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "update") return;
    void ready.then(() => reloadPartyTab("extension updated"));
  });

  browser.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
    handleMessage(msg)
      .then(sendResponse)
      .catch((e) => {
        console.error("[bg] message failed", msg.type, e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true; // async response
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PLAYER_PORT) void onPlayerPort(port);
  });

  // The host app on the website asks for "Show on TV" (manifest `externally_connectable`).
  browser.runtime.onMessageExternal.addListener((msg: ExtMessage, sender, sendResponse) => {
    if (!sender.url || new URL(sender.url).origin !== new URL(WEB_URL).origin || msg?.type !== "SHOW_ON_TV") return;
    ready
      .then(showOnTv)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (party && party.youtubeTabId === tabId) {
      console.log("[bg] party YouTube tab closed");
      party.youtubeTabId = null;
      void save();
      reportTab(false);
    }
    if (party && party.hostTabId === tabId) {
      party.hostTabId = null;
      void save();
    }
  });
});

// ── Popup messages ───────────────────────────────────────────────────────

async function handleMessage(msg: ExtMessage): Promise<unknown> {
  await ready;
  switch (msg.type) {
    case "PING_API":
      return { ok: true, health: await fetchHealth() };
    case "START_PARTY":
      return startParty(msg.nickname, msg.avatarSeed);
    case "END_PARTY":
      return endParty();
    case "GET_PARTY":
      return getParty();
    case "SHOW_ON_TV":
      return showOnTv();
    case "OPEN_HOST":
      return openHost();
  }
}

async function startParty(nickname: string, avatarSeed: string): Promise<StartPartyResponse> {
  if (party) {
    // Already running: just bring back the YouTube window if it was closed.
    if (party.youtubeTabId === null) party.youtubeTabId = await openYouTubeWindow();
    await save();
    return { ok: true, code: party.code };
  }
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, avatarSeed }),
  });
  if (!res.ok) return { ok: false, error: `Couldn't create a room (${res.status})` };
  const created = (await res.json()) as CreateRoomResponse;
  console.log("[bg] room created", created.code);

  party = { code: created.code, memberId: created.memberId, key: created.key, youtubeTabId: null, hostTabId: null };
  await save();
  connectRoom();
  await openHost();
  party.youtubeTabId = await openYouTubeWindow();
  await save();
  return { ok: true, code: created.code };
}

/**
 * The host app is a page on the website. Its link carries the host's credentials in the fragment (never sent
 * to a server) and this extension's id, so the page can rejoin as the host and ask for "Show on TV".
 */
function hostUrl(p: SavedParty): string {
  const hash = new URLSearchParams({ m: p.memberId, k: p.key, x: browser.runtime.id });
  return `${WEB_URL}/host/${p.code}#${hash}`;
}

async function openHost(): Promise<{ ok: boolean }> {
  if (!party) return { ok: false };
  if (party.hostTabId != null) {
    try {
      const tab = await browser.tabs.update(party.hostTabId, { active: true });
      if (tab?.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
      return { ok: true };
    } catch {
      party.hostTabId = null; // closed
    }
  }
  const tab = await browser.tabs.create({ url: hostUrl(party) });
  party.hostTabId = tab.id ?? null;
  await save();
  return { ok: true };
}

/** A separate window the host drags onto the TV. */
async function openYouTubeWindow(): Promise<number | null> {
  const win = await browser.windows.create({ url: YOUTUBE_URL, type: "normal", focused: true });
  return win?.tabs?.[0]?.id ?? null;
}

async function endParty(): Promise<EndPartyResponse> {
  if (!room) {
    await endLocal();
    return { ok: true };
  }
  const r = room;
  r.send({ type: "end_party" });
  // Wait (briefly) for the room to confirm, then clean up either way.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 3000);
    const unsubscribe = r.subscribe(() => r.state?.status === "ended" && done());
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
  await endLocal();
  return { ok: true };
}

function getParty(): GetPartyResponse {
  if (!party) return { ok: true, party: null };
  const guestCount = room?.state?.members.filter((m) => m.role !== "host").length ?? 0;
  return { ok: true, party: { code: party.code, guestCount, tvOpen: party.youtubeTabId !== null } };
}

/** Bring the party's YouTube window forward, full screen, with the player filling it. */
async function showOnTv(): Promise<ShowOnTvResponse> {
  if (!party) return { ok: false, error: "No party is running." };
  if (party.youtubeTabId === null) {
    party.youtubeTabId = await openYouTubeWindow();
    await save();
  }
  const tabId = party.youtubeTabId;
  if (tabId === null) return { ok: false, error: "Couldn't open the YouTube window." };
  const tab = await browser.tabs.get(tabId);
  await browser.tabs.update(tabId, { active: true });
  if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true, state: "fullscreen" });
  postPlayer({ type: "fullscreen" });
  return { ok: true };
}

// ── The room connection ──────────────────────────────────────────────────

async function restore() {
  const saved = (await browser.storage.local.get(PARTY_KEY))[PARTY_KEY] as SavedParty | undefined;
  if (!saved) return;
  console.log("[bg] restoring party", saved.code);
  // Tab ids don't survive a browser restart; forget the ones that are gone.
  // (A reused id would be some other page, so check the page too.)
  saved.youtubeTabId = await existingTab(saved.youtubeTabId, (url) => /^https:\/\/([a-z]+\.)?youtube\.com\//.test(url));
  saved.hostTabId = await existingTab(saved.hostTabId ?? null, (url) => url.startsWith(`${WEB_URL}/host/${saved.code}`));
  party = saved;
  await save();
  connectRoom();
  // The party tab is still open but its content script may be from before an extension reload.
  if (party.youtubeTabId !== null) {
    setTimeout(() => {
      if (party?.youtubeTabId != null && !playerPort) void reloadPartyTab("party tab didn't reconnect");
    }, ORPHAN_CHECK_MS);
  }
}

async function existingTab(id: number | null, isRightPage: (url: string) => boolean): Promise<number | null> {
  if (id === null) return null;
  try {
    const tab = await browser.tabs.get(id);
    const url = tab.url ?? tab.pendingUrl;
    return url === undefined || url === "" || isRightPage(url) ? id : null; // no "tabs" permission: the url may be hidden
  } catch {
    return null;
  }
}

async function reloadPartyTab(why: string) {
  if (party?.youtubeTabId == null) return;
  console.log(`[bg] reloading the party tab (${why})`);
  try {
    await browser.tabs.reload(party.youtubeTabId);
  } catch {
    party.youtubeTabId = null;
    await save();
    reportTab(false);
  }
}

async function save() {
  if (party) await browser.storage.local.set({ [PARTY_KEY]: party });
  else await browser.storage.local.remove(PARTY_KEY);
}

// ── TV window status ─────────────────────────────────────────────────────

let tabOpenSent: boolean | null = null;
let tabGoneTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Tells the room whether the TV window is there (`player_status`), so the host app can offer "Reopen TV window".
 * A dropped port is reported only after a grace period: moving to the next song reloads the tab.
 */
function reportTab(open: boolean, { immediate = false } = {}) {
  if (tabGoneTimer) clearTimeout(tabGoneTimer);
  tabGoneTimer = null;
  if (!open && !immediate && party?.youtubeTabId != null) {
    tabGoneTimer = setTimeout(() => {
      tabGoneTimer = null;
      if (!playerPort) sendTabStatus(false);
    }, TAB_GONE_GRACE_MS);
    return;
  }
  sendTabStatus(open);
}

function sendTabStatus(open: boolean) {
  tabOpenSent = open;
  room?.send({ type: "player_status", tabOpen: open });
}

/** Where a song that's already going is now, so a reopened TV window resumes there (0 for a new song). */
function startAtFor(item: QueueItem): number {
  const state = room?.state;
  if (!state || state.nowPlaying?.id !== item.id) return 0;
  const pb = state.playback;
  if (pb.state === "playing") return pb.positionSec + Math.max(0, Date.now() - pb.updatedAt) / 1000;
  if (pb.state === "paused") return pb.positionSec;
  return 0;
}

function connectRoom() {
  if (!party) return;
  room?.close();
  const client = createRoomClient({
    code: party.code,
    baseUrl: API_URL,
    credentials: memoryCredentials({ memberId: party.memberId, key: party.key }),
    player: true,
    onServerMessage: onServerMessage,
  });
  room = client;
  let wasOpen = false;
  client.subscribe(() => {
    if (room !== client) return;
    // Every (re)connection: tell the room whether the TV window is there.
    const open = client.status === "open";
    if (open && !wasOpen) sendTabStatus(playerPort !== null || (tabOpenSent === true && party?.youtubeTabId != null));
    wasOpen = open;
    onRoomChange(client);
  });
  client.onReaction((e) => postPlayer({ type: "reaction", ...e }));
  client.onError((e) => {
    console.warn("[bg] room error", e.code, e.message);
    // The room was deleted (ended more than an hour ago) or never existed.
    if (e.code === "room_not_found" || e.code === "bad_key") void endLocal();
  });
}

function onServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case "play":
      console.log("[bg] play", msg.item.song.title);
      currentPlay = msg.item;
      // The room resends `play` when the player reconnects mid-song: resume where it was.
      postPlayer({ type: "play", item: msg.item, startAt: startAtFor(msg.item) });
      break;
    case "player_command":
      postPlayer({ type: "command", command: msg.command });
      break;
    case "ended":
      void endLocal();
      break;
  }
}

function onRoomChange(client: RoomClient) {
  const state = client.state;
  if (!state) return;
  if (!state.nowPlaying && currentPlay) {
    currentPlay = null;
    postPlayer({ type: "stop" });
  }
  postPlayer({ type: "state", state });
  if (state.status === "ended") void endLocal();
}

/** Forget the party locally: close the socket, release the YouTube tab, tell the host app. */
async function endLocal() {
  if (!party && !room) return;
  console.log("[bg] party over");
  room?.close();
  room = null;
  party = null;
  currentPlay = null;
  tabOpenSent = null;
  if (tabGoneTimer) clearTimeout(tabGoneTimer);
  tabGoneTimer = null;
  await save();
  postPlayer({ type: "not_party" });
  playerPort?.disconnect();
  playerPort = null;
}

// ── Ports ────────────────────────────────────────────────────────────────

async function onPlayerPort(port: Port) {
  await ready;
  const tabId = port.sender?.tab?.id;
  if (!party || tabId === undefined || tabId !== party.youtubeTabId) {
    port.postMessage({ type: "not_party" } satisfies PlayerPortToTab);
    port.disconnect();
    return;
  }
  console.log("[bg] player tab connected", tabId);
  playerPort?.disconnect();
  playerPort = port;
  reportTab(true);
  port.onDisconnect.addListener(() => {
    if (playerPort !== port) return;
    playerPort = null;
    reportTab(false);
  });
  port.onMessage.addListener((raw) => {
    const msg = raw as PlayerPortToBackground;
    // `ping` only keeps the service worker awake.
    if (msg.type === "event") {
      room?.send({
        type: "player_event",
        event: msg.event,
        itemId: msg.itemId,
        positionSec: msg.positionSec,
        durationSec: msg.durationSec,
      });
    }
  });

  const state = room?.state ?? null;
  port.postMessage({ type: "party", code: party.code, state } satisfies PlayerPortToTab);
  // A reloaded or reopened tab picks the current song up again, where it was.
  if (currentPlay && state?.nowPlaying?.id === currentPlay.id) {
    port.postMessage({ type: "play", item: currentPlay, startAt: startAtFor(currentPlay) } satisfies PlayerPortToTab);
    if (state.playback.state === "paused") port.postMessage({ type: "command", command: "pause" } satisfies PlayerPortToTab);
  }
}

function postPlayer(msg: PlayerPortToTab) {
  try {
    playerPort?.postMessage(msg);
  } catch {
    playerPort = null;
  }
}
