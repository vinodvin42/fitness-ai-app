import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import type { ObjectStorageProvider, PutObjectInput, StoredObject } from "./types";

/**
 * Local-disk object storage — the development and single-instance
 * implementation of §11's "S3-compatible" file storage.
 *
 * Honest about what it is: `isConfigured()` returns false, because a
 * directory on one machine's disk is not object storage. Files written
 * here are invisible to a second instance and die with the container, so
 * any caller that needs durability must check `isConfigured()` and
 * degrade rather than assume the file survived. That is the same
 * discipline the payout provider follows, and for the same reason — a
 * placeholder that claims to be real is worse than no placeholder.
 *
 * Keys are `namespace/uuid.ext`. The original filename is used only for
 * its extension and never for the path: a user-supplied name reaching
 * the filesystem is how a path-traversal bug happens, and there is no
 * reason to take the risk when a uuid does the job.
 */
const ROOT = () => path.resolve(env.LOCAL_STORAGE_DIR ?? "./.storage");

function safeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  // Deliberately conservative: letters and digits only, capped. Anything
  // else (a second dot, a slash, a null byte) gets dropped rather than
  // sanitised, because "sanitise the dangerous input" is a longer list
  // of mistakes than "accept only the safe shape".
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export const localObjectStorage: ObjectStorageProvider = {
  name: "local-disk",

  // See the doc comment: a directory on one machine is not object
  // storage, and callers must be able to tell.
  isConfigured() {
    return false;
  },

  async put(input: PutObjectInput): Promise<StoredObject> {
    const key = `${input.namespace}/${crypto.randomUUID()}${safeExtension(input.filename)}`;
    const target = path.join(ROOT(), key);

    // Belt and braces: even though the key is uuid-derived, resolve and
    // confirm it stays inside the root before writing.
    if (!path.resolve(target).startsWith(ROOT() + path.sep)) {
      throw new Error("Refusing to write outside the storage root");
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.body);

    return {
      key,
      url: `/local-storage/${key}`,
      // Local files do not expire; a far-future date keeps the shape
      // identical to a real signed URL so callers need no special case.
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    };
  },

  async signedUrl(key: string): Promise<string> {
    return `/local-storage/${key}`;
  },

  async delete(key: string): Promise<void> {
    const target = path.join(ROOT(), key);
    if (!path.resolve(target).startsWith(ROOT() + path.sep)) {
      throw new Error("Refusing to delete outside the storage root");
    }
    await fs.rm(target, { force: true });
  },
};
