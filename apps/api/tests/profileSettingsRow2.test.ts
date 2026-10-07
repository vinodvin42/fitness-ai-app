import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { inflateRawSync } from "node:zlib";
import { buildApp, prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { signProfessionalAccessToken } from "../src/lib/professionalJwt";
import { createNotification, evaluateDelivery, isWithinQuietHours } from "../src/modules/notifications/notifications.service";
import { seedHelpArticles } from "../src/lib/seedContent/helpArticles";
import { createZip } from "../src/lib/zip";

/**
 * Profile & Settings row 2: notification delivery policy, per-professional
 * data sharing, real data export (ZIP), help articles and device sessions.
 */
describe("Profile & Settings row 2", () => {
  const app = buildApp();
  let userId: string;
  let token: string;
  let refreshToken: string;
  let otherToken: string;
  let otherUserId: string;
  let professionalId: string;
  let proToken: string;

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  async function signup(label: string) {
    const res = await request(app)
      .post("/auth/signup")
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Test")
      .send({ email: uniqueEmail(label), password: "SomePassword1!", fullName: `Row2 ${label}` });
    return { id: res.body.user.id as string, token: res.body.tokens.accessToken as string, refresh: res.body.tokens.refreshToken as string };
  }

  beforeAll(async () => {
    const a = await signup("row2a");
    userId = a.id;
    token = a.token;
    refreshToken = a.refresh;
    const b = await signup("row2b");
    otherUserId = b.id;
    otherToken = b.token;

    const pro = await prisma.professional.create({
      data: {
        email: `row2-coach-${uniqueSuffix()}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: "Row2 Coach",
        status: "active",
      },
    });
    professionalId = pro.id;
    proToken = signProfessionalAccessToken({ sub: pro.id, email: pro.email }).token;
    await prisma.relationship.create({ data: { userId, professionalId, serviceType: "fitness", status: "active" } });
    await prisma.consent.upsert({
      where: { userId_type: { userId, type: "health_data_processing" } },
      create: { userId, type: "health_data_processing", granted: true },
      update: { granted: true },
    });
  });

  afterAll(async () => {
    await prisma.relationship.deleteMany({ where: { professionalId } });
    await prisma.professional.deleteMany({ where: { id: professionalId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  // ---- notifications ------------------------------------------------------
  describe("notification preferences + delivery policy", () => {
    it("exposes the new fields with defaults and accepts updates", async () => {
      const get = await request(app).get("/users/me/notification-preferences").set(auth());
      expect(get.status).toBe(200);
      expect(get.body).toEqual(expect.objectContaining({ masterEnabled: true, hydrationReminders: true, frequencyCap: null }));

      const patch = await request(app)
        .patch("/users/me/notification-preferences")
        .set(auth())
        .send({ hydrationReminders: false, frequencyCap: 5, quietHoursStart: "22:00", quietHoursEnd: "07:00" });
      expect(patch.status).toBe(200);
      expect(patch.body).toEqual(expect.objectContaining({ hydrationReminders: false, frequencyCap: 5 }));

      const bad = await request(app).patch("/users/me/notification-preferences").set(auth()).send({ frequencyCap: 0 });
      expect(bad.status).toBe(400);
      const clear = await request(app).patch("/users/me/notification-preferences").set(auth()).send({ frequencyCap: null });
      expect(clear.body.frequencyCap).toBeNull();
    });

    it("isWithinQuietHours handles overnight windows", () => {
      const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
      expect(isWithinQuietHours("22:00", "07:00", at(23))).toBe(true);
      expect(isWithinQuietHours("22:00", "07:00", at(6, 59))).toBe(true);
      expect(isWithinQuietHours("22:00", "07:00", at(7))).toBe(false);
      expect(isWithinQuietHours("22:00", "07:00", at(12))).toBe(false);
      expect(isWithinQuietHours("09:00", "17:00", at(10))).toBe(true);
      expect(isWithinQuietHours(null, null, at(10))).toBe(false);
    });

    it("suppresses by master pause, category toggle and daily cap; system is exempt", async () => {
      const c = await signup("row2notif");
      const count = () => prisma.notification.count({ where: { userId: c.id } });
      const make = (kind: "coach" | "billing" | "system" | "workout") =>
        createNotification(c.id, { kind, title: "t", body: "b" });

      // defaults: delivered
      await make("coach");
      expect(await count()).toBe(1);

      // category off
      await prisma.notificationPreference.upsert({ where: { userId: c.id }, create: { userId: c.id, coachMessages: false }, update: { coachMessages: false } });
      await make("coach");
      expect(await count()).toBe(1);
      expect((await evaluateDelivery(c.id, "coach")).reason).toBe("category_off");
      await make("billing");
      expect(await count()).toBe(2);

      // master pause: everything but system
      await prisma.notificationPreference.update({ where: { userId: c.id }, data: { masterEnabled: false } });
      await make("billing");
      expect(await count()).toBe(2);
      await make("system");
      expect(await count()).toBe(3);

      // cap: 3 already created in the last 24h
      await prisma.notificationPreference.update({ where: { userId: c.id }, data: { masterEnabled: true, frequencyCap: 3 } });
      await make("billing");
      expect(await count()).toBe(3);
      expect((await evaluateDelivery(c.id, "billing")).reason).toBe("frequency_cap");
      await prisma.notificationPreference.update({ where: { userId: c.id }, data: { frequencyCap: 4 } });
      await make("billing");
      expect(await count()).toBe(4);

      // quiet hours do not drop inbox rows but are reported
      await prisma.notificationPreference.update({ where: { userId: c.id }, data: { frequencyCap: null, quietHoursStart: "00:00", quietHoursEnd: "23:59" } });
      const d = await evaluateDelivery(c.id, "billing", new Date(2026, 0, 1, 12));
      expect(d).toEqual({ deliver: true, quiet: true });
      await prisma.user.delete({ where: { id: c.id } });
    });
  });

  // ---- sharing ------------------------------------------------------------
  describe("per-professional data sharing", () => {
    it("404s without an active relationship and validates the body", async () => {
      const res = await request(app).get(`/coaching/professionals/${professionalId}/sharing`).set(auth(otherToken));
      expect(res.status).toBe(404);
      const empty = await request(app).patch(`/coaching/professionals/${professionalId}/sharing`).set(auth()).send({});
      expect(empty.status).toBe(400);
    });

    it("defaults: food logs on, steps and sleep off; lists my professionals", async () => {
      const res = await request(app).get(`/coaching/professionals/${professionalId}/sharing`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ professionalId, professionalFullName: "Row2 Coach", steps: false, foodLogs: true, sleepRecovery: false });
      const list = await request(app).get("/coaching/sharing").set(auth());
      expect(list.body.items).toHaveLength(1);
    });

    it("gates the professional client summary by the flags", async () => {
      await prisma.mealLog.create({ data: { userId, mealType: "lunch", name: "Row2 meal", calories: 500 } });
      await prisma.recoveryLog.create({
        data: { userId, date: new Date(), steps: 8123, sleepHours: 7.5, restingHeartRate: 58 },
      });
      const summary = () =>
        request(app).get(`/professionals/me/clients/${userId}/summary`).set("Authorization", `Bearer ${proToken}`);

      let res = await summary();
      expect(res.body.nutrition.recentLogs).toHaveLength(1);
      expect(res.body.recovery).toEqual({ steps: null, sleep: null });

      const patch = await request(app)
        .patch(`/coaching/professionals/${professionalId}/sharing`)
        .set(auth())
        .send({ foodLogs: false, steps: true });
      expect(patch.status).toBe(200);
      expect(patch.body).toEqual(expect.objectContaining({ foodLogs: false, steps: true, sleepRecovery: false }));

      res = await summary();
      expect(res.body.nutrition).toEqual({ shared: false, recentLogs: [] });
      expect(res.body.recovery.steps).toHaveLength(1);
      expect(res.body.recovery.steps[0].steps).toBe(8123);
      expect(res.body.recovery.sleep).toBeNull();

      await request(app).patch(`/coaching/professionals/${professionalId}/sharing`).set(auth()).send({ sleepRecovery: true });
      res = await summary();
      expect(res.body.recovery.sleep[0]).toEqual(expect.objectContaining({ sleepHours: 7.5, restingHeartRate: 58 }));
    });
  });

  // ---- data export --------------------------------------------------------
  describe("data export", () => {
    it("builds a real ZIP, exposes metadata, owner-only download, expiry", async () => {
      const none = await request(app).get("/users/me/exports/latest").set(auth(otherToken));
      expect(none.body).toEqual({ export: null });

      const created = await request(app).post("/users/me/exports").set(auth());
      expect(created.status).toBe(201);
      expect(created.body.status).toBe("ready");
      expect(created.body.groups.map((g: { label: string }) => g.label)).toEqual([
        "Summary (PDF)",
        "Workouts, meals, sleep (CSV)",
        "Decision history & messages (CSV)",
      ]);
      expect(created.body.files.map((f: { name: string }) => f.name)).toEqual(
        expect.arrayContaining(["summary.pdf", "workouts.csv", "meals.csv", "sleep_recovery.csv", "messages.csv"]),
      );
      const days = (new Date(created.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);

      const latest = await request(app).get("/users/me/exports/latest").set(auth());
      expect(latest.body.export.id).toBe(created.body.id);

      const dl = await request(app)
        .get(`/users/me/exports/${created.body.id}/download`)
        .set(auth())
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on("data", (c: Buffer) => chunks.push(c));
          r.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(dl.status).toBe(200);
      expect(dl.headers["content-type"]).toContain("application/zip");
      const zip = dl.body as Buffer;
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
      expect(zip.length).toBe(created.body.zipSize);

      // Walk the central directory and check a CSV round-trips.
      const eocd = zip.length - 22;
      expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
      const entries = zip.readUInt16LE(eocd + 10);
      let p = zip.readUInt32LE(eocd + 16);
      const found: Record<string, string> = {};
      for (let i = 0; i < entries; i++) {
        const method = zip.readUInt16LE(p + 10);
        const csize = zip.readUInt32LE(p + 20);
        const nlen = zip.readUInt16LE(p + 28);
        const off = zip.readUInt32LE(p + 42);
        const name = zip.subarray(p + 46, p + 46 + nlen).toString("utf8");
        const dataStart = off + 30 + zip.readUInt16LE(off + 26) + zip.readUInt16LE(off + 28);
        const raw = zip.subarray(dataStart, dataStart + csize);
        found[name] = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
        p += 46 + nlen;
      }
      expect(found["summary.pdf"].startsWith("%PDF-1.4")).toBe(true);
      expect(found["meals.csv"]).toContain("Row2 meal");
      expect(found["sleep_recovery.csv"]).toContain("8123");

      // Owner only: another user gets 404.
      const other = await request(app).get(`/users/me/exports/${created.body.id}/download`).set(auth(otherToken));
      expect(other.status).toBe(404);

      // Expired -> 410 and bytes dropped.
      await prisma.userDataExport.update({ where: { id: created.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const gone = await request(app).get(`/users/me/exports/${created.body.id}/download`).set(auth());
      expect(gone.status).toBe(410);
      const latest2 = await request(app).get("/users/me/exports/latest").set(auth());
      expect(latest2.body.export.status).toBe("expired");
    });

    it("a new request replaces the previous export bytes and the limit applies", async () => {
      const a = await request(app).post("/users/me/exports").set(auth());
      const b = await request(app).post("/users/me/exports").set(auth());
      expect(b.status).toBe(201);
      const rowA = await prisma.userDataExport.findUnique({ where: { id: a.body.id } });
      expect(rowA?.bytes).toBeNull();
      expect(rowA?.status).toBe("expired");
      for (let i = 0; i < 5; i++) await request(app).post("/users/me/exports").set(auth());
      const limited = await request(app).post("/users/me/exports").set(auth());
      expect(limited.status).toBe(429);
    });

    it("createZip produces a readable single-file archive", () => {
      const zip = createZip([{ name: "a.txt", data: Buffer.from("hello") }]);
      expect(zip.readUInt32LE(0)).toBe(0x04034b50);
      expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    });
  });

  // ---- help ---------------------------------------------------------------
  describe("help articles", () => {
    beforeAll(async () => {
      for (const a of seedHelpArticles) {
        await prisma.helpArticle.upsert({ where: { slug: a.slug }, create: a, update: a });
      }
    });

    it("returns categories with real counts", async () => {
      const res = await request(app).get("/help/categories").set(auth());
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c: { key: string }) => c.key)).toEqual([
        "getting_started", "workouts", "nutrition", "billing", "professionals",
      ]);
      for (const c of res.body.categories) {
        expect(c.articleCount).toBe(seedHelpArticles.filter((a) => a.category === c.key).length);
      }
    });

    it("filters by category, searches title/body and reads one article", async () => {
      const cat = await request(app).get("/help/articles?category=billing").set(auth());
      expect(cat.body.items.length).toBeGreaterThanOrEqual(3);
      expect(cat.body.items.every((i: { category: string }) => i.category === "billing")).toBe(true);

      const search = await request(app).get("/help/articles?search=barcode").set(auth());
      expect(search.body.items.map((i: { slug: string }) => i.slug)).toContain("log-a-meal");

      const one = await request(app).get("/help/articles/cancel-a-subscription").set(auth());
      expect(one.status).toBe(200);
      expect(one.body.body).toContain("does not renew");

      const missing = await request(app).get("/help/articles/nope").set(auth());
      expect(missing.status).toBe(404);
      const unauth = await request(app).get("/help/categories");
      expect(unauth.status).toBe(401);
    });
  });

  // ---- sessions -----------------------------------------------------------
  describe("active sessions", () => {
    it("labels sessions with the device, flags the current one and signs out the others", async () => {
      const login = await request(app)
        .post("/auth/login")
        .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605")
        .send({ email: (await prisma.user.findUnique({ where: { id: userId } }))!.email, password: "SomePassword1!" });
      expect(login.status).toBe(200);

      const list = await request(app).get("/users/me/sessions").set(auth()).set("X-Refresh-Token", refreshToken);
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(2);
      const current = list.body.items.filter((s: { current: boolean }) => s.current);
      expect(current).toHaveLength(1);
      expect(current[0].userAgent).toContain("iPhone");
      expect(list.body.items.some((s: { userAgent: string }) => s.userAgent.includes("Macintosh"))).toBe(true);
      expect(list.body.items[0].tokenHash).toBeUndefined();

      const bad = await request(app).post("/users/me/sessions/revoke-others").set(auth()).send({ refreshToken: "nope" });
      expect(bad.status).toBe(400);

      const revoked = await request(app).post("/users/me/sessions/revoke-others").set(auth()).send({ refreshToken });
      expect(revoked.body).toEqual({ revoked: 1 });
      const after = await request(app).get("/users/me/sessions").set(auth()).set("X-Refresh-Token", refreshToken);
      expect(after.body.items).toHaveLength(1);
      expect(after.body.items[0].current).toBe(true);
    });
  });
});
