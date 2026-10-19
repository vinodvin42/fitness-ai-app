import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Razorpay keys must exist before env.ts is parsed (it runs on import), and
// the SDK is faked: these tests never reach the network.
const sdk = vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_bank_settlements";
  process.env.RAZORPAY_KEY_SECRET = "test-secret-not-real";
  return { all: vi.fn() };
});
vi.mock("razorpay", () => ({
  default: class {
    settlements = { all: sdk.all };
  },
}));

import { buildApp, prisma, uniqueEmail } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { razorpayPaymentProvider } from "../src/providers/razorpayPaymentProvider";
import { mockPaymentProvider } from "../src/providers/mockProviders";

/**
 * 10.09 Bank Settlements (Oct 2026): Razorpay's settlements to the bank,
 * read live and read-only. The fixtures mirror Razorpay's documented
 * GET /v1/settlements response (amounts in paise, created_at in seconds).
 */
describe("Bank settlements (10.09)", () => {
  const app = buildApp();
  const password = "BankSettle9!";
  const adminIds: string[] = [];
  let financeAuth = "";
  let supportAuth = "";

  const item = (id: string, amount: number, status: string, createdAt: string, utr: string | null = `UTR${id}`) => ({
    id,
    entity: "settlement",
    amount,
    status,
    fees: 0,
    tax: 0,
    utr,
    created_at: Math.floor(Date.parse(createdAt) / 1000),
  });

  async function adminLogin(role: string): Promise<string> {
    const email = uniqueEmail(`bank-${role}`);
    const admin = await prisma.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), fullName: `Bank ${role}`, role, status: "active" } as never,
    });
    adminIds.push(admin.id);
    const login = await request(app).post("/admin/auth/login").send({ email, password });
    return `Bearer ${login.body.token}`;
  }

  beforeAll(async () => {
    financeAuth = await adminLogin("finance");
    supportAuth = await adminLogin("support");
  });

  beforeEach(() => {
    sdk.all.mockReset();
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  });

  it("reads Razorpay's settlements, newest first, with totals by state; support can't see it", async () => {
    sdk.all.mockResolvedValue({
      entity: "collection",
      count: 4,
      items: [
        item("setl_old", 50000, "processed", "2026-10-01T06:00:00Z"),
        { ...item("setl_fee", 9973635, "processed", "2026-10-03T06:00:00Z"), fees: 2360, tax: 425 },
        item("setl_way", 120000, "created", "2026-10-04T06:00:00Z", null),
        item("setl_bad", 30000, "failed", "2026-10-02T06:00:00Z"),
      ],
    });

    expect((await request(app).get("/admin/finance/bank-settlements").set("Authorization", supportAuth)).status).toBe(403);

    const res = await request(app).get("/admin/finance/bank-settlements?from=2026-10-01&to=2026-10-04").set("Authorization", financeAuth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "razorpay", connected: true, range: { from: "2026-10-01", to: "2026-10-04" }, truncated: false });
    expect(res.body.settlements.map((s: { id: string }) => s.id)).toEqual(["setl_way", "setl_fee", "setl_bad", "setl_old"]);
    expect(res.body.settlements[1]).toMatchObject({ amountCents: 9973635, feesCents: 2360, taxCents: 425, utr: "UTRsetl_fee", status: "processed" });
    expect(res.body.settlements[0].utr).toBeNull();
    expect(res.body.totals).toEqual({
      processedCents: 9973635 + 50000,
      processedCount: 2,
      pendingCents: 120000,
      pendingCount: 1,
      failedCents: 30000,
      failedCount: 1,
      feesCents: 2360,
      taxCents: 425,
    });
    expect(res.body.notAvailable).toEqual(["bankBalances"]);

    // India calendar days → Unix seconds: 1 Oct 00:00 IST to 4 Oct 23:59:59 IST.
    expect(sdk.all).toHaveBeenCalledWith({
      from: Math.floor(Date.parse("2026-09-30T18:30:00Z") / 1000),
      to: Math.floor(Date.parse("2026-10-04T18:29:59Z") / 1000),
      count: 100,
      skip: 0,
    });
  });

  it("defaults to the last 30 days and flags Razorpay's 100-row maximum", async () => {
    sdk.all.mockResolvedValue({
      entity: "collection",
      count: 100,
      items: Array.from({ length: 100 }, (_, i) => item(`setl_${i}`, 1000, "processed", "2026-10-10T06:00:00Z")),
    });
    const res = await request(app).get("/admin/finance/bank-settlements").set("Authorization", financeAuth);
    expect(res.status).toBe(200);
    expect(res.body.truncated).toBe(true);
    const { from, to } = res.body.range;
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(29);
    expect(to).toBe(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  });

  it("refuses bad dates", async () => {
    expect((await request(app).get("/admin/finance/bank-settlements?from=01-10-2026").set("Authorization", financeAuth)).status).toBe(400);
    expect((await request(app).get("/admin/finance/bank-settlements?from=2026-10-05&to=2026-10-01").set("Authorization", financeAuth)).status).toBe(400);
    expect(sdk.all).not.toHaveBeenCalled();
  });

  it("a Razorpay error becomes a 502 with Razorpay's reason", async () => {
    sdk.all.mockRejectedValue({ statusCode: 401, error: { code: "BAD_REQUEST_ERROR", description: "The api key provided is invalid" } });
    const res = await request(app).get("/admin/finance/bank-settlements").set("Authorization", financeAuth);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("razorpay_unavailable");
    expect(res.body.error.message).toContain("The api key provided is invalid");
  });

  it("without Razorpay keys it says so and calls nothing; test payments have no settlements", async () => {
    const spy = vi.spyOn(razorpayPaymentProvider, "isConfigured").mockReturnValue(false);
    const res = await request(app).get("/admin/finance/bank-settlements").set("Authorization", financeAuth);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "razorpay", connected: false, settlements: [], truncated: false });
    expect(res.body.totals.processedCents).toBe(0);
    expect(sdk.all).not.toHaveBeenCalled();

    expect(await mockPaymentProvider.listSettlements({ from: new Date(0), to: new Date(), count: 100, skip: 0 })).toEqual([]);
  });
});
