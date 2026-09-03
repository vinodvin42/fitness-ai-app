# config

Shared lint/TypeScript configuration for all apps and packages in this monorepo.

- `tsconfig.base.json` — strict-mode base compiler options, extended by each app/package's own `tsconfig.json`.
- `.eslintrc.base.json` — shared ESLint rules (`@typescript-eslint/recommended` + unused-vars conventions honoring a leading-underscore ignore pattern), extended by each app's own `.eslintrc.json`.

No environment-schema file yet — each app currently validates its own `.env` locally (see `apps/api/src/config/env.ts`); pull shared env-schema pieces in here if/when `admin-web` needs the same variables.
