import { createRoomClient, memoryCredentials } from "@karaoke-tube/client";
import type { CreateRoomResponse, QueueItem, RoomClient, RoomState, ServerMessage } from "@karaoke-tube/shared";
import {
  API_URL,
  fetchHealth,
  type EndPartyResponse,
  type ExtMessage,
  type GetPartyResponse,
  type ShowOnTvResponse,
  type StartPartyResponse,
} from "@/utils/api";
import {
  PLAYER_PORT,
  ROOM_PORT,
  type PlayerPortToBackground,
  type PlayerPortToTab,
  type RoomPortToBackground,
  type RoomPortToPage,
} from "@/utils/ports";

type Port = Browser.runtime.Port;

/** What survives a service worker restart (chrome.storage.session, cleared when the browser closes). */
type SavedParty = { code: string; memberId: string; key: string; youtubeTabId: number | null };
const PARTY_KEY = "party";
const YOUTUBE_URL = "https://www.youtube.com/";

let party: SavedParty | null = null;
let room: RoomClient | null = null;
/** The last `play` from the room, so a reloaded YouTube tab can pick the song up again. */
let currentPlay: QueueItem | null = null;
/** Last state seen, kept after the party ends so the host app can show the ended screen. */
let lastState: RoomState | null = null;
/** Why the last party's connection closed, for the host app (`RoomClient.closeReason`). */
let closedReason: "kicked" | "ended" | "left" | null = null;
let playerPort: Port | null = null;
const pagePorts = new Set<Port>();
let ready: Promise<void> = Promise.resolve();

export default defineBackground(() => {
  console.log("[bg] service worker started");
  // Listeners must be registered synchronously; handlers wait for `ready` (the saved party) themselves.
  ready = restore();

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
    if (port.name === ROOM_PORT) void onPagePort(port);
    else if (port.name === PLAYER_PORT) void onPlayerPort(port);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (party && party.youtubeTabId === tabId) {
      console.log("[bg] party YouTube tab closed");
      party.youtubeTabId = null;
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

  party = { code: created.code, memberId: created.memberId, key: created.key, youtubeTabId: null };
  lastState = null;
  closedReason = null;
  await save();
  connectRoom();
  await browser.tabs.create({ url: browser.runtime.getURL("/host.html") });
  party.youtubeTabId = await openYouTubeWindow();
  await save();
  return { ok: true, code: created.code };
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
  return { ok: true, party: { code: party.code, guestCount } };
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
  const saved = (await browser.storage.session.get(PARTY_KEY))[PARTY_KEY] as SavedParty | undefined;
  if (!saved) return;
  console.log("[bg] restoring party", saved.code);
  party = saved;
  connectRoom();
}

async function save() {
  if (party) await browser.storage.session.set({ [PARTY_KEY]: party });
  else await browser.storage.session.remove(PARTY_KEY);
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
  client.subscribe(() => {
    if (room !== client) return;
    onRoomChange(client);
  });
  client.onReaction((e) => {
    postPages({ type: "reaction", ...e });
    postPlayer({ type: "reaction", ...e });
  });
  client.onError((e) => {
    console.warn("[bg] room error", e.code, e.message);
    postPages({ type: "error", ...e });
    // The room was deleted (ended more than an hour ago) or never existed.
    if (e.code === "room_not_found" || e.code === "bad_key") void endLocal();
  });
}

function onServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case "play":
      console.log("[bg] play", msg.item.song.title);
      currentPlay = msg.item;
      postPlayer({ type: "play", item: msg.item });
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
  if (state) lastState = state;
  postPages(snapshot());
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
  closedReason = lastState?.status === "ended" ? "ended" : (room?.closeReason ?? "left");
  room?.close();
  room = null;
  party = null;
  currentPlay = null;
  await save();
  postPlayer({ type: "not_party" });
  playerPort?.disconnect();
  playerPort = null;
  postPages(snapshot());
}

function snapshot(): RoomPortToPage {
  return {
    type: "snapshot",
    status: room?.status ?? "closed",
    state: room?.state ?? lastState,
    memberId: party?.memberId ?? lastState?.members.find((m) => m.role === "host")?.id ?? null,
    closeReason: room ? (room.closeReason ?? null) : closedReason,
  };
}

// ── Ports ────────────────────────────────────────────────────────────────

async function onPagePort(port: Port) {
  await ready;
  pagePorts.add(port);
  port.onDisconnect.addListener(() => pagePorts.delete(port));
  port.onMessage.addListener((raw) => {
    const msg = raw as RoomPortToBackground;
    if (msg.type === "send") {
      if (room) room.send(msg.msg);
      else port.postMessage({ type: "error", code: "room_not_found", message: "No party is running." } satisfies RoomPortToPage);
    }
  });
  port.postMessage(snapshot());
}

function postPages(msg: RoomPortToPage) {
  for (const port of pagePorts) {
    try {
      port.postMessage(msg);
    } catch {
      pagePorts.delete(port);
    }
  }
}

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
  port.onDisconnect.addListener(() => {
    if (playerPort === port) playerPort = null;
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
  // A reloaded tab picks the current song up again.
  if (currentPlay && state?.nowPlaying?.id === currentPlay.id) {
    port.postMessage({ type: "play", item: currentPlay } satisfies PlayerPortToTab);
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
