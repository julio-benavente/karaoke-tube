import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { accountRoutes } from "./routes/account";
import { healthRoutes } from "./routes/health";
import { recapRoutes } from "./routes/recaps";
import { roomRoutes } from "./routes/rooms";
import { searchRoutes } from "./routes/search";

export { Room } from "./durable-objects/room";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", logger());
// Allow the extension and the Vite dev server to call the API.
app.use("*", cors());

const routes = app
  .route("/health", healthRoutes)
  .route("/account", accountRoutes)
  .route("/rooms", roomRoutes)
  .route("/recaps", recapRoutes)
  .route("/", searchRoutes);

// Exported so the React apps can get a typed client via `hc<AppType>()`.
export type AppType = typeof routes;

console.log("[api] worker loaded");

export default app;
