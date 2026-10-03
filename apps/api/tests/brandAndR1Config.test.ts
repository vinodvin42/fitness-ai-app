import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  BRAND_NAME,
  BRAND_AI_NAME,
  BRAND_PREMIUM_NAME,
  BRAND_SUPPORT_EMAIL,
  USER_REFERRAL_CODE_PREFIX,
  classifySafetyOutcome,
  creatorReferralUrl,
  gymInviteUrl,
  isUserReferralCode,
  normalizeReferralCode,
  r1Flags,
} from "@fitness-ai-app/config";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { generateUniqueReferralCode, findUserByReferralCode } from "../src/lib/referralCode";

const app = createApp();

/**
 * Locks in the R1 handoff's §2 brand decision, its §9 QA defects Q1/Q4/
 * Q5/Q12, and its §12 build-to defaults. These are cheap assertions that
 * exist because every one of them was wrong in this repo before R1: a
 * regression here is a rebrand silently coming undone, which is exactly
 * the failure mode the "one BRAND_NAME constant" rule is meant to stop.
 */
describe("Brand constants (handoff §2, QA Q1/Q4/Q5)", () => {
  it("names the product, the AI and the paid tier exactly as the handoff locks them", () => {
    expect(BRAND_NAME).toBe("Fynrox");
    expect(BRAND_AI_NAME).toBe("Fynrox AI");
    expect(BRAND_PREMIUM_NAME).toBe("Fynrox Premium");
  });

  it("uses fynrox.com for email and fynrox.app for links, lowercase (Q4/Q5)", () => {
    expect(BRAND_SUPPORT_EMAIL).toBe("support@fynrox.com");
    expect(gymInviteUrl("HYD-001")).toBe("https://fynrox.app/gym/HYD-001");
    expect(creatorReferralUrl("aashish24")).toBe("https://fynrox.app/r/aashish24");
    // The defect was casing, so assert it directly rather than trusting
    // the constant's spelling above.
    expect(gymInviteUrl("X")).not.toMatch(/Fynrox\.app/);
  });
});

describe("Referral code shape (QA Q12)", () => {
  it("issues user codes with the FX- prefix", async () => {
    const code = await generateUniqueReferralCode();
    expect(code.startsWith(USER_REFERRAL_CODE_PREFIX)).toBe(true);
    expect(isUserReferralCode(code)).toBe(true);
    // A creator code stays plain — the two must not become the same shape.
    expect(isUserReferralCode("AASHISH24")).toBe(false);
  });

  it("normalizes case and whitespace without inventing a prefix", () => {
    expect(normalizeReferralCode("  fx-7k2m9qrs ")).toBe("FX-7K2M9QRS");
    expect(normalizeReferralCode("aashish24")).toBe("AASHISH24");
  });

  describe("lookup tolerates either shape against a real row", () => {
    let prefixedUserId = "";
    let legacyUserId = "";
    const prefixed = `${USER_REFERRAL_CODE_PREFIX}TESTAAAA`;
    const legacy = "TESTBBBB";

    beforeAll(async () => {
      const a = await prisma.user.create({
        data: { email: `q12-prefixed-${Date.now()}@fynrox.test`, passwordHash: "x", fullName: "Q12 Prefixed", referralCode: prefixed },
      });
      const b = await prisma.user.create({
        data: { email: `q12-legacy-${Date.now()}@fynrox.test`, passwordHash: "x", fullName: "Q12 Legacy", referralCode: legacy },
      });
      prefixedUserId = a.id;
      legacyUserId = b.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: [prefixedUserId, legacyUserId] } } });
    });

    it("finds a prefixed code whether or not the caller typed the prefix", async () => {
      expect((await findUserByReferralCode(prefixed))?.id).toBe(prefixedUserId);
      expect((await findUserByReferralCode("testaaaa"))?.id).toBe(prefixedUserId);
    });

    it("still finds a code issued before the prefix existed", async () => {
      expect((await findUserByReferralCode(legacy))?.id).toBe(legacyUserId);
      expect((await findUserByReferralCode(`${USER_REFERRAL_CODE_PREFIX}${legacy}`))?.id).toBe(legacyUserId);
    });

    it("returns null for an unknown code rather than throwing", async () => {
      expect(await findUserByReferralCode("FX-NOSUCHCODE")).toBeNull();
      expect(await findUserByReferralCode("   ")).toBeNull();
    });
  });
});

describe("R1 build-to defaults (handoff §12)", () => {
  it("defaults every locked §2 decision to the spec's answer, not the legacy behaviour", () => {
    // Decision #4: controlled assignment only, no open marketplace.
    expect(r1Flags.PROFESSIONAL_MARKETPLACE_ENABLED).toBe(false);
    // Decision #13: no streaks, badges or achievements in R1.
    expect(r1Flags.GAMIFICATION_ENABLED).toBe(false);
    // One paid tier: Fynrox Premium.
    expect(r1Flags.SINGLE_PREMIUM_TIER).toBe(true);
  });

  it("defaults the open D1-D13 decisions to the handoff's stated build-to values", () => {
    expect(r1Flags.OFFER_MATCHING_MODE).toBe("admin_assigns"); // D1
    expect(r1Flags.PROGRAMS_SOLD_SEPARATELY).toBe(false); // D2
    expect(r1Flags.TRIAL_ENABLED).toBe(false); // D3
    expect(r1Flags.SHOW_GST_INCLUSIVE_LINE).toBe(true); // D3
    expect(r1Flags.REFERRAL_REWARDS_ARE_EXAMPLES).toBe(true); // D7
    expect(r1Flags.SHOW_APP_STORE_BUTTONS).toBe(false); // D10
    expect(r1Flags.OFFER_EXPIRY_HOURS).toBe(48); // D11
    expect(r1Flags.MAX_REMATCH_ATTEMPTS).toBe(3); // D11
    expect(r1Flags.PROFESSIONAL_AI_ENABLED).toBe(false); // D12
    expect(r1Flags.LEGAL_TEXT_APPROVED).toBe(false); // D13
  });
});

describe("D14 safety classification", () => {
  it("routes a heart condition to Pause and anything else to a warning", () => {
    expect(classifySafetyOutcome(["Heart condition"])).toBe("pause");
    expect(classifySafetyOutcome(["arrhythmia"])).toBe("pause");
    expect(classifySafetyOutcome(["Mild asthma"])).toBe("warning");
    expect(classifySafetyOutcome([])).toBe("none");
  });

  it("pauses when any one of several conditions is serious", () => {
    expect(classifySafetyOutcome(["Mild asthma", "previous cardiac event"])).toBe("pause");
  });
});

describe("Brand reaches the wire, not just the constant", () => {
  it("serves the 2FA issuer as the brand name in a real otpauth URL", async () => {
    const email = `brand-2fa-${Date.now()}@fynrox.test`;
    const signup = await request(app)
      .post("/auth/signup")
      .send({ email, password: "Testpass123!", fullName: "Brand Probe" });
    expect(signup.status).toBe(201);

    const setup = await request(app)
      .post("/users/me/2fa/setup")
      .set("Authorization", `Bearer ${signup.body.tokens.accessToken}`)
      .send();
    expect(setup.status).toBe(200);
    expect(setup.body.otpauthUrl).toContain(encodeURIComponent(BRAND_NAME));
    expect(setup.body.otpauthUrl).not.toMatch(/PrimeFit/i);

    await prisma.user.deleteMany({ where: { email } });
  });
});
