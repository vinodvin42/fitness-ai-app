import Redis from "ioredis";
import { env } from "../config/env";

/**
 * Optional Redis connection, used by the rate limiter (and available to
 * anything else that needs shared state across instances).
 *
 * Spec §11's stack table names "Redis (BullMQ for activation retries,
 * payouts, notifications)". This is the first half: a shared store so
 * the API can run more than one instance. The queue half is not built —
 * see the note in `middleware/rateLimit.ts` and the gap review.
 *
 * Deliberately optional. A single-instance deployment works exactly as
 * before with no Redis configured, and the in-memory limiter is correct
 * there. What must never happen is a multi-instance deployment silently
 * falling back to per-instance limits — so `assertRateLimitStoreIsSafe()`
 * below makes that a boot failure rather than a quiet weakening of the
 * one control standing between this API and credential stuffing.
 */
let client: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

/**
 * Lazily connects. Kept lazy for the same reason the payment provider is
 * — eagerly constructing a client at import time means an unreachable
 * dependency breaks every route that transitively imports the module,
 * not just the ones that use it (a real lesson recorded in apps/api's
 * own README).
 */
export function getRedis(): Redis {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured — set REDIS_URL");
  }
  if (!client) {
    client = new Redis(env.REDIS_URL!, {
      // The rate limiter must not queue commands forever behind a dead
      // Redis: failing fast lets the limiter's own error path run rather
      // than hanging every login request.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      // Logged, not thrown: an unreachable Redis must degrade the
      // limiter, never take the API down with it.
      console.error("[redis] connection error:", err.message);
    });
  }
  return client;
}

/**
 * Refuses to boot a multi-instance deployment with a per-instance rate
 * limiter.
 *
 * This is the whole point of the exercise. An in-memory limiter behind a
 * load balancer means an attacker gets `limit x instanceCount` attempts
 * and nobody notices, because nothing errors — the limiter is simply
 * weaker than its configuration claims. That silence is why this is a
 * hard failure at boot rather than a warning in a log nobody reads.
 */
export function assertRateLimitStoreIsSafe(): void {
  if (env.API_INSTANCE_COUNT > 1 && !isRedisConfigured()) {
    throw new Error(
      `API_INSTANCE_COUNT is ${env.API_INSTANCE_COUNT} but REDIS_URL is not set. ` +
        "Rate limits would be enforced per instance, giving an attacker that many times the allowance. " +
        "Set REDIS_URL, or set API_INSTANCE_COUNT=1 if this really is a single instance.",
    );
  }
}

/** For tests and graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}
