/**
 * Scenario D — Gym equipment: gym update → persisted data → correct member
 * view; another gym cannot change or retrieve restricted records.
 *
 * Surfaces: gym-portal (apps/gym-portal/src/screens/EquipmentScreen.tsx →
 * PATCH /gym-portal/locations/:id/equipment), user-mobile
 * (apps/user-mobile/src/api/partner.ts → POST /users/me/partner-code,
 * apps/user-mobile/src/api/gym.ts → GET /gym/me).
 *
 * Source-level finding this journey executes: the portal screen writes the
 * free-text GymLocation.equipment, while the member's GET /gym/me reads the
 * GymEquipment table. D2 states the intended behaviour (the member sees the
 * gym's update) and records what actually happens. D3 exercises the
 * API-only /gym-portal/equipment path, which no gym-portal screen calls.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, describeResponse, loginGym, loginUser, record, startJourney, type Journey } from "./harness/journey";

const S = "D";
const EQUIPMENT_TEXT = "TEST-ONLY: 4 squat racks, 1 cable station";
let j: Journey;
let gymA = "";
let gymB = "";
let member = "";
let nonMember = "";
let gymAEquipmentId = "";

beforeAll(async () => {
  j = startJourney();
  gymA = await loginGym(j, j.world.gymA.email);
  gymB = await loginGym(j, j.world.gymB.email);
  member = await loginUser(j, j.world.userB.email);
  nonMember = await loginUser(j, j.world.userA.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("D. Gym equipment → member view, and gym isolation", () => {
  it("D1 member joins gym A with its invite code", async () => {
    const link = await request(j.app).post("/users/me/partner-code").set(bearer(member)).send({ code: j.world.gymA.inviteCode, replace: true });
    const row = await prisma.user.findUnique({ where: { id: j.world.userB.id }, select: { gymId: true } });
    const ok = link.status === 201 && link.body?.partner?.gym?.id === j.world.gymA.id && row?.gymId === j.world.gymA.id;
    record({
      scenario: S,
      check: "D1 member links to gym A",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /users/me/partner-code"],
      files: ["apps/user-mobile/src/api/partner.ts", "apps/api/src/modules/userPartner/userPartner.service.ts"],
      recordsWritten: ["UserPartnerLink (user B → gym A)", "User B.gymId"],
      recordsRead: ["Gym A by invite code"],
      expected: "201 with gym A; User.gymId = gym A",
      observed: `${describeResponse(link)}; gym=${link.body?.partner?.gym?.id === j.world.gymA.id ? "gym A" : "other/none"}; User.gymId set=${row?.gymId === j.world.gymA.id}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("D2 gym A updates equipment in the portal; the member's My Gym view shows it", async () => {
    const patch = await request(j.app)
      .patch(`/gym-portal/locations/${j.world.gymA.locationId}/equipment`)
      .set(bearer(gymA))
      .send({ equipment: EQUIPMENT_TEXT });
    const stored = await prisma.gymLocation.findUnique({ where: { id: j.world.gymA.locationId } });
    const view = await request(j.app).get("/gym/me").set(bearer(member));
    const listed: Array<{ name: string }> = view.body?.equipment ?? [];
    const memberSeesIt = listed.some((e) => /squat rack|cable/i.test(e.name));
    const partner = await request(j.app).get("/users/me/partner").set(bearer(member));
    const partnerText = (partner.body?.partner?.gym?.locations ?? []).map((l: { equipment?: string }) => l.equipment ?? "").join(" | ");
    const ok = patch.status === 200 && stored?.equipment === EQUIPMENT_TEXT && view.status === 200 && memberSeesIt;
    record({
      scenario: S,
      check: "D2 portal equipment update → member My Gym view",
      surface: "gym-portal → user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["PATCH /gym-portal/locations/:id/equipment", "GET /gym/me", "GET /users/me/partner"],
      files: [
        "apps/gym-portal/src/screens/EquipmentScreen.tsx",
        "apps/api/src/modules/gymPortal/gymPortal.service.ts",
        "apps/user-mobile/src/api/gym.ts",
        "apps/api/src/modules/gymMember/gymMember.service.ts",
      ],
      recordsWritten: [`GymLocation ${j.world.gymA.locationId}.equipment`],
      recordsRead: ["GymLocation.equipment (DB)", "GymEquipment via GET /gym/me", "GymLocation.equipment via GET /users/me/partner"],
      expected: "portal update 200 and stored; the member's GET /gym/me lists the updated equipment",
      observed:
        `patch ${describeResponse(patch)}; stored=${stored?.equipment === EQUIPMENT_TEXT}; /gym/me ${describeResponse(view)} with ${listed.length} item(s), ` +
        `shows the update=${memberSeesIt}; /users/me/partner location text contains it=${partnerText.includes("squat")}`,
      verdict: ok ? "passed" : "failed",
      notes: "If failed: the portal writes GymLocation.equipment, the My Gym screen reads the GymEquipment table. Reported, not fixed.",
    });
    expect(ok).toBe(true);
  });

  it("D3 API-only equipment list (no portal screen calls it) reaches the member", async () => {
    const created = await request(j.app)
      .post("/gym-portal/equipment")
      .set(bearer(gymA))
      .send({ name: "TEST-ONLY Squat rack", category: "Barbell", quantity: 4, available: true });
    gymAEquipmentId = created.body?.equipment?.id ?? "";
    const view = await request(j.app).get("/gym/me").set(bearer(member));
    const seen = (view.body?.equipment ?? []).some((e: { id: string }) => e.id === gymAEquipmentId);
    const ok = created.status === 201 && seen;
    record({
      scenario: S,
      check: "D3 /gym-portal/equipment → member view",
      surface: "API only (no gym-portal screen) → user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["POST /gym-portal/equipment", "GET /gym/me"],
      files: ["apps/api/src/modules/gymPortalManage/gymPortalManage.routes.ts", "apps/api/src/modules/gymMember/gymMember.service.ts"],
      recordsWritten: [`GymEquipment ${gymAEquipmentId}`],
      recordsRead: ["GymEquipment via GET /gym/me"],
      expected: "201; the member's view lists the item",
      observed: `create ${describeResponse(created)}; listed for member=${seen}`,
      verdict: ok ? "passed" : "failed",
      notes: "Passing here does not make the gym-portal screen work: the screen does not call this endpoint (source-level).",
    });
    expect(ok).toBe(true);
  });

  it("D4 gym B cannot change or read gym A's location or equipment", async () => {
    const before = await prisma.gymLocation.findUnique({ where: { id: j.world.gymA.locationId } });
    const patchLoc = await request(j.app)
      .patch(`/gym-portal/locations/${j.world.gymA.locationId}/equipment`)
      .set(bearer(gymB))
      .send({ equipment: "TEST-ONLY tamper attempt" });
    const patchEq = gymAEquipmentId
      ? await request(j.app).patch(`/gym-portal/equipment/${gymAEquipmentId}`).set(bearer(gymB)).send({ available: false })
      : null;
    const delEq = gymAEquipmentId ? await request(j.app).delete(`/gym-portal/equipment/${gymAEquipmentId}`).set(bearer(gymB)) : null;
    const locsB = await request(j.app).get("/gym-portal/locations").set(bearer(gymB));
    const eqB = await request(j.app).get("/gym-portal/equipment").set(bearer(gymB));
    const after = await prisma.gymLocation.findUnique({ where: { id: j.world.gymA.locationId } });
    const eqRow = gymAEquipmentId ? await prisma.gymEquipment.findUnique({ where: { id: gymAEquipmentId } }) : null;
    const locLeak = (Array.isArray(locsB.body) ? locsB.body : []).some((l: { id: string }) => l.id === j.world.gymA.locationId);
    const eqLeak = (eqB.body?.items ?? []).some((e: { id: string }) => e.id === gymAEquipmentId);
    const ok =
      patchLoc.status === 404 &&
      after?.equipment === before?.equipment &&
      (!patchEq || patchEq.status === 404) &&
      (!delEq || delEq.status === 404) &&
      (!gymAEquipmentId || eqRow?.available === true) &&
      !locLeak &&
      !eqLeak;
    record({
      scenario: S,
      check: "D4 cross-gym isolation",
      surface: "gym-portal",
      configuration: CONFIGURATION,
      endpoints: [
        "PATCH /gym-portal/locations/:id/equipment",
        "PATCH /gym-portal/equipment/:id",
        "DELETE /gym-portal/equipment/:id",
        "GET /gym-portal/locations",
        "GET /gym-portal/equipment",
      ],
      files: ["apps/api/src/modules/gymPortal/gymPortal.service.ts", "apps/api/src/modules/gymPortalManage/gymPortalManage.service.ts", "apps/api/src/middleware/gymAuth.ts"],
      recordsWritten: [],
      recordsRead: ["GymLocation (gym A)", "GymEquipment (gym A)"],
      expected: "every gym B attempt 404; gym A's rows unchanged; gym B's lists exclude gym A's rows",
      observed:
        `location patch ${describeResponse(patchLoc)}; equipment patch ${patchEq ? describeResponse(patchEq) : "skipped"}; ` +
        `equipment delete ${delEq ? describeResponse(delEq) : "skipped"}; gym A text unchanged=${after?.equipment === before?.equipment}; ` +
        `gym A item intact=${eqRow?.available === true}; leaks: locations=${locLeak}, equipment=${eqLeak}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("D5 a user who has not joined a gym gets no gym data", async () => {
    const view = await request(j.app).get("/gym/me").set(bearer(nonMember));
    const ok = view.status === 404;
    record({
      scenario: S,
      check: "D5 non-member view",
      surface: "user-mobile",
      configuration: CONFIGURATION,
      endpoints: ["GET /gym/me"],
      files: ["apps/api/src/modules/gymMember/gymMember.service.ts"],
      recordsWritten: [],
      recordsRead: ["UserPartnerLink for user A"],
      expected: "404 gym_not_linked",
      observed: describeResponse(view),
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });
});
