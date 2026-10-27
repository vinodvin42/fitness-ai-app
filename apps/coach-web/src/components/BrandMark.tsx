import { BRAND_NAME } from "@fitness-ai-app/config";
import { cn } from "@/lib/utils";

/** The Fynrox mark plus "Fynrox Coach". `onDark` is for the always-dark brand panel. */
export function BrandMark({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img src="/logo-mark.png" alt="" className="size-8 shrink-0 rounded-lg" />
      <span className={cn("font-heading text-[17px] leading-none font-bold tracking-tight", onDark && "text-white")}>
        {BRAND_NAME} <span className={onDark ? "text-primary" : "text-primary-ink"}>Coach</span>
      </span>
    </span>
  );
}
