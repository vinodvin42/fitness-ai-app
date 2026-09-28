/**
 * `@fitness-ai-app/config` — shared runtime configuration.
 *
 * Until R1 this package shipped only `tsconfig.base.json` and
 * `.eslintrc.base.json` (build-time config, no source). The R1 spec
 * requires two things that have to live somewhere every surface can
 * import: the brand constant, and the §12 build-to defaults expressed as
 * settings rather than code. That is what this entry point adds.
 *
 * Import from the package root, never from `src/*` directly, so the
 * internal file layout stays free to change:
 *
 *   import { BRAND_NAME, r1Flags } from "@fitness-ai-app/config";
 */
export * from "./brand";
export * from "./r1Flags";
