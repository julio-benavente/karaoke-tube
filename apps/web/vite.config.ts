import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, forward API + WebSocket calls to `wrangler dev` on :8787.
    // In production the same Worker serves both, so relative /api URLs just work.
    proxy: {
      "/api": { target: `http://localhost:${process.env.API_PORT ?? 8787}`, ws: true },
    },
  },
});
