import { BRAND_NAME } from "@fitness-ai-app/config";

/**
 * The chevron mark plus the wordmark, as delivered on the logo sheet.
 *
 * Replaces a rounded gold tile containing BRAND_MARK ("FX") and a
 * hardcoded "FYNROX". Two things were wrong with that: the letters were
 * standing in for a logo that exists, and the name was written out in
 * capitals in six separate files, so the FynroX -> Fynrox rename had to
 * find every one of them. The name now comes from the constant.
 *
 * aria-hidden on the SVG because the wordmark beside it already says the
 * name; without it every screen reader announces the brand twice.
 */
export function BrandLockup({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 68 48" className="h-5 w-[1.77rem] shrink-0" aria-hidden="true" focusable="false">
        <path d="M0 0h17l16 24-16 24H0l16-24z" className="fill-accent" />
        <path d="M22 0h17l16 24-16 24H22l16-24z" className="fill-accent" />
        <path d="M68 0H51L35 24l16 24h17L52 24z" className="fill-text-primary" />
      </svg>
      <div>
        <div className="text-sm font-semibold tracking-wide">{BRAND_NAME}</div>
        <div className="text-[10px] uppercase tracking-widest text-text-dim">{subtitle}</div>
      </div>
    </div>
  );
}
