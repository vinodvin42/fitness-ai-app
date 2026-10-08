import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { assertRateLimitStoreIsSafe, disconnectRedis, getRedis, isRedisConfigured } from "../src/lib/redis";
import { localObjectStorage } from "../src/providers/localObjectStorage";
import { objectStorage, providerStatus } from "../src/providers";

/**
 * Spec §11's stack table — "Redis (shared state)" and "File storage —
 * S3-compatible". Both land here as the seams they will eventually be
 * filled through, and both are tested for the thing that actually bites:
 * a control that is quietly weaker than its configuration claims.
 */

// `env` is the parsed config object, mutated and restored per test
// rather than re-imported — the guard reads it at call time precisely so
// it can be exercised without reloading the module graph.
const originalInstanceCount = env.API_INSTANCE_COUNT;
const originalRedisUrl = env.REDIS_URL;
const originalStorageDir = env.LOCAL_STORAGE_DIR;

afterEach(() => {
  env.API_INSTANCE_COUNT = originalInstanceCount;
  env.REDIS_URL = originalRedisUrl;
  env.LOCAL_STORAGE_DIR = originalStorageDir;
});

describe("Rate-limit store safety (§11 Redis)", () => {
  it("boots a single instance with no Redis — the in-memory limiter is correct there", () => {
    env.API_INSTANCE_COUNT = 1;
    env.REDIS_URL = undefined;
    expect(() => assertRateLimitStoreIsSafe()).not.toThrow();
    expect(isRedisConfigured()).toBe(false);
  });

  it("REFUSES to boot several instances without a shared store", () => {
    // The whole point. Without this the deployment starts happily and an
    // attacker simply gets `limit x instanceCount` login attempts, with
    // nothing anywhere reporting that the limiter is weaker than the
    // number written in its config. A boot failure is loud; that is the
    // only property that makes this worth having.
    env.API_INSTANCE_COUNT = 3;
    env.REDIS_URL = undefined;
    expect(() => assertRateLimitStoreIsSafe()).toThrow(/REDIS_URL/);
  });

  it("names both the count and the remedy in the failure, so it is fixable without reading the source", () => {
    env.API_INSTANCE_COUNT = 4;
    env.REDIS_URL = undefined;
    expect(() => assertRateLimitStoreIsSafe()).toThrow(/API_INSTANCE_COUNT is 4/);
    expect(() => assertRateLimitStoreIsSafe()).toThrow(/API_INSTANCE_COUNT=1/);
  });

  it("boots several instances once a shared store is configured", () => {
    env.API_INSTANCE_COUNT = 3;
    env.REDIS_URL = "redis://localhost:6379";
    expect(() => assertRateLimitStoreIsSafe()).not.toThrow();
    expect(isRedisConfigured()).toBe(true);
  });

  it("refuses to hand out a client when Redis is not configured, rather than returning a broken one", () => {
    env.REDIS_URL = undefined;
    expect(() => getRedis()).toThrow(/not configured/);
  });

  it("applies the shared store to every limiter, not just the login one", async () => {
    // A limiter that silently kept the in-memory default would be the
    // same invisible weakening the guard above exists to prevent, so
    // this asserts the wiring rather than trusting it.
    const source = await fs.readFile(path.join(__dirname, "../src/middleware/rateLimit.ts"), "utf8");
    const limiters = source.match(/^export const \w+RateLimit = rateLimit\(/gm) ?? [];
    const stores = source.match(/store: sharedStore\(\)/g) ?? [];
    expect(limiters.length).toBeGreaterThan(0);
    expect(stores).toHaveLength(limiters.length);
  });
});

describe("Object storage adapter (§11 file storage)", () => {
  const tmpRoot = path.join(os.tmpdir(), `fynrox-storage-${process.pid}`);

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("reports itself UNCONFIGURED, because a directory on one machine is not object storage", () => {
    // Callers that need durability must be able to tell. Claiming to be
    // configured would turn "no vendor chosen yet" into a silent promise
    // that an evidence upload survived the container.
    expect(localObjectStorage.isConfigured()).toBe(false);
    expect(objectStorage.name).toBe("local-disk");
    expect(providerStatus().objectStorage.configured).toBe(false);
  });

  it("never puts the caller's filename in the key", async () => {
    env.LOCAL_STORAGE_DIR = tmpRoot;
    const stored = await localObjectStorage.put({
      namespace: "evidence",
      filename: "my holiday photo.png",
      contentType: "image/png",
      body: Buffer.from("x"),
    });
    expect(stored.key).not.toContain("holiday");
    expect(stored.key).toMatch(/^evidence\/[0-9a-f-]{36}\.png$/);
    await expect(fs.readFile(path.join(tmpRoot, stored.key), "utf8")).resolves.toBe("x");
  });

  it("drops a traversal filename to nothing rather than trying to sanitise it", async () => {
    env.LOCAL_STORAGE_DIR = tmpRoot;
    const stored = await localObjectStorage.put({
      namespace: "exports",
      filename: "../../../../etc/passwd",
      contentType: "text/plain",
      body: Buffer.from("y"),
    });
    // `path.extname("../../../../etc/passwd")` is "" — but the assertion
    // that matters is that nothing outside the root was touched.
    expect(stored.key).toMatch(/^exports\/[0-9a-f-]{36}$/);
    const written = path.resolve(tmpRoot, stored.key);
    expect(written.startsWith(path.resolve(tmpRoot) + path.sep)).toBe(true);
  });

  it("drops an extension that is not a plain short alphanumeric one", async () => {
    env.LOCAL_STORAGE_DIR = tmpRoot;
    for (const filename of ["report.tar.gz\u0000.png", "x.verylongextension", "x.p/g"]) {
      const stored = await localObjectStorage.put({
        namespace: "exports",
        filename,
        contentType: "application/octet-stream",
        body: Buffer.from("z"),
      });
      expect(stored.key).not.toContain("\u0000");
      expect(stored.key.split("/")).toHaveLength(2);
    }
  });

  it("refuses to delete outside the storage root", async () => {
    env.LOCAL_STORAGE_DIR = tmpRoot;
    await expect(localObjectStorage.delete("../../../../etc/passwd")).rejects.toThrow(/outside the storage root/);
  });

  it("deletes a key it wrote, and treats a second delete as a no-op", async () => {
    env.LOCAL_STORAGE_DIR = tmpRoot;
    const stored = await localObjectStorage.put({
      namespace: "meal-photos",
      filename: "a.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("q"),
    });
    await localObjectStorage.delete(stored.key);
    await expect(fs.readFile(path.join(tmpRoot, stored.key))).rejects.toThrow();
    await expect(localObjectStorage.delete(stored.key)).resolves.toBeUndefined();
  });

  it("returns a signed-url shape callers can refresh without re-uploading", async () => {
    await expect(localObjectStorage.signedUrl("evidence/abc.png")).resolves.toBe("/local-storage/evidence/abc.png");
  });
});

afterAll(async () => {
  await disconnectRedis();
});
