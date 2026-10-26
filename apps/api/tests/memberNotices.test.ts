import { afterAll, describe, expect, it } from "vitest";
import { prisma, uniqueEmail, uniqueSuffix } from "./helpers";
import { hashPassword } from "../src/lib/password";
import { generateUniqueReferralCode } from "../src/lib/referralCode";
import { acceptRelationship, declineRelationship } from "../src/modules/coaching/coaching.service";
import { completeRelationship } from "../src/modules/relationshipLifecycle/relationshipLifecycle.service";

/**
 * Coach app audit quick wins (26 Oct 2026): the member gets an inbox row when
 * the coach accepts (with the payment window and a link to the request), when
 * the coach declines, and when the coach completes their coaching.
 */
describe("Member notices for the coach's actions", () => {
  const professionalIds: string[] = [];
  const userIds: string[] = [];

  async function makePair(label: string) {
    const suffix = uniqueSuffix();
    const professional = await prisma.professional.create({
      data: {
        email: `notices-${label}-${suffix}@example.com`,
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Notices ${label} Coach`,
        status: "active",
        lifecycleStatus: "available",
        maxActiveClients: 15,
      },
    });
    professionalIds.push(professional.id);
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(`notices-${label}`),
        passwordHash: await hashPassword("unused-not-logged-in-with"),
        fullName: `Notices ${label} Member`,
        referralCode: await generateUniqueReferralCode(),
      },
    });
    userIds.push(user.id);
    return { professional, user };
  }

  const inbox = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.relationship.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.professional.deleteMany({ where: { id: { in: professionalIds } } });
  });

  it("tells the member the coach accepted, with the payment window and a link to the request", async () => {
    const { professional, user } = await makePair("accept");
    const rel = await prisma.relationship.create({
      data: { userId: user.id, professionalId: professional.id, serviceType: "fitness", status: "requested", requestedAt: new Date() },
    });

    await acceptRelationship(professional.id, rel.id);

    const rows = await inbox(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("coach");
    expect(rows[0].title).toBe("Notices accept Coach accepted your request");
    expect(rows[0].body).toContain("within 48 hours");
    expect(rows[0].deepLink).toBe(`coach-request?relationshipId=${rel.id}`);
  });

  it("tells the member the coach declined", async () => {
    const { professional, user } = await makePair("decline");
    const rel = await prisma.relationship.create({
      data: { userId: user.id, professionalId: professional.id, serviceType: "nutrition", status: "requested", requestedAt: new Date() },
    });

    await declineRelationship(professional.id, rel.id);

    const rows = await inbox(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Your coaching request was declined");
    expect(rows[0].body).toContain("nutrition coaching request");
  });

  it("tells the member their coaching is complete", async () => {
    const { professional, user } = await makePair("complete");
    const rel = await prisma.relationship.create({
      data: { userId: user.id, professionalId: professional.id, serviceType: "fitness", status: "active" },
    });

    await completeRelationship({ professionalId: professional.id }, rel.id, "Programme finished");

    const rows = await inbox(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Your coaching is complete");
  });

  it("sends nothing when the accept is refused", async () => {
    const { professional, user } = await makePair("refused");
    const rel = await prisma.relationship.create({
      data: { userId: user.id, professionalId: professional.id, serviceType: "fitness", status: "active" },
    });

    await expect(acceptRelationship(professional.id, rel.id)).rejects.toMatchObject({ status: 409 });
    expect(await inbox(user.id)).toHaveLength(0);
  });
});
