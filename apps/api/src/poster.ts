/**
 * A song's poster address travels with the song (queue, favourites, recap), so everyone in a room sees the same
 * cover. It comes from the client, and every room member's browser loads it, so only the two cover CDNs we use are
 * accepted (Apple's mzstatic and Deezer's image CDN); anything else is dropped and the song just shows the generated look.
 */
const ALLOWED = /^https:\/\/(?:is\d-ssl\.mzstatic\.com|cdn-images\.dzcdn\.net)\/[\w\-./~%]+$/;

export function cleanPosterUrl(v: unknown): string | undefined {
  return typeof v === "string" && v.length <= 300 && ALLOWED.test(v) ? v : undefined;
}
