import { useEffect } from "react";
import { useLocation } from "react-router";

type EventType = "impression" | "detail";

export function QualifiedImpressions() {
  const location = useLocation();
  useEffect(() => {
    const queued = new Map<string, { postId: string; type: EventType }>();
    let flushTimer = 0;
    const flush = () => {
      window.clearTimeout(flushTimer);
      flushTimer = 0;
      if (!queued.size) return;
      const events = [...queued.values()];
      queued.clear();
      void fetch("/actions/analytics/impressions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const enqueue = (postId: string, type: EventType) => {
      queued.set(`${type}:${postId}`, { postId, type });
      if (!flushTimer) flushTimer = window.setTimeout(flush, 180);
    };

    const detail = document.querySelector<HTMLElement>("[data-post-detail-id]");
    if (detail?.dataset.postDetailId) enqueue(detail.dataset.postDetailId, "detail");

    const timers = new Map<Element, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timers.has(element)) {
            timers.set(element, window.setTimeout(() => {
              const postId = element.dataset.impressionPostId;
              if (postId) enqueue(postId, "impression");
              observer.unobserve(element);
              timers.delete(element);
            }, 1000));
          }
        } else {
          const timer = timers.get(element);
          if (timer) window.clearTimeout(timer);
          timers.delete(element);
        }
      }
    }, { threshold: [0, 0.5, 1] });
    document.querySelectorAll<HTMLElement>("[data-impression-post-id]").forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      timers.forEach((timer) => window.clearTimeout(timer));
      flush();
    };
  }, [location.pathname, location.search]);
  return null;
}
