// The room's timestamps (countdown end, song position) are in the server's clock. A phone's own clock can be seconds
// off, which would make every countdown wrong, so screens compare against `serverNow()` instead of `Date.now()`.

let skewMs = 0;

/** Call with the server time carried by a state message, right when it arrives (`serverTime` is `RoomState.serverNow`). */
export function noteServerTime(serverTime: number | undefined, { reset = false } = {}) {
  if (typeof serverTime !== "number") return;
  const sample = serverTime - Date.now();
  // A message only ever arrives late, so the largest sample is the one with the least network delay in it.
  skewMs = reset ? sample : Math.max(skewMs, sample);
}

/** The server's clock, in epoch ms. */
export function serverNow(): number {
  return Date.now() + skewMs;
}
