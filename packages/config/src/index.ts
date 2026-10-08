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
 *
 * This package is COMPILED (`main` points at `dist/index.js`), unlike
 * `packages/types` next door, which ships its TypeScript source as its
 * entry point and gets away with it. The difference is that this one
 * exports runtime VALUES. `packages/types` is types only, so every
 * `import` of it is erased by `tsc` and nothing reaches Node at all —
 * grep `apps/api/dist` for it and there is no `require`. The values
 * here do reach Node: `apps/api/dist/**` carries a real
 * `require("@fitness-ai-app/config")` from eleven files.
 *
 * Pointing `main` at `src/index.ts` therefore handed Node a TypeScript
 * file to load at boot, and the API died on
 * `ERR_MODULE_NOT_FOUND ... /packages/config/src/brand` — the
 * extensionless relative export below — before it served a single
 * request. Every bundler in the repo (Vite, Metro, vitest) resolves TS
 * source happily, so nothing local caught it; CI's "boot the built API
 * and confirm /health" step did, which is the one check that runs the
 * artefact rather than the source.
 *
 * So: `npm run build` here, wired to `prepare` so an install produces
 * it, and to `apps/api`'s `prebuild` so the API can never be built
 * against a stale copy.
 */
export * from "./brand";
export * from "./r1Flags";
