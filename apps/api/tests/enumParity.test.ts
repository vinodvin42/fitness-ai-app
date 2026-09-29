import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `packages/types` hand-maintains string unions that mirror Prisma enums,
 * and admin-web builds filter dropdowns from those unions. When the enum
 * grows and the union doesn't, nothing breaks loudly: the type still
 * compiles, the API still emits the new value, and the only symptom is a
 * dropdown that silently cannot filter to it.
 *
 * That is exactly what had happened by the time this file was written —
 * `professional_assignment_pending` and `gym_help_request` were live and
 * emitting action items an admin could not filter to. Found by hand while
 * adding a third value, which is not a process that scales.
 *
 * Only enums whose values a client genuinely needs to enumerate are
 * listed. Adding an enum here is a claim that a drifting copy of it would
 * be a real defect, not a tidiness rule.
 */

const SCHEMA = fs.readFileSync(path.join(__dirname, "../prisma/schema.prisma"), "utf8");
const TYPES = fs.readFileSync(path.join(__dirname, "../../../packages/types/src/index.ts"), "utf8");

function prismaEnumValues(name: string): string[] {
  const match = SCHEMA.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!match) throw new Error(`No Prisma enum named ${name}`);
  return match[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/\/\/\/.*$/, "").trim())
    .filter((line) => line.length > 0 && /^[a-z_][a-z0-9_]*$/.test(line));
}

function typeUnionValues(name: string): string[] {
  // Matches `export type Name = | "a" | "b";` across lines, comments and all.
  const match = TYPES.match(new RegExp(`export type ${name} =([\\s\\S]*?);`));
  if (!match) throw new Error(`No exported type named ${name}`);
  return [...match[1].matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((m) => m[1]);
}

const MIRRORED: Array<{ prisma: string; type: string; why: string }> = [
  {
    prisma: "AdminActionItemType",
    type: "AdminActionItemType",
    why: "admin-web builds the Action Required type filter from this union",
  },
  {
    prisma: "PublicApplicationKind",
    type: "PublicApplicationKind",
    why: "admin-web builds the Applications form filter from this union",
  },
  {
    prisma: "PublicApplicationStatus",
    type: "PublicApplicationStatus",
    why: "admin-web renders one status-transition button per value",
  },
];

describe("packages/types unions match their Prisma enums", () => {
  for (const { prisma, type, why } of MIRRORED) {
    it(`${prisma} — ${why}`, () => {
      const fromSchema = prismaEnumValues(prisma).sort();
      const fromTypes = typeUnionValues(type).sort();

      // Asserted in both directions. A union that is missing a value
      // narrows a dropdown; a union with an extra value offers a filter
      // the API will reject, which looks like a broken screen.
      expect(fromTypes).toEqual(fromSchema);
    });
  }

  it("actually reads real values, rather than passing on two empty lists", () => {
    // The parser is regex over source text, so it can fail by matching
    // nothing. Without this, every assertion above would pass vacuously —
    // the same failure mode the event-registry test had on first draft.
    expect(prismaEnumValues("AdminActionItemType").length).toBeGreaterThan(15);
    expect(typeUnionValues("AdminActionItemType").length).toBeGreaterThan(15);
    expect(prismaEnumValues("AdminActionItemType")).toContain("safety_escalation");
  });
});
