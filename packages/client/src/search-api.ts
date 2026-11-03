import type { ApiErrorCode, ApiErrorResponse, RoomInfoResponse, SearchApi, SearchResponse, VideoResponse } from "@karaoke-tube/shared";

/** A non-2xx /api response. `code === "search_unavailable"` means: offer "paste a link instead". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The real `SearchApi`. `baseUrl` is the API origin; empty or omitted = the page's own origin. */
export function createSearchApi(baseUrl = ""): SearchApi {
  const base = baseUrl.replace(/\/$/, "");
  async function get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}/api${path}`);
    } catch {
      throw new ApiError(0, "network", "Can't reach the server");
    }
    if (res.ok) return res.json() as Promise<T>;
    const body = (await res.json().catch(() => null)) as Partial<ApiErrorResponse> | null;
    throw new ApiError(res.status, body?.error ?? (res.status === 404 ? "not_found" : "bad_request"), body?.message ?? `Request failed (${res.status})`);
  }
  return {
    search: (query) => get<SearchResponse>(`/search?q=${encodeURIComponent(query)}`),
    video: (videoId) => get<VideoResponse>(`/videos/${encodeURIComponent(videoId)}`),
    roomInfo: (code) => get<RoomInfoResponse>(`/rooms/${encodeURIComponent(code.toUpperCase())}`),
  };
}
