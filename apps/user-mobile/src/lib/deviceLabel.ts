import type { IconName } from "../components/Icon";

/** Turns a stored User-Agent into the "iPhone 15 Pro / Safari" style label shown under Active Sessions. */
export function describeUserAgent(ua: string | null): { name: string; detail: string; icon: IconName } {
  if (!ua) return { name: "Unknown device", detail: "No device details", icon: "smartphone" };
  const lower = ua.toLowerCase();
  const name = /iphone/.test(lower)
    ? "iPhone"
    : /ipad/.test(lower)
      ? "iPad"
      : /android/.test(lower)
        ? "Android device"
        : /macintosh|mac os/.test(lower)
          ? "Mac"
          : /windows/.test(lower)
            ? "Windows PC"
            : /linux/.test(lower)
              ? "Linux PC"
              : /okhttp|cfnetwork|expo/.test(lower)
                ? "Mobile device"
                : "Unknown device";
  const detail = /edg\//.test(lower)
    ? "Edge"
    : /chrome|crios/.test(lower)
      ? "Chrome"
      : /firefox|fxios/.test(lower)
        ? "Firefox"
        : /safari/.test(lower)
          ? "Safari"
          : /okhttp|cfnetwork|expo/.test(lower)
            ? "App"
            : "Browser";
  const icon: IconName = /Mac|PC/.test(name) ? "laptop" : "smartphone";
  return { name, detail, icon };
}

/** "just now", "2 hours ago", "3 days ago". */
export function timeAgo(iso: string | Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
