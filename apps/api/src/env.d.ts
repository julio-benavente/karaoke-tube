// Secrets aren't in wrangler.jsonc, so `wrangler types` doesn't see them.
interface Env {
  /** YouTube Data API v3 key. `.dev.vars` locally, `wrangler secret put YOUTUBE_API_KEY` in production. */
  YOUTUBE_API_KEY?: string;
}
