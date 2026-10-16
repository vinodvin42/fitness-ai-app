/**
 * Scenario B — Landing application: synthetic submission → persisted
 * application → authorised admin view.
 *
 * Surfaces: landing (apps/landing/assets/js/forms.js builds the body and
 * POSTs to `${FYNROX_API_BASE_URL}/public/applications`), admin-web
 * (apps/admin-web/src/screens/acquisition/ApplicationsScreen.tsx).
 * API: modules/publicApplications, middleware/adminPermissions.ts.
 *
 * Not covered: the deployed landing site's configured API base URL
 * (assets/js/config.js is rewritten at deploy time). That needs the live
 * static site and is outside this isolated run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma";
import { CONFIGURATION, bearer, describeResponse, loginAdmin, loginUser, record, startJourney, type Journey } from "./harness/journey";
import { EMAIL_DOMAIN } from "./harness/syntheticWorld";

const S = "B";
let j: Journey;
let opsToken = "";
let supportToken = "";
let userToken = "";
let applicationId = "";
let applicantEmail = "";

/** The exact field set the landing professionals form sends (forms.js:92-117, professionals.html). */
function landingBody(email: string) {
  return {
    kind: "professional",
    fullName: "TEST-ONLY Applicant",
    email,
    phone: "+910000000000",
    detail: "TEST-ONLY: synthetic professional application",
    city: "TEST-ONLY City",
    message: "TEST-ONLY synthetic message",
    consentContact: true,
    consentMarketing: false,
  };
}

beforeAll(async () => {
  j = startJourney();
  applicantEmail = `applicant.${j.world.runId}@${EMAIL_DOMAIN}`;
  opsToken = await loginAdmin(j, j.world.adminOperations.email);
  supportToken = await loginAdmin(j, j.world.adminSupport.email);
  userToken = await loginUser(j, j.world.userA.email);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("B. Landing application", () => {
  it("B1 a landing submission is persisted", async () => {
    const res = await request(j.app).post("/public/applications").send(landingBody(applicantEmail));
    applicationId = res.body?.id ?? "";
    const row = applicationId ? await prisma.publicApplication.findUnique({ where: { id: applicationId } }) : null;
    const actionItem = applicationId
      ? await prisma.adminActionItem.findFirst({ where: { entityType: "public_application", entityId: applicationId } })
      : null;
    const ok = res.status === 201 && row?.email === applicantEmail && row?.status === "new" && row?.consentContact === true;
    record({
      scenario: S,
      check: "B1 submission → persisted application",
      surface: "landing",
      configuration: CONFIGURATION + "; request body matches forms.js for the professionals form",
      endpoints: ["POST /public/applications"],
      files: [
        "apps/landing/assets/js/forms.js",
        "apps/api/src/modules/publicApplications/publicApplications.routes.ts",
        "apps/api/src/modules/publicApplications/publicApplications.service.ts",
      ],
      recordsWritten: [`PublicApplication ${applicationId}`, `AdminActionItem ${actionItem?.id ?? "(none)"}`],
      recordsRead: [`PublicApplication ${applicationId}`],
      expected: "201 created; row with the submitted email, status new, consent recorded",
      observed: `${describeResponse(res)} outcome=${res.body?.outcome}; row status=${row?.status}; admin action item: ${actionItem ? "yes" : "no"}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("B2 a repeat submission does not create a duplicate", async () => {
    const res = await request(j.app).post("/public/applications").send(landingBody(applicantEmail));
    const count = await prisma.publicApplication.count({ where: { email: applicantEmail, kind: "professional" } });
    const ok = res.status === 200 && res.body?.outcome === "already_registered" && count === 1;
    record({
      scenario: S,
      check: "B2 duplicate submission",
      surface: "landing",
      configuration: CONFIGURATION,
      endpoints: ["POST /public/applications"],
      files: ["apps/api/src/modules/publicApplications/publicApplications.service.ts"],
      recordsWritten: [],
      recordsRead: ["PublicApplication (kind, email)"],
      expected: "200 already_registered; still exactly one row",
      observed: `${describeResponse(res)} outcome=${res.body?.outcome}; rows=${count}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("B3 a submission without contact consent is refused", async () => {
    const body = { ...landingBody(`no-consent.${j.world.runId}@${EMAIL_DOMAIN}`), consentContact: false };
    const res = await request(j.app).post("/public/applications").send(body);
    const count = await prisma.publicApplication.count({ where: { email: body.email } });
    const ok = res.status === 400 && count === 0;
    record({
      scenario: S,
      check: "B3 consent required",
      surface: "landing",
      configuration: CONFIGURATION,
      endpoints: ["POST /public/applications"],
      files: ["apps/api/src/modules/publicApplications/publicApplications.schema.ts"],
      recordsWritten: [],
      recordsRead: ["PublicApplication"],
      expected: "400 validation_error and nothing saved",
      observed: `${describeResponse(res)}; rows=${count}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });

  it("B4 an operations admin sees it; a support admin and a user are refused", async () => {
    const asOps = await request(j.app).get("/admin/applications?take=200&kind=professional").set(bearer(opsToken));
    const seen = (asOps.body?.items ?? []).find((i: { id: string }) => i.id === applicationId);
    const asSupport = await request(j.app).get("/admin/applications?take=200").set(bearer(supportToken));
    const asUser = await request(j.app).get("/admin/applications?take=200").set(bearer(userToken));
    const ok = asOps.status === 200 && seen?.email === applicantEmail && asSupport.status === 403 && asUser.status === 401;
    record({
      scenario: S,
      check: "B4 authorised admin view",
      surface: "admin-web",
      configuration: CONFIGURATION + "; operations = minimum role with growth:view",
      endpoints: ["POST /admin/auth/login", "GET /admin/applications"],
      files: [
        "apps/admin-web/src/screens/acquisition/ApplicationsScreen.tsx",
        "apps/api/src/modules/publicApplications/publicApplications.routes.ts",
        "apps/api/src/middleware/adminPermissions.ts",
      ],
      recordsWritten: [],
      recordsRead: [`PublicApplication ${applicationId}`],
      expected: "operations 200 and the application listed; support 403; user token 401",
      observed: `operations ${describeResponse(asOps)} listed=${!!seen}; support ${describeResponse(asSupport)}; user ${describeResponse(asUser)}`,
      verdict: ok ? "passed" : "failed",
    });
    expect(ok).toBe(true);
  });
});
