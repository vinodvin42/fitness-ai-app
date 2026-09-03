import { initSentry, captureException } from "./lib/sentry";

// Must run before createApp() (or any other import that could throw) so
// Sentry can catch a failure during app setup too, not just inside a
// request handler — see lib/sentry.ts.
initSentry();

import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Go-live hardening (25 Aug 2026) — previously nothing handled SIGTERM,
// so a deploy/restart cycle would hard-kill in-flight requests and leave
// the Prisma connection pool to close uncleanly rather than shutting down.
// Most PaaS platforms (Render, Railway, etc.) send SIGTERM on redeploy —
// this gives the process a clean window to finish what it's doing first.
function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    prisma
      .$disconnect()
      .catch((err: unknown) => captureException(err))
      .finally(() => process.exit(0));
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A crash outside any request (e.g. a truly unhandled promise rejection
// somewhere) previously vanished into stdout with no record anywhere
// else. Captured, logged, then let the process exit — Node's own
// guidance is that process state after an uncaught exception shouldn't
// be trusted, so this deliberately doesn't try to keep running.
process.on("uncaughtException", (err) => {
  captureException(err);
  console.error("[api] uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  captureException(reason);
  console.error("[api] unhandled rejection:", reason);
});
