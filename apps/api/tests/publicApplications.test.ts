import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { buildApp, prisma, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";

const app = buildApp();

/**
 * Spec §8 — the Public Website's forms, and the four states it names for
 * them: success, error, already-registered and consent.
 *
 * Until this existed, "Apply" on the For Gyms page was a `mailto:` link,
 * which has exactly one outcome and produces nothing the business can
 * see. These tests are mostly about the states rather than the storage,
 * because the states are the requirement.
 */
describe("Public applications (§8 website forms)", () => {
  const suffix = uniqueSuffix();
  let adminToken = "";
  const created: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: `admin-apps-${suffix}@example.com`,
        passwordHash: await hashPassword("AdminPass123!"),
        fullName: "Applications Fixture Admin",
        role: "super_admin",
        status: "active",
      },
    });
    const login = await request(app)
      .post("/admin/auth/login")
      .send({ email: admin.email, password: "AdminPass123!" });
    adminToken = login.body.token;
  });

  afterAll(async () => {
    await prisma.publicApplication.deleteMany({ where: { id: { in: created } } });
  });

  it("accepts an Early Access registration and reports it as created", async () => {
    const res = await request(app)
      .post("/public/applications")
      .send({
        kind: "early_access",
        email: `Early.Access-${suffix}@Example.com`,
        fullName: "Early Adopter",
        consentContact: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("created");
    created.push(res.body.id);

    const row = await prisma.publicApplication.findUnique({ where: { id: res.body.id } });
    // Lower-cased on write, so the already-registered check below is
    // about the person and not about their shift key.
    expect(row?.email).toBe(`early.access-${suffix}@example.com`);
    expect(row?.consentContact).toBe(true);
    expect(row?.consentMarketing).toBe(false);
  });

  it("returns the ALREADY-REGISTERED state for a second submission, not an error", async () => {
    // From the visitor's side, "you're already on the list" is the
    // outcome they wanted. An error here teaches people to resubmit with
    // a second address, which is how a clean list becomes a dirty one.
    const res = await request(app)
      .post("/public/applications")
      .send({
        kind: "early_access",
        email: `early.access-${suffix}@example.com`,
        fullName: "Early Adopter Again",
        consentContact: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("already_registered");
    expect(res.body.since).toBeTruthy();

    expect(
      await prisma.publicApplication.count({
        where: { kind: "early_access", email: `early.access-${suffix}@example.com` },
      }),
    ).toBe(1);
  });

  it("scopes already-registered to the form, so a gym can also register interest as a user", async () => {
    const res = await request(app)
      .post("/public/applications")
      .send({
        kind: "gym",
        email: `early.access-${suffix}@example.com`,
        fullName: "Same Person",
        organisation: "Iron House",
        consentContact: true,
      });

    expect(res.status).toBe(201);
    created.push(res.body.id);
  });

  it("REFUSES a submission without contact consent", async () => {
    // The consent state the spec names. This must fail closed: a row
    // written with consentContact false would be a lead nobody is
    // lawfully allowed to reply to, sitting in a queue that exists to be
    // replied to.
    const res = await request(app)
      .post("/public/applications")
      .send({
        kind: "early_access",
        email: `no-consent-${suffix}@example.com`,
        fullName: "No Consent",
        consentContact: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.fields.some((f: { path: string }) => f.path === "consentContact")).toBe(true);
    expect(await prisma.publicApplication.count({ where: { email: `no-consent-${suffix}@example.com` } })).toBe(0);
  });

  it("refuses a submission with consent omitted entirely, rather than defaulting it", async () => {
    const res = await request(app)
      .post("/public/applications")
      .send({ kind: "early_access", email: `missing-${suffix}@example.com`, fullName: "Missing" });

    expect(res.status).toBe(400);
    expect(await prisma.publicApplication.count({ where: { email: `missing-${suffix}@example.com` } })).toBe(0);
  });

  it("returns field-level errors so a form can mark the offending input", async () => {
    const res = await request(app)
      .post("/public/applications")
      .send({ kind: "gym", email: "not-an-email", fullName: "", consentContact: true });

    expect(res.status).toBe(400);
    const paths = res.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toContain("email");
    expect(paths).toContain("fullName");
    // Per-kind requirement: a gym application without a gym name.
    expect(paths).toContain("organisation");
  });

  it("requires a message on the contact form and a discipline on a professional application", async () => {
    const contact = await request(app)
      .post("/public/applications")
      .send({ kind: "contact", email: `c-${suffix}@example.com`, fullName: "C", consentContact: true });
    expect(contact.status).toBe(400);

    const pro = await request(app)
      .post("/public/applications")
      .send({ kind: "professional", email: `p-${suffix}@example.com`, fullName: "P", consentContact: true });
    expect(pro.status).toBe(400);
    expect(pro.body.error.fields.map((f: { path: string }) => f.path)).toContain("detail");
  });

  it("carries invite attribution through, so interest registered instead of an install is still credited", async () => {
    const res = await request(app)
      .post("/public/applications")
      .send({
        kind: "early_access",
        email: `attributed-${suffix}@example.com`,
        fullName: "Came From A Gym",
        consentContact: true,
        consentMarketing: true,
        sourceKind: "gym",
        sourceCode: "HYD-001",
      });

    expect(res.status).toBe(201);
    created.push(res.body.id);
    const row = await prisma.publicApplication.findUnique({ where: { id: res.body.id } });
    expect(row?.sourceKind).toBe("gym");
    expect(row?.sourceCode).toBe("HYD-001");
    expect(row?.consentMarketing).toBe(true);
  });

  it("queues a PARTNER application for an admin but does not queue Early Access", async () => {
    const partner = await request(app)
      .post("/public/applications")
      .send({
        kind: "creator",
        email: `creator-${suffix}@example.com`,
        fullName: "A Creator",
        organisation: "@handle",
        consentContact: true,
      });
    expect(partner.status).toBe(201);
    created.push(partner.body.id);

    expect(
      await prisma.adminActionItem.count({
        where: { entityType: "public_application", entityId: partner.body.id },
      }),
    ).toBe(1);

    // A few thousand Early Access signups in the action queue would bury
    // the dozen applications that need a human decision.
    const early = created[0];
    expect(
      await prisma.adminActionItem.count({ where: { entityType: "public_application", entityId: early } }),
    ).toBe(0);
  });

  it("opens CORS for the public form endpoint WITHOUT credentials", async () => {
    // The marketing site is a separate deploy and may sit on a different
    // origin than the API — driving the real form against a local API on
    // another port is exactly how this was found, with the browser
    // blocking the POST and the page showing "we couldn't reach Fynrox".
    //
    // The dangerous part is the pairing: an open origin PLUS credentials
    // lets any site make authenticated requests with a visitor's
    // cookies. Two earlier attempts at CORS in this app shipped that
    // pair, so this asserts the absence, not just the presence.
    const res = await request(app)
      .post("/public/applications")
      .set("Origin", "http://unrelated.example")
      .send({
        kind: "early_access",
        email: `cors-${suffix}@example.com`,
        fullName: "CORS Probe",
        consentContact: true,
      });
    created.push(res.body.id);
    expect(res.headers["access-control-allow-origin"]).toBe("http://unrelated.example");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("does NOT open CORS for the admin queue on the same router", async () => {
    // `/admin/applications` lives in the same module but must stay on the
    // allowlist — a public path prefix that accidentally covered it would
    // be the whole point of the exercise, undone.
    const res = await request(app).get("/admin/applications").set("Origin", "http://unrelated.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not expose the queue to an unauthenticated caller", async () => {
    expect((await request(app).get("/admin/applications")).status).toBe(401);
  });

  it("lets an admin read and work the queue, and records the transition", async () => {
    const list = await request(app)
      .get("/admin/applications?kind=creator")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const mine = list.body.items.find((i: { email: string }) => i.email === `creator-${suffix}@example.com`);
    expect(mine).toBeTruthy();
    expect(mine.status).toBe("new");

    const patched = await request(app)
      .patch(`/admin/applications/${mine.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "contacted", adminNote: "Emailed them the partner pack" });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe("contacted");

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "public_application", entityId: mine.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.action).toBe("public_application.status_changed");
    expect(audit?.stateBefore).toMatchObject({ status: "new" });
    expect(audit?.stateAfter).toMatchObject({ status: "contacted" });
  });
});
