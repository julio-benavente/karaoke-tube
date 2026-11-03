// Runs the song catalog off the page's thread: download, parse, index and every search happen here, so the
// page never stalls on a 4 MB catalog. Talks to `createCatalogSearchApi` (search.ts) with the messages below.

import { createCatalogIndexAsync, fetchCatalog, type CatalogIndex, type WorkerReply, type WorkerRequest } from "./search";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};

let index: CatalogIndex | null = null;

scope.onmessage = async (e) => {
  const m = e.data;
  try {
    switch (m.op) {
      case "load":
        // Nothing here competes with the page, so index in big chunks.
        index = await createCatalogIndexAsync(await fetchCatalog(m.url), 8000);
        scope.postMessage({ id: m.id, ok: true, result: true });
        break;
      case "search":
        scope.postMessage({ id: m.id, ok: true, result: index?.search(m.q) ?? [] });
        break;
      case "browse":
        scope.postMessage({ id: m.id, ok: true, result: index?.browse(m.filter, m.limit) ?? [] });
        break;
      case "video":
        scope.postMessage({ id: m.id, ok: true, result: index?.byVideoId(m.videoId) ?? null });
        break;
    }
  } catch (err) {
    scope.postMessage({ id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
