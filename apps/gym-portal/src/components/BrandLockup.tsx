import { BRAND_NAME } from "@fitness-ai-app/config";
import logoMark from "../assets/logo-mark.png";

/**
 * The Fynrox logo mark (a running figure that forms an "F") plus the
 * wordmark. The mark is the supplied artwork (see
 * packages/config/src/brand.ts); the name comes from BRAND_NAME.
 *
 * Empty alt and aria-hidden on the image because the wordmark beside it
 * already says the name; otherwise screen readers announce it twice.
 */
export function BrandLockup({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logoMark} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
      <div>
        <div className="text-sm font-semibold tracking-wide">{BRAND_NAME}</div>
        <div className="text-[10px] uppercase tracking-widest text-text-dim">{subtitle}</div>
      </div>
    </div>
  );
}
