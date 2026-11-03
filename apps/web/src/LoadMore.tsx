import { useEffect, useRef } from "react";
import { Button, useT, type UseSearch } from "@karaoke-tube/ui";

/**
 * Under a list of results: loads the next 40 when you scroll near the end (infinite scroll), and shows a
 * "Show more" button as well, for browsers or people the scrolling doesn't reach.
 */
export function LoadMore({ search }: { search: Pick<UseSearch, "hasMore" | "loadingMore" | "loadMore"> }) {
  const t = useT();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasMore, loadingMore, loadMore } = search;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    // Start a little early so the next songs are there by the time you reach the end.
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  if (!hasMore) return null;
  return (
    <div ref={sentinel} style={{ display: "flex", justifyContent: "center", padding: "16px 0 24px" }}>
      <Button variant="secondary" onClick={loadMore} disabled={loadingMore} data-testid="show-more">
        {loadingMore ? t("search.loadingMore") : t("search.showMore")}
      </Button>
    </div>
  );
}
